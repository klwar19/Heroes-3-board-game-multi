import type { CardLibrary } from "@/engine/state";

const wikiCredit =
  "Card text from the fan wiki ability/hero pages; verify against official owned components before full content import.";

function abilitySource(slug: string) {
  return {
    product: "Heroes of Might and Magic III: The Board Game",
    credit: wikiCredit,
    url: `https://en.homm3bg.wiki/abilities/${slug}/`
  };
}

function heroSource(slug: string) {
  return {
    product: "Heroes of Might and Magic III: The Board Game",
    credit: wikiCredit,
    url: `https://en.homm3bg.wiki/heroes/${slug}/`
  };
}

/**
 * "+1 attack or +1 defense" specialty shared by the might heroes. The bonus
 * doubles when it lands on the hero's signature unit (the unit attacking for
 * the attack option, the unit being attacked for the defense option).
 */
function mightSpecialtyOne(heroSlug: string, heroName: string, doubledUnit: string): CardLibrary[string] {
  return {
    id: `specialty.${heroSlug}.1`,
    name: `${heroName} I`,
    kind: "hero-specialty",
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    tags: ["hero-specialty", "instant", heroSlug],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: `+1 attack (x2 for ${doubledUnit})`,
          trigger: { event: "UNIT_ATTACK_DECLARED", controller: "self" },
          effect: { type: "ADD_COMBAT_STAT", stat: "attack", amount: 1, doubleForUnitName: doubledUnit }
        },
        {
          label: `+1 defense (x2 for ${doubledUnit})`,
          trigger: { event: "UNIT_ATTACK_DECLARED", controller: "opponent" },
          effect: { type: "ADD_COMBAT_STAT", stat: "defense", amount: 1, doubleForUnitName: doubledUnit }
        }
      ]
    },
    assets: {
      cardImage: `/assets/hero_specialties-${heroSlug}-1.webp`,
      imageAlt: `${heroName} level I specialty card`
    },
    implementationStatus: "implemented",
    source: heroSource(heroSlug)
  };
}

function specialtyCardImage(heroSlug: string, level: 1 | 4 | 6): string {
  return `/assets/hero_specialties-${heroSlug}-${level}.webp`;
}

function offenseSpecialtyOne(heroSlug: string): CardLibrary[string] {
  return {
    id: `specialty.${heroSlug}.1`,
    name: "Offense I",
    kind: "hero-specialty",
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    tags: ["hero-specialty", "instant", heroSlug, "offense"],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "+1 attack",
          trigger: { event: "UNIT_ATTACK_DECLARED", controller: "self" },
          effect: { type: "ADD_COMBAT_STAT", stat: "attack", amount: 1 }
        },
        {
          label: "Draw 1 card",
          effect: { type: "DRAW_CARDS", amount: 1 }
        }
      ]
    },
    assets: {
      cardImage: specialtyCardImage(heroSlug, 1),
      imageAlt: "Offense level I specialty card"
    },
    implementationStatus: "implemented",
    source: heroSource(heroSlug)
  };
}

function offenseSpecialtyFour(heroSlug: string): CardLibrary[string] {
  return {
    id: `specialty.${heroSlug}.4`,
    name: "Offense IV",
    kind: "hero-specialty",
    timing: "combat",
    phaseLimit: ["combat"],
    tags: ["hero-specialty", "combat", heroSlug, "offense"],
    target: { type: "friendly-unit" },
    effect: {
      type: "CREATE_ATTACK_BUFF",
      name: "Offense IV",
      amount: 1,
      duration: { type: "combat" },
      polarity: "positive",
      removable: false
    },
    assets: {
      cardImage: specialtyCardImage(heroSlug, 4),
      imageAlt: "Offense level IV specialty card"
    },
    implementationStatus: "implemented",
    source: heroSource(heroSlug)
  };
}

function offenseSpecialtySix(heroSlug: string): CardLibrary[string] {
  return {
    id: `specialty.${heroSlug}.6`,
    name: "Offense VI",
    kind: "hero-specialty",
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    tags: ["hero-specialty", "instant", heroSlug, "offense"],
    trigger: { event: "UNIT_ATTACK_DECLARED", controller: "self" },
    effect: { type: "ADD_COMBAT_STAT", stat: "attack", amount: 3 },
    assets: {
      cardImage: specialtyCardImage(heroSlug, 6),
      imageAlt: "Offense level VI specialty card"
    },
    implementationStatus: "implemented",
    source: heroSource(heroSlug)
  };
}

function slowSpecialty(heroSlug: string, level: 1 | 4 | 6, amount: number): CardLibrary[string] {
  return {
    id: `specialty.${heroSlug}.${level}`,
    name: `Slow ${level === 1 ? "I" : level === 4 ? "IV" : "VI"}`,
    kind: "hero-specialty",
    timing: "combat",
    phaseLimit: ["combat"],
    tags: ["hero-specialty", "combat", heroSlug, "slow"],
    target: { type: "enemy-unit" },
    effect: {
      type: "CREATE_INITIATIVE_BUFF",
      name: "Slow",
      amount: -amount,
      duration: { type: "combat" },
      polarity: "negative",
      removable: true
    },
    assets: {
      cardImage: specialtyCardImage(heroSlug, level),
      imageAlt: `Slow level ${level} specialty card`
    },
    implementationStatus: "implemented",
    source: heroSource(heroSlug)
  };
}

function unitHealthSpecialty(
  heroSlug: string,
  specialtyName: string,
  level: 4 | 6,
  amount: number,
  doubledUnit: string
): CardLibrary[string] {
  return {
    id: `specialty.${heroSlug}.${level}`,
    name: `${specialtyName} ${level === 4 ? "IV" : "VI"}`,
    kind: "hero-specialty",
    timing: "combat",
    phaseLimit: ["combat"],
    tags: ["hero-specialty", "combat", heroSlug, "health"],
    target: { type: "friendly-unit" },
    effect: {
      type: "ADD_UNIT_MAX_HEALTH",
      amount,
      doubleForUnitName: doubledUnit
    },
    assets: {
      cardImage: specialtyCardImage(heroSlug, level),
      imageAlt: `${specialtyName} level ${level} specialty card`
    },
    implementationStatus: "implemented",
    source: heroSource(heroSlug)
  };
}

function unitInitiativeSpecialty(
  heroSlug: string,
  specialtyName: string,
  level: 4 | 6,
  amount: number,
  doubledUnit: string
): CardLibrary[string] {
  return {
    id: `specialty.${heroSlug}.${level}`,
    name: `${specialtyName} ${level === 4 ? "IV" : "VI"}`,
    kind: "hero-specialty",
    timing: "combat",
    phaseLimit: ["combat"],
    tags: ["hero-specialty", "combat", heroSlug, "initiative"],
    target: { type: "friendly-unit" },
    effect: {
      type: "CREATE_INITIATIVE_BUFF",
      name: `${specialtyName} Specialty`,
      amount,
      duration: { type: "combat" },
      polarity: "positive",
      removable: false,
      doubleForUnitName: doubledUnit
    },
    assets: {
      cardImage: specialtyCardImage(heroSlug, level),
      imageAlt: `${specialtyName} level ${level} specialty card`
    },
    implementationStatus: "implemented",
    source: heroSource(heroSlug)
  };
}

function dessaSpecialtyFour(): CardLibrary[string] {
  return {
    id: "specialty.dessa.4",
    name: "Logistics IV",
    kind: "hero-specialty",
    timing: "instant",
    tags: ["hero-specialty", "instant", "dessa", "logistics"],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "+1 movement",
          mapOnly: true,
          effect: { type: "GAIN_HERO_MOVEMENT", amount: 1 }
        },
        {
          label: "+1 initiative to all your units this combat",
          combatOnly: true,
          effect: {
            type: "CREATE_ACTIVE_EFFECT",
            effect: {
              name: "Logistics IV",
              scope: "player",
              duration: { type: "combat" },
              polarity: "positive",
              removable: false,
              modifiers: [{ type: "INITIATIVE_BONUS", amount: 1 }]
            }
          }
        }
      ]
    },
    assets: {
      cardImage: specialtyCardImage("dessa", 4),
      imageAlt: "Logistics level IV specialty card"
    },
    implementationStatus: "implemented",
    source: heroSource("dessa")
  };
}

function dessaSpecialtySix(): CardLibrary[string] {
  return {
    id: "specialty.dessa.6",
    name: "Logistics VI",
    kind: "hero-specialty",
    timing: "instant",
    tags: ["hero-specialty", "instant", "dessa", "logistics"],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "+1 movement and move through blocked fields this turn",
          mapOnly: true,
          effect: { type: "GAIN_HERO_MOVEMENT", amount: 1, moveThroughThisTurn: true }
        },
        {
          label: "Draw 2 cards",
          effect: { type: "DRAW_CARDS", amount: 2 }
        }
      ]
    },
    assets: {
      cardImage: specialtyCardImage("dessa", 6),
      imageAlt: "Logistics level VI specialty card"
    },
    implementationStatus: "implemented",
    source: heroSource("dessa")
  };
}

/**
 * Alamar's Resurrection: a reaction in an attack window that cancels a normal
 * attack which would destroy one of your units (never spells or specialty
 * damage). One option per grade; its Power requirement is paid by discarding
 * that many "power-source" cards (a Power statistic or any Spell). A cost of 0
 * needs no discard.
 */
function resurrectionSpecialty(
  level: 1 | 4 | 6,
  costs: { bronze: number; silver: number; gold: number }
): CardLibrary[string] {
  const grades = ["bronze", "silver", "gold"] as const;
  return {
    id: `specialty.alamar.${level}`,
    name: `Resurrection ${level === 1 ? "I" : level === 4 ? "IV" : "VI"}`,
    kind: "hero-specialty",
    timing: "reaction",
    phaseLimit: ["reaction", "combat"],
    tags: [
      "hero-specialty",
      "reaction",
      "alamar",
      "resurrection",
      `Cancel an enemy attack that would reduce one of your units to 0 HP (attacks only, not spells or specialties). Discard Power (a Power statistic or a Spell): ${costs.bronze} for a bronze unit, ${costs.silver} for silver, ${costs.gold} for gold.`
    ],
    effect: {
      type: "CHOOSE_ONE",
      // No per-option trigger: Resurrection is offered only in its own
      // lethal-save window (when a unit is actually about to die), not as a
      // normal attack-window reaction.
      options: grades.map((grade) => ({
        label:
          costs[grade] > 0
            ? `Save a ${grade} unit (discard ${costs[grade]} Power/Spell)`
            : `Save a ${grade} unit`,
        ...(costs[grade] > 0
          ? { cost: { discardCards: costs[grade], costCardFilter: "power-source" as const } }
          : {}),
        effect: { type: "CANCEL_LETHAL_ATTACK" as const, grade }
      }))
    },
    assets: {
      cardImage: specialtyCardImage("alamar", level),
      imageAlt: `Resurrection level ${level} specialty card`
    },
    implementationStatus: "implemented",
    source: heroSource("alamar")
  };
}

/**
 * Deemer's Meteor Shower I (target + 1 adjacent) and VI (target + 2 adjacent):
 * "Select a unit and N unit(s) adjacent to it. Deal X to all selected units,
 * friend or foe." The three Power tiers (0/2/4 → 1/2/3 damage) are the
 * board-game's standard cost-gated options: deal 1 for free, or pay 2 / 4
 * power-source cards for 2 / 3 — the same idiom as Resurrection/Frenzy. The
 * engine hits the centre unit and that many adjacent units, letting the caster
 * pick which when more are adjacent (AREA_DAMAGE_PICK_ADJACENT).
 */
function meteorShowerSpecialty(level: 1 | 6, adjacentPicks: number): CardLibrary[string] {
  const adjacentText = adjacentPicks === 1 ? "1 unit adjacent to it" : `${adjacentPicks} units adjacent to it`;
  const tier = (amount: 1 | 2 | 3, payPower: 0 | 2 | 4) => ({
    label:
      payPower === 0
        ? `Deal ${amount} damage to the unit and ${adjacentText}`
        : `Deal ${amount} damage (pay ${payPower} Power)`,
    ...(payPower > 0 ? { cost: { discardCards: payPower, costCardFilter: "power-source" as const } } : {}),
    effect: {
      type: "AREA_DAMAGE_PICK_ADJACENT" as const,
      amount,
      includeCenter: true,
      adjacentPicks
    }
  });
  return {
    id: `specialty.deemer.${level}`,
    name: `Meteor Shower ${level === 1 ? "I" : "VI"}`,
    kind: "hero-specialty",
    timing: "combat",
    phaseLimit: ["combat"],
    tags: [
      "hero-specialty",
      "combat",
      "deemer",
      "meteor-shower",
      `Activation: Select a unit and ${adjacentText}. Deal to all selected units (friend or foe): Power 0: 1 damage; Power 2: 2 damage; Power 4: 3 damage.`
    ],
    target: { type: "any-unit" },
    effect: {
      type: "CHOOSE_ONE",
      options: [tier(1, 0), tier(2, 2), tier(3, 4)]
    },
    assets: {
      cardImage: specialtyCardImage("deemer", level),
      imageAlt: `Meteor Shower level ${level === 1 ? "I" : "VI"} specialty card`
    },
    implementationStatus: "implemented",
    source: heroSource("deemer")
  };
}

function towerRoman(level: 1 | 4 | 6): "I" | "IV" | "VI" {
  return level === 1 ? "I" : level === 4 ? "IV" : "VI";
}

/** "+1 HP for this Combat" to a chosen friendly unit, doubled for the signature unit (any level). */
function towerHealthSpecialty(
  heroSlug: string,
  specialtyName: string,
  level: 1 | 4 | 6,
  amount: number,
  doubledUnit: string
): CardLibrary[string] {
  return {
    id: `specialty.${heroSlug}.${level}`,
    name: `${specialtyName} ${towerRoman(level)}`,
    kind: "hero-specialty",
    timing: "combat",
    phaseLimit: ["combat"],
    tags: ["hero-specialty", "combat", heroSlug, "health"],
    target: { type: "friendly-unit" },
    effect: { type: "ADD_UNIT_MAX_HEALTH", amount, doubleForUnitName: doubledUnit },
    assets: {
      cardImage: specialtyCardImage(heroSlug, level),
      imageAlt: `${specialtyName} level ${towerRoman(level)} specialty card`
    },
    implementationStatus: "implemented",
    source: heroSource(heroSlug)
  };
}

/** "+1 attack OR +1 defense", doubled for the signature unit (any level). */
function towerAttackOrDefenseSpecialty(
  heroSlug: string,
  specialtyName: string,
  level: 1 | 4 | 6,
  doubledUnit: string
): CardLibrary[string] {
  return {
    id: `specialty.${heroSlug}.${level}`,
    name: `${specialtyName} ${towerRoman(level)}`,
    kind: "hero-specialty",
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    tags: ["hero-specialty", "instant", heroSlug],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: `+1 attack (x2 for ${doubledUnit})`,
          trigger: { event: "UNIT_ATTACK_DECLARED", controller: "self" },
          effect: { type: "ADD_COMBAT_STAT", stat: "attack", amount: 1, doubleForUnitName: doubledUnit }
        },
        {
          label: `+1 defense (x2 for ${doubledUnit})`,
          trigger: { event: "UNIT_ATTACK_DECLARED", controller: "opponent" },
          effect: { type: "ADD_COMBAT_STAT", stat: "defense", amount: 1, doubleForUnitName: doubledUnit }
        }
      ]
    },
    assets: {
      cardImage: specialtyCardImage(heroSlug, level),
      imageAlt: `${specialtyName} level ${towerRoman(level)} specialty card`
    },
    implementationStatus: "implemented",
    source: heroSource(heroSlug)
  };
}

/** A flat +N attack/defense to a single attack, doubled for the signature unit. */
function towerStatBoostSpecialty(
  heroSlug: string,
  specialtyName: string,
  level: 1 | 4 | 6,
  stat: "attack" | "defense",
  amount: number,
  doubledUnit: string
): CardLibrary[string] {
  return {
    id: `specialty.${heroSlug}.${level}`,
    name: `${specialtyName} ${towerRoman(level)}`,
    kind: "hero-specialty",
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    tags: ["hero-specialty", "instant", heroSlug],
    trigger: { event: "UNIT_ATTACK_DECLARED", controller: stat === "attack" ? "self" : "opponent" },
    effect: { type: "ADD_COMBAT_STAT", stat, amount, doubleForUnitName: doubledUnit },
    assets: {
      cardImage: specialtyCardImage(heroSlug, level),
      imageAlt: `${specialtyName} level ${towerRoman(level)} specialty card`
    },
    implementationStatus: "implemented",
    source: heroSource(heroSlug)
  };
}

/**
 * Armorer specialty (Mephala / the Armorer-defense heroes): a flat +N Defense to
 * a single attack, played as a defense reaction. Unlike a creature specialty it
 * has no signature unit, so the bonus never doubles. I/IV/VI = +2/+3/+4 Defense.
 */
function armorerSpecialty(heroSlug: string, level: 1 | 4 | 6, amount: number): CardLibrary[string] {
  return {
    id: `specialty.${heroSlug}.${level}`,
    name: `Armorer ${towerRoman(level)}`,
    kind: "hero-specialty",
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    tags: [
      "hero-specialty",
      "instant",
      heroSlug,
      "armorer",
      `Your selected unit gains +${amount} defense.`
    ],
    trigger: { event: "UNIT_ATTACK_DECLARED", controller: "opponent" },
    effect: { type: "ADD_COMBAT_STAT", stat: "defense", amount },
    assets: {
      cardImage: specialtyCardImage(heroSlug, level),
      imageAlt: `Armorer level ${towerRoman(level)} specialty card`
    },
    implementationStatus: "implemented",
    source: heroSource(heroSlug)
  };
}

export const adventureCards: CardLibrary = {
  "ability.leadership": {
    id: "ability.leadership",
    name: "Leadership",
    kind: "ability",
    timing: "instant",
    abilityClass: "might",
    tags: ["ability", "instant", "morale", "wiki-reference"],
    effect: {
      type: "GAIN_MORALE",
      amount: 1,
      expertDrawCards: 2
    },
    assets: {
      cardImage: "/assets/abilities-leadership.webp",
      imageAlt: "Leadership ability card"
    },
    implementationStatus: "implemented",
    source: abilitySource("leadership")
  },
  "ability.sorcery": {
    id: "ability.sorcery",
    name: "Sorcery",
    kind: "ability",
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    abilityClass: "magic",
    tags: ["ability", "instant", "spell-power", "wiki-reference"],
    trigger: {
      event: "SPELL_CAST_STARTED",
      controller: "self"
    },
    effect: {
      type: "ADD_SPELL_POWER",
      amount: 1,
      expertAmount: 2,
      drawCards: 1
    },
    assets: {
      cardImage: "/assets/abilities-sorcery.webp",
      imageAlt: "Sorcery ability card"
    },
    implementationStatus: "implemented",
    source: abilitySource("sorcery")
  },
  "ability.wisdom": {
    id: "ability.wisdom",
    name: "Wisdom",
    kind: "ability",
    // Played together with the Spell Book token (SPELL_BOOK_ACTION wisdom
    // option): basic reduces the purchase by 2 gold and upgrades to
    // Search (3); expert upgrades to Search (4) (BINH: also −3 gold).
    timing: "town",
    abilityClass: "magic",
    tags: [
      "ability",
      "town",
      "Basic: The cost of buying spells in this Town is reduced by 2 gold; Search (3) instead of Search (2). Expert: Search (4) instead. (BINH expert: −3 gold.)"
    ],
    effect: { type: "DRAW_CARDS", amount: 0 },
    assets: {
      cardImage: "/assets/abilities-wisdom.webp",
      imageAlt: "Wisdom ability card"
    },
    implementationStatus: "implemented",
    source: abilitySource("wisdom")
  },
  // engine: First Aid is a CHOOSE_ONE mirroring Artillery. The basic side removes
  // 1 damage from one of your units (HEAL_DAMAGE, played from hand in combat). The
  // expert side — "When using the First Aid Tent, resolve its effect against the
  // same target 3 times" — is NEVER played from hand (PLAY_CARD throws). It is
  // offered when the owner activates their First Aid Tent heal
  // (USE_ACTIVE_EFFECT mode:"expert"): that spends one expert use, discards this
  // card, and heals the same target `heals` times this round. Without an active
  // First Aid Tent only the basic side resolves. The engine reads `heals` from
  // the expert option (firstAidVolleyHeals in permanents.ts).
  "ability.first_aid": {
    id: "ability.first_aid",
    name: "First Aid",
    kind: "ability",
    timing: "instant",
    phaseLimit: ["combat"],
    abilityClass: "combat",
    tags: [
      "ability",
      "instant",
      "heal",
      "wiki-reference",
      "Basic: Remove 1 damage from one of your units. Expert: when using the First Aid Tent, resolve its effect against the same target 3 times."
    ],
    target: { type: "friendly-unit", damagedOnly: true },
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Remove 1 damage from one of your units",
          combatOnly: true,
          effect: { type: "HEAL_DAMAGE", amount: 1 }
        },
        {
          // Expert: never played from hand. Offered when this player's First Aid
          // Tent heals — spends one expert use and discards the card — resolving
          // the Tent heal against the SAME target 3× (see permanents.ts).
          label: "When using your First Aid Tent: resolve its heal against the same target 3×",
          expertOnly: true,
          effect: { type: "FIRST_AID_TENT_VOLLEY", heals: 3 }
        }
      ]
    },
    assets: {
      cardImage: "/assets/abilities-first_aid.webp",
      imageAlt: "First Aid ability card"
    },
    implementationStatus: "implemented",
    source: abilitySource("first_aid")
  },
  // engine: Scholar is a CHOOSE_ONE, both sides map-only. Basic: take 1 card
  // from your discard pile into hand (TAKE_FROM_DISCARD, resolved through the
  // discard-pick reward). Expert: "Remove up to 2 Statistic cards from your hand
  // or discard pile, take up to 2 different Empowered Statistic cards on top of
  // your discard pile, then Remove the Scholar." The expert spends one expert
  // use and removes this card (cost.removeSelf). The swap is interactive
  // (SCHOLAR_EMPOWER_PICK / SCHOLAR_EMPOWER_GIVE visit steps in adventure.ts):
  // each removed Statistic is replaced by its OWN-type Empowered version
  // (distinct types only). It does NOT model removing one type to gain a
  // different Empowered type — a conscious simplification of the printed text.
  // Empowered Statistic cards live in src/data/cards/sample.ts.
  "ability.scholar": {
    id: "ability.scholar",
    name: "Scholar",
    kind: "ability",
    timing: "instant",
    abilityClass: "adventure",
    tags: [
      "ability",
      "map",
      "Basic: Choose 1 card from your discard pile and add it to your hand. Expert: Remove up to 2 Statistic cards from your hand or discard pile; take up to 2 different Empowered Statistic cards on top of your discard pile; Remove this card."
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Choose 1 card from your discard pile and add it to your hand",
          mapOnly: true,
          effect: { type: "TAKE_FROM_DISCARD", count: 1 }
        },
        {
          label: "Swap up to 2 Statistic cards for their Empowered versions (on top of your discard); Remove this card",
          mapOnly: true,
          expertOnly: true,
          cost: { removeSelf: true },
          effect: { type: "SCHOLAR_EMPOWER_SWAP", count: 2 }
        }
      ]
    },
    assets: {
      cardImage: "/assets/abilities-scholar.webp",
      imageAlt: "Scholar ability card"
    },
    implementationStatus: "implemented",
    source: abilitySource("scholar")
  },
  // engine: Tactics is NOT played through PLAY_CARD. Holding this card, the
  // engine opens a start-of-combat swap window (regular side) once all units are
  // placed/revealed, and offers a swap on your turn before your active unit
  // moves (expert side). Both run through SWAP_COMBAT_UNITS and discard this
  // card; the expert swap also spends one expert use. The CHOOSE_ONE options
  // below name those two sides; their TACTICS_SWAP effect is a declarative
  // marker (see swapCombatUnits / openTacticsSetupWindows in adventure-reducer).
  "ability.tactics": {
    id: "ability.tactics",
    name: "Tactics",
    kind: "ability",
    timing: "combat",
    phaseLimit: ["combat"],
    abilityClass: "might",
    tags: [
      "ability",
      "combat",
      "Regular: at the start of Combat, switch the position of any 2 of your units. Expert: switch any 2 of your units during Combat, on your turn before your active unit moves."
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Regular: at the start of Combat, switch the position of any 2 of your units",
          combatOnly: true,
          effect: { type: "TACTICS_SWAP" }
        },
        {
          label: "Expert: during Combat (before your active unit moves), switch the position of any 2 of your units",
          combatOnly: true,
          expertOnly: true,
          effect: { type: "TACTICS_SWAP" }
        }
      ]
    },
    assets: {
      cardImage: "/assets/abilities-tactics.webp",
      imageAlt: "Tactics ability card"
    },
    implementationStatus: "implemented",
    source: abilitySource("tactics")
  },

  // ---- Hero specialties --------------------------------------------------
  // Catherine (Knight): the Crusaders specialist. I = +1 attack/defence; IV =
  // +1 HP for the combat; VI = +1 initiative for the combat — all doubled when
  // the bonus lands on a Crusaders unit.
  "specialty.catherine.1": mightSpecialtyOne("catherine", "Crusaders", "Crusaders"),
  "specialty.catherine.4": unitHealthSpecialty("catherine", "Crusaders", 4, 1, "Crusaders"),
  "specialty.catherine.6": unitInitiativeSpecialty("catherine", "Crusaders", 6, 1, "Crusaders"),
  // Tamika (Death Knight): the Dread Knights specialist (same I/IV/VI shape).
  "specialty.tamika.1": mightSpecialtyOne("tamika", "Dread Knights", "Dread Knights"),
  "specialty.tamika.4": unitHealthSpecialty("tamika", "Dread Knights", 4, 1, "Dread Knights"),
  "specialty.tamika.6": unitInitiativeSpecialty("tamika", "Dread Knights", 6, 1, "Dread Knights"),
  // Mutare (Overlord): the Dragons specialist — the bonus doubles for every
  // unit in the Dragons family (Black/Gold/Ghost/…), never Dragon Flies.
  "specialty.mutare.1": mightSpecialtyOne("mutare", "Dragons", "a Dragons unit"),
  "specialty.mutare.4": unitHealthSpecialty("mutare", "Dragons", 4, 1, "a Dragons unit"),
  "specialty.mutare.6": unitInitiativeSpecialty("mutare", "Dragons", 6, 1, "a Dragons unit"),
  "specialty.rion.1": {
    id: "specialty.rion.1",
    name: "Battlefield Medic I",
    kind: "hero-specialty",
    timing: "instant",
    phaseLimit: ["combat"],
    tags: ["hero-specialty", "instant", "rion", "heal", "Remove 1 damage from one of your units, then draw 1 card."],
    target: { type: "friendly-unit", damagedOnly: true },
    effect: {
      type: "HEAL_DAMAGE",
      amount: 1,
      drawCards: 1
    },
    assets: {
      cardImage: "/assets/hero_specialties-rion-1.webp",
      imageAlt: "Battlefield Medic level I specialty card"
    },
    implementationStatus: "implemented",
    source: heroSource("rion")
  },
  // Rion's Battlefield Medic IV: the level-I heal, now able to clear a
  // Paralysis token instead of damage. Choose-one so the player picks which
  // affliction to lift; either way Rion then draws 1.
  "specialty.rion.4": {
    id: "specialty.rion.4",
    name: "Battlefield Medic IV",
    kind: "hero-specialty",
    timing: "instant",
    phaseLimit: ["combat"],
    tags: [
      "hero-specialty",
      "instant",
      "rion",
      "heal",
      "Remove 1 damage or paralysis from one of your units, then draw 1 card."
    ],
    target: { type: "friendly-unit" },
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Remove 1 damage, then draw 1",
          effect: { type: "HEAL_DAMAGE", amount: 1, drawCards: 1 }
        },
        {
          label: "Remove paralysis, then draw 1",
          effect: { type: "HEAL_DAMAGE", amount: 0, removeParalysis: true, drawCards: 1 }
        }
      ]
    },
    assets: {
      cardImage: specialtyCardImage("rion", 4),
      imageAlt: "Battlefield Medic level IV specialty card"
    },
    implementationStatus: "implemented",
    source: heroSource("rion")
  },
  // Rion's Battlefield Medic VI: removes up to 2 damage (or paralysis), then
  // draws 2 and discards 1. The discard is the option's printed cost (the
  // chosen pitch comes from the current hand before the two cards are drawn).
  "specialty.rion.6": {
    id: "specialty.rion.6",
    name: "Battlefield Medic VI",
    kind: "hero-specialty",
    timing: "instant",
    phaseLimit: ["combat"],
    tags: [
      "hero-specialty",
      "instant",
      "rion",
      "heal",
      "Remove up to 2 damage or paralysis from one of your units, then draw 2 cards and discard 1 card from your hand."
    ],
    target: { type: "friendly-unit" },
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Remove up to 2 damage, then draw 2 and discard 1",
          cost: { discardCards: 1 },
          effect: { type: "HEAL_DAMAGE", amount: 2, drawCards: 2 }
        },
        {
          label: "Remove paralysis, then draw 2 and discard 1",
          cost: { discardCards: 1 },
          effect: { type: "HEAL_DAMAGE", amount: 0, removeParalysis: true, drawCards: 2 }
        }
      ]
    },
    assets: {
      cardImage: specialtyCardImage("rion", 6),
      imageAlt: "Battlefield Medic level VI specialty card"
    },
    implementationStatus: "implemented",
    source: heroSource("rion")
  },
  "specialty.sandro.1": {
    id: "specialty.sandro.1",
    name: "Cloak of the Undead King I",
    kind: "hero-specialty",
    timing: "instant",
    tags: [
      "hero-specialty",
      "sandro",
      "transform",
      "Put this card on the Pack of Skeletons Unit card; it replaces the card's statistics until defeated. (BINH: 3 HP.)"
    ],
    // Printed card: place onto a Pack of Skeletons, replacing its statistics
    // with the Horde of Skeletons (A3 D1 HP2 I6; BINH house rule HP3). The
    // card stays on the unit across combats; when its HP runs out it is
    // discarded and the Pack underneath is revealed with the excess damage.
    effect: {
      type: "TRANSFORM_UNIT",
      targetUnitName: "Skeletons",
      targetVariants: ["pack"],
      newName: "Horde of Skeletons",
      attack: 3,
      defense: 1,
      health: 2,
      initiative: 6,
      cardImage: "/assets/hero_specialties-sandro-1.webp"
    },
    assets: {
      cardImage: "/assets/hero_specialties-sandro-1.webp",
      imageAlt: "Cloak of the Undead King level I specialty card"
    },
    implementationStatus: "implemented",
    source: heroSource("sandro")
  },
  "specialty.sandro.4": {
    id: "specialty.sandro.4",
    name: "Cloak of the Undead King IV",
    kind: "hero-specialty",
    timing: "instant",
    tags: [
      "hero-specialty",
      "sandro",
      "transform",
      "Put this card on the Pack of Zombies Unit card; it replaces the card's statistics until defeated. The Pack's printed abilities are inactive while covered."
    ],
    // Pack of Zombies only -> Horde of Zombies (A4 D1 HP3 I5). The Pack's
    // printed abilities are inactive while the Horde is on top (wiki FAQ).
    effect: {
      type: "TRANSFORM_UNIT",
      targetUnitName: "Zombies",
      targetVariants: ["pack"],
      newName: "Horde of Zombies",
      attack: 4,
      defense: 1,
      health: 3,
      initiative: 5,
      cardImage: "/assets/hero_specialties-sandro-4.webp"
    },
    assets: {
      cardImage: "/assets/hero_specialties-sandro-4.webp",
      imageAlt: "Cloak of the Undead King level IV specialty card"
    },
    implementationStatus: "implemented",
    source: heroSource("sandro")
  },
  "specialty.sandro.6": {
    id: "specialty.sandro.6",
    name: "Cloak of the Undead King VI",
    kind: "hero-specialty",
    timing: "instant",
    tags: [
      "hero-specialty",
      "sandro",
      "transform",
      "Put this card on the Skeletons Unit card (Few, Pack or even a Horde); it becomes a Legion of Skeletons. The Legion stays on top — the Skeletons under it may still be reinforced or upgraded — and its statistics apply until defeated. (BINH: 3 HP.)"
    ],
    // Legion of Skeletons (A4 D1 HP2 I6; BINH house rule HP3). Placeable on
    // Few, Pack or even a Horde of Skeletons; always stays on top while the
    // card under it may still be reinforced (Few->Pack) or covered by the
    // level I Horde. Defeat reveals whatever is underneath (wiki FAQ).
    effect: {
      type: "TRANSFORM_UNIT",
      targetUnitName: "Skeletons",
      targetVariants: ["few", "pack"],
      newName: "Legion of Skeletons",
      attack: 4,
      defense: 1,
      health: 2,
      initiative: 6,
      cardImage: "/assets/hero_specialties-sandro-6.webp",
      alwaysOnTop: true
    },
    assets: {
      cardImage: "/assets/hero_specialties-sandro-6.webp",
      imageAlt: "Cloak of the Undead King level VI specialty card"
    },
    implementationStatus: "implemented",
    source: heroSource("sandro")
  },
  // Moandor (Necropolis Death Knight): the Liches specialist. I/IV are the
  // shared might/health specialties doubled for Liches; VI is his signature —
  // make the Liches deal elemental damage, OR a flat +2 attack.
  "specialty.moandor.1": mightSpecialtyOne("moandor", "Liches", "Liches"),
  "specialty.moandor.4": unitHealthSpecialty("moandor", "Liches", 4, 1, "Liches"),
  "specialty.moandor.6": {
    id: "specialty.moandor.6",
    name: "Liches VI",
    kind: "hero-specialty",
    timing: "combat",
    phaseLimit: ["combat"],
    tags: [
      "hero-specialty",
      "combat",
      "moandor",
      "liches",
      "For this Combat, choose one: your Liches unit deals elemental damage. — OR — your selected unit gains +2 attack."
    ],
    target: { type: "friendly-unit" },
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Liches deal elemental damage (this Combat)",
          combatOnly: true,
          effect: {
            type: "GRANT_ELEMENTAL_DAMAGE",
            targetUnitName: "Liches",
            duration: { type: "combat" }
          }
        },
        {
          label: "+2 attack (this Combat)",
          combatOnly: true,
          effect: {
            type: "CREATE_ATTACK_BUFF",
            name: "Liches VI",
            amount: 2,
            duration: { type: "combat" },
            polarity: "positive",
            removable: false
          }
        }
      ]
    },
    assets: {
      cardImage: "/assets/hero_specialties-moandor-6.webp",
      imageAlt: "Liches level VI specialty card"
    },
    implementationStatus: "implemented",
    source: heroSource("moandor")
  },
  // Gelu (Ranger): the Sharpshooters specialist. His +1 attack/defence (I) and
  // +2 initiative (VI) double for BOTH the Elves and Sharpshooters units (wiki).
  "specialty.gelu.1": mightSpecialtyOne("gelu", "Sharpshooters", "Elves and Sharpshooters"),
  // Gelu IV: trade a Pack of Elves for the unique Sharpshooters Neutral card,
  // or just draw a card. The Sharpshooters card leaves the silver Neutral deck
  // and joins your unit deck; only one Sharpshooters may be controlled at once.
  "specialty.gelu.4": {
    id: "specialty.gelu.4",
    name: "Sharpshooters IV",
    kind: "hero-specialty",
    timing: "map",
    tags: [
      "hero-specialty",
      "map",
      "gelu",
      "sharpshooters",
      "If you have a Pack of Elves Unit card, discard it, then search the Neutral Unit silver deck for the Sharpshooters card and add it to your Unit deck (only 1 Sharpshooters at a time). — OR — Draw a card."
    ],
    target: { type: "none" },
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Discard a Pack of Elves → take the Sharpshooters",
          mapOnly: true,
          effect: {
            type: "CONVERT_ARMY_UNIT",
            fromUnitDefId: "rampart.elves",
            fromSide: "pack",
            toUnitDefId: "neutral.sharpshooters",
            toTier: "silver",
            unique: true
          }
        },
        {
          label: "Draw a card",
          effect: { type: "DRAW_CARDS", amount: 1 }
        }
      ]
    },
    assets: {
      cardImage: specialtyCardImage("gelu", 4),
      imageAlt: "Sharpshooters level IV specialty card"
    },
    implementationStatus: "implemented",
    source: heroSource("gelu")
  },
  "specialty.gelu.6": unitInitiativeSpecialty("gelu", "Sharpshooters", 6, 2, "Elves and Sharpshooters"),
  "specialty.gem.1": {
    id: "specialty.gem.1",
    name: "First Aid I",
    kind: "hero-specialty",
    timing: "instant",
    tags: [
      "hero-specialty",
      "instant",
      "gem",
      "first-aid",
      "Take a First Aid Tent from the War Machine supply for free, or draw 1 card if you already have one."
    ],
    target: { type: "none" },
    // One supply copy of the Tent: take it when it is still there, otherwise it
    // is already in play/owned, so draw 1 instead (the printed alternative).
    effect: {
      type: "GAIN_WAR_MACHINE",
      warMachineCardId: "war_machine.first_aid_tent",
      fallbackDrawCards: 1
    },
    assets: {
      cardImage: "/assets/hero_specialties-gem-1.webp",
      imageAlt: "First Aid level I specialty card"
    },
    implementationStatus: "implemented",
    source: heroSource("gem")
  },
  // Gem's First Aid IV: a straight "remove 2 damage from one of your units".
  "specialty.gem.4": {
    id: "specialty.gem.4",
    name: "First Aid IV",
    kind: "hero-specialty",
    timing: "instant",
    phaseLimit: ["combat"],
    tags: ["hero-specialty", "instant", "gem", "heal", "Remove 2 damage from one of your units."],
    target: { type: "friendly-unit", damagedOnly: true },
    effect: { type: "HEAL_DAMAGE", amount: 2 },
    assets: {
      cardImage: specialtyCardImage("gem", 4),
      imageAlt: "First Aid level IV specialty card"
    },
    implementationStatus: "implemented",
    source: heroSource("gem")
  },
  // Gem's First Aid VI: "For this Combat, double your First Aid Tent's effect."
  // Only offered with a Tent in play; doubles its per-round heal for the combat.
  "specialty.gem.6": {
    id: "specialty.gem.6",
    name: "First Aid VI",
    kind: "hero-specialty",
    timing: "combat",
    phaseLimit: ["combat"],
    tags: ["hero-specialty", "combat", "gem", "first-aid", "For this Combat, double your First Aid Tent's effect."],
    target: { type: "none" },
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Double your First Aid Tent's heal this Combat",
          combatOnly: true,
          effect: { type: "DOUBLE_FIRST_AID_TENT" }
        }
      ]
    },
    assets: {
      cardImage: specialtyCardImage("gem", 6),
      imageAlt: "First Aid level VI specialty card"
    },
    implementationStatus: "implemented",
    source: heroSource("gem")
  },
  "specialty.xyron.1": {
    id: "specialty.xyron.1",
    name: "Inferno I",
    kind: "hero-specialty",
    timing: "combat",
    phaseLimit: ["combat"],
    tags: [
      "hero-specialty",
      "combat",
      "xyron",
      "inferno",
      "Discard 2 cards, then select a space: every unit on that space and the spaces adjacent to it (friend or foe) takes 1 damage."
    ],
    // "Select a space" — occupied or empty — so the blast can be centred on a
    // stack of units or on an empty cell to catch a ring of them.
    target: { type: "any-space" },
    // Single printed line, so a one-option "OR" carries the discard-2 price and
    // the area damage; the cost picker pays it and the target picks the centre.
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Discard 2 cards: 1 damage to a space and its neighbours",
          cost: { discardCards: 2 },
          effect: { type: "AREA_DAMAGE_ALL_ADJACENT", amount: 1 }
        }
      ]
    },
    assets: {
      cardImage: "/assets/hero_specialties-xyron-1.webp",
      imageAlt: "Inferno level I specialty card"
    },
    implementationStatus: "implemented",
    source: heroSource("xyron")
  },
  // Xyron's Inferno IV: the level-I blast for a single discard instead of two.
  "specialty.xyron.4": {
    id: "specialty.xyron.4",
    name: "Inferno IV",
    kind: "hero-specialty",
    timing: "combat",
    phaseLimit: ["combat"],
    tags: [
      "hero-specialty",
      "combat",
      "xyron",
      "inferno",
      "Discard 1 card, then select a space: every unit on that space and the spaces adjacent to it (friend or foe) takes 1 damage."
    ],
    target: { type: "any-space" },
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Discard 1 card: 1 damage to a space and its neighbours",
          cost: { discardCards: 1 },
          effect: { type: "AREA_DAMAGE_ALL_ADJACENT", amount: 1 }
        }
      ]
    },
    assets: {
      cardImage: specialtyCardImage("xyron", 4),
      imageAlt: "Inferno level IV specialty card"
    },
    implementationStatus: "implemented",
    source: heroSource("xyron")
  },
  // Xyron's Inferno VI: the same blast at no cost.
  "specialty.xyron.6": {
    id: "specialty.xyron.6",
    name: "Inferno VI",
    kind: "hero-specialty",
    timing: "combat",
    phaseLimit: ["combat"],
    tags: [
      "hero-specialty",
      "combat",
      "xyron",
      "inferno",
      "Select a space: every unit on that space and the spaces adjacent to it (friend or foe) takes 1 damage."
    ],
    target: { type: "any-space" },
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "1 damage to a space and its neighbours",
          effect: { type: "AREA_DAMAGE_ALL_ADJACENT", amount: 1 }
        }
      ]
    },
    assets: {
      cardImage: specialtyCardImage("xyron", 6),
      imageAlt: "Inferno level VI specialty card"
    },
    implementationStatus: "implemented",
    source: heroSource("xyron")
  },
  // Rashka (Demoniac): the Efreet specialist. I = +1 attack/defence (doubled
  // for Efreet); IV/VI grant a Fire Shield — a melee (ground/flying) attacker
  // takes 1 damage after attacking the chosen unit, doubled to 2 on an Efreet
  // at level VI (the Efreet's printed Fire Shield trait).
  "specialty.rashka.1": mightSpecialtyOne("rashka", "Efreet", "Efreet"),
  "specialty.rashka.4": {
    id: "specialty.rashka.4",
    name: "Efreet IV",
    kind: "hero-specialty",
    timing: "combat",
    phaseLimit: ["combat"],
    tags: [
      "hero-specialty",
      "combat",
      "rashka",
      "fire-shield",
      "Until the end of Combat, when your selected unit is attacked by a ground or flying unit, the attacker takes 1 damage."
    ],
    target: { type: "friendly-unit" },
    effect: {
      type: "CREATE_FIRE_SHIELD",
      amount: 1,
      duration: { type: "combat" },
      removable: false
    },
    assets: {
      cardImage: specialtyCardImage("rashka", 4),
      imageAlt: "Efreet level IV specialty card"
    },
    implementationStatus: "implemented",
    source: heroSource("rashka")
  },
  "specialty.rashka.6": {
    id: "specialty.rashka.6",
    name: "Efreet VI",
    kind: "hero-specialty",
    timing: "combat",
    phaseLimit: ["combat"],
    tags: [
      "hero-specialty",
      "combat",
      "rashka",
      "fire-shield",
      "Until the end of Combat, when your selected unit is attacked by a ground or flying unit, the attacker takes 1 damage. This effect doubles for the Efreet unit."
    ],
    target: { type: "friendly-unit" },
    effect: {
      type: "CREATE_FIRE_SHIELD",
      amount: 1,
      duration: { type: "combat" },
      doubleForUnitName: "Efreet",
      removable: false
    },
    assets: {
      cardImage: specialtyCardImage("rashka", 6),
      imageAlt: "Efreet level VI specialty card"
    },
    implementationStatus: "implemented",
    source: heroSource("rashka")
  },
  // Zydar (Inferno Heretic): spell-economy specialties. Level I implemented as
  // a self-spell-cast reaction (draw a card or +1 Power); IV/VI data-only like
  // the other heroes' upper specialties.
  "specialty.zydar.1": {
    id: "specialty.zydar.1",
    name: "Sorcery I",
    kind: "hero-specialty",
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    tags: [
      "hero-specialty",
      "instant",
      "zydar",
      "After casting a Spell: draw 1 card, or instead gain +1 Power on that Spell."
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "After casting a spell, draw 1 card",
          trigger: { event: "SPELL_CAST_STARTED", controller: "self" },
          effect: { type: "DRAW_CARDS", amount: 1 }
        },
        {
          label: "+1 Power",
          trigger: { event: "SPELL_CAST_STARTED", controller: "self" },
          effect: { type: "ADD_SPELL_POWER", amount: 1 }
        }
      ]
    },
    assets: {
      cardImage: specialtyCardImage("zydar", 1),
      imageAlt: "Zydar level I specialty card"
    },
    implementationStatus: "implemented",
    source: heroSource("zydar")
  },
  // Zydar's Sorcery IV: either the next Spell this round does not count
  // toward the one-per-round limit (modeled as +1 to the limit for the round),
  // or +2 Power on a Spell you are casting.
  "specialty.zydar.4": {
    id: "specialty.zydar.4",
    name: "Sorcery IV",
    kind: "hero-specialty",
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    tags: [
      "hero-specialty",
      "instant",
      "zydar",
      "The next Spell you cast does not count toward the limit. — OR — +2 Power."
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Your next Spell this round ignores the spell limit",
          combatOnly: true,
          effect: {
            type: "CREATE_ACTIVE_EFFECT",
            effect: {
              name: "Sorcery IV",
              scope: "player",
              duration: { type: "current-combat-round" },
              polarity: "positive",
              removable: false,
              modifiers: [{ type: "SPELL_LIMIT_BONUS", amount: 1 }]
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
    assets: {
      cardImage: specialtyCardImage("zydar", 4),
      imageAlt: "Zydar level IV specialty card"
    },
    implementationStatus: "implemented",
    source: heroSource("zydar")
  },
  // Zydar's Sorcery VI: an ongoing "draw 1 after each Spell you cast"
  // (until the end of the Combat round), or +2 Power on a Spell you are casting.
  "specialty.zydar.6": {
    id: "specialty.zydar.6",
    name: "Sorcery VI",
    kind: "hero-specialty",
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    tags: [
      "hero-specialty",
      "instant",
      "zydar",
      "Until the end of the Combat round, after casting a Spell, draw 1 card. — OR — +2 Power."
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Until end of round: draw 1 after each Spell you cast",
          combatOnly: true,
          effect: {
            type: "CREATE_ACTIVE_EFFECT",
            effect: {
              name: "Sorcery VI",
              scope: "player",
              duration: { type: "current-combat-round" },
              polarity: "positive",
              removable: false,
              modifiers: [{ type: "DRAW_ON_SPELL_CAST", amount: 1 }]
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
    assets: {
      cardImage: specialtyCardImage("zydar", 6),
      imageAlt: "Zydar level VI specialty card"
    },
    implementationStatus: "implemented",
    source: heroSource("zydar")
  },
  "specialty.crag_hack.1": offenseSpecialtyOne("crag_hack"),
  "specialty.crag_hack.4": offenseSpecialtyFour("crag_hack"),
  "specialty.crag_hack.6": offenseSpecialtySix("crag_hack"),
  "specialty.dessa.1": {
    id: "specialty.dessa.1",
    name: "Logistics I",
    kind: "hero-specialty",
    timing: "instant",
    tags: ["hero-specialty", "instant", "dessa", "logistics"],
    // Played during the continue-or-retreat decision against neutral units:
    // the combat extends one round without spending a movement point.
    effect: { type: "CONTINUE_NEUTRAL_FREE" },
    assets: {
      cardImage: specialtyCardImage("dessa", 1),
      imageAlt: "Logistics level I specialty card"
    },
    implementationStatus: "implemented",
    source: heroSource("dessa")
  },
  "specialty.dessa.4": dessaSpecialtyFour(),
  "specialty.dessa.6": dessaSpecialtySix(),
  "specialty.gundula.1": slowSpecialty("gundula", 1, 1),
  "specialty.gundula.4": slowSpecialty("gundula", 4, 2),
  "specialty.gundula.6": slowSpecialty("gundula", 6, 3),
  "specialty.shiva.1": mightSpecialtyOne("shiva", "Thunderbirds", "Thunderbirds"),
  "specialty.shiva.4": unitHealthSpecialty("shiva", "Thunderbirds", 4, 1, "Thunderbirds"),
  "specialty.shiva.6": unitInitiativeSpecialty("shiva", "Thunderbirds", 6, 2, "Thunderbirds"),
  "specialty.tarnum_stronghold.1": offenseSpecialtyOne("tarnum_stronghold"),
  "specialty.tarnum_stronghold.4": offenseSpecialtyFour("tarnum_stronghold"),
  "specialty.tarnum_stronghold.6": offenseSpecialtySix("tarnum_stronghold"),
  "specialty.yog.1": mightSpecialtyOne("yog", "Cyclopes", "Cyclopes"),
  "specialty.yog.4": unitInitiativeSpecialty("yog", "Cyclopes", 4, 1, "Cyclopes"),
  "specialty.yog.6": unitHealthSpecialty("yog", "Cyclopes", 6, 1, "Cyclopes"),
  "specialty.alamar.1": resurrectionSpecialty(1, { bronze: 1, silver: 2, gold: 4 }),
  "specialty.alamar.4": resurrectionSpecialty(4, { bronze: 0, silver: 1, gold: 3 }),
  "specialty.alamar.6": resurrectionSpecialty(6, { bronze: 0, silver: 0, gold: 2 }),
  // Deemer (Dungeon Warlock): the Meteor Shower specialist. I hits a unit and 1
  // neighbour; VI a unit and 2 neighbours (the caster picks which when more are
  // adjacent); IV cycles the deck or feeds +1 Power to a spell.
  "specialty.deemer.1": meteorShowerSpecialty(1, 1),
  "specialty.deemer.4": {
    id: "specialty.deemer.4",
    name: "Meteor Shower IV",
    kind: "hero-specialty",
    // Instant: the deck-cycle is played on your turn (map or combat); the "+1
    // Power" side is a reaction to your own spell cast, like Rib Cage.
    timing: "instant",
    tags: [
      "hero-specialty",
      "instant",
      "deemer",
      "meteor-shower",
      "Instant: Shuffle your discard pile back into your deck, then draw 1 card. — OR — Instant: +1 Power."
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Shuffle your discard pile into your deck, then draw 1 card",
          effect: { type: "RESHUFFLE_DISCARD_THEN_DRAW", drawCards: 1 }
        },
        {
          label: "+1 Power",
          trigger: { event: "SPELL_CAST_STARTED", controller: "self" },
          effect: { type: "ADD_SPELL_POWER", amount: 1 }
        }
      ]
    },
    assets: {
      cardImage: specialtyCardImage("deemer", 4),
      imageAlt: "Meteor Shower level IV specialty card"
    },
    implementationStatus: "implemented",
    source: heroSource("deemer")
  },
  "specialty.deemer.6": meteorShowerSpecialty(6, 2),
  // Fortress (Beastmasters): unit specialists, like Catherine/Shiva. Bron =
  // Basilisks; Wystan = Lizardmen. I = +1 attack/defence; IV = +1 HP for the
  // combat; VI = +2 initiative for the combat — all doubled on the signature unit.
  "specialty.bron.1": mightSpecialtyOne("bron", "Basilisks", "Basilisks"),
  "specialty.bron.4": unitHealthSpecialty("bron", "Basilisks", 4, 1, "Basilisks"),
  "specialty.bron.6": unitInitiativeSpecialty("bron", "Basilisks", 6, 2, "Basilisks"),
  "specialty.wystan.1": mightSpecialtyOne("wystan", "Lizardmen", "Lizardmen"),
  "specialty.wystan.4": unitHealthSpecialty("wystan", "Lizardmen", 4, 1, "Lizardmen"),
  "specialty.wystan.6": unitInitiativeSpecialty("wystan", "Lizardmen", 6, 2, "Lizardmen"),

  // ---- Tower heroes ------------------------------------------------------
  // Iona (Alchemist): the Genies specialist. I = +1 HP for the combat; IV =
  // +1 attack/defence; VI = +2 defence — all doubled for a Genies unit.
  "specialty.iona.1": towerHealthSpecialty("iona", "Genies", 1, 1, "Genies"),
  "specialty.iona.4": towerAttackOrDefenseSpecialty("iona", "Genies", 4, "Genies"),
  "specialty.iona.6": towerStatBoostSpecialty("iona", "Genies", 6, "defense", 2, "Genies"),
  // Josephine (Alchemist): the Golems specialist. I = +1 HP; IV = +1 A/D;
  // VI = +2 attack — all doubled for any Golems unit (Iron/Diamond/Gold).
  "specialty.josephine.1": towerHealthSpecialty("josephine", "Golems", 1, 1, "a Golems unit"),
  "specialty.josephine.4": towerAttackOrDefenseSpecialty("josephine", "Golems", 4, "a Golems unit"),
  "specialty.josephine.6": towerStatBoostSpecialty("josephine", "Golems", 6, "attack", 2, "a Golems unit"),
  // Dracon (Wizard): the Enchanters specialist. I = +1 A/D doubled for Magi
  // and Enchanters; IV = trade a Pack of Magi for the unique Enchanters card
  // (or draw); VI = +2 initiative for the combat, doubled for Magi/Enchanters.
  "specialty.dracon.1": mightSpecialtyOne("dracon", "Enchanters", "Magi and Enchanters"),
  "specialty.dracon.4": {
    id: "specialty.dracon.4",
    name: "Enchanters IV",
    kind: "hero-specialty",
    timing: "map",
    tags: [
      "hero-specialty",
      "map",
      "dracon",
      "enchanters",
      "If you have a Pack of Magi Unit card, discard it, then search the Neutral Unit golden deck for the Enchanters card and add it to your Unit deck (only 1 Enchanters at a time). — OR — Draw a card."
    ],
    target: { type: "none" },
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Discard a Pack of Magi → take the Enchanters",
          mapOnly: true,
          effect: {
            type: "CONVERT_ARMY_UNIT",
            fromUnitDefId: "tower.magi",
            fromSide: "pack",
            toUnitDefId: "neutral.enchanters",
            toTier: "gold",
            unique: true
          }
        },
        {
          label: "Draw a card",
          effect: { type: "DRAW_CARDS", amount: 1 }
        }
      ]
    },
    assets: {
      cardImage: specialtyCardImage("dracon", 4),
      imageAlt: "Enchanters level IV specialty card"
    },
    implementationStatus: "implemented",
    source: heroSource("dracon")
  },
  "specialty.dracon.6": unitInitiativeSpecialty("dracon", "Enchanters", 6, 2, "Magi and Enchanters"),
  // Cyra (Wizard): the Haste specialist. I = +3 initiative for the combat;
  // IV/VI add the initiative-comparison conditionals (faster foe doubles the
  // attack bonus; slower foe meets +1 defense).
  "specialty.cyra.1": {
    id: "specialty.cyra.1",
    name: "Haste I",
    kind: "hero-specialty",
    timing: "combat",
    phaseLimit: ["combat"],
    tags: [
      "hero-specialty",
      "combat",
      "cyra",
      "haste",
      "For this Combat, your selected unit's Initiative is increased by 3."
    ],
    target: { type: "friendly-unit" },
    effect: {
      type: "CREATE_INITIATIVE_BUFF",
      name: "Haste",
      amount: 3,
      duration: { type: "combat" },
      polarity: "positive",
      removable: false
    },
    implementationStatus: "implemented",
    source: heroSource("cyra")
  },
  // IV: +1 attack on your unit's attack, doubled when the attacked unit is
  // faster (a strictly higher Initiative) — played as an attack reaction.
  "specialty.cyra.4": {
    id: "specialty.cyra.4",
    name: "Haste IV",
    kind: "hero-specialty",
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    tags: [
      "hero-specialty",
      "instant",
      "cyra",
      "haste",
      "Your selected unit gains +1 attack. The effect doubles if the attacked unit has higher initiative."
    ],
    trigger: { event: "UNIT_ATTACK_DECLARED", controller: "self" },
    effect: { type: "ADD_COMBAT_STAT", stat: "attack", amount: 1, doubleIfDefenderInitiativeHigher: true },
    implementationStatus: "implemented",
    source: heroSource("cyra")
  },
  // VI: +3 initiative this combat plus +1 defense against slower attackers.
  "specialty.cyra.6": {
    id: "specialty.cyra.6",
    name: "Haste VI",
    kind: "hero-specialty",
    timing: "combat",
    phaseLimit: ["combat"],
    tags: [
      "hero-specialty",
      "combat",
      "cyra",
      "haste",
      "For this Combat, your selected unit's initiative is increased by 3. This unit gains +1 defense against attacks made by units with lower initiative."
    ],
    target: { type: "friendly-unit" },
    effect: {
      type: "CREATE_ACTIVE_EFFECT",
      effect: {
        name: "Haste",
        scope: "unit",
        duration: { type: "combat" },
        polarity: "positive",
        removable: false,
        modifiers: [
          { type: "INITIATIVE_BONUS", amount: 3 },
          { type: "DEFENSE_VS_LOWER_INITIATIVE", amount: 1 }
        ]
      }
    },
    implementationStatus: "implemented",
    source: heroSource("cyra")
  },
  // Solmyr (Wizard): the Chain Lightning specialist. I/VI fork lightning into
  // the units closest to the selected one; IV digs his own deck for a card.
  "specialty.solmyr.1": {
    id: "specialty.solmyr.1",
    name: "Chain Lightning I",
    kind: "hero-specialty",
    timing: "combat",
    phaseLimit: ["combat"],
    tags: [
      "hero-specialty",
      "combat",
      "solmyr",
      "Select a unit and the 2 units closest to it. Allocate 1/1/0 damage, starting with the first selected unit."
    ],
    target: { type: "any-unit" },
    effect: { type: "CHAIN_LIGHTNING", damages: [1, 1, 0] },
    assets: {
      cardImage: specialtyCardImage("solmyr", 1),
      imageAlt: "Chain Lightning level I specialty card"
    },
    implementationStatus: "implemented",
    source: heroSource("solmyr")
  },
  "specialty.solmyr.4": {
    id: "specialty.solmyr.4",
    name: "Chain Lightning IV",
    kind: "hero-specialty",
    timing: "combat",
    phaseLimit: ["combat"],
    tags: [
      "hero-specialty",
      "combat",
      "solmyr",
      "Discard up to 3 cards from your Might and Magic deck and return 1 of them to your hand."
    ],
    target: { type: "none" },
    effect: { type: "DECK_DIG_KEEP_ONE", count: 3 },
    assets: {
      cardImage: specialtyCardImage("solmyr", 4),
      imageAlt: "Chain Lightning level IV specialty card"
    },
    implementationStatus: "implemented",
    source: heroSource("solmyr")
  },
  "specialty.solmyr.6": {
    id: "specialty.solmyr.6",
    name: "Chain Lightning VI",
    kind: "hero-specialty",
    timing: "combat",
    phaseLimit: ["combat"],
    tags: [
      "hero-specialty",
      "combat",
      "solmyr",
      "Select a unit and the 2 units closest to it. Allocate 2/1/1 damage, starting with the first selected unit."
    ],
    target: { type: "any-unit" },
    effect: { type: "CHAIN_LIGHTNING", damages: [2, 1, 1] },
    assets: {
      cardImage: specialtyCardImage("solmyr", 6),
      imageAlt: "Chain Lightning level VI specialty card"
    },
    implementationStatus: "implemented",
    source: heroSource("solmyr")
  },
  // Torosar (Wizard, might): the Ballista specialist. I gains a Ballista for
  // gold (map) or fires one now (combat); IV/VI field extra Ballistas — each
  // "counts as a Ballista" — and VI fires all of them at once.
  "specialty.torosar.1": {
    id: "specialty.torosar.1",
    name: "Ballista I",
    kind: "hero-specialty",
    timing: "instant",
    tags: [
      "hero-specialty",
      "instant",
      "torosar",
      "ballista",
      "Pay 5 gold to gain a Ballista. — OR — Activate your Ballista (if you have one)."
    ],
    target: { type: "none" },
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Pay 5 gold to gain a Ballista",
          mapOnly: true,
          effect: { type: "GAIN_WAR_MACHINE", warMachineCardId: "war_machine.ballista", goldCost: 5 }
        },
        {
          label: "Activate your Ballista",
          combatOnly: true,
          effect: { type: "BALLISTA_SPECIALTY", activate: "one" }
        }
      ]
    },
    implementationStatus: "implemented",
    source: heroSource("torosar")
  },
  "specialty.torosar.4": {
    id: "specialty.torosar.4",
    name: "Ballista IV",
    kind: "hero-specialty",
    timing: "combat",
    phaseLimit: ["combat"],
    tags: [
      "hero-specialty",
      "combat",
      "torosar",
      "ballista",
      "Until the end of the round, gain an additional Ballista during Combat. When played, this card counts as a Ballista."
    ],
    target: { type: "none" },
    effect: { type: "BALLISTA_SPECIALTY", grant: "game-round" },
    implementationStatus: "implemented",
    source: heroSource("torosar")
  },
  "specialty.torosar.6": {
    id: "specialty.torosar.6",
    name: "Ballista VI",
    kind: "hero-specialty",
    timing: "combat",
    phaseLimit: ["combat"],
    tags: [
      "hero-specialty",
      "combat",
      "torosar",
      "ballista",
      "For this Combat, gain an additional Ballista. You can activate all your Ballistas now. When played, this card counts as a Ballista."
    ],
    target: { type: "none" },
    effect: { type: "BALLISTA_SPECIALTY", grant: "combat", activate: "all" },
    implementationStatus: "implemented",
    source: heroSource("torosar")
  },

  // ---- Additional heroes (fan-wiki "Regular Stretch Goals 2024") ---------
  // Fiona (Inferno, Demoniac): the Cerberi specialist — the standard might
  // shape, each bonus doubled when it lands on a Cerberi unit. I = +1 A/D;
  // IV = +1 HP for the combat; VI = +2 attack on a single attack.
  "specialty.fiona.1": mightSpecialtyOne("fiona", "Cerberi", "Cerberi"),
  "specialty.fiona.4": unitHealthSpecialty("fiona", "Cerberi", 4, 1, "Cerberi"),
  "specialty.fiona.6": towerStatBoostSpecialty("fiona", "Cerberi", 6, "attack", 2, "Cerberi"),
  // Lorelei is the Dungeon Harpies analogue of Fiona — not shipped yet (no wiki
  // board art); see the deferred list in docs/content-tracker.md.

  // Mephala (Rampart, Ranger): the Armorer specialist — a flat defense reaction
  // with no signature unit. I/IV/VI = +2/+3/+4 Defense to a single attack.
  "specialty.mephala.1": armorerSpecialty("mephala", 1, 2),
  "specialty.mephala.4": armorerSpecialty("mephala", 4, 3),
  "specialty.mephala.6": armorerSpecialty("mephala", 6, 4),

  // Clancy (Rampart, Ranger): the Unicorns specialist. I = +1 A/D; IV = +1
  // initiative for the combat; VI = a Spell Ward (reduce the damage the chosen
  // unit takes from Spells by 1, min 0) — each effect doubled on a Unicorns unit.
  "specialty.clancy.1": mightSpecialtyOne("clancy", "Unicorns", "Unicorns"),
  "specialty.clancy.4": unitInitiativeSpecialty("clancy", "Unicorns", 4, 1, "Unicorns"),
  "specialty.clancy.6": {
    id: "specialty.clancy.6",
    name: "Unicorns VI",
    kind: "hero-specialty",
    timing: "combat",
    phaseLimit: ["combat"],
    tags: [
      "hero-specialty",
      "combat",
      "clancy",
      "unicorns",
      "For this Combat, your selected unit reduces any damage it takes from Spells by 1 (to a minimum of 0). This effect doubles for the Unicorns unit."
    ],
    target: { type: "friendly-unit" },
    effect: {
      type: "CREATE_SPELL_WARD",
      amount: 1,
      duration: { type: "combat" },
      doubleForUnitName: "Unicorns",
      removable: false
    },
    assets: {
      cardImage: specialtyCardImage("clancy", 6),
      imageAlt: "Unicorns level VI specialty card"
    },
    implementationStatus: "implemented",
    source: heroSource("clancy")
  },

  // Adelaide (Castle, Cleric): the Frost Ring specialist. I/VI: discard 1/2
  // cards, target a space, and every unit ADJACENT to it (not the centre,
  // friend or foe) takes 1/2 damage — the Frost-Ring AREA_DAMAGE_PICK_ADJACENT
  // machinery (includeCenter: false). IV: a map play that returns 1 Spell or
  // Specialty card from your discard pile to your hand.
  "specialty.adelaide.1": {
    id: "specialty.adelaide.1",
    name: "Frost Ring I",
    kind: "hero-specialty",
    timing: "combat",
    phaseLimit: ["combat"],
    tags: [
      "hero-specialty",
      "combat",
      "adelaide",
      "frost-ring",
      "Discard 1 card, then target a space on the Combat board: every unit adjacent to that space (not the space itself, friend or foe) takes 1 damage."
    ],
    target: { type: "any-space" },
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Discard 1 card: 1 damage to every unit adjacent to a space",
          cost: { discardCards: 1 },
          effect: {
            type: "AREA_DAMAGE_PICK_ADJACENT",
            amount: 1,
            includeCenter: false,
            adjacentPicks: 4
          }
        }
      ]
    },
    assets: {
      cardImage: specialtyCardImage("adelaide", 1),
      imageAlt: "Frost Ring level I specialty card"
    },
    implementationStatus: "implemented",
    source: heroSource("adelaide")
  },
  "specialty.adelaide.4": {
    id: "specialty.adelaide.4",
    name: "Frost Ring IV",
    kind: "hero-specialty",
    timing: "instant",
    tags: [
      "hero-specialty",
      "adelaide",
      "frost-ring",
      "Select 1 Spell or Specialty card from your discard pile and put it back in your hand."
    ],
    target: { type: "none" },
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Take a Spell or Specialty card from your discard pile",
          mapOnly: true,
          effect: { type: "TAKE_FROM_DISCARD", count: 1, filter: "spell-or-specialty" }
        }
      ]
    },
    assets: {
      cardImage: specialtyCardImage("adelaide", 4),
      imageAlt: "Frost Ring level IV specialty card"
    },
    implementationStatus: "implemented",
    source: heroSource("adelaide")
  },
  "specialty.adelaide.6": {
    id: "specialty.adelaide.6",
    name: "Frost Ring VI",
    kind: "hero-specialty",
    timing: "combat",
    phaseLimit: ["combat"],
    tags: [
      "hero-specialty",
      "combat",
      "adelaide",
      "frost-ring",
      "Discard 2 cards, then target a space on the Combat board: every unit adjacent to that space (not the space itself, friend or foe) takes 2 damage."
    ],
    target: { type: "any-space" },
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Discard 2 cards: 2 damage to every unit adjacent to a space",
          cost: { discardCards: 2 },
          effect: {
            type: "AREA_DAMAGE_PICK_ADJACENT",
            amount: 2,
            includeCenter: false,
            adjacentPicks: 4
          }
        }
      ]
    },
    assets: {
      cardImage: specialtyCardImage("adelaide", 6),
      imageAlt: "Frost Ring level VI specialty card"
    },
    implementationStatus: "implemented",
    source: heroSource("adelaide")
  }
};
