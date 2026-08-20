/**
 * The Dungeon (anime-mod plan §6.7.3 + the door-choice/dialogue enrichment) —
 * pure helpers. Wiring: adventure.ts carves the site (placeDungeonSite via the
 * Creature-Bank placement seam) and builds the per-floor visit menu
 * (handleDungeonGateVisit); adventure-reducer.ts opens the floor fight
 * (dungeon encounter hook) and advances the floor at finalize.
 * NOTHING here imports adventure.ts (no cycles).
 */

import { coreUnitDefinitions } from "@/data/factions/units";
import { commandersModuleEnabled } from "./commanders";
import { createSeededRandom } from "./random";
import { unitExperienceActive } from "./unit-experience";
import type {
  DungeonDepth,
  DungeonDescentCost,
  GameState,
  PlayerId,
  ResolvedPveEncounterTheme,
  StackTokenStat,
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

// ---------------------------------------------------------------------------
// Variant expansion §F1 — the per-game "treasure theme"
// ---------------------------------------------------------------------------

export type DungeonTreasureTheme = "hoard" | "arsenal" | "lore";

/** Stable order; the seeded pick indexes THIS array (never reordered lightly). */
export const DUNGEON_TREASURE_THEMES: readonly DungeonTreasureTheme[] = ["hoard", "arsenal", "lore"];

/**
 * Which flavour of loot THIS GAME's Dungeon pays (§F1). Seeded ONCE from the
 * game seed with the same `{ salt: false }` construction `dungeonWardenIdFor`
 * uses, so it is identical for every player, every client and every reload, and
 * leaving/re-entering the site cannot reroll it.
 *
 * The theme only ever swaps NON-artifact rungs WITHIN THE SAME VALUE CLASS:
 * floors 3/5/7/10 (the Artifact rungs) and the repeat-clear fallback are
 * byte-identical in all three themes. That is the anti-inflation guarantee, and
 * `dungeon.test.ts` asserts it directly.
 */
export function dungeonTreasureThemeOf(state: GameState): DungeonTreasureTheme {
  const random = createSeededRandom(`${state.seed}#dungeon-treasure-theme`, { salt: false });
  return DUNGEON_TREASURE_THEMES[random.nextInt(0, DUNGEON_TREASURE_THEMES.length - 1)] ?? "hoard";
}

/**
 * One short player-facing name per treasure theme, so the floor prompt can say
 * WHICH flavour of loot this game's Dungeon pays. Presentation only — the
 * ladder itself is `dungeonThemedRewardSteps`.
 */
export const DUNGEON_TREASURE_THEME_LABELS: Record<DungeonTreasureTheme, string> = {
  hoard: "Hoard (gold and valuables)",
  arsenal: "Arsenal (unit training and Stack Tokens)",
  lore: "Lore (hero experience and commander points)"
};

const ARTIFACT_DECK_LABELS: Record<string, string> = {
  "artifacts-minor": "Minor Artifacts",
  "artifacts-major": "Major Artifacts",
  "artifacts-relic": "Relic Artifacts",
  artifacts: "Artifacts",
  spells: "Spells",
  abilities: "Abilities"
};

function resourceWords(step: { gold?: number; buildingMaterials?: number; valuables?: number }): string {
  const parts: string[] = [];
  if (step.gold) {
    parts.push(`${step.gold} gold`);
  }
  if (step.buildingMaterials) {
    parts.push(`${step.buildingMaterials} building material${step.buildingMaterials === 1 ? "" : "s"}`);
  }
  if (step.valuables) {
    parts.push(`${step.valuables} valuable${step.valuables === 1 ? "" : "s"}`);
  }
  return parts.join(" + ");
}

/**
 * PURE describer for the reward VisitSteps this file builds — the Dungeon floor
 * prompt states what a clear pays BEFORE the player commits. It covers exactly
 * the step kinds the dungeon ladder / rooms use and returns null for anything
 * else, so a future step kind is silently omitted rather than mislabelled.
 *
 * A `CHOOSE_ONE` (the Unit-XP teaching / the Stack-Token grant) is described by
 * its FIRST option's steps: those menus are one arm per army card plus a
 * decline, so the first arm IS the payout.
 */
function describeVisitStep(step: VisitStep): string | null {
  switch (step.type) {
    case "GAIN_RESOURCES": {
      const words = resourceWords(step);
      return words.length > 0 ? words : null;
    }
    case "GAIN_EXPERIENCE":
      return `+${step.amount} hero experience`;
    case "GAIN_UNIT_XP":
      return `+${step.amount} unit XP to one army card`;
    case "GRANT_STACK_TOKEN":
      return "a Stack Token for one army card";
    case "GAIN_COMMANDER_POINTS":
      return `+${step.amount} commander stat point${step.amount === 1 ? "" : "s"}`;
    case "ROLL_TREASURE_DICE":
      return `${step.count} Treasure ${step.count === 1 ? "die" : "dice"}`;
    case "GAIN_MORALE":
      return step.amount >= 0 ? `+${step.amount} morale` : `${step.amount} morale`;
    case "GAIN_MOVEMENT":
      return `+${step.amount} movement`;
    case "SEARCH_SHARED_DECK":
      return `Search the ${ARTIFACT_DECK_LABELS[step.deckId] ?? step.deckId} deck`;
    case "CHOOSE_ONE":
      return describeVisitSteps(step.options[0]?.steps ?? []) || null;
    default:
      return null;
  }
}

/** Every describable step of a reward, joined — "" when nothing is describable. */
export function describeVisitSteps(steps: readonly VisitStep[]): string {
  return steps
    .map((step) => describeVisitStep(step))
    .filter((line): line is string => Boolean(line))
    .join(" + ");
}

const STACK_TOKEN_STAT_LABELS: Record<StackTokenStat, string> = {
  attack: "+1 Attack",
  defense: "+1 Defense",
  health: "+1 Health",
  initiative: "+2 Initiative"
};

function unitLabel(unitDefId: string): string {
  return coreUnitDefinitions[unitDefId]?.name ?? unitDefId;
}

/**
 * A `GAIN_UNIT_XP` payout as the CHOOSE_ONE the shipped sites use (Kiếm Trủng /
 * Thí Luyện Tháp / the Emerald Tower): the step itself names ONE army card, so
 * the pick has to be enumerated. Null — never a dead prompt — when the Unit
 * Experience rule is off or the army is empty; every caller then falls back to
 * the module-free rung. The Decline arm keeps AI/AFK seats safe.
 */
function dungeonUnitXpStep(
  state: GameState,
  playerId: PlayerId,
  amount: number,
  prompt: string
): VisitStep | null {
  const army = state.players[playerId]?.army ?? [];
  if (!unitExperienceActive(state) || army.length === 0) {
    return null;
  }
  return {
    type: "CHOOSE_ONE",
    prompt,
    options: [
      ...army.map((unit) => ({
        label: `${unitLabel(unit.unitDefId)} (${unit.side}) — +${amount} unit XP`,
        steps: [{ type: "GAIN_UNIT_XP" as const, armyUnitId: unit.id, amount }]
      })),
      { label: "Decline the teaching", steps: [] }
    ]
  };
}

/**
 * A rulebook Stack Token (`ArmyUnitState.stackToken`) onto a token-free army
 * card, shaped exactly like the Adventure Cave's second-win grant.
 *
 * OPEN QUESTION §F4, RESOLVED: `GRANT_STACK_TOKEN` is **not** gated on the
 * Polish `polish-unit-stacks` rule — that rule governs the separate persistent
 * `stackLayers`. This step writes the rulebook Creature-Bank Stack Token, which
 * `makeCombatUnitFromArmy` folds unconditionally (+1 Attack/Defense/Health or
 * +2 Initiative, absorbing one lethal blow). So it is a REAL payout with the
 * Polish rule off. Its only real gate is enumeration: the step names one card,
 * so with no token-free card left there is nothing to grant and this returns
 * null (callers fall back).
 */
function dungeonStackTokenStep(state: GameState, playerId: PlayerId, prompt: string): VisitStep | null {
  const eligible = (state.players[playerId]?.army ?? []).filter((unit) => !unit.stackToken);
  if (eligible.length === 0) {
    return null;
  }
  return {
    type: "CHOOSE_ONE",
    prompt,
    options: [
      ...eligible.map((unit) => ({
        label: `${unitLabel(unit.unitDefId)} (${unit.side})`,
        steps: [
          {
            type: "CHOOSE_ONE" as const,
            prompt: `Which Stack Token stat for ${unitLabel(unit.unitDefId)}?`,
            options: (Object.keys(STACK_TOKEN_STAT_LABELS) as StackTokenStat[]).map((stat) => ({
              label: STACK_TOKEN_STAT_LABELS[stat],
              steps: [{ type: "GRANT_STACK_TOKEN" as const, armyUnitId: unit.id, stat }]
            }))
          }
        ]
      })),
      { label: "Leave the token behind", steps: [] }
    ]
  };
}

/** +N commander stat points, or null with the Commanders module off / no commander. */
function dungeonCommanderPointStep(state: GameState, playerId: PlayerId, amount: number): VisitStep | null {
  if (!commandersModuleEnabled(state) || !state.players[playerId]?.commander) {
    return null;
  }
  return { type: "GAIN_COMMANDER_POINTS", amount };
}

/**
 * §F1 — the themed swap for the six NON-artifact rungs (1, 2, 4, 6, 8, 9).
 * Returns null for every other floor, so floors 3/5/7/10 fall through to the
 * shipped Artifact ladder unchanged in all three themes.
 *
 * EVERY module-gated rung carries its fallback HERE, in the same function: when
 * the module is off (or no `playerId` was passed — legacy call sites) the rung
 * resolves to the SHIPPED default for that floor, so a game without the module
 * can never be handed a dead step and never gains value it did not have before.
 */
function dungeonThemedRewardSteps(
  state: GameState,
  floor: number,
  playerId: PlayerId | undefined
): VisitStep[] | null {
  const theme = dungeonTreasureThemeOf(state);
  const unitXp = (amount: number) =>
    playerId
      ? dungeonUnitXpStep(state, playerId, amount, "The dungeon's spoils teach one army card. Which?")
      : null;
  const stackToken = () =>
    playerId
      ? dungeonStackTokenStep(state, playerId, "The armoury yields a Stack Token. Which card takes it?")
      : null;
  const commanderPoint = (amount: number) =>
    playerId ? dungeonCommanderPointStep(state, playerId, amount) : null;
  const die: VisitStep = { type: "ROLL_TREASURE_DICE", count: 1 };

  switch (floor) {
    case 1:
      if (theme === "lore") return [{ type: "GAIN_EXPERIENCE", amount: 1 }];
      return null; // hoard / arsenal keep the shipped 2 gold
    case 2: {
      if (theme === "hoard") return [{ type: "GAIN_RESOURCES", gold: 3 }];
      if (theme === "arsenal") {
        const teaching = unitXp(2);
        return teaching ? [teaching] : null;
      }
      return null; // lore keeps the shipped 2 valuables
    }
    case 4: {
      if (theme === "hoard") return [{ type: "GAIN_RESOURCES", gold: 3 }, die];
      if (theme === "arsenal") {
        const token = stackToken();
        return token ? [die, token] : null;
      }
      return [{ type: "GAIN_RESOURCES", gold: 2 }, { type: "GAIN_EXPERIENCE", amount: 2 }];
    }
    case 6: {
      if (theme === "hoard") return [{ type: "GAIN_RESOURCES", gold: 4 }];
      if (theme === "arsenal") {
        const teaching = unitXp(2);
        return teaching ? [teaching, { type: "GAIN_RESOURCES", gold: 1 }] : null;
      }
      const point = commanderPoint(1);
      return point ? [point] : null; // lore falls back to the shipped 3 gold
    }
    case 8: {
      if (theme === "hoard") return [{ type: "GAIN_RESOURCES", valuables: 4 }];
      if (theme === "arsenal") {
        const teaching = unitXp(2);
        return teaching ? [die, teaching] : null;
      }
      return [{ type: "GAIN_RESOURCES", valuables: 3 }, { type: "GAIN_EXPERIENCE", amount: 2 }];
    }
    case 9: {
      if (theme === "hoard") return [{ type: "GAIN_RESOURCES", gold: 4 }, die];
      if (theme === "arsenal") {
        const token = stackToken();
        return token ? [die, token] : null;
      }
      const point = commanderPoint(1);
      return point ? [{ type: "GAIN_RESOURCES", gold: 3 }, point] : null;
    }
    default:
      return null;
  }
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
  options?: { repeat?: boolean; playerId?: PlayerId }
): VisitStep[] {
  const artifactDeck = (tier: "minor" | "major" | "relic") =>
    state.decks[`artifacts-${tier}`] ? (`artifacts-${tier}` as const) : ("artifacts" as const);
  if (options?.repeat) {
    // §F3 — the Conqueror's only ongoing differentiation: with Unit Experience
    // ON a repeat clear also teaches one army card. Gold/dice UNCHANGED, and
    // with the rule off (or no playerId) this is byte-identical to before.
    const teaching = options.playerId
      ? dungeonUnitXpStep(state, options.playerId, 2, "Dungeon Conqueror — the grind teaches one card. Which?")
      : null;
    return [
      { type: "ROLL_TREASURE_DICE", count: 1 },
      { type: "GAIN_RESOURCES", gold: 3 },
      ...(teaching ? [teaching] : [])
    ];
  }
  const themed = dungeonThemedRewardSteps(state, floor, options?.playerId);
  if (themed) {
    return themed;
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
  key: "vault" | "shrine" | "whispers" | "camp" | "forge" | "pit";
  label: string;
  steps: VisitStep[];
};

/**
 * Optional visitor context (§F4). The FORGE room mints a rulebook Stack Token,
 * whose VisitStep names ONE army card — so it can only be built when the caller
 * knows whose army it is. The pool LENGTH never depends on this (only the
 * forge's label and steps do), so `dungeonDoorsForFloor`'s seeded indices stay
 * stable whether or not a context is passed.
 */
export type DungeonRoomContext = { state: GameState; playerId: PlayerId };

/**
 * §F4 — the forge room. RESOLVED OPEN QUESTION: `GRANT_STACK_TOKEN` is a real
 * payout with `polish-unit-stacks` OFF (it writes the rulebook
 * `ArmyUnitState.stackToken`, folded unconditionally by
 * `makeCombatUnitFromArmy` — the Polish rule governs the separate persistent
 * `stackLayers`), so the room is NOT gated on that rule. It degrades only when
 * the token cannot be aimed at anything: with no context, or with every army
 * card already Stacked, the smith buys scrap instead and the room pays the
 * plan's refund-equivalent 3 gold. Never a dead room, never a PAY_TO whose
 * payout would silently no-op.
 */
function forgeRoom(label: string, coldLabel: string, context?: DungeonRoomContext): DungeonRoom {
  const token = context
    ? dungeonStackTokenStep(context.state, context.playerId, "The forge is hot. Which card takes the Stack Token?")
    : null;
  if (!token) {
    return { key: "forge", label: coldLabel, steps: [{ type: "GAIN_RESOURCES", gold: 3 }] };
  }
  return {
    key: "forge",
    label,
    steps: [
      {
        type: "PAY_TO",
        prompt: "The forge still burns — pay 3 gold to temper one of your cards?",
        costOptions: [{ gold: 3 }],
        steps: [token]
      }
    ]
  };
}

/**
 * The room archetypes (§ user spec: "battles or events or rewards or even
 * dialogue"; §F4 added the forge and the pit). Every step is an existing
 * auto/menu VisitStep, so AI seats and AFK defaults resolve them; the
 * whispering wall fires a real story scene.
 */
export function dungeonRoomPool(
  floor: number,
  theme: ResolvedPveEncounterTheme = "classic",
  context?: DungeonRoomContext
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
      },
      forgeRoom(
        "Dwarven forge (pay 3 gold: a Stack Token)",
        "Cold dwarven forge (the smith buys your scrap: +3 gold)",
        context
      ),
      {
        key: "pit",
        label: "Spiked pit (a Treasure die; the guard below is angrier)",
        steps: [
          { type: "ROLL_TREASURE_DICE", count: 1 },
          { type: "GAIN_MORALE", amount: -1 }
        ]
      },
      {
        key: "shrine",
        label: "Ancestor stone (+1 hero experience, +1 movement)",
        steps: [
          { type: "GAIN_EXPERIENCE", amount: 1 },
          { type: "GAIN_MOVEMENT", amount: 1 }
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
    },
    forgeRoom(
      "Weapon locker (pay 3 gold: a Stack Token)",
      "Stripped weapon locker (sell the salvage: +3 gold)",
      context
    ),
    {
      key: "pit",
      label: "Slime vat (+3 valuables, -1 morale)",
      steps: [
        { type: "GAIN_RESOURCES", valuables: 3 },
        { type: "GAIN_MORALE", amount: -1 }
      ]
    },
    {
      key: "camp",
      label: "Med station (+2 hero experience)",
      steps: [{ type: "GAIN_EXPERIENCE", amount: 2 }]
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
  theme: ResolvedPveEncounterTheme = "classic",
  context?: DungeonRoomContext
): [DungeonRoom, DungeonRoom] {
  const pool = dungeonRoomPool(floor, theme, context);
  const first = rng.nextInt(0, pool.length - 1);
  let second = rng.nextInt(0, pool.length - 2);
  if (second >= first) {
    second += 1;
  }
  return [pool[first], pool[second]];
}
