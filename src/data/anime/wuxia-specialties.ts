import type { CardLibrary, CardOptionDefinition, CardDefinition } from "@/engine/state";

/**
 * Bespoke hero specialties for the two wuxia towns (2026-09-23 rework). Every
 * set feeds or spends its town's meter — Azure Breeze Sect Qi / Sword Intent,
 * Heavenly Demon Blood Essence — through the engine seams in
 * src/engine/wuxia-factions.ts:
 *  - an option `cost.cultivation` is checked by canAffordCardCost and spent by
 *    payOptionCardCost (never offered when the meter is short);
 *  - an option `cultivationGain` is applied right after the option is paid;
 *  - `WUXIA_ART_CARD` carries the four town-only card arts.
 * The trailing prose tag is what the native specialty card renders and states
 * exactly what the engine runs.
 */

type Level = 1 | 4 | 6;
const ROMAN: Record<Level, string> = { 1: "I", 4: "IV", 6: "VI" };

const source = {
  product: "Anime Mod — Ninefold Realms × Otherworld Gate",
  credit: "Original wuxia hero specialty for this digital module; every clause is engine-enforced."
} as const;

function card(
  hero: string,
  name: string,
  level: Level,
  text: string,
  options: CardOptionDefinition[],
  settings: {
    timing?: CardDefinition["timing"];
    target?: CardDefinition["target"];
    trigger?: CardDefinition["trigger"];
    innate?: string;
  } = {}
): CardDefinition {
  const prose = settings.innate ? `${settings.innate} Card: ${text}` : text;
  return {
    id: `specialty.${hero}.${level}`,
    name: `${name} ${ROMAN[level]}`,
    kind: "hero-specialty",
    timing: settings.timing ?? "instant",
    phaseLimit: settings.timing === "combat" ? ["combat"] : ["reaction", "combat"],
    tags: ["hero-specialty", hero, prose],
    target: settings.target ?? { type: "none" },
    // A CHOOSE_ONE card is offered per option: the reaction trigger lives on
    // each option (getCardPlayVariants never reads a card-level trigger here).
    effect: {
      type: "CHOOSE_ONE",
      options: settings.trigger
        ? options.map((option) => ({ ...option, trigger: option.trigger ?? settings.trigger }))
        : options
    },
    implementationStatus: "implemented",
    source
  };
}

const OWN_ATTACK = { event: "UNIT_ATTACK_DECLARED", controller: "self" } as const;
const ENEMY_ATTACK = { event: "UNIT_ATTACK_DECLARED", controller: "opponent" } as const;
const OWN_SPELL = { event: "SPELL_CAST_STARTED", controller: "self" } as const;

// --- Azure Breeze Sect ------------------------------------------------------

/** Qingyun — Flying Sword Arts: ranged sword-qi strikes that temper Sword Intent. */
function qingyun(level: Level): CardDefinition {
  if (level === 6) {
    return card(
      "qingyun",
      "Flying Sword Arts",
      level,
      "Combat: deal 1 damage to each of up to 3 chosen enemy units, then your Sword Intent is fully tempered (your next own attack releases it for +1 Attack).",
      [
        {
          label: "Deal 1 damage to up to 3 enemy units; temper Sword Intent fully",
          combatOnly: true,
          cultivationGain: { swordIntent: 3 },
          effect: { type: "DAMAGE_CHOSEN_ENEMIES", count: 3, amount: 1 }
        }
      ],
      { timing: "combat" }
    );
  }
  const damage = level === 1 ? 1 : 2;
  return card(
    "qingyun",
    "Flying Sword Arts",
    level,
    `Instant during Combat: deal ${damage} damage to a chosen enemy unit and temper 1 Sword Intent. May be played in reaction windows or before an enemy activates.`,
    [
      {
        label: `Deal ${damage} damage; +1 Sword Intent`,
        combatAnytime: true,
        cultivationGain: { swordIntent: 1 },
        effect: { type: "DEAL_DAMAGE", amount: damage, damageKind: "effect" }
      }
    ],
    { target: { type: "enemy-unit" } }
  );
}

/** Lingxi — Formation Mending: the sect's healer circulates Qi through the array. */
function lingxi(level: Level): CardDefinition {
  if (level === 1) {
    return card(
      "lingxi",
      "Formation Mending",
      level,
      "Instant during Combat: gain 1 Sect Qi and draw 1 card.",
      [
        {
          label: "Gain 1 Sect Qi and draw 1 card",
          combatAnytime: true,
          effect: { type: "WUXIA_ART_CARD", art: "channel", gain: { sectQi: 1 }, drawCards: 1 }
        }
      ]
    );
  }
  if (level === 4) {
    return card(
      "lingxi",
      "Formation Mending",
      level,
      "Instant during Combat: remove up to 2 damage from one of your units, then gain 1 Sect Qi.",
      [
        {
          label: "Remove 2 damage; gain 1 Sect Qi",
          combatOnly: true,
          cultivationGain: { sectQi: 1 },
          effect: { type: "HEAL_DAMAGE", amount: 2 }
        }
      ],
      { target: { type: "friendly-unit", damagedOnly: true } }
    );
  }
  return card(
    "lingxi",
    "Formation Mending",
    level,
    "Combat: every one of your units standing beside another of your units removes 1 damage, then gain 2 Sect Qi. — OR — Instant: gain 2 Sect Qi and draw 2 cards.",
    [
      {
        label: "Mend the formation (1 damage each); gain 2 Sect Qi",
        combatOnly: true,
        cultivationGain: { sectQi: 2 },
        effect: { type: "WUXIA_ART_CARD", art: "formation-mending", amount: 1 }
      },
      {
        label: "Gain 2 Sect Qi and draw 2 cards",
        combatAnytime: true,
        effect: { type: "WUXIA_ART_CARD", art: "channel", gain: { sectQi: 2 }, drawCards: 2 }
      }
    ]
  );
}

const JIANXU_INNATE =
  "Innate — Seven-Star Array: when Sword Formation spends Sect Qi on a unit standing beside 2 or more allies, it gains +1 more Attack.";

/** Jianxu — Seven-Star Sword Array: formation strikes that scale with the array. */
function jianxu(level: Level): CardDefinition {
  const max = level === 1 ? 2 : 3;
  const tail =
    level === 4 ? " Then gain 1 Sect Qi." : level === 6 ? " This attack does not provoke Retaliation." : "";
  return card(
    "jianxu",
    "Seven-Star Sword Array",
    level,
    `Instant, your own attack: the attacker gains +1 Attack for each of your living units beside it (maximum +${max}).${tail}`,
    [
      {
        label: `+1 Attack per adjacent ally (max +${max})${level === 4 ? "; +1 Sect Qi" : level === 6 ? "; no Retaliation" : ""}`,
        ...(level === 4 ? { cultivationGain: { sectQi: 1 } } : {}),
        effect: {
          type: "WUXIA_ART_CARD",
          art: "array-strike",
          max,
          ...(level === 6 ? { ignoresRetaliation: true } : {})
        }
      }
    ],
    { trigger: OWN_ATTACK, innate: JIANXU_INNATE }
  );
}

const YULIAN_INNATE =
  "Innate — once each combat round, when Shared Ward protects a damaged unit, that unit also recovers 1 damage.";

/** Yulian — Jade Body Arts: jade-hard guards that bank Qi as they absorb blows. */
function yulian(level: Level): CardDefinition {
  const defense = level === 1 ? 1 : 2;
  const recover = level === 6 ? 2 : 0;
  return card(
    "yulian",
    "Jade Body Arts",
    level,
    `Instant, an enemy attacks your unit: that unit gains +${defense} Defense against the attack${recover ? `; if it survives, it then removes up to ${recover} damage` : ""}. Gain 1 Sect Qi.`,
    [
      {
        label: `+${defense} Defense${recover ? `, recover ${recover}` : ""}; +1 Sect Qi`,
        cultivationGain: { sectQi: 1 },
        effect: { type: "WUXIA_ART_CARD", art: "jade-guard", max: defense, ...(recover ? { recover } : {}) }
      }
    ],
    { trigger: ENEMY_ATTACK, innate: YULIAN_INNATE }
  );
}

// --- Heavenly Demon Palace ---------------------------------------------------

/** Xuedao — Blood Path Sabre: burn Blood Essence into a single devastating cut. */
function xuedao(level: Level): CardDefinition {
  const plain = level === 1 ? 1 : 2;
  const paidCost = level === 6 ? 2 : 1;
  const paid = level === 1 ? 2 : level === 4 ? 3 : 4;
  const options: CardOptionDefinition[] = [
    {
      label: `+${plain} Attack${level === 6 ? "; gain 1 Blood Essence" : ""}`,
      ...(level === 6 ? { cultivationGain: { bloodEssence: 1 } } : {}),
      effect: { type: "ADD_COMBAT_STAT", stat: "attack", amount: plain }
    },
    {
      label: `Spend ${paidCost} Blood Essence: +${paid} Attack${level === 6 ? ", no Retaliation" : ""}`,
      cost: { cultivation: { bloodEssence: paidCost } },
      effect: {
        type: "ADD_COMBAT_STAT",
        stat: "attack",
        amount: paid,
        ...(level === 6 ? { ignoresRetaliation: true } : {})
      }
    }
  ];
  return card(
    "xuedao",
    "Blood Path Sabre",
    level,
    `Instant, your own attack: +${plain} Attack${level === 6 ? " and gain 1 Blood Essence" : ""}. — OR — spend ${paidCost} Blood Essence: +${paid} Attack${level === 6 ? " and the attack does not provoke Retaliation" : ""}.`,
    options,
    { trigger: OWN_ATTACK }
  );
}

/** Guiyan — Ghostfire: soulfire bolts, stoked hotter with Blood Essence. */
function guiyan(level: Level): CardDefinition {
  const plain = level === 1 ? 1 : 2;
  const paidCost = level === 6 ? 2 : 1;
  const paid = level === 1 ? 2 : level === 4 ? 3 : 4;
  return card(
    "guiyan",
    "Ghostfire",
    level,
    `Instant during Combat: deal ${plain} damage to a chosen enemy unit${level === 6 ? " and gain 1 Blood Essence" : ""}. — OR — spend ${paidCost} Blood Essence: deal ${paid} damage instead. May be played in reaction windows or before an enemy activates.`,
    [
      {
        label: `Deal ${plain} damage${level === 6 ? "; gain 1 Blood Essence" : ""}`,
        combatAnytime: true,
        ...(level === 6 ? { cultivationGain: { bloodEssence: 1 } } : {}),
        effect: { type: "DEAL_DAMAGE", amount: plain, damageKind: "effect" }
      },
      {
        label: `Spend ${paidCost} Blood Essence: deal ${paid} damage`,
        combatAnytime: true,
        cost: { cultivation: { bloodEssence: paidCost } },
        effect: { type: "DEAL_DAMAGE", amount: paid, damageKind: "effect" }
      }
    ],
    { target: { type: "enemy-unit" } }
  );
}

/** Xuanming — Legion of Bones: every fallen enemy feeds the marching dead. */
function xuanming(level: Level): CardDefinition {
  const perRound = level === 6 ? 99 : 2;
  const heal = level === 1 ? 0 : 1;
  const gain = level === 6 ? 2 : 1;
  const harvestText =
    level === 6
      ? "Blood Harvest fires on every enemy side or Stack layer your attacks defeat"
      : "Blood Harvest may fire twice each combat round";
  return card(
    "xuanming",
    "Legion of Bones",
    level,
    `Combat: gain ${gain} Blood Essence. For the rest of this combat, ${harvestText}${heal ? ", and each Harvest removes 1 damage from the harvesting unit" : ""}.`,
    [
      {
        label: `Gain ${gain} Essence; ${level === 6 ? "unlimited" : "double"} Blood Harvest${heal ? " that heals" : ""}`,
        combatOnly: true,
        cultivationGain: { bloodEssence: gain },
        effect: {
          type: "WUXIA_ART_CARD",
          art: "legion-harvest",
          harvestsPerRound: perRound,
          ...(heal ? { harvestHeal: heal } : {})
        }
      }
    ],
    { timing: "combat" }
  );
}

/** Yaoji — Blood Alchemy: transmute Blood Essence into flesh. */
function yaoji(level: Level): CardDefinition {
  const plainHeal = level === 1 ? 1 : 2;
  const paidCost = level === 6 ? 2 : 1;
  const paidHeal = level === 1 ? 3 : level === 4 ? 3 : 5;
  const paidCleanses = level !== 1;
  return card(
    "yaoji",
    "Blood Alchemy",
    level,
    `Instant during Combat: remove up to ${plainHeal} damage from one of your units and draw 1 card${level === 6 ? ", then gain 1 Blood Essence" : ""}. — OR — spend ${paidCost} Blood Essence: remove up to ${paidHeal} damage${paidCleanses ? " and Paralysis, then draw 1 card" : ""}.`,
    [
      {
        label: `Remove ${plainHeal} damage and draw 1${level === 6 ? "; gain 1 Essence" : ""}`,
        combatOnly: true,
        ...(level === 6 ? { cultivationGain: { bloodEssence: 1 } } : {}),
        effect: { type: "HEAL_DAMAGE", amount: plainHeal, drawCards: 1 }
      },
      {
        label: `Spend ${paidCost} Essence: remove ${paidHeal} damage${paidCleanses ? " and Paralysis, draw 1" : ""}`,
        combatOnly: true,
        cost: { cultivation: { bloodEssence: paidCost } },
        effect: {
          type: "HEAL_DAMAGE",
          amount: paidHeal,
          ...(paidCleanses ? { removeParalysis: true, drawCards: 1 } : {})
        }
      }
    ],
    { target: { type: "friendly-unit" } }
  );
}

/** Molian — Corpse Weaving: stitch extra flesh onto a unit for the whole fight. */
function molian(level: Level): CardDefinition {
  const plain = level === 1 ? 1 : 2;
  const paidCost = level === 6 ? 2 : 1;
  const paid = level === 1 ? 2 : level === 4 ? 3 : 4;
  return card(
    "molian",
    "Corpse Weaving",
    level,
    `Ongoing (this Combat): one of your units gains +${plain} maximum Health${level === 6 ? " and you gain 1 Blood Essence" : ""}. — OR — spend ${paidCost} Blood Essence: +${paid} maximum Health instead.`,
    [
      {
        label: `+${plain} maximum Health${level === 6 ? "; gain 1 Essence" : ""}`,
        ...(level === 6 ? { cultivationGain: { bloodEssence: 1 } } : {}),
        effect: { type: "ADD_UNIT_MAX_HEALTH", amount: plain }
      },
      {
        label: `Spend ${paidCost} Essence: +${paid} maximum Health`,
        cost: { cultivation: { bloodEssence: paidCost } },
        effect: { type: "ADD_UNIT_MAX_HEALTH", amount: paid }
      }
    ],
    { timing: "combat", target: { type: "friendly-unit" } }
  );
}

const LUOHUN_INNATE =
  "Innate — every Bound Soul you control (the Ten Thousand Souls Banner's and this card's) has +1 Defense and +1 Health; the Banner's lasts through combat round 2.";

/** Bai Luohun — Soul Shepherd: call Bound Souls to the side of the living. */
function luohun(level: Level): CardDefinition {
  const count = level === 6 ? 2 : 1;
  const paidCost = level === 6 ? 2 : 1;
  const summonText = `${count === 1 ? "a Bound Soul" : "2 Bound Souls"} (flying 2 Attack / 0 Defense / 2 Health, ignores Retaliation) on the empty space${count === 1 ? "" : "s"} nearest one of your units; ${count === 1 ? "it lasts" : "they last"} through the next combat round`;
  const options: CardOptionDefinition[] = [
    {
      label: `Summon ${count === 1 ? "a Bound Soul" : "2 Bound Souls"}`,
      combatOnly: true,
      effect: { type: "WUXIA_ART_CARD", art: "bound-soul", count }
    }
  ];
  if (level !== 1) {
    options.push({
      label: `Spend ${paidCost} Essence: summon ${count === 1 ? "an empowered Bound Soul" : "2 empowered Bound Souls"}`,
      combatOnly: true,
      cost: { cultivation: { bloodEssence: paidCost } },
      effect: { type: "WUXIA_ART_CARD", art: "bound-soul", count, empowered: true }
    });
  }
  return card(
    "luohun",
    "Soul Shepherd",
    level,
    `Combat: summon ${summonText}.${level !== 1 ? ` — OR — spend ${paidCost} Blood Essence: ${count === 1 ? "it is" : "they are"} empowered (+1 Attack, +1 Health).` : ""}`,
    options,
    { timing: "combat", target: { type: "friendly-unit" }, innate: LUOHUN_INNATE }
  );
}

const SHIYAN_INNATE =
  "Innate — Corpse-Furnace Sutra: your casualties feed Blood Price without the once-per-round limit (each unit still feeds it once per combat).";

/** Shiyan — Corpse-Furnace Sutra: refine the dead into Essence and spell power. */
function shiyan(level: Level): CardDefinition {
  const gain = level === 6 ? 2 : 1;
  const options: CardOptionDefinition[] = [
    {
      label: `Gain ${gain} Blood Essence and draw 1 card`,
      combatAnytime: true,
      effect: { type: "WUXIA_ART_CARD", art: "channel", gain: { bloodEssence: gain }, drawCards: 1 }
    }
  ];
  if (level !== 1) {
    const cost = level === 6 ? 2 : 1;
    const power = level === 6 ? 3 : 2;
    options.push({
      label: `Spend ${cost} Essence: +${power} Power`,
      trigger: OWN_SPELL,
      cost: { cultivation: { bloodEssence: cost } },
      effect: { type: "ADD_SPELL_POWER", amount: power }
    });
  }
  return card(
    "shiyan",
    "Corpse-Furnace Sutra",
    level,
    `Instant during Combat: gain ${gain} Blood Essence and draw 1 card.${level !== 1 ? ` — OR — when you cast a Spell: spend ${level === 6 ? 2 : 1} Blood Essence for +${level === 6 ? 3 : 2} Power.` : ""}`,
    options,
    { innate: SHIYAN_INNATE }
  );
}

const BUILDERS: Record<string, (level: Level) => CardDefinition> = {
  qingyun,
  lingxi,
  jianxu,
  yulian,
  xuedao,
  guiyan,
  xuanming,
  yaoji,
  molian,
  luohun,
  shiyan
};

export const WUXIA_SPECIALTY_HEROES = Object.keys(BUILDERS);

export const wuxiaSpecialtyCards: CardLibrary = Object.fromEntries(
  Object.entries(BUILDERS).flatMap(([hero, build]) =>
    ([1, 4, 6] as const).map((level) => [`specialty.${hero}.${level}`, build(level)])
  )
);
