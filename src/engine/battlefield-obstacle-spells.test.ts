import { describe, expect, it } from "vitest";
import { makeActiveEffect } from "./active-effects";
import { applyAction, createInitialGameState, getLegalActions } from "./index";
import { getLegalMoveDestinations } from "./legal-actions";
import { getPlayerView } from "./player-view";
import type { BattlefieldTokenState, GameAction, GameState, UnitId } from "./state";

/**
 * Engine tests for the four battlefield-obstacle Spells imported from the fan
 * wiki + the Stronghold / Stretch Goals 2 rulebook. Every rule below is
 * engine-enforced; each test fails if its wiring is removed.
 *  - Force Field (Basic Earth) — places a blocking Obstacle for a Power-scaled
 *    span (this round / next round / whole combat).
 *  - Fire Wall  (Basic Fire)  — a lasting Effect Obstacle: burns a GROUND or
 *    RANGED unit that passes through OR stops on it, a FLYING unit that STOPS on
 *    it, and ANY unit that BEGINS its activation on it. Only a flyer CROSSING
 *    the wall mid-move is spared. It is NEVER consumed — it stays the whole
 *    combat.
 *  - Quicksand  (Basic Earth) — face-down traps; an armed one ends the entering
 *    unit's movement AND activation, a decoy does nothing. A sprung trap is
 *    REMOVED, and armed/decoy stays hidden from the opponent throughout.
 *  - Land Mine  (Expert Fire) — face-down traps; an armed one deals 2 damage and
 *    the unit then continues, a decoy does nothing. A sprung trap is REMOVED,
 *    and armed/decoy stays hidden from the opponent throughout.
 *
 * Sandbox board (4 columns x 5 rows), positions 0-19:
 *    0  1  2  3 / 4  5  6  7 / 8  9 10 11 / 12 13 14 15 / 16 17 18 19
 * Units: p1 marksmen@1 (ranged), griffins@5 (flying), crusaders@6 (ground);
 *        p2 skeletons@13 (ground), vampires@14 (flying), dread_knights@18 (ground).
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function passAllReactions(state: GameState): GameState {
  let current = state;
  let safety = 40;
  while (current.reactionWindow && safety > 0) {
    safety -= 1;
    current = applyOk(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
  }
  return current;
}

function findSpaceCast(state: GameState, playerId: "p1" | "p2", cardId: string, position: number) {
  return getLegalActions(state, playerId).find(
    (legal) =>
      legal.action.type === "CAST_SPELL" &&
      legal.action.cardId === cardId &&
      legal.action.target?.type === "space" &&
      legal.action.target.position === position
  );
}

/**
 * Casts a space-target Spell at `position` with `power` Power pooled into it (the
 * spare stat.power cards open the Empower window so the cast waits on the stack,
 * exactly like the other spell tests). Returns the state after the cast resolves.
 */
function castSpaceSpell(seed: string, cardId: string, position: number, power: number): GameState {
  const state = createInitialGameState(seed);
  state.players.p1.hand = [cardId, "stat.power", "stat.power", "stat.power", "stat.power", "stat.power", "stat.power"];
  state.players.p2.hand = [];
  // No standing School/permanent Power, so the pooled `power` is exactly the cast Power.
  state.players.p1.permanents = [];
  state.activePlayerId = "p1";
  state.combat!.activeUnitId = "unit_p1_crusaders";
  state.combat!.units.unit_p1_crusaders.activatedThisRound = false;

  const cast = findSpaceCast(state, "p1", cardId, position);
  expect(cast, `${cardId} should be castable on empty space ${position}`).toBeTruthy();
  const casted = applyOk(state, cast!.action);
  if (casted.stack[0]) {
    casted.stack[0].modifiers.spellPowerBonus = power;
  }
  return passAllReactions(casted);
}

/**
 * Casts a no-target Spell (Quicksand / Land Mine: the cast picks no space — it
 * opens the placement picker) with `power` Power pooled into it. Returns the
 * state after the cast resolves, i.e. with the placement picker open.
 */
function castNoTargetSpell(seed: string, cardId: string, power: number): GameState {
  const state = createInitialGameState(seed);
  state.players.p1.hand = [cardId, "stat.power", "stat.power", "stat.power", "stat.power", "stat.power", "stat.power"];
  state.players.p2.hand = [];
  state.players.p1.permanents = [];
  state.activePlayerId = "p1";
  state.combat!.activeUnitId = "unit_p1_crusaders";
  state.combat!.units.unit_p1_crusaders.activatedThisRound = false;

  const cast = getLegalActions(state, "p1").find(
    (legal) => legal.action.type === "CAST_SPELL" && legal.action.cardId === cardId && legal.action.target?.type === "none"
  );
  expect(cast, `${cardId} should be castable with no space target`).toBeTruthy();
  const casted = applyOk(state, cast!.action);
  if (casted.stack[0]) {
    casted.stack[0].modifiers.spellPowerBonus = power;
  }
  return passAllReactions(casted);
}

/** Pushes a battlefield token straight onto the board (used to isolate the trigger logic). */
function injectToken(state: GameState, token: Omit<BattlefieldTokenState, "id">): string {
  const id = `test_token_${(state.combat!.battlefieldTokens?.length ?? 0) + 1}`;
  state.combat!.battlefieldTokens = [...(state.combat!.battlefieldTokens ?? []), { ...token, id }];
  return id;
}

/** Parks every unit far from the test corridor, then drops `mover` at `start` as the active unit. */
function soloMover(state: GameState, moverId: UnitId, start: number): void {
  // The sandbox seeds obstacles at [8, 11]; clear them so test corridors are clean.
  state.combat!.obstacles = [];
  const corners = [3, 7, 15, 19, 16, 12];
  let cornerIndex = 0;
  for (const unit of Object.values(state.combat!.units)) {
    if (unit.id === moverId) {
      continue;
    }
    unit.position = corners[cornerIndex];
    cornerIndex += 1;
  }
  const mover = state.combat!.units[moverId];
  mover.position = start;
  mover.activatedThisRound = false;
  mover.movedThisActivation = false;
  state.combat!.activeUnitId = moverId;
  state.activePlayerId = mover.controllerId;
}

function moveTo(state: GameState, unitId: UnitId, destination: number): GameState {
  const unit = state.combat!.units[unitId];
  return applyOk(state, { type: "MOVE_UNIT", playerId: unit.controllerId, unitId, destination });
}

// ---------------------------------------------------------------------------
// Force Field — a blocking Obstacle for a Power-scaled span.
// ---------------------------------------------------------------------------

describe("Force Field spell", () => {
  it("places a force_field token on the chosen empty space", () => {
    const result = castSpaceSpell("ff-place", "spell.force_field", 9, 0);
    const tokens = result.combat!.battlefieldTokens ?? [];
    const field = tokens.find((token) => token.position === 9);
    expect(field, "a token should sit on space 9").toBeTruthy();
    expect(field!.kind).toBe("force_field");
    expect(field!.controllerId).toBe("p1");
  });

  it("blocks a ground unit's movement (it cannot stop on or path through it)", () => {
    const state = createInitialGameState("ff-block");
    soloMover(state, "unit_p1_crusaders", 0);
    injectToken(state, { kind: "force_field", position: 1, controllerId: "p1" });
    const destinations = getLegalMoveDestinations(state.combat!, state.combat!.units.unit_p1_crusaders, state);
    // Cannot stop ON the field (1); and since 0->2 only goes through 1, 2 is unreachable too.
    expect(destinations).not.toContain(1);
    expect(destinations).not.toContain(2);
    // The open square straight down (4) is still reachable.
    expect(destinations).toContain(4);
  });

  it("does not block a flying unit — it passes over the obstacle", () => {
    const state = createInitialGameState("ff-fly");
    soloMover(state, "unit_p1_griffins", 0);
    injectToken(state, { kind: "force_field", position: 1, controllerId: "p1" });
    const destinations = getLegalMoveDestinations(state.combat!, state.combat!.units.unit_p1_griffins, state);
    // A flyer cannot LAND on the obstacle (1) but may fly over it to reach 2.
    expect(destinations).not.toContain(1);
    expect(destinations).toContain(2);
  });

  it("Power 0 lasts only this Combat round; Power 2 lasts the whole Combat", () => {
    const shortField = castSpaceSpell("ff-short", "spell.force_field", 9, 0);
    expect(shortField.combat!.battlefieldTokens?.some((token) => token.position === 9)).toBe(true);
    shortField.combat!.activeUnitId = null;
    const afterRoundShort = applyOk(shortField, { type: "END_COMBAT_ROUND", playerId: "p1" });
    expect(afterRoundShort.combat!.battlefieldTokens?.some((token) => token.position === 9)).toBe(false);

    const longField = castSpaceSpell("ff-long", "spell.force_field", 9, 2);
    longField.combat!.activeUnitId = null;
    const afterRoundLong = applyOk(longField, { type: "END_COMBAT_ROUND", playerId: "p1" });
    expect(afterRoundLong.combat!.battlefieldTokens?.some((token) => token.position === 9)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Fire Wall — an Effect Obstacle that burns stoppers and ground/ranged crossers.
// ---------------------------------------------------------------------------

describe("Fire Wall spell", () => {
  it("places a fire_wall token whose damage scales with Power (0/2/4 -> 1/2/3)", () => {
    const one = castSpaceSpell("fw-1", "spell.fire_wall", 9, 0).combat!.battlefieldTokens!.find((t) => t.position === 9);
    const two = castSpaceSpell("fw-2", "spell.fire_wall", 9, 2).combat!.battlefieldTokens!.find((t) => t.position === 9);
    const three = castSpaceSpell("fw-3", "spell.fire_wall", 9, 4).combat!.battlefieldTokens!.find((t) => t.position === 9);
    expect(one?.kind).toBe("fire_wall");
    expect(one?.damage).toBe(1);
    expect(two?.damage).toBe(2);
    expect(three?.damage).toBe(3);
  });

  it("burns a ground unit PASSING THROUGH the wall (it does not block movement)", () => {
    const state = createInitialGameState("fw-through");
    soloMover(state, "unit_p1_crusaders", 0);
    state.combat!.units.unit_p1_crusaders.maxHealth = 40;
    injectToken(state, { kind: "fire_wall", position: 1, controllerId: "p2", damage: 2 });
    // 0 -> 2 is reachable (the wall does not block) and forces the unit through 1.
    const moved = moveTo(state, "unit_p1_crusaders", 2);
    expect(moved.combat!.units.unit_p1_crusaders.position).toBe(2);
    expect(moved.combat!.units.unit_p1_crusaders.damage).toBe(2);
    // The wall is a lasting obstacle: passing through does not consume it.
    expect((moved.combat!.battlefieldTokens ?? []).filter((token) => token.kind === "fire_wall")).toHaveLength(1);
  });

  it("burns a ground unit STOPPING on the wall", () => {
    const state = createInitialGameState("fw-stop");
    soloMover(state, "unit_p1_crusaders", 0);
    state.combat!.units.unit_p1_crusaders.maxHealth = 40;
    injectToken(state, { kind: "fire_wall", position: 1, controllerId: "p2", damage: 3 });
    const moved = moveTo(state, "unit_p1_crusaders", 1);
    expect(moved.combat!.units.unit_p1_crusaders.position).toBe(1);
    expect(moved.combat!.units.unit_p1_crusaders.damage).toBe(3);
    // Stopping on the wall does not consume it either — it stays for the combat.
    expect((moved.combat!.battlefieldTokens ?? []).filter((token) => token.kind === "fire_wall")).toHaveLength(1);
  });

  it("burns a RANGED unit that stops on the wall (ranged burns like ground)", () => {
    // A ranged unit's Combat move range is 1, so it only ever STOPS on a wall
    // (never crosses it to a farther cell) — and stopping burns it, since it is
    // non-flying.
    const stop = createInitialGameState("fw-ranged-stop");
    soloMover(stop, "unit_p1_marksmen", 0);
    stop.combat!.units.unit_p1_marksmen.maxHealth = 40;
    injectToken(stop, { kind: "fire_wall", position: 1, controllerId: "p2", damage: 2 });
    const landed = moveTo(stop, "unit_p1_marksmen", 1);
    expect(landed.combat!.units.unit_p1_marksmen.position).toBe(1);
    expect(landed.combat!.units.unit_p1_marksmen.damage).toBe(2);
  });

  it("does NOT burn a flying unit CROSSING the wall, but DOES when it STOPS on it", () => {
    const overState = createInitialGameState("fw-fly-over");
    soloMover(overState, "unit_p1_griffins", 0);
    overState.combat!.units.unit_p1_griffins.maxHealth = 40;
    injectToken(overState, { kind: "fire_wall", position: 1, controllerId: "p2", damage: 2 });
    const flewOver = moveTo(overState, "unit_p1_griffins", 2);
    expect(flewOver.combat!.units.unit_p1_griffins.position).toBe(2);
    // Flying OVER the wall (mid-move) is unharmed.
    expect(flewOver.combat!.units.unit_p1_griffins.damage).toBe(0);

    // But a flyer that LANDS (stops) on the wall IS burned.
    const stopState = createInitialGameState("fw-fly-stop");
    soloMover(stopState, "unit_p1_griffins", 0);
    stopState.combat!.units.unit_p1_griffins.maxHealth = 40;
    injectToken(stopState, { kind: "fire_wall", position: 1, controllerId: "p2", damage: 2 });
    const landedOn = moveTo(stopState, "unit_p1_griffins", 1);
    expect(landedOn.combat!.units.unit_p1_griffins.position).toBe(1);
    expect(landedOn.combat!.units.unit_p1_griffins.damage).toBe(2);
  });

  it("burns ANY unit — a flyer included — that BEGINS its activation standing on the wall", () => {
    // Drive a real activation start: everyone has acted except a prior unit
    // (about to Defend) and the flying griffins (standing on the wall). When the
    // griffins activates, the wall bites even though it is a flyer.
    const state = createInitialGameState("fw-fly-activation");
    const combat = state.combat!;
    combat.units.unit_p1_griffins.position = 9;
    combat.units.unit_p1_griffins.maxHealth = 40;
    combat.units.unit_p1_griffins.damage = 0;
    for (const unit of Object.values(combat.units)) {
      unit.activatedThisRound = unit.id !== "unit_p1_crusaders" && unit.id !== "unit_p1_griffins";
    }
    combat.activeUnitId = "unit_p1_crusaders";
    state.activePlayerId = "p1";
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    injectToken(state, { kind: "fire_wall", position: 9, controllerId: "p2", damage: 2 });

    const after = passAllReactions(
      applyOk(state, { type: "DEFEND_UNIT", playerId: "p1", unitId: "unit_p1_crusaders" })
    );
    expect(after.combat!.activeUnitId).toBe("unit_p1_griffins");
    expect(after.combat!.units.unit_p1_griffins.damage).toBe(2);
    expect(
      after.eventLog.some(
        (event) =>
          event.type === "BATTLEFIELD_TOKEN_TRIGGERED" &&
          event.kind === "fire_wall" &&
          event.unitId === "unit_p1_griffins" &&
          event.outcome === "damage"
      )
    ).toBe(true);
    // Still not consumed by the burn.
    expect((after.combat!.battlefieldTokens ?? []).filter((token) => token.kind === "fire_wall")).toHaveLength(1);
  });

  it("a ground unit dodges a visible Fire Wall when an equally short clean route exists", () => {
    const state = createInitialGameState("fw-dodge");
    soloMover(state, "unit_p1_crusaders", 4);
    state.combat!.units.unit_p1_crusaders.maxHealth = 40;
    // 4 -> 9 has two length-2 routes: via 5 (the wall) or via 8 (clean). The unit
    // should take the clean one and arrive unharmed.
    injectToken(state, { kind: "fire_wall", position: 5, controllerId: "p2", damage: 3 });
    const moved = moveTo(state, "unit_p1_crusaders", 9);
    expect(moved.combat!.units.unit_p1_crusaders.position).toBe(9);
    expect(moved.combat!.units.unit_p1_crusaders.damage).toBe(0);
  });

  it("stays for its duration even when a unit steps on it — it can burn a later unit too", () => {
    const state = createInitialGameState("fw-lasting");
    soloMover(state, "unit_p1_crusaders", 0);
    state.combat!.units.unit_p1_crusaders.maxHealth = 40;
    injectToken(state, { kind: "fire_wall", position: 1, controllerId: "p2", damage: 3 });
    // First unit passes through the wall and is burned.
    const first = moveTo(state, "unit_p1_crusaders", 2);
    expect(first.combat!.units.unit_p1_crusaders.damage).toBe(3);
    expect((first.combat!.battlefieldTokens ?? []).filter((token) => token.kind === "fire_wall")).toHaveLength(1);

    // The wall still stands: a second (ground/ranged) unit stopping on it is
    // burned just the same (soloMover re-parks the others but leaves the
    // battlefield tokens in place).
    soloMover(first, "unit_p1_marksmen", 0);
    first.combat!.units.unit_p1_marksmen.maxHealth = 40;
    const second = moveTo(first, "unit_p1_marksmen", 1);
    expect(second.combat!.units.unit_p1_marksmen.position).toBe(1);
    expect(second.combat!.units.unit_p1_marksmen.damage).toBe(3);
    expect((second.combat!.battlefieldTokens ?? []).filter((token) => token.kind === "fire_wall")).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Quicksand — an armed trap halts movement AND activation.
// ---------------------------------------------------------------------------

describe("Quicksand spell", () => {
  it("places half-armed face-down tokens, count scaling with Power (0/1/2 -> 2/4/6)", () => {
    const result = castNoTargetSpell("qs-count", "spell.quicksand", 2);
    // No token is dropped by the cast itself: the picker is open for the WHOLE
    // set, and every token (including the first) is placed through it.
    expect((result.combat!.battlefieldTokens ?? []).filter((token) => token.kind === "quicksand")).toHaveLength(0);
    expect(result.pendingChoice?.type).toBe("OPTION_CHOICE");
    expect(result.pendingChoice && result.pendingChoice.type === "OPTION_CHOICE" ? result.pendingChoice.placeTokens?.placedCount : -1).toBe(0);
    expect(result.pendingChoice && result.pendingChoice.type === "OPTION_CHOICE" ? result.pendingChoice.placeTokens?.remaining : -1).toBe(6);

    let current = result;
    let safety = 12;
    while (current.pendingChoice?.type === "OPTION_CHOICE" && current.pendingChoice.context === "place-battlefield-tokens" && safety > 0) {
      safety -= 1;
      // Always take the first concrete space option (index 0) until the set is down.
      current = applyOk(current, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: current.pendingChoice.id, optionIndex: 0 });
    }
    const tokens = (current.combat!.battlefieldTokens ?? []).filter((token) => token.kind === "quicksand");
    expect(tokens).toHaveLength(6);
    expect(tokens.filter((token) => token.armed === true)).toHaveLength(3);
    expect(tokens.filter((token) => token.armed === false)).toHaveLength(3);
  });

  it("an armed Quicksand ends the entering unit's movement AND activation", () => {
    const state = createInitialGameState("qs-stop");
    soloMover(state, "unit_p1_crusaders", 0);
    injectToken(state, { kind: "quicksand", position: 1, controllerId: "p2", armed: true });
    const moved = moveTo(state, "unit_p1_crusaders", 2);
    // The unit is sucked in at 1, never reaching 2, and is done for the round.
    expect(moved.combat!.units.unit_p1_crusaders.position).toBe(1);
    expect(moved.combat!.units.unit_p1_crusaders.activatedThisRound).toBe(true);
    // The sprung trap is removed from the board (it is spent).
    expect(moved.combat!.battlefieldTokens ?? []).toHaveLength(0);
  });

  it("a decoy Quicksand lets the unit pass through and reach its destination", () => {
    const state = createInitialGameState("qs-decoy");
    soloMover(state, "unit_p1_crusaders", 0);
    injectToken(state, { kind: "quicksand", position: 1, controllerId: "p2", armed: false });
    const moved = moveTo(state, "unit_p1_crusaders", 2);
    expect(moved.combat!.units.unit_p1_crusaders.position).toBe(2);
    // A ground unit that finished a plain move stays active to attack/hold.
    expect(moved.combat!.units.unit_p1_crusaders.activatedThisRound).toBe(false);
    // Stepping on even a decoy clears it off the board.
    expect(moved.combat!.battlefieldTokens ?? []).toHaveLength(0);
  });

  it("hides the armed/decoy flag of an enemy face-down trap from the opponent's view", () => {
    const state = createInitialGameState("qs-hidden");
    injectToken(state, { kind: "quicksand", position: 9, controllerId: "p1", armed: true });
    const ownerView = getPlayerView(state, "p1");
    const enemyView = getPlayerView(state, "p2");
    expect(ownerView.combat!.battlefieldTokens![0].armed).toBe(true);
    // The opponent sees the token (and its kind/position) but not whether it is armed.
    expect(enemyView.combat!.battlefieldTokens![0].position).toBe(9);
    expect(enemyView.combat!.battlefieldTokens![0].kind).toBe("quicksand");
    expect(enemyView.combat!.battlefieldTokens![0].armed).toBeUndefined();
  });

  it("removes a sprung trap from the board entirely (in both players' views)", () => {
    const state = createInitialGameState("qs-sprung");
    soloMover(state, "unit_p1_crusaders", 0);
    injectToken(state, { kind: "quicksand", position: 1, controllerId: "p2", armed: true });
    const moved = moveTo(state, "unit_p1_crusaders", 2);
    expect(moved.combat!.battlefieldTokens ?? []).toHaveLength(0);
    // Neither the caster nor the opponent sees a lingering token after it sprang.
    expect(getPlayerView(moved, "p1").combat!.battlefieldTokens ?? []).toHaveLength(0);
    expect(getPlayerView(moved, "p2").combat!.battlefieldTokens ?? []).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Land Mine — an armed trap deals 2 damage, then the unit continues.
// ---------------------------------------------------------------------------

describe("Land Mine spell", () => {
  it("places half-armed tokens carrying 2 damage, count scaling with Power", () => {
    const result = castNoTargetSpell("lm-count", "spell.land_mine", 1);
    // The cast places nothing on its own — the whole set goes through the picker.
    expect((result.combat!.battlefieldTokens ?? []).filter((token) => token.kind === "land_mine")).toHaveLength(0);
    let current = result;
    let safety = 12;
    while (current.pendingChoice?.type === "OPTION_CHOICE" && current.pendingChoice.context === "place-battlefield-tokens" && safety > 0) {
      safety -= 1;
      current = applyOk(current, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: current.pendingChoice.id, optionIndex: 0 });
    }
    const tokens = (current.combat!.battlefieldTokens ?? []).filter((token) => token.kind === "land_mine");
    expect(tokens).toHaveLength(4);
    expect(tokens.filter((token) => token.armed === true)).toHaveLength(2);
    expect(tokens.every((token) => token.damage === 2)).toBe(true);
  });

  it("an armed Land Mine deals 2 damage and the unit then continues to its destination", () => {
    const state = createInitialGameState("lm-trigger");
    soloMover(state, "unit_p1_crusaders", 0);
    state.combat!.units.unit_p1_crusaders.maxHealth = 40;
    injectToken(state, { kind: "land_mine", position: 1, controllerId: "p2", armed: true, damage: 2 });
    const moved = moveTo(state, "unit_p1_crusaders", 2);
    // Unlike Quicksand, the mine does not stop movement — the unit reaches 2.
    expect(moved.combat!.units.unit_p1_crusaders.position).toBe(2);
    expect(moved.combat!.units.unit_p1_crusaders.damage).toBe(2);
    // The detonated mine is removed from the board.
    expect(moved.combat!.battlefieldTokens ?? []).toHaveLength(0);
  });

  it("a decoy Land Mine deals nothing and is cleared off the board", () => {
    const state = createInitialGameState("lm-decoy");
    soloMover(state, "unit_p1_crusaders", 0);
    state.combat!.units.unit_p1_crusaders.maxHealth = 40;
    injectToken(state, { kind: "land_mine", position: 1, controllerId: "p2", armed: false, damage: 2 });
    const moved = moveTo(state, "unit_p1_crusaders", 2);
    expect(moved.combat!.units.unit_p1_crusaders.position).toBe(2);
    expect(moved.combat!.units.unit_p1_crusaders.damage).toBe(0);
    expect(moved.combat!.battlefieldTokens ?? []).toHaveLength(0);
  });

  it("keeps the other face-down mines secret after one is sprung (only the caster knows)", () => {
    const state = createInitialGameState("lm-secret");
    soloMover(state, "unit_p1_crusaders", 0);
    state.combat!.units.unit_p1_crusaders.maxHealth = 40;
    // p2 lays an armed mine on the mover's path (1) and a decoy off to the side (9).
    injectToken(state, { kind: "land_mine", position: 1, controllerId: "p2", armed: true, damage: 2 });
    injectToken(state, { kind: "land_mine", position: 9, controllerId: "p2", armed: false, damage: 2 });
    const moved = moveTo(state, "unit_p1_crusaders", 2);
    // The sprung mine is gone; the untouched one remains face down.
    const tokens = moved.combat!.battlefieldTokens ?? [];
    expect(tokens).toHaveLength(1);
    expect(tokens[0].position).toBe(9);
    // The opponent (p1) cannot tell whether the survivor is real…
    expect(getPlayerView(moved, "p1").combat!.battlefieldTokens![0].armed).toBeUndefined();
    // …but the caster (p2) still knows it is a decoy.
    expect(getPlayerView(moved, "p2").combat!.battlefieldTokens![0].armed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Dispel — "Remove all ongoing effects from a space, or a unit and the space it
// occupies." A space-targeted Dispel lifts an obstacle (Fire Wall / Force Field)
// off that space; a unit-targeted Dispel also clears the space the unit stands on.
// ---------------------------------------------------------------------------

describe("Dispel clears battlefield obstacles", () => {
  function castDispelOnSpace(seed: string, token: Omit<BattlefieldTokenState, "id">): GameState {
    const state = createInitialGameState(seed);
    state.players.p1.hand = ["spell.dispel", "stat.power", "stat.power", "stat.power"];
    state.players.p2.hand = [];
    state.players.p1.permanents = [];
    state.activePlayerId = "p1";
    state.combat!.obstacles = [];
    state.combat!.activeUnitId = "unit_p1_crusaders";
    state.combat!.units.unit_p1_crusaders.activatedThisRound = false;
    injectToken(state, token);
    const cast = findSpaceCast(state, "p1", "spell.dispel", token.position);
    expect(cast, `Dispel should be castable on the ${token.kind} space`).toBeTruthy();
    return passAllReactions(applyOk(state, cast!.action));
  }

  it("a space-targeted Dispel removes a Fire Wall on that space", () => {
    const after = castDispelOnSpace("dispel-firewall", { kind: "fire_wall", position: 9, controllerId: "p2", damage: 3 });
    expect((after.combat!.battlefieldTokens ?? []).some((token) => token.position === 9)).toBe(false);
  });

  it("a space-targeted Dispel removes a Force Field on that space", () => {
    const after = castDispelOnSpace("dispel-forcefield", { kind: "force_field", position: 9, controllerId: "p2" });
    expect((after.combat!.battlefieldTokens ?? []).some((token) => token.position === 9)).toBe(false);
  });

  it("does not offer a Dispel space-target on a bare space with no token", () => {
    const state = createInitialGameState("dispel-empty");
    state.players.p1.hand = ["spell.dispel", "stat.power"];
    state.players.p1.permanents = [];
    state.activePlayerId = "p1";
    state.combat!.obstacles = [];
    state.combat!.activeUnitId = "unit_p1_crusaders";
    state.combat!.units.unit_p1_crusaders.activatedThisRound = false;
    // Space 9 holds no token, so Dispel offers no space-cast there.
    expect(findSpaceCast(state, "p1", "spell.dispel", 9)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Player-chosen movement path — the mover may dictate its exact route (e.g. to
// brave a Fire Wall on a shortcut, or detour around one) instead of always
// taking the engine's auto safe path. Illegal routes are rejected.
// ---------------------------------------------------------------------------

describe("Player-chosen movement path", () => {
  function moveAlong(state: GameState, unitId: UnitId, destination: number, path: number[]): GameState {
    const unit = state.combat!.units[unitId];
    return applyOk(state, { type: "MOVE_UNIT", playerId: unit.controllerId, unitId, destination, path });
  }
  function pathErrors(state: GameState, unitId: UnitId, destination: number, path: number[]): string[] {
    const unit = state.combat!.units[unitId];
    return applyAction(state, { type: "MOVE_UNIT", playerId: unit.controllerId, unitId, destination, path }).errors.map(
      (error) => error.message
    );
  }

  it("honours a route that braves a Fire Wall even though a clean route exists", () => {
    const state = createInitialGameState("path-cross");
    soloMover(state, "unit_p1_crusaders", 4);
    state.combat!.units.unit_p1_crusaders.maxHealth = 40;
    // 4 -> 9 has a clean length-2 route via 8; the wall sits on the other (via 5).
    injectToken(state, { kind: "fire_wall", position: 5, controllerId: "p2", damage: 3 });
    // The player deliberately routes THROUGH the wall (4 -> 5 -> 9).
    const moved = moveAlong(state, "unit_p1_crusaders", 9, [5, 9]);
    expect(moved.combat!.units.unit_p1_crusaders.position).toBe(9);
    expect(moved.combat!.units.unit_p1_crusaders.damage).toBe(3);
  });

  it("honours a clean detour route that avoids the wall (no damage)", () => {
    const state = createInitialGameState("path-detour");
    soloMover(state, "unit_p1_crusaders", 4);
    state.combat!.units.unit_p1_crusaders.maxHealth = 40;
    injectToken(state, { kind: "fire_wall", position: 5, controllerId: "p2", damage: 3 });
    const moved = moveAlong(state, "unit_p1_crusaders", 9, [8, 9]);
    expect(moved.combat!.units.unit_p1_crusaders.position).toBe(9);
    expect(moved.combat!.units.unit_p1_crusaders.damage).toBe(0);
  });

  it("rejects an illegal route (bad end, a non-adjacent jump, or through a Force Field)", () => {
    const state = createInitialGameState("path-illegal");
    soloMover(state, "unit_p1_crusaders", 4);
    // Ends somewhere other than the destination.
    expect(pathErrors(state, "unit_p1_crusaders", 9, [8]).length).toBeGreaterThan(0);
    // A non-adjacent jump (4 -> 9 directly is two spaces away).
    expect(pathErrors(state, "unit_p1_crusaders", 9, [9]).length).toBeGreaterThan(0);
    // A route that walks through a Force Field (a blocked space) at 5.
    injectToken(state, { kind: "force_field", position: 5, controllerId: "p2" });
    expect(pathErrors(state, "unit_p1_crusaders", 9, [5, 9]).length).toBeGreaterThan(0);
    // The unit never moved on any rejected attempt.
    expect(state.combat!.units.unit_p1_crusaders.position).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// Move-and-attack (the atomic Berserk approach) walks through tokens too — a
// berserked unit charging the nearest foe is bitten / halted on the way in.
// (Normal units move and attack as two separate actions, so their approach is
// the plain MOVE_UNIT covered above.)
// ---------------------------------------------------------------------------

describe("Move-and-attack through battlefield tokens", () => {
  function setup(seed: string): GameState {
    const state = createInitialGameState(seed);
    state.combat!.obstacles = [];
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    // Park every other unit far from the corridor so the defender at 6 is the
    // strictly nearest unit a Berserk charge must target.
    const corners = [11, 15, 16, 19];
    let cornerIndex = 0;
    for (const unit of Object.values(state.combat!.units)) {
      if (unit.id === "unit_p1_crusaders" || unit.id === "unit_p2_skeletons") {
        continue;
      }
      unit.position = corners[cornerIndex];
      cornerIndex += 1;
    }
    const attacker = state.combat!.units.unit_p1_crusaders;
    attacker.position = 0;
    attacker.activatedThisRound = false;
    attacker.movedThisActivation = false;
    attacker.attackedThisActivation = false;
    attacker.maxHealth = 40;
    attacker.attack = 6;
    attacker.abilities = [];
    const defender = state.combat!.units.unit_p2_skeletons;
    defender.position = 6; // r1c2, adjacent to the attack square (2)
    defender.maxHealth = 40;
    defender.defense = 0;
    defender.attack = 0; // no retaliation damage, so the wall bite is read cleanly
    defender.abilities = [];
    // Berserk the attacker so it MUST charge the nearest foe (MOVE_AND_ATTACK_UNIT).
    state.activeEffects.push(
      makeActiveEffect(
        state,
        {
          name: "Berserk",
          scope: "unit",
          duration: { type: "next-activation" },
          polarity: "negative",
          removable: true,
          modifiers: [{ type: "BERSERK_FORCED_ATTACK" }]
        },
        { type: "system" },
        "p2",
        { type: "unit", unitId: "unit_p1_crusaders" }
      )
    );
    state.combat!.activeUnitId = "unit_p1_crusaders";
    state.activePlayerId = "p1";
    state.combat!.dice.scriptedRolls = [0, 0, 0, 0, 0, 0];
    state.combat!.dice.rollCount = 0;
    return state;
  }

  /** The forced "move to 2 and attack the skeletons" action (its path runs through space 1). */
  function chargeThroughOne(state: GameState): GameState {
    const charge = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "MOVE_AND_ATTACK_UNIT" &&
        legal.action.destination === 2 &&
        legal.action.defenderId === "unit_p2_skeletons"
    );
    expect(charge, "a berserk move-and-attack onto space 2 should be offered").toBeTruthy();
    return passAllReactions(applyOk(state, charge!.action));
  }

  it("a Fire Wall on the approach burns the charging attacker, which still strikes home", () => {
    const state = setup("maa-wall");
    injectToken(state, { kind: "fire_wall", position: 1, controllerId: "p2", damage: 2 });
    const result = chargeThroughOne(state);
    expect(result.combat!.units.unit_p1_crusaders.position).toBe(2);
    expect(result.combat!.units.unit_p1_crusaders.damage).toBe(2); // wall pass-through
    expect(result.combat!.units.unit_p2_skeletons.damage).toBeGreaterThan(0); // attack landed
  });

  it("a Quicksand on the approach swallows the charging attacker — the attack never happens", () => {
    const state = setup("maa-quicksand");
    injectToken(state, { kind: "quicksand", position: 1, controllerId: "p2", armed: true });
    const result = chargeThroughOne(state);
    expect(result.combat!.units.unit_p1_crusaders.position).toBe(1); // stuck in the quicksand
    expect(result.combat!.units.unit_p1_crusaders.activatedThisRound).toBe(true);
    expect(result.combat!.units.unit_p2_skeletons.damage).toBe(0); // never reached the target
  });
});
