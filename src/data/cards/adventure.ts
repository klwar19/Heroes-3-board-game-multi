import type { CardLibrary, UnitType } from "@/engine/state";

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
    tags: [
      "hero-specialty",
      "instant",
      heroSlug,
      `Instant: +1 Attack when this unit attacks, or +1 Defense when it is attacked — doubled (+2) for ${doubledUnit}.`
    ],
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

function slowSpecialty(
  heroSlug: string,
  level: 1 | 4 | 6,
  amount: number,
  movementBonus?: number
): CardLibrary[string] {
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
      removable: true,
      ...(movementBonus !== undefined ? { movementBonus } : {})
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
    tags: [
      "hero-specialty",
      "combat",
      heroSlug,
      "health",
      `Combat: give a friendly unit +${amount} maximum Health this combat — doubled (+${amount * 2}) for ${doubledUnit}.`
    ],
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
    tags: [
      "hero-specialty",
      "combat",
      heroSlug,
      "initiative",
      // House rule (BINH): every "initiative only" specialty now ALSO grants +1
      // Combat movement range with the buff, and offers an alternative of drawing
      // a card instead. The Initiative number is still doubled for the signature
      // unit; the +1 movement is a flat bonus (never doubled).
      `Combat: give a friendly unit +${amount} Initiative AND +1 Combat movement range this combat — Initiative doubled (+${amount * 2}) for ${doubledUnit}. — OR — Draw 1 card.`
    ],
    // Option A targets a friendly unit (it inherits this card-level target);
    // option B (draw a card) needs no target.
    target: { type: "friendly-unit" },
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: `+${amount} Initiative & +1 movement (Initiative x2 for ${doubledUnit})`,
          effect: {
            type: "CREATE_INITIATIVE_BUFF",
            name: `${specialtyName} Specialty`,
            amount,
            duration: { type: "combat" },
            polarity: "positive",
            removable: false,
            doubleForUnitName: doubledUnit,
            // House rule (BINH): the buff also raises Combat movement by 1.
            movementBonus: 1
          }
        },
        {
          label: "Draw 1 card",
          effect: { type: "DRAW_CARDS", amount: 1 }
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
 * A lethal-save specialty (Alamar's Resurrection, Jeddite's Mysterious Warlock):
 * a reaction in the engine's lethal-save window that cancels a normal attack
 * which would destroy one of your units (never spells or specialty damage). One
 * option per grade; its book/Power requirement is value-based (`powerCost`), so
 * the wiki's "can be improved by spell power, just like a regular spell" holds:
 * it is met by the player's standing spell Power PLUS the printed Power VALUE of
 * the power-source cards discarded (a +2 source counts as 2, not as one card),
 * never a raw discard COUNT. A cost of 0 needs no payment.
 */
function lethalSaveSpecialty(
  heroSlug: string,
  specialtyName: string,
  level: 1 | 4 | 6,
  costs: { bronze: number; silver: number; gold: number }
): CardLibrary[string] {
  const grades = ["bronze", "silver", "gold"] as const;
  const tagGroup = specialtyName.toLowerCase().replace(/\s+/g, "-");
  return {
    id: `specialty.${heroSlug}.${level}`,
    name: `${specialtyName} ${towerRoman(level)}`,
    kind: "hero-specialty",
    timing: "reaction",
    phaseLimit: ["reaction", "combat"],
    tags: [
      "hero-specialty",
      "reaction",
      heroSlug,
      tagGroup,
      `Cancel an enemy attack that would reduce one of your units to 0 HP (attacks only, not spells or specialties). Pay spell Power (your standing Power, a Power statistic, or a Spell): ${costs.bronze} for a bronze unit, ${costs.silver} for silver, ${costs.gold} for gold.`
    ],
    effect: {
      type: "CHOOSE_ONE",
      // No per-option trigger: the save is offered only in its own lethal-save
      // window (when a unit is actually about to die), not as a normal
      // attack-window reaction.
      options: grades.map((grade) => ({
        label:
          costs[grade] > 0
            ? `Save a ${grade} unit (pay ${costs[grade]} Power)`
            : `Save a ${grade} unit`,
        ...(costs[grade] > 0
          ? { cost: { powerCost: costs[grade], costCardFilter: "power-source" as const } }
          : {}),
        effect: { type: "CANCEL_LETHAL_ATTACK" as const, grade }
      }))
    },
    assets: {
      cardImage: specialtyCardImage(heroSlug, level),
      imageAlt: `${specialtyName} level ${towerRoman(level)} specialty card`
    },
    implementationStatus: "implemented",
    source: heroSource(heroSlug)
  };
}

/**
 * Deemer's Meteor Shower I (target + 1 adjacent) and VI (target + 2 adjacent):
 * "Select a unit and N unit(s) adjacent to it. Deal X to all selected units,
 * friend or foe." Per the verbatim card and the wiki the damage "scales directly
 * with spell power, similar to standard spells" — the book/Power table reads
 * Power 0-1 → 1, Power 2-3 → 2, Power 4+ → 3, exactly like the Frost Ring Spell.
 * So it is a SINGLE power-scaled activation (`amountByPower`), NOT a menu of fixed
 * damage tiers: the Power brought is the caster's standing spell Power plus the
 * printed Power of the power-source cards discarded to play it (a +2 source
 * counts as 2), resolved in `playCardSpellPower`. The earlier 3-tier CHOOSE_ONE
 * (deal 1/2/3 for an exact discard COUNT of 0/2/4 cards) was wrong on both axes:
 * it presented a confusing tier menu and ignored spell-power buffs / card Power
 * values. The engine hits the centre unit and that many adjacent units, letting
 * the caster pick which when more are adjacent (AREA_DAMAGE_PICK_ADJACENT).
 */
function meteorShowerSpecialty(level: 1 | 6, adjacentPicks: number): CardLibrary[string] {
  const adjacentText = adjacentPicks === 1 ? "1 unit adjacent to it" : `${adjacentPicks} units adjacent to it`;
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
      `Instant (any time, incl. an enemy unit's turn start or end of its move): Select a unit and ${adjacentText}. Deal to all selected units (friend or foe), scaling with the spell Power you bring: Power 0-1: 1 damage; Power 2-3: 2 damage; Power 4+: 3 damage.`
    ],
    target: { type: "any-unit" },
    // ONE power-scaled activation, not a tier menu. The optional power-source
    // discard (up to 4 — the breakpoint for max damage) plus standing spell Power
    // set the damage via `amountByPower`, mirroring the Frost Ring Spell. Playable
    // any time during Combat (combatAnytime): on your turn and off-turn when an
    // enemy unit's activation starts or when it finishes its move.
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Select a unit and its neighbours — deal 1-3 (scales with the Power you bring)",
          combatAnytime: true,
          cost: { discardCardsUpTo: 4, costCardFilter: "power-source" as const },
          effect: {
            type: "AREA_DAMAGE_PICK_ADJACENT" as const,
            amountByPower: { 0: 1, 2: 2, 4: 3 },
            includeCenter: true,
            adjacentPicks
          }
        }
      ]
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
    // The trailing prose tag is the text the native specialty card renders, with a
    // clear timing word ("Ongoing (this Combat)") so the card states what it is.
    tags: [
      "hero-specialty",
      "combat",
      heroSlug,
      "health",
      `Ongoing (this Combat): give a friendly unit +${amount} maximum Health — doubled (+${amount * 2}) for ${doubledUnit}.`
    ],
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
    // Trailing prose tag = the native card's rendered text, with a clear timing word.
    tags: [
      "hero-specialty",
      "instant",
      heroSlug,
      `Instant: +${amount} ${stat === "attack" ? "attack" : "defence"} on a single ${
        stat === "attack" ? "attack" : "defence"
      } — doubled (+${amount * 2}) for ${doubledUnit}.`
    ],
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
 * Armorer / War Hero defense specialty (Mephala, Tazar): a flat +N Defense to a
 * single attack, played as a defense reaction. Unlike a creature specialty it has
 * no signature unit, so the bonus never doubles. Mephala I/IV/VI = +2/+3/+4;
 * Tazar reuses it only for his "War Hero I" (+2).
 */
function armorerSpecialty(
  heroSlug: string,
  level: 1 | 4 | 6,
  amount: number,
  specialtyName = "Armorer"
): CardLibrary[string] {
  const tagGroup = specialtyName.toLowerCase().replace(/\s+/g, "-");
  return {
    id: `specialty.${heroSlug}.${level}`,
    name: `${specialtyName} ${towerRoman(level)}`,
    kind: "hero-specialty",
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    tags: [
      "hero-specialty",
      "instant",
      heroSlug,
      tagGroup,
      `Your selected unit gains +${amount} defense.`
    ],
    trigger: { event: "UNIT_ATTACK_DECLARED", controller: "opponent" },
    effect: { type: "ADD_COMBAT_STAT", stat: "defense", amount },
    assets: {
      cardImage: specialtyCardImage(heroSlug, level),
      imageAlt: `${specialtyName} level ${towerRoman(level)} specialty card`
    },
    implementationStatus: "implemented",
    source: heroSource(heroSlug)
  };
}

/**
 * Lord Haart's Estates specialty: an instant map play that gains a flat amount of
 * gold (I/IV/VI = 2/3/5). Modelled as a single mapOnly option so it is only ever
 * playable on the adventure map, never in combat.
 */
function estatesGoldSpecialty(level: 1 | 4 | 6, gold: number): CardLibrary[string] {
  return {
    id: `specialty.lord_haart.${level}`,
    name: `Estates ${towerRoman(level)}`,
    kind: "hero-specialty",
    timing: "instant",
    tags: ["hero-specialty", "instant", "lord_haart", "estates", `Gain ${gold} gold.`],
    target: { type: "none" },
    effect: {
      type: "CHOOSE_ONE",
      options: [{ label: `Gain ${gold} gold`, mapOnly: true, effect: { type: "GAIN_RESOURCES", gain: { gold } } }]
    },
    assets: {
      cardImage: specialtyCardImage("lord_haart", level),
      imageAlt: `Estates level ${towerRoman(level)} specialty card`
    },
    implementationStatus: "implemented",
    source: heroSource("lord_haart")
  };
}

/**
 * Jeddite's Mysterious Warlock I/VI: a map play that digs the top `count` cards
 * of your own deck, keeps every Spell and Specialty among them in your hand, and
 * discards the rest (DECK_DIG_KEEP_MATCHING). I draws up to 3, VI up to 4.
 */
function warlockDigSpecialty(level: 1 | 6, count: number): CardLibrary[string] {
  return {
    id: `specialty.jeddite.${level}`,
    name: `Mysterious Warlock ${towerRoman(level)}`,
    kind: "hero-specialty",
    timing: "instant",
    tags: [
      "hero-specialty",
      "instant",
      "jeddite",
      "mysterious-warlock",
      `Draw up to ${count} cards from your deck, take any Spell and Specialty cards to your hand, and discard the rest.`
    ],
    target: { type: "none" },
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: `Dig ${count} cards; keep Spells and Specialties`,
          mapOnly: true,
          effect: { type: "DECK_DIG_KEEP_MATCHING", count, filter: "spell-or-specialty" }
        }
      ]
    },
    assets: {
      cardImage: specialtyCardImage("jeddite", level),
      imageAlt: `Mysterious Warlock level ${towerRoman(level)} specialty card`
    },
    implementationStatus: "implemented",
    source: heroSource("jeddite")
  };
}

/**
 * Adrienne's Fire Magic I/VI: a combat play that, for the rest of the Combat,
 * adds +amount Power to the caster's Fire-school Spells (a player-scoped
 * SPELL_SCHOOL_POWER_BONUS read in getCurrentSpellPower). I = +1, VI = +2.
 *
 * engine: this boosts activation-cast spells (`CAST_SPELL` — the Fire damage
 * spells: Inferno, Berserk, Blind, Fire Wall, …). It does NOT boost the instant
 * attack-window Fire spell Curse, whose Power is pooled separately on the attack
 * stack (recomputePowerScaledAttackInstants), so Curse keeps its base scaling.
 */
function fireMagicSpecialty(level: 1 | 6, amount: number): CardLibrary[string] {
  return {
    id: `specialty.adrienne.${level}`,
    name: `Fire Magic ${towerRoman(level)}`,
    kind: "hero-specialty",
    timing: "combat",
    phaseLimit: ["combat"],
    tags: [
      "hero-specialty",
      "combat",
      "adrienne",
      "fire-magic",
      `During this Combat, every Spell you cast from the School of Fire is cast with +${amount} Power.`
    ],
    target: { type: "none" },
    effect: {
      type: "CREATE_ACTIVE_EFFECT",
      effect: {
        name: `Fire Magic ${towerRoman(level)}`,
        scope: "player",
        duration: { type: "combat" },
        polarity: "positive",
        removable: false,
        modifiers: [{ type: "SPELL_SCHOOL_POWER_BONUS", school: "fire", amount }]
      }
    },
    assets: {
      cardImage: specialtyCardImage("adrienne", level),
      imageAlt: `Fire Magic level ${towerRoman(level)} specialty card`
    },
    implementationStatus: "implemented",
    source: heroSource("adrienne")
  };
}

/**
 * Strips the `assets.cardImage` reference from a specialty built by a shared
 * helper. The "Regular Stretch Goals 2024" heroes whose fan-wiki page is still a
 * placeholder (Valeska, Ingham, Lorelei, Septienna) have no printed specialty
 * card faces to ship, so — exactly like Cyra/Torosar — their cards carry no
 * cardImage (the UI renders the text side, never a broken image link).
 */
function withoutArt(card: CardLibrary[string]): CardLibrary[string] {
  const next = { ...card };
  delete next.assets;
  return next;
}

const ROMAN: Record<1 | 4 | 6, string> = { 1: "I", 4: "IV", 6: "VI" };

/**
 * Astra's Cure specialty (Cove). Reuses the implemented Cure cleanse
 * (HEAL_DAMAGE_AND_REMOVE_EFFECTS): I removes any effect or paralysis then draws
 * 1; IV removes any effect or paralysis and heals up to 2; VI heals up to 3 (no
 * cleanse). Face-less — the wiki has no Cove specialty card art yet.
 */
function cureSpecialty(level: 1 | 4 | 6): CardLibrary[string] {
  const base = {
    id: `specialty.astra.${level}`,
    name: `Cure ${ROMAN[level]}`,
    kind: "hero-specialty" as const,
    timing: "instant" as const,
    phaseLimit: ["combat" as const],
    implementationStatus: "implemented" as const,
    source: heroSource("astra")
  };
  if (level === 6) {
    return {
      ...base,
      tags: ["hero-specialty", "instant", "astra", "heal", "Remove up to 3 damage from your selected unit."],
      target: { type: "friendly-unit", damagedOnly: true },
      effect: { type: "HEAL_DAMAGE", amount: 3 }
    };
  }
  return {
    ...base,
    tags: [
      "hero-specialty",
      "instant",
      "astra",
      "heal",
      level === 1
        ? "Remove any effect or paralysis from your selected unit, then draw 1 card."
        : "Remove any effect or paralysis as well as up to 2 damage from your selected unit."
    ],
    target: { type: "friendly-unit" },
    effect: {
      type: "HEAL_DAMAGE_AND_REMOVE_EFFECTS",
      amount: level === 1 ? 0 : 2,
      removePolarity: "any-removable",
      removeParalysis: true,
      ...(level === 1 ? { drawCards: 1 } : {})
    }
  };
}

/**
 * Miriam's Scouting specialty (Cove): a map turn action that removes one card
 * from hand to Search(count) that card's deck (REMOVE_HAND_CARD_THEN_SEARCH),
 * then optionally removes the Specialty card itself ("Then, you may Remove this
 * Specialty card" → the second CHOOSE_ONE option, cost.removeSelf, mirroring the
 * Scholar). Level I narrows the removable card to an Ability (always digging the
 * Ability deck); IV/VI allow any Ability/Artifact/Spell and dig that card's deck.
 */
function scoutingSpecialty(level: 1 | 4 | 6, filter: "ability" | "removable", count: number): CardLibrary[string] {
  const what = filter === "ability" ? "an Ability card" : "an Ability, Artifact, or Spell card";
  const deck = filter === "ability" ? "the Ability deck" : "its deck";
  return withoutArt({
    id: `specialty.miriam.${level}`,
    name: `Scouting ${towerRoman(level)}`,
    kind: "hero-specialty",
    timing: "instant",
    tags: [
      "hero-specialty",
      "instant",
      "miriam",
      "scouting",
      `Remove ${what} from your hand to Search (${count}) ${deck}. Then, you may Remove this Specialty card.`
    ],
    target: { type: "none" },
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: `Remove ${what} to Search (${count}) ${deck}`,
          mapOnly: true,
          effect: { type: "REMOVE_HAND_CARD_THEN_SEARCH", count, filter, tieredReach: filter === "removable" }
        },
        {
          label: `Remove ${what} to Search (${count}) ${deck}; then Remove this Specialty card`,
          mapOnly: true,
          cost: { removeSelf: true },
          effect: { type: "REMOVE_HAND_CARD_THEN_SEARCH", count, filter, tieredReach: filter === "removable" }
        }
      ]
    },
    implementationStatus: "implemented",
    source: heroSource("miriam")
  });
}


/** "+N attack" instant on your own attack, doubled for the signature unit (Lorelei VI). */
function attackInstantSpecialty(
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
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    // Trailing prose tag = the native card's rendered text, with a clear timing word.
    tags: [
      "hero-specialty",
      "instant",
      heroSlug,
      `Instant: +${amount} attack on your unit's next attack — doubled (+${amount * 2}) for ${doubledUnit}.`
    ],
    trigger: { event: "UNIT_ATTACK_DECLARED", controller: "self" },
    effect: { type: "ADD_COMBAT_STAT", stat: "attack", amount, doubleForUnitName: doubledUnit },
    assets: {
      cardImage: specialtyCardImage(heroSlug, level),
      imageAlt: `${specialtyName} level ${towerRoman(level)} specialty card`
    },
    implementationStatus: "implemented",
    source: heroSource(heroSlug)
  };
}

/**
 * Valeska's Marksmen VI: activate one of your ranged units even if it has
 * already acted this round (ACTIVATE_RANGED_UNIT with allowAlreadyActivated),
 * OR draw 2 cards.
 */
function activateRangedOrDrawSpecialty(
  heroSlug: string,
  specialtyName: string,
  level: 1 | 4 | 6,
  draw: number
): CardLibrary[string] {
  return {
    id: `specialty.${heroSlug}.${level}`,
    name: `${specialtyName} ${towerRoman(level)}`,
    kind: "hero-specialty",
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    tags: [
      "hero-specialty",
      "instant",
      heroSlug,
      `Activate one of your ranged units, even if it has already been activated. — OR — Draw ${draw} cards.`
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Activate a ranged unit (even if already activated)",
          trigger: { event: "UNIT_ACTIVATION_STARTED", controller: "any" },
          target: { type: "friendly-unit", unitTypes: ["ranged"] },
          effect: { type: "ACTIVATE_RANGED_UNIT", allowAlreadyActivated: true }
        },
        {
          label: `Draw ${draw} cards`,
          effect: { type: "DRAW_CARDS", amount: draw }
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

/**
 * Ingham's Zealots VI: for the Combat, your chosen unit's attacks ignore the
 * target's Defense (IGNORES_DEFENSE), OR draw 1 card.
 */
function ignoreDefenseOrDrawSpecialty(
  heroSlug: string,
  specialtyName: string,
  level: 1 | 4 | 6,
  draw: number
): CardLibrary[string] {
  return {
    id: `specialty.${heroSlug}.${level}`,
    name: `${specialtyName} ${towerRoman(level)}`,
    kind: "hero-specialty",
    timing: "combat",
    phaseLimit: ["combat"],
    tags: [
      "hero-specialty",
      "combat",
      heroSlug,
      `For this Combat, your ${specialtyName} unit ignores its targets' Defense. — OR — Draw ${draw} card${draw === 1 ? "" : "s"}.`
    ],
    // The card-level target falls back to the signature unit; the ignore-Defense
    // option below pins it explicitly so the draw option can still target none.
    target: { type: "friendly-unit", unitName: specialtyName },
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: `Your ${specialtyName} unit ignores its targets' Defense this Combat`,
          combatOnly: true,
          // Printed "your Zealots unit": offered only on the signature unit.
          target: { type: "friendly-unit", unitName: specialtyName },
          effect: {
            type: "CREATE_ACTIVE_EFFECT",
            effect: {
              name: `${specialtyName} ${towerRoman(level)}`,
              scope: "unit",
              duration: { type: "combat" },
              polarity: "positive",
              removable: false,
              modifiers: [{ type: "IGNORES_DEFENSE" }]
            }
          }
        },
        {
          label: `Draw ${draw} card${draw === 1 ? "" : "s"}`,
          target: { type: "none" },
          effect: { type: "DRAW_CARDS", amount: draw }
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

/**
 * Septienna's Death Ripple (I/IV/VI): deal `damage` to every enemy unit of the
 * listed grade(s) (DAMAGE_ENEMY_UNITS_BY_GRADE), OR add `power` Power to a Spell
 * you are casting (ADD_SPELL_POWER).
 */
function deathRippleSpecialty(
  level: 1 | 4 | 6,
  grades: ("bronze" | "silver" | "gold" | "azure")[],
  damage: number,
  power: number
): CardLibrary[string] {
  const gradeWords = grades
    .map((grade) => (grade === "gold" ? "golden" : grade))
    .join(" and ");
  return {
    id: `specialty.septienna.${level}`,
    name: `Death Ripple ${towerRoman(level)}`,
    kind: "hero-specialty",
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    tags: [
      "hero-specialty",
      "instant",
      "septienna",
      "death-ripple",
      `Activation: every enemy ${gradeWords} unit suffers ${damage} damage. — OR — +${power} Power on a Spell you are casting.`
    ],
    target: { type: "none" },
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: `Every enemy ${gradeWords} unit suffers ${damage} damage`,
          combatOnly: true,
          effect: { type: "DAMAGE_ENEMY_UNITS_BY_GRADE", grades, amount: damage }
        },
        {
          label: `+${power} Power`,
          trigger: { event: "SPELL_CAST_STARTED", controller: "self" },
          effect: { type: "ADD_SPELL_POWER", amount: power }
        }
      ]
    },
    assets: {
      cardImage: specialtyCardImage("septienna", level),
      imageAlt: `Death Ripple level ${towerRoman(level)} specialty card`
    },
    implementationStatus: "implemented",
    source: heroSource("septienna")
  };
}

/**
 * Lord Haart (Necropolis) Dread Knights I/VI: an INSTANT reaction. When an
 * enemy declares a Retaliation Attack against one of your units, play this to
 * reduce that retaliation's damage by `amount` (1 at I, 2 at VI), doubled when
 * the unit being retaliated against is his Dread Knights
 * (REDUCE_RETALIATION_DAMAGE). The window opens on the enemy's declaration
 * (`UNIT_ATTACK_DECLARED`, controller "opponent"), so it only fires on a
 * genuine retaliation against you — never proactively on a chosen unit.
 */
function retaliationReductionSpecialty(
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
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    tags: [
      "hero-specialty",
      "instant",
      heroSlug,
      `When an enemy performs a Retaliation Attack against one of your units, reduce that retaliation's damage by ${amount}. The effect doubles for the ${doubledUnit} unit.`
    ],
    trigger: { event: "UNIT_ATTACK_DECLARED", controller: "opponent" },
    effect: {
      type: "REDUCE_RETALIATION_DAMAGE",
      amount,
      doubleForUnitName: doubledUnit
    },
    assets: {
      cardImage: specialtyCardImage(heroSlug, level),
      imageAlt: `${specialtyName} level ${towerRoman(level)} specialty card`
    },
    implementationStatus: "implemented",
    source: heroSource(heroSlug)
  };
}

/**
 * Ivor's Elves I / VI (second option): force this attack's die to a fixed face
 * (FORCE_ATTACK_ROLL). Played as an instant in the attack window; `controller`
 * decides whose attacks it may target ("any" for the level I "next attack roll",
 * "self" for the level VI "your roll").
 */
function forceAttackRollSpecialty(
  heroSlug: string,
  specialtyName: string,
  level: 1 | 4 | 6,
  value: number,
  controller: "self" | "any",
  description: string
): CardLibrary[string] {
  return {
    id: `specialty.${heroSlug}.${level}`,
    name: `${specialtyName} ${towerRoman(level)}`,
    kind: "hero-specialty",
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    tags: ["hero-specialty", "instant", heroSlug, description],
    trigger: { event: "UNIT_ATTACK_DECLARED", controller },
    effect: { type: "FORCE_ATTACK_ROLL", value },
    assets: {
      cardImage: specialtyCardImage(heroSlug, level),
      imageAlt: `${specialtyName} level ${towerRoman(level)} specialty card`
    },
    implementationStatus: "implemented",
    source: heroSource(heroSlug)
  };
}

/**
 * Ivor's Elves IV: "+1 attack OR +1 defense", doubled for a UNIT TYPE (his "a
 * ranged unit") rather than a named unit — the type-keyed twin of
 * towerAttackOrDefenseSpecialty (doubleForUnitType instead of doubleForUnitName).
 */
function attackOrDefenseByTypeSpecialty(
  heroSlug: string,
  specialtyName: string,
  level: 1 | 4 | 6,
  unitType: UnitType,
  typeLabel: string
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
          label: `+1 attack (x2 for ${typeLabel})`,
          trigger: { event: "UNIT_ATTACK_DECLARED", controller: "self" },
          effect: { type: "ADD_COMBAT_STAT", stat: "attack", amount: 1, doubleForUnitType: unitType }
        },
        {
          label: `+1 defense (x2 for ${typeLabel})`,
          trigger: { event: "UNIT_ATTACK_DECLARED", controller: "opponent" },
          effect: { type: "ADD_COMBAT_STAT", stat: "defense", amount: 1, doubleForUnitType: unitType }
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
    // Printed card: "+1 Power, then draw 1 card" (expert +2). On a SPELL_CAST it
    // adds the Power to that cast (and the draw can refresh another Power card
    // into the same window). Like Offense/Armorer's ADD_COMBAT_STAT draw-rider,
    // it may also be played outside its window (on the map) purely for the draw:
    // the +Power fizzles with no cast to land on (engine: legal-actions drawOnly
    // / isMapPlayableEffect + the reducer's outside-combat draw handler).
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
  // engine: Scholar is a CHOOSE_ONE. Basic: take 1 card from your discard pile
  // into hand (TAKE_FROM_DISCARD). HOUSE RULE — the basic side is usable during
  // Combat too (`allowInCombat`): the reducer opens the discard-pick choice
  // immediately mid-fight instead of queuing it on the parked adventure reward
  // queue, and legal-actions offers it in the combat context. Expert is still
  // map-only: "Remove up to 2 Statistic cards from your hand
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
          // House rule: usable on the map AND during Combat (allowInCombat) —
          // recover a card from your discard pile into hand mid-fight.
          label: "Choose 1 card from your discard pile and add it to your hand",
          effect: { type: "TAKE_FROM_DISCARD", count: 1, allowInCombat: true }
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
  // Art-less: the moandor specialty scans (hero_specialties-moandor-*.webp) were
  // never shipped, so the native renderer draws these with the Power Lich portrait
  // symbol (SPECIALTY_ICON_BY_HERO.moandor) instead of a broken <img> link.
  "specialty.moandor.1": withoutArt(mightSpecialtyOne("moandor", "Liches", "Liches")),
  "specialty.moandor.4": withoutArt(unitHealthSpecialty("moandor", "Liches", 4, 1, "Liches")),
  // Moandor VI is a CHOICE (— OR —), re-confirmed against the owner's physical
  // card 2026-06: the fan wiki renders the two clauses with no "OR" (looking like
  // a combined AND), but the printed card is choose-one. Do not "fix" it to AND.
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
    // Art-less (see specialty.moandor.1/4): no shipped scan — rendered natively.
    implementationStatus: "implemented",
    source: heroSource("moandor")
  },
  // Gelu (Ranger): the Sharpshooters specialist. His +1 attack/defence (I) and
  // +2 initiative (VI) double for BOTH the Elves and Sharpshooters units (wiki).
  "specialty.gelu.1": mightSpecialtyOne("gelu", "Sharpshooters", "Elves and Sharpshooters"),
  // Gelu IV: trade a Pack of Elves for the unique Sharpshooters Neutral card,
  // or just draw a card. The Sharpshooters card leaves the silver Neutral deck
  // and joins your unit deck; only one Sharpshooters may be controlled at once.
  // House rule (BINH): a Sharpshooters recruited THIS way is permanently BUFFED —
  // it carries +1 Attack in every combat, start to end (grantAttackBonus: 1).
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
      // House rule (BINH): the recruited Sharpshooters is BUFFED with a permanent
      // +1 Attack in all combats — stated up front so the player knows it is a buff.
      "If you have a Pack of Elves Unit card, discard it, then search the Neutral Unit silver deck for the Sharpshooters card and add it to your Unit deck (only 1 Sharpshooters at a time). BUFF: that Sharpshooters permanently gains +1 Attack in every combat, from beginning to end. — OR — Draw a card."
    ],
    target: { type: "none" },
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Discard a Pack of Elves → take the BUFFED Sharpshooters (+1 Attack, always)",
          mapOnly: true,
          effect: {
            type: "CONVERT_ARMY_UNIT",
            fromUnitDefId: "rampart.elves",
            fromSide: "pack",
            toUnitDefId: "neutral.sharpshooters",
            toTier: "silver",
            unique: true,
            // House rule (BINH): the recruited Sharpshooters always fights at +1 Attack.
            grantAttackBonus: 1
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
  // Crag Hack (Barbarian), specialty "Offense". The wiki cards differ from the
  // generic Offense helper (which fits Tarnum Stronghold, not Crag Hack):
  //  - I is an ONGOING "For this Combat, +1 attack" (not the instant +1/draw OR).
  //  - IV is "+1 attack for the Combat; you MAY discard a card for +1 more" →
  //    a CHOOSE_ONE of +1 (free) vs +2 (discard 1), both combat-duration.
  // (VI — "every card you play this Combat can grant +1 attack instead of its
  // regular effect" — is a distinct, unbuilt mechanic; still pending.)
  "specialty.crag_hack.1": {
    id: "specialty.crag_hack.1",
    name: "Offense I",
    kind: "hero-specialty",
    timing: "combat",
    phaseLimit: ["combat"],
    tags: ["hero-specialty", "combat", "crag_hack", "offense", "For this Combat, your selected unit gains +1 attack."],
    target: { type: "friendly-unit" },
    effect: {
      type: "CREATE_ATTACK_BUFF",
      name: "Offense I",
      amount: 1,
      duration: { type: "combat" },
      polarity: "positive",
      removable: false
    },
    assets: {
      cardImage: specialtyCardImage("crag_hack", 1),
      imageAlt: "Offense level I specialty card"
    },
    implementationStatus: "implemented",
    source: heroSource("crag_hack")
  },
  "specialty.crag_hack.4": {
    id: "specialty.crag_hack.4",
    name: "Offense IV",
    kind: "hero-specialty",
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    tags: [
      "hero-specialty",
      "instant",
      "crag_hack",
      "offense",
      "Your selected unit gains +1 attack. You may discard a card to gain another +1 attack."
    ],
    // Instant (one-shot, on a single attack): +1, or discard a card for +2.
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "+1 attack",
          trigger: { event: "UNIT_ATTACK_DECLARED", controller: "self" },
          effect: { type: "ADD_COMBAT_STAT", stat: "attack", amount: 1 }
        },
        {
          label: "Discard a card: +2 attack",
          trigger: { event: "UNIT_ATTACK_DECLARED", controller: "self" },
          cost: { discardCards: 1 },
          effect: { type: "ADD_COMBAT_STAT", stat: "attack", amount: 2 }
        }
      ]
    },
    assets: {
      cardImage: specialtyCardImage("crag_hack", 4),
      imageAlt: "Offense level IV specialty card"
    },
    implementationStatus: "implemented",
    source: heroSource("crag_hack")
  },
  "specialty.crag_hack.6": {
    id: "specialty.crag_hack.6",
    name: "Offense VI",
    kind: "hero-specialty",
    timing: "combat",
    phaseLimit: ["combat"],
    tags: [
      "hero-specialty",
      "combat",
      "crag_hack",
      "offense",
      "For this Combat, every card you play can grant +1 attack instead of its regular effect.",
      // engine: a player-scoped combat aura (CARDS_AS_ATTACK_BONUS). While it is
      // up, during one of your unit's attacks you may discard ANY held card to add
      // +1 to that attack (CONVERT_CARD_TO_ATTACK), repeatable while cards remain.
    ],
    target: { type: "none" },
    effect: {
      type: "CREATE_ACTIVE_EFFECT",
      effect: {
        name: "Offense VI",
        scope: "player",
        duration: { type: "combat" },
        polarity: "positive",
        removable: false,
        modifiers: [{ type: "CARDS_AS_ATTACK_BONUS", amount: 1 }]
      }
    },
    assets: {
      cardImage: specialtyCardImage("crag_hack", 6),
      imageAlt: "Offense level VI specialty card"
    },
    implementationStatus: "implemented",
    source: heroSource("crag_hack")
  },
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
  // Gundula (Battle Mage), specialty "Slow": I/VI decrease an enemy unit's
  // Initiative by 2 / 4 for the Combat (wiki magnitudes — the earlier −1/−3 from a
  // mis-scaled helper was wrong). IV is the odd one out per the wiki: an INSTANT
  // +1 attack that doubles when YOUR unit is faster than the attacked unit
  // (doubleIfAttackerInitiativeHigher), NOT another Slow.
  "specialty.gundula.1": slowSpecialty("gundula", 1, 2, -1),
  "specialty.gundula.4": {
    id: "specialty.gundula.4",
    name: "Slow IV",
    kind: "hero-specialty",
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    tags: [
      "hero-specialty",
      "instant",
      "gundula",
      "slow",
      "Your selected unit gains +1 attack. The effect doubles if its initiative is higher than the attacked unit's."
    ],
    trigger: { event: "UNIT_ATTACK_DECLARED", controller: "self" },
    effect: { type: "ADD_COMBAT_STAT", stat: "attack", amount: 1, doubleIfAttackerInitiativeHigher: true },
    assets: {
      cardImage: specialtyCardImage("gundula", 4),
      imageAlt: "Slow level IV specialty card"
    },
    implementationStatus: "implemented",
    source: heroSource("gundula")
  },
  "specialty.gundula.6": slowSpecialty("gundula", 6, 4, -1),
  "specialty.shiva.1": mightSpecialtyOne("shiva", "Thunderbirds", "Thunderbirds"),
  "specialty.shiva.4": unitHealthSpecialty("shiva", "Thunderbirds", 4, 1, "Thunderbirds"),
  "specialty.shiva.6": unitInitiativeSpecialty("shiva", "Thunderbirds", 6, 2, "Thunderbirds"),
  "specialty.tarnum_stronghold.1": offenseSpecialtyOne("tarnum_stronghold"),
  "specialty.tarnum_stronghold.4": offenseSpecialtyFour("tarnum_stronghold"),
  "specialty.tarnum_stronghold.6": offenseSpecialtySix("tarnum_stronghold"),
  "specialty.yog.1": mightSpecialtyOne("yog", "Cyclopes", "Cyclopes"),
  "specialty.yog.4": unitInitiativeSpecialty("yog", "Cyclopes", 4, 1, "Cyclopes"),
  "specialty.yog.6": unitHealthSpecialty("yog", "Cyclopes", 6, 1, "Cyclopes"),
  "specialty.alamar.1": lethalSaveSpecialty("alamar", "Resurrection", 1, { bronze: 1, silver: 2, gold: 4 }),
  "specialty.alamar.4": lethalSaveSpecialty("alamar", "Resurrection", 4, { bronze: 0, silver: 1, gold: 3 }),
  "specialty.alamar.6": lethalSaveSpecialty("alamar", "Resurrection", 6, { bronze: 0, silver: 0, gold: 2 }),
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
  // and Enchanters; IV = trade a Pack of Magi for the unique Enchanters card,
  // OR draw, OR (house rule) trade a Few of Magi + 6 gold for it; VI = +2
  // initiative for the combat, doubled for Magi/Enchanters.
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
      // House rule (BINH): besides trading a Pack of Magi, Dracon may also upgrade
      // the cheaper Few of Magi into the Enchanters by paying 6 extra gold.
      "If you have a Pack of Magi Unit card, discard it, then search the Neutral Unit golden deck for the Enchanters card and add it to your Unit deck (only 1 Enchanters at a time). — OR — Draw a card. — OR — Discard a Few of Magi AND pay 6 gold to take the Enchanters the same way."
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
        },
        {
          // House rule (BINH): recruit the Enchanters from the cheaper Few of Magi
          // for 6 extra gold (the Pack option above is free). Engine: the shared
          // CONVERT_ARMY_UNIT resolver removes the Few specifically and charges the
          // goldCost; gating requires owning a Few of Magi AND >= 6 gold.
          label: "Discard a Few of Magi + 6 gold → take the Enchanters",
          mapOnly: true,
          effect: {
            type: "CONVERT_ARMY_UNIT",
            fromUnitDefId: "tower.magi",
            fromSide: "few",
            toUnitDefId: "neutral.enchanters",
            toTier: "gold",
            unique: true,
            goldCost: 6
          }
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
      // House rule (BINH): Haste also gives +1 Combat movement, and may instead
      // be spent to draw a card.
      "For this Combat, your selected unit's Initiative is increased by 3 AND its Combat movement range by 1. — OR — Draw 1 card."
    ],
    // Option A targets the friendly unit (inherited); option B (draw) needs none.
    target: { type: "friendly-unit" },
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "+3 Initiative & +1 movement",
          effect: {
            type: "CREATE_INITIATIVE_BUFF",
            name: "Haste",
            amount: 3,
            duration: { type: "combat" },
            polarity: "positive",
            removable: false,
            // House rule (BINH): Cyra's Haste also gives +1 Combat movement (3 → 4).
            movementBonus: 1
          }
        },
        {
          label: "Draw 1 card",
          effect: { type: "DRAW_CARDS", amount: 1 }
        }
      ]
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
          { type: "DEFENSE_VS_LOWER_INITIATIVE", amount: 1 },
          // House rule (BINH): Cyra's Haste also gives +1 Combat movement.
          { type: "MOVEMENT_BONUS", amount: 1 }
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

  // ---- Conflux heroes (unit-specialist Planeswalkers) --------------------
  // Erdamon: the Magma Elementals specialist (wiki — "The effect doubles for
  // the Magma Elementals unit"). I = instant +1 attack OR +1 defence (doubled
  // for Magma Elementals); IV = +1 initiative for the combat (doubled for Magma
  // Elementals); VI = instant +2 attack OR ongoing +3 initiative (no doubling).
  // Art-less (the Conflux specialty scans were never shipped) — the native
  // renderer draws these with the Magma Elemental portrait (SPECIALTY_ICON_BY_HERO).
  "specialty.erdamon.1": withoutArt(towerAttackOrDefenseSpecialty("erdamon", "Magma Elementals", 1, "Magma Elementals")),
  "specialty.erdamon.4": withoutArt(unitInitiativeSpecialty("erdamon", "Magma Elementals", 4, 1, "Magma Elementals")),
  "specialty.erdamon.6": {
    id: "specialty.erdamon.6",
    name: "Magma Elementals VI",
    kind: "hero-specialty",
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    tags: [
      "hero-specialty",
      "instant",
      "erdamon",
      "Your selected unit gains +2 attack. — OR — For this Combat, your selected unit's initiative is increased by 3."
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          // Instant, one-shot: +2 attack on your unit's next attack (offered as
          // an attack reaction, like the other might-hero VI specialties).
          label: "+2 attack",
          trigger: { event: "UNIT_ATTACK_DECLARED", controller: "self" },
          effect: { type: "ADD_COMBAT_STAT", stat: "attack", amount: 2 }
        },
        {
          // Ongoing: +3 initiative on a chosen friendly unit for the combat.
          label: "+3 initiative for this Combat",
          combatOnly: true,
          target: { type: "friendly-unit" },
          effect: {
            type: "CREATE_INITIATIVE_BUFF",
            name: "Elementals VI",
            amount: 3,
            duration: { type: "combat" },
            polarity: "positive",
            removable: false
          }
        }
      ]
    },
    // Art-less (no shipped scan) — rendered natively, like .1/.4 above.
    implementationStatus: "implemented",
    source: heroSource("erdamon")
  },
  // Monere (Magic Elementals): I = +1 attack/defence; IV = +1 initiative for
  // the combat — both doubled for the Magic Elementals unit; VI = +2 attack OR
  // +2 power (both one-shot instants, no doubling).
  // Art-less (no shipped scan) — native renderer + Magic Elemental portrait.
  "specialty.monere.1": withoutArt(towerAttackOrDefenseSpecialty("monere", "Magic Elementals", 1, "Magic Elementals")),
  "specialty.monere.4": withoutArt(unitInitiativeSpecialty("monere", "Magic Elementals", 4, 1, "Magic Elementals")),
  "specialty.monere.6": {
    id: "specialty.monere.6",
    name: "Magic Elementals VI",
    kind: "hero-specialty",
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    tags: [
      "hero-specialty",
      "instant",
      "monere",
      "Your selected unit gains +2 attack. — OR — +2 power."
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "+2 attack",
          trigger: { event: "UNIT_ATTACK_DECLARED", controller: "self" },
          effect: { type: "ADD_COMBAT_STAT", stat: "attack", amount: 2 }
        },
        {
          label: "+2 power",
          trigger: { event: "SPELL_CAST_STARTED", controller: "self" },
          effect: { type: "ADD_SPELL_POWER", amount: 2 }
        }
      ]
    },
    // Art-less (no shipped scan) — rendered natively, like .1/.4 above.
    implementationStatus: "implemented",
    source: heroSource("monere")
  },
  // Pasis (Elementals generalist): every bonus doubles for any "… Elementals"
  // unit (the "an Elementals unit" family descriptor). I = +1 initiative for
  // the combat; IV = +1 attack/defence; VI = +1 HP for the combat.
  // Art-less (no shipped scan) — native renderer + Energy Elemental portrait.
  "specialty.pasis.1": withoutArt(unitInitiativeSpecialty("pasis", "Elementals", 1, 1, "an Elementals unit")),
  "specialty.pasis.4": withoutArt(towerAttackOrDefenseSpecialty("pasis", "Elementals", 4, "an Elementals unit")),
  "specialty.pasis.6": withoutArt(towerHealthSpecialty("pasis", "Elementals", 6, 1, "an Elementals unit")),

  // ---- Conflux Elementalist (Luna — the Fire Wall specialist) -------------
  // I/VI place a Fire Wall token (this card or a token) on an empty space for
  // the Combat, biting any unit that stops on it and any ground/ranged unit
  // passing through for a FIXED 1 (I) / 3 (VI) damage — the SAME engine token as
  // the Fire Wall spell (`PLACE_FIRE_WALL_FIXED`). IV is the spell-economy "OR":
  // take a card from your discard pile (modelled as a map play, exactly like
  // Adelaide IV — the engine's TAKE_FROM_DISCARD resolves through the map reward
  // queue) — OR — +2 Power on a Spell you are casting (a SPELL_CAST_STARTED
  // reaction, like Monere VI).
  "specialty.luna.1": {
    id: "specialty.luna.1",
    name: "Fire Wall I",
    kind: "hero-specialty",
    timing: "combat",
    phaseLimit: ["combat"],
    tags: [
      "hero-specialty",
      "combat",
      "luna",
      "fire-wall",
      "For this Combat, place this card or a Fire Wall token on an empty space. Deal 1 damage to any unit starting its turn here or stopping here, and to any ground or ranged unit passing through."
    ],
    target: { type: "empty-space" },
    effect: { type: "PLACE_FIRE_WALL_FIXED", damage: 1 },
    // Art-less (no shipped scan) — rendered natively with the Fire Wall symbol.
    implementationStatus: "implemented",
    source: heroSource("luna")
  },
  "specialty.luna.4": {
    id: "specialty.luna.4",
    name: "Fire Wall IV",
    kind: "hero-specialty",
    timing: "instant",
    tags: [
      "hero-specialty",
      "instant",
      "luna",
      "fire-wall",
      "Instant: Take one card from your discard pile into your hand. — OR — Instant: +2 Power."
    ],
    target: { type: "none" },
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Take a card from your discard pile",
          mapOnly: true,
          effect: { type: "TAKE_FROM_DISCARD", count: 1 }
        },
        {
          label: "+2 Power",
          trigger: { event: "SPELL_CAST_STARTED", controller: "self" },
          effect: { type: "ADD_SPELL_POWER", amount: 2 }
        }
      ]
    },
    // Art-less (no shipped scan) — rendered natively with the Fire Wall symbol.
    implementationStatus: "implemented",
    source: heroSource("luna")
  },
  "specialty.luna.6": {
    id: "specialty.luna.6",
    name: "Fire Wall VI",
    kind: "hero-specialty",
    timing: "combat",
    phaseLimit: ["combat"],
    tags: [
      "hero-specialty",
      "combat",
      "luna",
      "fire-wall",
      "For this Combat, place this card or a Fire Wall token on an empty space. Deal 3 damage to any unit starting its turn here or stopping here, and to any ground or ranged unit passing through."
    ],
    target: { type: "empty-space" },
    effect: { type: "PLACE_FIRE_WALL_FIXED", damage: 3 },
    // Art-less (no shipped scan) — rendered natively with the Fire Wall symbol.
    implementationStatus: "implemented",
    source: heroSource("luna")
  },

  // ---- Conflux Elementalist (Ciele — the Magic Arrow specialist) ---------
  // Magic Arrow is a starting-only Spell (every hero owns one), so Ciele's whole
  // specialty recurs it from the discard pile. Per the wiki:
  //  I  — Instant: take a Magic Arrow from your discard pile into your hand.
  //       — OR — Instant: +1 Power.
  //  IV — Instant: take a Magic Arrow from your discard pile and cast it; it does
  //       NOT count toward your per-Combat-round Spell limit. — OR — +1 Power.
  //  VI — Instant: the selected (enemy) unit suffers 2 damage. — OR — +2 Power.
  // I's recall is a map play (TAKE_FROM_DISCARD filtered to Magic Arrow, exactly
  // like Luna IV's discard recall). IV's free cast reuses the Helm of the
  // Alabaster Unicorn's CAST_FROM_SPELL_DISCARD pipeline (full Power scaling +
  // Magic-Arrow / spell immunity, sourced from the discard, doesn't count toward
  // the limit), but `spellId`-filtered to Magic Arrow and consuming the specialty
  // to the discard (not removed). VI reuses DAMAGE_CHOSEN_ENEMIES (1 enemy, 2). The
  // +Power sides are SPELL_CAST_STARTED reactions, like Monere VI / Luna IV.
  "specialty.ciele.1": withoutArt({
    id: "specialty.ciele.1",
    name: "Magic Arrow I",
    kind: "hero-specialty",
    timing: "instant",
    tags: [
      "hero-specialty",
      "instant",
      "ciele",
      "Instant: Take a Magic Arrow spell from your discard pile and put it into your hand. — OR — Instant: +1 Power."
    ],
    target: { type: "none" },
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Take a Magic Arrow from your discard pile",
          mapOnly: true,
          effect: { type: "TAKE_FROM_DISCARD", count: 1, filter: "magic-arrow" }
        },
        {
          label: "+1 Power",
          trigger: { event: "SPELL_CAST_STARTED", controller: "self" },
          effect: { type: "ADD_SPELL_POWER", amount: 1 }
        }
      ]
    },
    implementationStatus: "implemented",
    source: heroSource("ciele")
  }),
  "specialty.ciele.4": withoutArt({
    id: "specialty.ciele.4",
    name: "Magic Arrow IV",
    kind: "hero-specialty",
    timing: "instant",
    tags: [
      "hero-specialty",
      "instant",
      "ciele",
      "Instant: Take a Magic Arrow spell from your discard pile and cast it. This spell does not count toward your Spell limit per Combat round. — OR — Instant: +1 Power."
    ],
    target: { type: "none" },
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Cast a Magic Arrow from your discard pile (free)",
          combatOnly: true,
          effect: { type: "CAST_FROM_SPELL_DISCARD", spellId: "spell.magic_arrow" }
        },
        {
          label: "+1 Power",
          trigger: { event: "SPELL_CAST_STARTED", controller: "self" },
          effect: { type: "ADD_SPELL_POWER", amount: 1 }
        }
      ]
    },
    implementationStatus: "implemented",
    source: heroSource("ciele")
  }),
  "specialty.ciele.6": withoutArt({
    id: "specialty.ciele.6",
    name: "Magic Arrow VI",
    kind: "hero-specialty",
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    tags: [
      "hero-specialty",
      "instant",
      "ciele",
      "Instant: The selected unit suffers 2 damage. — OR — Instant: +2 Power."
    ],
    target: { type: "none" },
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "An enemy unit suffers 2 damage",
          combatOnly: true,
          effect: { type: "DAMAGE_CHOSEN_ENEMIES", count: 1, amount: 2 }
        },
        {
          label: "+2 Power",
          trigger: { event: "SPELL_CAST_STARTED", controller: "self" },
          effect: { type: "ADD_SPELL_POWER", amount: 2 }
        }
      ]
    },
    implementationStatus: "implemented",
    source: heroSource("ciele")
  }),

  // ---- Conflux Elementalist (Tarnum — the Enchanters specialist) ---------
  // Wiki (en.homm3bg.wiki/heroes/tarnum_conflux): Elementalist, A0 D0 P2 K3,
  // starting ability Wisdom, specialty Enchanters.
  //  I  — Search(1) Spell; keep the found Spell OR Remove it from the game.
  //  IV — Pay 10 gold to fetch the unique neutral Enchanters card (only 1 at a
  //       time) — OR — Draw a card.
  //  VI — Search(1) the Spell deck twice into hand; you may immediately cast
  //       one/both for free OVER the per-Combat-round Spell limit, returning each
  //       cast Spell to the Spell deck top or its discard pile (your choice).
  // I reuses CARD_DECK_SEARCH with the new allowRemove flag; IV reuses
  // CONVERT_ARMY_UNIT with goldCost (no unit traded in); VI is the dedicated
  // TARNUM_OVERLIMIT_SEARCH over-limit multi-cast effect.
  "specialty.tarnum_conflux.1": withoutArt({
    id: "specialty.tarnum_conflux.1",
    name: "Enchanters I",
    kind: "hero-specialty",
    timing: "map",
    tags: [
      "hero-specialty",
      "map",
      "tarnum_conflux",
      "enchanters",
      "Search(1) Spell. You can Remove this card instead of taking it into your hand."
    ],
    target: { type: "none" },
    effect: { type: "CARD_DECK_SEARCH", deck: "spells", count: 1, allowRemove: true },
    implementationStatus: "implemented",
    source: heroSource("tarnum_conflux")
  }),
  "specialty.tarnum_conflux.4": withoutArt({
    id: "specialty.tarnum_conflux.4",
    name: "Enchanters IV",
    kind: "hero-specialty",
    timing: "map",
    tags: [
      "hero-specialty",
      "map",
      "tarnum_conflux",
      "enchanters",
      "Pay 10 gold, then find the Enchanters card in the Neutral Unit deck and add it to your Unit deck. You can control only 1 Enchanters unit at a time. — OR — Draw a card."
    ],
    target: { type: "none" },
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Pay 10 gold → take the Enchanters",
          mapOnly: true,
          effect: {
            type: "CONVERT_ARMY_UNIT",
            toUnitDefId: "neutral.enchanters",
            toTier: "gold",
            unique: true,
            goldCost: 10
          }
        },
        {
          label: "Draw a card",
          effect: { type: "DRAW_CARDS", amount: 1 }
        }
      ]
    },
    implementationStatus: "implemented",
    source: heroSource("tarnum_conflux")
  }),
  // VI is an Instant: it may be played on your own turn, off-turn in an instant
  // window, OR as a reaction inside an open attack window (search-and-cast in the
  // same window — playing it re-derives that window's offers). Each of the two
  // Searches picks ONE Spell deck — basic or expert — to draw 1 card from (the
  // TARNUM_SEARCH per-search deck choice). A Searched spell then casts over the
  // limit only when "their type allows it" in the current window: a combat spell
  // (Fireball) on your own turn, a trigger-free instant anytime, and an
  // attack/defense-changing reaction instant (Bless, Curse, Bloodlust…) in the
  // instant/reaction window when an attack is declared. One that does not fit the
  // open window just stays in hand. Each cast spell returns to the shared Spell
  // deck top OR its discard pile (the caster's choice, so the order is yours).
  "specialty.tarnum_conflux.6": withoutArt({
    id: "specialty.tarnum_conflux.6",
    name: "Enchanters VI",
    kind: "hero-specialty",
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    tags: [
      "hero-specialty",
      "instant",
      "tarnum_conflux",
      "enchanters",
      "Search(1) Spell twice. If their type allows it, and you have enough power available, you can immediately cast one or both of these spells, even if you already cast a spell this round. Place each spell you use this way on the top of the Spell deck or on its discard pile in any order."
    ],
    target: { type: "none" },
    effect: { type: "TARNUM_OVERLIMIT_SEARCH", count: 2 },
    implementationStatus: "implemented",
    source: heroSource("tarnum_conflux")
  }),

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
  // machinery (includeCenter: false). The Frost Ring is an Instant (combatAnytime):
  // playable on your own turn AND off-turn when an enemy unit's activation starts
  // or ends. IV: a map play that returns 1 Spell or Specialty card from your
  // discard pile to your hand.
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
      "Instant (any time, incl. an enemy unit's turn start or end of its move): discard 1 card, then target a space on the Combat board: every unit adjacent to that space (not the space itself, friend or foe) takes 1 damage."
    ],
    target: { type: "any-space" },
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Discard 1 card: 1 damage to every unit adjacent to a space",
          combatAnytime: true,
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
      "Instant (any time, incl. an enemy unit's turn start or end of its move): discard 2 cards, then target a space on the Combat board: every unit adjacent to that space (not the space itself, friend or foe) takes 2 damage."
    ],
    target: { type: "any-space" },
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Discard 2 cards: 2 damage to every unit adjacent to a space",
          combatAnytime: true,
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
  },

  // ---- Bulwark heroes (expansion; fan faction, placeholder art) ----------
  // Dhuin (Chieftain): Snow Elves specialist — the standard might unit-buff trio
  // (Catherine pattern). Creyle (Chieftain): the same for Mammoths.
  "specialty.dhuin.1": withoutArt(mightSpecialtyOne("dhuin", "Snow Elves", "Snow Elves")),
  "specialty.dhuin.4": withoutArt(unitHealthSpecialty("dhuin", "Snow Elves", 4, 1, "Snow Elves")),
  "specialty.dhuin.6": withoutArt(unitInitiativeSpecialty("dhuin", "Snow Elves", 6, 1, "Snow Elves")),
  "specialty.creyle.1": withoutArt(mightSpecialtyOne("creyle", "Mammoths", "Mammoths")),
  "specialty.creyle.4": withoutArt(unitHealthSpecialty("creyle", "Mammoths", 4, 1, "Mammoths")),
  "specialty.creyle.6": withoutArt(unitInitiativeSpecialty("creyle", "Mammoths", 6, 1, "Mammoths")),

  // Glacius (Elder): the Frost Ring Elementalist — Adelaide's Frost-Ring
  // machinery (AREA_DAMAGE_PICK_ADJACENT, includeCenter:false). IV is a
  // spell-economy choice (recall a Spell/Specialty OR +2 Power on the next cast).
  "specialty.glacius.1": {
    id: "specialty.glacius.1",
    name: "Frost Ring I",
    kind: "hero-specialty",
    timing: "combat",
    phaseLimit: ["combat"],
    tags: [
      "hero-specialty",
      "combat",
      "glacius",
      "frost-ring",
      "Instant (any time, incl. an enemy unit's turn start or end of its move): discard 1 card, then target a space; every unit adjacent to it (not the space itself, friend or foe) takes 1 damage."
    ],
    target: { type: "any-space" },
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Discard 1 card: 1 damage to every unit adjacent to a space",
          combatAnytime: true,
          cost: { discardCards: 1 },
          effect: { type: "AREA_DAMAGE_PICK_ADJACENT", amount: 1, includeCenter: false, adjacentPicks: 4 }
        }
      ]
    },
    implementationStatus: "implemented",
    source: heroSource("glacius")
  },
  "specialty.glacius.4": {
    id: "specialty.glacius.4",
    name: "Frost Ring IV",
    kind: "hero-specialty",
    timing: "instant",
    tags: [
      "hero-specialty",
      "glacius",
      "frost-ring",
      "Instant: take a Spell or Specialty card from your discard pile. — OR — Instant: +2 Power on your next spell this Combat."
    ],
    target: { type: "none" },
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Take a Spell or Specialty card from your discard pile",
          mapOnly: true,
          effect: { type: "TAKE_FROM_DISCARD", count: 1, filter: "spell-or-specialty" }
        },
        {
          label: "+2 Power",
          trigger: { event: "SPELL_CAST_STARTED", controller: "self" },
          effect: { type: "ADD_SPELL_POWER", amount: 2 }
        }
      ]
    },
    implementationStatus: "implemented",
    source: heroSource("glacius")
  },
  "specialty.glacius.6": {
    id: "specialty.glacius.6",
    name: "Frost Ring VI",
    kind: "hero-specialty",
    timing: "combat",
    phaseLimit: ["combat"],
    tags: [
      "hero-specialty",
      "combat",
      "glacius",
      "frost-ring",
      "Instant (any time, incl. an enemy unit's turn start or end of its move): discard 1 card, then target a space; every unit adjacent to it (not the space itself, friend or foe) takes 2 damage."
    ],
    target: { type: "any-space" },
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Discard 1 card: 2 damage to every unit adjacent to a space",
          combatAnytime: true,
          cost: { discardCards: 1 },
          effect: { type: "AREA_DAMAGE_PICK_ADJACENT", amount: 2, includeCenter: false, adjacentPicks: 4 }
        }
      ]
    },
    implementationStatus: "implemented",
    source: heroSource("glacius")
  },

  // Kriv (Elder): the Rune-synergy hero — each level banks Runes (a nerfed 1/2/3)
  // to climb the Bulwark Rune track. EVERY rune-gain side is BOTH a normal combat
  // instant AND a REACTION to an enemy attack (trigger UNIT_ATTACK_DECLARED /
  // "opponent"), so the Bulwark player can bank the Rune the instant the enemy
  // strikes — crossing a threshold then turns its army-wide buff on BEFORE that
  // attack resolves (the "receive the buff earlier" play). After the nerf:
  //   I  — gain 1 Rune AND draw 1 card (one bundled effect; react-or-play).
  //   IV — gain 2 Runes AND draw 1 card (react-or-play) — OR — the lone map
  //        "Rune-Empowered" head-start (GAIN_STARTING_RUNES +1, until the next
  //        Resource round).
  //   VI — gain 3 Runes (react-or-play) — OR — draw 2 cards.
  // The GAIN_RUNES / GAIN_STARTING_RUNES options are offered only to a Bulwark
  // caster (gated to faction "bulwark" in legal-actions); the draws are universal.
  "specialty.kriv.1": {
    id: "specialty.kriv.1",
    name: "Runes I",
    kind: "hero-specialty",
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    tags: [
      "hero-specialty",
      "kriv",
      "runes",
      "Instant (Combat): gain 1 Rune AND draw 1 card — playable on your turn OR in reaction to an enemy attack."
    ],
    target: { type: "none" },
    effect: {
      type: "CHOOSE_ONE",
      options: [
        { label: "Gain 1 Rune and draw 1 card", combatOnly: true, effect: { type: "GAIN_RUNES", amount: 1, drawCards: 1 } },
        {
          label: "React to an enemy attack: gain 1 Rune and draw 1 card",
          trigger: { event: "UNIT_ATTACK_DECLARED", controller: "opponent" },
          effect: { type: "GAIN_RUNES", amount: 1, drawCards: 1 }
        }
      ]
    },
    implementationStatus: "implemented",
    source: heroSource("kriv")
  },
  "specialty.kriv.4": {
    id: "specialty.kriv.4",
    name: "Runes IV",
    kind: "hero-specialty",
    timing: "instant",
    tags: [
      "hero-specialty",
      "kriv",
      "runes",
      "Instant (Combat): gain 2 Runes AND draw 1 card — on your turn OR in reaction to an enemy attack. — OR — (Map) become Rune-Empowered: +1 starting Rune each combat until your next Resource round."
    ],
    target: { type: "none" },
    effect: {
      type: "CHOOSE_ONE",
      options: [
        { label: "Gain 2 Runes and draw 1 card", combatOnly: true, effect: { type: "GAIN_RUNES", amount: 2, drawCards: 1 } },
        {
          label: "React to an enemy attack: gain 2 Runes and draw 1 card",
          trigger: { event: "UNIT_ATTACK_DECLARED", controller: "opponent" },
          effect: { type: "GAIN_RUNES", amount: 2, drawCards: 1 }
        },
        {
          label: "Rune-Empowered: +1 starting Rune each combat (until next Resource round)",
          mapOnly: true,
          effect: { type: "GAIN_STARTING_RUNES", amount: 1 }
        }
      ]
    },
    implementationStatus: "implemented",
    source: heroSource("kriv")
  },
  "specialty.kriv.6": {
    id: "specialty.kriv.6",
    name: "Runes VI",
    kind: "hero-specialty",
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    tags: [
      "hero-specialty",
      "kriv",
      "runes",
      "Instant (Combat): gain 3 Runes — on your turn OR in reaction to an enemy attack. — OR — draw 2 cards."
    ],
    target: { type: "none" },
    effect: {
      type: "CHOOSE_ONE",
      options: [
        { label: "Gain 3 Runes", combatOnly: true, effect: { type: "GAIN_RUNES", amount: 3 } },
        {
          label: "React to an enemy attack: gain 3 Runes",
          trigger: { event: "UNIT_ATTACK_DECLARED", controller: "opponent" },
          effect: { type: "GAIN_RUNES", amount: 3 }
        },
        { label: "Draw 2 cards", effect: { type: "DRAW_CARDS", amount: 2 } }
      ]
    },
    implementationStatus: "implemented",
    source: heroSource("kriv")
  },

  // Eikthurn (Chieftain): Yetis specialist — the standard might unit-buff trio
  // (Catherine/Dhuin pattern): I is the +1 attack/defense rider doubled for Yetis,
  // IV adds +1 max HP (×2 Yetis), VI a +1 initiative buff (×2 Yetis).
  "specialty.eikthurn.1": withoutArt(mightSpecialtyOne("eikthurn", "Yetis", "Yetis")),
  "specialty.eikthurn.4": withoutArt(unitHealthSpecialty("eikthurn", "Yetis", 4, 1, "Yetis")),
  "specialty.eikthurn.6": withoutArt(unitInitiativeSpecialty("eikthurn", "Yetis", 6, 1, "Yetis")),

  // Oidana (Elder): the diplomat. Her starting ability is Diplomacy; each specialty
  // is a CHOOSE_ONE. The card-draw side (DRAW_CARDS, a trigger-free instant) scales
  // 1 / 2 / 2. The OTHER side scales with her Diplomacy mastery:
  //   I  — Map: draw 1 Neutral Unit card (DIPLOMACY_RECRUIT maxDraws 1), recruit one.
  //   IV — Map: draw up to 2 Neutral Unit cards (maxDraws 2), recruit one for 4 gold
  //        less (goldReduction 4 — applied to the affordability check, label AND spend).
  //   VI — Combat (ongoing): +1 Attack to every NEUTRAL (Diplomacy-recruited) unit she
  //        controls, for the whole battle (CREATE_VARIANT_ATTACK_BUFF variant "neutral").
  // All three sides are engine-wired (openDiplomacyRecruit / reduceGoldCost / the
  // player-scoped variant-gated active effect) and covered in bulwark-heroes.test.ts.
  "specialty.oidana.1": {
    id: "specialty.oidana.1",
    name: "Diplomacy I",
    kind: "hero-specialty",
    timing: "instant",
    tags: ["hero-specialty", "instant", "oidana", "diplomacy", "Instant: draw 1 card. — OR — Map: draw 1 Neutral Unit card, then recruit one (pay its cost)."],
    target: { type: "none" },
    effect: {
      type: "CHOOSE_ONE",
      options: [
        { label: "Draw 1 card", effect: { type: "DRAW_CARDS", amount: 1 } },
        { label: "Diplomacy: draw 1 Neutral Unit card, then recruit one (pay its cost)", mapOnly: true, effect: { type: "DIPLOMACY_RECRUIT", maxDraws: 1 } }
      ]
    },
    implementationStatus: "implemented",
    source: heroSource("oidana")
  },
  "specialty.oidana.4": {
    id: "specialty.oidana.4",
    name: "Diplomacy IV",
    kind: "hero-specialty",
    timing: "instant",
    tags: ["hero-specialty", "instant", "oidana", "diplomacy", "Instant: draw 2 cards. — OR — Map: draw up to 2 Neutral Unit cards, then recruit one (pay its cost, −4 gold)."],
    target: { type: "none" },
    effect: {
      type: "CHOOSE_ONE",
      options: [
        { label: "Draw 2 cards", effect: { type: "DRAW_CARDS", amount: 2 } },
        { label: "Diplomacy: draw up to 2 Neutral Unit cards, then recruit one (4 gold off)", mapOnly: true, effect: { type: "DIPLOMACY_RECRUIT", maxDraws: 2, goldReduction: 4 } }
      ]
    },
    implementationStatus: "implemented",
    source: heroSource("oidana")
  },
  "specialty.oidana.6": {
    id: "specialty.oidana.6",
    name: "Diplomacy VI",
    kind: "hero-specialty",
    timing: "instant",
    tags: ["hero-specialty", "instant", "oidana", "diplomacy", "Instant: draw 2 cards. — OR — Combat (ongoing): +1 Attack to every neutral unit you control, all rounds."],
    target: { type: "none" },
    effect: {
      type: "CHOOSE_ONE",
      options: [
        { label: "Draw 2 cards", effect: { type: "DRAW_CARDS", amount: 2 } },
        {
          label: "Ongoing: +1 Attack to all your neutral units (whole battle)",
          combatOnly: true,
          effect: { type: "CREATE_VARIANT_ATTACK_BUFF", name: "Diplomatic Rally", amount: 1, variant: "neutral" }
        }
      ]
    },
    implementationStatus: "implemented",
    source: heroSource("oidana")
  },

  // ---- Additional heroes, batch 2 (fan-wiki, real board art) -------------
  // Lord Haart (Castle, Knight): the Estates / gold-economy specialist. Every
  // level is a map play that gains a flat amount of gold (GAIN_RESOURCES).
  "specialty.lord_haart.1": estatesGoldSpecialty(1, 2),
  "specialty.lord_haart.4": estatesGoldSpecialty(4, 3),
  "specialty.lord_haart.6": estatesGoldSpecialty(6, 5),

  // Jeddite (Dungeon, Warlock): the Mysterious Warlock. I/VI dig the top 3/4
  // cards of your deck and keep every Spell + Specialty (DECK_DIG_KEEP_MATCHING);
  // IV is a lethal-save (CANCEL_LETHAL_ATTACK) costing Power 0/1/2 for a
  // bronze/silver/gold unit, reusing the shared lethal-save window.
  "specialty.jeddite.1": warlockDigSpecialty(1, 3),
  "specialty.jeddite.4": lethalSaveSpecialty("jeddite", "Mysterious Warlock", 4, {
    bronze: 0,
    silver: 1,
    gold: 2
  }),
  "specialty.jeddite.6": warlockDigSpecialty(6, 4),

  // Tazar (Fortress, Beastmaster): the War Hero. I = +2 defense reaction (no
  // signature unit); IV = a chosen unit gains +1 defense for the Combat
  // (CREATE_DEFENSE_BUFF); VI = remove 1 OR discard 3 cards to draw the top of
  // the Artifact deck (DRAW_TOP_ARTIFACT).
  "specialty.tazar.1": armorerSpecialty("tazar", 1, 2, "War Hero"),
  "specialty.tazar.4": {
    id: "specialty.tazar.4",
    name: "War Hero IV",
    kind: "hero-specialty",
    timing: "combat",
    phaseLimit: ["combat"],
    tags: [
      "hero-specialty",
      "combat",
      "tazar",
      "war-hero",
      "For this Combat, your selected unit gains +1 defense."
    ],
    target: { type: "friendly-unit" },
    effect: {
      type: "CREATE_DEFENSE_BUFF",
      name: "War Hero IV",
      amount: 1,
      duration: { type: "combat" },
      polarity: "positive",
      removable: false
    },
    assets: {
      cardImage: specialtyCardImage("tazar", 4),
      imageAlt: "War Hero level IV specialty card"
    },
    implementationStatus: "implemented",
    source: heroSource("tazar")
  },
  "specialty.tazar.6": {
    id: "specialty.tazar.6",
    name: "War Hero VI",
    kind: "hero-specialty",
    timing: "instant",
    tags: [
      "hero-specialty",
      "instant",
      "tazar",
      "war-hero",
      "From your hand, remove 1 card OR discard 3 cards to draw the top card of the Artifact deck."
    ],
    target: { type: "none" },
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Remove 1 card: draw the top Artifact card",
          mapOnly: true,
          cost: { discardCards: 1, removeCostCards: true },
          effect: { type: "DRAW_TOP_ARTIFACT" }
        },
        {
          label: "Discard 3 cards: draw the top Artifact card",
          mapOnly: true,
          cost: { discardCards: 3 },
          effect: { type: "DRAW_TOP_ARTIFACT" }
        }
      ]
    },
    assets: {
      cardImage: specialtyCardImage("tazar", 6),
      imageAlt: "War Hero level VI specialty card"
    },
    implementationStatus: "implemented",
    source: heroSource("tazar")
  },

  // Adrienne (Fortress, Witch): the Fire Magic specialist. I/VI add +1/+2 Power
  // to every Fire-school Spell she casts for the Combat (SPELL_SCHOOL_POWER_BONUS
  // via CREATE_ACTIVE_EFFECT); IV is a map play that Searches (3) her deck and
  // shuffles her discard pile back in (SEARCH_DECK_THEN_RESHUFFLE).
  "specialty.adrienne.1": fireMagicSpecialty(1, 1),
  "specialty.adrienne.4": {
    id: "specialty.adrienne.4",
    name: "Fire Magic IV",
    kind: "hero-specialty",
    timing: "instant",
    tags: [
      "hero-specialty",
      "instant",
      "adrienne",
      "fire-magic",
      "Search (3) your deck (keep 1 card), then shuffle your discard pile into your deck."
    ],
    target: { type: "none" },
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Search (3) your deck, then shuffle the discard into your deck",
          mapOnly: true,
          effect: { type: "SEARCH_DECK_THEN_RESHUFFLE", count: 3 }
        }
      ]
    },
    assets: {
      cardImage: specialtyCardImage("adrienne", 4),
      imageAlt: "Fire Magic level IV specialty card"
    },
    implementationStatus: "implemented",
    source: heroSource("adrienne")
  },
  "specialty.adrienne.6": fireMagicSpecialty(6, 2),

  // Vidomina (Necropolis, Necromancer): the Necromancy specialist. I/VI are
  // after-combat half-gold reinforces (NECROMANCY_REINFORCE, forced tier so the
  // expert crown is not needed): I = a bronze or silver unit, VI = any unit. IV
  // places the Horde of Skeletons on a Pack of Skeletons (TRANSFORM_UNIT, the
  // same stat-replacement as Sandro's Cloak: A3 D1 H2 I6, discarded on defeat).
  "specialty.vidomina.1": {
    id: "specialty.vidomina.1",
    name: "Necromancy I",
    kind: "hero-specialty",
    timing: "instant",
    tags: [
      "hero-specialty",
      "instant",
      "vidomina",
      "necromancy",
      "Play after winning a Combat other than a Quick Combat: reinforce a bronze or silver unit of your choice for half the gold cost (rounded down)."
    ],
    target: { type: "none" },
    effect: { type: "NECROMANCY_REINFORCE", forceMode: "basic" },
    assets: {
      cardImage: specialtyCardImage("vidomina", 1),
      imageAlt: "Necromancy level I specialty card"
    },
    implementationStatus: "implemented",
    source: heroSource("vidomina")
  },
  "specialty.vidomina.4": {
    id: "specialty.vidomina.4",
    name: "Necromancy IV",
    kind: "hero-specialty",
    timing: "instant",
    tags: [
      "hero-specialty",
      "vidomina",
      "transform",
      "Put this card on the Pack of Skeletons Unit card; it replaces the card's statistics (Horde of Skeletons) until defeated, then is discarded."
    ],
    // Identical transformation to Sandro's Cloak I (Horde of Skeletons, A3 D1
    // HP2 I6). Vidomina's keeps the printed 2 HP in both modes (the BINH +1 HP
    // house rule is scoped to Sandro's cards).
    effect: {
      type: "TRANSFORM_UNIT",
      targetUnitName: "Skeletons",
      targetVariants: ["pack"],
      newName: "Horde of Skeletons",
      attack: 3,
      defense: 1,
      health: 2,
      initiative: 6,
      cardImage: "/assets/hero_specialties-vidomina-4.webp"
    },
    assets: {
      cardImage: specialtyCardImage("vidomina", 4),
      imageAlt: "Necromancy level IV specialty card"
    },
    implementationStatus: "implemented",
    source: heroSource("vidomina")
  },
  "specialty.vidomina.6": {
    id: "specialty.vidomina.6",
    name: "Necromancy VI",
    kind: "hero-specialty",
    timing: "instant",
    tags: [
      "hero-specialty",
      "instant",
      "vidomina",
      "necromancy",
      "Play after winning a Combat other than a Quick Combat: reinforce any unit of your choice for half the gold cost (rounded down)."
    ],
    target: { type: "none" },
    effect: { type: "NECROMANCY_REINFORCE", forceMode: "expert" },
    assets: {
      cardImage: specialtyCardImage("vidomina", 6),
      imageAlt: "Necromancy level VI specialty card"
    },
    implementationStatus: "implemented",
    source: heroSource("vidomina")
  },

  // ---- Additional heroes, batch 3 ----------------------------------------
  // Valeska (Castle): the Marksmen specialist. I = +1 HP; IV = +1 A/D (both
  // doubled for a Marksmen unit); VI = re-fire a ranged unit (even if already
  // activated) or draw 2.
  "specialty.valeska.1": withoutArt(towerHealthSpecialty("valeska", "Marksmen", 1, 1, "Marksmen")),
  "specialty.valeska.4": withoutArt(towerAttackOrDefenseSpecialty("valeska", "Marksmen", 4, "Marksmen")),
  "specialty.valeska.6": withoutArt(activateRangedOrDrawSpecialty("valeska", "Marksmen", 6, 2)),
  // Ingham (Castle): the Zealots specialist. I = +1 A/D; IV = +1 HP (both
  // doubled for a Zealots unit); VI = your selected unit ignores Defense, or draw 1.
  "specialty.ingham.1": withoutArt(towerAttackOrDefenseSpecialty("ingham", "Zealots", 1, "Zealots")),
  "specialty.ingham.4": withoutArt(towerHealthSpecialty("ingham", "Zealots", 4, 1, "Zealots")),
  "specialty.ingham.6": withoutArt(ignoreDefenseOrDrawSpecialty("ingham", "Zealots", 6, 1)),
  // Lorelei (Dungeon): the Harpies specialist. I = +1 A/D; IV = +1 HP; VI = +2
  // attack on your attack — all doubled for a Harpies unit.
  "specialty.lorelei.1": withoutArt(towerAttackOrDefenseSpecialty("lorelei", "Harpies", 1, "Harpies")),
  "specialty.lorelei.4": withoutArt(towerHealthSpecialty("lorelei", "Harpies", 4, 1, "Harpies")),
  "specialty.lorelei.6": withoutArt(attackInstantSpecialty("lorelei", "Harpies", 6, 2, "Harpies")),
  // Septienna (Necropolis): the Death Ripple specialist. Each grade tier of
  // enemy units takes damage (I bronze, IV silver, VI golden+azure), or +Power
  // on a Spell you are casting.
  "specialty.septienna.1": withoutArt(deathRippleSpecialty(1, ["bronze"], 1, 1)),
  "specialty.septienna.4": withoutArt(deathRippleSpecialty(4, ["silver"], 1, 1)),
  "specialty.septienna.6": withoutArt(deathRippleSpecialty(6, ["gold", "azure"], 2, 2)),
  // Lord Haart (Necropolis): the Dread Knights specialist. I/VI reduce enemy
  // retaliation damage by 1/2 (doubled for Dread Knights); IV makes enemy
  // Retaliation Attacks against the chosen unit roll at disadvantage.
  "specialty.lord_haart_necropolis.1": retaliationReductionSpecialty(
    "lord_haart_necropolis",
    "Dread Knights",
    1,
    1,
    "Dread Knights"
  ),
  "specialty.lord_haart_necropolis.4": {
    id: "specialty.lord_haart_necropolis.4",
    name: "Dread Knights IV",
    kind: "hero-specialty",
    timing: "combat",
    phaseLimit: ["combat"],
    tags: [
      "hero-specialty",
      "combat",
      "lord_haart_necropolis",
      "For this Combat, when an enemy performs a Retaliation Attack against your selected unit, that attack rolls 2 Attack dice and resolves the lower outcome."
    ],
    target: { type: "friendly-unit" },
    effect: {
      type: "CREATE_ACTIVE_EFFECT",
      effect: {
        name: "Dread Knights IV",
        scope: "unit",
        duration: { type: "combat" },
        polarity: "positive",
        removable: false,
        modifiers: [{ type: "RETALIATION_AGAINST_DISADVANTAGE" }]
      }
    },
    assets: {
      cardImage: specialtyCardImage("lord_haart_necropolis", 4),
      imageAlt: "Dread Knights level IV specialty card"
    },
    implementationStatus: "implemented",
    source: heroSource("lord_haart_necropolis")
  },
  "specialty.lord_haart_necropolis.6": retaliationReductionSpecialty(
    "lord_haart_necropolis",
    "Dread Knights",
    6,
    2,
    "Dread Knights"
  ),

  // ---- Additional heroes, batch 4 ----------------------------------------
  // Placeholder-art wiki heroes (PC portrait, no specialty card faces) whose
  // I/IV/VI specialties are fully engine-wired and mutation-checked
  // (extra-heroes-batch4-specialties.test.ts). Each tackles a NEW mechanic:
  //  - Ivor (Rampart): forced attack dice (FORCE_ATTACK_ROLL) + doubling by
  //    unit TYPE (doubleForUnitType).
  //  - Tarnum (Castle): multi-target chosen-enemy damage (DAMAGE_CHOSEN_ENEMIES);
  //    reuses the Ballista engine (BALLISTA_SPECIALTY) for I/IV.
  //  - Merist (Fortress): adjacency-conditioned defense, a mass Defense-token
  //    grant (GRANT_DEFENSE_TOKENS) and the Defense-token-on-"0" aura
  //    (STONE_SKIN_AURA).

  // Ivor (Rampart, Ranger): the Elves specialist who bends the dice.
  // I: set all dice of the next attack roll (either side's) to "0".
  "specialty.ivor.1": withoutArt(
    forceAttackRollSpecialty("ivor", "Elves", 1, 0, "any", "Set all dice of the next attack roll to \"0\".")
  ),
  // IV: +1 attack OR +1 defense, doubled for a ranged unit (NEW doubleForUnitType).
  "specialty.ivor.4": withoutArt(attackOrDefenseByTypeSpecialty("ivor", "Elves", 4, "ranged", "a ranged unit")),
  // VI: +2 HP for the Combat (selected unit) — OR — set all dice of your own
  // attack roll to "+1" (the only value that maximises an attack, so the engine
  // realises "the values of your choice").
  "specialty.ivor.6": withoutArt({
    id: "specialty.ivor.6",
    name: "Elves VI",
    kind: "hero-specialty",
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    tags: [
      "hero-specialty",
      "instant",
      "ivor",
      "For this Combat, your selected unit's Health is increased by 2. — OR — Instead of rolling, set all dice of your attack roll to \"+1\"."
    ],
    target: { type: "friendly-unit" },
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "+2 Health for this Combat",
          combatOnly: true,
          target: { type: "friendly-unit" },
          effect: { type: "ADD_UNIT_MAX_HEALTH", amount: 2 }
        },
        {
          label: "Set all dice of your attack roll to \"+1\"",
          trigger: { event: "UNIT_ATTACK_DECLARED", controller: "self" },
          effect: { type: "FORCE_ATTACK_ROLL", value: 1 }
        }
      ]
    },
    implementationStatus: "implemented",
    source: heroSource("ivor")
  }),

  // Tarnum (Castle, Knight): the Ballista specialist (one of six Tarnum variants).
  // I: pay 5 gold to gain a Ballista (map) — OR — activate your Ballista (combat).
  "specialty.tarnum_castle.1": withoutArt({
    id: "specialty.tarnum_castle.1",
    name: "Ballista I",
    kind: "hero-specialty",
    timing: "instant",
    tags: [
      "hero-specialty",
      "instant",
      "tarnum_castle",
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
    source: heroSource("tarnum_castle")
  }),
  // IV: gain an extra Ballista for this Combat (discarded afterwards) — OR — draw 1.
  "specialty.tarnum_castle.4": withoutArt({
    id: "specialty.tarnum_castle.4",
    name: "Ballista IV",
    kind: "hero-specialty",
    timing: "combat",
    phaseLimit: ["combat"],
    tags: [
      "hero-specialty",
      "combat",
      "tarnum_castle",
      "ballista",
      "For this Combat, gain an additional Ballista, even if you already have one. — OR — Draw 1 card."
    ],
    target: { type: "none" },
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Gain an additional Ballista this Combat",
          combatOnly: true,
          effect: { type: "BALLISTA_SPECIALTY", grant: "combat" }
        },
        {
          label: "Draw 1 card",
          effect: { type: "DRAW_CARDS", amount: 1 }
        }
      ]
    },
    implementationStatus: "implemented",
    source: heroSource("tarnum_castle")
  }),
  // VI: choose 2 enemy units; each suffers 2 damage (NEW DAMAGE_CHOSEN_ENEMIES).
  "specialty.tarnum_castle.6": withoutArt({
    id: "specialty.tarnum_castle.6",
    name: "Ballista VI",
    kind: "hero-specialty",
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    tags: [
      "hero-specialty",
      "instant",
      "tarnum_castle",
      "ballista",
      "Choose 2 enemy units. Each of these units suffers 2 damage."
    ],
    target: { type: "none" },
    effect: { type: "DAMAGE_CHOSEN_ENEMIES", count: 2, amount: 2 },
    implementationStatus: "implemented",
    source: heroSource("tarnum_castle")
  }),

  // Merist (Fortress, Witch): the Stone Skin specialist — a defensive magic hero.
  // I: defense reaction — +1 defense to the attacked unit, +1 more if it is
  // orthogonally adjacent to the attacker (NEW extraIfAdjacentToAttacker).
  "specialty.merist.1": withoutArt({
    id: "specialty.merist.1",
    name: "Stone Skin I",
    kind: "hero-specialty",
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    tags: [
      "hero-specialty",
      "instant",
      "merist",
      "stone-skin",
      "Your selected unit gains +1 defense, and an additional +1 defense if it is adjacent to the attacker."
    ],
    trigger: { event: "UNIT_ATTACK_DECLARED", controller: "opponent" },
    effect: { type: "ADD_COMBAT_STAT", stat: "defense", amount: 1, extraIfAdjacentToAttacker: 1 },
    implementationStatus: "implemented",
    source: heroSource("merist")
  }),
  // IV: all your units gain a Defense token (NEW GRANT_DEFENSE_TOKENS).
  "specialty.merist.4": withoutArt({
    id: "specialty.merist.4",
    name: "Stone Skin IV",
    kind: "hero-specialty",
    timing: "combat",
    phaseLimit: ["combat"],
    tags: ["hero-specialty", "combat", "merist", "stone-skin", "All your units gain a Defense token."],
    target: { type: "none" },
    effect: { type: "GRANT_DEFENSE_TOKENS" },
    implementationStatus: "implemented",
    source: heroSource("merist")
  }),
  // VI: place a Defense token on all your units and, for this Combat, your
  // Defense tokens pay out on a "0" as well as a "+1" roll (NEW STONE_SKIN_AURA).
  "specialty.merist.6": withoutArt({
    id: "specialty.merist.6",
    name: "Stone Skin VI",
    kind: "hero-specialty",
    timing: "combat",
    phaseLimit: ["combat"],
    tags: [
      "hero-specialty",
      "combat",
      "merist",
      "stone-skin",
      "For this Combat, your Defense tokens provide the extra defense on a \"0\" or a \"+1\" roll. When played, place a Defense token on all your units."
    ],
    target: { type: "none" },
    effect: { type: "STONE_SKIN_AURA" },
    implementationStatus: "implemented",
    source: heroSource("merist")
  }),

  // ---- Additional heroes, batch 5 ---------------------------------------
  // Eight "Regular Stretch Goals 2024" heroes that complete every already-playable
  // Town's roster on the fan wiki. Their pages show only the deck-back placeholder
  // (no board scan, no specialty faces), so — like batch 3/4 — they ship the classic
  // PC portrait and face-less specialty cards (withoutArt). Every I/IV/VI specialty
  // runs in the engine and is mutation-checked (extra-heroes-batch5-specialties.test.ts).

  // Ash (Inferno, Heretic): the Bloodlust specialist — pumps a ground/flying unit's
  // attack but "places a Black cube" on it (it spends its Retaliation). I/VI are
  // instants on your declared attack; IV is an ongoing +2 attack / +1 initiative.
  "specialty.ash.1": withoutArt({
    id: "specialty.ash.1",
    name: "Bloodlust I",
    kind: "hero-specialty",
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    tags: [
      "hero-specialty",
      "instant",
      "ash",
      "bloodlust",
      "Instant: Your selected ground or flying unit gains +2 attack. Place a Black cube on that unit."
    ],
    trigger: { event: "UNIT_ATTACK_DECLARED", controller: "self" },
    effect: {
      type: "ADD_COMBAT_STAT",
      stat: "attack",
      amount: 2,
      unitTypes: ["ground", "flying"],
      placeBlackCube: true
    },
    implementationStatus: "implemented",
    source: heroSource("ash")
  }),
  "specialty.ash.4": withoutArt({
    id: "specialty.ash.4",
    name: "Bloodlust IV",
    kind: "hero-specialty",
    timing: "combat",
    phaseLimit: ["combat"],
    tags: [
      "hero-specialty",
      "combat",
      "ash",
      "bloodlust",
      "Ongoing: For this Combat, your selected ground or flying unit's attack is increased by 2 and its initiative is increased by 1. Place a Black cube on that unit."
    ],
    target: { type: "friendly-unit", unitTypes: ["ground", "flying"] },
    effect: {
      type: "CREATE_ACTIVE_EFFECT",
      effect: {
        name: "Bloodlust IV",
        scope: "unit",
        duration: { type: "combat" },
        polarity: "positive",
        removable: true,
        modifiers: [
          { type: "ATTACK_BONUS", amount: 2 },
          { type: "INITIATIVE_BONUS", amount: 1 }
        ]
      },
      placeBlackCube: true
    },
    implementationStatus: "implemented",
    source: heroSource("ash")
  }),
  "specialty.ash.6": withoutArt({
    id: "specialty.ash.6",
    name: "Bloodlust VI",
    kind: "hero-specialty",
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    tags: [
      "hero-specialty",
      "instant",
      "ash",
      "bloodlust",
      "Instant: Your selected ground or flying unit gains +3 attack and ignores Retaliation Attacks. Place a Black cube on that unit."
    ],
    trigger: { event: "UNIT_ATTACK_DECLARED", controller: "self" },
    effect: {
      type: "ADD_COMBAT_STAT",
      stat: "attack",
      amount: 3,
      unitTypes: ["ground", "flying"],
      placeBlackCube: true,
      ignoresRetaliation: true
    },
    implementationStatus: "implemented",
    source: heroSource("ash")
  }),

  // Gerwulf (Fortress, Beastmaster): a Ballista specialist. I matches the other
  // Ballista heroes (gain/activate). IV/VI add the "discard your Ballista to
  // inflict N damage on the selected unit" instant (NEW DISCARD_WAR_MACHINE_DAMAGE);
  // VI's ongoing side also lets you aim your Ballista (NEW BALLISTA_CHOOSE_TARGET).
  // The Ballista-discard damage is a true Instant (combatAnytime): besides your
  // own turn it may be played off-turn when an enemy unit's activation starts or
  // when it finishes its move. The free 1 damage (IV) and the ongoing aim (VI)
  // stay on your own turn only.
  "specialty.gerwulf.1": withoutArt({
    id: "specialty.gerwulf.1",
    name: "Ballista I",
    kind: "hero-specialty",
    timing: "instant",
    tags: [
      "hero-specialty",
      "instant",
      "gerwulf",
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
    source: heroSource("gerwulf")
  }),
  "specialty.gerwulf.4": withoutArt({
    id: "specialty.gerwulf.4",
    name: "Ballista IV",
    kind: "hero-specialty",
    timing: "combat",
    phaseLimit: ["combat"],
    tags: [
      "hero-specialty",
      "combat",
      "gerwulf",
      "ballista",
      "On your turn: the selected unit suffers 1 damage. — OR — Instant (any time, incl. an enemy unit's turn start or end of its move): discard your Ballista to inflict 2 damage on the selected enemy unit."
    ],
    target: { type: "none" },
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "An enemy unit suffers 1 damage",
          combatOnly: true,
          effect: { type: "DAMAGE_CHOSEN_ENEMIES", count: 1, amount: 1 }
        },
        {
          label: "Discard your Ballista: 2 damage to an enemy unit",
          combatOnly: true,
          combatAnytime: true,
          target: { type: "enemy-unit" },
          effect: { type: "DISCARD_WAR_MACHINE_DAMAGE", warMachineCardId: "war_machine.ballista", amount: 2 }
        }
      ]
    },
    implementationStatus: "implemented",
    source: heroSource("gerwulf")
  }),
  "specialty.gerwulf.6": withoutArt({
    id: "specialty.gerwulf.6",
    name: "Ballista VI",
    kind: "hero-specialty",
    timing: "combat",
    phaseLimit: ["combat"],
    tags: [
      "hero-specialty",
      "combat",
      "gerwulf",
      "ballista",
      "Ongoing (your turn): For this Combat, you can choose targets for your Ballista (if you have one). — OR — Instant (any time, incl. an enemy unit's turn start or end of its move): discard your Ballista to inflict 3 damage on the selected enemy unit."
    ],
    target: { type: "none" },
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "For this Combat, you choose your Ballista's targets",
          combatOnly: true,
          effect: {
            type: "CREATE_ACTIVE_EFFECT",
            effect: {
              name: "Ballista VI",
              scope: "player",
              duration: { type: "combat" },
              polarity: "positive",
              removable: false,
              modifiers: [{ type: "BALLISTA_CHOOSE_TARGET" }]
            }
          }
        },
        {
          label: "Discard your Ballista: 3 damage to an enemy unit",
          combatOnly: true,
          combatAnytime: true,
          target: { type: "enemy-unit" },
          effect: { type: "DISCARD_WAR_MACHINE_DAMAGE", warMachineCardId: "war_machine.ballista", amount: 3 }
        }
      ]
    },
    implementationStatus: "implemented",
    source: heroSource("gerwulf")
  }),

  // Tarnum (Dungeon, Overlord): the Dragons specialist. I is the shared might
  // specialty (doubles for Dragons, like Mutare). IV damages a whole vertical
  // line of 5 spaces (NEW DAMAGE_BATTLEFIELD_LINE). VI toggles a Dragons unit's
  // Black cube (NEW TOGGLE_RETALIATION_MARKER) or grants +2 attack on an attack.
  "specialty.tarnum_dungeon.1": withoutArt(mightSpecialtyOne("tarnum_dungeon", "Dragons", "a Dragons unit")),
  "specialty.tarnum_dungeon.4": withoutArt({
    id: "specialty.tarnum_dungeon.4",
    name: "Dragons IV",
    kind: "hero-specialty",
    timing: "combat",
    phaseLimit: ["combat"],
    tags: [
      "hero-specialty",
      "combat",
      "tarnum_dungeon",
      "dragons",
      "Choose a row (straight line of 5 consecutive spaces). Every unit in that row suffers 2 damage."
    ],
    target: { type: "any-space" },
    effect: { type: "DAMAGE_BATTLEFIELD_LINE", amount: 2 },
    implementationStatus: "implemented",
    source: heroSource("tarnum_dungeon")
  }),
  "specialty.tarnum_dungeon.6": withoutArt({
    id: "specialty.tarnum_dungeon.6",
    name: "Dragons VI",
    kind: "hero-specialty",
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    tags: [
      "hero-specialty",
      "instant",
      "tarnum_dungeon",
      "dragons",
      "Remove a Black cube from or place it on a Dragons unit. — OR — Your selected unit gains +2 attack."
    ],
    target: { type: "none" },
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Remove/place a Black cube on a Dragons unit",
          combatOnly: true,
          target: { type: "any-unit", unitName: "a Dragons unit" },
          effect: { type: "TOGGLE_RETALIATION_MARKER" }
        },
        {
          label: "+2 attack",
          trigger: { event: "UNIT_ATTACK_DECLARED", controller: "self" },
          effect: { type: "ADD_COMBAT_STAT", stat: "attack", amount: 2 }
        }
      ]
    },
    implementationStatus: "implemented",
    source: heroSource("tarnum_dungeon")
  }),

  // Sephinroth (Dungeon, Warlock): the Valuables specialist — a map economy hero.
  // Each level gains Valuables (NEW GAIN_RESOURCES.goldCost for I's "pay 2 gold")
  // with an instant alternative. The wiki notes the gain "can be improved by spell
  // power"; the engine has no map-phase hero Power, so the printed flat amounts run
  // (the note is not modeled).
  "specialty.sephinroth.1": withoutArt({
    id: "specialty.sephinroth.1",
    name: "Valuables I",
    kind: "hero-specialty",
    timing: "instant",
    tags: [
      "hero-specialty",
      "instant",
      "sephinroth",
      "valuables",
      "Pay 2 gold to gain 1 valuables. — OR — Draw 1 card."
    ],
    target: { type: "none" },
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Pay 2 gold to gain 1 valuables",
          mapOnly: true,
          effect: { type: "GAIN_RESOURCES", gain: { valuables: 1 }, goldCost: 2 }
        },
        {
          label: "Draw 1 card",
          effect: { type: "DRAW_CARDS", amount: 1 }
        }
      ]
    },
    implementationStatus: "implemented",
    source: heroSource("sephinroth")
  }),
  "specialty.sephinroth.4": withoutArt({
    id: "specialty.sephinroth.4",
    name: "Valuables IV",
    kind: "hero-specialty",
    timing: "instant",
    tags: [
      "hero-specialty",
      "instant",
      "sephinroth",
      "valuables",
      "Gain 1 valuables. — OR — +2 Power."
    ],
    target: { type: "none" },
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Gain 1 valuables",
          mapOnly: true,
          effect: { type: "GAIN_RESOURCES", gain: { valuables: 1 } }
        },
        {
          label: "+2 Power",
          trigger: { event: "SPELL_CAST_STARTED", controller: "self" },
          effect: { type: "ADD_SPELL_POWER", amount: 2 }
        }
      ]
    },
    implementationStatus: "implemented",
    source: heroSource("sephinroth")
  }),
  "specialty.sephinroth.6": withoutArt({
    id: "specialty.sephinroth.6",
    name: "Valuables VI",
    kind: "hero-specialty",
    timing: "instant",
    tags: [
      "hero-specialty",
      "instant",
      "sephinroth",
      "valuables",
      "Gain 2 valuables. — OR — Draw 2 cards."
    ],
    target: { type: "none" },
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Gain 2 valuables",
          mapOnly: true,
          effect: { type: "GAIN_RESOURCES", gain: { valuables: 2 } }
        },
        {
          label: "Draw 2 cards",
          effect: { type: "DRAW_CARDS", amount: 2 }
        }
      ]
    },
    implementationStatus: "implemented",
    source: heroSource("sephinroth")
  }),

  // ---- Additional heroes, batch 6 ---------------------------------------
  // The four remaining fan-wiki heroes (minus Tarnum Conflux) that complete every
  // playable Town's roster: Octavia (Inferno) & Melodia (Rampart) — economic
  // Resource-die / Fortune specialists — plus the Rampart & Fortress Tarnum
  // variants. Placeholder-art wiki heroes → PC portraits + face-less specialty
  // cards (withoutArt), like batches 4–5. Every specialty runs in the engine
  // (extra-heroes-batch6-specialties.test.ts).

  // Octavia (Inferno, Demoniac, A2 D2 P1 K1, Scholar): the "Gold" Resource-die
  // specialist. I's signature half is a REACTION offered the moment a Resource
  // die is rolled (octaviaGoldReactionOption) — discard this card to set a rolled
  // die to "6 gold"; the card itself encodes only its OR alternative "Draw 1
  // card". IV/VI roll Resource dice on the map (RESOURCE_FORTUNE_PLAY) — VI rolls
  // 2 and resolves one through the existing roll-resource CHOOSE_ONE — each with a
  // combat / draw alternative.
  "specialty.octavia.1": withoutArt({
    id: "specialty.octavia.1",
    name: "Gold I",
    kind: "hero-specialty",
    timing: "instant",
    tags: [
      "hero-specialty",
      "instant",
      "octavia",
      "gold",
      "Play after rolling a Resource die to set 1 Resource die to 6 gold. — OR — Draw 1 card.",
      // engine: the "set a die to 6 gold" half is a held-card reaction inside the
      // Resource-die roll (octaviaGoldReactionOption); this card object encodes
      // only the OR alternative, "Draw 1 card".
    ],
    target: { type: "none" },
    effect: {
      type: "CHOOSE_ONE",
      options: [{ label: "Draw 1 card", effect: { type: "DRAW_CARDS", amount: 1 } }]
    },
    implementationStatus: "implemented",
    source: heroSource("octavia")
  }),
  "specialty.octavia.4": withoutArt({
    id: "specialty.octavia.4",
    name: "Gold IV",
    kind: "hero-specialty",
    timing: "instant",
    tags: [
      "hero-specialty",
      "instant",
      "octavia",
      "gold",
      "Roll and resolve 1 Resource die. — OR — Your selected unit gains +1 attack."
    ],
    target: { type: "none" },
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Roll and resolve 1 Resource die",
          mapOnly: true,
          effect: { type: "RESOURCE_FORTUNE_PLAY", rollResourceDice: 1 }
        },
        {
          label: "+1 attack",
          trigger: { event: "UNIT_ATTACK_DECLARED", controller: "self" },
          effect: { type: "ADD_COMBAT_STAT", stat: "attack", amount: 1 }
        }
      ]
    },
    implementationStatus: "implemented",
    source: heroSource("octavia")
  }),
  "specialty.octavia.6": withoutArt({
    id: "specialty.octavia.6",
    name: "Gold VI",
    kind: "hero-specialty",
    timing: "instant",
    tags: [
      "hero-specialty",
      "instant",
      "octavia",
      "gold",
      "Roll 2 Resource dice and resolve one of them. — OR — Draw 2 cards."
    ],
    target: { type: "none" },
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Roll 2 Resource dice and resolve one",
          mapOnly: true,
          effect: { type: "RESOURCE_FORTUNE_PLAY", rollResourceDice: 2 }
        },
        {
          label: "Draw 2 cards",
          effect: { type: "DRAW_CARDS", amount: 2 }
        }
      ]
    },
    implementationStatus: "implemented",
    source: heroSource("octavia")
  }),

  // Melodia (Rampart, Druid, A0 D2 P1 K2, Luck): the "Fortune" specialist —
  // single-option (no OR) economic map plays. I grants a positive morale token +
  // 1 gold; IV rolls 2 Resource dice and resolves one + 1 gold; VI is a
  // current-turn buff (LOCATION_DICE_BONUS) raising the dice rolled & resolved at
  // locations by 1 + 1 gold. All routed through RESOURCE_FORTUNE_PLAY.
  "specialty.melodia.1": withoutArt({
    id: "specialty.melodia.1",
    name: "Fortune I",
    kind: "hero-specialty",
    timing: "instant",
    tags: ["hero-specialty", "instant", "melodia", "fortune", "Gain a positive morale token and 1 gold."],
    target: { type: "none" },
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Gain a positive morale token and 1 gold",
          mapOnly: true,
          effect: { type: "RESOURCE_FORTUNE_PLAY", morale: 1, gold: 1 }
        }
      ]
    },
    implementationStatus: "implemented",
    source: heroSource("melodia")
  }),
  "specialty.melodia.4": withoutArt({
    id: "specialty.melodia.4",
    name: "Fortune IV",
    kind: "hero-specialty",
    timing: "instant",
    tags: [
      "hero-specialty",
      "instant",
      "melodia",
      "fortune",
      "Roll 2 Resource dice and resolve one of them. Gain 1 gold."
    ],
    target: { type: "none" },
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Roll 2 Resource dice (resolve one) and gain 1 gold",
          mapOnly: true,
          effect: { type: "RESOURCE_FORTUNE_PLAY", rollResourceDice: 2, gold: 1 }
        }
      ]
    },
    implementationStatus: "implemented",
    source: heroSource("melodia")
  }),
  "specialty.melodia.6": withoutArt({
    id: "specialty.melodia.6",
    name: "Fortune VI",
    kind: "hero-specialty",
    timing: "instant",
    tags: [
      "hero-specialty",
      "instant",
      "melodia",
      "fortune",
      "During this turn, +1 die rolled and resolved at locations. Gain 1 gold."
    ],
    target: { type: "none" },
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "This turn, +1 die at locations; gain 1 gold",
          mapOnly: true,
          effect: { type: "RESOURCE_FORTUNE_PLAY", locationDiceBonusTurn: true, gold: 1 }
        }
      ]
    },
    implementationStatus: "implemented",
    source: heroSource("melodia")
  }),

  // Tarnum (Fortress, Beastmaster, A0 D4 P1 K1, Armorer): the Basilisks specialist
  // — I/IV are the standard creature buffs (doubled for Basilisks), identical to
  // Bron's. VI is a single combined instant (NO "OR"): the buffed attack gains +2
  // attack AND fires the unit's die-gated after-attack ability regardless of the
  // roll (forceAbilityRolls → forceAbilityRollsThisAttack).
  "specialty.tarnum_fortress.1": withoutArt(mightSpecialtyOne("tarnum_fortress", "Basilisks", "Basilisks")),
  "specialty.tarnum_fortress.4": withoutArt(unitHealthSpecialty("tarnum_fortress", "Basilisks", 4, 1, "Basilisks")),
  "specialty.tarnum_fortress.6": withoutArt({
    id: "specialty.tarnum_fortress.6",
    name: "Basilisks VI",
    kind: "hero-specialty",
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    tags: [
      "hero-specialty",
      "instant",
      "tarnum_fortress",
      "basilisks",
      "Your selected unit uses its special ability regardless of the required roll's result, and gains +2 attack.",
      // engine: on this attack the unit gains +2 attack AND every die-GATED
      // after-attack ability fires regardless of the roll — the Basilisk/Azure
      // Paralysis, Gorgon Death Stare, Wyvern/Thunderbird flat-damage Sting, Rust
      // Dragon Acid token and Minotaur draw (forceAbilityRolls). The passive
      // attack/defense-on-die riders (Dread Knight Death Blow, Zombie/Manticore
      // Resilience) are attack-maths modifiers, NOT triggered abilities, so they
      // are not affected.
    ],
    trigger: { event: "UNIT_ATTACK_DECLARED", controller: "self" },
    effect: { type: "ADD_COMBAT_STAT", stat: "attack", amount: 2, forceAbilityRolls: true },
    implementationStatus: "implemented",
    source: heroSource("tarnum_fortress")
  }),

  // Tarnum (Rampart, Ranger, A1 D3 P1 K1, Leadership): the Sharpshooters specialist.
  // I/IV are the standard creature buffs, doubled for the Elves OR Sharpshooters
  // unit (the multi-unit descriptor unitMatchesSpecialtyName splits on "or"). VI is
  // a CHOOSE_ONE: borrow a Sharpshooters from the silver Neutral deck for this
  // Combat (BORROW_NEUTRAL_UNIT, gated to combat round 1) — OR — draw a card.
  "specialty.tarnum_rampart.1": withoutArt(
    mightSpecialtyOne("tarnum_rampart", "Sharpshooters", "Elves or Sharpshooters")
  ),
  "specialty.tarnum_rampart.4": withoutArt(
    unitInitiativeSpecialty("tarnum_rampart", "Sharpshooters", 4, 1, "Elves or Sharpshooters")
  ),
  "specialty.tarnum_rampart.6": withoutArt({
    id: "specialty.tarnum_rampart.6",
    name: "Sharpshooters VI",
    kind: "hero-specialty",
    timing: "instant",
    tags: [
      "hero-specialty",
      "instant",
      "tarnum_rampart",
      "sharpshooters",
      "Play at the start of Combat. Borrow a Sharpshooters from the silver Neutral deck for this Combat (discard it afterwards). — OR — Draw a card."
    ],
    target: { type: "none" },
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Borrow a Sharpshooters for this Combat",
          combatOnly: true,
          effect: { type: "BORROW_NEUTRAL_UNIT", unitDefId: "neutral.sharpshooters", tier: "silver" }
        },
        {
          label: "Draw a card",
          effect: { type: "DRAW_CARDS", amount: 1 }
        }
      ]
    },
    implementationStatus: "implemented",
    source: heroSource("tarnum_rampart")
  }),

  // ---- Cove (expansion) specialties --------------------------------------
  // Only the two Cove heroes whose specialties are fully engine-wired are
  // registered: Cassiopeia (Oceanids creature buffs) and Astra (Cure cleanse,
  // reusing HEAL_DAMAGE_AND_REMOVE_EFFECTS). The other four Cove heroes are
  // deferred (not registered) until their signature mechanic is built — see the
  // deferral note in coreHeroDefinitions and cove-content.test.ts.
  "specialty.cassiopeia.1": withoutArt(towerAttackOrDefenseSpecialty("cassiopeia", "Oceanids", 1, "Oceanids")),
  "specialty.cassiopeia.4": withoutArt(unitInitiativeSpecialty("cassiopeia", "Oceanids", 4, 1, "Oceanids")),
  "specialty.cassiopeia.6": withoutArt(towerStatBoostSpecialty("cassiopeia", "Oceanids", 6, "attack", 2, "Oceanids")),
  "specialty.astra.1": cureSpecialty(1),
  "specialty.astra.4": cureSpecialty(4),
  "specialty.astra.6": cureSpecialty(6),

  // Jeremy (Captain, might, A3 D0 P2 K1, Offense): the Cannon specialist. He buys
  // and fires the Cove Cannon war machine. The Cannon's shot is 2 damage to one
  // chosen enemy, so the IV/VI "use the Cannon once for free" option reproduces
  // exactly that (DAMAGE_CHOSEN_ENEMIES count 1, amount 2) — gated on owning a
  // Cannon (requiresWarMachine) so it can never fire without one, and never
  // spending an expert use because it is a separate specialty play (so it does
  // not count against the Cannon's once-per-round limit).
  "specialty.jeremy.1": withoutArt({
    id: "specialty.jeremy.1",
    name: "Cannon I",
    kind: "hero-specialty",
    timing: "instant",
    tags: [
      "hero-specialty",
      "instant",
      "jeremy",
      "cannon",
      "Pay 7 gold to gain a Cannon. — OR — Deal 1 damage to an enemy unit."
    ],
    target: { type: "none" },
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Pay 7 gold to gain a Cannon",
          mapOnly: true,
          effect: { type: "GAIN_WAR_MACHINE", warMachineCardId: "war_machine.cannon", goldCost: 7 }
        },
        {
          label: "Deal 1 damage to an enemy unit",
          combatOnly: true,
          effect: { type: "DAMAGE_CHOSEN_ENEMIES", count: 1, amount: 1 }
        }
      ]
    },
    implementationStatus: "implemented",
    source: heroSource("jeremy")
  }),
  "specialty.jeremy.4": withoutArt({
    id: "specialty.jeremy.4",
    name: "Cannon IV",
    kind: "hero-specialty",
    timing: "combat",
    phaseLimit: ["combat"],
    tags: [
      "hero-specialty",
      "combat",
      "jeremy",
      "cannon",
      "Use the Cannon once (2 damage to a chosen enemy) without spending the expert; it does not count against the Cannon's round limit. — OR — Draw 1 card."
    ],
    target: { type: "none" },
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Use the Cannon once for free (2 damage to a chosen enemy)",
          combatOnly: true,
          requiresWarMachine: "war_machine.cannon",
          effect: { type: "DAMAGE_CHOSEN_ENEMIES", count: 1, amount: 2 }
        },
        {
          label: "Draw 1 card",
          effect: { type: "DRAW_CARDS", amount: 1 }
        }
      ]
    },
    implementationStatus: "implemented",
    source: heroSource("jeremy")
  }),
  "specialty.jeremy.6": withoutArt({
    id: "specialty.jeremy.6",
    name: "Cannon VI",
    kind: "hero-specialty",
    timing: "combat",
    phaseLimit: ["combat"],
    tags: [
      "hero-specialty",
      "combat",
      "jeremy",
      "cannon",
      "Use the Cannon once (2 damage to a chosen enemy) without spending the expert; it does not count against the Cannon's round limit. — OR — Draw 2 cards."
    ],
    target: { type: "none" },
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Use the Cannon once for free (2 damage to a chosen enemy)",
          combatOnly: true,
          requiresWarMachine: "war_machine.cannon",
          effect: { type: "DAMAGE_CHOSEN_ENEMIES", count: 1, amount: 2 }
        },
        {
          label: "Draw 2 cards",
          effect: { type: "DRAW_CARDS", amount: 2 }
        }
      ]
    },
    implementationStatus: "implemented",
    source: heroSource("jeremy")
  }),

  // Zilare (Navigator, magic, A2 D0 P1 K2, Interference): the Forgetfulness
  // specialist. The "cannot attack next activation" option reuses the engine's
  // FORGETFULNESS effect (the same one behind spell.forgetfulness): the chosen
  // enemy cannot attack during its next activation, grade-gated (I -> silver,
  // IV/VI -> gold) and type-gated by the option's target (ranged for I/IV, any
  // unit for VI). The alternative draws a card (I) or, like Septienna's Death
  // Ripple, adds +2 Power to a Spell you are casting (IV/VI).
  "specialty.zilare.1": withoutArt({
    id: "specialty.zilare.1",
    name: "Forgetfulness I",
    kind: "hero-specialty",
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    tags: [
      "hero-specialty",
      "instant",
      "zilare",
      "forgetfulness",
      "During its next activation, a ranged unit of bronze or silver tier cannot attack. — OR — Draw 1 card."
    ],
    target: { type: "none" },
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "A bronze/silver ranged enemy cannot attack on its next activation",
          combatOnly: true,
          target: { type: "enemy-unit", unitTypes: ["ranged"] },
          effect: { type: "FORGETFULNESS", gradeByPower: { 0: "silver" } }
        },
        {
          label: "Draw 1 card",
          effect: { type: "DRAW_CARDS", amount: 1 }
        }
      ]
    },
    implementationStatus: "implemented",
    source: heroSource("zilare")
  }),
  "specialty.zilare.4": withoutArt({
    id: "specialty.zilare.4",
    name: "Forgetfulness IV",
    kind: "hero-specialty",
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    tags: [
      "hero-specialty",
      "instant",
      "zilare",
      "forgetfulness",
      "During its next activation, a ranged unit of bronze, silver, or golden tier cannot attack. — OR — +2 Power on a Spell you are casting."
    ],
    target: { type: "none" },
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "A bronze/silver/golden ranged enemy cannot attack on its next activation",
          combatOnly: true,
          target: { type: "enemy-unit", unitTypes: ["ranged"] },
          effect: { type: "FORGETFULNESS", gradeByPower: { 0: "gold" } }
        },
        {
          label: "+2 Power",
          trigger: { event: "SPELL_CAST_STARTED", controller: "self" },
          effect: { type: "ADD_SPELL_POWER", amount: 2 }
        }
      ]
    },
    implementationStatus: "implemented",
    source: heroSource("zilare")
  }),
  "specialty.zilare.6": withoutArt({
    id: "specialty.zilare.6",
    name: "Forgetfulness VI",
    kind: "hero-specialty",
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    tags: [
      "hero-specialty",
      "instant",
      "zilare",
      "forgetfulness",
      "During its next activation, a bronze, silver, or golden unit cannot attack. — OR — +2 Power on a Spell you are casting."
    ],
    target: { type: "none" },
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Any bronze/silver/golden enemy cannot attack on its next activation",
          combatOnly: true,
          target: { type: "enemy-unit" },
          effect: { type: "FORGETFULNESS", gradeByPower: { 0: "gold" } }
        },
        {
          label: "+2 Power",
          trigger: { event: "SPELL_CAST_STARTED", controller: "self" },
          effect: { type: "ADD_SPELL_POWER", amount: 2 }
        }
      ]
    },
    implementationStatus: "implemented",
    source: heroSource("zilare")
  }),

  // Miriam (Captain, might, A3 D0 P2 K1, Logistics): the Scouting specialist —
  // a map turn action reusing REMOVE_HAND_CARD_THEN_SEARCH (the Spellbinder's
  // Hat machinery). I removes an Ability card to Search(2) the Ability deck;
  // IV removes any Ability/Artifact/Spell to Search(2) its deck; VI the same to
  // Search(4). Each offers a "then Remove this Specialty card" variant.
  "specialty.miriam.1": scoutingSpecialty(1, "ability", 2),
  "specialty.miriam.4": scoutingSpecialty(4, "removable", 2),
  "specialty.miriam.6": scoutingSpecialty(6, "removable", 4),

  // Casmetra (Navigator, magic, A2 D0 P1 K2, Wisdom): the Sorceresses specialist.
  // I and IV are the standard creature buffs (reusing the shared helpers, exactly
  // like Cassiopeia's Oceanids), both doubling for a Sorceresses unit. VI is a
  // CHOICE: place the Cove Sorceresses' −2 Weakness token on any unit for 2 rounds
  // (new PLACE_WEAKNESS_TOKEN effect), OR an instant +2 attack on your unit's next
  // attack — the +2 is FLAT (it does NOT double for Sorceresses).
  "specialty.casmetra.1": withoutArt(towerAttackOrDefenseSpecialty("casmetra", "Sorceresses", 1, "Sorceresses")),
  "specialty.casmetra.4": withoutArt(unitInitiativeSpecialty("casmetra", "Sorceresses", 4, 1, "Sorceresses")),
  // Casmetra VI is a CHOICE (— OR —), re-confirmed against the owner's physical
  // card 2026-06 (like Moandor VI): the fan wiki renders the two clauses with no
  // "OR" (looking like a combined AND), but the printed card is choose-one.
  "specialty.casmetra.6": withoutArt({
    id: "specialty.casmetra.6",
    name: "Sorceresses VI",
    kind: "hero-specialty",
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    tags: [
      "hero-specialty",
      "instant",
      "casmetra",
      "sorceresses",
      "Place a −2 Weakness token on any unit for 2 Combat rounds. — OR — Your selected unit gains +2 attack."
    ],
    target: { type: "none" },
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Place a −2 Weakness token on any unit (2 rounds)",
          combatOnly: true,
          target: { type: "any-unit" },
          effect: { type: "PLACE_WEAKNESS_TOKEN", amount: -2, rounds: 2 }
        },
        {
          // Instant, one-shot +2 attack on your unit's next attack (an attack
          // reaction, like Erdamon VI). Flat — no Sorceresses doubling.
          label: "+2 attack",
          trigger: { event: "UNIT_ATTACK_DECLARED", controller: "self" },
          effect: { type: "ADD_COMBAT_STAT", stat: "attack", amount: 2 }
        }
      ]
    },
    implementationStatus: "implemented",
    source: heroSource("casmetra")
  })
};
