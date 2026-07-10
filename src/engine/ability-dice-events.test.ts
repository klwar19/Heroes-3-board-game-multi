import { describe, expect, it } from "vitest";
import { MORALE_CARD_IDS } from "@/data/cards/morale";
import { applyAction, createAdventureGameState, createInitialGameState, getMainHero } from "./index";
import { ATTACK_DIE_FACES } from "./battlefield";
import type { CombatState, CombatUnitState, GameAction, GameEvent, GameState, MapFieldState, PlayerId } from "./state";

/**
 * The dice-roll DISPLAY contract (the "show every roll" feature):
 * - an ability's own roll (Death Stare, the Thunderbird extra die…) carries a
 *   structured `dice` payload on its UNIT_ABILITY_TRIGGERED event — the faces
 *   thrown, whether the printed effect landed, and the overlay heading/read-out;
 * - a morale/artifact adjustment that visibly changed an Attack roll is named
 *   on the ATTACK_ROLLED event as `rollModifiers`.
 * Each spec pins the payload against the SCRIPTED faces (with a control where
 * the same scene diverges), so it fails if the wiring is removed or the payload
 * stops reflecting what was actually rolled.
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function passAllReactions(state: GameState): GameState {
  let current = state;
  let safety = 30;
  while (current.reactionWindow && safety > 0) {
    safety -= 1;
    current = applyOk(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
  }
  return current;
}

/** Pass instant windows and keep the original attack roll (decline rerolls). */
function settle(state: GameState): GameState {
  let current = state;
  let safety = 40;
  while (safety > 0 && (current.reactionWindow || current.pendingChoice?.type === "ATTACK_DIE_REROLL")) {
    safety -= 1;
    if (current.reactionWindow) {
      current = passAllReactions(current);
      continue;
    }
    const choice = current.pendingChoice;
    if (choice?.type === "ATTACK_DIE_REROLL") {
      current = applyOk(current, {
        type: "CHOOSE_PENDING_ROLL",
        playerId: choice.playerId,
        choiceId: choice.id,
        candidateIndex: choice.candidates.length - 1
      });
    }
  }
  return current;
}

/**
 * A clean ranged duel in the combat sandbox: the p1 Marksmen shoot the p2
 * Skeletons from a non-adjacent space (no retaliation), with scripted dice.
 */
function rangedDuel(options: {
  attackerAbilities?: string[];
  defenderAbilities?: string[];
  defenderName?: string;
  rolls: number[];
}): GameState {
  const state = createInitialGameState();
  const attacker = state.combat!.units.unit_p1_marksmen;
  attacker.abilities = options.attackerAbilities ?? [];
  attacker.attack = 3;
  attacker.position = 1;

  const defender = state.combat!.units.unit_p2_skeletons;
  defender.abilities = options.defenderAbilities ?? [];
  defender.position = 13;
  defender.defense = 0;
  defender.maxHealth = 20;
  defender.damage = 0;
  if (options.defenderName) {
    defender.name = options.defenderName;
  }

  state.players.p1.hand = [];
  state.players.p2.hand = [];
  state.combat!.dice.scriptedRolls = options.rolls;
  state.combat!.dice.rollCount = 0;
  state.activePlayerId = "p1";
  state.combat!.activeUnitId = "unit_p1_marksmen";

  return settle(
    applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_marksmen",
      defenderId: "unit_p2_skeletons"
    })
  );
}

function abilityEvent(
  state: GameState,
  abilityId: string
): Extract<GameEvent, { type: "UNIT_ABILITY_TRIGGERED" }> {
  const event = [...state.eventLog]
    .reverse()
    .find(
      (entry): entry is Extract<GameEvent, { type: "UNIT_ABILITY_TRIGGERED" }> =>
        entry.type === "UNIT_ABILITY_TRIGGERED" && entry.abilityId === abilityId
    );
  expect(event, `a ${abilityId} ability event`).toBeTruthy();
  return event!;
}

function lastAttackRoll(state: GameState, attackerId: string): Extract<GameEvent, { type: "ATTACK_ROLLED" }> {
  const event = [...state.eventLog]
    .reverse()
    .find(
      (entry): entry is Extract<GameEvent, { type: "ATTACK_ROLLED" }> =>
        entry.type === "ATTACK_ROLLED" && entry.attackerId === attackerId && !entry.isRetaliation
    );
  expect(event, "an ATTACK_ROLLED event").toBeTruthy();
  return event!;
}

// ---------------------------------------------------------------------------
// Ability rolls carry structured dice for the overlay
// ---------------------------------------------------------------------------

describe("ability-roll dice payloads (UNIT_ABILITY_TRIGGERED.dice)", () => {
  it("a landed Death Stare carries its two faces, success and the outcome caption", () => {
    // attack die +1, then the stare dice -1/-1 → the stare procs.
    const next = rangedDuel({ attackerAbilities: ["gorgon-death-stare"], rolls: [1, -1, -1] });
    const dice = abilityEvent(next, "gorgon-death-stare").dice;
    expect(dice).toBeTruthy();
    expect(dice!.rolls).toEqual([-1, -1]);
    expect(dice!.success).toBe(true);
    expect(dice!.label).toBe("Death Stare");
    expect(dice!.caption).toContain("0 Health");
  });

  it("a missed Death Stare announce carries the actual faces with success=false", () => {
    const next = rangedDuel({ attackerAbilities: ["gorgon-death-stare"], rolls: [1, -1, 1] });
    const dice = abilityEvent(next, "gorgon-death-stare-roll").dice;
    expect(dice).toBeTruthy();
    // The payload mirrors what was ACTUALLY rolled, not the printed target.
    expect(dice!.rolls).toEqual([-1, 1]);
    expect(dice!.success).toBe(false);
    expect(dice!.caption).toBe("No effect.");
  });

  it("the Thunderbird extra die carries its face — landed and missed", () => {
    // attack die +1, extra die 0 → within the 0/+1 window: 1 extra damage.
    const hit = rangedDuel({ attackerAbilities: ["thunderbirds-lightning"], rolls: [1, 0] });
    const hitDice = abilityEvent(hit, "thunderbirds-lightning").dice;
    expect(hitDice).toBeTruthy();
    expect(hitDice!.rolls).toEqual([0]);
    expect(hitDice!.success).toBe(true);
    expect(hitDice!.caption).toContain("1 extra damage");

    // CONTROL: a "-1" extra die misses the window — same event, success=false.
    const miss = rangedDuel({ attackerAbilities: ["thunderbirds-lightning"], rolls: [1, -1] });
    const missDice = abilityEvent(miss, "thunderbirds-lightning").dice;
    expect(missDice).toBeTruthy();
    expect(missDice!.rolls).toEqual([-1]);
    expect(missDice!.success).toBe(false);
    expect(missDice!.caption).toBe("No effect.");
  });

  it("Mummy's Curse names itself on the forced attack die (rollModifiers)", () => {
    const next = rangedDuel({
      defenderAbilities: ["mummy-force-attacker-die"],
      defenderName: "Mummies",
      rolls: []
    });
    const rolled = lastAttackRoll(next, "unit_p1_marksmen");
    expect(rolled.roll).toBe(-1);
    expect(rolled.rolls).toEqual([-1]);
    expect(rolled.rollModifiers).toEqual([{ source: "Mummies", text: "sets the Attack die to -1" }]);
  });
});

// ---------------------------------------------------------------------------
// Morale adjustments are named on ATTACK_ROLLED (rollModifiers)
// ---------------------------------------------------------------------------

function makeGame(seed: string): GameState {
  return createAdventureGameState({
    seed,
    difficulty: "normal",
    rollFirstPlayer: false,
    moraleCards: true,
    players: [
      { id: "p1", name: "Catherine", factionId: "castle", heroDefId: "catherine" },
      { id: "p2", name: "Alamar", factionId: "dungeon", heroDefId: "alamar" }
    ]
  });
}

function injectField(state: GameState, spaceId = "99,99"): MapFieldState {
  const field: MapFieldState = {
    spaceId,
    tileInstanceId: "test-tile",
    slot: 0,
    location: "empty_field",
    difficulty: 7,
    blackCube: false,
    flagOwnerId: null,
    everFlagged: false,
    settlementResource: null
  };
  state.adventure!.fields[spaceId] = field;
  return field;
}

function unit(
  over: Partial<CombatUnitState> & { id: string; controllerId: PlayerId; armyUnitId: string }
): CombatUnitState {
  return {
    name: "Pikemen",
    cardName: "Few Pikemen",
    variant: "few",
    grade: "bronze",
    type: "ground",
    attack: 3,
    defense: 1,
    maxHealth: 6,
    damage: 0,
    initiative: 1,
    position: 5,
    activatedThisRound: false,
    movedThisActivation: false,
    retaliatedThisRound: false,
    defenseToken: false,
    abilities: [],
    unitDefId: "castle.pikemen",
    assets: { cardImage: "", imageAlt: "" },
    ...over
  } as CombatUnitState;
}

function stageCombat(
  state: GameState,
  overrides: { attacker?: Partial<CombatUnitState>; defender?: Partial<CombatUnitState> } = {}
): GameState {
  const attackerHero = getMainHero(state, "p1")!;
  const defenderHero = getMainHero(state, "p2")!;
  const field = injectField(state);
  attackerHero.spaceId = field.spaceId;
  defenderHero.spaceId = field.spaceId;
  state.players.p1.army = [{ id: "a1", unitDefId: "castle.pikemen", side: "few" }];
  state.players.p2.army = [{ id: "b1", unitDefId: "castle.pikemen", side: "few" }];
  state.players.p1.hand = [];
  state.players.p2.hand = [];

  state.combat = {
    id: "c1",
    round: 1,
    attackerPlayerId: "p1",
    defenderPlayerId: "p2",
    activeUnitId: "a1",
    context: {
      kind: "player",
      attackerHeroId: attackerHero.id,
      defenderHeroId: defenderHero.id,
      fieldId: field.spaceId
    },
    setup: null,
    awaitingContinue: false,
    outcome: null,
    obstacles: [],
    dice: { faces: [...ATTACK_DIE_FACES], seed: "ability-dice", rollCount: 0 },
    units: {
      a1: unit({ id: "a1", controllerId: "p1", armyUnitId: "a1", position: 5, ...overrides.attacker }),
      b1: unit({ id: "b1", controllerId: "p2", armyUnitId: "b1", position: 6, ...overrides.defender })
    }
  } as CombatState;
  state.phase = "combat";
  state.activePlayerId = "p1";
  return state;
}

function holdNegative(state: GameState, playerId: PlayerId, cardId: string): void {
  state.players[playerId].moraleCards ??= { positive: [], negative: [] };
  state.players[playerId].moraleCards!.negative.push(cardId);
}

function attack(state: GameState): GameState {
  return applyOk(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId: "a1", defenderId: "b1" });
}

describe("morale adjustments on ATTACK_ROLLED (rollModifiers)", () => {
  it('the "-1 to your next roll" latch is named on the roll it hit', () => {
    let state = stageCombat(makeGame("dice-note-next-minus"));
    holdNegative(state, "p1", MORALE_CARD_IDS.nextRollMinusOne);
    state.combat!.dice.scriptedRolls = [0];

    state = attack(state);

    const rolled = lastAttackRoll(state, "a1");
    expect(rolled.rollModifiers).toEqual([{ source: "Negative Morale", text: "-1 to this Attack roll" }]);
  });

  it("CONTROL: without the card the same roll carries no modifier notes", () => {
    let state = stageCombat(makeGame("dice-note-control"));
    state.combat!.dice.scriptedRolls = [0];
    state = attack(state);
    expect(lastAttackRoll(state, "a1").rollModifiers).toBeUndefined();
  });

  it('the "set one die to -1" curse names the flip (the shown faces already carry it)', () => {
    let state = stageCombat(makeGame("dice-note-set-minus"));
    holdNegative(state, "p1", MORALE_CARD_IDS.setAttackDieMinus);
    state.combat!.dice.scriptedRolls = [1];

    state = attack(state);

    const rolled = lastAttackRoll(state, "a1");
    expect(rolled.rolls).toEqual([-1]);
    expect(rolled.roll).toBe(-1);
    expect(rolled.rollModifiers).toEqual([
      { source: "Negative Morale", text: 'one die is set to the "-1" side' }
    ]);
  });

  it("a forced reroll of the defender's +1 Defend die is named alongside the shown Defend face", () => {
    let state = stageCombat(makeGame("dice-note-defend-reroll"), { defender: { defenseToken: true } });
    holdNegative(state, "p2", MORALE_CARD_IDS.rerollPlusOne);
    state.combat!.dice.scriptedRolls = [0, 1, -1];

    state = attack(state);

    const rolled = lastAttackRoll(state, "a1");
    expect(rolled.defendRoll).toBe(-1);
    expect(rolled.rollModifiers).toEqual([
      { source: "Negative Morale", text: 'the Defend die\'s "+1" is forcibly rerolled' }
    ]);
  });
});
