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

    // CONTROL: a "-1" extra die misses the window — announce under `${id}-roll`
    // so the lightning FX plan never flashes on a miss (Death-Stare style).
    const miss = rangedDuel({ attackerAbilities: ["thunderbirds-lightning"], rolls: [1, -1] });
    const missDice = abilityEvent(miss, "thunderbirds-lightning-roll").dice;
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

function holdPositive(state: GameState, playerId: PlayerId, cardId: string): void {
  state.players[playerId].moraleCards ??= { positive: [], negative: [] };
  state.players[playerId].moraleCards!.positive.push(cardId);
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

// ---------------------------------------------------------------------------
// The interactive reroll window on ability rolls (artifact / Positive Morale)
// ---------------------------------------------------------------------------

/** Keep the latest candidate of the currently open ATTACK_DIE_REROLL window. */
function keepOpenRoll(state: GameState): GameState {
  const choice = state.pendingChoice;
  expect(choice?.type, "an open reroll window").toBe("ATTACK_DIE_REROLL");
  if (choice?.type !== "ATTACK_DIE_REROLL") {
    throw new Error("no reroll window");
  }
  return applyOk(state, {
    type: "CHOOSE_PENDING_ROLL",
    playerId: choice.playerId,
    choiceId: choice.id,
    candidateIndex: choice.candidates.length - 1
  });
}

/** The currently open reroll window, asserted to be an ability-roll one. */
function openAbilityWindow(state: GameState) {
  const choice = state.pendingChoice;
  expect(choice?.type, "an open reroll window").toBe("ATTACK_DIE_REROLL");
  if (choice?.type !== "ATTACK_DIE_REROLL") {
    throw new Error("no reroll window");
  }
  expect(choice.abilityRoll, "an ability-roll window").toBeTruthy();
  return choice;
}

/** The sandbox duel paused at each window instead of auto-settling. */
function startDuel(options: { attackerAbilities: string[]; hand?: string[]; rolls: number[] }): GameState {
  const state = createInitialGameState();
  const attacker = state.combat!.units.unit_p1_marksmen;
  attacker.abilities = options.attackerAbilities;
  attacker.attack = 3;
  attacker.position = 1;
  const defender = state.combat!.units.unit_p2_skeletons;
  defender.abilities = [];
  defender.position = 13;
  defender.defense = 0;
  defender.maxHealth = 20;
  defender.damage = 0;
  defender.variant = "few"; // a petrified Few is REMOVED (a Pack would flip)
  state.players.p1.hand = options.hand ?? [];
  state.players.p2.hand = [];
  state.combat!.dice.scriptedRolls = options.rolls;
  state.combat!.dice.rollCount = 0;
  state.activePlayerId = "p1";
  state.combat!.activeUnitId = "unit_p1_marksmen";
  return passAllReactions(
    applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_marksmen",
      defenderId: "unit_p2_skeletons"
    })
  );
}

/** The last event of this ability that actually carries a dice read-out. */
function abilityDiceEvent(
  state: GameState,
  abilityId: string
): Extract<GameEvent, { type: "UNIT_ABILITY_TRIGGERED" }> {
  const event = [...state.eventLog]
    .reverse()
    .find(
      (entry): entry is Extract<GameEvent, { type: "UNIT_ABILITY_TRIGGERED" }> =>
        entry.type === "UNIT_ABILITY_TRIGGERED" && entry.abilityId === abilityId && Boolean(entry.dice)
    );
  expect(event, `a ${abilityId} dice event`).toBeTruthy();
  return event!;
}

describe("ability-roll reroll window (Death Stare & co. adjusted like the attack roll)", () => {
  it("a 'Reroll a die' artifact rerolls a missed Death Stare into a kill", () => {
    // Attack die +1 (window: keep), stare -1/+1 (miss → window opens), the
    // Ring rerolls BOTH stare dice → -1/-1 → the stare lands on the keep.
    let state = startDuel({
      attackerAbilities: ["gorgon-death-stare"],
      hand: ["artifact.diplomats_ring"],
      rolls: [1, -1, 1, -1, -1]
    });

    // First pause: the ATTACK die's own window (the Ring is a source there too).
    const attackWindow = state.pendingChoice;
    expect(attackWindow?.type).toBe("ATTACK_DIE_REROLL");
    expect(attackWindow?.type === "ATTACK_DIE_REROLL" && attackWindow.abilityRoll).toBeFalsy();
    state = keepOpenRoll(state);

    // Second pause: the Death Stare's own dice, real faces from the stream.
    const stareWindow = openAbilityWindow(state);
    expect(stareWindow.abilityRoll!.kind).toBe("death-stare");
    expect(stareWindow.abilityRoll!.abilityName).toBe("Death Stare");
    expect(stareWindow.candidates[0].rolls).toEqual([-1, 1]);

    // Take the Ring's reroll: both stare dice are re-thrown from the stream.
    state = applyOk(state, { type: "REROLL_PENDING_CHOICE", playerId: "p1", choiceId: stareWindow.id });
    const rerolled = openAbilityWindow(state);
    expect(rerolled.candidates).toHaveLength(2);
    expect(rerolled.candidates[1].rolls).toEqual([-1, -1]);
    // The artifact is spent the moment its reroll is taken.
    expect(state.players.p1.hand).not.toContain("artifact.diplomats_ring");
    expect(state.players.p1.discard).toContain("artifact.diplomats_ring");

    // Keeping the rerolled dice petrifies the target.
    state = keepOpenRoll(state);
    const stare = abilityEvent(state, "gorgon-death-stare");
    expect(stare.dice?.rolls).toEqual([-1, -1]);
    expect(stare.dice?.success).toBe(true);
    expect(
      state.eventLog.some((event) => event.type === "UNIT_REMOVED" && event.unitId === "unit_p2_skeletons")
    ).toBe(true);
  });

  it("CONTROL: with no reroll source the stare resolves straight through, no window", () => {
    const state = startDuel({
      attackerAbilities: ["gorgon-death-stare"],
      rolls: [1, -1, 1]
    });
    expect(state.pendingChoice).toBeNull();
    expect(abilityEvent(state, "gorgon-death-stare-roll").dice?.success).toBe(false);
  });

  it("the tail resumes after a kept window — a later follow-up and the outcome both land", () => {
    // The same unit carries the Thunderbird die AND the Death Stare: each roll
    // opens its own window (the unused Ring stays in hand), and the stare
    // still fires after the thunderbird's window — the tail stepping works.
    let state = startDuel({
      attackerAbilities: ["thunderbirds-lightning", "gorgon-death-stare"],
      hand: ["artifact.diplomats_ring"],
      rolls: [1, 0, -1, -1]
    });
    state = keepOpenRoll(state); // the attack window

    const thunderbird = openAbilityWindow(state);
    expect(thunderbird.abilityRoll!.kind).toBe("attack-die-damage");
    state = keepOpenRoll(state); // keep the landed 0 → 1 extra damage

    const stare = openAbilityWindow(state);
    expect(stare.abilityRoll!.kind).toBe("death-stare");
    state = keepOpenRoll(state);

    const events = state.eventLog.filter(
      (event): event is Extract<GameEvent, { type: "UNIT_ABILITY_TRIGGERED" }> =>
        event.type === "UNIT_ABILITY_TRIGGERED" && Boolean(event.dice)
    );
    const thunderbirdIndex = events.findIndex((event) => event.abilityId === "thunderbirds-lightning");
    const stareIndex = events.findIndex((event) => event.abilityId === "gorgon-death-stare");
    expect(thunderbirdIndex).toBeGreaterThanOrEqual(0);
    expect(stareIndex).toBeGreaterThan(thunderbirdIndex);
    expect(events[thunderbirdIndex].dice?.success).toBe(true);
    expect(events[stareIndex].dice?.success).toBe(true);
  });

  it("the parked retaliation still fires after a kept ability window (melee)", () => {
    let state = stageCombat(makeGame("ability-window-retaliation"));
    state.combat!.units.a1.abilities = ["gorgon-death-stare"];
    state.players.p1.hand = ["artifact.diplomats_ring"];
    // a1 attack 0 (window: keep), stare -1/+1 (window: keep the miss), then
    // b1's Retaliation Attack rolls 0.
    state.combat!.dice.scriptedRolls = [0, -1, 1, 0];

    state = attack(state);
    state = keepOpenRoll(state); // attack window
    openAbilityWindow(state);
    state = keepOpenRoll(state); // stare window — kept at a miss

    const retaliation = state.eventLog.find(
      (event) => event.type === "ATTACK_ROLLED" && event.isRetaliation && event.attackerId === "b1"
    );
    expect(retaliation, "the retaliation resolved after the window").toBeTruthy();
  });

  it('the Positive Morale "set a die to +1" turns a missed Thunderbird die into a hit', () => {
    let state = stageCombat(makeGame("ability-window-set-die"));
    state.combat!.units.a1.abilities = ["thunderbirds-lightning"];
    holdPositive(state, "p1", MORALE_CARD_IDS.setAttackDiePlus);
    // Attack die 0 (window from the set card: keep), thunderbird -1 (miss →
    // window), set the die to +1 (in the 0/+1 window), keep → 1 extra damage.
    state.combat!.dice.scriptedRolls = [0, -1];

    state = attack(state);
    state = keepOpenRoll(state); // the attack window (set card offered there too)

    const window = openAbilityWindow(state);
    expect(window.candidates[0].rolls).toEqual([-1]);
    state = applyOk(state, {
      type: "REROLL_PENDING_CHOICE",
      playerId: "p1",
      choiceId: window.id,
      useSetDie: true
    });
    const setWindow = openAbilityWindow(state);
    expect(setWindow.candidates[1].rolls).toEqual([1]);
    state = keepOpenRoll(state);

    const outcome = abilityEvent(state, "thunderbirds-lightning");
    expect(outcome.dice?.success).toBe(true);
    expect(outcome.dice?.modifiers).toEqual(
      expect.arrayContaining([{ source: "Positive Morale", text: 'one die is set to the "+1" side' }])
    );
    // 2 damage from the attack (3 + 0 vs 1) plus the thunderbird's 1.
    expect(state.combat!.units.b1.damage).toBe(3);
    // The set card is spent the moment it is used.
    expect(state.players.p1.moraleCards?.positive ?? []).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Morale curses on the ability dice themselves
// ---------------------------------------------------------------------------

describe("morale curses ride ability rolls like attack rolls", () => {
  it('"roll one less" collapses the Death Stare to a single die (mandatory, even though it helps)', () => {
    let state = stageCombat(makeGame("stare-roll-one-less"));
    state.combat!.units.a1.abilities = ["gorgon-death-stare"];
    state.combat!.units.b1.maxHealth = 20; // survives the attack, dies to the stare
    holdNegative(state, "p1", MORALE_CARD_IDS.rollOneLess);
    // Attack die is a single die (the card waits), the stare would be 2 dice →
    // reduced to 1: a lone -1 now petrifies.
    state.combat!.dice.scriptedRolls = [0, -1];

    state = attack(state);

    const stare = abilityEvent(state, "gorgon-death-stare");
    expect(stare.dice?.rolls).toEqual([-1]);
    expect(stare.dice?.success).toBe(true);
    expect(stare.dice?.modifiers).toEqual(
      expect.arrayContaining([{ source: "Negative Morale", text: "one die less is rolled" }])
    );
    expect(state.players.p1.moraleCards?.negative ?? []).toHaveLength(0);
  });

  it('the forced "+1" reroll re-throws a stare die (and here completes the kill)', () => {
    let state = stageCombat(makeGame("stare-reroll-plus-one"));
    state.combat!.units.a1.abilities = ["gorgon-death-stare"];
    state.combat!.units.b1.maxHealth = 20;
    holdNegative(state, "p1", MORALE_CARD_IDS.rerollPlusOne);
    // Attack die 0 (no +1 — the curse waits), stare +1/-1 → the +1 is
    // forcibly rerolled into -1 → double -1, petrified.
    state.combat!.dice.scriptedRolls = [0, 1, -1, -1];

    state = attack(state);

    const stare = abilityEvent(state, "gorgon-death-stare");
    expect(stare.dice?.rolls).toEqual([-1, -1]);
    expect(stare.dice?.success).toBe(true);
    expect(stare.dice?.modifiers).toEqual(
      expect.arrayContaining([{ source: "Negative Morale", text: 'a "+1" is forcibly rerolled' }])
    );
    expect(state.players.p1.moraleCards?.negative ?? []).toHaveLength(0);
  });

  it("the Medusa gaze (a retaliation-side ability die) suffers the holder's forced reroll too", () => {
    let state = stageCombat(makeGame("gaze-reroll-plus-one"), {
      defender: { abilities: ["medusa-paralyze-retaliation-die"] }
    });
    holdNegative(state, "p2", MORALE_CARD_IDS.rerollPlusOne);
    // a1 attacks (0), b1 retaliates (0), the gaze rolls +1 → the holder's own
    // curse forcibly rerolls it → 0, which is the gaze's success face.
    state.combat!.dice.scriptedRolls = [0, 0, 1, 0];

    state = attack(state);

    const gaze = abilityDiceEvent(state, "medusa-paralyze-retaliation-die");
    expect(gaze.dice?.rolls).toEqual([0]);
    expect(gaze.dice?.success).toBe(true);
    expect(gaze.dice?.modifiers).toEqual(
      expect.arrayContaining([{ source: "Negative Morale", text: 'a "+1" is forcibly rerolled' }])
    );
    expect((state.combat!.units.a1.tokens ?? []).some((token) => token.kind === "paralysis")).toBe(true);
  });

  it("CONTROL: without the curse the gaze keeps its +1 and no Paralysis lands", () => {
    let state = stageCombat(makeGame("gaze-control"), {
      defender: { abilities: ["medusa-paralyze-retaliation-die"] }
    });
    state.combat!.dice.scriptedRolls = [0, 0, 1];

    state = attack(state);

    // Miss announces under `${id}-roll` so the paralyze FX plan never freezes.
    const gaze = abilityDiceEvent(state, "medusa-paralyze-retaliation-die-roll");
    expect(gaze.dice?.rolls).toEqual([1]);
    expect(gaze.dice?.success).toBe(false);
    expect((state.combat!.units.a1.tokens ?? []).some((token) => token.kind === "paralysis")).toBe(false);
  });
});
