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
 * A faithful, display-only specialty for printed effects the engine does not
 * model yet (Chain Lightning's nearest-unit damage chain, the Ballista grants,
 * Cyra's initiative-conditional doubling). The card shows its real rules text
 * and is honestly flagged not-implemented, so it is never silently faked.
 * `hasArt` controls whether the cropped specialty scan is wired (Cyra/Torosar
 * have only placeholder art on the wiki, so theirs render as text).
 */
function notImplementedSpecialty(
  heroSlug: string,
  specialtyName: string,
  level: 1 | 4 | 6,
  text: string,
  hasArt: boolean
): CardLibrary[string] {
  return {
    id: `specialty.${heroSlug}.${level}`,
    name: `${specialtyName} ${towerRoman(level)}`,
    kind: "hero-specialty",
    timing: "combat",
    phaseLimit: ["combat"],
    tags: ["hero-specialty", "needs-implementation", heroSlug, text],
    effect: { type: "DRAW_CARDS", amount: 0 },
    ...(hasArt
      ? {
          assets: {
            cardImage: specialtyCardImage(heroSlug, level),
            imageAlt: `${specialtyName} level ${towerRoman(level)} specialty card`
          }
        }
      : {}),
    implementationStatus: "not-implemented",
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
  "ability.first_aid": {
    id: "ability.first_aid",
    name: "First Aid",
    kind: "ability",
    timing: "instant",
    phaseLimit: ["combat"],
    abilityClass: "combat",
    tags: ["ability", "instant", "heal", "wiki-reference"],
    target: { type: "friendly-unit", damagedOnly: true },
    effect: {
      type: "HEAL_DAMAGE",
      amount: 1
    },
    assets: {
      cardImage: "/assets/abilities-first_aid.webp",
      imageAlt: "First Aid ability card"
    },
    implementationStatus: "implemented",
    source: abilitySource("first_aid")
  },
  "ability.scholar": {
    id: "ability.scholar",
    name: "Scholar",
    kind: "ability",
    timing: "instant",
    abilityClass: "adventure",
    // Printed basic: "Choose 1 card from your discard pile and add it to your
    // hand." The expert Empowered-Statistic swap needs the Empowered cards
    // (Inferno expansion) and stays unimplemented.
    tags: [
      "ability",
      "map",
      "Basic: Choose 1 card from your discard pile and add it to your hand. (Expert Empowered-Statistic swap not implemented.)"
    ],
    effect: { type: "TAKE_FROM_DISCARD", count: 1 },
    assets: {
      cardImage: "/assets/abilities-scholar.webp",
      imageAlt: "Scholar ability card"
    },
    implementationStatus: "implemented",
    source: abilitySource("scholar")
  },
  "ability.tactics": {
    id: "ability.tactics",
    name: "Tactics",
    kind: "ability",
    timing: "instant",
    abilityClass: "might",
    tags: [
      "ability",
      "combat",
      "needs-implementation",
      "Switch the position of two of your units at the start of Combat (expert: during Combat)."
    ],
    effect: { type: "DRAW_CARDS", amount: 0 },
    assets: {
      cardImage: "/assets/abilities-tactics.webp",
      imageAlt: "Tactics ability card"
    },
    implementationStatus: "not-implemented",
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
    target: { type: "any-unit" },
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
    target: { type: "any-unit" },
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
    target: { type: "any-unit" },
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
  // Cyra (Wizard): the Haste specialist. I = +3 initiative for the combat
  // (implemented). IV/VI add an initiative-comparison conditional the engine
  // does not model yet, so they stay faithful display-only cards.
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
  "specialty.cyra.4": notImplementedSpecialty(
    "cyra",
    "Haste",
    4,
    "Your selected unit gains +1 attack. The effect doubles if the attacked unit has higher initiative.",
    false
  ),
  "specialty.cyra.6": notImplementedSpecialty(
    "cyra",
    "Haste",
    6,
    "For this Combat, your selected unit's initiative is increased by 3. This unit gains +1 defense against attacks made by units with lower initiative.",
    false
  ),
  // Solmyr (Wizard): the Chain Lightning specialist. The nearest-unit damage
  // chain (I/VI) and the deck dig (IV) need engine mechanics we do not have
  // yet, so all three are faithful display-only cards (with their printed art).
  "specialty.solmyr.1": notImplementedSpecialty(
    "solmyr",
    "Chain Lightning",
    1,
    "Select a unit and the 2 units closest to it. Allocate 1/1/0 damage, starting with the first selected unit.",
    true
  ),
  "specialty.solmyr.4": notImplementedSpecialty(
    "solmyr",
    "Chain Lightning",
    4,
    "Discard up to 3 cards from your Might and Magic deck and return 1 of them to your hand.",
    true
  ),
  "specialty.solmyr.6": notImplementedSpecialty(
    "solmyr",
    "Chain Lightning",
    6,
    "Select a unit and the 2 units closest to it. Allocate 2/1/1 damage, starting with the first selected unit.",
    true
  ),
  // Torosar (Wizard, might): the Ballista specialist. Granting/activating extra
  // Ballistas needs war-machine-grant mechanics we do not model yet; the wiki
  // also only has placeholder art, so these are text-only display cards.
  "specialty.torosar.1": notImplementedSpecialty(
    "torosar",
    "Ballista",
    1,
    "Pay 5 gold to gain a Ballista. — OR — Activate your Ballista (if you have one).",
    false
  ),
  "specialty.torosar.4": notImplementedSpecialty(
    "torosar",
    "Ballista",
    4,
    "Until the end of the round, gain an additional Ballista during Combat. When played, this card counts as a Ballista.",
    false
  ),
  "specialty.torosar.6": notImplementedSpecialty(
    "torosar",
    "Ballista",
    6,
    "For this Combat, gain an additional Ballista. You can activate all your Ballistas now. When played, this card counts as a Ballista.",
    false
  )
};
