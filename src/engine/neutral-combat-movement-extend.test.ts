import { describe, expect, it } from "vitest";
import {
  applyAction,
  createAdventureGameState,
  createInitialGameState,
  getLegalActions,
  getMainHero,
  type GameAction,
  type GameState
} from "./index";
import { placeCreatureBank } from "./adventure";
import { startNeutralEncounter } from "./adventure-reducer";

/**
 * BINH house rule (engine-enforced; every test here fails if its wiring is
 * removed): a hero's "+Movement" card — Boots of Speed, the Logistics ability's
 * expert side, Dessa's Logistics IV/VI, … — is normally map-only, but may be
 * spent DURING a neutral combat's continue-or-retreat window to top up the
 * movement pool. So a hero who has run out of movement can gain some and buy
 * another combat round (spend 1 on CONTINUE_NEUTRAL_COMBAT) instead of being
 * forced to retreat. The movement is optional: the player chooses to use it or
 * not at the end of each round.
 */

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toHaveLength(0);
  return result.state;
}

/**
 * Drives a Crypt Creature-Bank fight (a neutral combat) to the end of round 1,
 * where the neutral one-round time limit pauses on `awaitingContinue`. Nobody
 * can deal damage (every attack rolls "-1" and every unit's Attack is zeroed),
 * so the round runs out with all units alive.
 */
function driveToAwaitingContinue(seed: string, freeExtend = false): GameState {
  let state = createAdventureGameState({
    seed,
    difficulty: "easy",
    rollFirstPlayer: false,
    houseRules: { "free-neutral-combat-extend": freeExtend }
  });
  state =
    state.players.p1.needsHandRefresh || state.players.p1.canMulligan
      ? apply(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] })
      : state;

  const hero = getMainHero(state, "p1")!;
  hero.level = 7;
  hero.spaceId = "bank-field";
  state.adventure!.fields["bank-field"] = {
    spaceId: "bank-field",
    tileInstanceId: "t",
    slot: 0,
    location: "blocked_field",
    blackCube: false,
    flagOwnerId: null,
    everFlagged: false,
    settlementResource: null
  };
  placeCreatureBank(state, "bank-field", "crypt");

  startNeutralEncounter(state, hero, state.adventure!.fields["bank-field"]);
  const place = getLegalActions(state, "p1").find((entry) => entry.action.type === "PLACE_COMBAT_UNIT");
  state = apply(state, place!.action);
  state = apply(state, { type: "FINISH_COMBAT_PLACEMENT", playerId: "p1" });

  state.combat!.dice.scriptedRolls = Array(60).fill(-1);
  for (const unit of Object.values(state.combat!.units)) {
    unit.attack = 0;
  }

  let safety = 100;
  while (state.combat && !state.combat.awaitingContinue && !state.combat.outcome && safety > 0) {
    safety -= 1;
    const actions = getLegalActions(state, "p1");
    const next =
      actions.find((legal) => legal.action.type === "DEFEND_UNIT") ??
      actions.find((legal) => legal.action.type === "PASS_REACTION") ??
      actions.find((legal) => legal.action.type === "CHOOSE_PENDING_ROLL") ??
      actions[0];
    if (!next) break;
    state = apply(state, next.action);
  }

  return state;
}

describe("neutral combat: a +Movement card extends the fight when out of movement", () => {
  it("free-neutral-combat-extend offers and resolves another round at 0 movement", () => {
    let state = driveToAwaitingContinue("move-extend-free", true);
    const hero = getMainHero(state, "p1")!;
    hero.movementPoints = 0;

    const cont = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "CONTINUE_NEUTRAL_COMBAT"
    );
    expect(cont?.label).toContain("no movement cost");
    state = apply(state, cont!.action);

    expect(hero.movementPoints).toBe(0);
    expect(state.combat?.awaitingContinue ?? false).toBe(false);
  });

  it("an out-of-move hero plays Boots of Speed to gain movement and buy another round", () => {
    let state = driveToAwaitingContinue("move-extend-boots");
    expect(state.combat?.awaitingContinue).toBe(true);

    // Out of movement: the plain "spend 1 MP" continue is impossible.
    getMainHero(state, "p1")!.movementPoints = 0;
    state.players.p1.hand = ["artifact.boots_of_speed"];

    let actions = getLegalActions(state, "p1");
    expect(
      actions.some((legal) => legal.action.type === "CONTINUE_NEUTRAL_COMBAT"),
      "with 0 MP the plain continue is not offered"
    ).toBe(false);
    const topUp = actions.find(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "artifact.boots_of_speed"
    );
    expect(topUp, "the map-only Boots of Speed IS offered in the continue window").toBeTruthy();

    state = apply(state, topUp!.action);

    // The movement pool rose by 1, the continue window stayed open, priority
    // stayed with the deciding hero, and the card went to the discard.
    expect(getMainHero(state, "p1")!.movementPoints).toBe(1);
    expect(state.combat?.awaitingContinue).toBe(true);
    expect(state.priorityPlayerId).toBe("p1");
    expect(state.players.p1.discard).toContain("artifact.boots_of_speed");

    // The hero now spends that fresh movement to fight on.
    actions = getLegalActions(state, "p1");
    const cont = actions.find((legal) => legal.action.type === "CONTINUE_NEUTRAL_COMBAT");
    expect(cont, "spending the gained movement to continue is now offered").toBeTruthy();
    state = apply(state, cont!.action);

    expect(state.combat?.awaitingContinue ?? false).toBe(false);
    expect(getMainHero(state, "p1")!.movementPoints).toBe(0);
    expect(state.combat?.outcome ?? null).toBeNull();
  });

  it("the top-up is OPTIONAL — the hero may still retreat instead of spending the card", () => {
    let state = driveToAwaitingContinue("move-extend-optional");
    getMainHero(state, "p1")!.movementPoints = 0;
    state.players.p1.hand = ["artifact.boots_of_speed"];

    const actions = getLegalActions(state, "p1");
    // Both choices are live at the end of the round: use the card, or retreat.
    expect(
      actions.some((legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "artifact.boots_of_speed")
    ).toBe(true);
    expect(actions.some((legal) => legal.action.type === "RETREAT_FROM_COMBAT")).toBe(true);

    // Retreating leaves the card unspent (the player chose not to use it).
    state = apply(state, { type: "RETREAT_FROM_COMBAT", playerId: "p1" });
    expect(state.players.p1.hand).toContain("artifact.boots_of_speed");
    expect(state.players.p1.discard).not.toContain("artifact.boots_of_speed");
  });

  it("Equestrian's Gloves — its +movement side (option 1) also tops up the pool to buy a round", () => {
    let state = driveToAwaitingContinue("move-extend-gloves");
    expect(state.combat?.awaitingContinue).toBe(true);
    getMainHero(state, "p1")!.movementPoints = 0;
    // The Gloves are an "OR" card: +1 initiative (combat) OR +1 movement (map).
    // The movement side sits at option index 1 (Boots' is at index 0), so this
    // pins that heroMovementGrantOption finds it regardless of position.
    state.players.p1.hand = ["artifact.equestrians_gloves"];

    const topUp = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "artifact.equestrians_gloves"
    );
    expect(topUp, "the map-only Gloves +movement side IS offered in the continue window").toBeTruthy();
    // It is the movement side (option 1), not the initiative side (option 0).
    expect(topUp!.action.type === "PLAY_CARD" && topUp!.action.optionIndex).toBe(1);

    state = apply(state, topUp!.action);
    expect(getMainHero(state, "p1")!.movementPoints).toBe(1);
    expect(state.combat?.awaitingContinue).toBe(true);
    expect(state.players.p1.discard).toContain("artifact.equestrians_gloves");

    // The hero spends the fresh movement to fight on.
    const cont = getLegalActions(state, "p1").find((legal) => legal.action.type === "CONTINUE_NEUTRAL_COMBAT");
    expect(cont, "spending the gained movement to continue is now offered").toBeTruthy();
    state = apply(state, cont!.action);
    expect(getMainHero(state, "p1")!.movementPoints).toBe(0);
    expect(state.combat?.awaitingContinue ?? false).toBe(false);
  });

  it("the Logistics ability's EXPERT side (an expert-only +movement) also tops up the pool", () => {
    let state = driveToAwaitingContinue("move-extend-logistics");
    getMainHero(state, "p1")!.movementPoints = 0;
    state.players.p1.hand = ["ability.logistics"];

    // With no expert use (crown) available, the expert-only +movement side is
    // NOT offered — the gate mirrors the reducer so no offer ever rejects.
    state.players.p1.limits.expertUses = 0;
    state.players.p1.combatStats.expertUsesSpentThisRound = 0;
    expect(
      getLegalActions(state, "p1").some(
        (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "ability.logistics"
      )
    ).toBe(false);

    // Grant a crown: the expert +movement side is now offered (mode expert, its
    // option index) and applies its +1 movement.
    state.players.p1.limits.expertUses = 1;
    const offer = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "ability.logistics"
    );
    expect(offer, "the expert Logistics +movement is offered once a crown is available").toBeTruthy();
    expect(offer!.action.type === "PLAY_CARD" && offer!.action.mode).toBe("expert");

    state = apply(state, offer!.action);
    expect(getMainHero(state, "p1")!.movementPoints).toBe(1);
    expect(state.combat?.awaitingContinue).toBe(true);
  });

  it("CONTROL: the same map-only movement card is rejected during a normal (not continue) combat", () => {
    // A live sandbox combat that is NOT at the continue window: mapOnly holds,
    // so the +movement side of Boots of Speed cannot be played.
    const state = createInitialGameState("move-extend-control");
    state.players.p1.hand = ["artifact.boots_of_speed"];
    expect(state.combat).toBeTruthy();
    expect(state.combat?.awaitingContinue ?? false).toBe(false);

    const result = applyAction(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "artifact.boots_of_speed",
      optionIndex: 0,
      target: { type: "none" }
    } as GameAction);
    expect(result.errors.length, "map-only Boots is not playable in a normal combat window").toBeGreaterThan(0);
  });
});
