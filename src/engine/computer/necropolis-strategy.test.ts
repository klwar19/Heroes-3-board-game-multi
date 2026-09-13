import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { createAdventureGameState } from "../adventure-setup";
import { applyAction } from "../reducer";
import { getLegalActions } from "../legal-actions";
import { getPlayerView } from "../player-view";
import { startNeutralEncounter } from "../adventure-reducer";
import { driveComputerPlayers } from "../../server/computer-runner";
import { pickHumanAction } from "../../server/single-player-soak-helpers";
import { scoreMapAction } from "./map-policy";
import { chooseComputerAction } from "./policy";
import { getComputerMemory, noteComputerAction } from "./memory";
import type { GameState, GameAction } from "../state";

function game(
  seed: string,
  difficulty: "normal" | "hard" | "impossible" = "normal",
) {
  return createAdventureGameState({
    seed,
    difficulty,
    events: false,
    rollFirstPlayer: false,
    sessionMode: "single-player",
    controllers: {
      p1: { kind: "human" },
      p2: { kind: "computer", difficulty: "standard", policyVersion: 1 },
    },
    players: [
      { id: "p1", name: "Human", factionId: "castle", heroDefId: "catherine" },
      {
        id: "p2",
        name: "Necromancer",
        factionId: "necropolis",
        heroDefId: "vidomina",
      },
    ],
  });
}
function runGame(
  initial: GameState,
  label: string,
  stop?: (s: GameState) => boolean,
  maxRound = 18,
) {
  label = process.env.NECRO_MUTATION
    ? `${label}-mutation-${process.env.NECRO_MUTATION}`
    : label;
  let state = initial;
  const trail: unknown[] = [];
  const battles: unknown[] = [];
  const seen = new Set<string>();
  const rounds: unknown[] = [];
  let lastRound = 0;
  let twoFarRound: number | null = null;
  let vampirePackRound: number | null = null;
  let goldRound: number | null = null;
  for (let i = 0; i < 3000 && state.round <= maxRound; i++) {
    if (stop?.(state) || (state.phase === "game-over" && !state.combat)) break;
    if (state.round !== lastRound) {
      lastRound = state.round;
      rounds.push({
        round: state.round,
        army: structuredClone(state.players.p2.army),
        resources: { ...state.players.p2.resources },
        hand: [...state.players.p2.hand],
      });
    }
    const before = state;
    const result = driveComputerPlayers(state, undefined, { maxSteps: 1 });
    state = result.state;
    for (const d of result.decisions)
      trail.push({
        round: before.round,
        combat: before.combat?.id,
        combatRound: before.combat?.round,
        action: d.action,
        policy: d.policy,
        hand: before.players.p2.hand,
        visit: before.adventure?.pendingVisit?.steps[0],
        resources: before.players.p2.resources,
        ...(d.action.type === "CONTINUE_NEUTRAL_COMBAT" ||
        d.action.type === "RETREAT_FROM_COMBAT"
          ? { units: before.combat?.units }
          : {}),
      });
    if (state.combat?.outcome && !seen.has(state.combat.id)) {
      seen.add(state.combat.id);
      battles.push({
        round: state.round,
        context: state.combat.context,
        outcome: state.combat.outcome,
        units: state.combat.units,
      });
    }
    if (!result.decisions.length) {
      const action = pickHumanAction(state);
      if (!action) {
        writeFileSync(`artifacts/${label}-stalled.json`, JSON.stringify(state));
        throw Error(
          `stalled ${state.phase} R${state.round} ${JSON.stringify(result).slice(0, 200)}`,
        );
      }
      const applied = applyAction(state, action);
      expect(applied.errors).toEqual([]);
      state = applied.state;
    }
    const army = state.players.p2.army;
    if (
      vampirePackRound === null &&
      army.some(
        (u) => u.unitDefId === "necropolis.vampires" && u.side === "pack",
      )
    )
      vampirePackRound = state.round;
    if (
      goldRound === null &&
      army.some((u) =>
        ["necropolis.ghost_dragons", "necropolis.dread_knights"].includes(
          u.unitDefId,
        ),
      )
    )
      goldRound = state.round;
    if (
      twoFarRound === null &&
      new Set(
        Object.values(state.adventure!.fields)
          .filter(
            (f) =>
              f.flagOwnerId === "p2" &&
              f.tileInstanceId &&
              state.adventure!.tiles[f.tileInstanceId]?.group === "far" &&
              ["mine", "settlement"].includes(f.location),
          )
          .map((f) => f.tileInstanceId),
      ).size >= 2
    )
      twoFarRound = state.round;
  }
  const far = Object.values(state.adventure!.fields).filter(
    (f) =>
      f.flagOwnerId === "p2" &&
      f.tileInstanceId &&
      state.adventure!.tiles[f.tileInstanceId]?.group === "far" &&
      ["mine", "settlement"].includes(f.location),
  );
  const summary = {
    round: state.round,
    twoFarRound,
    vampirePackRound,
    goldRound,
    phase: state.phase,
    far: far.map((f) => ({
      id: f.spaceId,
      location: f.location,
      resource: f.resource,
    })),
    army: state.players.p2.army,
    battles: battles.length,
    actions: trail.length,
  };
  writeFileSync(
    `artifacts/${label}.json`,
    JSON.stringify({ summary, rounds, battles, trail }, null, 2),
  );
  writeFileSync(`artifacts/${label}-state.json`, JSON.stringify(state));
  console.log(label, JSON.stringify(summary));
  return {
    state,
    trail,
    battles,
    far,
    twoFarRound,
    vampirePackRound,
    goldRound,
  };
}

describe("Necropolis actual games", () => {
  const cases = (["normal", "hard", "impossible"] as const).flatMap(
    (difficulty) =>
      (process.env.NECRO_ALL_SEEDS && difficulty !== "normal"
        ? ["", "-2", "-3"]
        : [process.env.NECRO_SEED_SUFFIX ?? ""]
      ).map((suffix) => ({ difficulty, suffix })),
  );
  it.each(cases)(
    "$difficulty opening through Far economy $suffix",
    ({ difficulty, suffix }) => {
      const result = runGame(
        game(`necro-strategy-${difficulty}${suffix}`, difficulty),
        `necro-game-${difficulty}${suffix}`,
      );
      expect(
        new Set(result.far.map((f) => f.tileInstanceId)).size,
      ).toBeGreaterThanOrEqual(2);
      const firstIII = result.battles.find(
        (b: any) => b.context.difficulty === 3,
      ) as any;
      expect(firstIII?.round).toBeLessThanOrEqual(5);
      expect(
        result.state.players.p2.army.some(
          (u) => u.unitDefId === "necropolis.vampires",
        ),
      ).toBe(true);
      const openingTiles = new Set(result.far.map((f) => f.tileInstanceId));
      const furtherReveal = result.trail.some(
        (t: any) =>
          t.round >= result.twoFarRound! &&
          ["PLACE_TILE", "DISCOVER_TILE"].includes(t.action.type),
      );
      const furtherConquest = result.battles.some(
        (b: any) =>
          b.round >= result.twoFarRound! &&
          b.outcome.winnerPlayerId === "p2" &&
          !openingTiles.has(
            result.state.adventure!.fields[b.context.fieldId]?.tileInstanceId,
          ),
      );
      // Revealing new land and conquering already revealed land both advance
      // the campaign. Waiting at the opening income fields satisfies neither.
      expect(furtherReveal || furtherConquest).toBe(true);
      expect(result.vampirePackRound).not.toBeNull();
      expect(result.goldRound).not.toBeNull();
      expect(result.vampirePackRound!).toBeLessThanOrEqual(result.goldRound!);
      expect(
        result.state.players.p2.army.some((u) =>
          ["necropolis.ghost_dragons", "necropolis.dread_knights"].includes(
            u.unitDefId,
          ),
        ),
      ).toBe(true);
    },
  );
});

function encounter(seed: string, guards: string[], arrow = false) {
  const state = game(seed, "hard");
  state.round = 4;
  state.activePlayerId = "p2";
  state.adventure!.pendingTileChoice = null;
  state.adventure!.pendingVisit = null;
  state.players.p2.canMulligan = false;
  state.players.p2.needsHandRefresh = false;
  state.players.p2.canOpeningMulligan = false;
  state.players.p2.army.forEach(
    (unit) =>
      (unit.side = unit.unitDefId === "necropolis.zombies" ? "few" : "pack"),
  );
  state.players.p2.hand = arrow ? ["spell.magic_arrow", "stat.power"] : [];
  state.players.p2.resources = { gold: 8, buildingMaterials: 2, valuables: 1 };
  state.computerGuaranteedWins = { p2: 2 };
  state.adventure!.houseRules = {
    ...state.adventure!.houseRules,
    "free-neutral-combat-extend": false,
    "polish-quick-combat": false,
  };
  const hero = Object.values(state.heroes).find(
    (h) => h.controllerId === "p2" && h.kind === "main",
  )!;
  hero.level = 2;
  hero.movementPoints = 3;
  const move = getLegalActions(state, "p2")
    .map((a) => a.action)
    .find((a) => a.type === "MOVE_HERO" && a.heroId === hero.id) as Extract<
    GameAction,
    { type: "MOVE_HERO" }
  >;
  expect(move).toBeDefined();
  const field = state.adventure!.fields[move.to];
  field.location = "settlement";
  field.flagOwnerId = null;
  field.difficulty = 3;
  field.blackCube = false;
  field.customGuardUnits = guards;
  const result = applyAction(state, move);
  expect(result.errors).toEqual([]);
  return result.state;
}
describe("Necropolis hard guard battles", () => {
  it.each([
    ["gorgons", ["neutral.gorgons", "neutral.gorgons"]],
    ["treants", ["neutral.dendroids", "neutral.dendroids"]],
    [
      "elementals",
      [
        "neutral.earth_elementals",
        "neutral.magma_elementals",
        "neutral.storm_elementals",
      ],
    ],
    ["weak-control", ["neutral.sprites", "neutral.sprites"]],
    ["single-gorgon", ["neutral.gorgons"]],
    ["single-treant", ["neutral.dendroids"]],
  ] as const)("%s preserves a usable army", (name, guards) => {
    const result = runGame(
      encounter(`necro-guards-${name}`, [...guards]),
      `necro-guards-${name}`,
      (s) => !s.combat && s.phase !== "combat-setup",
      4,
    );
    expect(result.battles.length).toBe(1);
    const placements = result.trail.filter(
      (t: any) => t.action.type === "PLACE_COMBAT_UNIT",
    ) as any[];
    expect(
      placements.find((t) => t.action.armyUnitId === "army_p2_2")?.action
        .position,
    ).toBeGreaterThanOrEqual(12);
    expect(
      placements.find((t) => t.action.armyUnitId === "army_p2_2")?.action
        .position,
    ).toBeLessThan(16);
    expect(
      placements.find((t) => t.action.armyUnitId === "army_p2_3")?.action
        .position,
    ).toBeGreaterThanOrEqual(16);
    expect(result.state.players.p2.army.some((u) => u.id === "army_p2_3")).toBe(
      true,
    );
    if (!["weak-control", "single-gorgon", "single-treant"].includes(name)) {
      const retreat = result.trail.find(
        (t: any) => t.action.type === "RETREAT_FROM_COMBAT",
      ) as any;
      expect(retreat?.combatRound).toBe(1);
      expect(
        result.trail.some((t: any) =>
          ["ATTACK_UNIT", "MOVE_AND_ATTACK_UNIT"].includes(t.action.type),
        ),
      ).toBe(false);
      expect(
        Object.values(result.state.heroes).find((h) => h.controllerId === "p2")
          ?.movementPoints,
      ).toBe(2);
    } else expect((result.battles[0] as any).outcome.winnerPlayerId).toBe("p2");
  });
});

function decide(state: GameState) {
  const decision = chooseComputerAction({
    playerId: "p2",
    state: getPlayerView(state, "p2"),
    legalActions: getLegalActions(state, "p2"),
    memory: getComputerMemory(state, "p2"),
  });
  expect(decision).not.toBeNull();
  const result = applyAction(state, decision!.action);
  expect(result.errors).toEqual([]);
  return { state: result.state, action: decision!.action };
}
it("opening discard draws Necromancy, preserves Arrow, then earns Wraith Pack from a guaranteed win", () => {
  let state = game("necro-opening-discard", "impossible");
  state.activePlayerId = "p2";
  state.adventure!.pendingTileChoice = null;
  state.adventure!.pendingVisit = null;
  state.players.p2.hand = [
    "spell.magic_arrow",
    "stat.knowledge",
    "stat.power",
    "stat.attack",
  ];
  state.players.p2.deck = [
    "stat.attack",
    "ability.necromancy",
    "stat.defense",
    "stat.knowledge",
  ];
  state.players.p2.discard = [];
  state.players.p2.canMulligan = true;
  state.players.p2.needsHandRefresh = false;
  // Use the real refresh handler to open the previously disabled AI mulligan.
  let applied = applyAction(state, {
    type: "REFRESH_HAND",
    playerId: "p2",
    discardCardIds: [],
  });
  expect(applied.errors).toEqual([]);
  state = applied.state;
  const pick = decide(state);
  expect(pick.action.type).toBe("OPENING_HAND_MULLIGAN");
  state = pick.state;
  expect(state.players.p2.hand).toContain("ability.necromancy");
  expect(state.players.p2.hand).toContain("spell.magic_arrow");
  expect((pick.action as any).discardCardIds).not.toContain(
    "spell.magic_arrow",
  );
  // CONTROL: no redraw opportunity when the table disables it.
  const control = game("necro-opening-disabled");
  control.activePlayerId = "p2";
  control.adventure!.pendingTileChoice = null;
  control.adventure!.startingHandMulligan = false;
  control.players.p2.canMulligan = true;
  applied = applyAction(control, {
    type: "REFRESH_HAND",
    playerId: "p2",
    discardCardIds: [],
  });
  expect(applied.errors).toEqual([]);
  expect(
    getLegalActions(applied.state, "p2").some(
      (a) => a.action.type === "OPENING_HAND_MULLIGAN",
    ),
  ).toBe(false);
  state.players.p2.army[0].side = "pack";
  state.players.p2.resources.gold = 10;
  const hero = Object.values(state.heroes).find(
    (h) => h.controllerId === "p2" && h.kind === "main",
  )!;
  const field = Object.values(state.adventure!.fields).find(
    (f) => f.location !== "town",
  )!;
  field.location = "mine";
  field.resource = "gold";
  field.difficulty = 1;
  field.flagOwnerId = null;
  field.blackCube = false;
  hero.spaceId = field.spaceId;
  hero.level = 1;
  startNeutralEncounter(state, hero, field);
  const result = runGame(
    state,
    "necro-opening-earned",
    (s) =>
      !s.combat &&
      !s.adventure?.pendingNecromancy &&
      s.players.p2.army.some(
        (u) => u.unitDefId === "necropolis.wraiths" && u.side === "pack",
      ),
    1,
  );
  expect(
    result.state.players.p2.army.find(
      (u) => u.unitDefId === "necropolis.wraiths",
    )?.side,
  ).toBe("pack");
  expect(result.state.players.p2.resources.gold).toBeLessThan(10);
  expect(result.state.computerGuaranteedWins?.p2).toBe(1);
  expect(result.state.players.p2.hand).not.toContain("ability.necromancy");
});

it("saved game opens second Far tile instead of ending forever", () => {
  const state = JSON.parse(
    readFileSync("artifacts/necro-expansion-stall-fixture.json", "utf8"),
  ) as GameState;
  state.activePlayerId = "p2";
  const actions = getLegalActions(state, "p2");
  const scores = actions.map(({ action }) => ({
    action,
    score: scoreMapAction(
      {
        playerId: "p2",
        state: getPlayerView(state, "p2"),
        legalActions: actions,
        memory: getComputerMemory(state, "p2"),
      },
      action,
    ),
    decision: chooseComputerAction({
      playerId: "p2",
      state: getPlayerView(state, "p2"),
      legalActions: [
        { action, label: action.type },
        { action: { type: "END_TURN", playerId: "p2" }, label: "End" },
      ],
      memory: getComputerMemory(state, "p2"),
    }),
  }));
  writeFileSync(
    "artifacts/necro-stalled-actions.json",
    JSON.stringify(scores, null, 2),
  );
  const decision = chooseComputerAction({
    playerId: "p2",
    state: getPlayerView(state, "p2"),
    legalActions: actions,
    memory: getComputerMemory(state, "p2"),
  });
  expect(decision?.action.type).not.toBe("END_TURN");
});

it("optional removal keeps both Necromancy copies and Arrow", () => {
  let state = game("necro-removal");
  state.activePlayerId = "p2";
  state.adventure!.pendingTileChoice = null;
  state.players.p2.hand = [
    "spell.magic_arrow",
    "ability.necromancy",
    "specialty.vidomina.1",
  ];
  const hero = Object.values(state.heroes).find(
    (h) => h.controllerId === "p2",
  )!;
  state.adventure!.pendingVisit = {
    playerId: "p2",
    heroId: hero.id,
    fieldId: hero.spaceId!,
    steps: [
      {
        type: "CHOOSE_ONE",
        prompt: "Remove up to one card",
        options: [
          ...state.players.p2.hand.map((cardId) => ({
            label: cardId,
            steps: [
              {
                type: "REMOVE_CARD_FROM_PILE" as const,
                cardId,
                source: "hand" as const,
              },
            ],
          })),
          { label: "Done", steps: [] },
        ],
      },
    ],
  };
  const result = decide(state);
  expect(result.state.players.p2.hand).toEqual(state.players.p2.hand);
  expect(result.state.adventure?.pendingVisit).toBeNull();
});

it.each([0, 1])(
  "fought wins spend Necromancy on legal tiers with %s crowns",
  (crowns) => {
    const state = encounter("necro-gold-priority", ["neutral.sprites"]);
    // Reopen setup with the purchased premium army, through the real encounter.
    state.combat = null;
    state.phase = "player-turn";
    state.players.p2.army = [
      { id: "gold", unitDefId: "necropolis.ghost_dragons", side: "few" },
      { id: "vampire", unitDefId: "necropolis.vampires", side: "few" },
      { id: "wraith", unitDefId: "necropolis.wraiths", side: "few" },
      { id: "screen", unitDefId: "necropolis.zombies", side: "pack" },
    ];
    state.players.p2.resources = {
      gold: 100,
      buildingMaterials: 10,
      valuables: 10,
    };
    state.players.p2.hand = ["ability.necromancy"];
    state.players.p2.limits.expertUses = crowns;
    state.players.p2.combatStats.expertUsesSpentThisRound = 0;
    const hero = state.heroes.hero_p2;
    startNeutralEncounter(state, hero, state.adventure!.fields[hero.spaceId!]);
    const result = runGame(
      state,
      `necro-gold-earned-${crowns}`,
      (s) => !s.combat && !s.adventure?.pendingNecromancy,
      4,
    );
    expect((result.battles[0] as any).outcome.winnerPlayerId).toBe("p2");
    expect(
      result.state.players.p2.army.find((u) => u.id === "gold")?.side,
    ).toBe(crowns ? "pack" : "few");
    expect(
      result.state.players.p2.army.find((u) => u.id === "vampire")?.side,
    ).toBe(crowns ? "few" : "pack");
    expect(result.state.players.p2.resources.gold).toBeLessThan(100);
  },
);

it("retreat takes a nearby pickup and only retries after preparation", () => {
  const battle = encounter("necro-retreat-route", [
    "neutral.gorgons",
    "neutral.gorgons",
  ]);
  const guardId = (battle.combat!.context as any).fieldId;
  const escaped = runGame(
    battle,
    "necro-retreat-route",
    (s) => !s.combat,
    4,
  ).state;
  const legal = getLegalActions(escaped, "p2");
  const pickupMove = legal
    .map((a) => a.action)
    .find((a) => a.type === "MOVE_HERO" && a.to !== guardId) as Extract<
    GameAction,
    { type: "MOVE_HERO" }
  >;
  expect(pickupMove).toBeDefined();
  const pickup = escaped.adventure!.fields[pickupMove.to];
  pickup.location = "resource_symbol";
  pickup.difficulty = 0;
  pickup.blackCube = false;
  pickup.flagOwnerId = null;
  delete pickup.customGuardUnits;
  const collected = runGame(
    escaped,
    "necro-retreat-pickup",
    (s) => s.adventure!.fields[pickupMove.to].blackCube,
    4,
  );
  expect(collected.state.adventure!.fields[pickupMove.to].blackCube).toBe(true);
  expect(collected.battles).toHaveLength(0);
  const options = (state: GameState) =>
    getLegalActions(state, "p2").filter(
      ({ action }) =>
        action.type === "END_TURN" ||
        (action.type === "MOVE_HERO" && action.to === guardId),
    );
  const choose = (state: GameState) =>
    chooseComputerAction({
      playerId: "p2",
      state: getPlayerView(state, "p2"),
      legalActions: options(state),
      memory: getComputerMemory(state, "p2"),
    });
  // CONTROL: a fresh turn alone does not make the unchanged guard beatable.
  const retry = structuredClone(escaped);
  retry.round++;
  retry.heroes.hero_p2.movementPoints = 3;
  expect(choose(retry)?.action.type).toBe("END_TURN");
  retry.players.p2.army.push(
    {
      id: "prepared-gold",
      unitDefId: "necropolis.ghost_dragons",
      side: "pack",
    },
    { id: "prepared-silver", unitDefId: "necropolis.vampires", side: "pack" },
  );
  retry.players.p2.hand = ["spell.magic_arrow", "ability.necromancy"];
  retry.computerMemory!.p2.stickyObjectiveSpaceId = guardId;
  const prepared = choose(retry)!;
  expect(prepared.action.type).toBe("MOVE_HERO");
  const entered = applyAction(retry, prepared.action);
  expect(entered.errors).toEqual([]);
  const won = runGame(
    entered.state,
    "necro-prepared-retry",
    (s) => !s.combat,
    5,
  );
  expect((won.battles[0] as any).outcome.winnerPlayerId).toBe("p2");
});

it("opening keeps its first Necromancy while discarding for a second paid upgrade", () => {
  let state = game("necro-two-opening-copies", "impossible");
  state.activePlayerId = "p2";
  state.adventure!.pendingTileChoice = null;
  state.adventure!.pendingVisit = null;
  state.players.p2.hand = [
    "spell.magic_arrow",
    "ability.necromancy",
    "stat.knowledge",
    "stat.power",
  ];
  state.players.p2.deck = [
    "stat.defense",
    "stat.attack",
    "specialty.vidomina.1",
    "stat.knowledge",
  ];
  state.players.p2.discard = [];
  state.players.p2.canMulligan = true;
  state.players.p2.needsHandRefresh = false;
  const refreshed = applyAction(state, {
    type: "REFRESH_HAND",
    playerId: "p2",
    discardCardIds: [],
  });
  expect(refreshed.errors).toEqual([]);
  const redrawn = decide(refreshed.state);
  expect(redrawn.action.type).toBe("OPENING_HAND_MULLIGAN");
  state = redrawn.state;
  expect(state.players.p2.hand).toEqual(
    expect.arrayContaining([
      "spell.magic_arrow",
      "ability.necromancy",
      "specialty.vidomina.1",
    ]),
  );
  state.players.p2.army[0].side = "pack";
  state.players.p2.resources.gold = 10;
  const hero = state.heroes.hero_p2;
  const field = Object.values(state.adventure!.fields).find(
    (f) => f.location !== "town",
  )!;
  field.location = "mine";
  field.resource = "gold";
  field.difficulty = 1;
  field.blackCube = false;
  field.flagOwnerId = null;
  hero.spaceId = field.spaceId;
  startNeutralEncounter(state, hero, field);
  const earned = runGame(
    state,
    "necro-two-opening-earned",
    (s) => s.players.p2.army.every((u) => u.side === "pack"),
    1,
  );
  expect(earned.state.players.p2.army.every((u) => u.side === "pack")).toBe(
    true,
  );
  // Payment happens before the defeated mine releases any reward.
  expect(earned.state.adventure?.pendingNecromancy).toBeTruthy();
  expect(earned.state.players.p2.resources.gold).toBe(5);
});

it("Gold development remembers an earned Vampire Pack after casualties", () => {
  let state = game("necro-progression-memory", "hard");
  state.activePlayerId = "p2";
  state.round = 8;
  state.adventure!.pendingTileChoice = null;
  state.adventure!.pendingVisit = null;
  state.players.p2.army.forEach((u) => (u.side = "pack"));
  state.players.p2.army.push({
    id: "vampire",
    unitDefId: "necropolis.vampires",
    side: "pack",
  });
  state.towns.town_p2.buildings.push("necropolis.dwelling_silver");
  state.players.p2.resources = {
    gold: 100,
    buildingMaterials: 20,
    valuables: 10,
  };
  state.players.p2.needsHandRefresh = true;
  const action: GameAction = {
    type: "REFRESH_HAND",
    playerId: "p2",
    discardCardIds: [],
  };
  const refreshed = applyAction(state, action);
  expect(refreshed.errors).toEqual([]);
  state = noteComputerAction(refreshed.state, "p2", action);
  expect(state.computerMemory?.p2.necromancyVampirePackEarned).toBe(true);
  state.players.p2.army.find((u) => u.id === "vampire")!.side = "few";
  const choose = (s: GameState) =>
    chooseComputerAction({
      playerId: "p2",
      state: getPlayerView(s, "p2"),
      memory: getComputerMemory(s, "p2"),
      legalActions: getLegalActions(s, "p2").filter(
        ({ action }) =>
          action.type === "END_TURN" ||
          (action.type === "BUILD_STRUCTURE" &&
            action.buildingId === "necropolis.dwelling_gold"),
      ),
    });
  const control = structuredClone(state);
  delete control.computerMemory!.p2.necromancyVampirePackEarned;
  expect(choose(control)?.action.type).toBe("END_TURN");
  const decision = choose(state)!;
  expect(decision.action.type).toBe("BUILD_STRUCTURE");
  const built = applyAction(state, decision.action);
  expect(built.errors).toEqual([]);
  expect(built.state.towns.town_p2.buildings).toContain(
    "necropolis.dwelling_gold",
  );
});

it.each([false, true])(
  "Wraith purchase follows human neutral control: %s",
  (humanGuards) => {
    const state = game("necro-human-guards", "hard");
    state.activePlayerId = "p2";
    state.adventure!.pendingTileChoice = null;
    state.adventure!.pendingVisit = null;
    state.adventure!.pvpNeutralControl = humanGuards;
    state.players.p2.needsHandRefresh = false;
    state.players.p2.canMulligan = false;
    state.players.p2.canOpeningMulligan = false;
    state.players.p2.army[0].side = "pack";
    state.players.p2.resources.gold = 30;
    const actions = getLegalActions(state, "p2").filter(
      ({ action }) =>
        action.type === "END_TURN" ||
        (action.type === "POPULATION_ACTION" &&
          action.purchases.length === 1 &&
          action.purchases[0].kind === "reinforce" &&
          action.purchases[0].unitDefId === "necropolis.wraiths"),
    );
    expect(
      actions.some(({ action }) => action.type === "POPULATION_ACTION"),
    ).toBe(true);
    const decision = chooseComputerAction({
      playerId: "p2",
      state: getPlayerView(state, "p2"),
      legalActions: actions,
      memory: getComputerMemory(state, "p2"),
    })!;
    expect(decision.action.type).toBe(
      humanGuards ? "POPULATION_ACTION" : "END_TURN",
    );
    if (humanGuards) {
      const bought = applyAction(state, decision.action);
      expect(bought.errors).toEqual([]);
      expect(
        bought.state.players.p2.army.find(
          (u) => u.unitDefId === "necropolis.wraiths",
        )?.side,
      ).toBe("pack");
      expect(bought.state.players.p2.resources.gold).toBeLessThan(30);
    }
  },
);
