/**
 * The Dungeon (anime-mod plan §6.7.3 + the door-choice/dialogue enrichment) —
 * pure helpers. Wiring: adventure.ts carves the site (placeDungeonSite via the
 * Creature-Bank placement seam) and builds the per-floor visit menu
 * (handleDungeonGateVisit); adventure-reducer.ts opens the floor fight
 * (dungeon encounter hook) and advances the floor at finalize.
 * NOTHING here imports adventure.ts (no cycles).
 */

import { createSeededRandom } from "./random";
import type {
  DungeonDepth,
  DungeonDescentCost,
  GameState,
  PlayerId,
  ResolvedPveEncounterTheme,
  VisitStep
} from "./state";

/** Floors run 1..10; floors 5 and 10 hold the layered floor bosses. */
export const DUNGEON_FLOOR_CAP = 10;
export const DUNGEON_BOSS_FLOORS: Record<number, string> = {
  5: "minotaur_of_the_depths",
  10: "floor_wyrm"
};
export const DOOM_DUNGEON_BOSS_FLOORS: Record<number, string> = {
  5: "doom_baron_warden",
  10: "doom_cyberdemon_tyrant"
};

export function dungeonThemeOf(state: GameState): ResolvedPveEncounterTheme {
  return state.adventure?.pveTheme ?? "classic";
}

/**
 * Warden variety (variant expansion §C1): which wardens each theme's boss
 * floors can field. The FIRST entry of every pool is the historically shipped
 * warden, so nothing that already existed can become unreachable.
 *
 * CAP: every id here also has to obey the wave coupling (§0) — the Calamity
 * Wave mini-boss pool draws from the same catalog.
 */
export const DUNGEON_WARDEN_POOLS: Record<
  ResolvedPveEncounterTheme,
  Record<5 | 10, readonly string[]>
> = {
  classic: {
    5: ["minotaur_of_the_depths", "warden_gorgon_matron", "warden_stone_choir"],
    10: ["floor_wyrm", "warden_bone_colossus"]
  },
  doom: {
    5: ["doom_baron_warden", "doom_hell_knight_warden"],
    10: ["doom_cyberdemon_tyrant", "doom_archvile_warden"]
  }
};

/**
 * Which warden THIS GAME's floor N fields. Seeded once per (game seed, theme,
 * floor) with the same `{ salt: false }` construction `dungeonDoorsForFloor`'s
 * caller uses, so it is identical for every player and every reload and cannot
 * be rerolled by leaving and re-entering. Variety is across GAMES, never across
 * attempts (§C3) — the fight has to stay learnable.
 */
export function dungeonWardenIdFor(
  seed: string,
  theme: ResolvedPveEncounterTheme,
  floor: 5 | 10
): string {
  const pool = DUNGEON_WARDEN_POOLS[theme][floor];
  const random = createSeededRandom(`${seed}#dungeon-warden-${theme}-${floor}`, { salt: false });
  return pool[random.nextInt(0, pool.length - 1)] ?? pool[0];
}

export function dungeonBossId(state: GameState, floor: number): string | undefined {
  const designed = state.adventure?.dungeonSite?.floorBosses?.[floor as 5 | 10];
  if (designed) {
    return designed;
  }
  const theme = dungeonThemeOf(state);
  // The two tables still decide WHICH floors carry a warden at all (and name
  // the historical default); the seeded pool decides which warden it is.
  const shipped = (theme === "doom" ? DOOM_DUNGEON_BOSS_FLOORS : DUNGEON_BOSS_FLOORS)[floor];
  if (!shipped) {
    return undefined;
  }
  return dungeonWardenIdFor(state.seed, theme, floor as 5 | 10);
}

/** Frozen campaign length; older snapshots and unconfigured games remain ten floors. */
export function dungeonFloorCapOf(state: GameState): DungeonDepth {
  return state.adventure?.dungeonSite?.maxFloor === 5 ? 5 : DUNGEON_FLOOR_CAP;
}

/** Frozen cost for chaining another floor immediately after a victory. */
export function dungeonDescentCostOf(state: GameState): DungeonDescentCost {
  const cost = state.adventure?.dungeonSite?.descentCost;
  return cost === 0 || cost === 2 ? cost : 1;
}
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
  return Math.max(1, Math.min(dungeonFloorCapOf(state), Math.round(floor)));
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
export function dungeonRoomPool(
  floor: number,
  theme: ResolvedPveEncounterTheme = "classic"
): DungeonRoom[] {
  const vaultGold = 1 + Math.ceil(floor / 4);
  const common: DungeonRoom[] = [
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
  if (theme !== "doom") {
    return [
      ...common,
      {
        key: "vault",
        label: "Cursed reliquary (+2 valuables, -1 morale)",
        steps: [
          { type: "GAIN_RESOURCES", valuables: 2 },
          { type: "GAIN_MORALE", amount: -1 }
        ]
      }
    ];
  }
  return [
    {
      key: "vault",
      label: `UAC supply cache (+${vaultGold + 1} gold)`,
      steps: [{ type: "GAIN_RESOURCES", gold: vaultGold + 1 }]
    },
    {
      key: "shrine",
      label: "Berserker altar (+2 hero experience, -1 morale)",
      steps: [
        { type: "GAIN_EXPERIENCE", amount: 2 },
        { type: "GAIN_MORALE", amount: -1 }
      ]
    },
    {
      key: "whispers",
      label: "Soul sphere (a warning; +1 hero experience)",
      steps: [
        { type: "PLAY_STORY_SCENE", sceneId: "dungeon_whispers_deep" },
        { type: "GAIN_EXPERIENCE", amount: 1 }
      ]
    },
    {
      key: "camp",
      label: "Short-range teleporter (+1 movement)",
      steps: [{ type: "GAIN_MOVEMENT", amount: 1 }]
    },
    {
      key: "vault",
      label: "Trapped armor cache (Treasure die, -1 morale)",
      steps: [
        { type: "ROLL_TREASURE_DICE", count: 1 },
        { type: "GAIN_MORALE", amount: -1 }
      ]
    }
  ];
}

/**
 * The two rooms behind this floor's doors. The caller seeds them by
 * (game seed, resolved theme, floor), so every player sees the same fixed
 * layout; abandoning and re-entering cannot reroll it.
 */
export function dungeonDoorsForFloor(
  rng: { nextInt: (min: number, max: number) => number },
  floor: number,
  theme: ResolvedPveEncounterTheme = "classic"
): [DungeonRoom, DungeonRoom] {
  const pool = dungeonRoomPool(floor, theme);
  const first = rng.nextInt(0, pool.length - 1);
  let second = rng.nextInt(0, pool.length - 2);
  if (second >= first) {
    second += 1;
  }
  return [pool[first], pool[second]];
}
