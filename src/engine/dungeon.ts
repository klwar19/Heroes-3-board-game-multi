/**
 * The Dungeon (anime-mod plan §6.7.3 + the door-choice/dialogue enrichment) —
 * pure helpers. Wiring: adventure.ts carves the site (placeDungeonSite via the
 * Creature-Bank placement seam) and builds the per-floor visit menu
 * (handleDungeonGateVisit); adventure-reducer.ts opens the floor fight
 * (dungeon encounter hook) and advances the floor at finalize.
 * NOTHING here imports adventure.ts (no cycles).
 */

import type { GameState, PlayerId, VisitStep } from "./state";

/** Floors run 1..10; floors 5 and 10 hold the layered floor bosses. */
export const DUNGEON_FLOOR_CAP = 10;
export const DUNGEON_BOSS_FLOORS: Record<number, string> = {
  5: "minotaur_of_the_depths",
  10: "floor_wyrm"
};
/** A floor party draws at min(floor + 1, 7) — real difficulty (the grind site). */
export function dungeonFloorDifficulty(floor: number): number {
  return Math.max(1, Math.min(7, floor + 1));
}

/** Whether the Dungeon module is ON for this game (presence = frozen ON). */
export function dungeonEnabled(state: GameState): boolean {
  return Boolean(state.adventure?.dungeonSite);
}

/** This player's current floor (1..10; the cap floor stays repeatable). */
export function dungeonFloorOf(state: GameState, playerId: PlayerId): number {
  const floor = state.players[playerId]?.dungeonFloor ?? 1;
  return Math.max(1, Math.min(DUNGEON_FLOOR_CAP, Math.round(floor)));
}

/**
 * The floor-clear reward ladder (§6.7.3: gold → valuables → minor→major
 * artifact draws; floor 5 = major; floor 10 = relic + the Conqueror title).
 * Artifact searches prefer the split tier deck and fall back to the legacy
 * single deck. A REPEAT clear of the conquered floor 10 pays the fallback
 * (one Treasure die + 3 gold), never a second relic.
 */
export function dungeonFloorRewardSteps(
  state: GameState,
  floor: number,
  options?: { repeat?: boolean }
): VisitStep[] {
  const artifactDeck = (tier: "minor" | "major" | "relic") =>
    state.decks[`artifacts-${tier}`] ? (`artifacts-${tier}` as const) : ("artifacts" as const);
  if (options?.repeat) {
    return [{ type: "ROLL_TREASURE_DICE", count: 1 }, { type: "GAIN_RESOURCES", gold: 3 }];
  }
  switch (floor) {
    case 1:
      return [{ type: "GAIN_RESOURCES", gold: 2 }];
    case 2:
      return [{ type: "GAIN_RESOURCES", valuables: 2 }];
    case 3:
      return [{ type: "SEARCH_SHARED_DECK", deckId: artifactDeck("minor"), count: 1 }];
    case 4:
      return [{ type: "GAIN_RESOURCES", gold: 2, valuables: 1 }, { type: "ROLL_TREASURE_DICE", count: 1 }];
    case 5:
      return [{ type: "SEARCH_SHARED_DECK", deckId: artifactDeck("major"), count: 1 }];
    case 6:
      return [{ type: "GAIN_RESOURCES", gold: 3 }];
    case 7:
      return [{ type: "SEARCH_SHARED_DECK", deckId: artifactDeck("minor"), count: 1 }, { type: "GAIN_RESOURCES", gold: 1 }];
    case 8:
      return [{ type: "GAIN_RESOURCES", valuables: 3 }, { type: "ROLL_TREASURE_DICE", count: 1 }];
    case 9:
      return [{ type: "GAIN_RESOURCES", gold: 3 }, { type: "ROLL_TREASURE_DICE", count: 1 }];
    case 10:
      return [{ type: "SEARCH_SHARED_DECK", deckId: artifactDeck("relic"), count: 1 }];
    default:
      return [{ type: "GAIN_RESOURCES", gold: 2 }];
  }
}

/** One selectable room behind a dungeon door (resolved BEFORE the floor den). */
export type DungeonRoom = {
  key: "vault" | "shrine" | "whispers" | "camp";
  label: string;
  steps: VisitStep[];
};

/**
 * The four room archetypes (§ user spec: "battles or events or rewards or even
 * dialogue"). Every step is an existing auto/menu VisitStep, so AI seats and
 * AFK defaults resolve them; the whispering wall fires a real story scene.
 */
export function dungeonRoomPool(floor: number): DungeonRoom[] {
  const vaultGold = 1 + Math.ceil(floor / 4);
  return [
    {
      key: "vault",
      label: `Treasure vault (+${vaultGold} gold)`,
      steps: [{ type: "GAIN_RESOURCES", gold: vaultGold }]
    },
    {
      key: "shrine",
      label: "Forgotten shrine (pay 2 gold: +1 morale)",
      steps: [
        {
          type: "PAY_TO",
          prompt: "The shrine hums with old power — pay 2 gold for its blessing?",
          costOptions: [{ gold: 2 }],
          steps: [{ type: "GAIN_MORALE", amount: 1 }]
        }
      ]
    },
    {
      key: "whispers",
      label: "Whispering wall (a story; +1 hero experience)",
      steps: [
        { type: "PLAY_STORY_SCENE", sceneId: floor % 2 === 0 ? "dungeon_whispers_deep" : "dungeon_whispers_first" },
        { type: "GAIN_EXPERIENCE", amount: 1 }
      ]
    },
    {
      key: "camp",
      label: "Abandoned camp (+1 movement)",
      steps: [{ type: "GAIN_MOVEMENT", amount: 1 }]
    }
  ];
}

/**
 * The two rooms behind this floor's doors — seeded by (seed, player, floor),
 * so the layout is FIXED until the floor is cleared (abandoning and re-entering
 * shows the same doors; the next floor rolls fresh ones).
 */
export function dungeonDoorsForFloor(
  rng: { nextInt: (min: number, max: number) => number },
  floor: number
): [DungeonRoom, DungeonRoom] {
  const pool = dungeonRoomPool(floor);
  const first = rng.nextInt(0, pool.length - 1);
  let second = rng.nextInt(0, pool.length - 2);
  if (second >= first) {
    second += 1;
  }
  return [pool[first], pool[second]];
}
