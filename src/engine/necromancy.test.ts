import { describe, expect, it } from "vitest";
import {
  applyAction,
  canPlaceTransformOn,
  createAdventureGameState,
  findEvent,
  getLegalActions,
  insertUnitTransform,
  makeCombatUnitFromArmy,
  makeUnitTransformState,
  markUnitRemovedIfNeeded,
  specialtyTransformHealth,
  type CombatUnitState,
  type GameAction,
  type GameState,
  type UnitTransformState
} from "./index";
import { cardLibrary } from "@/data/cards/library";

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toHaveLength(0);
  return result.state;
}

const HORDE = makeTransformEffect("specialty.sandro.1");
const HORDE_ZOMBIES = makeTransformEffect("specialty.sandro.4");
const LEGION = makeTransformEffect("specialty.sandro.6");

function makeTransformEffect(cardId: string) {
  const effect = cardLibrary[cardId]?.effect;
  if (effect?.type !== "TRANSFORM_UNIT") {
    throw new Error(`${cardId} is not a TRANSFORM_UNIT card`);
  }
  return effect;
}

describe("Sandro's Cloak — BINH skeleton HP house rule", () => {
  it("gives the Horde and Legion of Skeletons 3 HP in BINH, printed 2 in legacy; Zombies keep 3", () => {
    expect(specialtyTransformHealth("binh", "specialty.sandro.1", 2)).toBe(3);
    expect(specialtyTransformHealth("binh", "specialty.sandro.6", 2)).toBe(3);
    expect(specialtyTransformHealth("binh", "specialty.sandro.4", 3)).toBe(3);
    expect(specialtyTransformHealth("legacy", "specialty.sandro.1", 2)).toBe(2);
    expect(specialtyTransformHealth("legacy", "specialty.sandro.6", 2)).toBe(2);
  });

  it("the level I card text and the Necromancy card are implemented", () => {
    expect(cardLibrary["specialty.sandro.4"].implementationStatus).toBe("implemented");
    expect(cardLibrary["specialty.sandro.6"].implementationStatus).toBe("implemented");
    expect(cardLibrary["ability.necromancy"].implementationStatus).toBe("implemented");
    expect(cardLibrary["ability.necromancy"].effect.type).toBe("NECROMANCY_REINFORCE");
  });
});

describe("Sandro's Cloak — stacking rules (wiki FAQ)", () => {
  it("level I/IV go on a bare pack; the Legion goes on Few, Pack, or even a Horde and stays on top", () => {
    // Level I needs a Pack of Skeletons.
    expect(canPlaceTransformOn("Skeletons", "few", undefined, HORDE)).toBe(false);
    expect(canPlaceTransformOn("Skeletons", "pack", undefined, HORDE)).toBe(true);
    // Wrong unit name is rejected.
    expect(canPlaceTransformOn("Zombies", "pack", undefined, HORDE)).toBe(false);
    expect(canPlaceTransformOn("Zombies", "pack", undefined, HORDE_ZOMBIES)).toBe(true);

    // Level VI Legion goes on a Few or a Pack.
    expect(canPlaceTransformOn("Skeletons", "few", undefined, LEGION)).toBe(true);
    expect(canPlaceTransformOn("Skeletons", "pack", undefined, LEGION)).toBe(true);

    // "even a Horde": a Legion may be added over an existing Horde.
    const horde = [makeUnitTransformState(HORDE, "specialty.sandro.1", "binh")];
    expect(canPlaceTransformOn("Skeletons", "pack", horde, LEGION)).toBe(true);
    // But not a second Legion.
    const legion = [makeUnitTransformState(LEGION, "specialty.sandro.6", "binh")];
    expect(canPlaceTransformOn("Skeletons", "pack", legion, LEGION)).toBe(false);
    // And the Horde cannot go on while a Horde is already there.
    expect(canPlaceTransformOn("Skeletons", "pack", horde, HORDE)).toBe(false);
  });

  it("keeps the alwaysOnTop Legion above a later Horde", () => {
    const legion = makeUnitTransformState(LEGION, "specialty.sandro.6", "binh");
    const horde = makeUnitTransformState(HORDE, "specialty.sandro.1", "binh");
    const stack = insertUnitTransform([legion], horde);
    expect(stack.at(-1)?.cardId).toBe("specialty.sandro.6"); // Legion still on top
    expect(stack[0]?.cardId).toBe("specialty.sandro.1"); // Horde tucked underneath
  });
});

describe("Sandro's Cloak — defeat cascade", () => {
  function makeSkeletonCombatState(transforms: UnitTransformState[]): { state: GameState; unit: CombatUnitState } {
    const unit = makeCombatUnitFromArmy(
      { id: "army_skel", unitDefId: "necropolis.skeletons", side: "pack", transforms },
      "p1",
      "unit_skel",
      1,
      "binh"
    );
    if (!unit) {
      throw new Error("Expected a skeleton combat unit.");
    }
    const state = {
      ruleset: "binh",
      players: {
        p1: { id: "p1", discard: [], army: [{ id: "army_skel", unitDefId: "necropolis.skeletons", side: "pack", transforms: transforms.map((entry) => ({ ...entry })) }] }
      },
      combat: { units: { unit_skel: unit } },
      eventLog: [],
      eventCounter: 0
    } as unknown as GameState;
    return { state, unit };
  }

  it("discards a defeated Cloak and reveals the Pack underneath with the excess damage", () => {
    const horde = makeUnitTransformState(HORDE, "specialty.sandro.1", "binh");
    const { state, unit } = makeSkeletonCombatState([horde]);
    // BINH Horde HP is 3; the Pack of Skeletons underneath has its printed HP.
    expect(unit.maxHealth).toBe(3);
    expect(unit.cardName).toBe("Horde of Skeletons");

    unit.damage = 4; // lethal to the Horde (3 HP), 1 carries over
    markUnitRemovedIfNeeded(state, unit);

    expect(state.players.p1.discard).toContain("specialty.sandro.1");
    expect(unit.transforms ?? []).toHaveLength(0);
    expect(unit.cardName).toBe("Pack of Skeletons");
    expect(unit.damage).toBe(1);
    expect(findEvent(state, "SPECIALTY_CARD_DEFEATED")).toMatchObject({
      cardId: "specialty.sandro.1",
      revealedName: "Pack of Skeletons"
    });
  });
});

describe("Necromancy ability — after-combat window", () => {
  function startSandroGame(): GameState {
    return createAdventureGameState({
      seed: "necro-seed",
      ruleset: "binh",
      difficulty: "normal",
      players: [
        { id: "p1", name: "Sandro", factionId: "necropolis", heroDefId: "sandro" },
        { id: "p2", name: "Catherine", factionId: "castle", heroDefId: "catherine" }
      ],
      rollFirstPlayer: false
    });
  }

  it("only offers Necromancy while the after-combat window is open", () => {
    const state = startSandroGame();
    state.players.p1.hand = ["ability.necromancy"];

    const before = getLegalActions(state, "p1").filter(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "ability.necromancy"
    );
    expect(before).toHaveLength(0);

    state.players.p1.necromancyWindow = true;
    const during = getLegalActions(state, "p1").filter(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "ability.necromancy"
    );
    expect(during.length).toBeGreaterThan(0);
  });

  it("cannot be played when it was drawn from the Ability deck on level-up", () => {
    const state = startSandroGame();
    state.players.p1.hand = ["ability.necromancy"];
    state.players.p1.necromancyWindow = true;
    // Same Necropolis hero, same open window — but this copy came out of the
    // level-up Ability-deck search, so it is kept yet unplayable.
    state.players.p1.deckDrawnAbilityCardIds = ["ability.necromancy"];

    const plays = getLegalActions(state, "p1").filter(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "ability.necromancy"
    );
    expect(plays).toHaveLength(0);
  });

  it("is Necropolis-only — a Castle hero who holds it can never play it", () => {
    const state = startSandroGame();
    state.players.p2.hand = ["ability.necromancy"];
    state.players.p2.necromancyWindow = true;
    state.activePlayerId = "p2";

    const plays = getLegalActions(state, "p2").filter(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "ability.necromancy"
    );
    expect(plays).toHaveLength(0);
  });

  it("playing Necromancy queues a half-gold (rounded down) reinforce choice and closes the window", () => {
    const state = startSandroGame();
    state.players.p1.hand = ["ability.necromancy"];
    state.players.p1.necromancyWindow = true;
    // Give Sandro a Few skeleton to reinforce and the gold to do it.
    state.players.p1.army = [{ id: "army_skel", unitDefId: "necropolis.skeletons", side: "few" }];
    state.players.p1.resources.gold = 20;

    const play = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "PLAY_CARD" &&
        legal.action.cardId === "ability.necromancy" &&
        (legal.action.mode ?? "basic") === "basic"
    );
    expect(play).toBeDefined();

    const next = apply(state, play!.action);
    expect(next.players.p1.necromancyWindow).toBe(false);
    expect(next.players.p1.discard).toContain("ability.necromancy");
    // A reinforce prompt is now waiting for the player.
    const hasReinforcePrompt =
      Boolean(next.adventure?.pendingVisit) || (next.adventure?.rewardQueue.length ?? 0) > 0;
    expect(hasReinforcePrompt).toBe(true);
  });
});
