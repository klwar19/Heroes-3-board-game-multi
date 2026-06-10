import { ATTACK_DIE_FACES } from "./battlefield";
import { shuffleCards } from "./decks";
import type { DeckState, GameState } from "./state";
import { sampleCombatUnits } from "@/data/units/sample";

function makeSharedDeck(id: string, cardIds: string[], seed: string): DeckState {
  return {
    id,
    drawPile: shuffleCards(cardIds, `${seed}#deck#${id}`),
    discardPile: []
  };
}

export function createInitialGameState(seed = "homm3bg-dev-seed"): GameState {
  const units = JSON.parse(JSON.stringify(sampleCombatUnits)) as typeof sampleCombatUnits;

  return {
    id: "local-dev-game",
    seed,
    mode: "combat-sandbox",
    round: 1,
    phase: "combat",
    activePlayerId: "p1",
    priorityPlayerId: null,
    turnOrder: ["p1", "p2"],
    players: {
      p1: {
        id: "p1",
        name: "Rampart Alliance",
        // Personal draw pile (top = last element). Draw effects and the
        // round-start draw-up pull from here and reshuffle the discard
        // when it runs dry.
        deck: [
          "stat.defense",
          "spell.magic_arrow",
          "stat.attack",
          "stat.power",
          "stat.defense",
          "stat.attack"
        ],
        hand: [
          "spell.magic_arrow",
          "spell.lightning_bolt",
          "spell.stone_skin",
          "spell.bloodlust",
          "spell.cure",
          "spell.fortune",
          "stat.attack",
          "stat.power",
          "stat.knowledge",
          "ability.archery",
          "ability.offense",
          "ability.luck",
          "artifact.centaurs_axe",
          "artifact.ogres_club_of_havoc",
          "artifact.titans_gladius",
          "artifact.breastplate_of_petrified_wood",
          "war_machine.first_aid_tent"
        ],
        discard: [],
        removed: [],
        army: [],
        startingArmy: [],
        production: {
          gold: 0,
          buildingMaterials: 0,
          valuables: 0
        },
        townTokens: {
          build: true,
          population: true,
          spellBook: true
        },
        morale: 0,
        resources: {
          gold: 10,
          buildingMaterials: 5,
          valuables: 1
        },
        limits: {
          hand: 17,
          expertUses: 1
        },
        combatStats: {
          spellsCastThisRound: 0,
          spellLimitBonusThisRound: 0,
          expertUsesSpentThisRound: 0
        }
      },
      p2: {
        id: "p2",
        name: "Inferno Warband",
        deck: ["stat.defense", "ability.resistance", "stat.attack", "stat.defense"],
        hand: ["ability.resistance", "stat.defense", "stat.attack", "artifact.buckler_of_the_gnoll_king"],
        discard: [],
        removed: [],
        army: [],
        startingArmy: [],
        production: {
          gold: 0,
          buildingMaterials: 0,
          valuables: 0
        },
        townTokens: {
          build: true,
          population: true,
          spellBook: true
        },
        morale: 0,
        resources: {
          gold: 10,
          buildingMaterials: 5,
          valuables: 1
        },
        limits: {
          hand: 5,
          expertUses: 1
        },
        combatStats: {
          spellsCastThisRound: 0,
          spellLimitBonusThisRound: 0,
          expertUsesSpentThisRound: 0
        }
      }
    },
    adventure: null,
    map: {
      spaces: {
        town_p1: { id: "town_p1", adjacent: ["field_center"] },
        town_p2: { id: "town_p2", adjacent: ["field_center"] },
        field_center: { id: "field_center", adjacent: ["town_p1", "town_p2"] }
      }
    },
    towns: {
      town_p1: {
        id: "town_p1",
        controllerId: "p1",
        buildings: ["village_hall"]
      },
      town_p2: {
        id: "town_p2",
        controllerId: "p2",
        buildings: ["village_hall"]
      }
    },
    heroes: {
      hero_p1: {
        id: "hero_p1",
        controllerId: "p1",
        kind: "main",
        level: 1,
        experience: 0,
        movementPoints: 3,
        movementPointsMax: 3,
        spaceId: "field_center"
      },
      hero_p2: {
        id: "hero_p2",
        controllerId: "p2",
        kind: "main",
        level: 1,
        experience: 0,
        movementPoints: 3,
        movementPointsMax: 3,
        spaceId: "field_center"
      }
    },
    combat: {
      id: "combat_1",
      round: 1,
      attackerPlayerId: "p1",
      defenderPlayerId: "p2",
      activeUnitId: "unit_p1_griffins",
      context: { kind: "sandbox" },
      setup: null,
      awaitingContinue: false,
      outcome: null,
      dice: {
        faces: [...ATTACK_DIE_FACES],
        seed: `${seed}-attack-die`,
        rollCount: 0
      },
      units
    },
    // Shared table decks. Search effects reveal from the draw pile and feed
    // the matching discard pile, exactly like the physical card wells.
    decks: {
      spells: makeSharedDeck(
        "spells",
        [
          "spell.magic_arrow",
          "spell.magic_arrow",
          "spell.lightning_bolt",
          "spell.stone_skin",
          "spell.bloodlust",
          "spell.cure",
          "spell.fortune"
        ],
        seed
      ),
      abilities: makeSharedDeck(
        "abilities",
        ["ability.resistance", "ability.archery", "ability.offense", "ability.luck"],
        seed
      ),
      artifacts: makeSharedDeck(
        "artifacts",
        [
          "artifact.centaurs_axe",
          "artifact.ogres_club_of_havoc",
          "artifact.titans_gladius",
          "artifact.buckler_of_the_gnoll_king",
          "artifact.breastplate_of_petrified_wood"
        ],
        seed
      )
    },
    stack: [],
    reactionWindow: null,
    activeEffects: [],
    eventLog: [
      {
        id: "evt_1",
        type: "GAME_CREATED",
        message: "Created local development game state."
      }
    ],
    pendingChoice: null,
    turn: {
      mode: "simultaneous",
      simultaneousRoundLimit: 4,
      completedPlayerIds: [],
      observingPlayerId: null
    }
  };
}
