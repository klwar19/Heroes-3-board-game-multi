import type { CombatUnitState } from "@/engine/state";

export const sampleCombatUnits: Record<string, CombatUnitState> = {
  unit_p1_griffins: {
    id: "unit_p1_griffins",
    controllerId: "p1",
    name: "Griffins",
    cardName: "Pack of Griffins",
    variant: "pack",
    type: "flying",
    attack: 3,
    defense: 0,
    maxHealth: 4,
    damage: 0,
    initiative: 9,
    position: 5,
    activatedThisRound: false,
    movedThisActivation: false,
    retaliatedThisRound: false,
    defenseToken: false,
    abilities: ["unlimited-retaliation"],
    assets: {
      cardImage: "https://en.homm3bg.wiki/assets/units-castle-bronze-griffins-pack.webp",
      imageAlt: "Pack of Griffins unit card",
      wikiUrl: "https://en.homm3bg.wiki/units/griffins/"
    }
  },
  unit_p1_elves: {
    id: "unit_p1_elves",
    controllerId: "p1",
    name: "Elves",
    cardName: "Pack of Elves",
    variant: "pack",
    type: "ranged",
    attack: 3,
    defense: 1,
    maxHealth: 3,
    damage: 0,
    initiative: 7,
    position: 1,
    activatedThisRound: false,
    movedThisActivation: false,
    retaliatedThisRound: false,
    defenseToken: false,
    abilities: ["ranged-extra-shot-on-low-roll"],
    assets: {
      cardImage: "https://en.homm3bg.wiki/assets/units-rampart-bronze-elves-pack.webp",
      imageAlt: "Pack of Elves unit card",
      wikiUrl: "https://en.homm3bg.wiki/units/elves/"
    }
  },
  unit_p2_pit_lords: {
    id: "unit_p2_pit_lords",
    controllerId: "p2",
    name: "Pit Lords",
    cardName: "Pack of Pit Lords",
    variant: "pack",
    type: "ground",
    attack: 5,
    defense: 1,
    maxHealth: 6,
    damage: 0,
    initiative: 7,
    position: 14,
    activatedThisRound: false,
    movedThisActivation: false,
    retaliatedThisRound: false,
    defenseToken: false,
    abilities: ["summon-demons"],
    assets: {
      cardImage: "https://en.homm3bg.wiki/assets/units-inferno-silver-pit_lords-pack.webp",
      imageAlt: "Pack of Pit Lords unit card",
      wikiUrl: "https://en.homm3bg.wiki/units/pit_lords/"
    }
  },
  unit_p2_magogs: {
    id: "unit_p2_magogs",
    controllerId: "p2",
    name: "Magogs",
    cardName: "Pack of Magogs",
    variant: "pack",
    type: "ranged",
    attack: 2,
    defense: 0,
    maxHealth: 3,
    damage: 0,
    initiative: 6,
    position: 18,
    activatedThisRound: false,
    movedThisActivation: false,
    retaliatedThisRound: false,
    defenseToken: false,
    abilities: ["splash-damage"],
    assets: {
      cardImage: "https://en.homm3bg.wiki/assets/units-inferno-bronze-magogs-pack.webp",
      imageAlt: "Pack of Magogs unit card",
      wikiUrl: "https://en.homm3bg.wiki/units/magogs/"
    }
  }
};
