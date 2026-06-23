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
  // Interference shares Armorer's identical "+X defense" base, so it is BOTH a
  // normal defense reaction to a physical attack AND a spell-damage reduction:
  //   • Played as one of your units is attacked → that unit gains +X Defense,
  //     softening the hit exactly like Armorer.
  //   • Played as an enemy casts a damaging Spell at your unit → the same +X
  //     Defense also reduces that Spell's damage.
  // engine: INTERFERE_SPELL grants the attacked/targeted unit a Combat-long
  // effect carrying BOTH a DEFENSE_BONUS (vs attacks) and a SPELL_DAMAGE_REDUCTION
  // (vs spells) — +1 basic / +2 expert. The printed `trigger` is the SPELL_CAST
  // window; legal-actions ALSO cross-offers it to the DEFENDER in the
  // UNIT_ATTACK_DECLARED window (variantMatchesTrigger + isEffectLegalForTrigger),
  // and the reducer applies the same effect to the unit being attacked — so the
  // bonus softens the triggering hit/Spell and every later one on that unit.
  "ability.interference": {
    id: "ability.interference",
    name: "Interference",
    kind: "ability",
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    abilityClass: "magic",
    trigger: {
      event: "SPELL_CAST_STARTED",
      controller: "opponent"
    },
    tags: [
      "ability",
      "magic",
      "defense",
      "Basic: +1 defense — a reaction to an attack on your unit OR to an enemy damaging Spell on your unit, where the same +1 defense also reduces the Spell's damage (lasts the Combat). Expert: +2 defense."
    ],
    effect: { type: "INTERFERE_SPELL", amount: 1, expertAmount: 2 },
    assets: abilityAssets("interference", "Interference", true),
    implementationStatus: "implemented",
    source: abilitySource("interference")
  },
  // engine: Diplomacy's two sides map to the printed card — the basic/regular
  // effect is the Map recruit, the expert effect is the Instant skip. This is an
  // Empowered card: per the Empowered mechanic the holder may use EITHER side
  // without spending an expert use (crown), so the skip is offered free at any
  // hero level (a level-1 hero has 0 crowns yet can still skip). The Map option
  // draws one Neutral Unit card per Dwelling and opens a recruit choice
  // (DIPLOMACY_RECRUIT, resolved in openDiplomacyRecruit). The Instant skip is
  // surfaced automatically as a pop-up when a hero meets Neutral Units whose
  // Field Difficulty equals the hero's level — it claims the field and resolves
  // its effect for no Experience, spending no crown. It is never played from
  // hand, so DIPLOMACY_SKIP_COMBAT is a declarative marker, deliberately absent
  // from the playable-effect gate (see startNeutralEncounter /
  // resolveDiplomacySkipChoice in adventure-reducer.ts).
  "ability.diplomacy": {
    id: "ability.diplomacy",
    name: "Diplomacy",
    kind: "ability",
    timing: "instant",
    abilityClass: "adventure",
    tags: [
      "ability",
      "map",
      "empowered",
      "Regular (basic): for every Dwelling you have, draw 1 corresponding Neutral Unit card; you may Recruit one by paying its cost. Expert: skip Combat with Neutral Units on a field whose Difficulty equals your Hero's level — claim the field and resolve its effect, gaining no Experience. Empowered: use either side without spending a crown."
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Regular: draw 1 Neutral Unit card per Dwelling, then recruit one (pay its cost)",
          mapOnly: true,
          effect: { type: "DIPLOMACY_RECRUIT" }
        },
        {
          label: "Expert: skip a matching-level Neutral fight, claim the field and resolve its effect (no Experience)",
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
  // Pathfinding (Rampart Ranger Clancy's starting ability) — BINH house rule.
  // engine: a current-turn HERO_PATHFINDING active effect drives the adventure
  // pathfinding (getHeroMovementCapabilities → canCrossEdge / classifyHeroStep).
  //   Basic  → move over yellow borders & blocked fields (never ending on a
  //            blocked one) and THROUGH Neutral-Unit / enemy-Hero fields
  //            (Combat only if the Hero ends there).
  //   Expert → all of Basic PLUS cross the coastline (land↔sea) with no halt and
  //            step directly between the Surface and a Subterranean Tile with no
  //            Gate — which Dimension Door and Fly cannot do. Spends a crown.
  "ability.pathfinding": {
    id: "ability.pathfinding",
    name: "Pathfinding",
    kind: "ability",
    timing: "instant",
    abilityClass: "adventure",
    tags: [
      "ability",
      "map",
      "Basic (Map): This turn your Hero can move over yellow borders and blocked fields (never ending on a blocked field), and through fields with Neutral Units and enemy Heroes — ending on such a field starts Combat. Expert (BINH house rule): also cross between land and sea with no penalty and move directly between the Surface and a Subterranean Tile without a Gate (unlike Dimension Door or Fly)."
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Basic: this turn pass over borders/blocked fields and through Neutral & enemy fields",
          mapOnly: true,
          effect: {
            type: "CREATE_ACTIVE_EFFECT",
            effect: {
              name: "Pathfinding",
              scope: "player",
              duration: { type: "current-turn" },
              polarity: "positive",
              removable: false,
              modifiers: [{ type: "HERO_PATHFINDING" }]
            }
          }
        },
        {
          label: "Expert: also cross the coastline and step into the Subterranean this turn (spend a crown)",
          mapOnly: true,
          expertOnly: true,
          effect: {
            type: "CREATE_ACTIVE_EFFECT",
            effect: {
              name: "Pathfinding (Expert)",
              scope: "player",
              duration: { type: "current-turn" },
              polarity: "positive",
              removable: false,
              modifiers: [{ type: "HERO_PATHFINDING", expert: true }]
            }
          }
        }
      ]
    },
    assets: abilityAssets("pathfinding", "Pathfinding"),
    implementationStatus: "implemented",
    source: abilitySource("pathfinding")
  },
  "ability.learning": {
    id: "ability.learning",
    name: "Learning",
    kind: "ability",
    timing: "instant",
    abilityClass: "adventure",
    tags: [
      "ability",
      "level-up",
      "Basic: Play when the Hero is about to level up; advance an additional half level. Expert: advance an additional full level, then Remove this card."
    ],
    // Never played from hand: the engine offers it (a "learning-level-up" pending
    // choice) whenever the Hero crosses a level while this card is in hand. A
    // half level is 1 Experience step (2 steps = 1 level), so basic = +1 and the
    // Expert side = +2 Experience, spends an expert use, and removes the card.
    effect: { type: "ADVANCE_EXPERIENCE", amount: 1, expertAmount: 2 },
    assets: abilityAssets("learning", "Learning"),
    implementationStatus: "implemented",
    source: abilitySource("learning")
  },
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
  // engine: basic = destroy 1 Wall or the Gate; expert (crown) = destroy the
  // Arrow Tower. Both run via SIEGE_DEMOLISH (see reducer playAbilityCard →
  // openSiegeDemolishChoice / removeArrowTower; siege-tokens.test.ts).
  // NOT implemented: the card's "Empowered" printing ("Destroy 3 Walls and the
  // Gate"). This game models no general empower-an-ability action — the only
  // "empowered" ability (Diplomacy) is a hardcoded tag, not a player choice —
  // so there is no path to reach an Empowered Ballistics, and a third option
  // would be unreachable/decorative. Left out deliberately.
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
 * Every distinct Ability the shared deck can hold. The deck itself holds
 * exactly **two copies of each** (see `abilityDeckLegacy` / `abilityDeckBinh`):
 * two different players may each draw their own copy of an ability, but a single
 * hero never keeps two of the same one — the deck search redraws past a card the
 * hero already owns (see `canAcquireSharedDeckCard` in `engine/ruleset.ts`).
 */
export const abilityDeckUnique: string[] = [
  "ability.resistance",
  "ability.archery",
  "ability.offense",
  "ability.armorer",
  "ability.luck",
  "ability.leadership",
  "ability.sorcery",
  "ability.mysticism",
  "ability.estates",
  "ability.wisdom",
  "ability.logistics",
  // Pathfinding (Clancy's starting skill): a map-movement ability whose expert
  // side spends a crown — both tiers are wired (see HERO_PATHFINDING).
  "ability.pathfinding",
  "ability.scholar",
  "ability.learning",
  "ability.first_aid",
  "ability.ballistics",
  "ability.artillery",
  "ability.intelligence",
  "ability.interference",
  "ability.tactics",
  "ability.diplomacy",
  // Eagle Eye / Scouting and the elemental Magic schools.
  "ability.scouting",
  "ability.eagle_eye",
  "ability.basic_air_magic",
  "ability.basic_earth_magic",
  "ability.basic_fire_magic",
  "ability.basic_water_magic",
  // Tower expansion Schools of Magic (permanents): +1 power for their school
  // while in play, expert discard for +3 on one cast.
  "ability.air_magic",
  "ability.earth_magic",
  "ability.fire_magic",
  "ability.water_magic",
  // Necropolis-only (rulebook p.24): a non-Necropolis hero can never draw it —
  // the Ability-deck search redraws past it (see `canAcquireSharedDeckCard`).
  "ability.necromancy"
];

/**
 * Shared Ability deck (legacy): two copies of every implemented Ability, so two
 * players can each hold the same ability while no hero ever owns a duplicate.
 */
export const abilityDeckLegacy: string[] = abilityDeckUnique.flatMap((id) => [id, id]);

/**
 * BINH Ability deck. Same membership as the legacy deck (every implemented
 * Ability is reachable in both), again two copies of each.
 */
export const abilityDeckBinh: string[] = abilityDeckUnique.flatMap((id) => [id, id]);
