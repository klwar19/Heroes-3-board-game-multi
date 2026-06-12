import { ATTACK_DIE_FACES } from "./battlefield";
import { shuffleCards } from "./decks";
import { makeCombatUnitFromArmy } from "./adventure";
import type { CombatUnitState, DeckState, GameState, PlayerState } from "./state";

function makeSharedDeck(id: string, cardIds: string[], seed: string): DeckState {
  return {
    id,
    drawPile: shuffleCards(cardIds, `${seed}#deck#${id}`),
    discardPile: []
  };
}

/**
 * Builds one battle-simulator unit from the real unit roster so the sandbox
 * always matches the printed stats, abilities and card art — including the
 * pack-to-few flip when a pack runs out of health.
 */
function simUnit(
  unitId: string,
  controllerId: string,
  unitDefId: string,
  side: "few" | "pack",
  position: number
): CombatUnitState {
  const unit = makeCombatUnitFromArmy(
    { id: `army_${unitId}`, unitDefId, side },
    controllerId,
    unitId,
    position
  );

  if (!unit) {
    throw new Error(`Unknown sandbox unit definition ${unitDefId} (${side}).`);
  }

  return unit;
}

type SimPlayerConfig = {
  id: string;
  name: string;
  factionId: PlayerState["factionId"];
  heroDefId: string;
  hand: string[];
  deck: string[];
};

/** Both seats play a level 5 hero: hand limit 6, two expert-effect crowns. */
const SIM_HERO_LEVEL = 5;
const SIM_HAND_LIMIT = 6;
const SIM_EXPERT_USES = 2;

function makeSimPlayer(config: SimPlayerConfig): PlayerState {
  return {
    id: config.id,
    name: config.name,
    factionId: config.factionId,
    heroDefId: config.heroDefId,
    // Personal draw pile (top = last element). Draw effects pull from here
    // and reshuffle the discard when it runs dry.
    deck: config.deck,
    hand: config.hand,
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
      hand: SIM_HAND_LIMIT,
      expertUses: SIM_EXPERT_USES
    },
    combatStats: {
      spellsCastThisRound: 0,
      spellLimitBonusThisRound: 0,
      expertUsesSpentThisRound: 0
    }
  };
}

/**
 * The combat sandbox is a level 5 hero battle simulator: Catherine (Castle)
 * against Sandro (Necropolis), each with a 6-card hand holding their
 * specialty, statistics, an artifact, a spell and an ability, fighting over
 * a board with two obstacle tokens on the middle row.
 */
export function createInitialGameState(seed = "homm3bg-dev-seed"): GameState {
  const units: Record<string, CombatUnitState> = Object.fromEntries(
    [
      // Catherine's Castle army (attacker, rows 1-2).
      simUnit("unit_p1_marksmen", "p1", "castle.marksmen", "pack", 1),
      simUnit("unit_p1_griffins", "p1", "castle.griffins", "pack", 5),
      simUnit("unit_p1_crusaders", "p1", "castle.crusaders", "pack", 6),
      // Sandro's Necropolis army (defender, rows 4-5).
      simUnit("unit_p2_skeletons", "p2", "necropolis.skeletons", "pack", 13),
      simUnit("unit_p2_vampires", "p2", "necropolis.vampires", "pack", 14),
      simUnit("unit_p2_dread_knights", "p2", "necropolis.dread_knights", "few", 18)
    ].map((unit) => [unit.id, unit])
  );

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
      p1: makeSimPlayer({
        id: "p1",
        name: "Catherine (Castle)",
        factionId: "castle",
        heroDefId: "catherine",
        hand: [
          "specialty.catherine.1",
          "stat.attack",
          "spell.magic_arrow",
          "spell.bloodlust",
          "artifact.centaurs_axe",
          "ability.offense"
        ],
        deck: [
          "war_machine.first_aid_tent",
          "artifact.breastplate_of_petrified_wood",
          "ability.archery",
          "ability.luck",
          "spell.fortune",
          "stat.defense",
          "stat.power",
          "stat.attack"
        ]
      }),
      p2: makeSimPlayer({
        id: "p2",
        name: "Sandro (Necropolis)",
        factionId: "necropolis",
        heroDefId: "sandro",
        hand: [
          "specialty.sandro.1",
          "stat.power",
          "stat.knowledge",
          "spell.magic_arrow",
          "artifact.buckler_of_the_gnoll_king",
          "ability.resistance"
        ],
        deck: [
          "artifact.ogres_club_of_havoc",
          "artifact.titans_gladius",
          "spell.stone_skin",
          "spell.cure",
          "spell.lightning_bolt",
          "stat.attack",
          "stat.defense"
        ]
      })
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
        heroDefId: "catherine",
        level: SIM_HERO_LEVEL,
        experience: 0,
        movementPoints: 3,
        movementPointsMax: 3,
        spaceId: "field_center"
      },
      hero_p2: {
        id: "hero_p2",
        controllerId: "p2",
        kind: "main",
        heroDefId: "sandro",
        level: SIM_HERO_LEVEL,
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
      units,
      // Two obstacle tokens on the middle row: combat obstacles that block
      // ground and ranged movement; flying units pass over them.
      obstacles: [8, 11]
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
        message: "Level 5 battle simulator: Catherine (Castle) vs Sandro (Necropolis)."
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
