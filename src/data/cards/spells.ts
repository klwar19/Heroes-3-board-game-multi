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

/**
 * Spells the fan wiki (en.homm3bg.wiki, this project's art source) has NO card
 * card face for: its own spell page shows the generic deck-back placeholder
 * (assets/player-deck-back.webp) instead of artwork, so there is nothing to
 * download and no authentic scan to commit. These route to the same deck-back
 * here — exactly as the wiki renders them — rather than naming a
 * /assets/spells-<slug>.webp file that does not exist (which would 404 on every
 * render and fall back through an <img> onError). This is the spell counterpart
 * of SCANLESS_ARTIFACTS in ./artifacts. When an authentic scan or an approved
 * original replacement is added, remove the slug here. Authentic scans can be
 * downloaded with scripts/fetch-missing-spell-card-art.py. Enforced in
 * src/data/cards/spell-card-art.test.ts.
 */
// Empty: every spell that ships now has a committed card face (Sacrifice got a
// board-game scan translation in assets-to-translate/new art).
export const SCANLESS_SPELLS: ReadonlySet<string> = new Set<string>([]);

/** Deck-back placeholder shared by every scanless card. */
const DECK_BACK_IMAGE = "/assets/player-deck-back.webp";

export const spellCards: CardLibrary = {
  "spell.cast_a_spell": {
    id: "spell.cast_a_spell",
    name: "Cast a Spell",
    // Physically a Spell/M&M card so its printed alternative "+1 Power" works
    // through the engine's universal Spell-as-power-source path. It is excluded
    // from every actual Spell acquisition/cast list by polish-spell-book.ts.
    kind: "spell",
    timing: "instant",
    spellLevel: "basic",
    spellSchools: [],
    tags: ["spell", "polish", "Cast one refreshed Spell from your Spell Book. — OR — Instant: +1 Power."],
    power: 0,
    target: { type: "none" },
    effect: { type: "CAST_FROM_SPELL_BOOK" },
    assets: {
      cardImage: "/assets/spells-cast_a_spell.webp",
      imageAlt: "Cast a Spell card"
    },
    implementationStatus: "implemented",
    source: {
      product: "Polish tournament house rules v1.2",
      credit: "User-supplied Cast a Spell card art; Archon Studio / Ubisoft component frame."
    }
  },
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
      removable: true,
      // House rule (BINH): Haste also gives +1 Combat movement (3 → 4).
      movementBonus: 1
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
      removable: true,
      // House rule (BINH): Slow also reduces Combat movement by 1 (3 → 2).
      movementBonus: -1
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
          // engine: the trigger-free "+initiative" arm. Unlike the +attack/
          // +defense arms (one-attack reaction riders), this is a whole-Combat
          // ongoing Initiative buff on a friendly unit (the same CREATE_INITIATIVE_
          // BUFF shape as Haste / Ring of the Wayfarer), so it carries its own
          // friendly-unit target rather than borrowing a reaction window's. It is
          // cast as a real Spell — offered on your own turn AND off-turn as an
          // instant before an enemy unit starts moving (addChooseOneSpellInstant-
          // Casts → CAST_SPELL with optionIndex) — and resolved in the spell-cast
          // dispatch (resolveTopStack), power-scaled like the other two arms. An
          // off-turn cast that lifts your unit's Initiative past the enemy unit
          // about to act lets it steal the activation (maybeStealActivationAfter-
          // InitiativeShift). Covered by prayer-spell.test.ts.
          label: "+X initiative",
          target: { type: "friendly-unit" },
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
          cost: { powerCost: 2, costCardFilter: "power-source" },
          effect: { type: "TELEPORT_HERO_TO_TOWN", movementBonus: 1 }
        },
        {
          label: "Teleport and +2 movement (pay 4 Power)",
          mapOnly: true,
          cost: { powerCost: 4, costCardFilter: "power-source" },
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
      "Activation: On a chosen empty space. Power 0: No effect; Power 2: Summon a Few Air Elementals; Power 4: Summon a Pack of Air Elementals."
    ],
    power: 0,
    target: { type: "empty-space" },
    effect: { type: "SUMMON_ELEMENTAL", unitDefId: "neutral.air_elementals" },
    assets: {
      // Original card face built from the Expert Air frame and new elemental art.
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
      "Activation: On a chosen empty space. Power 0: No effect; Power 2: Summon a Few Earth Elementals; Power 4: Summon a Pack of Earth Elementals."
    ],
    power: 0,
    target: { type: "empty-space" },
    effect: { type: "SUMMON_ELEMENTAL", unitDefId: "neutral.earth_elementals" },
    assets: {
      // Original card face built from the Expert Earth frame and new elemental art.
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
      "Activation: On a chosen empty space. Power 0: No effect; Power 2: Summon a Few Fire Elementals; Power 4: Summon a Pack of Fire Elementals."
    ],
    power: 0,
    target: { type: "empty-space" },
    effect: { type: "SUMMON_ELEMENTAL", unitDefId: "neutral.fire_elementals" },
    assets: {
      // Original card face built from the Expert Fire frame and new elemental art.
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
      "Activation: On a chosen empty space. Power 0: No effect; Power 2: Summon a Few Water Elementals; Power 4: Summon a Pack of Water Elementals."
    ],
    power: 0,
    target: { type: "empty-space" },
    effect: { type: "SUMMON_ELEMENTAL", unitDefId: "neutral.water_elementals" },
    assets: {
      // Original card face built from the Expert Water frame and new elemental art.
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
  // Magic Mirror is an instant reaction when one of your units is about to be
  // TARGETED or DAMAGED by an enemy Spell: choose a new target, gated by the
  // Power paid (0 → bronze, 1 → silver, 2 → gold — one option per grade, like
  // Resurrection), picked in a follow-up choice. The engine fires it in three
  // situations (see getMagicMirrorReactions / the REDIRECT_SPELL handlers):
  //  - a single-target cast aimed at your unit (Magic Arrow, Implosion, …) — the
  //    Spell re-points and resolves against the chosen unit;
  //  - an AREA cast that would damage your unit (Fireball's splash, Inferno's
  //    blast, Frost Ring's ring) even when its primary target is an enemy unit or
  //    a bare space — the blast recenters on the chosen unit (a space-centred
  //    blast → that unit's space). Hero SPECIALTY damage (Xyron's Inferno, Deemer's
  //    Meteor Shower, Solmyr's Chain Lightning) is not a Spell cast and is NOT
  //    reflectable; nor are Chain Lightning's resolution-time forks;
  //  - an instant combat debuff layered onto an attack (Curse on your defender,
  //    Weakness on your attacker) — it is lifted off your unit and re-pointed at
  //    the chosen unit for THIS attack and its retaliation only. It stays an
  //    instant (a one-shot stat delta on the attack, never an ongoing effect or
  //    token), so nothing can Dispel or ignore it — only spell-immunity stops it,
  //    enforced by excluding spell-immune units as redirect targets. Enemy
  //    self-buffs (Bloodlust/Bless/Precision target the caster's OWN unit) never
  //    fire it. Casting Magic Mirror counts as your Spell for the combat round
  //    (Expert Knowledge / Intelligence raise or waive that limit).
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
      // Original card face (scripts/build-missing-spell-cards.mjs) — the wiki
      // shows only the deck back for this spell.
      cardImage: "/assets/spells-magic_mirror.webp",
      imageAlt: "Magic Mirror card"
    },
    implementationStatus: "implemented",
    source: spellSource("magic_mirror")
  },
  // Teleport (Expert Water, Activation): move one of your units to any empty
  // space, ignoring obstacles, other units and the distance in-between. The
  // reachable grade of the moved unit rises with the Power paid (0 → bronze,
  // 1 → silver, 2 → gold), the same gate as Anti-Magic / Blind. The destination
  // empty space is picked in a follow-up choice (engine: TELEPORT_UNIT opens the
  // combat-teleport choice). The relocation costs no movement and draws no
  // Retaliation.
  "spell.teleport": {
    id: "spell.teleport",
    name: "Teleport",
    kind: "spell",
    timing: "combat",
    phaseLimit: ["combat"],
    spellLevel: "expert",
    spellSchools: ["water"],
    power: 0,
    target: { type: "friendly-unit" },
    tags: [
      "spell",
      "expert",
      "water",
      "Activation: During Combat, move one allied unit to any empty space - ignore any obstacles or effects when moving: Power 0: bronze; Power 1: bronze or silver; Power 2: bronze, silver, or gold."
    ],
    effect: {
      type: "TELEPORT_UNIT",
      gradeByPower: { 0: "bronze", 1: "silver", 2: "gold" }
    },
    assets: {
      cardImage: "/assets/spells-teleport.webp",
      imageAlt: "Teleport card"
    },
    implementationStatus: "implemented",
    source: spellSource("teleport")
  },
  // Clone (Expert Water, Cove Expansion): place a 1-Health copy of one of your
  // units on an adjacent empty space. The Clone copies everything PRINTED on the
  // original's card (statistics, type, printed abilities) but NONE of the ongoing
  // effects or tokens layered on the original. It is destroyed the instant it
  // takes any damage, the instant it is attacked (even for 0 damage), and the
  // instant its original leaves the board (engine: CLONE_UNIT → openCloneChoice /
  // placeCloneUnit, the attack-hook in applyAttackDamageFromCandidate, and
  // removeLinkedClones in combat-units). The reachable grade of the cloned unit
  // rises with the Power paid (1 → bronze, 3 → silver, 5 → gold), the Implosion
  // tier ladder; below Power 1 nothing is cloned. The adjacent empty space is
  // picked in a follow-up choice. The "OR Instant: +1 Power" side is the
  // universal power-source discard, so it needs no dedicated option.
  "spell.clone": {
    id: "spell.clone",
    name: "Clone",
    kind: "spell",
    timing: "combat",
    phaseLimit: ["combat"],
    spellLevel: "expert",
    spellSchools: ["water"],
    power: 0,
    target: { type: "friendly-unit" },
    tags: [
      "spell",
      "expert",
      "water",
      "clone",
      "Activation: Place a copy of one of your units on an adjacent empty space. The Clone copies the unit's printed card but has only 1 Health and is destroyed by any damage, by being attacked, or if the original leaves the board: Power 1: bronze; Power 3: bronze or silver; Power 5: bronze, silver, or gold. — OR — Instant: +1 Power."
    ],
    effect: {
      type: "CLONE_UNIT",
      gradeByPower: { 1: "bronze", 3: "silver", 5: "gold" }
    },
    assets: {
      cardImage: "/assets/spells-clone.webp",
      imageAlt: "Clone card"
    },
    implementationStatus: "implemented",
    source: spellSource("clone")
  },
  // Berserk (Expert Fire, Activation): the selected unit must, on its next
  // activation, attack the nearest unit or move to the nearest unit and attack
  // it — friend or foe, so a berserked enemy can be forced onto its own allies
  // (who retaliate as normal). "Select a unit" targets any unit (an Anti-Magic /
  // school-immune unit is filtered out by the cast-target layer); the reachable
  // grade rises with the Power paid (0 → bronze, 2 → silver, 4 → gold), the Blind
  // gate. Engine: BERSERK places a BERSERK_FORCED_ATTACK effect that the
  // legal-action layer and neutral AI read to force the attack-the-nearest rule.
  "spell.berserk": {
    id: "spell.berserk",
    name: "Berserk",
    kind: "spell",
    timing: "combat",
    phaseLimit: ["combat"],
    spellLevel: "expert",
    spellSchools: ["fire"],
    power: 0,
    target: { type: "any-unit" },
    tags: [
      "spell",
      "expert",
      "fire",
      "Activation: Select a unit. In its activation, this unit must either attack the nearest unit or move to the nearest unit and attack it: Power 0: bronze; Power 2: bronze or silver; Power 4: bronze, silver, or gold. — OR — Instant: +1 Power."
    ],
    effect: {
      type: "BERSERK",
      gradeByPower: { 0: "bronze", 2: "silver", 4: "gold" }
    },
    assets: {
      cardImage: "/assets/spells-berserk.webp",
      imageAlt: "Berserk card"
    },
    implementationStatus: "implemented",
    source: spellSource("berserk")
  },
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
          cost: { powerCost: 2, costCardFilter: "power-source" },
          trigger: { event: "UNIT_ACTIVATION_STARTED", controller: "opponent" },
          effect: { type: "SKIP_ACTIVATION", grade: "silver" }
        },
        {
          label: "Skip a gold unit (pay 4 Power)",
          cost: { powerCost: 4, costCardFilter: "power-source" },
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
          cost: { powerCost: 2, costCardFilter: "power-source" },
          effect: { type: "DIMENSION_DOOR", fields: 2 }
        },
        {
          label: "Move up to 3 fields (pay 4 Power)",
          mapOnly: true,
          cost: { powerCost: 4, costCardFilter: "power-source" },
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
          cost: { powerCost: 2, costCardFilter: "power-source" },
          effect: { type: "GAIN_HERO_MOVEMENT", amount: 1, moveThroughThisTurn: true }
        },
        {
          label: "Move through blocked fields and +2 movement (pay 4 Power)",
          mapOnly: true,
          cost: { powerCost: 4, costCardFilter: "power-source" },
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
          cost: { powerCost: 1, costCardFilter: "power-source" },
          effect: { type: "GAIN_HERO_MOVEMENT", amount: 1, waterWalkThisTurn: true }
        },
        {
          label: "Walk on the sea this turn and +2 movement (pay 2 Power)",
          mapOnly: true,
          cost: { powerCost: 2, costCardFilter: "power-source" },
          effect: { type: "GAIN_HERO_MOVEMENT", amount: 2, waterWalkThisTurn: true }
        }
      ]
    },
    assets: {
      // Original card face (scripts/build-missing-spell-cards.mjs) — the wiki
      // shows only the deck back for this spell.
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
  // Frost Ring (Expert Water, Activation): select a space (occupied or empty);
  // the units ADJACENT to it — not the centre — suffer the power-scaled damage,
  // friend or foe. Up to two are hit; when more than two are adjacent the caster
  // picks which (the AREA_DAMAGE_PICK_ADJACENT machinery, includeCenter: false).
  // The "OR Instant: +1 Power" side is the universal power-source discard.
  "spell.frost_ring": {
    id: "spell.frost_ring",
    name: "Frost Ring",
    kind: "spell",
    timing: "combat",
    phaseLimit: ["combat"],
    spellLevel: "expert",
    spellSchools: ["water"],
    power: 0,
    target: { type: "any-space" },
    tags: [
      "spell",
      "expert",
      "water",
      "area",
      "Activation: Select a space. The 2 units adjacent to this space (not the space itself) suffer, friend or foe: Power 0: 1 damage; Power 2: 2 damage; Power 4: 3 damage. — OR — Instant: +1 Power."
    ],
    effect: {
      type: "AREA_DAMAGE_PICK_ADJACENT",
      amountByPower: { 0: 1, 2: 2, 4: 3 },
      includeCenter: false,
      adjacentPicks: 2
    },
    assets: {
      cardImage: "/assets/spells-frost_ring.webp",
      imageAlt: "Frost Ring card"
    },
    implementationStatus: "implemented",
    source: spellSource("frost_ring")
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
  // View Air (Basic Air, Map; Tower Expansion): a pure economy spell — pick a
  // resource tier and gain it. There is no Hero Power statistic on the map, so
  // the higher tiers are paid the board-game way (discard power-source cards via
  // each option's cost): Power 0 -> 3 gold (free), Power 1 -> 2 Building
  // Materials (discard 1 Spell/Power), Power 2 -> 1 Valuables (discard 2). The
  // universal "OR Instant: +1 Power" side is the generic power-source discard
  // (any Spell), so it needs no dedicated option. Reuses the already-wired
  // GAIN_RESOURCES map effect; no new engine code beyond this definition.
  "spell.view_air": {
    id: "spell.view_air",
    name: "View Air",
    kind: "spell",
    timing: "map",
    spellLevel: "basic",
    spellSchools: ["air"],
    power: 0,
    tags: [
      "spell",
      "basic",
      "air",
      "map",
      "Map effect: Gain — Power 0: 3 gold; Power 1: 2 Building Materials; Power 2: 1 Valuables. — OR — Instant: +1 Power."
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Gain 3 gold",
          mapOnly: true,
          effect: { type: "GAIN_RESOURCES", gain: { gold: 3 } }
        },
        {
          label: "Gain 2 Building Materials (pay 1 Power)",
          mapOnly: true,
          cost: { powerCost: 1, costCardFilter: "power-source" },
          effect: { type: "GAIN_RESOURCES", gain: { buildingMaterials: 2 } }
        },
        {
          label: "Gain 1 Valuables (pay 2 Power)",
          mapOnly: true,
          cost: { powerCost: 2, costCardFilter: "power-source" },
          effect: { type: "GAIN_RESOURCES", gain: { valuables: 1 } }
        }
      ]
    },
    assets: {
      cardImage: "/assets/spells-view_air.webp",
      imageAlt: "View Air card"
    },
    implementationStatus: "implemented",
    source: spellSource("view_air")
  },
  // View Earth (Basic Earth, Map; Fortress Expansion): "Choose enemy Mine within
  // X fields. Replace the owner's cube with yours." Played on the adventure map
  // (the wiki shows the Instant icon, but the effect acts on map Mines, so like
  // Visions it is a Map-timed cast). The reach scales with the Power paid (Power
  // 0/1/2 -> within 1/2/3 fields), paid by discarding power-source cards via each
  // option's cost. The chosen Mine's Faction cube and ongoing production transfer
  // to the caster (no first-flag income — the Mine was already flagged). The
  // universal "OR Instant: +1 Power" side is the generic power-source discard, so
  // it needs no dedicated option. Resolved via the "view-earth" pending choice
  // (VIEW_EARTH effect -> openViewEarthChoice -> applyMineFlag).
  "spell.view_earth": {
    id: "spell.view_earth",
    name: "View Earth",
    kind: "spell",
    timing: "map",
    spellLevel: "basic",
    spellSchools: ["earth"],
    power: 0,
    tags: [
      "spell",
      "basic",
      "earth",
      "map",
      "Map effect: Choose an enemy Mine within X fields and replace the owner's cube with yours: Power 0: 1; Power 1: 2; Power 2: 3. — OR — Instant: +1 Power."
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Capture an enemy Mine within 1 field",
          mapOnly: true,
          effect: { type: "VIEW_EARTH", withinFields: 1 }
        },
        {
          label: "Capture an enemy Mine within 2 fields (pay 1 Power)",
          mapOnly: true,
          cost: { powerCost: 1, costCardFilter: "power-source" },
          effect: { type: "VIEW_EARTH", withinFields: 2 }
        },
        {
          label: "Capture an enemy Mine within 3 fields (pay 2 Power)",
          mapOnly: true,
          cost: { powerCost: 2, costCardFilter: "power-source" },
          effect: { type: "VIEW_EARTH", withinFields: 3 }
        }
      ]
    },
    assets: {
      cardImage: "/assets/spells-view_earth.webp",
      imageAlt: "View Earth card"
    },
    implementationStatus: "implemented",
    source: spellSource("view_earth")
  },
  // Implosion (Expert Earth, Activation): the heaviest single-target nuke — the
  // selected enemy takes flat spell damage that climbs with the Power paid
  // (Power 1 → 2, 3 → 4, 5 → 6). Power 0 has no printed tier, so the engine deals
  // 0 there (the explicit `0: 0` floors getAmountByPower, which would otherwise
  // round up to the lowest listed tier). Reuses the DEAL_DAMAGE path (spell
  // damage → spell immunity and damage-reduction abilities apply, like any bolt).
  // Implosion (Expert Earth). Wiki: ladder starts at Power 1 (no Power-0 tier)
  // and a printed note "at least one spell power needs to also be played" —
  // so amountByPower seeds 0:0 (deals nothing unless Power ≥ 1 is paid into the
  // cast window). The "OR Instant: +1 Power" side is the universal power-source
  // discard (any Spell can be discarded for +1 Power), not a separate option.
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
      "Activation: The selected unit suffers: Power 1: 2 damage; Power 3: 4 damage; Power 5: 6 damage (needs at least Power 1). — OR — Instant: +1 Power."
    ],
    effect: { type: "DEAL_DAMAGE", amountByPower: { 0: 0, 1: 2, 3: 4, 5: 6 }, damageKind: "spell" },
    assets: {
      cardImage: "/assets/spells-implosion.webp",
      imageAlt: "Implosion card"
    },
    implementationStatus: "implemented",
    source: spellSource("implosion")
  },
  // Dispel (Basic Water): "Remove all ongoing effects from a space or a unit and
  // the space it occupies." Targets either a unit (friend or foe) or a board
  // space holding an obstacle/trap token. On a unit it strips that unit's
  // removable ongoing effects AND clears any obstacle (Fire Wall / Force Field /
  // sprung-able trap) on the space it stands on; on a bare space it clears that
  // space's obstacle tokens. The reachable UNIT grade rises with the Power paid
  // (0 → bronze, 1 → silver, 2 → gold), like Anti-Magic / Blind; obstacle tokens
  // carry no grade, so a space-targeted Dispel removes them at any Power. See
  // DISPEL_EFFECTS in the reducer. Per the verbatim wiki card Dispel is an
  // INSTANT (instant speed — castable off-turn / between actions, not only during
  // your own unit's activation), so timing is "instant", matching Stone Skin /
  // Counterstrike rather than an Activation cast.
  "spell.dispel": {
    id: "spell.dispel",
    name: "Dispel",
    kind: "spell",
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    spellLevel: "basic",
    spellSchools: ["water"],
    power: 0,
    target: { type: "unit-or-obstacle" },
    tags: [
      "spell",
      "basic",
      "water",
      "Instant: Remove all ongoing effects from a space, or a unit and the space it occupies. Power 0: bronze; Power 1: bronze or silver; Power 2: bronze, silver, or gold. — OR — Instant: +1 Power."
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
    // Pierced grade scales with the Power pooled into the attack (statistics,
    // +1 discards, standing School/Astrologers/Magi Power), re-derived at
    // resolution like Slayer — so Power paid after Frenzy keeps lifting it.
    trigger: { event: "UNIT_ATTACK_DECLARED", controller: "self" },
    effect: {
      type: "IGNORE_DEFENSE",
      gradeByPower: { 0: "bronze", 2: "silver", 4: "gold" }
    },
    assets: {
      cardImage: "/assets/spells-frenzy.webp",
      imageAlt: "Frenzy card"
    },
    implementationStatus: "implemented",
    source: spellSource("frenzy")
  },
  // Shield (Basic Earth, Tower Expansion) — per the verbatim wiki card this is an
  // INSTANT, not an Ongoing buff: "The defending unit gains +1/+2/+3 defense
  // against a ground or flying unit." (No "until the end of the Combat" — the
  // earlier Ongoing/CREATE_DEFENSE_BUFF wiring, and the "Ongoing: Until the end of
  // the Combat" card text, were a transcription error.) So Shield is the
  // melee/flying counterpart of Stone Skin: played in REACTION to one of your
  // units being attacked, raising its Defense for THAT attack only, and ONLY when
  // the attacker is a ground or flying unit (a ranged shot is unaffected — standing
  // protection vs ranged is Air Shield's separate Ongoing job). Power 0/1/2 ->
  // +1/+2/+3, scaling with the Power pooled into the attack window like every other
  // instant stat buff. The attacker-type gate lives in the reaction offer
  // (`vsAttackerType` in getLegalReactionsForTrigger). The "OR Instant: +1 Power"
  // side is the universal power-source discard.
  "spell.shield": {
    id: "spell.shield",
    name: "Shield",
    kind: "spell",
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    spellLevel: "basic",
    spellSchools: ["earth"],
    tags: [
      "spell",
      "basic",
      "earth",
      "Instant: The defending unit gains, when it is attacked by a ground or flying unit: Power 0: +1 defense; Power 1: +2 defense; Power 2: +3 defense. — OR — Instant: +1 Power."
    ],
    power: 0,
    // Played when one of your units is attacked (the defender is the "selected
    // unit", like Stone Skin); gated to ground/flying attackers by vsAttackerType.
    trigger: {
      event: "UNIT_ATTACK_DECLARED",
      controller: "opponent"
    },
    effect: {
      type: "ADD_COMBAT_STAT",
      stat: "defense",
      amount: 1,
      amountByPower: { 0: 1, 1: 2, 2: 3 },
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
      // Original card face (scripts/build-missing-spell-cards.mjs) — the wiki
      // shows only the deck back for this spell.
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
      // Original card face (scripts/build-missing-spell-cards.mjs) — the wiki
      // shows only the deck back for this spell.
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
      // Original card face (scripts/build-missing-spell-cards.mjs) — the wiki
      // shows only the deck back for this spell.
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
      // Original card face (scripts/build-missing-spell-cards.mjs) — the wiki
      // shows only the deck back for this spell.
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
      // Original card face (scripts/build-missing-spell-cards.mjs) — the wiki
      // shows only the deck back for this spell.
      cardImage: "/assets/spells-protection_from_water.webp",
      imageAlt: "Protection from Water card"
    },
    implementationStatus: "implemented",
    source: spellSource("protection_from_water")
  },
  // Disrupting Ray (Basic Air, Ongoing): until the end of the Combat the
  // selected enemy unit cannot use its special ability. Grade-gated like Blind
  // (0 → bronze, 1 → silver, 2 → gold). Engine: a combat-scoped
  // UNIT_ABILITY_SUPPRESSED effect makes getUnitAbilityDefinitions return [] for
  // the unit, so every ability it has now OR gains later is switched off until
  // the Combat ends. As a single-target unit cast it is reflectable by Magic
  // Mirror onto a new target (handled by the shared cast-redirect path). The
  // "OR Instant: +1 Power" side is the universal power-source discard.
  "spell.disrupting_ray": {
    id: "spell.disrupting_ray",
    name: "Disrupting Ray",
    kind: "spell",
    timing: "combat",
    phaseLimit: ["combat"],
    spellLevel: "basic",
    spellSchools: ["air"],
    power: 0,
    target: { type: "enemy-unit" },
    tags: [
      "spell",
      "basic",
      "air",
      "Ongoing: Until the end of the Combat, the selected unit cannot use their special ability: Power 0: bronze; Power 1: bronze or silver; Power 2: bronze, silver, or golden. — OR — Instant: +1 Power."
    ],
    effect: {
      type: "DISRUPTING_RAY",
      gradeByPower: { 0: "bronze", 1: "silver", 2: "gold" }
    },
    assets: {
      cardImage: "/assets/spells-disrupting_ray.webp",
      imageAlt: "Disrupting Ray card"
    },
    implementationStatus: "implemented",
    source: spellSource("disrupting_ray")
  },
  // Sacrifice (Expert Fire, Activation): choose 1 of your damaged units and
  // transfer its wounds onto another of your units, which perishes. Engine: the
  // cast targets the heal unit (grade-gated 0/2/4 → bronze/silver/gold; targets
  // only a damaged friendly unit, since there must be damage to move); a
  // follow-up choice picks the sacrifice, then min(heal's damage, sacrifice's
  // remaining HP) is moved — the heal unit loses that much damage and the
  // sacrifice takes it, perishing (a Pack flips to Few) when it reaches its
  // remaining HP. The "OR Instant: +1 Power" side is the universal discard.
  "spell.sacrifice": {
    id: "spell.sacrifice",
    name: "Sacrifice",
    kind: "spell",
    timing: "combat",
    phaseLimit: ["combat"],
    spellLevel: "expert",
    spellSchools: ["fire"],
    power: 0,
    target: { type: "friendly-unit", damagedOnly: true },
    tags: [
      "spell",
      "expert",
      "fire",
      "Activation: Choose 1 of your units. You can transfer up to as much damage from this unit to another one in your army, as much is needed for the other unit to perish: Power 0: bronze; Power 2: bronze or silver; Power 4: bronze, silver, or golden. — OR — Instant: +1 Power."
    ],
    effect: {
      type: "SACRIFICE_TRANSFER",
      gradeByPower: { 0: "bronze", 2: "silver", 4: "gold" }
    },
    assets: {
      cardImage: "/assets/spells-sacrifice.webp",
      imageAlt: "Sacrifice card"
    },
    implementationStatus: "implemented",
    source: spellSource("sacrifice")
  },
  // Force Field (Basic Earth, Stretch Goals 2 Expansion): place an Obstacle on a
  // chosen empty space. While it stands it works as a Combat Obstacle — it
  // blocks the movement of non-flying units (flyers pass over) and nobody may
  // stop on it. The span grows with the Power paid: Power 0 — this Combat round,
  // Power 1 — the next Combat round, Power 2 — the whole Combat. Engine:
  // PLACE_FORCE_FIELD drops a force_field battlefield token (folded into the
  // movement blocked-space set; lifted at the matching combat-round end). The
  // "OR Instant: +1 Power" side is the universal power-source discard.
  "spell.force_field": {
    id: "spell.force_field",
    name: "Force Field",
    kind: "spell",
    timing: "combat",
    phaseLimit: ["combat"],
    spellLevel: "basic",
    spellSchools: ["earth"],
    power: 0,
    target: { type: "empty-space" },
    tags: [
      "spell",
      "basic",
      "earth",
      "Ongoing: Place this card or a Force Field token on an empty space. It counts as an Obstacle until the end of: Power 0: this Combat round; Power 1: the next Combat round; Power 2: this Combat. — OR — Instant: +1 Power."
    ],
    effect: {
      type: "PLACE_FORCE_FIELD",
      durationByPower: {
        0: { type: "current-combat-round" },
        1: { type: "next-combat-round" },
        2: { type: "combat" }
      }
    },
    assets: {
      cardImage: "/assets/spells-force_field.webp",
      imageAlt: "Force Field card"
    },
    implementationStatus: "implemented",
    source: spellSource("force_field")
  },
  // Fire Wall (Basic Fire, Rampart Expansion): place an Effect Obstacle on a
  // chosen empty space for the whole Combat. Units may enter it, but any unit
  // STOPPING on it — and any GROUND or RANGED unit PASSING THROUGH it (a flyer
  // passing over is unharmed) — takes damage that scales with the Power paid:
  // Power 0 -> 1, Power 2 -> 2, Power 4 -> 3. Engine: PLACE_FIRE_WALL drops a
  // fire_wall battlefield token; moveUnit walks a moving unit through the spaces
  // it enters and applies the wall's bite (see walkMoveThroughTokens). The "OR
  // Instant: +1 Power" side is the universal power-source discard.
  "spell.fire_wall": {
    id: "spell.fire_wall",
    name: "Fire Wall",
    kind: "spell",
    timing: "combat",
    phaseLimit: ["combat"],
    spellLevel: "basic",
    spellSchools: ["fire"],
    power: 0,
    target: { type: "empty-space" },
    tags: [
      "spell",
      "basic",
      "fire",
      "Ongoing: For this Combat, place this card on an empty space. Deal damage to any unit stopping here and to any ground or ranged unit passing through: Power 0: 1 damage; Power 2: 2 damage; Power 4: 3 damage. — OR — Instant: +1 Power."
    ],
    effect: {
      type: "PLACE_FIRE_WALL",
      damageByPower: { 0: 1, 2: 2, 4: 3 }
    },
    assets: {
      cardImage: "/assets/spells-fire_wall.webp",
      imageAlt: "Fire Wall card"
    },
    implementationStatus: "implemented",
    source: spellSource("fire_wall")
  },
  // Quicksand (Basic Earth, Stronghold Expansion): take 2/4/6 tokens by Power
  // (half armed with the Quicksand icon, half empty decoys), shuffle them face
  // down and place one on each chosen empty space. The caster places them one by
  // one and may look at their own at any time; the armed/decoy split is hidden
  // from the opponent until a unit enters a token and reveals it. An armed
  // Quicksand ends the entering unit's movement AND activation; a decoy lets it
  // continue. Engine: a no-target cast (like Remove Obstacle) opens the
  // place-the-whole-set picker — every token, including the first, is dropped on
  // a chosen empty space through the same picker, so there is no special
  // first-token-on-the-cast-space step. walkMoveThroughTokens springs the trap
  // on entry. The "OR Instant: +1 Power" side is the universal power-source
  // discard.
  "spell.quicksand": {
    id: "spell.quicksand",
    name: "Quicksand",
    kind: "spell",
    timing: "combat",
    phaseLimit: ["combat"],
    spellLevel: "basic",
    spellSchools: ["earth"],
    power: 0,
    tags: [
      "spell",
      "basic",
      "earth",
      "Ongoing: Shuffle up to X Quicksand tokens (half armed, half empty) and place them face down on chosen empty spaces. A unit entering an armed token ends its movement and activation: Power 0: 2 tokens; Power 1: 4 tokens; Power 2: 6 tokens. — OR — Instant: +1 Power."
    ],
    effect: {
      type: "PLACE_HIDDEN_TOKENS",
      tokenKind: "quicksand",
      countByPower: { 0: 2, 1: 4, 2: 6 },
      triggerDamage: 0
    },
    assets: {
      cardImage: "/assets/spells-quicksand.webp",
      imageAlt: "Quicksand card"
    },
    implementationStatus: "implemented",
    source: spellSource("quicksand")
  },
  // Land Mine (Expert Fire, Stretch Goals 2 Expansion): take 2/4/6 tokens by
  // Power (half armed with a "2 damage" icon, half empty decoys), shuffle them
  // face down and place one on each chosen empty space. The caster places them
  // one by one and may look at their own; the armed/decoy split is hidden from
  // the opponent until a unit enters a token and reveals it. An armed Land Mine
  // deals 2 damage and the unit then continues its activation; a decoy lets it
  // continue unharmed. Engine: a no-target cast (like Remove Obstacle) opens the
  // place-the-whole-set picker — every token, including the first, is dropped on
  // a chosen empty space through the same picker. walkMoveThroughTokens detonates
  // it on entry. The "OR Instant: +1 Power" side is the universal discard.
  "spell.land_mine": {
    id: "spell.land_mine",
    name: "Land Mine",
    kind: "spell",
    timing: "combat",
    phaseLimit: ["combat"],
    spellLevel: "expert",
    spellSchools: ["fire"],
    power: 0,
    tags: [
      "spell",
      "expert",
      "fire",
      "Ongoing: Shuffle up to X Land Mine tokens (half armed for 2 damage, half empty) and place them face down on chosen empty spaces. A unit entering an armed token takes 2 damage, then continues: Power 0: 2 tokens; Power 1: 4 tokens; Power 2: 6 tokens. — OR — Instant: +1 Power."
    ],
    effect: {
      type: "PLACE_HIDDEN_TOKENS",
      tokenKind: "land_mine",
      countByPower: { 0: 2, 1: 4, 2: 6 },
      triggerDamage: 2
    },
    assets: {
      cardImage: "/assets/spells-land_mine.webp",
      imageAlt: "Land Mine card"
    },
    implementationStatus: "implemented",
    source: spellSource("land_mine")
  },
  // Misfortune (Basic Fire, Instant; Fortress Expansion): the defensive mirror of
  // Bless. "Played immediately when the enemy unit is attacking, BEFORE other
  // cards" — so it has its own pre-buff window (engine: misfortunePhase, opened
  // ahead of the normal attack-declared window). Playing it NEGATES that attack:
  // the attacker can no longer increase their attack from ANY source for this
  // attack (Bloodlust/Precision/Bless/Slayer, Hall of Valhalla / Cage attack
  // boosts — all refused by the legal-action layer once negateAttackBuffs is set)
  // AND the Attack die is cancelled (face 0, no die-triggered effects, via
  // attackDieCancelled). It cannot undo a buff already on the unit — only future
  // increases — which the pre-window guarantees by firing before any buff. Grade-
  // gated on the ATTACKING unit by the Power paid (0 → bronze, 1 → silver,
  // 2 → gold), modelled as one CHOOSE_ONE option per grade (free / pay 1 / pay 2
  // power-source cards) like Magic Mirror; only the option whose grade matches the
  // attacker is offered, and only when affordable. The universal "OR Instant:
  // +1 Power" side is the generic power-source discard.
  "spell.misfortune": {
    id: "spell.misfortune",
    name: "Misfortune",
    kind: "spell",
    timing: "reaction",
    phaseLimit: ["reaction", "combat"],
    spellLevel: "basic",
    spellSchools: ["fire"],
    power: 0,
    tags: [
      "spell",
      "basic",
      "fire",
      "Instant: Play immediately when the selected enemy unit is attacking, before any other card. That unit cannot increase its attack from any source for this attack (and its Attack die is negated): Power 0: bronze; Power 1: bronze or silver; Power 2: bronze, silver, or golden. — OR — Instant: +1 Power."
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Negate a bronze unit's attack",
          trigger: { event: "UNIT_ATTACK_DECLARED", controller: "opponent" },
          effect: { type: "NEGATE_ATTACK", grade: "bronze" }
        },
        {
          label: "Negate a silver unit's attack (pay 1 Power)",
          cost: { discardCards: 1, costCardFilter: "power-source" },
          trigger: { event: "UNIT_ATTACK_DECLARED", controller: "opponent" },
          effect: { type: "NEGATE_ATTACK", grade: "silver" }
        },
        {
          label: "Negate a gold unit's attack (pay 2 Power)",
          cost: { discardCards: 2, costCardFilter: "power-source" },
          trigger: { event: "UNIT_ATTACK_DECLARED", controller: "opponent" },
          effect: { type: "NEGATE_ATTACK", grade: "gold" }
        }
      ]
    },
    assets: {
      cardImage: "/assets/spells-misfortune.webp",
      imageAlt: "Misfortune card"
    },
    implementationStatus: "implemented",
    source: spellSource("misfortune")
  },
  // Remove Obstacle (Basic Water, Instant): clear obstacles off the Combat
  // board. The Power paid sets how many you take down (0/1/2 -> 1/2/3), chosen
  // one at a time. Removable = the random obstacle markers, any battlefield
  // token (Force Field, Fire Wall, Quicksand, Land Mine) and any standing siege
  // Wall or Gate; units are never removed (they only block movement), matching
  // the wiki note. Engine: REMOVE_OBSTACLE -> openRemoveObstacleChoice; each pick
  // clears a marker/token (COMBAT_OBSTACLE_REMOVED) or fells a Wall/Gate
  // (destroyFortification, the same path as Earthquake). The legal-action layer
  // only offers the cast when something removable stands. The "OR Instant: +1
  // Power" side is the universal power-source discard, so it needs no option.
  "spell.remove_obstacle": {
    id: "spell.remove_obstacle",
    name: "Remove Obstacle",
    kind: "spell",
    // Instant (per the wiki), cast during Combat with no unit target — the same
    // timing model as Earthquake (its siege sibling). No own-activation gate.
    timing: "instant",
    phaseLimit: ["combat"],
    spellLevel: "basic",
    spellSchools: ["water"],
    power: 0,
    tags: [
      "spell",
      "basic",
      "water",
      "Instant: Remove obstacles (except units) from the Combat board — obstacle markers, Force Field / Fire Wall / Quicksand / Land Mine tokens, Walls or the Gate: Power 0: 1; Power 1: 2; Power 2: 3. — OR — Instant: +1 Power."
    ],
    effect: {
      type: "REMOVE_OBSTACLE",
      countByPower: { 0: 1, 1: 2, 2: 3 }
    },
    assets: {
      cardImage: "/assets/spells-remove_obstacle.webp",
      imageAlt: "Remove Obstacle card"
    },
    implementationStatus: "implemented",
    source: spellSource("remove_obstacle")
  }
};

/**
 * Magic Arrow is a **starting-only** Spell: every hero begins with a copy
 * (Might heroes one, Magic heroes two — see `makeStartingDeck`), and it is never
 * shuffled into a shared draw deck, so it can never be drawn or searched. Listed
 * here as the single source of truth used by the engine's deck-acquisition gate
 * and by the deck-coverage test's exemption list.
 */
export const STARTING_ONLY_SPELLS: string[] = ["spell.magic_arrow"];

/**
 * Every distinct Basic Spell the shared deck can hold (Magic Arrow excluded —
 * it is starting-only, see `STARTING_ONLY_SPELLS`).
 */
export const spellDeckBinhBasicUnique: string[] = [
  "spell.lightning_bolt",
  "spell.haste",
  "spell.slow",
  "spell.stone_skin",
  "spell.bloodlust",
  "spell.curse",
  "spell.weakness",
  "spell.bless",
  "spell.cure",
  "spell.anti_magic",
  "spell.precision",
  "spell.fortune",
  "spell.blind",
  "spell.earthquake",
  "spell.forgetfulness",
  "spell.visions",
  // View Air (Basic Air) & View Earth (Basic Earth) — map utility spells.
  "spell.view_air",
  "spell.view_earth",
  // Dispel — Basic Water.
  "spell.dispel",
  // Tower Expansion / Stretch Goal defensive spells (all Basic).
  "spell.shield",
  "spell.air_shield",
  "spell.protection_from_air",
  "spell.protection_from_earth",
  "spell.protection_from_fire",
  "spell.protection_from_water",
  // Disrupting Ray — Basic Air.
  "spell.disrupting_ray",
  // Battlefield-obstacle spells — Force Field & Quicksand (Basic Earth), Fire Wall (Basic Fire).
  "spell.force_field",
  "spell.quicksand",
  "spell.fire_wall",
  // Misfortune — Basic Fire.
  "spell.misfortune",
  // Remove Obstacle — Basic Water.
  "spell.remove_obstacle"
];

/** Every distinct Expert Spell the shared deck can hold. */
export const spellDeckBinhExpertUnique: string[] = [
  "spell.fireball",
  "spell.fire_shield",
  "spell.counterstrike",
  "spell.prayer",
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
  "spell.frenzy",
  // Frost Ring — Expert Water.
  "spell.frost_ring",
  // Teleport (Expert Water) & Berserk (Expert Fire).
  "spell.teleport",
  "spell.berserk",
  // Clone — Expert Water (Cove Expansion).
  "spell.clone",
  // Sacrifice — Expert Fire.
  "spell.sacrifice",
  // Land Mine — Expert Fire.
  "spell.land_mine"
];

/**
 * Single mixed deck (legacy mode): two copies of every implemented Spell
 * (Basic + Expert), Magic Arrow excluded. Two players can each draw the same
 * spell, but no hero ever keeps a duplicate — the deck search redraws past a
 * card the hero already owns (see `canAcquireSharedDeckCard`).
 */
export const spellDeckLegacy: string[] = [...spellDeckBinhBasicUnique, ...spellDeckBinhExpertUnique].flatMap((id) => [
  id,
  id
]);

/** BINH split decks: two copies of every spell of the tier, Magic Arrow excluded. */
export const spellDeckBinhBasic: string[] = spellDeckBinhBasicUnique.flatMap((id) => [id, id]);

export const spellDeckBinhExpert: string[] = spellDeckBinhExpertUnique.flatMap((id) => [id, id]);
