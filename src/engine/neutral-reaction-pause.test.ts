import { describe, expect, it } from "vitest";
import { applyAction, createAdventureGameState, getLegalActions, NEUTRAL_PLAYER_ID } from "./index";
import { playerHasSpellTimingFreedom } from "./active-effects";
import { getMainHero } from "./adventure";
import { startPlayerCombat } from "./adventure-reducer";
import type { CombatUnitState, GameAction, GameState, MapFieldState, PlayerId } from "./state";

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toHaveLength(0);
  return result.state;
}

function makeGame(): GameState {
  return createAdventureGameState({ seed: "test-seed", difficulty: "normal", rollFirstPlayer: false });
}

function refreshP1(state: GameState): GameState {
  return state.players.p1.needsHandRefresh ? apply(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] }) : state;
}

/** Walk onto the level-I building-materials mine guarded at (9,1). */
function moveOntoGuardedMine(state: GameState): GameState {
  return apply(state, { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to: "h:9:1" });
}

/**
 * Opens a one-guard neutral fight with a single player unit at 13 and the guard
 * reshaped by `reshape`. The player unit is frozen to a higher initiative so it
 * acts first and the guard's activation comes up next.
 */
function neutralFightWithGuard(reshape: (guard: CombatUnitState, state: GameState) => void): GameState {
  let state = moveOntoGuardedMine(refreshP1(makeGame()));
  const armyUnit = state.players.p1.army[0];
  state = apply(state, { type: "PLACE_COMBAT_UNIT", playerId: "p1", armyUnitId: armyUnit.id, position: 13 });
  // Freeze the player unit's initiative high BEFORE finishing placement (the
  // neutral guard is only drawn during FINISH) so the player unit acts first no
  // matter which guard the seed deals.
  for (const unit of Object.values(state.combat!.units)) {
    if (unit.controllerId !== NEUTRAL_PLAYER_ID) {
      unit.initiative = 99;
    }
  }
  state = apply(state, { type: "FINISH_COMBAT_PLACEMENT", playerId: "p1" });
  // Now the guard exists: drop it to the bottom of the order so its activation
  // comes up right after the player's, and let the test reshape it.
  for (const unit of Object.values(state.combat!.units)) {
    if (unit.controllerId === NEUTRAL_PLAYER_ID) {
      unit.initiative = 1;
    }
  }
  const guard = Object.values(state.combat!.units).find((unit) => unit.controllerId === NEUTRAL_PLAYER_ID)!;
  reshape(guard, state);
  return state;
}

/** A ranged guard that simply shoots the player unit from afar. */
function rangedGuard(guard: CombatUnitState): void {
  guard.type = "ranged";
  guard.abilities = [];
  guard.attack = 1;
  guard.grade = "bronze";
  guard.position = 1;
  guard.initiative = 1;
}

/** Grants p1 the (basic) Intelligence anytime-cast freedom, as if it were played. */
function grantIntelligence(state: GameState): void {
  state.activeEffects.push({
    id: `intel_${state.activeEffects.length}`,
    name: "Intelligence",
    scope: "player",
    duration: { type: "combat" },
    polarity: "positive",
    removable: false,
    modifiers: [{ type: "SPELL_CAST_ANYTIME" }],
    source: { type: "system" },
    controllerId: "p1",
    startedRound: state.round,
    usedRollEventIds: [],
    usedChoiceIds: [],
    usedCombatRoundNumbers: []
  });
}

function defendActivePlayerUnit(state: GameState): GameState {
  const active = state.combat?.activeUnitId ? state.combat.units[state.combat.activeUnitId] : null;
  expect(active?.controllerId).toBe("p1");
  return apply(state, { type: "DEFEND_UNIT", playerId: "p1", unitId: active!.id });
}

function guardId(state: GameState): string {
  return Object.values(state.combat!.units).find((unit) => unit.controllerId === NEUTRAL_PLAYER_ID)!.id;
}

describe("neutral combat — pre-activation reaction pause (Intelligence / instants)", () => {
  it("pauses before a guard acts so an Intelligence holder can cast a non-instant spell at it", () => {
    let state = neutralFightWithGuard(rangedGuard);
    // Player holds Intelligence + Magic Arrow (a non-instant activation spell)
    // and NO card to change attack/defense — the exact "you're about to be
    // attacked but can only cast through Intelligence" case.
    grantIntelligence(state);
    state.players.p1.hand = ["spell.magic_arrow"];
    const guard = guardId(state);

    // Defend the player unit; the guard now comes up — and the engine pauses.
    state = defendActivePlayerUnit(state);

    const pause = state.combat!.pendingNeutralStep;
    expect(pause?.kind).toBe("pre-activation");
    expect(pause?.reactingPlayerId).toBe("p1");
    expect(pause?.unitId).toBe(guard);
    // The pop-up previews that the guard is about to attack the player unit.
    expect(pause?.intent?.kind).toBe("attack");

    // The pause offers the Magic Arrow cast (via Intelligence) AND the resume.
    const actions = getLegalActions(state, "p1");
    const castArrow = actions.find(
      (legal) => legal.action.type === "CAST_SPELL" && legal.action.cardId === "spell.magic_arrow"
    );
    expect(castArrow, "Magic Arrow is castable during the pre-activation pause").toBeTruthy();
    expect(actions.some((legal) => legal.action.type === "CONTINUE_NEUTRAL_STEP")).toBe(true);

    // Cast Magic Arrow at the guard: it resolves while the guard still waits.
    const damageBefore = state.combat!.units[guard].damage;
    state = apply(state, castArrow!.action);
    // The spell counted and dealt damage; the fight is still paused on the guard.
    expect(state.players.p1.combatStats.spellsCastThisRound).toBe(1);
    expect(state.combat!.units[guard].damage).toBeGreaterThan(damageBefore);
    expect(state.combat!.pendingNeutralStep?.kind).toBe("pre-activation");

    // Magic Arrow is spent; resuming lets the guard finally act.
    state = apply(state, { type: "CONTINUE_NEUTRAL_STEP", playerId: "p1" });
    expect(state.combat!.units[guard].activatedThisRound || state.combat!.units[guard].attackedThisActivation).toBe(true);
  });

  it("only the reacting player may resume the pause", () => {
    let state = neutralFightWithGuard(rangedGuard);
    grantIntelligence(state);
    state.players.p1.hand = ["spell.magic_arrow"];
    state = defendActivePlayerUnit(state);
    expect(state.combat!.pendingNeutralStep?.kind).toBe("pre-activation");

    // p2 is not a participant in p1's neutral fight and cannot resume it.
    const blocked = applyAction(state, { type: "CONTINUE_NEUTRAL_STEP", playerId: "p2" });
    expect(blocked.errors.length).toBeGreaterThan(0);
    expect(blocked.state.combat!.pendingNeutralStep?.kind).toBe("pre-activation");
  });

  it("still pauses before every guard with nothing to react with, offering only the resume", () => {
    let state = neutralFightWithGuard(rangedGuard);
    // No Intelligence and an empty hand: nothing to react with — but neutral
    // fights pace EVERY guard step, so the pause still opens (the client then
    // auto-resumes it after a short beat).
    state.players.p1.hand = [];
    const guard = guardId(state);

    state = defendActivePlayerUnit(state);

    const pause = state.combat!.pendingNeutralStep;
    expect(pause?.kind).toBe("pre-activation");
    expect(pause?.unitId).toBe(guard);

    // The only thing the player can do is let the guard act (the UI turns that
    // into a 3s auto-resume) — there is no cast/instant to play.
    const actions = getLegalActions(state, "p1");
    expect(actions.every((legal) => legal.action.type === "CONTINUE_NEUTRAL_STEP")).toBe(true);
    expect(actions.some((legal) => legal.action.type === "CONTINUE_NEUTRAL_STEP")).toBe(true);

    // Resuming lets the guard shoot.
    state = apply(state, { type: "CONTINUE_NEUTRAL_STEP", playerId: "p1" });
    const attacked = state.eventLog.some(
      (event) => event.type === "UNIT_ATTACK_DECLARED" && event.attackerId === guard
    );
    expect(attacked).toBe(true);
  });

  it("does NOT pause before the player's own unit (only before the enemy's)", () => {
    // Fresh fight, p1 holds Intelligence + a spell: the first activation is the
    // player's own unit, which must not open a reaction pause for the enemy.
    const state = neutralFightWithGuard(rangedGuard);
    grantIntelligence(state);
    state.players.p1.hand = ["spell.magic_arrow"];

    const active = state.combat!.activeUnitId ? state.combat!.units[state.combat!.activeUnitId] : null;
    expect(active?.controllerId).toBe("p1");
    expect(state.combat!.pendingNeutralStep ?? null).toBeNull();
  });

  it("pauses for a trigger-free instant ability even without Intelligence", () => {
    let state = neutralFightWithGuard(rangedGuard);
    // No Intelligence, but Intelligence itself is an instant the player may play
    // off-turn — so the pause opens to let them play it before the guard acts.
    state.players.p1.hand = ["ability.intelligence"];

    state = defendActivePlayerUnit(state);

    expect(state.combat!.pendingNeutralStep?.kind).toBe("pre-activation");
    const actions = getLegalActions(state, "p1");
    expect(
      actions.some((legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "ability.intelligence")
    ).toBe(true);

    // Playing Intelligence keeps the pause open; the player can then cast.
    const play = actions.find(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "ability.intelligence"
    )!;
    state = apply(state, play.action);
    expect(playerHasSpellTimingFreedom(state, "p1")).toBe(true);
    expect(state.combat!.pendingNeutralStep?.kind).toBe("pre-activation");
  });
});

// ---------------------------------------------------------------------------
// Neutral combat: the player breaks the guards' own same-speed ties
// ---------------------------------------------------------------------------

describe("neutral combat — tied-speed activation order", () => {
  it("pauses on the attacker's activation-order choice when guards tie, then runs the picked guard", () => {
    // One fast player unit and (at least) two Neutral guards tied for the next
    // slot. The guards cannot answer a prompt, so once the player's unit has
    // acted the engine drives — through the real adventure pump — straight onto
    // the ATTACKER's activation-order choice; picking one makes that guard the
    // active unit (which then opens its own pre-activation pause).
    let state = moveOntoGuardedMine(refreshP1(makeGame()));
    const armyUnit = state.players.p1.army[0];
    state = apply(state, { type: "PLACE_COMBAT_UNIT", playerId: "p1", armyUnitId: armyUnit.id, position: 13 });
    // Freeze player units fast BEFORE the guard is drawn so the player acts first.
    for (const unit of Object.values(state.combat!.units)) {
      if (unit.controllerId !== NEUTRAL_PLAYER_ID) {
        unit.initiative = 99;
      }
    }
    state = apply(state, { type: "FINISH_COMBAT_PLACEMENT", playerId: "p1" });

    // Clone the drawn guard so two Neutral units certainly exist, then tie EVERY
    // guard at one (slower) initiative — they all become the tied candidates.
    const combat = state.combat!;
    const guard1 = Object.values(combat.units).find((unit) => unit.controllerId === NEUTRAL_PLAYER_ID)!;
    const occupied = new Set(Object.values(combat.units).map((unit) => unit.position));
    let freePosition = 0;
    while (occupied.has(freePosition)) {
      freePosition += 1;
    }
    const guard2: CombatUnitState = {
      ...structuredClone(guard1),
      id: `${guard1.id}__clone`,
      position: freePosition
    };
    combat.units[guard2.id] = guard2;
    const neutralIds = Object.values(combat.units)
      .filter((unit) => unit.controllerId === NEUTRAL_PLAYER_ID)
      .map((unit) => unit.id);
    for (const id of neutralIds) {
      combat.units[id].initiative = 5;
      combat.units[id].activatedThisRound = false;
    }

    // The player's unit is up first; defending it advances to the tied guards and
    // the pump opens the attacker's order choice instead of auto-picking.
    state = defendActivePlayerUnit(state);

    const choice = state.pendingChoice;
    expect(choice?.type).toBe("OPTION_CHOICE");
    if (choice?.type !== "OPTION_CHOICE") {
      throw new Error("expected an activation-order choice");
    }
    expect(choice.context).toBe("combat-activation-order");
    expect(choice.playerId).toBe("p1"); // the attacker breaks the neutral tie
    expect(choice.activationOrder?.side).toBe(NEUTRAL_PLAYER_ID);
    expect(new Set(choice.activationOrder?.unitIds)).toEqual(new Set(neutralIds));
    expect(state.combat!.activeUnitId).toBeNull();

    // Pick the cloned guard: it becomes the active unit, and being a guard it
    // then opens its own pre-activation pause for the attacker to react to.
    const cloneIndex = choice.activationOrder!.unitIds.indexOf(guard2.id);
    expect(cloneIndex).toBeGreaterThanOrEqual(0);
    state = apply(state, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: choice.id, optionIndex: cloneIndex });

    expect(state.combat!.activeUnitId).toBe(guard2.id);
    expect(state.combat!.pendingNeutralStep?.kind).toBe("pre-activation");
    expect(state.combat!.pendingNeutralStep?.unitId).toBe(guard2.id);
  });
});

// ---------------------------------------------------------------------------
// Player-vs-player: pause for the Intelligence holder during the enemy's turn
// ---------------------------------------------------------------------------

function injectField(state: GameState, spaceId = "99,99"): MapFieldState {
  const field: MapFieldState = {
    spaceId,
    tileInstanceId: "test-tile",
    slot: 0,
    location: "empty_field",
    blackCube: false,
    flagOwnerId: null,
    everFlagged: false,
    settlementResource: null
  };
  state.adventure!.fields[spaceId] = field;
  return field;
}

/** Places one unit for `playerId` on the first legal combat-setup square. */
function placeOne(state: GameState, playerId: PlayerId): GameState {
  const place = getLegalActions(state, playerId).find((legal) => legal.action.type === "PLACE_COMBAT_UNIT");
  expect(place, `${playerId} should have a placement square`).toBeTruthy();
  return apply(state, place!.action);
}

/**
 * Opens a player-vs-player fight (p1 attacks p2), each side with one unit, then
 * lets `prep` mutate the placed combat before the defender finishes placement
 * (set initiatives, grant Intelligence, stock a hand). Returns the running
 * combat right after both sides have placed.
 */
function pvpFight(prep: (state: GameState) => void): GameState {
  let state = createAdventureGameState({ seed: "test-seed", difficulty: "normal", rollFirstPlayer: false });
  const field = injectField(state);
  const attacker = getMainHero(state, "p1")!;
  const defender = getMainHero(state, "p2")!;
  attacker.spaceId = field.spaceId;
  defender.spaceId = field.spaceId;

  startPlayerCombat(state, attacker, defender, field.spaceId);
  // The defender's pre-combat preparation window opens first (fresh town
  // tokens); accept it to reach deployment.
  if (state.combat?.defenderPrep) {
    state = apply(state, { type: "ACCEPT_COMBAT", playerId: state.combat.defenderPrep.playerId });
  }
  state = placeOne(state, "p1");
  state = apply(state, { type: "FINISH_COMBAT_PLACEMENT", playerId: "p1" });
  state = placeOne(state, "p2");

  prep(state);

  return apply(state, { type: "FINISH_COMBAT_PLACEMENT", playerId: "p2" });
}

describe("player-vs-player — pre-activation pause only with Intelligence", () => {
  it("pauses for the Intelligence holder before the opponent's unit acts", () => {
    const state = pvpFight((draft) => {
      // p1's unit goes first; p2 holds the Intelligence freedom + a spell.
      for (const unit of Object.values(draft.combat!.units)) {
        unit.initiative = unit.controllerId === "p1" ? 99 : 1;
      }
      draft.activeEffects.push({
        id: "intel_pvp",
        name: "Intelligence",
        scope: "player",
        duration: { type: "combat" },
        polarity: "positive",
        removable: false,
        modifiers: [{ type: "SPELL_CAST_ANYTIME" }],
        source: { type: "system" },
        controllerId: "p2",
        startedRound: draft.round,
        usedRollEventIds: [],
        usedChoiceIds: [],
        usedCombatRoundNumbers: []
      });
      draft.players.p2.hand = ["spell.magic_arrow"];
    });

    // Before p1's (higher-initiative) unit acts, p2 — the Intelligence holder —
    // gets a window. The active unit is p1's; the pause belongs to p2.
    const pause = state.combat!.pendingNeutralStep;
    expect(pause?.kind).toBe("pre-activation");
    expect(pause?.reactingPlayerId).toBe("p2");
    expect(state.combat!.units[pause!.unitId].controllerId).toBe("p1");

    // p2 may cast off-turn during the pause; p1 is locked out of it.
    expect(
      getLegalActions(state, "p2").some(
        (legal) => legal.action.type === "CAST_SPELL" && legal.action.cardId === "spell.magic_arrow"
      )
    ).toBe(true);
    expect(getLegalActions(state, "p1")).toHaveLength(0);

    // p2 resumes; control passes to p1 to drive their unit.
    const resumed = apply(state, { type: "CONTINUE_NEUTRAL_STEP", playerId: "p2" });
    expect(resumed.combat!.pendingNeutralStep ?? null).toBeNull();
    expect(resumed.combat!.units[pause!.unitId].controllerId).toBe("p1");
    expect(resumed.combat!.activeUnitId).toBe(pause!.unitId);
  });

  it("does NOT pause in player combat without the Intelligence freedom", () => {
    const state = pvpFight((draft) => {
      for (const unit of Object.values(draft.combat!.units)) {
        unit.initiative = unit.controllerId === "p1" ? 99 : 1;
      }
      // p2 holds spells but never played Intelligence: PvP gives no off-turn
      // pause (they still get the normal attack/spell reaction windows).
      draft.players.p2.hand = ["spell.magic_arrow", "spell.fireball"];
    });

    expect(state.combat!.pendingNeutralStep ?? null).toBeNull();
    // The fight proceeds normally: p1's unit is active for p1 to drive.
    const active = state.combat!.activeUnitId ? state.combat!.units[state.combat!.activeUnitId] : null;
    expect(active?.controllerId).toBe("p1");
  });
});
