import type { GameState } from "./state";
import { sampleCombatUnits } from "@/data/units/sample";

export function createInitialGameState(seed = "homm3bg-dev-seed"): GameState {
  const units = JSON.parse(JSON.stringify(sampleCombatUnits)) as typeof sampleCombatUnits;

  return {
    id: "local-dev-game",
    seed,
    round: 1,
    phase: "combat",
    activePlayerId: "p1",
    priorityPlayerId: null,
    turnOrder: ["p1", "p2"],
    players: {
      p1: {
        id: "p1",
        name: "Rampart Alliance",
        hand: ["spell.magic_arrow"],
        discard: [],
        resources: {
          gold: 10,
          buildingMaterials: 5,
          valuables: 1
        },
        limits: {
          hand: 4,
          expertUses: 1
        },
        combatStats: {
          spellsCastThisRound: 0
        }
      },
      p2: {
        id: "p2",
        name: "Inferno Warband",
        hand: ["ability.resistance"],
        discard: [],
        resources: {
          gold: 10,
          buildingMaterials: 5,
          valuables: 1
        },
        limits: {
          hand: 4,
          expertUses: 1
        },
        combatStats: {
          spellsCastThisRound: 0
        }
      }
    },
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
        level: 1,
        movementPoints: 3,
        spaceId: "field_center"
      },
      hero_p2: {
        id: "hero_p2",
        controllerId: "p2",
        level: 1,
        movementPoints: 3,
        spaceId: "field_center"
      }
    },
    combat: {
      id: "combat_1",
      round: 1,
      attackerPlayerId: "p1",
      defenderPlayerId: "p2",
      activeUnitId: "unit_p1_griffins",
      attackDie: [0, 1, -1, 0, 1, 0, -1, 1],
      attackDieIndex: 0,
      units
    },
    decks: {},
    stack: [],
    reactionWindow: null,
    eventLog: [
      {
        id: "evt_1",
        type: "GAME_CREATED",
        message: "Created local development game state."
      }
    ],
    pendingChoice: null
  };
}
