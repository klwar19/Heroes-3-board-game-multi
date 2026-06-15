import type { CardLibrary } from "@/engine/state";

const wikiCredit =
  "Card text from the fan wiki spell pages; verify against official owned components before full content import.";

function spellSource(slug: string) {
  return {
    product: "Heroes of Might and Magic III: The Board Game",
    credit: wikiCredit,
    url: `https://en.homm3bg.wiki/spells/${slug}/`
  };
}

function notImplementedSpell(
  slug: string,
  name: string,
  spellLevel: "basic" | "expert",
  school: "air" | "earth" | "fire" | "water",
  timing: "combat" | "instant" | "map",
  text: string
): CardLibrary[string] {
  const card: CardLibrary[string] = {
    id: `spell.${slug}`,
    name,
    kind: "spell",
    timing,
    spellLevel,
    spellSchools: [school],
    tags: ["spell", spellLevel, school, "needs-implementation", text],
    power: 0,
    effect: { type: "DRAW_CARDS", amount: 0 },
    assets: {
      cardImage: `/assets/spells-${slug}.webp`,
      imageAlt: `${name} card`
    },
    implementationStatus: "not-implemented",
    source: spellSource(slug)
  };
  if (timing === "combat") {
    card.phaseLimit = ["combat"];
  }
  return card;
}

export const spellCards: CardLibrary = {
  "spell.haste": {
    id: "spell.haste",
    name: "Haste",
    kind: "spell",
    timing: "combat",
    phaseLimit: ["combat"],
    spellLevel: "basic",
    spellSchools: ["air"],
    tags: [
      "spell",
      "basic",
      "air",
      "Ongoing: Until the end of the Combat, the selected unit gains: Power 0: +1 initiative; Power 1: +2 initiative; Power 2: +3 initiative."
    ],
    power: 0,
    target: { type: "friendly-unit" },
    effect: {
      type: "CREATE_INITIATIVE_BUFF",
      name: "Haste",
      amountByPower: { 0: 1, 1: 2, 2: 3 },
      duration: { type: "combat" },
      polarity: "positive",
      removable: true
    },
    assets: {
      cardImage: "/assets/spells-haste.webp",
      imageAlt: "Haste card"
    },
    implementationStatus: "implemented",
    source: spellSource("haste")
  },
  "spell.slow": {
    id: "spell.slow",
    name: "Slow",
    kind: "spell",
    timing: "combat",
    phaseLimit: ["combat"],
    spellLevel: "basic",
    spellSchools: ["earth"],
    tags: [
      "spell",
      "basic",
      "earth",
      "Ongoing: Until the end of the Combat, the selected unit suffers: Power 0: -1 initiative; Power 1: -2 initiative; Power 2: -3 initiative."
    ],
    power: 0,
    target: { type: "enemy-unit" },
    effect: {
      type: "CREATE_INITIATIVE_BUFF",
      name: "Slow",
      amountByPower: { 0: -1, 1: -2, 2: -3 },
      duration: { type: "combat" },
      polarity: "negative",
      removable: true
    },
    assets: {
      cardImage: "/assets/spells-slow.webp",
      imageAlt: "Slow card"
    },
    implementationStatus: "implemented",
    source: spellSource("slow")
  },
  "spell.curse": {
    id: "spell.curse",
    name: "Curse",
    kind: "spell",
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    spellLevel: "basic",
    spellSchools: ["fire"],
    tags: [
      "spell",
      "basic",
      "fire",
      "Instant: The selected unit suffers (to a minimum of 0): Power 0: -1 defense; Power 1: -2 defense; Power 2: -3 defense."
    ],
    power: 0,
    // Weakens the defender of your own unit's attack.
    trigger: {
      event: "UNIT_ATTACK_DECLARED",
      controller: "self"
    },
    effect: {
      type: "ADD_COMBAT_STAT",
      stat: "defense",
      amount: -1,
      amountByPower: { 0: -1, 1: -2, 2: -3 }
    },
    assets: {
      cardImage: "/assets/spells-curse.webp",
      imageAlt: "Curse card"
    },
    implementationStatus: "implemented",
    source: spellSource("curse")
  },
  "spell.weakness": {
    id: "spell.weakness",
    name: "Weakness",
    kind: "spell",
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    spellLevel: "basic",
    spellSchools: ["water"],
    tags: [
      "spell",
      "basic",
      "water",
      "Instant: The selected unit suffers (to a minimum of 0): Power 0: -1 attack; Power 1: -2 attack; Power 2: -3 attack."
    ],
    power: 0,
    // Weakens the enemy unit that is attacking you.
    trigger: {
      event: "UNIT_ATTACK_DECLARED",
      controller: "opponent"
    },
    effect: {
      type: "ADD_COMBAT_STAT",
      stat: "attack",
      amount: -1,
      amountByPower: { 0: -1, 1: -2, 2: -3 }
    },
    assets: {
      cardImage: "/assets/spells-weakness.webp",
      imageAlt: "Weakness card"
    },
    implementationStatus: "implemented",
    source: spellSource("weakness")
  },
  "spell.bless": {
    id: "spell.bless",
    name: "Bless",
    kind: "spell",
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    spellLevel: "basic",
    spellSchools: ["water"],
    tags: [
      "spell",
      "basic",
      "water",
      "Instant: The selected ground or flying unit: Power 0: ignores the Attack die roll; Power 1: ignores the Attack die roll and gains +1 attack; Power 2: ignores the Attack die roll and gains +2 attack."
    ],
    power: 0,
    trigger: {
      event: "UNIT_ATTACK_DECLARED",
      controller: "self"
    },
    effect: {
      type: "IGNORE_ATTACK_DIE",
      attackBonusByPower: { 0: 0, 1: 1, 2: 2 }
    },
    assets: {
      cardImage: "/assets/spells-bless.webp",
      imageAlt: "Bless card"
    },
    implementationStatus: "implemented",
    source: spellSource("bless")
  },
  "spell.anti_magic": {
    id: "spell.anti_magic",
    name: "Anti-Magic",
    kind: "spell",
    timing: "combat",
    phaseLimit: ["combat"],
    spellLevel: "basic",
    spellSchools: ["earth"],
    tags: [
      "spell",
      "basic",
      "earth",
      "Ongoing: Until the end of the Combat, the selected unit cannot be targeted by spells: Power 0: bronze; Power 2: bronze or silver; Power 4: bronze, silver, or gold."
    ],
    power: 0,
    target: { type: "friendly-unit" },
    effect: {
      type: "CREATE_SPELL_IMMUNITY",
      gradeByPower: { 0: "bronze", 2: "silver", 4: "gold" },
      duration: { type: "combat" }
    },
    assets: {
      cardImage: "/assets/spells-anti_magic.webp",
      imageAlt: "Anti-Magic card"
    },
    implementationStatus: "implemented",
    source: spellSource("anti-magic")
  },
  "spell.precision": {
    id: "spell.precision",
    name: "Precision",
    kind: "spell",
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    spellLevel: "basic",
    spellSchools: ["air"],
    tags: [
      "spell",
      "basic",
      "air",
      "Instant: When attacking a non-adjacent unit, the selected ranged unit ignores the combat penalties and gains: Power 0: +1 attack; Power 1: +2 attack; Power 2: +3 attack."
    ],
    power: 0,
    trigger: {
      event: "UNIT_ATTACK_DECLARED",
      controller: "self"
    },
    effect: {
      type: "ADD_COMBAT_STAT",
      stat: "attack",
      amount: 1,
      amountByPower: { 0: 1, 1: 2, 2: 3 },
      unitTypes: ["ranged"],
      ignoreRangedPenalty: true
    },
    assets: {
      cardImage: "/assets/spells-precision.webp",
      imageAlt: "Precision card"
    },
    implementationStatus: "implemented",
    source: spellSource("precision")
  },
  "spell.fire_shield": {
    id: "spell.fire_shield",
    name: "Fire Shield",
    kind: "spell",
    timing: "combat",
    phaseLimit: ["combat"],
    spellLevel: "expert",
    spellSchools: ["fire"],
    tags: [
      "spell",
      "expert",
      "fire",
      "Ongoing: When the targeted unit is attacked by an adjacent unit during this Combat round, the attacking unit takes: Power 0: 1 damage; Power 2: 2 damage; Power 4: 3 damage."
    ],
    power: 0,
    target: { type: "friendly-unit" },
    effect: {
      type: "CREATE_FIRE_SHIELD",
      amountByPower: { 0: 1, 2: 2, 4: 3 },
      duration: { type: "current-combat-round" }
    },
    assets: {
      cardImage: "/assets/spells-fire_shield.webp",
      imageAlt: "Fire Shield card"
    },
    implementationStatus: "implemented",
    source: spellSource("fire_shield")
  },
  "spell.counterstrike": {
    id: "spell.counterstrike",
    name: "Counterstrike",
    kind: "spell",
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    spellLevel: "expert",
    spellSchools: ["air"],
    tags: [
      "spell",
      "expert",
      "air",
      "Instant: Remove the Black cube from the selected unit card - that unit is now able to perform a Retaliation Attack action again: Power 0: bronze; Power 2: bronze or silver; Power 4: bronze, silver, or gold."
    ],
    power: 0,
    target: { type: "friendly-unit" },
    effect: {
      type: "CLEAR_RETALIATION",
      gradeByPower: { 0: "bronze", 2: "silver", 4: "gold" }
    },
    assets: {
      cardImage: "/assets/spells-counterstrike.webp",
      imageAlt: "Counterstrike card"
    },
    implementationStatus: "implemented",
    source: spellSource("counterstrike")
  },
  "spell.prayer": {
    id: "spell.prayer",
    name: "Prayer",
    kind: "spell",
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    spellLevel: "expert",
    spellSchools: ["water"],
    tags: [
      "spell",
      "expert",
      "water",
      "Instant: The selected unit gains attack, defense, or initiative: Power 0: +1; Power 2: +2; Power 4: +3."
    ],
    power: 0,
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "+X attack",
          trigger: {
            event: "UNIT_ATTACK_DECLARED",
            controller: "self"
          },
          effect: {
            type: "ADD_COMBAT_STAT",
            stat: "attack",
            amount: 1,
            amountByPower: { 0: 1, 2: 2, 4: 3 }
          }
        },
        {
          label: "+X defense",
          trigger: {
            event: "UNIT_ATTACK_DECLARED",
            controller: "opponent"
          },
          effect: {
            type: "ADD_COMBAT_STAT",
            stat: "defense",
            amount: 1,
            amountByPower: { 0: 1, 2: 2, 4: 3 }
          }
        },
        {
          label: "+X initiative",
          effect: {
            type: "CREATE_INITIATIVE_BUFF",
            name: "Prayer",
            amountByPower: { 0: 1, 2: 2, 4: 3 },
            duration: { type: "combat" },
            polarity: "positive",
            removable: true
          }
        }
      ]
    },
    assets: {
      cardImage: "/assets/spells-prayer.webp",
      imageAlt: "Prayer card"
    },
    implementationStatus: "implemented",
    source: spellSource("prayer")
  },
  "spell.town_portal": {
    id: "spell.town_portal",
    name: "Town Portal",
    kind: "spell",
    timing: "map",
    spellLevel: "expert",
    spellSchools: ["earth"],
    tags: [
      "spell",
      "expert",
      "earth",
      "Map effect: Move your Hero to a selected Town or Settlement in your control, and: Power 0: no additional effect; Power 2: +1 movement; Power 4: +2 movement."
    ],
    power: 0,
    effect: {
      type: "TELEPORT_HERO_TO_TOWN"
    },
    assets: {
      cardImage: "/assets/spells-town_portal.webp",
      imageAlt: "Town Portal card"
    },
    implementationStatus: "implemented",
    source: spellSource("town_portal")
  },

  // ---- Summon Elemental (Conflux Expert spells) -------------------------
  // Activation spells cast during your own unit's activation. On a chosen
  // empty space, Power 2 summons a Few and Power 4 a Pack of the school's
  // Elemental. The summoned unit joins the combat at once and stays in your
  // army afterwards — just like the Pit Lords' Demons.
  "spell.summon_air_elemental": {
    id: "spell.summon_air_elemental",
    name: "Summon Air Elemental",
    kind: "spell",
    timing: "combat",
    phaseLimit: ["combat"],
    spellLevel: "expert",
    spellSchools: ["air"],
    tags: [
      "spell",
      "expert",
      "air",
      "Activation: On a chosen empty space — Power 0: no effect; Power 2: Summon a Few of Air Elementals; Power 4: Summon a Pack of Air Elementals."
    ],
    power: 0,
    target: { type: "empty-space" },
    effect: { type: "SUMMON_ELEMENTAL", unitDefId: "neutral.air_elementals" },
    assets: {
      cardImage: "/assets/spells-summon_air_elemental.webp",
      imageAlt: "Summon Air Elemental card"
    },
    implementationStatus: "implemented",
    source: spellSource("summon_air_elemental")
  },
  "spell.summon_earth_elemental": {
    id: "spell.summon_earth_elemental",
    name: "Summon Earth Elemental",
    kind: "spell",
    timing: "combat",
    phaseLimit: ["combat"],
    spellLevel: "expert",
    spellSchools: ["earth"],
    tags: [
      "spell",
      "expert",
      "earth",
      "Activation: On a chosen empty space — Power 0: no effect; Power 2: Summon a Few of Earth Elementals; Power 4: Summon a Pack of Earth Elementals."
    ],
    power: 0,
    target: { type: "empty-space" },
    effect: { type: "SUMMON_ELEMENTAL", unitDefId: "neutral.earth_elementals" },
    assets: {
      cardImage: "/assets/spells-summon_earth_elemental.webp",
      imageAlt: "Summon Earth Elemental card"
    },
    implementationStatus: "implemented",
    source: spellSource("summon_earth_elemental")
  },
  "spell.summon_fire_elemental": {
    id: "spell.summon_fire_elemental",
    name: "Summon Fire Elemental",
    kind: "spell",
    timing: "combat",
    phaseLimit: ["combat"],
    spellLevel: "expert",
    spellSchools: ["fire"],
    tags: [
      "spell",
      "expert",
      "fire",
      "Activation: On a chosen empty space — Power 0: no effect; Power 2: Summon a Few of Fire Elementals; Power 4: Summon a Pack of Fire Elementals."
    ],
    power: 0,
    target: { type: "empty-space" },
    effect: { type: "SUMMON_ELEMENTAL", unitDefId: "neutral.fire_elementals" },
    assets: {
      cardImage: "/assets/spells-summon_fire_elemental.webp",
      imageAlt: "Summon Fire Elemental card"
    },
    implementationStatus: "implemented",
    source: spellSource("summon_fire_elemental")
  },
  "spell.summon_water_elemental": {
    id: "spell.summon_water_elemental",
    name: "Summon Water Elemental",
    kind: "spell",
    timing: "combat",
    phaseLimit: ["combat"],
    spellLevel: "expert",
    spellSchools: ["water"],
    tags: [
      "spell",
      "expert",
      "water",
      "Activation: On a chosen empty space — Power 0: no effect; Power 2: Summon a Few of Water Elementals; Power 4: Summon a Pack of Water Elementals."
    ],
    power: 0,
    target: { type: "empty-space" },
    effect: { type: "SUMMON_ELEMENTAL", unitDefId: "neutral.water_elementals" },
    assets: {
      cardImage: "/assets/spells-summon_water_elemental.webp",
      imageAlt: "Summon Water Elemental card"
    },
    implementationStatus: "implemented",
    source: spellSource("summon_water_elemental")
  },

  // ---- Not yet implemented spells (library entries only, not in decks) ----
  // Chain Lightning: an Activation Air spell that reuses the engine's Chain
  // Lightning machinery (shared with Solmyr's specialty). The selected enemy
  // takes the first bolt; the rest fork to the units closest to it (friend or
  // foe), the caster routing them on ties. The allocation scales with Power.
  "spell.chain_lightning": {
    id: "spell.chain_lightning",
    name: "Chain Lightning",
    kind: "spell",
    timing: "combat",
    phaseLimit: ["combat"],
    spellLevel: "expert",
    spellSchools: ["air"],
    power: 0,
    target: { type: "enemy-unit" },
    tags: [
      "spell",
      "expert",
      "air",
      "Activation: Select a unit and another 2 units closest to it. Allocate damage, starting with the first selected unit: Power 0: 1/1/1 damage; Power 2: 2/1/1 damage; Power 4: 3/2/1 damage."
    ],
    effect: {
      type: "CHAIN_LIGHTNING",
      damagesByPower: { 0: [1, 1, 1], 2: [2, 1, 1], 4: [3, 2, 1] }
    },
    assets: {
      cardImage: "/assets/spells-chain_lightning.webp",
      imageAlt: "Chain Lightning card"
    },
    implementationStatus: "implemented",
    source: spellSource("chain_lightning")
  },
  // Resurrection is an instant lethal save: it reuses the engine's
  // CANCEL_LETHAL_ATTACK mechanism (shared with Alamar's specialty and the
  // Archangels' ability), offered only in the lethal-save window, gated by the
  // grade the paid Power covers (0 → bronze, 2 → silver, 4 → gold) and by the
  // one-Spell-per-combat-round limit.
  "spell.resurrection": {
    id: "spell.resurrection",
    name: "Resurrection",
    kind: "spell",
    timing: "reaction",
    phaseLimit: ["reaction", "combat"],
    spellLevel: "expert",
    spellSchools: ["earth"],
    power: 0,
    tags: [
      "spell",
      "expert",
      "earth",
      "resurrection",
      "Instant: Cancel an attack that would reduce your unit's HP to 0. Power 0: bronze; Power 2: bronze or silver; Power 4: bronze, silver, or gold."
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        { label: "Save a bronze unit", effect: { type: "CANCEL_LETHAL_ATTACK", grade: "bronze" } },
        {
          label: "Save a silver unit (pay 2 Power)",
          cost: { discardCards: 2, costCardFilter: "power-source" },
          effect: { type: "CANCEL_LETHAL_ATTACK", grade: "silver" }
        },
        {
          label: "Save a gold unit (pay 4 Power)",
          cost: { discardCards: 4, costCardFilter: "power-source" },
          effect: { type: "CANCEL_LETHAL_ATTACK", grade: "gold" }
        }
      ]
    },
    assets: {
      cardImage: "/assets/spells-resurrection.webp",
      imageAlt: "Resurrection card"
    },
    implementationStatus: "implemented",
    source: spellSource("resurrection")
  },
  // Magic Mirror is an instant reaction to an enemy Spell that targets one of
  // your units: choose a new target for that Spell, gated by the Power paid
  // (0 → bronze, 1 → silver, 2 → gold — one option per grade, like
  // Resurrection). The new target is picked in a follow-up choice; the Spell
  // then resolves against it. Casting Magic Mirror counts as your Spell for the
  // combat round (Expert Knowledge / Intelligence raise or waive that limit).
  "spell.magic_mirror": {
    id: "spell.magic_mirror",
    name: "Magic Mirror",
    kind: "spell",
    timing: "reaction",
    phaseLimit: ["reaction", "combat"],
    spellLevel: "expert",
    spellSchools: ["air"],
    power: 0,
    tags: [
      "spell",
      "expert",
      "air",
      "magic-mirror",
      "Instant: When your unit is about to be targeted or damaged by a spell, choose a new target for that spell. Power 0: bronze; Power 1: bronze or silver; Power 2: bronze, silver, or gold."
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Redirect the spell to a bronze unit",
          trigger: { event: "SPELL_CAST_STARTED", controller: "opponent" },
          effect: { type: "REDIRECT_SPELL", grade: "bronze" }
        },
        {
          label: "Redirect to a bronze or silver unit (pay 1 Power)",
          cost: { discardCards: 1, costCardFilter: "power-source" },
          trigger: { event: "SPELL_CAST_STARTED", controller: "opponent" },
          effect: { type: "REDIRECT_SPELL", grade: "silver" }
        },
        {
          label: "Redirect to a bronze, silver, or gold unit (pay 2 Power)",
          cost: { discardCards: 2, costCardFilter: "power-source" },
          trigger: { event: "SPELL_CAST_STARTED", controller: "opponent" },
          effect: { type: "REDIRECT_SPELL", grade: "gold" }
        }
      ]
    },
    assets: {
      cardImage: "/assets/spells-magic_mirror.webp",
      imageAlt: "Magic Mirror card"
    },
    implementationStatus: "implemented",
    source: spellSource("magic_mirror")
  },
  "spell.teleport": notImplementedSpell(
    "teleport",
    "Teleport",
    "expert",
    "water",
    "combat",
    "Activation: During Combat, move one allied unit to any empty space - ignore any obstacles or effects when moving: Power 0: bronze; Power 1: bronze or silver; Power 2: bronze, silver, or gold."
  ),
  // Blind: an Activation Fire spell that drops a Paralysis token on an enemy
  // unit (it skips its next activation; the token is removed if it takes
  // damage first). The reachable grade rises with the Power paid.
  "spell.blind": {
    id: "spell.blind",
    name: "Blind",
    kind: "spell",
    timing: "combat",
    phaseLimit: ["combat"],
    spellLevel: "basic",
    spellSchools: ["fire"],
    power: 0,
    target: { type: "enemy-unit" },
    tags: [
      "spell",
      "basic",
      "fire",
      "Activation: Place a paralysis token on the selected unit: Power 0: bronze; Power 1: bronze or silver; Power 2: bronze, silver, or gold."
    ],
    effect: {
      type: "PLACE_PARALYSIS",
      gradeByPower: { 0: "bronze", 1: "silver", 2: "gold" }
    },
    assets: {
      cardImage: "/assets/spells-blind.webp",
      imageAlt: "Blind card"
    },
    implementationStatus: "implemented",
    source: spellSource("blind")
  },
  "spell.mirth": notImplementedSpell(
    "mirth",
    "Mirth",
    "expert",
    "water",
    "combat",
    "Ongoing: You can reroll each of your Attack dice once. During: Power 0: this Activation; Power 2: this Combat round; Power 4: this Combat."
  ),
  "spell.sorrow": notImplementedSpell(
    "sorrow",
    "Sorrow",
    "expert",
    "earth",
    "instant",
    "Instant: When a unit is about to activate, skip this unit's activation: Power 0: bronze; Power 2: bronze or silver; Power 4: bronze, silver, or gold."
  ),
  "spell.slayer": notImplementedSpell(
    "slayer",
    "Slayer",
    "expert",
    "fire",
    "instant",
    "Instant: When attacking a gold unit, roll an Attack die several times and apply all the results (except for a '-1'). After resolving this attack, draw 1 card: Power 0: twice; Power 2: 4 times; Power 4: 6 times."
  ),
  "spell.dimension_door": notImplementedSpell(
    "dimension_door",
    "Dimension Door",
    "expert",
    "air",
    "map",
    "Map effect: Move a Hero up to X fields. Ignore any obstacles and fields in-between and resolve the last one normally: Power 0: 1; Power 2: 2; Power 4: 3."
  ),
  "spell.earthquake": {
    id: "spell.earthquake",
    name: "Earthquake",
    kind: "spell",
    timing: "instant",
    phaseLimit: ["combat"],
    spellLevel: "basic",
    spellSchools: ["earth"],
    tags: [
      "spell",
      "basic",
      "earth",
      "Instant: During a Town siege: Power 0: remove 1 Gate or Wall obstacle of your choice; Power 1: remove 2 Gate or Wall obstacles of your choice; Power 2: every unit adjacent to a Wall or Gate obstacle suffers 1 damage, remove all Gate or Wall obstacles."
    ],
    power: 0,
    effect: { type: "EARTHQUAKE" },
    assets: {
      cardImage: "/assets/spells-earthquake.webp",
      imageAlt: "Earthquake card"
    },
    implementationStatus: "implemented",
    source: spellSource("earthquake")
  },
  "spell.forgetfulness": notImplementedSpell(
    "forgetfulness",
    "Forgetfulness",
    "basic",
    "water",
    "combat",
    "Ongoing: During its next activation, a ranged unit of your choice cannot attack: Power 0: bronze; Power 1: bronze or silver; Power 2: bronze, silver, or gold."
  ),
  "spell.inferno": notImplementedSpell(
    "inferno",
    "Inferno",
    "expert",
    "fire",
    "combat",
    "Activation: Select a space. Now roll an Attack die several times. All units on this and the adjacent spaces take 1 damage for every '+1' rolled: Power 0: once; Power 1: twice; Power 2: 4 times."
  ),
  "spell.visions": notImplementedSpell(
    "visions",
    "Visions",
    "basic",
    "fire",
    "instant",
    "Instant: Draw cards from any Neutral Unit deck. You can discard any of them and return the remaining cards in any order: Power 0: 1 card; Power 1: 2 cards; Power 2: 3 cards."
  )
};

/** Single mixed deck (legacy mode), Core+Rampart+Inferno implemented spells. */
export const spellDeckLegacy: string[] = [
  "spell.magic_arrow",
  "spell.magic_arrow",
  "spell.magic_arrow",
  "spell.lightning_bolt",
  "spell.lightning_bolt",
  "spell.haste",
  "spell.haste",
  "spell.slow",
  "spell.slow",
  "spell.stone_skin",
  "spell.stone_skin",
  "spell.bloodlust",
  "spell.bloodlust",
  "spell.curse",
  "spell.curse",
  "spell.weakness",
  "spell.weakness",
  "spell.bless",
  "spell.bless",
  "spell.cure",
  "spell.cure",
  "spell.anti_magic",
  "spell.anti_magic",
  "spell.precision",
  "spell.fireball",
  "spell.fireball",
  "spell.fire_shield",
  "spell.fire_shield",
  "spell.counterstrike",
  "spell.counterstrike",
  "spell.prayer",
  "spell.prayer",
  "spell.town_portal",
  "spell.town_portal",
  "spell.earthquake",
  "spell.resurrection",
  "spell.magic_mirror",
  "spell.summon_air_elemental",
  "spell.summon_earth_elemental",
  "spell.summon_fire_elemental",
  "spell.summon_water_elemental"
];

/** BINH split decks. */
export const spellDeckBinhBasic: string[] = [
  "spell.magic_arrow",
  "spell.magic_arrow",
  "spell.magic_arrow",
  "spell.lightning_bolt",
  "spell.lightning_bolt",
  "spell.haste",
  "spell.haste",
  "spell.slow",
  "spell.slow",
  "spell.stone_skin",
  "spell.stone_skin",
  "spell.bloodlust",
  "spell.bloodlust",
  "spell.curse",
  "spell.curse",
  "spell.weakness",
  "spell.weakness",
  "spell.bless",
  "spell.bless",
  "spell.cure",
  "spell.cure",
  "spell.anti_magic",
  "spell.anti_magic",
  "spell.precision",
  "spell.fortune",
  "spell.fortune",
  "spell.earthquake"
];

export const spellDeckBinhExpert: string[] = [
  "spell.fireball",
  "spell.fireball",
  "spell.fire_shield",
  "spell.fire_shield",
  "spell.counterstrike",
  "spell.counterstrike",
  "spell.prayer",
  "spell.prayer",
  "spell.town_portal",
  "spell.town_portal",
  "spell.resurrection",
  "spell.magic_mirror",
  "spell.summon_air_elemental",
  "spell.summon_earth_elemental",
  "spell.summon_fire_elemental",
  "spell.summon_water_elemental"
];
