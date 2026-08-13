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

function abilityAssets(slug: string, name: string) {
  return {
    cardImage: `/assets/abilities-${slug}.webp`,
    imageAlt: `${name} ability card`
  };
}

/** Conflux "Basic X Magic": permanent school fetch OR expert +3 school power. */
function basicSchoolMagic(school: Exclude<SpellSchool, "any">): CardLibrary[string] {
  const schoolName = school.charAt(0).toUpperCase() + school.slice(1);
  // "an Air"/"an Earth" but "a Fire"/"a Water": pick the article from the
  // school's leading vowel sound, not a single hard-coded special case.
  const article = /^[aeiou]/i.test(school) ? "an" : "a";
  return {
    id: `ability.basic_${school}_magic`,
    name: `Basic ${schoolName} Magic`,
    kind: "ability",
    // A Permanent, like the war machines, income artifacts and advanced School
    // of Magic abilities: option 0 enters play and occupies the single permanent
    // slot, so playing another permanent discards it (and vice versa) — a player
    // can never hold two permanents at once.
    timing: "ongoing",
    abilityClass: "magic",
    permanent: true,
    permanentEffect: { schoolFetch: school },
    tags: [
      "ability",
      "magic-school",
      "permanent",
      `Permanent: Instead of Searching the Spell deck, find the first ${schoolName} Magic spell in it and take it into your hand. Then, reshuffle the deck. Expert: +3 Power for ${article} ${schoolName} Magic spell.`
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          // Enter play as the owner's permanent; the school-fetch runs only
          // while it sits in the slot (permanentEffect.schoolFetch, read by
          // activeSchoolFetches), so replacing it stops the fetch.
          label: `Permanent: fetch ${schoolName} spells instead of searching`,
          effect: { type: "ENTER_PLAY" }
        },
        {
          label: `+3 Power for ${article} ${schoolName} Magic spell`,
          expertOnly: true,
          trigger: { event: "SPELL_CAST_STARTED", controller: "self" },
          effect: { type: "ADD_SPELL_POWER", amount: 3, schoolOnly: school }
        }
      ]
    },
    assets: abilityAssets(`basic_${school}_magic`, `Basic ${schoolName} Magic`),
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
      "Basic: Play this card before taking a Search action, then do Search (3) instead. Expert: Search (5) instead.",
      "Balance pack: both sides read Search (X+2) instead of a flat 3 / 5, and the Expert side widens EVERY Search until the end of your turn instead of only the next one."
    ],
    // Both printings ride the SAME modifier: the classic flat `count`, plus the
    // Balance-Pack `balanceDelta` / `balancePersist`. `searchCountOverrideFor`
    // (ruleset.ts) is the one reader that picks which printing applies, so the
    // pre-Search menu label and the actual reveal can never disagree.
    effect: {
      type: "CREATE_ACTIVE_EFFECT",
      effect: {
        name: "Scouting",
        scope: "player",
        duration: { type: "current-turn" },
        polarity: "positive",
        removable: false,
        modifiers: [{ type: "SEARCH_COUNT_OVERRIDE", count: 3, balanceDelta: 2 }]
      },
      expertEffect: {
        name: "Expert Scouting",
        scope: "player",
        duration: { type: "current-turn" },
        polarity: "positive",
        removable: false,
        modifiers: [{ type: "SEARCH_COUNT_OVERRIDE", count: 5, balanceDelta: 2, balancePersist: true }]
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
    phaseLimit: ["reaction", "combat", "map"],
    abilityClass: "magic",
    tags: [
      "ability",
      "spell-recall",
      "Basic: Play immediately after casting a spell; take the Spell card back into your hand instead of discarding it. Expert: also take back all other cards played together with it.",
      "Balance pack: the reprint is the SAME behaviour in Polish-Spell-Book vocabulary — take the \"Cast a Spell\" card back instead of discarding it and refresh the cast Spell (once per round). Under polish-spell-book that is exactly what this card already does; without the Book the closest reading is the printed one above (the Spell card itself returns), so the reprint changes no engine rule — only the face."
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
  //   • Played as one of your units is attacked → that unit gains +X Defense on
  //     THIS attack only (stack defenseBonus), exactly like Armorer / Lion's Shield.
  //   • Played as an enemy casts a damaging Spell at your unit → the same +X
  //     reduces THAT Spell's damage only (stack interfereSpellReductions).
  // Wiki marks both sides `<instant>` — never combat-long (that was a prior
  // misread; Shield had the same bug and was fixed). engine: INTERFERE_SPELL
  // basic +1 / expert +2. The printed `trigger` is the SPELL_CAST window;
  // legal-actions ALSO cross-offers it to the DEFENDER in the UNIT_ATTACK_DECLARED
  // window (variantMatchesTrigger + isEffectLegalForTrigger).
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
      "Basic: Instant +1 defense — a reaction to an attack on your unit OR to an enemy damaging Spell on your unit (the same +1 also reduces that Spell's damage). Expert: Instant +2 defense."
    ],
    effect: { type: "INTERFERE_SPELL", amount: 1, expertAmount: 2 },
    // Real printed-card scan at /assets/abilities-interference.webp, so noScan
    // stays off (default false) and the baked art is used. Refreshed 2026-08-04
    // from en.homm3bg.wiki (scripts/fetch-spell-art-refresh.py): the old local
    // file was an off-standard 726x1040 narrow crop; the wiki serves the full
    // 743x1040 printed card (COVE 027/058), matching its Empowered twin
    // (NAVAL BATTLES 078/082).
    assets: abilityAssets("interference", "Interference"),
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
    // Diplomacy is a PRINTED always-Empowered card ("use either side without
    // spending a crown" is on the card itself, hence the "empowered" tag above),
    // so its printed face IS the wiki's Empowered scan — not the plain base one.
    assets: {
      cardImage: "/assets/abilities-diplomacy-empowered.webp",
      imageAlt: "Diplomacy ability card"
    },
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
  // Pathfinding (Rampart Ranger Clancy's starting ability).
  // engine: a current-turn HERO_PATHFINDING active effect drives the adventure
  // pathfinding (getHeroMovementCapabilities → canCrossEdge / classifyHeroStep).
  // What each SIDE grants depends on the "pathfinding-expert" house rule, decided
  // at the capabilities read (not the static data), so BOTH options are always
  // offered — a held crown is usable in every mode:
  //   Rule OFF (printed card / legacy default):
  //     Basic  → move THROUGH Neutral-Unit / enemy-Hero fields (Combat only if
  //              the Hero ends there).
  //     Expert → all of Basic PLUS move over yellow borders & blocked fields
  //              (never ending on a blocked one). Spends a crown. NO coastline /
  //              Subterranean crossing.
  //   Rule ON (BINH default):
  //     Basic  → bundles both printed halves (pass-through AND yellow-border /
  //              blocked-field crossing).
  //     Expert → all of Basic PLUS cross the coastline (land↔sea) with no halt
  //              and step directly between the Surface and a Subterranean Tile
  //              with no Gate — which Dimension Door and Fly cannot do. Spends a
  //              crown.
  "ability.pathfinding": {
    id: "ability.pathfinding",
    name: "Pathfinding",
    kind: "ability",
    timing: "instant",
    abilityClass: "adventure",
    tags: [
      "ability",
      "map",
      "Basic (Map): This turn your Hero can move through fields with Neutral Units and enemy Heroes — ending on such a field starts Combat. Expert (spend a crown): also move over yellow borders and blocked fields (never ending on a blocked field). BINH house rule (pathfinding-expert, on by default): the basic side already crosses yellow borders & blocked fields, and the expert side additionally crosses between land and sea with no penalty and steps directly between the Surface and a Subterranean Tile without a Gate (unlike Dimension Door or Fly)."
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          // Capabilities read decides what this grants: rule OFF → only the
          // pass-through; rule ON (BINH) → also crosses yellow borders & blocked
          // fields (both printed halves bundled).
          label: "Basic: this turn move through Neutral & enemy Hero fields (and, with the BINH crossing rule, over yellow borders & blocked fields)",
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
          // Always offered when a crown is available (no house-rule gate). What
          // the expert side adds is decided at the capabilities read: rule OFF →
          // move over yellow borders & blocked fields (the printed Expert power);
          // rule ON (BINH) → additionally cross the coastline and step
          // Surface↔Subterranean without a Gate.
          label:
            "Expert (spend a crown): also move over yellow borders & blocked fields (never ending on one); with the BINH crossing rule, also cross the coastline and step into the Subterranean",
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
      "Basic: Deal 1 damage to an enemy unit with the lowest initiative. Expert: when using the Ballista card, resolve its effect against the same target 3 times.",
      "Balance pack: BOTH sides also carry an ongoing rider — while you have a Ballista in play, you choose its targets for the rest of this combat (the same freedom Gerwulf's Ballista VI grants). Because a Ballista fires at round start, the aim first applies from the next combat round. CONSEQUENCE: the rider is a real lasting effect, so a played Artillery is HELD in the public Permanents & Ongoing tray until the combat ends (the engine-wide \"a live ongoing card is never in the discard pile\" rule) instead of going straight to the discard; with the rule off it discards immediately as before."
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
  // engine (HOUSE RULE buff): both demolition sides are now BASIC (no crown) —
  // destroy 1 Wall or the Gate, OR the Arrow Tower (the Arrow-Tower demolition
  // used to be the expert side). Both run via SIEGE_DEMOLISH (see reducer
  // playAbilityCard → openSiegeDemolishChoice / removeArrowTower;
  // siege-tokens.test.ts / ballistics-ability.test.ts).
  // The new EXPERT side (crown + pay 1 building material) bombards: it deals 1
  // damage to a chosen enemy unit AND, when one is adjacent to it, an enemy the
  // caster picks next to it ("1 damage to 2 adjacent units"), via
  // BALLISTICS_BOMBARD + the ballistics-splash target choice (war-machine
  // damage; spell-damage reduction does not apply). Covered in
  // ballistics-ability.test.ts.
  // NOT implemented: the card's "Empowered" printing ("Destroy 3 Walls and the
  // Gate"). This game models no general empower-an-ability action — the only
  // "empowered" ability (Diplomacy) is a hardcoded tag, not a player choice —
  // so there is no path to reach an Empowered Ballistics, and another option
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
          // House-rule buff ("ballistics-buff"): the Arrow-Tower demolition is a
          // basic side under the buff. With the rule off it reverts to the
          // printed/wiki Expert side (spend a crown) via `expertUnlessHouseRule`.
          label: "Destroy the Arrow Tower",
          expertUnlessHouseRule: "ballistics-buff",
          effect: { type: "SIEGE_DEMOLISH", target: "arrow-tower" }
        },
        {
          // House-rule expert ("ballistics-buff"): spend a crown AND pay 1
          // building material to deal 1 damage to an enemy unit and an enemy
          // adjacent to it. Offered only while the buff is on.
          label: "Pay 1 building material: 1 damage to an enemy unit and an enemy adjacent to it",
          expertOnly: true,
          requiresHouseRule: "ballistics-buff",
          cost: { resources: { buildingMaterials: 1 } },
          target: { type: "enemy-unit" },
          effect: { type: "BALLISTICS_BOMBARD", amount: 1 }
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
