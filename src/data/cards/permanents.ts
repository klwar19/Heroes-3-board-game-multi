import type { CardLibrary, SpellSchool } from "@/engine/state";

const wikiCredit =
  "Card stats from the fan wiki war-machine/ability pages; verify against official owned components before full content import.";

function warMachineSource(slug: string) {
  return {
    product: "Heroes of Might and Magic III: The Board Game",
    credit: wikiCredit,
    url: `https://en.homm3bg.wiki/war_machines/${slug}/`
  };
}

function abilitySource(slug: string) {
  return {
    product: "Heroes of Might and Magic III: The Board Game",
    credit: wikiCredit,
    url: `https://en.homm3bg.wiki/abilities/${slug}/`
  };
}

/** Every war machine card id, in supply/display order (cheapest first). */
export const WAR_MACHINE_CARD_IDS = [
  "war_machine.first_aid_tent",
  "war_machine.ammo_cart",
  "war_machine.ballista",
  "war_machine.catapult",
  "war_machine.cannon"
] as const;

/**
 * School of Magic ability cards (Tower expansion): permanents that boost the
 * owner's spells of one school by +1 power while in play, or discard for +3
 * power on a single matching cast (the expert effect).
 */
function schoolOfMagic(school: SpellSchool, name: string, slug: string): CardLibrary[string] {
  return {
    id: `ability.${slug}`,
    name,
    kind: "ability",
    // Permanents are played like activation/map cards: on the owner's map
    // turn or while one of their units is activating in combat.
    timing: "ongoing",
    abilityClass: "magic",
    spellSchools: [school],
    tags: ["ability", "permanent", "school-of-magic", school, "wiki-reference"],
    permanent: true,
    permanentEffect: {
      schoolBonus: { school, basicPower: 1, expertPower: 3 }
    },
    // The expert side is also playable straight from hand during one of the
    // owner's matching casts (+3 power), through the normal reaction flow.
    trigger: {
      event: "SPELL_CAST_STARTED",
      controller: "self"
    },
    effect: {
      type: "ADD_SPELL_POWER",
      amount: 0,
      expertAmount: 3
    },
    assets: {
      cardImage: `/assets/abilities-${slug}.webp`,
      imageAlt: `${name} ability card`
    },
    implementationStatus: "implemented",
    source: abilitySource(slug)
  };
}

export const permanentCards: CardLibrary = {
  // ---- War machines (Rampart / Cove / Stretch Goals) -----------------------
  "war_machine.first_aid_tent": {
    id: "war_machine.first_aid_tent",
    name: "First Aid Tent",
    kind: "war-machine",
    timing: "ongoing",
    tags: ["war-machine", "permanent", "heal", "wiki-reference"],
    permanent: true,
    permanentEffect: {
      combatEffect: {
        name: "First Aid Tent",
        scope: "player",
        duration: { type: "combat" },
        polarity: "positive",
        removable: false,
        modifiers: [
          {
            type: "HEAL_ONCE_PER_COMBAT_ROUND",
            amount: 1
          }
        ]
      }
    },
    warMachineCosts: { factory: { gold: 3 }, tradingPost: { gold: 6 } },
    effect: { type: "ENTER_PLAY" },
    assets: {
      cardImage: "/assets/war_machines-first_aid_tent.webp",
      imageAlt: "First Aid Tent war machine card"
    },
    implementationStatus: "implemented",
    source: warMachineSource("first_aid_tent")
  },
  "war_machine.ammo_cart": {
    id: "war_machine.ammo_cart",
    name: "Ammo Cart",
    kind: "war-machine",
    timing: "ongoing",
    tags: ["war-machine", "permanent", "ranged", "initiative", "wiki-reference"],
    permanent: true,
    permanentEffect: {
      combatEffect: {
        name: "Ammo Cart",
        scope: "player",
        duration: { type: "combat" },
        polarity: "positive",
        removable: false,
        modifiers: [{ type: "RANGED_IGNORE_ALL_PENALTIES" }]
      },
      rangedInitiativeBonus: 2
    },
    warMachineCosts: { factory: { gold: 5 }, tradingPost: { gold: 8 } },
    effect: { type: "ENTER_PLAY" },
    assets: {
      cardImage: "/assets/war_machines-ammo_cart.webp",
      imageAlt: "Ammo Cart war machine card"
    },
    implementationStatus: "implemented",
    source: warMachineSource("ammo_cart")
  },
  "war_machine.ballista": {
    id: "war_machine.ballista",
    name: "Ballista",
    kind: "war-machine",
    timing: "ongoing",
    tags: ["war-machine", "permanent", "damage", "wiki-reference"],
    permanent: true,
    permanentEffect: {
      roundStart: { kind: "damage-lowest-initiative", amount: 1 }
    },
    warMachineCosts: { factory: { gold: 7 }, tradingPost: { gold: 10 } },
    effect: { type: "ENTER_PLAY" },
    assets: {
      cardImage: "/assets/war_machines-ballista.webp",
      imageAlt: "Ballista war machine card"
    },
    implementationStatus: "implemented",
    source: warMachineSource("ballista")
  },
  "war_machine.catapult": {
    id: "war_machine.catapult",
    name: "Catapult",
    kind: "war-machine",
    timing: "ongoing",
    // Printed targets include Walls and the Gate; sieges are not in the
    // engine yet, so units are the only selectable targets for now.
    tags: ["war-machine", "permanent", "damage", "area", "wiki-reference"],
    permanent: true,
    permanentEffect: {
      roundStart: { kind: "pay-to-splash", cost: { buildingMaterials: 1 }, amount: 1 }
    },
    warMachineCosts: { factory: { gold: 8 }, tradingPost: { gold: 12 } },
    effect: { type: "ENTER_PLAY" },
    assets: {
      imageAlt: "Catapult war machine card"
    },
    implementationStatus: "implemented",
    source: warMachineSource("catapult")
  },
  "war_machine.cannon": {
    id: "war_machine.cannon",
    name: "Cannon",
    kind: "war-machine",
    timing: "ongoing",
    tags: ["war-machine", "permanent", "damage", "cove", "wiki-reference"],
    permanent: true,
    permanentEffect: {
      roundStart: { kind: "expert-shot", amount: 2 }
    },
    warMachineCosts: { factory: { gold: 10 }, tradingPost: { gold: 14 } },
    effect: { type: "ENTER_PLAY" },
    assets: {
      imageAlt: "Cannon war machine card"
    },
    implementationStatus: "implemented",
    source: warMachineSource("cannon")
  },

  // ---- Schools of Magic (Tower expansion) ----------------------------------
  "ability.fire_magic": schoolOfMagic("fire", "Fire Magic", "fire_magic"),
  "ability.water_magic": schoolOfMagic("water", "Water Magic", "water_magic"),
  "ability.air_magic": schoolOfMagic("air", "Air Magic", "air_magic"),
  "ability.earth_magic": schoolOfMagic("earth", "Earth Magic", "earth_magic")
};
