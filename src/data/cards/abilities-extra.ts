import type { CardLibrary, SpellSchool } from "@/engine/state";

const wikiCredit =
  "Card text from the fan wiki ability pages; verify against official owned components before full content import.";

function abilitySource(slug: string) {
  return {
    product: "Heroes of Might and Magic III: The Board Game",
    credit: wikiCredit,
    url: `https://en.homm3bg.wiki/abilities/${slug}/`
  };
}

function abilityAssets(slug: string, name: string, noScan = false) {
  return {
    cardImage: noScan
      ? "/assets/player-deck-back.webp"
      : `/assets/abilities-${slug}.webp`,
    imageAlt: `${name} ability card`
  };
}

function notImplementedAbility(slug: string, name: string, text: string): CardLibrary[string] {
  return {
    id: `ability.${slug}`,
    name,
    kind: "ability",
    timing: "instant",
    tags: ["ability", "needs-implementation", text],
    effect: { type: "DRAW_CARDS", amount: 0 },
    assets: abilityAssets(slug, name),
    implementationStatus: "not-implemented",
    source: abilitySource(slug)
  };
}

/** Conflux "Basic X Magic": permanent school fetch OR expert +3 school power. */
function basicSchoolMagic(school: Exclude<SpellSchool, "any">): CardLibrary[string] {
  const schoolName = school.charAt(0).toUpperCase() + school.slice(1);
  return {
    id: `ability.basic_${school}_magic`,
    name: `Basic ${schoolName} Magic`,
    kind: "ability",
    timing: "instant",
    abilityClass: "magic",
    tags: [
      "ability",
      "magic-school",
      `Permanent: Instead of Searching the Spell deck, find the first ${schoolName} Magic spell in it and take it into your hand. Then, reshuffle the deck. Expert: +3 Power for a ${schoolName} Magic spell.`
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: `Permanent: fetch ${schoolName} spells instead of searching`,
          effect: {
            type: "CREATE_ACTIVE_EFFECT",
            effect: {
              name: `Basic ${schoolName} Magic`,
              scope: "player",
              duration: { type: "permanent" },
              polarity: "positive",
              removable: false,
              modifiers: [{ type: "SPELL_SCHOOL_FETCH", school }]
            }
          }
        },
        {
          label: `+3 Power for a ${schoolName} Magic spell`,
          expertOnly: true,
          trigger: { event: "SPELL_CAST_STARTED", controller: "self" },
          effect: { type: "ADD_SPELL_POWER", amount: 3, schoolOnly: school }
        }
      ]
    },
    assets: abilityAssets(`basic_${school}_magic`, `Basic ${schoolName} Magic`, true),
    implementationStatus: "implemented",
    source: abilitySource(`basic_${school}_magic`)
  };
}

export const extraAbilityCards: CardLibrary = {
  "ability.estates": {
    id: "ability.estates",
    name: "Estates",
    kind: "ability",
    timing: "instant",
    abilityClass: "economy",
    tags: ["ability", "instant", "gold", "Basic: Gain 3 gold. Expert: Gain 6 gold. (BINH: 2 / 4 gold.)"],
    effect: {
      type: "GAIN_RESOURCES",
      gain: { gold: 3 },
      expertGain: { gold: 6 }
    },
    assets: abilityAssets("estates", "Estates"),
    implementationStatus: "implemented",
    source: abilitySource("estates")
  },
  "ability.logistics": {
    id: "ability.logistics",
    name: "Logistics",
    kind: "ability",
    timing: "instant",
    abilityClass: "adventure",
    tags: [
      "ability",
      "map",
      "Basic (Ongoing): At the end of your turn, move your Hero's model to an adjacent empty field. Expert: Your Hero gains +1 Movement."
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Ongoing: step to an adjacent empty field at the end of your turn",
          mapOnly: true,
          effect: {
            type: "CREATE_ACTIVE_EFFECT",
            effect: {
              name: "Logistics",
              scope: "player",
              duration: { type: "current-turn" },
              polarity: "positive",
              removable: false,
              modifiers: [{ type: "END_TURN_ADJACENT_MOVE" }]
            }
          }
        },
        {
          label: "Expert: your hero gains +1 movement",
          mapOnly: true,
          expertOnly: true,
          effect: { type: "GAIN_HERO_MOVEMENT", amount: 1 }
        }
      ]
    },
    assets: abilityAssets("logistics", "Logistics"),
    implementationStatus: "implemented",
    source: abilitySource("logistics")
  },
  "ability.scouting": {
    id: "ability.scouting",
    name: "Scouting",
    kind: "ability",
    timing: "instant",
    abilityClass: "adventure",
    tags: [
      "ability",
      "search",
      "Basic: Play this card before taking a Search action, then do Search (3) instead. Expert: Search (5) instead."
    ],
    effect: {
      type: "CREATE_ACTIVE_EFFECT",
      effect: {
        name: "Scouting",
        scope: "player",
        duration: { type: "current-turn" },
        polarity: "positive",
        removable: false,
        modifiers: [{ type: "SEARCH_COUNT_OVERRIDE", count: 3 }]
      },
      expertEffect: {
        name: "Expert Scouting",
        scope: "player",
        duration: { type: "current-turn" },
        polarity: "positive",
        removable: false,
        modifiers: [{ type: "SEARCH_COUNT_OVERRIDE", count: 5 }]
      }
    },
    assets: abilityAssets("scouting", "Scouting"),
    implementationStatus: "implemented",
    source: abilitySource("scouting")
  },
  "ability.mysticism": {
    id: "ability.mysticism",
    name: "Mysticism",
    kind: "ability",
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    abilityClass: "magic",
    tags: [
      "ability",
      "spell-recall",
      "Basic: Play immediately after casting a spell; take the Spell card back into your hand instead of discarding it. Expert: also take back all other cards played together with it."
    ],
    trigger: {
      event: "SPELL_CAST_STARTED",
      controller: "self"
    },
    effect: {
      type: "RECALL_SPELL",
      expertRecallPlayedCards: true
    },
    assets: abilityAssets("mysticism", "Mysticism"),
    implementationStatus: "implemented",
    source: abilitySource("mysticism")
  },
  "ability.eagle_eye": {
    id: "ability.eagle_eye",
    name: "Eagle Eye",
    kind: "ability",
    timing: "instant",
    abilityClass: "magic",
    tags: [
      "ability",
      "spell-deck",
      "Basic: Draw cards from the Spell deck until you find a Basic Spell card. Take it into your hand or discard it; reshuffle the rest. Expert: the same for an Expert Spell card."
    ],
    effect: { type: "EAGLE_EYE_DIG" },
    assets: abilityAssets("eagle_eye", "Eagle Eye"),
    implementationStatus: "implemented",
    source: abilitySource("eagle_eye")
  },
  "ability.armorer": {
    id: "ability.armorer",
    name: "Armorer",
    kind: "ability",
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    abilityClass: "might",
    tags: ["ability", "instant", "defense", "Basic: +1 defense, then draw 1 card. Expert: +2 defense, then draw 1 card."],
    trigger: {
      event: "UNIT_ATTACK_DECLARED",
      controller: "opponent"
    },
    effect: {
      type: "ADD_COMBAT_STAT",
      stat: "defense",
      amount: 1,
      expertAmount: 2,
      drawCards: 1
    },
    assets: abilityAssets("armorer", "Armorer"),
    implementationStatus: "implemented",
    source: abilitySource("armorer")
  },
  "ability.basic_air_magic": basicSchoolMagic("air"),
  "ability.basic_earth_magic": basicSchoolMagic("earth"),
  "ability.basic_fire_magic": basicSchoolMagic("fire"),
  "ability.basic_water_magic": basicSchoolMagic("water"),

  // Intelligence rewrites WHEN spells may be cast. Played during combat, it
  // grants an ongoing freedom for the rest of that combat: the controller may
  // cast a Spell at any time — even off-turn, without one of their own units
  // being active (it lifts the activation-timing gate, not the open-window
  // rule). The expert side additionally ignores the one-Spell-per-combat-round
  // limit for that player (the `ignoreSpellLimit` modifier → spellLimitFor
  // returns Infinity). The freedom is enforced in the spell legal-action gate.
  "ability.intelligence": {
    id: "ability.intelligence",
    name: "Intelligence",
    kind: "ability",
    timing: "instant",
    phaseLimit: ["combat"],
    abilityClass: "magic",
    tags: [
      "ability",
      "magic",
      "spell-timing",
      "Instant (Combat): Until the end of the Combat you may cast a Spell at any time — even off-turn, without one of your units being active (still one Spell per Combat round). Expert: your Spell casts no longer count toward that limit."
    ],
    effect: {
      type: "CREATE_ACTIVE_EFFECT",
      effect: {
        name: "Intelligence",
        scope: "player",
        duration: { type: "combat" },
        polarity: "positive",
        removable: false,
        modifiers: [{ type: "SPELL_CAST_ANYTIME" }]
      },
      expertEffect: {
        name: "Expert Intelligence",
        scope: "player",
        duration: { type: "combat" },
        polarity: "positive",
        removable: false,
        modifiers: [{ type: "SPELL_CAST_ANYTIME", ignoreSpellLimit: true }]
      }
    },
    assets: abilityAssets("intelligence", "Intelligence"),
    implementationStatus: "implemented",
    source: abilitySource("intelligence")
  },
  // engine: Diplomacy has two regular uses (per the fan wiki — neither is the
  // expert side). The Map option draws one Neutral Unit card per Dwelling and
  // opens a recruit choice (DIPLOMACY_RECRUIT, resolved in openDiplomacyRecruit).
  // The Instant skip is surfaced automatically as a pop-up when a hero meets
  // Neutral Units whose Field Difficulty equals the hero's level — it is never
  // played from hand, so DIPLOMACY_SKIP_COMBAT is a declarative marker and is
  // deliberately absent from the playable-effect gate (see startNeutralEncounter
  // / resolveDiplomacySkipChoice in adventure-reducer.ts).
  "ability.diplomacy": {
    id: "ability.diplomacy",
    name: "Diplomacy",
    kind: "ability",
    timing: "instant",
    abilityClass: "adventure",
    tags: [
      "ability",
      "map",
      "Map: for every Dwelling you have, draw 1 corresponding Neutral Unit card; you may Recruit one by paying its cost. Instant: skip Combat with Neutral Units on a field whose Difficulty equals your Hero's level — claim the field, gaining no Experience."
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Map: draw 1 Neutral Unit card per Dwelling, then recruit one (pay its cost)",
          mapOnly: true,
          effect: { type: "DIPLOMACY_RECRUIT" }
        },
        {
          label: "Instant: skip a matching-level Neutral fight, claim the field for no Experience",
          effect: { type: "DIPLOMACY_SKIP_COMBAT" }
        }
      ]
    },
    assets: abilityAssets("diplomacy", "Diplomacy"),
    implementationStatus: "implemented",
    source: abilitySource("diplomacy")
  },
  "ability.necromancy": {
    id: "ability.necromancy",
    name: "Necromancy",
    kind: "ability",
    timing: "instant",
    abilityClass: "adventure",
    tags: [
      "ability",
      "map",
      "necropolis-only",
      "Basic: Play after winning Combat other than Quick Combat. You can Reinforce a bronze or silver unit of your choice for half the gold cost (rounded down). Expert: any unit. Necropolis heroes only — needs no Citadel, Dwelling or Population token."
    ],
    effect: { type: "NECROMANCY_REINFORCE" },
    assets: abilityAssets("necromancy", "Necromancy"),
    implementationStatus: "implemented",
    source: abilitySource("necromancy")
  },
  "ability.pathfinding": notImplementedAbility(
    "pathfinding",
    "Pathfinding",
    "Basic (Map): This turn your Hero can move through fields with Neutral Units and enemy Heroes; ending there starts Combat. Expert: move over yellow borders and blocked fields."
  ),
  "ability.learning": notImplementedAbility(
    "learning",
    "Learning",
    "Basic: Play when the Hero is about to level up; advance an additional half level. Expert: advance an additional full level, then Remove this card."
  ),
  "ability.artillery": {
    id: "ability.artillery",
    name: "Artillery",
    kind: "ability",
    timing: "instant",
    phaseLimit: ["combat"],
    abilityClass: "might",
    // Basic targets the slowest enemy; a tie offers each tied unit so the
    // controller picks which is hit. The expert side carries no target — it is
    // resolved at the Ballista's round start, not played from hand.
    target: { type: "enemy-unit", lowestInitiativeOnly: true },
    tags: [
      "ability",
      "instant",
      "war-machine",
      "wiki-reference",
      "Basic: Deal 1 damage to an enemy unit with the lowest initiative. Expert: when using the Ballista card, resolve its effect against the same target 3 times."
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Deal 1 damage to the enemy unit with the lowest initiative",
          combatOnly: true,
          effect: { type: "DAMAGE_LOWEST_INITIATIVE_ENEMY", amount: 1 }
        },
        {
          // Expert: never played from hand (PLAY_CARD throws). When this player's
          // Ballista fires at the start of a combat round, they may play Artillery
          // — spending one expert use — to resolve that shot against the SAME
          // target 3×. The engine reads `shots` from here; see permanents.ts.
          label: "When your Ballista fires: resolve it against the same target 3×",
          expertOnly: true,
          effect: { type: "ARTILLERY_BALLISTA_VOLLEY", shots: 3 }
        }
      ]
    },
    assets: abilityAssets("artillery", "Artillery"),
    implementationStatus: "implemented",
    source: abilitySource("artillery")
  },
  "ability.ballistics": {
    id: "ability.ballistics",
    name: "Ballistics",
    kind: "ability",
    timing: "instant",
    phaseLimit: ["combat"],
    abilityClass: "might",
    tags: ["ability", "instant", "siege", "wiki-reference"],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Destroy 1 Wall or the Gate",
          effect: { type: "SIEGE_DEMOLISH", target: "wall-or-gate" }
        },
        {
          label: "Destroy the Arrow Tower (expert)",
          expertOnly: true,
          effect: { type: "SIEGE_DEMOLISH", target: "arrow-tower" }
        }
      ]
    },
    assets: {
      cardImage: "/assets/abilities-ballistics.webp",
      imageAlt: "Ballistics ability card"
    },
    implementationStatus: "implemented",
    source: abilitySource("ballistics")
  }
};

/**
 * Shared Ability deck (legacy): the implemented Core + Rampart + Inferno
 * ability cards, two copies of the staples.
 */
export const abilityDeckLegacy: string[] = [
  "ability.resistance",
  "ability.resistance",
  "ability.archery",
  "ability.archery",
  "ability.offense",
  "ability.offense",
  "ability.armorer",
  "ability.armorer",
  "ability.luck",
  "ability.luck",
  "ability.leadership",
  "ability.leadership",
  "ability.sorcery",
  "ability.sorcery",
  "ability.mysticism",
  "ability.mysticism",
  "ability.estates",
  "ability.estates",
  "ability.wisdom",
  "ability.wisdom",
  "ability.logistics",
  "ability.logistics",
  "ability.scholar",
  "ability.first_aid",
  "ability.ballistics",
  "ability.artillery",
  "ability.intelligence",
  // Necropolis-only (rulebook p.24): other factions may keep a drawn copy
  // but can never play it; searches simply pass it over.
  "ability.necromancy",
  "ability.necromancy"
];

/** BINH Ability deck: the legacy set plus the spell-deck key cards. */
export const abilityDeckBinh: string[] = [
  ...abilityDeckLegacy,
  "ability.eagle_eye",
  "ability.scouting",
  "ability.basic_air_magic",
  "ability.basic_earth_magic",
  "ability.basic_fire_magic",
  "ability.basic_water_magic"
];
