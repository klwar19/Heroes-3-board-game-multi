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
  // Town Portal (Expert Earth, map): teleport the Hero to a controlled Town or
  // Settlement. The Power paid raises the movement the Hero keeps on arrival
  // (Power 0/2/4 -> +0/+1/+2), encoded as the higher-cost options paid by
  // discarding power-source cards — the same map-power model as Fly / Dimension
  // Door. A destination town already holding another Hero is offered only when
  // the teleporting Hero could still move out of it this turn (engine: see
  // queueTownPortalChoice). The "OR Instant: +1 Power" side is the universal
  // power-source discard, so it needs no dedicated option.
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
      "Map effect: Move your Hero to a selected Town or Settlement in your control, and: Power 0: no additional effect; Power 2: +1 movement; Power 4: +2 movement. — OR — Instant: +1 Power."
    ],
    power: 0,
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Teleport to a town or settlement",
          mapOnly: true,
          effect: { type: "TELEPORT_HERO_TO_TOWN" }
        },
        {
          label: "Teleport and +1 movement (pay 2 Power)",
          mapOnly: true,
          cost: { discardCards: 2, costCardFilter: "power-source" },
          effect: { type: "TELEPORT_HERO_TO_TOWN", movementBonus: 1 }
        },
        {
          label: "Teleport and +2 movement (pay 4 Power)",
          mapOnly: true,
          cost: { discardCards: 4, costCardFilter: "power-source" },
          effect: { type: "TELEPORT_HERO_TO_TOWN", movementBonus: 2 }
        }
      ]
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

  // ---- Spells beyond the base block ----
  // Each entry's `implementationStatus` is authoritative; the implemented ones
  // are dealt into the decks below where the rules place them, the rest are
  // library-only stubs.
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
  // Mirth (Expert Water, Activation; Rampart Expansion): a player-scoped reroll
  // — you may reroll each of your Attack dice once, for a window that grows with
  // Power (Power 0: this Activation, 2: this Combat round, 4: this Combat). The
  // reroll count stays one per die; only the duration scales. The "OR Instant:
  // +1 Power" side is the universal power-source discard, so it needs no option.
  "spell.mirth": {
    id: "spell.mirth",
    name: "Mirth",
    kind: "spell",
    timing: "combat",
    phaseLimit: ["combat"],
    spellLevel: "expert",
    spellSchools: ["water"],
    power: 0,
    tags: [
      "spell",
      "expert",
      "water",
      "Ongoing: You can reroll each of your Attack dice once. During: Power 0: this Activation; Power 2: this Combat round; Power 4: this Combat. — OR — Instant: +1 Power."
    ],
    effect: {
      type: "CREATE_ATTACK_DIE_REROLL",
      name: "Mirth",
      basicRerolls: 1,
      duration: { type: "current-activation" },
      durationByPower: {
        0: { type: "current-activation" },
        2: { type: "current-combat-round" },
        4: { type: "combat" }
      },
      consumeEffectOnUse: false
    },
    assets: {
      cardImage: "/assets/spells-mirth.webp",
      imageAlt: "Mirth card"
    },
    implementationStatus: "implemented",
    source: spellSource("mirth")
  },
  // Sorrow (Expert Earth, Instant; Rampart Expansion): when an enemy unit is
  // about to activate, skip its activation. The reachable grade is set by the
  // Power paid (0 → bronze, 2 → silver, 4 → gold), modelled as one CHOOSE_ONE
  // option per grade — free for bronze, pay 2/4 power-source cards for silver/
  // gold (like Resurrection). The legal-action layer offers exactly the option
  // matching the unit about to act, and only when it is affordable, so the tray
  // shows a single "skip this unit (pay N)" choice with the cost picker.
  "spell.sorrow": {
    id: "spell.sorrow",
    name: "Sorrow",
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
      "Instant: When a unit is about to activate, skip this unit's activation: Power 0: bronze; Power 2: bronze or silver; Power 4: bronze, silver, or gold. — OR — Instant: +1 Power."
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Skip a bronze unit's activation",
          trigger: { event: "UNIT_ACTIVATION_STARTED", controller: "opponent" },
          effect: { type: "SKIP_ACTIVATION", grade: "bronze" }
        },
        {
          label: "Skip a silver unit (pay 2 Power)",
          cost: { discardCards: 2, costCardFilter: "power-source" },
          trigger: { event: "UNIT_ACTIVATION_STARTED", controller: "opponent" },
          effect: { type: "SKIP_ACTIVATION", grade: "silver" }
        },
        {
          label: "Skip a gold unit (pay 4 Power)",
          cost: { discardCards: 4, costCardFilter: "power-source" },
          trigger: { event: "UNIT_ACTIVATION_STARTED", controller: "opponent" },
          effect: { type: "SKIP_ACTIVATION", grade: "gold" }
        }
      ]
    },
    assets: {
      cardImage: "/assets/spells-sorrow.webp",
      imageAlt: "Sorrow card"
    },
    implementationStatus: "implemented",
    source: spellSource("sorrow")
  },
  // Slayer (Expert Fire, Instant; Rampart Expansion): reacting to your own unit
  // attacking a gold unit, roll the Attack die several times and apply every
  // result but a "-1" (each "+1" adds 1 to the attack), then draw 1 card. The
  // number of rolls scales with the Power paid alongside it (0 → 2, 2 → 4,
  // 4 → 6). The "OR Instant: +1 Power" side is the universal discard.
  "spell.slayer": {
    id: "spell.slayer",
    name: "Slayer",
    kind: "spell",
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    spellLevel: "expert",
    spellSchools: ["fire"],
    power: 0,
    trigger: { event: "UNIT_ATTACK_DECLARED", controller: "self" },
    tags: [
      "spell",
      "expert",
      "fire",
      "Instant: When attacking a gold unit, roll an Attack die several times and apply all the results (except for a '-1'). After resolving this attack, draw 1 card: Power 0: twice; Power 2: 4 times; Power 4: 6 times. — OR — Instant: +1 Power."
    ],
    effect: {
      type: "SLAYER_ATTACK",
      rollsByPower: { 0: 2, 2: 4, 4: 6 }
    },
    assets: {
      cardImage: "/assets/spells-slayer.webp",
      imageAlt: "Slayer card"
    },
    implementationStatus: "implemented",
    source: spellSource("slayer")
  },
  // Dimension Door (Expert Air, map): teleport the hero up to X fields away,
  // ignoring obstacles and the fields in-between, then resolve the destination
  // normally (landing on guards or an enemy hero starts a combat). The reach
  // scales with Power, paid by discarding power-source cards (Power 0/2/4 ->
  // 1/2/3 fields). The destination is chosen from a pop-up after casting.
  "spell.dimension_door": {
    id: "spell.dimension_door",
    name: "Dimension Door",
    kind: "spell",
    timing: "map",
    spellLevel: "expert",
    spellSchools: ["air"],
    power: 0,
    tags: [
      "spell",
      "expert",
      "air",
      "Map effect: Move your Hero up to X fields. Ignore any obstacles and fields in-between and resolve the last one normally: Power 0: 1; Power 2: 2; Power 4: 3."
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        { label: "Move up to 1 field", mapOnly: true, effect: { type: "DIMENSION_DOOR", fields: 1 } },
        {
          label: "Move up to 2 fields (pay 2 Power)",
          mapOnly: true,
          cost: { discardCards: 2, costCardFilter: "power-source" },
          effect: { type: "DIMENSION_DOOR", fields: 2 }
        },
        {
          label: "Move up to 3 fields (pay 4 Power)",
          mapOnly: true,
          cost: { discardCards: 4, costCardFilter: "power-source" },
          effect: { type: "DIMENSION_DOOR", fields: 3 }
        }
      ]
    },
    assets: {
      cardImage: "/assets/spells-dimension_door.webp",
      imageAlt: "Dimension Door card"
    },
    implementationStatus: "implemented",
    source: spellSource("dimension_door")
  },
  // Fly (Expert Air, map; Fortress Expansion): this turn the hero may move
  // through blocked fields (passing over, never stopping there) and gains
  // Power-scaled movement. The "OR Instant: +1 Power" side is the universal
  // rule that any Spell can be discarded as a power source, so it needs no
  // dedicated option here. Reuses GAIN_HERO_MOVEMENT + moveThroughThisTurn,
  // the same engine path as the Angel Wings artifact.
  "spell.fly": {
    id: "spell.fly",
    name: "Fly",
    kind: "spell",
    timing: "map",
    spellLevel: "expert",
    spellSchools: ["air"],
    power: 0,
    tags: [
      "spell",
      "expert",
      "air",
      "Ongoing (map): During this turn, your Hero can move through blocked fields (but cannot end their movement there) and: Power 0: no additional effect; Power 2: +1 movement; Power 4: +2 movement. — OR — Instant: +1 Power."
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Move through blocked fields this turn",
          mapOnly: true,
          effect: { type: "GAIN_HERO_MOVEMENT", amount: 0, moveThroughThisTurn: true }
        },
        {
          label: "Move through blocked fields and +1 movement (pay 2 Power)",
          mapOnly: true,
          cost: { discardCards: 2, costCardFilter: "power-source" },
          effect: { type: "GAIN_HERO_MOVEMENT", amount: 1, moveThroughThisTurn: true }
        },
        {
          label: "Move through blocked fields and +2 movement (pay 4 Power)",
          mapOnly: true,
          cost: { discardCards: 4, costCardFilter: "power-source" },
          effect: { type: "GAIN_HERO_MOVEMENT", amount: 2, moveThroughThisTurn: true }
        }
      ]
    },
    assets: {
      cardImage: "/assets/spells-fly.webp",
      imageAlt: "Fly card"
    },
    implementationStatus: "implemented",
    source: spellSource("fly")
  },
  // Water Walk (Expert Water, map; Cove Expansion): this turn the hero may
  // enter, cross and stop on sea fields, and gains Power-scaled movement. As
  // with Fly, "OR Instant: +1 Power" is the universal power-source discard.
  "spell.water_walk": {
    id: "spell.water_walk",
    name: "Water Walk",
    kind: "spell",
    timing: "map",
    spellLevel: "expert",
    spellSchools: ["water"],
    power: 0,
    tags: [
      "spell",
      "expert",
      "water",
      "Map effect: Choose one of your Heroes. This turn they can cross and stop on sea fields and gain: Power 0: +0 movement; Power 1: +1 movement; Power 2: +2 movement. — OR — Instant: +1 Power."
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Walk on the sea this turn",
          mapOnly: true,
          effect: { type: "GAIN_HERO_MOVEMENT", amount: 0, waterWalkThisTurn: true }
        },
        {
          label: "Walk on the sea this turn and +1 movement (pay 1 Power)",
          mapOnly: true,
          cost: { discardCards: 1, costCardFilter: "power-source" },
          effect: { type: "GAIN_HERO_MOVEMENT", amount: 1, waterWalkThisTurn: true }
        },
        {
          label: "Walk on the sea this turn and +2 movement (pay 2 Power)",
          mapOnly: true,
          cost: { discardCards: 2, costCardFilter: "power-source" },
          effect: { type: "GAIN_HERO_MOVEMENT", amount: 2, waterWalkThisTurn: true }
        }
      ]
    },
    assets: {
      cardImage: "/assets/spells-water_walk.webp",
      imageAlt: "Water Walk card"
    },
    implementationStatus: "implemented",
    source: spellSource("water_walk")
  },
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
  // Forgetfulness (Basic Water, Activation; Rampart Expansion): the selected
  // enemy ranged unit cannot attack during its next activation (it may still
  // move). The reachable grade rises with the Power paid (0 → bronze, 1 →
  // silver, 2 → gold). Backed by a UNIT_CANNOT_ATTACK effect that lasts until
  // the end of that unit's next activation.
  "spell.forgetfulness": {
    id: "spell.forgetfulness",
    name: "Forgetfulness",
    kind: "spell",
    timing: "combat",
    phaseLimit: ["combat"],
    spellLevel: "basic",
    spellSchools: ["water"],
    power: 0,
    target: { type: "enemy-unit", unitTypes: ["ranged"] },
    tags: [
      "spell",
      "basic",
      "water",
      "Ongoing: During its next activation, a ranged unit of your choice cannot attack: Power 0: bronze; Power 1: bronze or silver; Power 2: bronze, silver, or gold."
    ],
    effect: {
      type: "FORGETFULNESS",
      gradeByPower: { 0: "bronze", 1: "silver", 2: "gold" }
    },
    assets: {
      cardImage: "/assets/spells-forgetfulness.webp",
      imageAlt: "Forgetfulness card"
    },
    implementationStatus: "implemented",
    source: spellSource("forgetfulness")
  },
  // Inferno (Expert Fire, Activation; Inferno Expansion): pick a space, roll the
  // Attack die N times (Power 0 → 1, 1 → 2, 2 → 4) and every unit on that space
  // and the orthogonally adjacent ones — friend or foe — takes 1 damage for
  // each "+1" rolled.
  "spell.inferno": {
    id: "spell.inferno",
    name: "Inferno",
    kind: "spell",
    timing: "combat",
    phaseLimit: ["combat"],
    spellLevel: "expert",
    spellSchools: ["fire"],
    power: 0,
    target: { type: "any-space" },
    tags: [
      "spell",
      "expert",
      "fire",
      "Activation: Select a space. Now roll an Attack die several times. All units on this and the adjacent spaces take 1 damage for every '+1' rolled: Power 0: once; Power 1: twice; Power 2: 4 times."
    ],
    effect: {
      type: "INFERNO",
      rollsByPower: { 0: 1, 1: 2, 2: 4 }
    },
    assets: {
      cardImage: "/assets/spells-inferno.webp",
      imageAlt: "Inferno card"
    },
    implementationStatus: "implemented",
    source: spellSource("inferno")
  },
  "spell.visions": {
    id: "spell.visions",
    name: "Visions",
    kind: "spell",
    // Played on the adventure map (it scrys the shared Neutral Unit decks); the
    // engine only offers Spells on the map when their timing is "map".
    timing: "map",
    spellLevel: "basic",
    spellSchools: ["fire"],
    tags: [
      "spell",
      "basic",
      "fire",
      "map",
      "Instant: Draw cards from any Neutral Unit deck. You can discard any of them and return the remaining cards in any order: Power 0: 1 card; Power 1: 2 cards; Power 2: 3 cards."
    ],
    power: 0,
    // Scry a Neutral Unit deck. There is no Hero Power statistic on the map, so
    // Power is paid the board-game way during the cast — discard other Spells
    // (their printed "+1 Power" side) for +1 card each, up to Power 2. The engine
    // offers that boost interactively (the "visions-boost" choice), so 0/1/2
    // discards scry 1/2/3 cards. Discarding Visions itself for +1 Power to a
    // *different* cast is the generic combat power-boost reaction, not this card.
    effect: { type: "VISIONS_SCRY", cardsByPower: { 0: 1, 1: 2, 2: 3 } },
    assets: {
      cardImage: "/assets/spells-visions.webp",
      imageAlt: "Visions card"
    },
    implementationStatus: "implemented",
    source: spellSource("visions")
  },
  // Implosion (Expert Earth, Activation): the heaviest single-target nuke — the
  // selected enemy takes flat spell damage that climbs with the Power paid
  // (Power 1 → 2, 3 → 4, 5 → 6). Power 0 has no printed tier, so the engine deals
  // 0 there (the explicit `0: 0` floors getAmountByPower, which would otherwise
  // round up to the lowest listed tier). Reuses the DEAL_DAMAGE path (spell
  // damage → spell immunity and damage-reduction abilities apply, like any bolt).
  "spell.implosion": {
    id: "spell.implosion",
    name: "Implosion",
    kind: "spell",
    timing: "combat",
    phaseLimit: ["combat"],
    spellLevel: "expert",
    spellSchools: ["earth"],
    power: 0,
    target: { type: "enemy-unit" },
    tags: [
      "spell",
      "expert",
      "earth",
      "Activation: The selected unit suffers: Power 1: 2 damage; Power 3: 4 damage; Power 5: 6 damage. — OR — Instant: +1 Power."
    ],
    effect: { type: "DEAL_DAMAGE", amountByPower: { 0: 0, 1: 2, 3: 4, 5: 6 }, damageKind: "spell" },
    assets: {
      cardImage: "/assets/spells-implosion.webp",
      imageAlt: "Implosion card"
    },
    implementationStatus: "implemented",
    source: spellSource("implosion")
  },
  // Dispel (Basic Water): strip every removable ongoing effect off a unit (friend
  // or foe). Modelled as a combat cast that targets a unit; the reachable grade
  // rises with the Power paid (0 → bronze, 1 → silver, 2 → gold), exactly like
  // Anti-Magic / Blind. The printed card also clears effects from the space the
  // unit stands on; the engine models no space-bound (obstacle) effects, so only
  // the unit's own effects are removed — see DISPEL_EFFECTS.
  "spell.dispel": {
    id: "spell.dispel",
    name: "Dispel",
    kind: "spell",
    timing: "combat",
    phaseLimit: ["combat"],
    spellLevel: "basic",
    spellSchools: ["water"],
    power: 0,
    target: { type: "any-unit" },
    tags: [
      "spell",
      "basic",
      "water",
      "Instant: Remove all ongoing effects from a unit. Power 0: bronze; Power 1: bronze or silver; Power 2: bronze, silver, or gold. — OR — Instant: +1 Power."
    ],
    effect: { type: "DISPEL_EFFECTS", gradeByPower: { 0: "bronze", 1: "silver", 2: "gold" } },
    assets: {
      cardImage: "/assets/spells-dispel.webp",
      imageAlt: "Dispel card"
    },
    implementationStatus: "implemented",
    source: spellSource("dispel")
  },
  // Frenzy (Expert Fire, Instant on your attack): the attack ignores the attacked
  // unit's Defense entirely. Cost-gated by the defender's grade (Power 0 → bronze,
  // 2 → silver, 4 → gold) — the same CHOOSE_ONE-with-discard pattern as
  // Resurrection. Each option triggers on your own unit's declared attack and
  // arms the engine's ignoreDefense path (shared with Elemental damage). The
  // universal "OR Instant: +1 Power" side is the generic power-source discard.
  "spell.frenzy": {
    id: "spell.frenzy",
    name: "Frenzy",
    kind: "spell",
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    spellLevel: "expert",
    spellSchools: ["fire"],
    power: 0,
    tags: [
      "spell",
      "expert",
      "fire",
      "Instant: This unit ignores the defense of the attacked unit. Power 0: bronze; Power 2: bronze or silver; Power 4: bronze, silver, or gold. — OR — Instant: +1 Power."
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Ignore a bronze unit's defense",
          trigger: { event: "UNIT_ATTACK_DECLARED", controller: "self" },
          effect: { type: "IGNORE_DEFENSE", grade: "bronze" }
        },
        {
          label: "Ignore a bronze or silver unit's defense (pay 2 Power)",
          cost: { discardCards: 2, costCardFilter: "power-source" },
          trigger: { event: "UNIT_ATTACK_DECLARED", controller: "self" },
          effect: { type: "IGNORE_DEFENSE", grade: "silver" }
        },
        {
          label: "Ignore a bronze, silver, or gold unit's defense (pay 4 Power)",
          cost: { discardCards: 4, costCardFilter: "power-source" },
          trigger: { event: "UNIT_ATTACK_DECLARED", controller: "self" },
          effect: { type: "IGNORE_DEFENSE", grade: "gold" }
        }
      ]
    },
    assets: {
      cardImage: "/assets/spells-frenzy.webp",
      imageAlt: "Frenzy card"
    },
    implementationStatus: "implemented",
    source: spellSource("frenzy")
  },
  // Shield (Basic Earth, Tower Expansion): an Ongoing buff cast on a friendly
  // unit during your activation — until the end of the Combat it gains Defense,
  // but only against a ground or flying attacker (a ranged unit's shot is
  // unaffected; that is Air Shield's job). Power 0/1/2 -> +1/+2/+3 Defense. The
  // conditional bonus is read in getAttackerTypeDefenseBonus during the attack
  // maths. The "OR Instant: +1 Power" side is the universal power-source discard.
  "spell.shield": {
    id: "spell.shield",
    name: "Shield",
    kind: "spell",
    timing: "combat",
    phaseLimit: ["combat"],
    spellLevel: "basic",
    spellSchools: ["earth"],
    tags: [
      "spell",
      "basic",
      "earth",
      "Ongoing: Until the end of the Combat, the selected unit gains, when it is attacked by a ground or flying unit: Power 0: +1 defense; Power 1: +2 defense; Power 2: +3 defense. — OR — Instant: +1 Power."
    ],
    power: 0,
    target: { type: "friendly-unit" },
    effect: {
      type: "CREATE_DEFENSE_BUFF",
      name: "Shield",
      amountByPower: { 0: 1, 1: 2, 2: 3 },
      duration: { type: "combat" },
      polarity: "positive",
      removable: true,
      vsAttackerType: "ground-or-flying"
    },
    assets: {
      cardImage: "/assets/spells-shield.webp",
      imageAlt: "Shield card"
    },
    implementationStatus: "implemented",
    source: spellSource("shield")
  },
  // Air Shield (Basic Air): Shield's counterpart — until the end of the Combat
  // the selected unit gains Defense only against a ranged attacker. Power 0/1/2
  // -> +1/+2/+3 Defense. Same conditional-defense machinery as Shield, keyed on
  // the attacker being a ranged unit.
  "spell.air_shield": {
    id: "spell.air_shield",
    name: "Air Shield",
    kind: "spell",
    timing: "combat",
    phaseLimit: ["combat"],
    spellLevel: "basic",
    spellSchools: ["air"],
    tags: [
      "spell",
      "basic",
      "air",
      "Ongoing: Until the end of the Combat, the selected unit gains, when it is attacked by a ranged unit: Power 0: +1 defense; Power 1: +2 defense; Power 2: +3 defense. — OR — Instant: +1 Power."
    ],
    power: 0,
    target: { type: "friendly-unit" },
    effect: {
      type: "CREATE_DEFENSE_BUFF",
      name: "Air Shield",
      amountByPower: { 0: 1, 1: 2, 2: 3 },
      duration: { type: "combat" },
      polarity: "positive",
      removable: true,
      vsAttackerType: "ranged"
    },
    assets: {
      cardImage: "/assets/spells-air_shield.webp",
      imageAlt: "Air Shield card"
    },
    implementationStatus: "implemented",
    source: spellSource("air_shield")
  },
  // Protection from Air/Earth/Fire/Water (Basic, one per School): Resistance for
  // a single School. Played as an instant when the opponent casts a Spell of that
  // School, it ends that Spell (reuses the CANCEL_SPELL machinery — the pending
  // cast is cancelled, or a matching enemy Spell instant on an attack is
  // reversed). The card's two printed tiers ("Power 0 / Power 1") are the engine's
  // basic / expert play: basic ends a Basic Spell of the School; the expert play
  // (spending a crown, like every other expert play) ends a Basic OR Expert
  // Spell. A School-agnostic Spell (Magic Arrow) counts as belonging to every
  // School, so any Protection can end it. The "OR Instant: +1 Power" side is the
  // universal power-source discard.
  "spell.protection_from_air": {
    id: "spell.protection_from_air",
    name: "Protection from Air",
    kind: "spell",
    timing: "reaction",
    phaseLimit: ["reaction", "combat"],
    spellLevel: "basic",
    spellSchools: ["air"],
    tags: [
      "spell",
      "basic",
      "air",
      "Instant: Play after a Spell from the School of Air Magic is cast to ignore that spell's effect. Basic: a Basic Spell; Expert: a Basic or an Expert Spell. — OR — Instant: +1 Power."
    ],
    power: 0,
    trigger: { event: "SPELL_CAST_STARTED", controller: "opponent" },
    effect: {
      type: "CANCEL_SPELL",
      schools: ["air"],
      maxSpellLevel: "basic",
      expertIgnoresMaxSpellLevel: true
    },
    assets: {
      cardImage: "/assets/spells-protection_from_air.webp",
      imageAlt: "Protection from Air card"
    },
    implementationStatus: "implemented",
    source: spellSource("protection_from_air")
  },
  "spell.protection_from_earth": {
    id: "spell.protection_from_earth",
    name: "Protection from Earth",
    kind: "spell",
    timing: "reaction",
    phaseLimit: ["reaction", "combat"],
    spellLevel: "basic",
    spellSchools: ["earth"],
    tags: [
      "spell",
      "basic",
      "earth",
      "Instant: Play after a Spell from the School of Earth Magic is cast to ignore that spell's effect. Basic: a Basic Spell; Expert: a Basic or an Expert Spell. — OR — Instant: +1 Power."
    ],
    power: 0,
    trigger: { event: "SPELL_CAST_STARTED", controller: "opponent" },
    effect: {
      type: "CANCEL_SPELL",
      schools: ["earth"],
      maxSpellLevel: "basic",
      expertIgnoresMaxSpellLevel: true
    },
    assets: {
      cardImage: "/assets/spells-protection_from_earth.webp",
      imageAlt: "Protection from Earth card"
    },
    implementationStatus: "implemented",
    source: spellSource("protection_from_earth")
  },
  "spell.protection_from_fire": {
    id: "spell.protection_from_fire",
    name: "Protection from Fire",
    kind: "spell",
    timing: "reaction",
    phaseLimit: ["reaction", "combat"],
    spellLevel: "basic",
    spellSchools: ["fire"],
    tags: [
      "spell",
      "basic",
      "fire",
      "Instant: Play after a Spell from the School of Fire Magic is cast to ignore that spell's effect. Basic: a Basic Spell; Expert: a Basic or an Expert Spell. — OR — Instant: +1 Power."
    ],
    power: 0,
    trigger: { event: "SPELL_CAST_STARTED", controller: "opponent" },
    effect: {
      type: "CANCEL_SPELL",
      schools: ["fire"],
      maxSpellLevel: "basic",
      expertIgnoresMaxSpellLevel: true
    },
    assets: {
      cardImage: "/assets/spells-protection_from_fire.webp",
      imageAlt: "Protection from Fire card"
    },
    implementationStatus: "implemented",
    source: spellSource("protection_from_fire")
  },
  "spell.protection_from_water": {
    id: "spell.protection_from_water",
    name: "Protection from Water",
    kind: "spell",
    timing: "reaction",
    phaseLimit: ["reaction", "combat"],
    spellLevel: "basic",
    spellSchools: ["water"],
    tags: [
      "spell",
      "basic",
      "water",
      "Instant: Play after a Spell from the School of Water Magic is cast to ignore that spell's effect. Basic: a Basic Spell; Expert: a Basic or an Expert Spell. — OR — Instant: +1 Power."
    ],
    power: 0,
    trigger: { event: "SPELL_CAST_STARTED", controller: "opponent" },
    effect: {
      type: "CANCEL_SPELL",
      schools: ["water"],
      maxSpellLevel: "basic",
      expertIgnoresMaxSpellLevel: true
    },
    assets: {
      cardImage: "/assets/spells-protection_from_water.webp",
      imageAlt: "Protection from Water card"
    },
    implementationStatus: "implemented",
    source: spellSource("protection_from_water")
  }
};

/**
 * Single mixed deck (legacy mode): the Core+Rampart+Inferno implemented spells,
 * plus the map-movement Expert spells (Dimension Door, Fly, Water Walk) now that
 * they are wired into the engine.
 */
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
  "spell.fortune",
  "spell.fortune",
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
  "spell.blind",
  "spell.chain_lightning",
  "spell.summon_air_elemental",
  "spell.summon_earth_elemental",
  "spell.summon_fire_elemental",
  "spell.summon_water_elemental",
  "spell.dimension_door",
  "spell.fly",
  "spell.water_walk",
  // Rampart Expansion spells.
  "spell.mirth",
  "spell.sorrow",
  "spell.slayer",
  "spell.forgetfulness",
  // Inferno Expansion spell.
  "spell.inferno",
  "spell.visions",
  // Additional wiki spells.
  "spell.implosion",
  "spell.dispel",
  "spell.frenzy",
  // Tower Expansion / Stretch Goal defensive spells (all Basic).
  "spell.shield",
  "spell.air_shield",
  "spell.protection_from_air",
  "spell.protection_from_earth",
  "spell.protection_from_fire",
  "spell.protection_from_water"
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
  "spell.blind",
  "spell.earthquake",
  "spell.forgetfulness",
  "spell.visions",
  // Dispel — Basic Water.
  "spell.dispel",
  // Tower Expansion / Stretch Goal defensive spells (all Basic).
  "spell.shield",
  "spell.air_shield",
  "spell.protection_from_air",
  "spell.protection_from_earth",
  "spell.protection_from_fire",
  "spell.protection_from_water"
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
  "spell.chain_lightning",
  "spell.summon_air_elemental",
  "spell.summon_earth_elemental",
  "spell.summon_fire_elemental",
  "spell.summon_water_elemental",
  "spell.dimension_door",
  "spell.fly",
  "spell.water_walk",
  // Rampart + Inferno expansion spells (expert tier, per each card's spellLevel).
  "spell.mirth",
  "spell.sorrow",
  "spell.slayer",
  "spell.inferno",
  // Implosion & Frenzy — Expert (Earth / Fire).
  "spell.implosion",
  "spell.frenzy"
];
