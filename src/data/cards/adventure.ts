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

/**
 * Enterprise "Lucky E" (Azur Lane, 2026-07 upgrade) — a dice-luck specialty.
 * Each level is a hand instant with TWO halves:
 *  - a proactive stat half (the CHOOSE_ONE below — the normal reaction play);
 *  - an ENGINE half offered while the card is HELD: it joins the owner's
 *    Attack-die reroll window (attack rolls AND the post-attack ability-roll
 *    window, exactly like the Diplomat's-Ring family) — I/VI offer a REROLL,
 *    IV/VI offer "SET one die to the +1 side" (the Positive-Morale set-die
 *    machinery). Taking the die half plays/discards the card; VI's two halves
 *    share one card, so spending either retires the other
 *    (LUCKY_E_SPECIALTY_SOURCES → buildRerollSources / buildAbilityRerollSources
 *    in reducer.ts; pinned in kansen-abilities.test.ts).
 */
function luckyESpecialty(level: 1 | 4 | 6): CardLibrary[string] {
  const numeral = level === 1 ? "I" : level === 4 ? "IV" : "VI";
  const amount = level === 6 ? 2 : 1;
  const dieHalf =
    level === 1
      ? "While in hand: reroll one of your Attack/ability dice (offered in the die window; playing it discards this card)."
      : level === 4
        ? "While in hand: set one of your Attack/ability dice to the \"+1\" side (offered in the die window; playing it discards this card)."
        : "While in hand: reroll one of your Attack/ability dice OR set one to the \"+1\" side (offered in the die window; either play discards this card).";
  const attackOption = {
    label: `+${amount} attack`,
    trigger: { event: "UNIT_ATTACK_DECLARED", controller: "self" },
    effect: { type: "ADD_COMBAT_STAT", stat: "attack", amount }
  } as const;
  const defenseOption = {
    label: `+${amount} defense`,
    trigger: { event: "UNIT_ATTACK_DECLARED", controller: "opponent" },
    effect: { type: "ADD_COMBAT_STAT", stat: "defense", amount }
  } as const;
  return {
    id: `specialty.enterprise.${level}`,
    name: `Lucky E ${numeral}`,
    kind: "hero-specialty",
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    tags: [
      "hero-specialty",
      "instant",
      "enterprise",
      // engine: the die half is a HELD-card offer in the Attack-die reroll
      // window (LUCKY_E_SPECIALTY_SOURCES), not a CHOOSE_ONE option here.
      `${dieHalf}`
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: level === 1 ? [defenseOption] : [attackOption, defenseOption]
    },
    assets: {
      cardImage: specialtyCardImage("enterprise", level),
      imageAlt: `Lucky E level ${numeral} specialty card`
    },
    implementationStatus: "implemented",
    source: heroSource("enterprise")
  };
}

/**
 * The engine half of "Lucky E": which held Enterprise specialty levels join the
 * die windows, and as what. Consumed by buildRerollSources /
 * buildAbilityRerollSources (reducer.ts) — the same held-card pattern as
 * REROLL_REACTION_ARTIFACT_IDS.
 */
export const LUCKY_E_SPECIALTY_SOURCES: readonly {
  cardId: string;
  name: string;
  reroll: boolean;
  setDie: boolean;
}[] = [
  { cardId: "specialty.enterprise.1", name: "Lucky E I", reroll: true, setDie: false },
  { cardId: "specialty.enterprise.4", name: "Lucky E IV", reroll: false, setDie: true },
  { cardId: "specialty.enterprise.6", name: "Lucky E VI", reroll: true, setDie: true }
];

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
    // Instant so the house-rule "Draw 1 card" arm is playable on the adventure
    // map (Offense/Armorer map-draw pattern). The buff arm stays combat-only
    // via isOptionEffectPlayable(CREATE_INITIATIVE_BUFF) + unit targets.
    timing: "instant",
    phaseLimit: ["combat"],
    tags: [
      "hero-specialty",
      "combat",
      heroSlug,
      "initiative",
      // Wiki / basic battlefield: Initiative only (doubled on the signature unit).
      // House rule ("combat-move-initiative"): ALSO +1 Combat movement (flat, never
      // doubled). House rule alternative: draw 1 card instead of the buff (map or combat).
      `Combat: give a friendly unit +${amount} Initiative this combat — doubled (+${amount * 2}) for ${doubledUnit}. (House rule: also +1 Combat movement.) — OR — House rule: draw 1 card instead (map or combat).`
    ],
    // Option A targets a friendly unit (it inherits this card-level target);
    // option B (draw a card) needs no target.
    target: { type: "friendly-unit" },
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          // Label lists the wiki Initiative effect; +1 move only applies while
          // the "combat-move-initiative" house rule is ON (getUnitMoveRange).
          label: `+${amount} Initiative (x2 for ${doubledUnit}; house rule: +1 move)`,
          effect: {
            type: "CREATE_INITIATIVE_BUFF",
            name: `${specialtyName} Specialty`,
            amount,
            duration: { type: "combat" },
            polarity: "positive",
            removable: false,
            doubleForUnitName: doubledUnit,
            // House rule (BINH): the buff also raises Combat movement by 1.
            // Gated at read time in getUnitMoveRange — inert when the rule is off.
            movementBonus: 1
          }
        },
        {
          label: "Draw 1 card",
          requiresHouseRule: "initiative-specialty-draw",
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
 * damage tiers: the Power brought is the printed Power of the chosen fuel cards
 * (a +2 source counts as 2), resolved in `playCardSpellPower`. Spell-only passive
 * bonuses do not apply because this card is a Specialty. The earlier 3-tier CHOOSE_ONE
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
    // discard (up to 4 sources — the breakpoint is Power 4) sets the damage via
    // `amountByPower`, mirroring the Frost Ring ladder. Playable
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
          // Printed Instant card-manipulation → playable on the map AND
          // mid-Combat (see instantSideAllowedInCombat); no `mapOnly`.
          label: `Dig ${count} cards; keep Spells and Specialties`,
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
 * helper, so the UI renders the native art-less card instead of a broken image
 * link. Its original customers (the "Regular Stretch Goals 2024" heroes) all got
 * printed faces in the 2026-08 wiki art refresh and use withSpecialtyArt now; it
 * still serves the factions whose specialty cards genuinely do not exist as
 * board-game scans — Bulwark, Factory and the anime towns.
 */
function withoutArt(card: CardLibrary[string]): CardLibrary[string] {
  const next = { ...card };
  delete next.assets;
  return next;
}

/** Add an engine-backed innate hero rule to an otherwise normal playable card. */
function withInnateHeroRule(card: CardLibrary[string], innate: string): CardLibrary[string] {
  const next = structuredClone(card) as CardLibrary[string];
  const prose = (next.tags ?? []).filter((tag) => /\s/u.test(tag)).sort((a, b) => b.length - a.length)[0];
  next.tags = (next.tags ?? []).filter((tag) => tag !== prose);
  next.tags.push(`${innate} Card: ${prose ?? "Resolve this specialty's implemented effect."}`);
  return next;
}

/**
 * Attach the PRINTED specialty card face to a definition whose scan now ships in
 * /public/assets (the fan wiki published the full "Regular Stretch Goals 2024" /
 * Cove hero art pack — see scripts/fetch-hero-art-refresh.py). The file name is
 * derived from the card id through specialtyCardImage(), so it can never drift
 * from the convention, and the card stops rendering through the native
 * art-less renderer (canRenderSpecialtyCard) the moment its face exists.
 */
function withSpecialtyArt(card: CardLibrary[string]): CardLibrary[string] {
  const parsed = /^specialty\.(.+)\.(1|4|6)$/u.exec(card.id);
  if (!parsed) {
    throw new Error(`withSpecialtyArt: not a hero-specialty card id: ${card.id}`);
  }
  return {
    ...card,
    assets: {
      cardImage: specialtyCardImage(parsed[1], Number(parsed[2]) as 1 | 4 | 6),
      imageAlt: `${card.name} specialty card`
    }
  };
}

const ROMAN: Record<1 | 4 | 6, string> = { 1: "I", 4: "IV", 6: "VI" };

/**
 * Astra's Cure specialty (Cove). Reuses the implemented Cure cleanse
 * (HEAL_DAMAGE_AND_REMOVE_EFFECTS): I removes any effect or paralysis then draws
 * 1; IV removes any effect or paralysis and heals up to 2; VI heals up to 3 (no
 * cleanse). Board-game specialty faces assigned under /assets/hero_specialties-astra-*.
 */
function cureSpecialty(level: 1 | 4 | 6): CardLibrary[string] {
  const base = {
    id: `specialty.astra.${level}`,
    name: `Cure ${ROMAN[level]}`,
    kind: "hero-specialty" as const,
    timing: "instant" as const,
    phaseLimit: ["combat" as const],
    implementationStatus: "implemented" as const,
    source: heroSource("astra"),
    assets: {
      cardImage: specialtyCardImage("astra", level),
      imageAlt: `Cure ${ROMAN[level]} specialty card`
    }
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
  return {
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
          // Printed Instant card-manipulation → playable on the map AND
          // mid-Combat (see instantSideAllowedInCombat); no `mapOnly`. The reducer
          // opens the remove-then-Search choice inline during a live combat.
          label: `Remove ${what} to Search (${count}) ${deck}`,
          effect: { type: "REMOVE_HAND_CARD_THEN_SEARCH", count, filter, tieredReach: filter === "removable" }
        },
        {
          label: `Remove ${what} to Search (${count}) ${deck}; then Remove this Specialty card`,
          cost: { removeSelf: true },
          effect: { type: "REMOVE_HAND_CARD_THEN_SEARCH", count, filter, tieredReach: filter === "removable" }
        }
      ]
    },
    assets: {
      cardImage: specialtyCardImage("miriam", level),
      imageAlt: `Scouting ${towerRoman(level)} specialty card`
    },
    implementationStatus: "implemented",
    source: heroSource("miriam")
  };
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
    // An Instant with a combat phaseLimit, exactly like every other
    // "<combat effect> — OR — Draw N" specialty (Catherine VI, Gelu VI, …).
    // It shipped as `timing: "combat"`, which locked its printed DRAW side out
    // of the adventure map and out of reaction windows (2026-08-10, the same
    // class of bug as Solmyr's Chain Lightning IV); the combat side is still
    // gated to the combat phase by phaseLimit.
    timing: "instant",
    phaseLimit: ["combat"],
    tags: [
      "hero-specialty",
      "instant",
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
    // it may also be played outside its window purely for the draw — on the map
    // (Power fizzles) OR during your own combat activation (draw-only; if the
    // unit has not moved yet, the Power banks onto the next spell cast — wiki
    // "play Sorcery first to draw, then cast"). Engine: legal-actions drawOnly /
    // combatDrawOnly + playCard bank pendingDrawRiderSpellPower.
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
      "Basic: The cost of buying spells in this Town is reduced by 2 gold; Search (3) instead of Search (2). Expert: Search (4) instead. (BINH expert: −3 gold.)",
      "Balance pack: the basic side keeps −2 gold but its widen becomes RELATIVE — Search (X+2) instead of Search (X), once — and it applies both when buying Spells from your Mage Guild AND on a Spell-deck Search in the round you BUILT the Mage Guild. Its town EXPERT side is gone: after casting your first Spell this round, play Wisdom for +1 Power on that Spell and +1 to this round's spell limit, then discard Wisdom."
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          // The town side is a declarative marker, exactly as before: Wisdom is
          // never played through PLAY_CARD there — it rides the Spell Book token
          // (SPELL_BOOK_ACTION's `wisdom` payload). `mapOnly` keeps it out of the
          // combat offer the Balance expert side opens below; the card's "town"
          // timing keeps it out of the map offer in both readings.
          label: "Town (with the Spell Book token): −2 gold and a wider Search when buying a Spell",
          mapOnly: true,
          effect: { type: "DRAW_CARDS", amount: 0 }
        },
        {
          // Balance Pack expert: a real combat play. ONE effect carries both
          // printed halves for the combat round.
          label: "Balance (spend a crown): +1 spell Power and +1 to your spell limit this combat round",
          requiresHouseRule: "polish-card-balance",
          expertOnly: true,
          trigger: { event: "SPELL_CAST_STARTED", controller: "self" },
          effect: {
            type: "ADD_SPELL_POWER",
            amount: 1,
            spellLimitBonus: 1
          }
        }
      ]
    },
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
      "Basic: Remove 1 damage from one of your units. Expert: when using the First Aid Tent, resolve its effect against the same target 3 times.",
      "Balance pack: Basic: remove 1 damage from one of your units, OR First Aid ability: use First Aid Tent on the selected unit 3 times (no crown). Expert: with a First Aid Tent in play, the selected unit gains +2 Health for its current Stack/Pack/Few life only."
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
          // Never played from hand. Offered when this player's First Aid Tent
          // heals — discards the card — resolving the Tent heal against the SAME
          // target 3× (see permanents.ts). Balance Pack: a BASIC side (no crown);
          // with the rule off it stays the printed Expert side.
          label: "When using your First Aid Tent: resolve its heal against the same target 3×",
          expertUnlessHouseRule: "polish-card-balance",
          effect: { type: "FIRST_AID_TENT_VOLLEY", heals: 3 }
        },
        {
          // Balance Pack expert: gated on a First Aid Tent actually in play (the
          // Jeremy-Cannon `requiresWarMachine` gate), and it targets ANY of your
          // units — not only a damaged one — so it carries its own target.
          // INSTANT (any time during Combat): a +2-Health buff is naturally used
          // DEFENSIVELY, before a hit lands, so it joins the open attack window
          // like the other pre-hit reactions (`combatAnytime` — the standing user
          // ruling that instant abilities are reaction-playable "before counter
          // attack, when attack and when defend"). The offer stays gated on the
          // house rule + Tent + a payable crown in addOptionPlays, so rule-off and
          // Tent-less games are byte-identical; the unit about to be hit opens the
          // window with it (combatAnytimeInstantWindowJoins / reactionOfferOpensWindow).
          label: "Balance expert (spend a crown; First Aid Tent in play): one unit gains +2 Health for its current life",
          requiresHouseRule: "polish-card-balance",
          requiresWarMachine: "war_machine.first_aid_tent",
          combatOnly: true,
          combatAnytime: true,
          expertOnly: true,
          target: { type: "friendly-unit" },
          effect: { type: "ADD_UNIT_MAX_HEALTH", amount: 2, currentUnitLifeOnly: true }
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
  // map-only and matches the printed card: "Remove up to 2 Statistic cards from
  // your hand or discard pile. Take up to 2 different Empowered Statistic cards
  // and put them on top of your discard pile. Remove the Scholar." The expert
  // spends one expert use and removes this card (cost.removeSelf). The two
  // "up to" phases are INDEPENDENT (remove Attack, take Empowered Power is
  // legal) — SCHOLAR_EMPOWER_PICK then SCHOLAR_EMPOWER_TAKE visit steps in
  // adventure.ts. Empowered Statistic cards live in src/data/cards/sample.ts.
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
          label:
            "Remove up to 2 Statistic cards from hand or discard; take up to 2 different Empowered Statistic cards on top of discard; Remove this card",
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
      "Regular: at the start of Combat, switch the position of any 2 of your units. Expert: switch any 2 of your units during Combat, on your turn before your active unit moves.",
      "Balance pack: Regular: at the start of Combat, switch any 2 of your units OR move one of your units 1 space. Expert: on your turn before the active unit moves, switch any 2 of your units OR move one of your units 1 space (spend a crown)."
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
  // Factory heroes (Gamefound "Faction Focus: Factory"). Face-less (no printed
  // board-game specialty art yet) — withoutArt renders them natively.
  // Henrietta (Mercenary): the Halflings specialist — "building your own armies
  // of Halflings and Grenadiers, and buffing them all". I = +1 attack/defence;
  // IV = +1 HP; VI = +1 initiative — doubled when the bonus lands on a Halflings.
  "specialty.henrietta.1": withoutArt(mightSpecialtyOne("henrietta", "Halflings", "Halflings")),
  "specialty.henrietta.4": withoutArt(unitHealthSpecialty("henrietta", "Halflings", 4, 1, "Halflings")),
  "specialty.henrietta.6": withoutArt(unitInitiativeSpecialty("henrietta", "Halflings", 6, 1, "Halflings")),
  // Frederick (Artificer): the Automatons specialist. His INHERENT trait also
  // enhances every Automaton's Detonate by +1 (seedFactoryHeroEffects →
  // PlayerState.automatonDetonationBonus); these three cards buff Automatons the
  // way any unit-specialist does. (His "near-free Automaton re-recruit" is not
  // yet wired — noted, not claimed.)
  "specialty.frederick.1": withoutArt(mightSpecialtyOne("frederick", "Automatons", "Automatons")),
  "specialty.frederick.4": withoutArt(unitHealthSpecialty("frederick", "Automatons", 4, 1, "Automatons")),
  "specialty.frederick.6": withoutArt(unitInitiativeSpecialty("frederick", "Automatons", 6, 1, "Automatons")),
  // The four other kept Factory heroes are unit specialists too (same wired
  // pattern: I = +1 attack/defence, IV = +1 HP, VI = +1 initiative, doubled on
  // the specialty unit). Sam -> Mechanics, Tancred -> Bounty Hunters,
  // Celestine -> Armadillos, Agar -> Sandworms.
  "specialty.sam.1": withoutArt(mightSpecialtyOne("sam", "Mechanics", "Mechanics")),
  "specialty.sam.4": withoutArt(unitHealthSpecialty("sam", "Mechanics", 4, 1, "Mechanics")),
  "specialty.sam.6": withoutArt(unitInitiativeSpecialty("sam", "Mechanics", 6, 1, "Mechanics")),
  "specialty.tancred.1": withoutArt(mightSpecialtyOne("tancred", "Bounty Hunters", "Bounty Hunters")),
  "specialty.tancred.4": withoutArt(unitHealthSpecialty("tancred", "Bounty Hunters", 4, 1, "Bounty Hunters")),
  "specialty.tancred.6": withoutArt(unitInitiativeSpecialty("tancred", "Bounty Hunters", 6, 1, "Bounty Hunters")),
  "specialty.celestine.1": withoutArt(mightSpecialtyOne("celestine", "Armadillos", "Armadillos")),
  "specialty.celestine.4": withoutArt(unitHealthSpecialty("celestine", "Armadillos", 4, 1, "Armadillos")),
  "specialty.celestine.6": withoutArt(unitInitiativeSpecialty("celestine", "Armadillos", 6, 1, "Armadillos")),
  "specialty.agar.1": withoutArt(mightSpecialtyOne("agar", "Sandworms", "Sandworms")),
  "specialty.agar.4": withoutArt(unitHealthSpecialty("agar", "Sandworms", 4, 1, "Sandworms")),
  "specialty.agar.6": withoutArt(unitInitiativeSpecialty("agar", "Sandworms", 6, 1, "Sandworms")),
  // Anime Realms unit specialists use the proven generic I/IV/VI curve: global
  // +1 at I/IV/VI, doubled only on the named line. Face-less cards render with
  // the current hero portrait. Bin remains for legacy story scenarios; Fuyuki's
  // selectable roster below is the canonical Fifth Holy Grail War cast.
  "specialty.bin.1": withoutArt(mightSpecialtyOne("bin", "Sabers", "Sabers")),
  "specialty.bin.4": withoutArt(unitHealthSpecialty("bin", "Sabers", 4, 1, "Sabers")),
  "specialty.bin.6": withoutArt(unitInitiativeSpecialty("bin", "Sabers", 6, 1, "Sabers")),
  // Fuyuki / Azure Breeze MIGHT-hero sets were REDESIGNED 2026-08-25 (USER
  // REQUEST: drop the generic unit-buff trio). Shirou / Rin / Kiritsugu / Kirei
  // and Qingyun / Jianxu / Yulian are now distinct rethemedSpecialty clones,
  // assigned in the "ANIME SPECIALTY REDESIGN" block below (search that
  // string). Illyasviel is the ONE kept Fuyuki unit specialist — her Servant
  // IS Berserker (Heracles), the bond the doubling models.
  "specialty.illyasviel.1": withoutArt(mightSpecialtyOne("illyasviel", "Einzbern Bond", "Heracles")),
  "specialty.illyasviel.4": withoutArt(unitHealthSpecialty("illyasviel", "Einzbern Bond", 4, 1, "Heracles")),
  "specialty.illyasviel.6": withoutArt(unitInitiativeSpecialty("illyasviel", "Einzbern Bond", 6, 1, "Heracles")),
  // Hidden Leaf hero sets were REDESIGNED 2026-08-25: Sasuke / Kakashi /
  // Shikamaru / Jiraiya are distinct rethemedSpecialty clones assigned in the
  // "ANIME SPECIALTY REDESIGN" block below. Naruto is the ONE kept Hidden Leaf
  // unit specialist — the Nine-Tails bond IS his identity.
  "specialty.naruto.1": withoutArt(mightSpecialtyOne("naruto", "Nine-Tails Chakra", "Nine-Tails Chakra Avatar")),
  "specialty.naruto.4": withoutArt(unitHealthSpecialty("naruto", "Nine-Tails Chakra", 4, 1, "Nine-Tails Chakra Avatar")),
  "specialty.naruto.6": withoutArt(unitInitiativeSpecialty("naruto", "Nine-Tails Chakra", 6, 1, "Nine-Tails Chakra Avatar")),
  // Azur Lane might heroes (src/data/anime/towns.ts). Enterprise carries the
  // BESPOKE "Lucky E" dice specialty (2026-07 upgrade — proactive stat half +
  // a held-card die half in the reroll window, see luckyESpecialty); Bismarck /
  // Nagato stay unit specialists doubling on their OWN faction's shipgirls
  // (Bismarck → Prinz Eugen, Nagato → Yukikaze). Face-less (native renderer).
  "specialty.enterprise.1": withoutArt(luckyESpecialty(1)),
  "specialty.enterprise.4": withoutArt(luckyESpecialty(4)),
  "specialty.enterprise.6": withoutArt(luckyESpecialty(6)),
  "specialty.bismarck.1": withoutArt(mightSpecialtyOne("bismarck", "Iron Blood Oath", "Prinz Eugen")),
  "specialty.bismarck.4": withoutArt(unitHealthSpecialty("bismarck", "Iron Blood Oath", 4, 1, "Prinz Eugen")),
  "specialty.bismarck.6": withoutArt(unitInitiativeSpecialty("bismarck", "Iron Blood Oath", 6, 1, "Prinz Eugen")),
  "specialty.nagato.1": withoutArt(mightSpecialtyOne("nagato", "Big Seven Resolve", "Yukikaze")),
  "specialty.nagato.4": withoutArt(unitHealthSpecialty("nagato", "Big Seven Resolve", 4, 1, "Yukikaze")),
  "specialty.nagato.6": withoutArt(unitInitiativeSpecialty("nagato", "Big Seven Resolve", 6, 1, "Yukikaze")),
  // Heavenly Demon Palace MIGHT-hero sets were REDESIGNED 2026-08-25: Xuedao /
  // Guiyan / Xuanming are distinct rethemedSpecialty clones assigned in the
  // "ANIME SPECIALTY REDESIGN" block below. Their two MAGIC medic siblings
  // (Yaoji / Molian) stay the rethemedSpecialty medic clones defined beside the
  // other anime medic clones.
  // Little Busters might heroes — each set strengthens a unit the campus can
  // actually recruit. These use the fully wired unit-specialist I/IV/VI arms.
  "specialty.sasami_sasasegawa.1": withoutArt(mightSpecialtyOne("sasami_sasasegawa", "Perfect Captain", "Softball Club")),
  "specialty.sasami_sasasegawa.4": withoutArt(unitHealthSpecialty("sasami_sasasegawa", "Perfect Captain", 4, 1, "Softball Club")),
  "specialty.sasami_sasasegawa.6": withoutArt(unitInitiativeSpecialty("sasami_sasasegawa", "Perfect Captain", 6, 1, "Softball Club")),
  "specialty.riki_naoe.1": withoutArt(mightSpecialtyOne("riki_naoe", "Team Heart", "Masato the Wall")),
  "specialty.riki_naoe.4": withoutArt(unitHealthSpecialty("riki_naoe", "Team Heart", 4, 1, "Masato the Wall")),
  "specialty.riki_naoe.6": withoutArt(unitInitiativeSpecialty("riki_naoe", "Team Heart", 6, 1, "Masato the Wall")),
  "specialty.rin_natsume.1": withoutArt(mightSpecialtyOne("rin_natsume", "Cat Commander", "Rin's Cats")),
  "specialty.rin_natsume.4": withoutArt(unitHealthSpecialty("rin_natsume", "Cat Commander", 4, 1, "Rin's Cats")),
  "specialty.rin_natsume.6": withoutArt(unitInitiativeSpecialty("rin_natsume", "Cat Commander", 6, 1, "Rin's Cats")),
  "specialty.yuiko_kurugaya.1": withoutArt(mightSpecialtyOne("yuiko_kurugaya", "Perfect Score", "Saya Tokido")),
  "specialty.yuiko_kurugaya.4": withoutArt(unitHealthSpecialty("yuiko_kurugaya", "Perfect Score", 4, 1, "Saya Tokido")),
  "specialty.yuiko_kurugaya.6": withoutArt(unitInitiativeSpecialty("yuiko_kurugaya", "Perfect Score", 6, 1, "Saya Tokido")),
  // Miku (Fuyuki Virtual Diva) — Voice of Angel. NEW engine arms:
  // I SLOW_ALL_ENEMIES, IV CREATE_HEAL_ON_ATTACKED (friendly), VI DAMAGE_ALL_ENEMY_UNITS.
  "specialty.miku.1": withoutArt({
    id: "specialty.miku.1",
    name: "Voice of Angel I",
    kind: "hero-specialty",
    timing: "combat",
    phaseLimit: ["combat"],
    tags: [
      "hero-specialty",
      "combat",
      "miku",
      "voice-of-angel",
      "Ongoing (combat): every enemy unit gets −1 Initiative and −1 Combat movement for this Combat."
    ],
    target: { type: "none" },
    effect: {
      type: "SLOW_ALL_ENEMIES",
      name: "Voice of Angel",
      initiative: -1,
      movementBonus: -1
    },
    implementationStatus: "implemented",
    source: heroSource("miku")
  }),
  "specialty.miku.4": withoutArt({
    id: "specialty.miku.4",
    name: "Voice of Angel IV",
    kind: "hero-specialty",
    timing: "combat",
    phaseLimit: ["combat"],
    tags: [
      "hero-specialty",
      "combat",
      "miku",
      "voice-of-angel",
      "Ongoing (combat): after any of YOUR units is attacked (including Retaliation), heal 1 damage on that attacked unit if it still lives."
    ],
    target: { type: "none" },
    effect: {
      type: "CREATE_HEAL_ON_ATTACKED",
      name: "Voice of Angel",
      amount: 1
    },
    implementationStatus: "implemented",
    source: heroSource("miku")
  }),
  "specialty.miku.6": withoutArt({
    id: "specialty.miku.6",
    name: "Voice of Angel VI",
    kind: "hero-specialty",
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    tags: [
      "hero-specialty",
      "instant",
      "miku",
      "voice-of-angel",
      "Instant: every enemy unit suffers 1 damage."
    ],
    target: { type: "none" },
    effect: { type: "DAMAGE_ALL_ENEMY_UNITS", amount: 1 },
    implementationStatus: "implemented",
    source: heroSource("miku")
  }),
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
  // draws 2 and discards 1. The printed order is DRAW THEN DISCARD, so the
  // discard is a post-draw rider (`thenDiscard`), NOT an up-front
  // `cost.discardCards`: the two drawn cards may pay it, and the card is
  // therefore playable with the specialty as the ONLY card in hand (an up-front
  // cost made it unplayable there — the reported bug).
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
          effect: { type: "HEAL_DAMAGE", amount: 2, drawCards: 2, thenDiscard: 1 }
        },
        {
          label: "Remove paralysis, then draw 2 and discard 1",
          effect: { type: "HEAL_DAMAGE", amount: 0, removeParalysis: true, drawCards: 2, thenDiscard: 1 }
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
  // The moandor specialty scans (hero_specialties-moandor-*.webp) ship since the
  // 2026-08 wiki art refresh (scripts/fetch-hero-art-refresh.py), so these draw the
  // printed face; SPECIALTY_ICON_BY_HERO.moandor is only the load-failure fallback.
  "specialty.moandor.1": withSpecialtyArt(mightSpecialtyOne("moandor", "Liches", "Liches")),
  "specialty.moandor.4": withSpecialtyArt(unitHealthSpecialty("moandor", "Liches", 4, 1, "Liches")),
  // Moandor VI is a CHOICE (— OR —), re-confirmed against the owner's physical
  // card 2026-06: the fan wiki renders the two clauses with no "OR" (looking like
  // a combined AND), but the printed card is choose-one. Do not "fix" it to AND.
  "specialty.moandor.6": withSpecialtyArt({
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
    implementationStatus: "implemented",
    source: heroSource("moandor")
  }),
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
          // goldCost; gating requires owning a Few of Magi AND >= 6 gold. Gated on
          // the `dracon-few-magi-trade` toggle — off, this option is not offered
          // (and rejected at play), leaving only the two rulebook options above.
          label: "Discard a Few of Magi + 6 gold → take the Enchanters",
          mapOnly: true,
          requiresHouseRule: "dracon-few-magi-trade",
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
  // Cyra (Wizard): the Haste specialist. Wiki I = +3 initiative for the combat
  // only (basic/small battlefield does NOT raise Combat movement). IV/VI add
  // the initiative-comparison conditionals. House rule ("combat-move-initiative"):
  // also +1 Combat movement; house-rule alternative: draw 1 card instead.
  "specialty.cyra.1": withSpecialtyArt({
    id: "specialty.cyra.1",
    name: "Haste I",
    kind: "hero-specialty",
    // Instant so the house-rule "Draw 1 card" arm is playable on the adventure
    // map; the buff arm stays combat-only (CREATE_INITIATIVE_BUFF + unit target).
    timing: "instant",
    phaseLimit: ["combat"],
    tags: [
      "hero-specialty",
      "combat",
      "cyra",
      "haste",
      // Wiki / basic: Initiative only. House rule adds +1 Combat movement (gated
      // in getUnitMoveRange) and the draw alternative (map or combat).
      "For this Combat, your selected unit's Initiative is increased by 3. (House rule: also +1 Combat movement.) — OR — House rule: draw 1 card instead (map or combat)."
    ],
    // Option A targets the friendly unit (inherited); option B (draw) needs none.
    target: { type: "friendly-unit" },
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "+3 Initiative (house rule: +1 move)",
          effect: {
            type: "CREATE_INITIATIVE_BUFF",
            name: "Haste",
            amount: 3,
            duration: { type: "combat" },
            polarity: "positive",
            removable: false,
            // House rule: also +1 Combat movement when "combat-move-initiative" is ON.
            movementBonus: 1
          }
        },
        {
          label: "Draw 1 card",
          requiresHouseRule: "initiative-specialty-draw",
          effect: { type: "DRAW_CARDS", amount: 1 }
        }
      ]
    },
    implementationStatus: "implemented",
    source: heroSource("cyra")
  }),
  // IV: +1 attack on your unit's attack, doubled when the attacked unit is
  // faster (a strictly higher Initiative) — played as an attack reaction.
  "specialty.cyra.4": withSpecialtyArt({
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
  }),
  // VI: wiki = +3 initiative this combat plus +1 defense against slower attackers.
  // House rule: also +1 Combat movement (gated in getUnitMoveRange).
  "specialty.cyra.6": withSpecialtyArt({
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
      "For this Combat, your selected unit's initiative is increased by 3. This unit gains +1 defense against attacks made by units with lower initiative. (House rule: also +1 Combat movement.)"
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
          // House rule: +1 Combat movement when "combat-move-initiative" is ON.
          { type: "MOVEMENT_BONUS", amount: 1 }
        ]
      }
    },
    implementationStatus: "implemented",
    source: heroSource("cyra")
  }),
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
  // Chain Lightning IV is the odd level out: unlike I/VI it deals no damage and
  // names no combat at all — its printed text is PURE card manipulation, the
  // same shape as Jeddite's Mysterious Warlock dig (an INSTANT). It shipped as
  // `timing: "combat"` + `phaseLimit: ["combat"]`, which made it unreachable on
  // the adventure map (addTurnCardActions only admits instant/ongoing/map) and
  // unreachable as a reaction-window join (allowTriggerlessUtility requires
  // `timing === "instant"`) — the 2026-08-10 report "Solmyr 4 can't be used in
  // map". As an Instant it is playable on the map, at any time during a Combat,
  // and as a trigger-free join in an open window.
  "specialty.solmyr.4": {
    id: "specialty.solmyr.4",
    name: "Chain Lightning IV",
    kind: "hero-specialty",
    timing: "instant",
    tags: [
      "hero-specialty",
      "instant",
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
  // Torosar (Tower, Alchemist): a Ballista specialist. Every clause below is
  // transcribed from the committed board-game scans
  // (/assets/hero_specialties-torosar-{1,4,6}.webp), which are the truth — an
  // earlier reading made all three "until the end of the game round" grants and
  // invented immediate activations for IV; both are gone.
  //   I  (031/197 TOW) is the SHARED "Ballista I" card, word-for-word identical
  //      to Tarnum (Castle) I (061/197 CAS) and Gerwulf I (043/197 FOR), so it
  //      is modelled identically: a MAP side (globe icon) that buys the real
  //      war-machine Ballista for 5 gold, or an INSTANT side (lightning icon)
  //      that fires a Ballista you already own. It creates NO lasting effect.
  //   IV (032/197 TOW) prints the MAP icon and no activation clause at all.
  //   VI (033/197 TOW) prints the INSTANT icon and is scoped "For this Combat",
  //      not to the game round.
  // IV/VI both print "When played, this card counts as a Ballista", so their
  // card stays in play (the Ongoing tray) for as long as the grant lasts and
  // only then reaches the discard — which is exactly what the shared
  // hold/release passes in active-effects.ts do.
  "specialty.torosar.1": withSpecialtyArt({
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
          combatAnytime: true,
          effect: { type: "BALLISTA_SPECIALTY", activate: "one" }
        }
      ]
    },
    implementationStatus: "implemented",
    source: heroSource("torosar")
  }),
  // IV: printed with the MAP icon, so `timing: "map"` — it is committed on the
  // adventure map BEFORE a fight and is never offered mid-combat (where its
  // Ballista, which fires at a combat round's START, could not shoot this round
  // and the card would be spent for nothing).
  "specialty.torosar.4": withSpecialtyArt({
    id: "specialty.torosar.4",
    name: "Ballista IV",
    kind: "hero-specialty",
    timing: "map",
    tags: [
      "hero-specialty",
      "map",
      "torosar",
      "ballista",
      "Until the end of the round, gain an additional Ballista during Combat. When played, this card counts as a Ballista."
    ],
    target: { type: "none" },
    effect: { type: "BALLISTA_SPECIALTY", grant: "game-round" },
    implementationStatus: "implemented",
    source: heroSource("torosar")
  }),
  // VI: printed with the INSTANT icon and scoped to the fight — the grant is
  // combat-duration (gone when the battle ends), and "you can activate all your
  // Ballistas now" fires every one, the just-granted one included. It is map-
  // illegal for free: the map branch of isOptionEffectPlayable accepts only a
  // `game-round` grant.
  "specialty.torosar.6": withSpecialtyArt({
    id: "specialty.torosar.6",
    name: "Ballista VI",
    kind: "hero-specialty",
    timing: "instant",
    tags: [
      "hero-specialty",
      "instant",
      "torosar",
      "ballista",
      "For this Combat, gain an additional Ballista. You can activate all your Ballistas now. When played, this card counts as a Ballista."
    ],
    target: { type: "none" },
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Gain an additional Ballista and activate all Ballistas now",
          combatAnytime: true,
          effect: { type: "BALLISTA_SPECIALTY", grant: "combat", activate: "all" }
        }
      ]
    },
    implementationStatus: "implemented",
    source: heroSource("torosar")
  }),

  // ---- Conflux heroes (unit-specialist Planeswalkers) --------------------
  // Erdamon: the Magma Elementals specialist (wiki — "The effect doubles for
  // the Magma Elementals unit"). I = instant +1 attack OR +1 defence (doubled
  // for Magma Elementals); IV = +1 initiative for the combat (doubled for Magma
  // Elementals); VI = instant +2 attack OR ongoing +3 initiative (no doubling).
  // Conflux specialty card scans assigned under /assets/hero_specialties-*.
  "specialty.erdamon.1": towerAttackOrDefenseSpecialty("erdamon", "Magma Elementals", 1, "Magma Elementals"),
  "specialty.erdamon.4": unitInitiativeSpecialty("erdamon", "Magma Elementals", 4, 1, "Magma Elementals"),
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
    assets: {
      cardImage: specialtyCardImage("erdamon", 6),
      imageAlt: "Magma Elementals level VI specialty card"
    },
    implementationStatus: "implemented",
    source: heroSource("erdamon")
  },
  // Monere (Magic Elementals): I = +1 attack/defence; IV = +1 initiative for
  // the combat — both doubled for the Magic Elementals unit; VI = +2 attack OR
  // +2 power (both one-shot instants, no doubling).
  "specialty.monere.1": towerAttackOrDefenseSpecialty("monere", "Magic Elementals", 1, "Magic Elementals"),
  "specialty.monere.4": unitInitiativeSpecialty("monere", "Magic Elementals", 4, 1, "Magic Elementals"),
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
    assets: {
      cardImage: specialtyCardImage("monere", 6),
      imageAlt: "Magic Elementals level VI specialty card"
    },
    implementationStatus: "implemented",
    source: heroSource("monere")
  },
  // Pasis (Elementals generalist): every bonus doubles for any "… Elementals"
  // unit (the "an Elementals unit" family descriptor). I = +1 initiative for
  // the combat; IV = +1 attack/defence; VI = +1 HP for the combat.
  "specialty.pasis.1": unitInitiativeSpecialty("pasis", "Elementals", 1, 1, "an Elementals unit"),
  "specialty.pasis.4": towerAttackOrDefenseSpecialty("pasis", "Elementals", 4, "an Elementals unit"),
  "specialty.pasis.6": towerHealthSpecialty("pasis", "Elementals", 6, 1, "an Elementals unit"),

  // ---- Conflux Elementalist (Luna — the Fire Wall specialist) -------------
  // I/VI place a Fire Wall token (this card or a token) on an empty space for
  // the Combat, biting any unit that stops on it and any ground/ranged unit
  // passing through for a FIXED 1 (I) / 3 (VI) damage — the SAME engine token as
  // the Fire Wall spell (`PLACE_FIRE_WALL_FIXED`). IV is the spell-economy "OR":
  // take a card from your discard pile (works on the map AND in Combat via
  // `allowInCombat`, exactly like Adelaide/Glacius IV — the engine opens the
  // discard-pick straight away in a live fight, otherwise it resolves through the
  // map reward queue) — OR — +2 Power on a Spell you are casting (a
  // SPELL_CAST_STARTED reaction, like Monere VI).
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
    assets: {
      cardImage: specialtyCardImage("luna", 1),
      imageAlt: "Fire Wall level I specialty card"
    },
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
      "Instant (map or Combat): Take one card from your discard pile into your hand. — OR — Instant: +2 Power."
    ],
    target: { type: "none" },
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Take a card from your discard pile",
          effect: { type: "TAKE_FROM_DISCARD", count: 1, allowInCombat: true }
        },
        {
          label: "+2 Power",
          trigger: { event: "SPELL_CAST_STARTED", controller: "self" },
          effect: { type: "ADD_SPELL_POWER", amount: 2 }
        }
      ]
    },
    assets: {
      cardImage: specialtyCardImage("luna", 4),
      imageAlt: "Fire Wall level IV specialty card"
    },
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
    assets: {
      cardImage: specialtyCardImage("luna", 6),
      imageAlt: "Fire Wall level VI specialty card"
    },
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
  "specialty.ciele.1": {
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
          // Per the wiki this is an <instant> with no map/combat restriction, so
          // it is playable BOTH on the map and mid-Combat (allowInCombat opens the
          // discard pick immediately in a live fight instead of parking it on the
          // map reward queue). It always reads the player's OWN discard pile.
          label: "Take a Magic Arrow from your discard pile",
          effect: { type: "TAKE_FROM_DISCARD", count: 1, filter: "magic-arrow", allowInCombat: true }
        },
        {
          label: "+1 Power",
          trigger: { event: "SPELL_CAST_STARTED", controller: "self" },
          effect: { type: "ADD_SPELL_POWER", amount: 1 }
        }
      ]
    },
    assets: {
      cardImage: specialtyCardImage("ciele", 1),
      imageAlt: "Magic Arrow level I specialty card"
    },
    implementationStatus: "implemented",
    source: heroSource("ciele")
  },
  "specialty.ciele.4": {
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
          // The wiki reads "Take a Magic Arrow spell from YOUR discard pile and
          // cast it." Magic Arrow is a STARTING_ONLY spell, so it never enters the
          // shared Spell deck — a cast copy always lands in the player's OWN
          // discard pile. `ownDiscard` points the cast-from-discard pipeline there
          // instead of the shared Spell-deck discard (the Helm's source).
          label: "Cast a Magic Arrow from your discard pile (free)",
          combatOnly: true,
          effect: { type: "CAST_FROM_SPELL_DISCARD", spellId: "spell.magic_arrow", ownDiscard: true }
        },
        {
          label: "+1 Power",
          trigger: { event: "SPELL_CAST_STARTED", controller: "self" },
          effect: { type: "ADD_SPELL_POWER", amount: 1 }
        }
      ]
    },
    assets: {
      cardImage: specialtyCardImage("ciele", 4),
      imageAlt: "Magic Arrow level IV specialty card"
    },
    implementationStatus: "implemented",
    source: heroSource("ciele")
  },
  "specialty.ciele.6": {
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
    assets: {
      cardImage: specialtyCardImage("ciele", 6),
      imageAlt: "Magic Arrow level VI specialty card"
    },
    implementationStatus: "implemented",
    source: heroSource("ciele")
  },

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
  "specialty.tarnum_conflux.1": {
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
    assets: {
      cardImage: specialtyCardImage("tarnum_conflux", 1),
      imageAlt: "Enchanters level I specialty card"
    },
    implementationStatus: "implemented",
    source: heroSource("tarnum_conflux")
  },
  "specialty.tarnum_conflux.4": {
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
    assets: {
      cardImage: specialtyCardImage("tarnum_conflux", 4),
      imageAlt: "Enchanters level IV specialty card"
    },
    implementationStatus: "implemented",
    source: heroSource("tarnum_conflux")
  },
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
  //
  // POLISH SPELL BOOK (house rule `polish-spell-book`, USER RULING 2026-08-22):
  // with the Book on, a Searched Spell is NEVER added to the hand or the Book —
  // it is laid FACE UP on the shared Spell discard and the free over-limit cast
  // is made from THERE (an uncast one simply stays on that discard). The MAP
  // play is withheld under the Book (the over-limit cast only exists in a
  // Combat, so a map play would be pure deck churn). Engine:
  // `tarnumOverlimitSpellAvailable` / `takeTarnumOverlimitSpellFromSharedDiscard`
  // (polish-spell-book.ts); pinned in conflux-tarnum-specialty.test.ts
  // ("Tarnum VI under the Polish Spell Book"), rule-off CONTROLs included.
  "specialty.tarnum_conflux.6": {
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
    assets: {
      cardImage: specialtyCardImage("tarnum_conflux", 6),
      imageAlt: "Enchanters level VI specialty card"
    },
    implementationStatus: "implemented",
    source: heroSource("tarnum_conflux")
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
      "Instant (any time, incl. an enemy unit's turn start or end of its move): discard 1 card, then target a space on the Combat board and choose up to 2 units adjacent to it (not the space itself, friend or foe) to take 1 damage."
    ],
    target: { type: "any-space" },
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Discard 1 card: 1 damage to up to 2 units adjacent to a space",
          combatAnytime: true,
          cost: { discardCards: 1 },
          effect: {
            type: "AREA_DAMAGE_PICK_ADJACENT",
            amount: 1,
            includeCenter: false,
            adjacentPicks: 2
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
      "Instant (map or Combat): select 1 Spell or Specialty card from your discard pile and put it back in your hand."
    ],
    target: { type: "none" },
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Take a Spell or Specialty card from your discard pile",
          combatAnytime: true,
          effect: { type: "TAKE_FROM_DISCARD", count: 1, filter: "spell-or-specialty", allowInCombat: true }
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
      "Instant (any time, incl. an enemy unit's turn start or end of its move): discard 2 cards, then target a space on the Combat board and choose up to 2 units adjacent to it (not the space itself, friend or foe) to take 2 damage."
    ],
    target: { type: "any-space" },
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Discard 2 cards: 2 damage to up to 2 units adjacent to a space",
          combatAnytime: true,
          cost: { discardCards: 2 },
          effect: {
            type: "AREA_DAMAGE_PICK_ADJACENT",
            amount: 2,
            includeCenter: false,
            adjacentPicks: 2
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
  // machinery (AREA_DAMAGE_PICK_ADJACENT, includeCenter:false). Like the Frost
  // Ring Spell, the ring hits UP TO 2 adjacent units (the caster picks when more
  // are adjacent); the discard is paid FIRST, before the space is targeted. IV is
  // a spell-economy choice (recall a Spell/Specialty OR +2 Power on the next cast);
  // its recall works in Combat as well as on the map (allowInCombat).
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
      "Instant (any time, incl. an enemy unit's turn start or end of its move): discard 1 card, then target a space and choose up to 2 units adjacent to it (not the space itself, friend or foe) to take 1 damage."
    ],
    target: { type: "any-space" },
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Discard 1 card: 1 damage to up to 2 units adjacent to a space",
          combatAnytime: true,
          cost: { discardCards: 1 },
          effect: { type: "AREA_DAMAGE_PICK_ADJACENT", amount: 1, includeCenter: false, adjacentPicks: 2 }
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
      "Instant (map or Combat): take a Spell or Specialty card from your discard pile. — OR — Instant: +2 Power on your next spell this Combat."
    ],
    target: { type: "none" },
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Take a Spell or Specialty card from your discard pile",
          combatAnytime: true,
          effect: { type: "TAKE_FROM_DISCARD", count: 1, filter: "spell-or-specialty", allowInCombat: true }
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
      "Instant (any time, incl. an enemy unit's turn start or end of its move): discard 1 card, then target a space and choose up to 2 units adjacent to it (not the space itself, friend or foe) to take 2 damage."
    ],
    target: { type: "any-space" },
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Discard 1 card: 2 damage to up to 2 units adjacent to a space",
          combatAnytime: true,
          cost: { discardCards: 1 },
          effect: { type: "AREA_DAMAGE_PICK_ADJACENT", amount: 2, includeCenter: false, adjacentPicks: 2 }
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

  // Eikthurn (Chieftain): Mountain Rams specialist (the bronze level-2 unit) — the
  // standard might unit-buff trio (Catherine/Dhuin pattern): I is the +1
  // attack/defense rider doubled for Mountain Rams, IV adds +1 max HP (×2 Mountain
  // Rams). VI departs from the shared helper: instead of the generic "initiative
  // buff OR draw a card" it is "initiative buff (Initiative ×2 for Mountain Rams,
  // +1 movement) OR a flat, one-shot +2 Attack on your unit's next attack" — the
  // same instant +2-attack reaction Casmetra VI uses (never doubled).
  "specialty.eikthurn.1": withoutArt(mightSpecialtyOne("eikthurn", "Mountain Rams", "Mountain Rams")),
  "specialty.eikthurn.4": withoutArt(unitHealthSpecialty("eikthurn", "Mountain Rams", 4, 1, "Mountain Rams")),
  "specialty.eikthurn.6": withoutArt({
    id: "specialty.eikthurn.6",
    name: "Mountain Rams VI",
    kind: "hero-specialty",
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    tags: [
      "hero-specialty",
      "instant",
      "eikthurn",
      // Option A is the house-rule initiative buff (doubled for Mountain Rams, +1
      // Combat movement); option B is a flat, one-shot +2 Attack on the caster's
      // next attack (an attack reaction, never doubled).
      "Combat: give a friendly unit +1 Initiative AND +1 Combat movement range this combat — Initiative doubled (+2) for Mountain Rams. — OR — Instant: your selected unit gains +2 Attack on its next attack."
    ],
    target: { type: "none" },
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "+1 Initiative & +1 movement (Initiative x2 for Mountain Rams)",
          combatOnly: true,
          target: { type: "friendly-unit" },
          effect: {
            type: "CREATE_INITIATIVE_BUFF",
            name: "Mountain Rams Specialty",
            amount: 1,
            duration: { type: "combat" },
            polarity: "positive",
            removable: false,
            doubleForUnitName: "Mountain Rams",
            // House rule (BINH): the buff also raises Combat movement by 1.
            movementBonus: 1
          }
        },
        {
          // Instant, one-shot +2 Attack on the caster's next attack (an attack
          // reaction, like Casmetra VI). Flat — no Mountain Rams doubling.
          label: "+2 attack",
          trigger: { event: "UNIT_ATTACK_DECLARED", controller: "self" },
          effect: { type: "ADD_COMBAT_STAT", stat: "attack", amount: 2 }
        }
      ]
    },
    implementationStatus: "implemented",
    source: heroSource("eikthurn")
  }),

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
          // Printed Instant card-manipulation → playable on the map AND
          // mid-Combat (see instantSideAllowedInCombat); no `mapOnly`.
          label: "Remove 1 card: draw the top Artifact card",
          cost: { discardCards: 1, removeCostCards: true },
          effect: { type: "DRAW_TOP_ARTIFACT" }
        },
        {
          label: "Discard 3 cards: draw the top Artifact card",
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
  // via CREATE_ACTIVE_EFFECT); IV is a printed Instant that Searches (3) her deck
  // and shuffles her discard pile back in (SEARCH_DECK_THEN_RESHUFFLE) — playable
  // on the map AND mid-Combat (instantSideAllowedInCombat).
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
          // Printed Instant card-manipulation → playable on the map AND
          // mid-Combat (see instantSideAllowedInCombat); no `mapOnly`. The reducer
          // opens the own-deck pick with a combat returnPhase during a live fight.
          label: "Search (3) your deck, then shuffle the discard into your deck",
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
  "specialty.valeska.1": withSpecialtyArt(towerHealthSpecialty("valeska", "Marksmen", 1, 1, "Marksmen")),
  "specialty.valeska.4": withSpecialtyArt(towerAttackOrDefenseSpecialty("valeska", "Marksmen", 4, "Marksmen")),
  "specialty.valeska.6": withSpecialtyArt(activateRangedOrDrawSpecialty("valeska", "Marksmen", 6, 2)),
  // Ingham (Castle): the Zealots specialist. I = +1 A/D; IV = +1 HP (both
  // doubled for a Zealots unit); VI = your selected unit ignores Defense, or draw 1.
  "specialty.ingham.1": withSpecialtyArt(towerAttackOrDefenseSpecialty("ingham", "Zealots", 1, "Zealots")),
  "specialty.ingham.4": withSpecialtyArt(towerHealthSpecialty("ingham", "Zealots", 4, 1, "Zealots")),
  "specialty.ingham.6": withSpecialtyArt(ignoreDefenseOrDrawSpecialty("ingham", "Zealots", 6, 1)),
  // Lorelei (Dungeon): the Harpies specialist. I = +1 A/D; IV = +1 HP; VI = +2
  // attack on your attack — all doubled for a Harpies unit.
  "specialty.lorelei.1": withSpecialtyArt(towerAttackOrDefenseSpecialty("lorelei", "Harpies", 1, "Harpies")),
  "specialty.lorelei.4": withSpecialtyArt(towerHealthSpecialty("lorelei", "Harpies", 4, 1, "Harpies")),
  "specialty.lorelei.6": withSpecialtyArt(attackInstantSpecialty("lorelei", "Harpies", 6, 2, "Harpies")),
  // Septienna (Necropolis): the Death Ripple specialist. Each grade tier of
  // enemy units takes damage (I bronze, IV silver, VI golden+azure), or +Power
  // on a Spell you are casting.
  "specialty.septienna.1": withSpecialtyArt(deathRippleSpecialty(1, ["bronze"], 1, 1)),
  "specialty.septienna.4": withSpecialtyArt(deathRippleSpecialty(4, ["silver"], 1, 1)),
  "specialty.septienna.6": withSpecialtyArt(deathRippleSpecialty(6, ["gold", "azure"], 2, 2)),
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
  "specialty.ivor.1": withSpecialtyArt(
    forceAttackRollSpecialty("ivor", "Elves", 1, 0, "any", "Set all dice of the next attack roll to \"0\".")
  ),
  // IV: +1 attack OR +1 defense, doubled for a ranged unit (NEW doubleForUnitType).
  "specialty.ivor.4": withSpecialtyArt(attackOrDefenseByTypeSpecialty("ivor", "Elves", 4, "ranged", "a ranged unit")),
  // VI: +2 HP for the Combat (selected unit) — OR — set all dice of your own
  // attack roll to "+1" (the only value that maximises an attack, so the engine
  // realises "the values of your choice").
  "specialty.ivor.6": withSpecialtyArt({
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
  "specialty.tarnum_castle.1": withSpecialtyArt({
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
          combatAnytime: true,
          effect: { type: "BALLISTA_SPECIALTY", activate: "one" }
        }
      ]
    },
    implementationStatus: "implemented",
    source: heroSource("tarnum_castle")
  }),
  // IV: gain an extra Ballista for this Combat (discarded afterwards) — OR — draw 1.
  "specialty.tarnum_castle.4": withSpecialtyArt({
    id: "specialty.tarnum_castle.4",
    name: "Ballista IV",
    kind: "hero-specialty",
    timing: "instant",
    tags: [
      "hero-specialty",
      "instant",
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
          combatAnytime: true,
          effect: { type: "BALLISTA_SPECIALTY", grant: "combat" }
        },
        {
          label: "Draw 1 card",
          combatAnytime: true,
          effect: { type: "DRAW_CARDS", amount: 1 }
        }
      ]
    },
    implementationStatus: "implemented",
    source: heroSource("tarnum_castle")
  }),
  // VI: choose 2 enemy units; each suffers 2 damage (NEW DAMAGE_CHOSEN_ENEMIES).
  "specialty.tarnum_castle.6": withSpecialtyArt({
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
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Choose 2 enemy units: 2 damage to each",
          combatAnytime: true,
          effect: { type: "DAMAGE_CHOSEN_ENEMIES", count: 2, amount: 2 }
        }
      ]
    },
    implementationStatus: "implemented",
    source: heroSource("tarnum_castle")
  }),

  // Merist (Fortress, Witch): the Stone Skin specialist — a defensive magic hero.
  // I: defense reaction — +1 defense to the attacked unit, +1 more if it is
  // orthogonally adjacent to the attacker (NEW extraIfAdjacentToAttacker).
  "specialty.merist.1": withSpecialtyArt({
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
  "specialty.merist.4": withSpecialtyArt({
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
  "specialty.merist.6": withSpecialtyArt({
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
  // Town's roster on the fan wiki. Their pages used to show only the deck-back
  // placeholder, so they shipped a PC portrait and face-less cards; the 2026-08 wiki
  // art refresh (scripts/fetch-hero-art-refresh.py) published their real boards AND
  // specialty faces, so — like batch 3/4 — they now carry both (withSpecialtyArt).
  // Every I/IV/VI specialty runs in the engine and is mutation-checked
  // (extra-heroes-batch5-specialties.test.ts).

  // Ash (Inferno, Heretic): the Bloodlust specialist — pumps a ground/flying unit's
  // attack but "places a Black cube" on it (it spends its Retaliation). I/VI are
  // instants on your declared attack (their cube is the ordinary round-scoped
  // one); IV is an ONGOING +2 attack / +1 initiative whose cube rides the card:
  // the unit cannot retaliate for the WHOLE Combat while the effect lives
  // (CANNOT_RETALIATE modifier — USER RULING 2026-08-12).
  "specialty.ash.1": withSpecialtyArt({
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
  "specialty.ash.4": withSpecialtyArt({
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
          { type: "INITIATIVE_BONUS", amount: 1 },
          // The printed "Place a Black cube" rides the ONGOING card, so the
          // unit cannot perform a Retaliation Attack for the whole Combat —
          // round-start cube resets never lift it while the effect lives.
          { type: "CANNOT_RETALIATE" }
        ]
      },
      placeBlackCube: true
    },
    implementationStatus: "implemented",
    source: heroSource("ash")
  }),
  "specialty.ash.6": withSpecialtyArt({
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
  "specialty.gerwulf.1": withSpecialtyArt({
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
          combatAnytime: true,
          effect: { type: "BALLISTA_SPECIALTY", activate: "one" }
        }
      ]
    },
    implementationStatus: "implemented",
    source: heroSource("gerwulf")
  }),
  "specialty.gerwulf.4": withSpecialtyArt({
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
  "specialty.gerwulf.6": withSpecialtyArt({
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
  "specialty.tarnum_dungeon.1": withSpecialtyArt(mightSpecialtyOne("tarnum_dungeon", "Dragons", "a Dragons unit")),
  "specialty.tarnum_dungeon.4": withSpecialtyArt({
    id: "specialty.tarnum_dungeon.4",
    name: "Dragons IV",
    kind: "hero-specialty",
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    tags: [
      "hero-specialty",
      "combat",
      "tarnum_dungeon",
      "dragons",
      "Choose a row (straight line of 5 consecutive spaces). Every unit in that row suffers 2 damage."
    ],
    target: { type: "none" },
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Choose a row: every unit in it suffers 2 damage",
          combatAnytime: true,
          target: { type: "any-space" },
          effect: { type: "DAMAGE_BATTLEFIELD_LINE", amount: 2 }
        }
      ]
    },
    implementationStatus: "implemented",
    source: heroSource("tarnum_dungeon")
  }),
  "specialty.tarnum_dungeon.6": withSpecialtyArt({
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
          combatAnytime: true,
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
  "specialty.sephinroth.1": withSpecialtyArt({
    id: "specialty.sephinroth.1",
    name: "Valuables I",
    kind: "hero-specialty",
    timing: "instant",
    tags: [
      "hero-specialty",
      "instant",
      "sephinroth",
      "valuables",
      "Pay 1 gold to gain 1 valuables. — OR — Draw 1 card."
    ],
    target: { type: "none" },
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Pay 1 gold to gain 1 valuables",
          mapOnly: true,
          effect: { type: "GAIN_RESOURCES", gain: { valuables: 1 }, goldCost: 1 }
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
  "specialty.sephinroth.4": withSpecialtyArt({
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
  "specialty.sephinroth.6": withSpecialtyArt({
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
  // variants. They shipped PC portraits + face-less specialty cards until the
  // 2026-08 wiki art refresh published their printed boards AND specialty faces,
  // so they now carry the real scans (withSpecialtyArt), like batches 4-5. Every
  // specialty runs in the engine (extra-heroes-batch6-specialties.test.ts).

  // Octavia (Inferno, Demoniac, A2 D2 P1 K1, Scholar): the "Gold" Resource-die
  // specialist. I's signature half is a REACTION offered the moment a Resource
  // die is rolled (octaviaGoldReactionOption) — discard this card to set a rolled
  // die to "6 gold"; the card itself encodes only its OR alternative "Draw 1
  // card". IV/VI roll Resource dice on the map (RESOURCE_FORTUNE_PLAY) — VI rolls
  // 2 and resolves one through the existing roll-resource CHOOSE_ONE — each with a
  // combat / draw alternative.
  "specialty.octavia.1": withSpecialtyArt({
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
  "specialty.octavia.4": withSpecialtyArt({
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
  "specialty.octavia.6": withSpecialtyArt({
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
  "specialty.melodia.1": withSpecialtyArt({
    id: "specialty.melodia.1",
    name: "Fortune I",
    kind: "hero-specialty",
    timing: "instant",
    tags: [
      "hero-specialty",
      "instant",
      "melodia",
      "fortune",
      "Gain a positive morale token and 1 gold. — OR — During Combat, draw 1 card as an Instant."
    ],
    target: { type: "none" },
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Gain a positive morale token and 1 gold",
          mapOnly: true,
          effect: { type: "RESOURCE_FORTUNE_PLAY", morale: 1, gold: 1 }
        },
        {
          label: "Draw 1 card",
          combatOnly: true,
          combatAnytime: true,
          effect: { type: "DRAW_CARDS", amount: 1 }
        }
      ]
    },
    implementationStatus: "implemented",
    source: heroSource("melodia")
  }),
  "specialty.melodia.4": withSpecialtyArt({
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
  "specialty.melodia.6": withSpecialtyArt({
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
  // Bron's. VI is a CHOOSE_ONE (the wiki card prints two separate <instant>
  // abilities = pick ONE, never both):
  //   A — the buffed attack fires the unit's die-gated after-attack ability
  //       regardless of the roll (forceAbilityRolls → forceAbilityRollsThisAttack),
  //       with NO attack bonus (amount 0).
  //   B — the buffed attack gains +2 attack (and does NOT force any ability roll).
  "specialty.tarnum_fortress.1": withSpecialtyArt(mightSpecialtyOne("tarnum_fortress", "Basilisks", "Basilisks")),
  "specialty.tarnum_fortress.4": withSpecialtyArt(unitHealthSpecialty("tarnum_fortress", "Basilisks", 4, 1, "Basilisks")),
  "specialty.tarnum_fortress.6": withSpecialtyArt({
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
      "Your selected unit uses its special ability regardless of the required roll's result. — OR — Your selected unit gains +2 attack.",
      // engine: option A fires every die-GATED after-attack ability regardless of
      // the roll — the Basilisk/Azure Paralysis, Gorgon Death Stare, Wyvern/
      // Thunderbird flat-damage Sting, Rust Dragon Acid token and Minotaur draw
      // (forceAbilityRolls) — with no attack bonus. The passive attack/defense-on-
      // die riders (Dread Knight Death Blow, Zombie/Manticore Resilience) are
      // attack-maths modifiers, NOT triggered abilities, so they are not affected.
      // Option B is a flat +2 attack on the declared attack.
    ],
    target: { type: "none" },
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Use special ability regardless of the roll",
          trigger: { event: "UNIT_ATTACK_DECLARED", controller: "self" },
          effect: { type: "ADD_COMBAT_STAT", stat: "attack", amount: 0, forceAbilityRolls: true }
        },
        {
          label: "+2 attack",
          trigger: { event: "UNIT_ATTACK_DECLARED", controller: "self" },
          effect: { type: "ADD_COMBAT_STAT", stat: "attack", amount: 2 }
        }
      ]
    },
    implementationStatus: "implemented",
    source: heroSource("tarnum_fortress")
  }),

  // Tarnum (Rampart, Ranger, A1 D3 P1 K1, Leadership): the Sharpshooters specialist.
  // I/IV are the standard creature buffs, doubled for the Elves OR Sharpshooters
  // unit (the multi-unit descriptor unitMatchesSpecialtyName splits on "or"). VI is
  // a CHOOSE_ONE: borrow a Sharpshooters from the silver Neutral deck for this
  // Combat (BORROW_NEUTRAL_UNIT, gated to combat round 1) — OR — draw a card.
  "specialty.tarnum_rampart.1": withSpecialtyArt(
    mightSpecialtyOne("tarnum_rampart", "Sharpshooters", "Elves or Sharpshooters")
  ),
  "specialty.tarnum_rampart.4": withSpecialtyArt(
    unitInitiativeSpecialty("tarnum_rampart", "Sharpshooters", 4, 1, "Elves or Sharpshooters")
  ),
  "specialty.tarnum_rampart.6": withSpecialtyArt({
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
          combatAnytime: true,
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
  "specialty.cassiopeia.1": towerAttackOrDefenseSpecialty("cassiopeia", "Oceanids", 1, "Oceanids"),
  "specialty.cassiopeia.4": unitInitiativeSpecialty("cassiopeia", "Oceanids", 4, 1, "Oceanids"),
  "specialty.cassiopeia.6": towerStatBoostSpecialty("cassiopeia", "Oceanids", 6, "attack", 2, "Oceanids"),
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
  // Jeremy I's specialty face was missing from the first Cove art pack (only IV/VI
  // shipped); the 2026-08 wiki refresh added it, so all three now carry the scan.
  "specialty.jeremy.1": withSpecialtyArt({
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
          combatAnytime: true,
          effect: { type: "DAMAGE_CHOSEN_ENEMIES", count: 1, amount: 1 }
        }
      ]
    },
    implementationStatus: "implemented",
    source: heroSource("jeremy")
  }),
  // Wiki: both sides are `<instant>` (not activation-only). Timed "instant" so
  // the free Cannon shot and the draw are playable anytime in combat (including
  // off-turn), and the specialty always cycles to discard on play.
  "specialty.jeremy.4": {
    id: "specialty.jeremy.4",
    name: "Cannon IV",
    kind: "hero-specialty",
    timing: "instant",
    tags: [
      "hero-specialty",
      "instant",
      "jeremy",
      "cannon",
      "Instant: Use the Cannon once (2 damage to a chosen enemy) without spending the expert; it does not count against the Cannon's round limit. — OR — Instant: Draw 1 card."
    ],
    target: { type: "none" },
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Use the Cannon once for free (2 damage to a chosen enemy)",
          combatOnly: true,
          combatAnytime: true,
          requiresWarMachine: "war_machine.cannon",
          effect: { type: "DAMAGE_CHOSEN_ENEMIES", count: 1, amount: 2 }
        },
        {
          label: "Draw 1 card",
          combatAnytime: true,
          effect: { type: "DRAW_CARDS", amount: 1 }
        }
      ]
    },
    assets: {
      cardImage: specialtyCardImage("jeremy", 4),
      imageAlt: "Cannon level IV specialty card"
    },
    implementationStatus: "implemented",
    source: heroSource("jeremy")
  },
  // Wiki: both sides are `<instant>` (same as IV).
  "specialty.jeremy.6": {
    id: "specialty.jeremy.6",
    name: "Cannon VI",
    kind: "hero-specialty",
    timing: "instant",
    tags: [
      "hero-specialty",
      "instant",
      "jeremy",
      "cannon",
      "Instant: Use the Cannon once (2 damage to a chosen enemy) without spending the expert; it does not count against the Cannon's round limit. — OR — Instant: Draw 2 cards."
    ],
    target: { type: "none" },
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Use the Cannon once for free (2 damage to a chosen enemy)",
          combatOnly: true,
          combatAnytime: true,
          requiresWarMachine: "war_machine.cannon",
          effect: { type: "DAMAGE_CHOSEN_ENEMIES", count: 1, amount: 2 }
        },
        {
          label: "Draw 2 cards",
          combatAnytime: true,
          effect: { type: "DRAW_CARDS", amount: 2 }
        }
      ]
    },
    assets: {
      cardImage: specialtyCardImage("jeremy", 6),
      imageAlt: "Cannon level VI specialty card"
    },
    implementationStatus: "implemented",
    source: heroSource("jeremy")
  },

  // Zilare (Navigator, magic, A2 D0 P1 K2, Interference): the Forgetfulness
  // specialist. The "cannot attack next activation" option reuses the engine's
  // FORGETFULNESS effect (the same one behind spell.forgetfulness): the chosen
  // enemy cannot attack during its next activation, grade-gated (I -> silver,
  // IV/VI -> gold) and type-gated by the option's target (ranged for I/IV, any
  // unit for VI). The alternative draws a card (I) or, like Septienna's Death
  // Ripple, adds +2 Power to a Spell you are casting (IV/VI).
  "specialty.zilare.1": {
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
    assets: {
      cardImage: specialtyCardImage("zilare", 1),
      imageAlt: "Forgetfulness level I specialty card"
    },
    implementationStatus: "implemented",
    source: heroSource("zilare")
  },
  "specialty.zilare.4": {
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
    assets: {
      cardImage: specialtyCardImage("zilare", 4),
      imageAlt: "Forgetfulness level IV specialty card"
    },
    implementationStatus: "implemented",
    source: heroSource("zilare")
  },
  "specialty.zilare.6": {
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
    assets: {
      cardImage: specialtyCardImage("zilare", 6),
      imageAlt: "Forgetfulness level VI specialty card"
    },
    implementationStatus: "implemented",
    source: heroSource("zilare")
  },

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
  "specialty.casmetra.1": towerAttackOrDefenseSpecialty("casmetra", "Sorceresses", 1, "Sorceresses"),
  "specialty.casmetra.4": unitInitiativeSpecialty("casmetra", "Sorceresses", 4, 1, "Sorceresses"),
  // Casmetra VI is a CHOICE (— OR —), re-confirmed against the owner's physical
  // card 2026-06 (like Moandor VI): the fan wiki renders the two clauses with no
  // "OR" (looking like a combined AND), but the printed card is choose-one.
  "specialty.casmetra.6": {
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
    assets: {
      cardImage: specialtyCardImage("casmetra", 6),
      imageAlt: "Sorceresses level VI specialty card"
    },
    implementationStatus: "implemented",
    source: heroSource("casmetra")
  }
};

// ---------------------------------------------------------------------------
// Anime Realms magic heroes — themed clones of proven GENERIC specialties.
// ---------------------------------------------------------------------------

/**
 * Clone an existing, fully generic specialty under a new hero slug: same wired
 * effect (so every behaviour test on the source card covers it), new id/name,
 * no baked art (the native renderer draws the new hero's own portrait instead
 * of the source hero's printed scan). Used by the Anime Realms magic heroes,
 * whose sets are mechanically the generic medic / first-aid specialties.
 */
function rethemedSpecialty(
  from: CardLibrary[string],
  fromSlug: string,
  heroSlug: string,
  level: 1 | 4 | 6,
  name: string
): CardLibrary[string] {
  const next = structuredClone(from) as CardLibrary[string];
  next.id = `specialty.${heroSlug}.${level}`;
  next.name = `${name} ${ROMAN[level]}`;
  next.tags = from.tags?.map((tag) => (tag === fromSlug ? heroSlug : tag));
  delete next.assets;
  next.source = {
    product: "Anime Mod — Ninefold Realms × Otherworld Gate",
    credit: `Original hero specialty for this digital module; identical wiring to ${from.name}.`
  };
  return next;
}

// Aoko (Fuyuki, magic): Rion's generic medic set — heal/cleanse + card draw.
adventureCards["specialty.aoko.1"] = rethemedSpecialty(adventureCards["specialty.rion.1"], "rion", "aoko", 1, "Leyline Mending");
adventureCards["specialty.aoko.4"] = rethemedSpecialty(adventureCards["specialty.rion.4"], "rion", "aoko", 4, "Leyline Mending");
adventureCards["specialty.aoko.6"] = rethemedSpecialty(adventureCards["specialty.rion.6"], "rion", "aoko", 6, "Leyline Mending");
// Sakura Matou (Fuyuki, magic): a fully wired heal/cleanse-and-draw specialty.
adventureCards["specialty.sakura_matou.1"] = rethemedSpecialty(adventureCards["specialty.rion.1"], "rion", "sakura_matou", 1, "Gentle Resolve");
adventureCards["specialty.sakura_matou.4"] = rethemedSpecialty(adventureCards["specialty.rion.4"], "rion", "sakura_matou", 4, "Gentle Resolve");
adventureCards["specialty.sakura_matou.6"] = rethemedSpecialty(adventureCards["specialty.rion.6"], "rion", "sakura_matou", 6, "Gentle Resolve");
// Lingxi (Azure Breeze, magic): Gem's generic First Aid set (Tent + heals).
// Art-less on purpose — the native SpecialtyCard draws her portrait + the
// dedicated specialty-card medallion (`icon-first_aid.webp`), not Gem's baked
// First Aid scan. Engine wiring is identical to Gem (tests on gem cover the
// effect; lingxi is pinned for art/identity in specialty-card.test.tsx).
adventureCards["specialty.lingxi.1"] = rethemedSpecialty(adventureCards["specialty.gem.1"], "gem", "lingxi", 1, "Healing Arts");
adventureCards["specialty.lingxi.4"] = rethemedSpecialty(adventureCards["specialty.gem.4"], "gem", "lingxi", 4, "Healing Arts");
adventureCards["specialty.lingxi.6"] = rethemedSpecialty(adventureCards["specialty.gem.6"], "gem", "lingxi", 6, "Healing Arts");
// Tsunade (Hidden Leaf, magic): Gem's generic First Aid set (Tent + heals), the
// faction-agnostic medic — no unit doubling that could go dead. Distinct id +
// name ("Hundred Healings") from Lingxi's gem clone, so no collision. Art-less:
// the native SpecialtyCard draws her portrait + the First-Aid medallion.
adventureCards["specialty.tsunade.1"] = rethemedSpecialty(adventureCards["specialty.gem.1"], "gem", "tsunade", 1, "Hundred Healings");
adventureCards["specialty.tsunade.4"] = rethemedSpecialty(adventureCards["specialty.gem.4"], "gem", "tsunade", 4, "Hundred Healings");
adventureCards["specialty.tsunade.6"] = rethemedSpecialty(adventureCards["specialty.gem.6"], "gem", "tsunade", 6, "Hundred Healings");
// Akashi (Azur Lane, magic): Gem's generic First Aid set (Tent + heals), the
// faction-agnostic medic — no unit doubling that could go dead. Distinct id +
// name ("Emergency Repairs") from Lingxi's / Tsunade's gem clones, so no
// collision. Art-less: the native SpecialtyCard draws her portrait + the
// First-Aid medallion.
adventureCards["specialty.akashi.1"] = rethemedSpecialty(adventureCards["specialty.gem.1"], "gem", "akashi", 1, "Emergency Repairs");
adventureCards["specialty.akashi.4"] = rethemedSpecialty(adventureCards["specialty.gem.4"], "gem", "akashi", 4, "Emergency Repairs");
adventureCards["specialty.akashi.6"] = rethemedSpecialty(adventureCards["specialty.gem.6"], "gem", "akashi", 6, "Emergency Repairs");
// Sirius (Azur Lane, magic): Rion's generic heal/cleanse-draw set (the aoko
// precedent — a faction-agnostic medic with no unit doubling that could go
// dead). Distinct id + name ("Flawless Service") from Aoko's rion clone, so no
// collision. Art-less: the native SpecialtyCard draws her portrait + medallion.
adventureCards["specialty.sirius.1"] = rethemedSpecialty(adventureCards["specialty.rion.1"], "rion", "sirius", 1, "Flawless Service");
adventureCards["specialty.sirius.4"] = rethemedSpecialty(adventureCards["specialty.rion.4"], "rion", "sirius", 4, "Flawless Service");
adventureCards["specialty.sirius.6"] = rethemedSpecialty(adventureCards["specialty.rion.6"], "rion", "sirius", 6, "Flawless Service");
// Yaoji (Heavenly Demon, magic): Gem's generic First Aid set (Tent + heals), the
// faction-agnostic medic — no unit doubling that could go dead. Distinct id +
// name ("Blood Renewal") from every other gem clone, so no collision. Art-less:
// the native SpecialtyCard draws her portrait + the First-Aid medallion.
adventureCards["specialty.yaoji.1"] = rethemedSpecialty(adventureCards["specialty.gem.1"], "gem", "yaoji", 1, "Blood Renewal");
adventureCards["specialty.yaoji.4"] = rethemedSpecialty(adventureCards["specialty.gem.4"], "gem", "yaoji", 4, "Blood Renewal");
adventureCards["specialty.yaoji.6"] = rethemedSpecialty(adventureCards["specialty.gem.6"], "gem", "yaoji", 6, "Blood Renewal");
// Molian (Heavenly Demon, magic): Rion's generic heal/cleanse-draw set (the aoko /
// sirius precedent — a faction-agnostic medic with no unit doubling that could go
// dead). Distinct id + name ("Corpse Suture") from every other rion clone, so no
// collision. Art-less: the native SpecialtyCard draws her portrait + medallion.
adventureCards["specialty.molian.1"] = rethemedSpecialty(adventureCards["specialty.rion.1"], "rion", "molian", 1, "Corpse Suture");
adventureCards["specialty.molian.4"] = rethemedSpecialty(adventureCards["specialty.rion.4"], "rion", "molian", 4, "Corpse Suture");
adventureCards["specialty.molian.6"] = rethemedSpecialty(adventureCards["specialty.rion.6"], "rion", "molian", 6, "Corpse Suture");
for (const level of [1, 4, 6] as const) {
  adventureCards[`specialty.luohun.${level}`] = withInnateHeroRule(
    rethemedSpecialty(adventureCards[`specialty.gem.${level}`], "gem", "luohun", level, "Soul Shepherd"),
    "Innate — the Ten Thousand Souls Banner's Bound Soul has 1 Defense, 3 Health, and remains through combat round 2."
  );
  adventureCards[`specialty.shiyan.${level}`] = withInnateHeroRule(
    rethemedSpecialty(adventureCards[`specialty.rion.${level}`], "rion", "shiyan", level, "Corpse-Furnace Sutra"),
    "Innate — the first real Heavenly Demon casualty each combat round yields exactly 1 Blood Essence; Shiyan cannot increase that yield."
  );
}

// ---------------------------------------------------------------------------
// ANIME SPECIALTY REDESIGN (2026-08-25, USER REQUEST): the Fuyuki / Hidden Leaf
// / Azure Breeze / Heavenly Demon MIGHT heroes drop the generic unit-buff trio
// for distinct, fully-wired specialty identities. Every card below is a
// rethemedSpecialty clone of a shipped, behaviour-tested source set — no new
// engine arm, nothing decorative; only display names/labels are re-flavoured.
// The clone↔source mechanical identity, the two kept unit specialists
// (Illyasviel ↔ Heracles, Naruto ↔ Nine-Tails Chakra Avatar) and the
// combatAnytime registry joins for the Kakashi/Guiyan clones are pinned in
// src/data/anime/anime-specialty-redesign.test.ts.
// ---------------------------------------------------------------------------

for (const level of [1, 4, 6] as const) {
  // Shirou (Fuyuki, might) — Projection Magecraft: sacrifice a card to trace a
  // copy from its deck (Miriam's Scouting search set).
  adventureCards[`specialty.shirou_emiya.${level}`] = rethemedSpecialty(
    adventureCards[`specialty.miriam.${level}`], "miriam", "shirou_emiya", level, "Projection Magecraft"
  );
  // Rin (Fuyuki, magic-leaning might roster slot) — Gandr Shot: her jewel-stored
  // curses ARE magic arrows (Ciele's set; the recovered card really is the
  // Magic Arrow spell, so the labels keep its printed name).
  adventureCards[`specialty.rin_tohsaka.${level}`] = rethemedSpecialty(
    adventureCards[`specialty.ciele.${level}`], "ciele", "rin_tohsaka", level, "Gandr Shot"
  );
  // Kiritsugu (Fuyuki, might) — Time Alter: Innate Time Control accelerates his
  // side (Cyra's Haste set).
  adventureCards[`specialty.kiritsugu_emiya.${level}`] = rethemedSpecialty(
    adventureCards[`specialty.cyra.${level}`], "cyra", "kiritsugu_emiya", level, "Time Alter"
  );
  // Kirei (Fuyuki, might) — Black Keys: the Executor's killing arts (Ash's
  // Bloodlust set; VI's un-retaliated +3 strike is the assassination blow).
  adventureCards[`specialty.kirei_kotomine.${level}`] = rethemedSpecialty(
    adventureCards[`specialty.ash.${level}`], "ash", "kirei_kotomine", level, "Black Keys"
  );
  // Sasuke (Hidden Leaf, might) — Chidori Stream: lightning arcs to the nearest
  // bodies (Solmyr's Chain Lightning set).
  adventureCards[`specialty.sasuke.${level}`] = rethemedSpecialty(
    adventureCards[`specialty.solmyr.${level}`], "solmyr", "sasuke", level, "Chidori Stream"
  );
  // Kakashi (Hidden Leaf, might) — Raikiri · Sharingan: the lightning-blade
  // burst plus "copy a Spell or Specialty back from the discard" (Adelaide's
  // set; its three combatAnytime faces join COMBAT_ANYTIME_FACES).
  adventureCards[`specialty.kakashi_hatake.${level}`] = rethemedSpecialty(
    adventureCards[`specialty.adelaide.${level}`], "adelaide", "kakashi_hatake", level, "Raikiri · Sharingan"
  );
  // Shikamaru (Hidden Leaf, magic) — Shadow Possession: the bound unit cannot
  // attack on its next activation (Zilare's Forgetfulness set).
  adventureCards[`specialty.shikamaru_nara.${level}`] = rethemedSpecialty(
    adventureCards[`specialty.zilare.${level}`], "zilare", "shikamaru_nara", level, "Shadow Possession"
  );
  // Jiraiya (Hidden Leaf, magic) — Toad Oil Flame Bomb: burning oil pooled on
  // the battlefield (Luna's set; the card places real Fire Wall tokens, so the
  // rules text keeps that token's printed name).
  adventureCards[`specialty.jiraiya.${level}`] = rethemedSpecialty(
    adventureCards[`specialty.luna.${level}`], "luna", "jiraiya", level, "Toad Oil Flame Bomb"
  );
  // Qingyun (Azure Breeze, might) — Sword Qi Tempest: discard-fueled sword-wave
  // bursts (Xyron's Inferno set) beside his innate Sword Intent meter.
  adventureCards[`specialty.qingyun.${level}`] = rethemedSpecialty(
    adventureCards[`specialty.xyron.${level}`], "xyron", "qingyun", level, "Sword Qi Tempest"
  );
  // Jianxu (Azure Breeze, might) — Seven-Star Trap Array: an enemy-wide snare
  // aura, a warding heal, an array eruption (Miku's Voice-of-Angel wiring),
  // plus his kept Innate array rule.
  const jianxuCard = rethemedSpecialty(
    adventureCards[`specialty.miku.${level}`], "miku", "jianxu", level, "Seven-Star Trap Array"
  );
  jianxuCard.tags = jianxuCard.tags?.map((tag) => (tag === "voice-of-angel" ? "seven-star-trap-array" : tag));
  const jianxuEffect = jianxuCard.effect as { name?: string } | undefined;
  if (jianxuEffect && typeof jianxuEffect.name === "string") {
    jianxuEffect.name = "Seven-Star Trap Array";
  }
  adventureCards[`specialty.jianxu.${level}`] = withInnateHeroRule(
    jianxuCard,
    "Innate — Seven-Star Array spends 1 Sect Qi for +1 Attack only; it never stacks with Sword Array or another Qi bonus."
  );
  // Yulian (Azure Breeze, might) — Jade Body Arts: tempered-jade defense tokens
  // for the whole line (Merist's Stone Skin set), plus his kept Innate Shared
  // Ward rule.
  adventureCards[`specialty.yulian.${level}`] = withInnateHeroRule(
    rethemedSpecialty(adventureCards[`specialty.merist.${level}`], "merist", "yulian", level, "Jade Body Arts"),
    "Innate — once each combat round, when Shared Ward spends Sect Qi on a damaged defender, that unit also recovers 1 damage."
  );
  // Xuedao (Heavenly Demon, might) — Blood Ripple: tier-sweeping life-drain
  // waves (Septienna's Death Ripple set).
  adventureCards[`specialty.xuedao.${level}`] = rethemedSpecialty(
    adventureCards[`specialty.septienna.${level}`], "septienna", "xuedao", level, "Blood Ripple"
  );
  // Guiyan (Heavenly Demon, might) — Ghostfire Coil: soulfire bursting around a
  // chosen space (Glacius's Frost Ring set; its three combatAnytime faces join
  // COMBAT_ANYTIME_FACES).
  adventureCards[`specialty.guiyan.${level}`] = rethemedSpecialty(
    adventureCards[`specialty.glacius.${level}`], "glacius", "guiyan", level, "Ghostfire Coil"
  );
  // Xuanming (Heavenly Demon, might) — Legion of Bones: conscript the fallen
  // into service (Oidana's Diplomacy set). Only the display labels and the VI
  // buff's display name are re-flavoured — the mechanics text after each colon
  // and every effect stay byte-identical to Diplomacy's.
  const xuanmingCard = rethemedSpecialty(
    adventureCards[`specialty.oidana.${level}`], "oidana", "xuanming", level, "Legion of Bones"
  );
  const xuanmingEffect = xuanmingCard.effect as
    | { options?: Array<{ label?: string; effect?: { name?: string } }> }
    | undefined;
  for (const option of xuanmingEffect?.options ?? []) {
    if (option.label?.startsWith("Diplomacy:")) {
      option.label = option.label.replace("Diplomacy:", "Raise the fallen:");
    }
    if (option.effect?.name === "Diplomatic Rally") {
      option.effect.name = "Legion of Bones";
    }
  }
  adventureCards[`specialty.xuanming.${level}`] = xuanmingCard;
}

// Little Busters specialty identities. These are native-card rethemes of fully
// implemented mechanics: Riki uses Forgetfulness, Yuiko Fortune, and Kud's
// Rocket Launcher uses Meteor Shower's engine effect. Levels 1/4/6 only unlock the corresponding card; they do not
// add hidden battlefield stats. Komari retains her First-Aid card line.
adventureCards["specialty.riki_naoe.1"] = rethemedSpecialty(adventureCards["specialty.zilare.1"], "zilare", "riki_naoe", 1, "Forgetfulness");
adventureCards["specialty.riki_naoe.4"] = rethemedSpecialty(adventureCards["specialty.zilare.4"], "zilare", "riki_naoe", 4, "Forgetfulness");
adventureCards["specialty.riki_naoe.6"] = rethemedSpecialty(adventureCards["specialty.zilare.6"], "zilare", "riki_naoe", 6, "Forgetfulness");
adventureCards["specialty.yuiko_kurugaya.1"] = rethemedSpecialty(adventureCards["specialty.melodia.1"], "melodia", "yuiko_kurugaya", 1, "Fortune");
adventureCards["specialty.yuiko_kurugaya.4"] = rethemedSpecialty(adventureCards["specialty.melodia.4"], "melodia", "yuiko_kurugaya", 4, "Fortune");
adventureCards["specialty.yuiko_kurugaya.6"] = rethemedSpecialty(adventureCards["specialty.melodia.6"], "melodia", "yuiko_kurugaya", 6, "Fortune");
function kudRocketLauncherSpecialty(level: 1 | 4 | 6): CardLibrary[string] {
  const next = rethemedSpecialty(
    adventureCards[`specialty.deemer.${level}`],
    "deemer",
    "kudryavka_noumi",
    level,
    "Rocket Launcher"
  );
  if (level !== 4) {
    const neighbours = level === 1 ? "1 adjacent unit" : "2 adjacent units";
    next.tags = next.tags?.map((tag) =>
      tag.startsWith("Instant (any time")
        ? `Instant: Select a unit and ${neighbours}. Deal damage to each (friend or foe): 1 at Power 0–1, 2 at Power 2–3, or 3 at Power 4+.`
        : tag
    );
  }
  return next;
}

adventureCards["specialty.kudryavka_noumi.1"] = kudRocketLauncherSpecialty(1);
adventureCards["specialty.kudryavka_noumi.4"] = kudRocketLauncherSpecialty(4);
adventureCards["specialty.kudryavka_noumi.6"] = kudRocketLauncherSpecialty(6);
adventureCards["specialty.komari_kamikita.1"] = rethemedSpecialty(adventureCards["specialty.gem.1"], "gem", "komari_kamikita", 1, "Everyone Smiles");
adventureCards["specialty.komari_kamikita.4"] = rethemedSpecialty(adventureCards["specialty.gem.4"], "gem", "komari_kamikita", 4, "Everyone Smiles");
adventureCards["specialty.komari_kamikita.6"] = rethemedSpecialty(adventureCards["specialty.gem.6"], "gem", "komari_kamikita", 6, "Everyone Smiles");

// ---------------------------------------------------------------------------
// Monster Girl Quest: Paradox heroes
// ---------------------------------------------------------------------------

const mgqSpecialtySource = {
  product: "Monster Girl Quest: Paradox — Heroes III board-game adaptation",
  credit: "Original specialty implementation for the MGQ town module."
};

function mgqSpecialty(card: CardLibrary[string]): CardLibrary[string] {
  delete card.assets;
  card.source = mgqSpecialtySource;
  return card;
}

function mgqMadScienceSpecialty(): CardLibrary[string] {
  return {
    id: "specialty.promestein.4",
    name: "Mad Science IV",
    kind: "hero-specialty",
    timing: "map",
    tags: [
      "hero-specialty",
      "map",
      "promestein",
      "Remove one bronze Few army card, then give one silver army card +1 permanent Attack."
    ],
    target: { type: "none" },
    effect: { type: "MGQ_MAD_SCIENCE", attackBonus: 1 },
    implementationStatus: "implemented",
    source: mgqSpecialtySource
  };
}

adventureCards["specialty.luka.1"] = mgqSpecialty({
  id: "specialty.luka.1",
  name: "Quad Slash / Serene Mind I",
  kind: "hero-specialty",
  timing: "instant",
  phaseLimit: ["reaction", "combat"],
  tags: [
    "hero-specialty",
    "instant",
    "luka",
    "Reaction: one of your unit's attacks ignores Retaliation Attacks for this strike."
  ],
  trigger: { event: "UNIT_ATTACK_DECLARED", controller: "self" },
  effect: { type: "ADD_COMBAT_STAT", stat: "attack", amount: 0, ignoresRetaliation: true },
  implementationStatus: "implemented",
  source: mgqSpecialtySource
});
adventureCards["specialty.luka.4"] = mgqSpecialty({
  id: "specialty.luka.4",
  name: "Quad Slash / Serene Mind IV",
  kind: "hero-specialty",
  timing: "instant",
  phaseLimit: ["reaction", "combat"],
  tags: [
    "hero-specialty",
    "instant",
    "luka",
    "+1 Attack or Defense; doubled for Lucifina-chan, Hild, Sylph, Gnome, Undine, or Salamander."
  ],
  effect: {
    type: "CHOOSE_ONE",
    options: [
      {
        label: "+1 attack (x2 for Lucifina-chan, Hild, or a Spirit)",
        trigger: { event: "UNIT_ATTACK_DECLARED", controller: "self" },
        effect: {
          type: "ADD_COMBAT_STAT",
          stat: "attack",
          amount: 1,
          doubleForUnitName: "Lucifina-chan or Hild or Sylph or Gnome or Undine or Salamander"
        }
      },
      {
        label: "+1 defense (x2 for Lucifina-chan, Hild, or a Spirit)",
        trigger: { event: "UNIT_ATTACK_DECLARED", controller: "opponent" },
        effect: {
          type: "ADD_COMBAT_STAT",
          stat: "defense",
          amount: 1,
          doubleForUnitName: "Lucifina-chan or Hild or Sylph or Gnome or Undine or Salamander"
        }
      }
    ]
  },
  implementationStatus: "implemented",
  source: mgqSpecialtySource
});
adventureCards["specialty.luka.6"] = mgqSpecialty(
  rethemedSpecialty(
    adventureCards["specialty.tarnum_dungeon.4"],
    "tarnum_dungeon",
    "luka",
    6,
    "Quad Slash / Serene Mind"
  )
);

adventureCards["specialty.alice.1"] = mgqSpecialty({
  id: "specialty.alice.1",
  name: "Monster Lord's Haki I",
  kind: "hero-specialty",
  timing: "instant",
  tags: [
    "hero-specialty",
    "instant",
    "alice",
    "Instant: deal 1 damage to a unit."
  ],
  target: { type: "any-unit" },
  effect: {
    type: "CHOOSE_ONE",
    options: [
      {
        label: "Deal 1 damage to a unit",
        combatAnytime: true,
        effect: { type: "DEAL_DAMAGE", amount: 1, damageKind: "effect" }
      }
    ]
  },
  implementationStatus: "implemented",
  source: mgqSpecialtySource
});
adventureCards["specialty.alice.4"] = mgqSpecialty({
  id: "specialty.alice.4",
  name: "Omniscience IV",
  kind: "hero-specialty",
  timing: "instant",
  tags: ["hero-specialty", "instant", "map", "alice", "Instant or Map: choose any shared card deck and Search (1) it."],
  target: { type: "none" },
  effect: {
    type: "CHOOSE_ONE",
    options: [
      { label: "Search (1) the Ability deck", combatAnytime: true, effect: { type: "CARD_DECK_SEARCH", deck: "abilities", count: 1 } },
      { label: "Search (1) the Artifact deck", combatAnytime: true, effect: { type: "CARD_DECK_SEARCH", deck: "artifacts", count: 1 } },
      { label: "Search (1) the Spell deck", combatAnytime: true, effect: { type: "CARD_DECK_SEARCH", deck: "spells", count: 1 } }
    ]
  },
  implementationStatus: "implemented",
  source: mgqSpecialtySource
});
adventureCards["specialty.alice.6"] = mgqSpecialty({
  id: "specialty.alice.6",
  name: "Eye of Recollection VI",
  kind: "hero-specialty",
  timing: "combat",
  phaseLimit: ["combat"],
  tags: ["hero-specialty", "combat", "alice", "One enemy unit suffers -2 Attack for the whole Combat."],
  target: { type: "enemy-unit" },
  effect: {
    type: "CREATE_ACTIVE_EFFECT",
    effect: {
      name: "Eye of Recollection",
      scope: "unit",
      duration: { type: "combat" },
      polarity: "negative",
      removable: false,
      modifiers: [{ type: "ATTACK_BONUS", amount: -2 }]
    }
  },
  implementationStatus: "implemented",
  source: mgqSpecialtySource
});

adventureCards["specialty.ilias.1"] = mgqSpecialty(
  rethemedSpecialty(adventureCards["specialty.rion.1"], "rion", "ilias", 1, "Divine Wrath / Cure")
);
adventureCards["specialty.ilias.4"] = mgqSpecialty({
  id: "specialty.ilias.4",
  name: "Divine Wrath / Cure IV",
  kind: "hero-specialty",
  timing: "instant",
  tags: ["hero-specialty", "instant", "map", "ilias", "Draw 1 card, then make a friendly unit immune to all Hero Specialties for this Combat."],
  target: { type: "friendly-unit" },
  effect: {
    type: "CHOOSE_ONE",
    options: [
      {
        label: "Draw 1; this unit is immune to all Specialties this Combat",
        combatAnytime: true,
        effect: { type: "MGQ_DRAW_AND_SPECIALTY_IMMUNITY", drawCards: 1 }
      },
      {
        label: "Map: draw 1 card",
        mapOnly: true,
        target: { type: "none" },
        effect: { type: "DRAW_CARDS", amount: 1 }
      }
    ]
  },
  implementationStatus: "implemented",
  source: mgqSpecialtySource
});
adventureCards["specialty.ilias.6"] = mgqSpecialty(
  rethemedSpecialty(adventureCards["specialty.rion.6"], "rion", "ilias", 6, "Divine Wrath / Cure")
);

adventureCards["specialty.granberia.1"] = mgqSpecialty({
  id: "specialty.granberia.1",
  name: "Dragon Girl I",
  kind: "hero-specialty",
  timing: "instant",
  tags: ["hero-specialty", "instant", "map", "granberia", "Reaction: +1 Attack, then draw 1 card. On the Map, draw 1 card."],
  target: { type: "none" },
  effect: {
    type: "CHOOSE_ONE",
    options: [
      {
        label: "+1 Attack, then draw 1 card",
        trigger: { event: "UNIT_ATTACK_DECLARED", controller: "self" },
        effect: { type: "ADD_COMBAT_STAT", stat: "attack", amount: 1, drawCards: 1 }
      },
      { label: "Map: draw 1 card", mapOnly: true, effect: { type: "DRAW_CARDS", amount: 1 } }
    ]
  },
  implementationStatus: "implemented",
  source: mgqSpecialtySource
});
adventureCards["specialty.granberia.4"] = mgqSpecialty({
  id: "specialty.granberia.4",
  name: "Dragon Girl IV",
  kind: "hero-specialty",
  timing: "instant",
  tags: ["hero-specialty", "instant", "granberia", "Discard 1 card, then deal 2 damage to a unit."],
  target: { type: "any-unit" },
  effect: {
    type: "CHOOSE_ONE",
    options: [
      {
        label: "Discard 1 card; deal 2 damage to a unit",
        combatAnytime: true,
        cost: { discardCards: 1 },
        effect: { type: "DEAL_DAMAGE", amount: 2, damageKind: "effect" }
      }
    ]
  },
  implementationStatus: "implemented",
  source: mgqSpecialtySource
});
adventureCards["specialty.granberia.6"] = mgqSpecialty({
  id: "specialty.granberia.6",
  name: "Dragon Girl VI",
  kind: "hero-specialty",
  timing: "combat",
  phaseLimit: ["combat"],
  tags: [
    "hero-specialty",
    "combat",
    "granberia",
    "+1 Attack to one friendly unit for the whole Combat."
  ],
  target: { type: "friendly-unit" },
  effect: {
    type: "CREATE_ACTIVE_EFFECT",
    effect: {
      name: "Dragon Girl VI",
      scope: "unit",
      duration: { type: "combat" },
      polarity: "positive",
      removable: false,
      modifiers: [{ type: "ATTACK_BONUS", amount: 1 }]
    }
  },
  implementationStatus: "implemented",
  source: mgqSpecialtySource
});

// Only level IV has a bespoke behavior in the supplied MGQ design. Levels I
// and VI stay in Promestein's already-declared Sorcery vocabulary by retheming
// the proven Zydar spell-economy cards instead of inventing two extra effects.
adventureCards["specialty.promestein.1"] = mgqSpecialty(
  rethemedSpecialty(adventureCards["specialty.zydar.1"], "zydar", "promestein", 1, "Mad Science")
);
adventureCards["specialty.promestein.4"] = mgqMadScienceSpecialty();
adventureCards["specialty.promestein.6"] = mgqSpecialty({
  id: "specialty.promestein.6",
  name: "Mad Science VI",
  kind: "hero-specialty",
  timing: "instant",
  tags: [
    "hero-specialty",
    "instant",
    "map",
    "promestein",
    "Destroy 1 enemy unit; all your Spells gain +1 Power this Combat. OR Draw 2 cards."
  ],
  target: { type: "enemy-unit" },
  effect: {
    type: "CHOOSE_ONE",
    options: [
      {
        label: "Destroy 1 enemy; your Spells gain +1 Power this Combat",
        combatAnytime: true,
        effect: { type: "MGQ_DESTROY_UNIT_AND_EMPOWER_SPELLS", powerBonus: 1 }
      },
      {
        label: "Draw 2 cards",
        target: { type: "none" },
        effect: { type: "DRAW_CARDS", amount: 2 }
      }
    ]
  },
  implementationStatus: "implemented",
  source: mgqSpecialtySource
});
