import { describe, expect, it } from "vitest";
import {
  applyAction,
  createAdventureGameState,
  getLegalActions,
  getMainHero,
  type GameAction,
  type GameState
} from "./index";
import { startNeutralEncounter } from "./adventure-reducer";
import { getPendingReactionPower } from "./legal-actions";

// ---------------------------------------------------------------------------
// "+Power, then draw a card" instants (Sorcery, Scales of the Greater
// Basilisk, Tunic of the Cyclops King) may be played on your OWN combat
// activation purely for the draw; while the active unit has not moved, the
// Power is BANKED onto the next spell you cast (`combatStats
// .pendingDrawRiderSpellPower`). That bank is same-activation intent.
//
// REPORTED BUG: casting Magic Arrow and paying exactly TWO +1 boosts into the
// open cast window (Sorcery basic, Scales' "+1 Power, draw 1" side) resolved at
// Power 3, not 2 — a phantom +1 with no source the player could see. Root
// cause: the bank was dropped only when a COMBAT ROUND ended
// (advanceCombatRound) or when a cast consumed it. A fight that ENDS in the
// round the Power was banked — the everyday one-round neutral fight — left the
// bank standing on the player, and it silently paid into the FIRST cast of a
// LATER battle. Fixed at the one seam every combat is born through
// (makeCombatShell), beside the other per-combat charges.
//
// Every case below asserts the OBSERVABLE cast outcome: the Power the spell
// actually resolves at (getPendingReactionPower — the same helper the Power
// meter, the damage preview and the Resistance gate read) and, where the
// printed ladder discriminates it, the damage the target really takes.
// Magic Arrow's ladder is Power 0 → 1, Power 1 → 2, Power 2+ → 3.
// ---------------------------------------------------------------------------

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toHaveLength(0);
  return result.state;
}

function newGame(seed: string): GameState {
  let state = createAdventureGameState({ seed, difficulty: "easy", rollFirstPlayer: false });
  if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
    state = apply(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
  }
  return state;
}

/** Walks p1's main hero into a fresh guarded field and finishes placement. */
function startFight(state: GameState, spaceId: string): GameState {
  const hero = getMainHero(state, "p1")!;
  hero.level = 1; // below the field difficulty, so no Quick Combat auto-win
  hero.spaceId = spaceId;
  state.adventure!.fields[spaceId] = {
    spaceId,
    tileInstanceId: "t",
    slot: 0,
    location: "empty_field",
    difficulty: 4,
    blackCube: false,
    flagOwnerId: null,
    everFlagged: false,
    settlementResource: null
  };
  startNeutralEncounter(state, hero, state.adventure!.fields[spaceId]);
  let next = state;
  for (let guard = 0; guard < 30; guard += 1) {
    const place = getLegalActions(next, "p1").find((entry) => entry.action.type === "PLACE_COMBAT_UNIT");
    if (!place) break;
    next = apply(next, place.action);
  }
  const finish = getLegalActions(next, "p1").find((entry) => entry.action.type === "FINISH_COMBAT_PLACEMENT");
  expect(finish, "the fight reached placement").toBeTruthy();
  next = apply(next, finish!.action);
  expect(next.combat, "a real neutral combat is running").toBeTruthy();
  return next;
}

/** Hands p1 a fresh, unmoved activation with `hand` in hand. */
function ownActivation(state: GameState, hand: string[], deck: string[] = ["stat.attack", "stat.defense"]): void {
  const combat = state.combat!;
  const unit = Object.values(combat.units).find((u) => u.controllerId === "p1" && u.damage < u.maxHealth)!;
  combat.activeUnitId = unit.id;
  unit.activatedThisRound = false;
  unit.attackedThisActivation = false;
  unit.movedThisActivation = false;
  state.phase = "combat";
  state.stack = [];
  state.reactionWindow = null;
  state.pendingChoice = null;
  state.players.p1.hand = [...hand];
  state.players.p1.deck = [...deck];
}

/** Plays a "+Power, then draw" instant draw-only on p1's own activation. */
function playDrawOnly(state: GameState, cardId: string): GameState {
  const play = getLegalActions(state, "p1")
    .map((entry) => entry.action)
    .find((action) => action.type === "PLAY_CARD" && action.cardId === cardId);
  expect(play, `${cardId} is offered draw-only on your own activation`).toBeTruthy();
  return apply(state, play!);
}

/**
 * Ends the running fight through normal play, RETREATING at the one-round
 * time limit so the fight never reaches combat round 2 (advanceCombatRound
 * clears the bank — retreating in round 1 is what makes the leak observable,
 * and it is the everyday shape of a neutral fight).
 */
function playOutCombat(state: GameState): GameState {
  let next = state;
  for (let guard = 0; next.combat && guard < 400; guard += 1) {
    const actions = getLegalActions(next, "p1");
    const step =
      actions.find((entry) => entry.action.type === "ACKNOWLEDGE_COMBAT_END") ??
      actions.find((entry) => entry.action.type === "RETREAT_FROM_COMBAT") ??
      actions.find((entry) => entry.action.type === "PASS_REACTION") ??
      actions.find((entry) => entry.action.type !== "CONTINUE_NEUTRAL_COMBAT");
    if (!step) break;
    next = apply(next, step.action);
  }
  expect(next.combat, "the first fight really ended").toBeFalsy();
  return next;
}

function liveEnemy(state: GameState) {
  return Object.values(state.combat!.units).find((u) => u.controllerId !== "p1" && u.damage < u.maxHealth)!;
}

function castMagicArrow(state: GameState, targetId: string): GameState {
  return apply(state, {
    type: "CAST_SPELL",
    playerId: "p1",
    cardId: "spell.magic_arrow",
    target: { type: "unit", unitId: targetId }
  });
}

function reaction(state: GameState, cardId: string, optionIndex?: number) {
  const found = getLegalActions(state, "p1").find(
    (entry) =>
      entry.action.type === "PLAY_REACTION" &&
      entry.action.cardId === cardId &&
      !entry.action.asPowerBoost &&
      !entry.action.drawOnly &&
      (optionIndex === undefined || entry.action.optionIndex === optionIndex)
  );
  expect(found, `${cardId}${optionIndex === undefined ? "" : ` option ${optionIndex}`} is offered into the cast`).toBeTruthy();
  return found!.action;
}

/**
 * The Power the cast resolves at — the live meter's own number while its
 * window is open, else the Power the engine actually resolved it at
 * (SPELL_CAST_RESOLVED, which drives the printed damage ladder).
 */
function castPower(state: GameState): number {
  const pending = getPendingReactionPower(state);
  if (pending?.kind === "spell") {
    return pending.totalPower;
  }
  const resolved = [...state.eventLog].reverse().find((event) => event.type === "SPELL_CAST_RESOLVED");
  expect(resolved, "the cast either waits in a window or has resolved").toBeTruthy();
  return resolved && resolved.type === "SPELL_CAST_RESOLVED" ? resolved.power : -1;
}

/** Closes any open window and returns the damage the target ended up taking. */
function resolveAndReadDamage(state: GameState, targetId: string): { state: GameState; damage: number } {
  let next = state;
  for (let guard = 0; next.reactionWindow && guard < 20; guard += 1) {
    next = apply(next, { type: "PASS_REACTION", playerId: next.reactionWindow.priorityPlayerId });
  }
  return { state: next, damage: next.combat!.units[targetId].damage };
}

describe("A draw-rider Power bank never leaks out of the fight it was banked in", () => {
  it("REPRO: a Sorcery banked in an EARLIER fight adds a phantom +1 to the next fight's cast", () => {
    let state = newGame("bank-leak-repro");

    // Fight 1: play Sorcery purely for the draw (the unit has not moved) — the
    // printed bank for "the next spell you cast". No spell is cast, and the
    // fight ends in the same combat round.
    state = startFight(state, "fight-1");
    ownActivation(state, ["ability.sorcery"]);
    state = playDrawOnly(state, "ability.sorcery");
    expect(state.players.p1.combatStats.pendingDrawRiderSpellPower).toBe(1);
    state = playOutCombat(state);

    // Fight 2: the reported window — Magic Arrow plus EXACTLY two +1 boosts.
    state = startFight(state, "fight-2");
    ownActivation(state, [
      "spell.magic_arrow",
      "ability.sorcery",
      "artifact.scales_of_the_greater_basilisk"
    ]);
    const target = liveEnemy(state);
    // The duplicate-aware physical Neutral deck changes the seeded guard. This
    // fixture measures carried spell Power, so remove unrelated innate spell
    // immunity/resistance/taxes from whichever guards were drawn.
    for (const unit of Object.values(state.combat!.units)) {
      if (unit.controllerId !== "p1") unit.abilities = [];
    }
    target.unitDefId = "neutral.skeletons";
    target.cardName = "Pack of Skeletons";
    state = castMagicArrow(state, target.id);
    expect(castPower(state), "the cast starts at the spell's printed Power").toBe(0);
    state = apply(state, reaction(state, "ability.sorcery"));
    state = apply(state, reaction(state, "artifact.scales_of_the_greater_basilisk", 1));

    // Two +1 cards paid ⇒ Power 2. Pre-fix the stale bank made it 3 and the
    // client popped "Magic Arrow tops out at Power 2. You have 3".
    const settled = resolveAndReadDamage(state, target.id);
    expect(castPower(settled.state)).toBe(2);
    expect(settled.damage).toBe(3);
  });

  it("REPRO (damage-discriminating): a stale bank + ONE +1 boost deals 2 damage, not 3", () => {
    let state = newGame("bank-leak-damage");
    state = startFight(state, "fight-1");
    ownActivation(state, ["ability.sorcery"]);
    state = playDrawOnly(state, "ability.sorcery");
    state = playOutCombat(state);

    state = startFight(state, "fight-2");
    ownActivation(state, ["spell.magic_arrow", "artifact.scales_of_the_greater_basilisk"]);
    const target = liveEnemy(state);
    state = castMagicArrow(state, target.id);
    state = apply(state, reaction(state, "artifact.scales_of_the_greater_basilisk", 1));

    // Magic Arrow: Power 1 → 2 damage. The phantom bank made it Power 2 → 3.
    const settled = resolveAndReadDamage(state, target.id);
    expect(castPower(settled.state)).toBe(1);
    expect(settled.damage).toBe(2);
  });

  it("CONTROL: the bank still pays into a cast made in the SAME fight", () => {
    let state = newGame("bank-same-fight");
    state = startFight(state, "fight-1");
    ownActivation(state, ["ability.sorcery", "spell.magic_arrow"]);
    state = playDrawOnly(state, "ability.sorcery");
    expect(state.players.p1.combatStats.pendingDrawRiderSpellPower).toBe(1);

    const target = liveEnemy(state);
    state = castMagicArrow(state, target.id);
    expect(state.players.p1.combatStats.pendingDrawRiderSpellPower ?? 0).toBe(0);
    // Power 0 arrow + the banked 1 → 2 damage instead of the bare 1.
    const settled = resolveAndReadDamage(state, target.id);
    expect(castPower(settled.state)).toBe(1);
    expect(settled.damage).toBe(2);
  });

  it("CONTROL: with no Sorcery banked, the same cast deals the bare Power-0 damage", () => {
    let state = newGame("bank-same-fight");
    state = startFight(state, "fight-1");
    ownActivation(state, ["spell.magic_arrow"]);
    const target = liveEnemy(state);
    state = castMagicArrow(state, target.id);
    const settled = resolveAndReadDamage(state, target.id);
    expect(castPower(settled.state)).toBe(0);
    expect(settled.damage).toBe(1);
  });

  it("every fresh combat starts with no banked draw-rider Power for either side", () => {
    let state = newGame("bank-cleared-at-start");
    state = startFight(state, "fight-1");
    ownActivation(state, ["ability.sorcery"]);
    state = playDrawOnly(state, "ability.sorcery");
    state = playOutCombat(state);

    state = startFight(state, "fight-2");
    for (const player of Object.values(state.players)) {
      expect(player.combatStats.pendingDrawRiderSpellPower ?? 0).toBe(0);
    }
  });

  it("CONTROL: the MAP bank is a separate pool — kept across a combat start, never spent by a combat cast", () => {
    let state = newGame("map-bank-untouched");
    state.players.p1.mapSpellPowerBank = 1;
    state = startFight(state, "fight-1");
    // Deliberately kept (a map bank expires when a hero moves, not on a fight).
    expect(state.players.p1.mapSpellPowerBank).toBe(1);

    // …and it is invisible to a COMBAT cast: the arrow still resolves at the
    // printed Power 0, and the map bank is still standing afterwards.
    ownActivation(state, ["spell.magic_arrow"]);
    const target = liveEnemy(state);
    state = castMagicArrow(state, target.id);
    const settled = resolveAndReadDamage(state, target.id);
    expect(castPower(settled.state)).toBe(0);
    expect(settled.state.players.p1.mapSpellPowerBank).toBe(1);
  });
});

describe("Each in-window Power source adds exactly its printed Power, once", () => {
  function windowWith(cards: string[]): { state: GameState; targetId: string } {
    let state = newGame("in-window-power");
    state = startFight(state, "fight-1");
    ownActivation(state, ["spell.magic_arrow", ...cards]);
    const target = liveEnemy(state);
    state = castMagicArrow(state, target.id);
    return { state, targetId: target.id };
  }

  it("Sorcery (basic) alone → Power 1 → 2 damage", () => {
    const { state, targetId } = windowWith(["ability.sorcery"]);
    const settled = resolveAndReadDamage(apply(state, reaction(state, "ability.sorcery")), targetId);
    expect(castPower(settled.state)).toBe(1);
    expect(settled.damage).toBe(2);
  });

  it('Scales\' "+1 Power, draw 1" side alone → Power 1 → 2 damage', () => {
    const { state, targetId } = windowWith(["artifact.scales_of_the_greater_basilisk"]);
    const played = apply(state, reaction(state, "artifact.scales_of_the_greater_basilisk", 1));
    const settled = resolveAndReadDamage(played, targetId);
    expect(castPower(settled.state)).toBe(1);
    expect(settled.damage).toBe(2);
  });

  it('Scales\' flat "+3 Power" side alone → Power 3, never 3+1', () => {
    const { state, targetId } = windowWith(["artifact.scales_of_the_greater_basilisk"]);
    const played = apply(state, reaction(state, "artifact.scales_of_the_greater_basilisk", 0));
    const settled = resolveAndReadDamage(played, targetId);
    expect(castPower(settled.state)).toBe(3);
  });

  it('a Spell discarded for the universal "+1 Power" adds 1, not its printed side too', () => {
    const { state, targetId } = windowWith(["spell.bless"]);
    const boost = getLegalActions(state, "p1").find(
      (entry) => entry.action.type === "PLAY_REACTION" && entry.action.asPowerBoost === true
    );
    expect(boost, "the universal +1 Power discard is offered into a cast").toBeTruthy();
    const settled = resolveAndReadDamage(apply(state, boost!.action), targetId);
    expect(castPower(settled.state)).toBe(1);
    expect(settled.damage).toBe(2);
  });

  it("two +1 boosts in a fresh fight are exactly Power 2 (the reported window, no stale bank)", () => {
    const { state, targetId } = windowWith([
      "ability.sorcery",
      "artifact.scales_of_the_greater_basilisk"
    ]);
    let next = apply(state, reaction(state, "ability.sorcery"));
    next = apply(next, reaction(next, "artifact.scales_of_the_greater_basilisk", 1));
    const settled = resolveAndReadDamage(next, targetId);
    expect(castPower(settled.state)).toBe(2);
    expect(settled.damage).toBe(3);
  });
});
