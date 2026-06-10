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

/** "+1 attack or +1 defense" specialty shared by the might heroes. */
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
          label: "+1 attack",
          trigger: { event: "UNIT_ATTACK_DECLARED", controller: "self" },
          effect: { type: "ADD_COMBAT_STAT", stat: "attack", amount: 1 }
        },
        {
          label: "+1 defense",
          trigger: { event: "UNIT_ATTACK_DECLARED", controller: "opponent" },
          effect: { type: "ADD_COMBAT_STAT", stat: "defense", amount: 1 }
        }
      ]
    },
    assets: {
      cardImage: `https://en.homm3bg.wiki/assets/hero_specialties-${heroSlug}-1.webp`,
      imageAlt: `${heroName} level I specialty card`
    },
    // The printed doubling for the hero's signature unit is not modeled yet.
    implementationStatus: "implemented",
    source: {
      ...heroSource(heroSlug),
      credit: `${wikiCredit} Doubled effect for ${doubledUnit} not modeled yet.`
    }
  };
}

function notImplementedSpecialty(
  heroSlug: string,
  heroName: string,
  level: 4 | 6,
  text: string
): CardLibrary[string] {
  return {
    id: `specialty.${heroSlug}.${level}`,
    name: `${heroName} ${level === 4 ? "IV" : "VI"}`,
    kind: "hero-specialty",
    timing: "ongoing",
    tags: ["hero-specialty", heroSlug, "needs-implementation", text],
    effect: { type: "DRAW_CARDS", amount: 0 },
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
      cardImage: "https://en.homm3bg.wiki/assets/abilities-leadership.webp",
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
      cardImage: "https://en.homm3bg.wiki/assets/abilities-sorcery.webp",
      imageAlt: "Sorcery ability card"
    },
    implementationStatus: "implemented",
    source: abilitySource("sorcery")
  },
  "ability.wisdom": {
    id: "ability.wisdom",
    name: "Wisdom",
    kind: "ability",
    timing: "instant",
    abilityClass: "magic",
    tags: [
      "ability",
      "town",
      "needs-implementation",
      "Reduces the Mage Guild spell price by 2 gold and upgrades its Search (2) to Search (3)."
    ],
    effect: { type: "DRAW_CARDS", amount: 0 },
    assets: {
      cardImage: "https://en.homm3bg.wiki/assets/abilities-wisdom.webp",
      imageAlt: "Wisdom ability card"
    },
    implementationStatus: "not-implemented",
    source: abilitySource("wisdom")
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
      cardImage: "https://en.homm3bg.wiki/assets/abilities-tactics.webp",
      imageAlt: "Tactics ability card"
    },
    implementationStatus: "not-implemented",
    source: abilitySource("tactics")
  },

  // ---- Hero specialties --------------------------------------------------
  "specialty.catherine.1": mightSpecialtyOne("catherine", "Crusaders", "Crusaders"),
  "specialty.catherine.4": notImplementedSpecialty(
    "catherine",
    "Crusaders",
    4,
    "For this Combat, your selected unit's HP is increased by 1 (doubled for Crusaders)."
  ),
  "specialty.catherine.6": notImplementedSpecialty(
    "catherine",
    "Crusaders",
    6,
    "For this Combat, your selected unit's initiative is increased by 1 (doubled for Crusaders)."
  ),
  "specialty.tamika.1": mightSpecialtyOne("tamika", "Dread Knights", "Dread Knights"),
  "specialty.tamika.4": notImplementedSpecialty(
    "tamika",
    "Dread Knights",
    4,
    "For this Combat, your selected unit's HP is increased by 1 (doubled for Dread Knights)."
  ),
  "specialty.tamika.6": notImplementedSpecialty(
    "tamika",
    "Dread Knights",
    6,
    "For this Combat, your selected unit's initiative is increased by 1 (doubled for Dread Knights)."
  ),
  "specialty.mutare.1": mightSpecialtyOne("mutare", "Dragons", "a Dragons unit"),
  "specialty.mutare.4": notImplementedSpecialty(
    "mutare",
    "Dragons",
    4,
    "For this Combat, your selected unit's HP is increased by 1 (doubled for Dragons)."
  ),
  "specialty.mutare.6": notImplementedSpecialty(
    "mutare",
    "Dragons",
    6,
    "For this Combat, your selected unit's initiative is increased by 1 (doubled for Dragons)."
  ),
  "specialty.rion.1": {
    id: "specialty.rion.1",
    name: "Battlefield Medic I",
    kind: "hero-specialty",
    timing: "instant",
    phaseLimit: ["combat"],
    tags: ["hero-specialty", "instant", "rion", "Printed card also draws 1 card; the draw is not modeled yet."],
    target: { type: "friendly-unit", damagedOnly: true },
    effect: {
      type: "HEAL_DAMAGE",
      amount: 1
    },
    assets: {
      cardImage: "https://en.homm3bg.wiki/assets/hero_specialties-rion-1.webp",
      imageAlt: "Battlefield Medic level I specialty card"
    },
    implementationStatus: "implemented",
    source: heroSource("rion")
  },
  "specialty.rion.4": notImplementedSpecialty(
    "rion",
    "Battlefield Medic",
    4,
    "Remove 1 damage or paralysis from one of your units, then draw 1 card."
  ),
  "specialty.rion.6": notImplementedSpecialty(
    "rion",
    "Battlefield Medic",
    6,
    "Remove up to 2 damage or paralysis from one of your units, then draw 2 cards and discard 1."
  ),
  "specialty.sandro.1": notImplementedSpecialty(
    "sandro",
    "Cloak of the Undead King",
    4,
    "Replaces the Pack of Skeletons statistics with Horde of Skeletons (A3 D1 HP2 I6)."
  ),
  "specialty.sandro.4": notImplementedSpecialty(
    "sandro",
    "Cloak of the Undead King",
    4,
    "Replaces the Pack of Zombies statistics with Horde of Zombies (A4 D1 HP3 I5)."
  ),
  "specialty.sandro.6": notImplementedSpecialty(
    "sandro",
    "Cloak of the Undead King",
    6,
    "Replaces the Skeletons statistics with Legion of Skeletons (A4 D1 HP2 I6)."
  ),
  "specialty.alamar.1": notImplementedSpecialty(
    "alamar",
    "Resurrection",
    4,
    "Cancel an attack that would reduce your bronze (power 1) / silver (2) / gold (4) unit's HP to 0."
  ),
  "specialty.alamar.4": notImplementedSpecialty(
    "alamar",
    "Resurrection",
    4,
    "Cancel a lethal attack: bronze power 0, silver 1, gold 3."
  ),
  "specialty.alamar.6": notImplementedSpecialty(
    "alamar",
    "Resurrection",
    6,
    "Cancel a lethal attack: bronze power 0, silver 0, gold 2."
  )
};

// specialty.sandro.1 keys its level from the id, not the name shown above.
adventureCards["specialty.sandro.1"] = {
  ...adventureCards["specialty.sandro.1"],
  id: "specialty.sandro.1",
  name: "Cloak of the Undead King I"
};
adventureCards["specialty.alamar.1"] = {
  ...adventureCards["specialty.alamar.1"],
  id: "specialty.alamar.1",
  name: "Resurrection I"
};
