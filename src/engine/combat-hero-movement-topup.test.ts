import { describe, expect, it } from "vitest";
import {
  applyAction,
  createAdventureGameState,
  createInitialGameState,
  getLegalActions,
  getMainHero,
  type CardDefinition,
  type GameAction,
  type GameState,
  type LegalAction,
  type PlayerId
} from "./index";
import { placeCreatureBank } from "./adventure";
import { startNeutralEncounter } from "./adventure-reducer";
import { heroMovementTopUpHeroId } from "./effects";
import { chooseComputerAction } from "./computer/policy";
import { nextTurnTimeoutAction } from "./afk-drop";
import { cardLibrary } from "@/data/cards/library";
import type { PlayerVisibleState } from "./state";

/**
 * USER RULING (2026-08-11), verbatim: "Boots of speed - you shoold be able to
 * add '+1 movement' during the combat, Fix for all."
 *
 * THE GAP (reproduced before the fix, and the first test here is that repro):
 * every printed "+N movement" side in the game is `mapOnly`, and the engine had
 * exactly ONE waiver for it — the neutral combat's continue-or-retreat window
 * (`neutral-combat-movement-extend.test.ts`). So DURING the fight — on the
 * holder's own unit activation, and at every neutral pre-activation pause, both
 * of which already offer that same card's OTHER side — the movement side was
 * simply absent.
 *
 * THE RULE: one shared read, `heroMovementTopUpHeroId` (effects.ts), used by the
 * offer (`isOptionEffectPlayable` + the `mapOnly` skip in `addOptionPlays`), by
 * the resolution backstop (`playCard`'s map-only waiver) and by the grant itself
 * (which hero gains the points). Every test below fails if its wiring is
 * removed; each carries a CONTROL.
 */

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toHaveLength(0);
  return result.state;
}

/** A real neutral (Creature Bank) combat, freshly deployed, nobody has acted. */
function startNeutralFight(seed: string): GameState {
  let state = createAdventureGameState({ seed, difficulty: "easy", rollFirstPlayer: false });
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

  // Nobody can hurt anybody: the fight then runs its full round with every unit
  // alive, so the mid-fight windows below are reachable deterministically.
  state.combat!.dice.scriptedRolls = Array(200).fill(-1);
  for (const unit of Object.values(state.combat!.units)) {
    unit.attack = 0;
  }
  return state;
}

/** Steps the fight forward until p1's OWN unit activation is open (mid-combat). */
function driveToOwnActivation(state: GameState): GameState {
  let safety = 60;
  while (safety-- > 0) {
    const combat = state.combat;
    if (!combat || combat.outcome || combat.awaitingContinue) {
      break;
    }
    const active = combat.activeUnitId ? combat.units[combat.activeUnitId] : undefined;
    if (active && active.controllerId === "p1" && !active.activatedThisRound && !active.attackedThisActivation) {
      return state;
    }
    const actions = getLegalActions(state, "p1");
    const next =
      actions.find((legal) => legal.action.type === "CONTINUE_NEUTRAL_STEP") ??
      actions.find((legal) => legal.action.type === "PASS_REACTION") ??
      actions.find((legal) => legal.action.type === "RESOLVE_COMBAT_DISCARD") ??
      actions.find((legal) => legal.action.type === "CHOOSE_OPTION") ??
      actions[0];
    if (!next) break;
    state = apply(state, next.action);
  }
  return state;
}

/** Steps the fight forward until the continue-or-retreat window opens. */
function driveToAwaitingContinue(state: GameState): GameState {
  let safety = 120;
  while (safety-- > 0) {
    const combat = state.combat;
    if (!combat || combat.outcome || combat.awaitingContinue) {
      break;
    }
    const actions = getLegalActions(state, "p1");
    const next =
      actions.find((legal) => legal.action.type === "END_ACTIVATION") ??
      actions.find((legal) => legal.action.type === "DEFEND_UNIT") ??
      actions.find((legal) => legal.action.type === "CONTINUE_NEUTRAL_STEP") ??
      actions.find((legal) => legal.action.type === "PASS_REACTION") ??
      actions.find((legal) => legal.action.type === "RESOLVE_COMBAT_DISCARD") ??
      actions.find((legal) => legal.action.type === "CHOOSE_OPTION") ??
      actions[0];
    if (!next) break;
    state = apply(state, next.action);
  }
  return state;
}

function movementOffers(state: GameState, cardId: string): LegalAction[] {
  return getLegalActions(state, "p1").filter(
    (legal) =>
      legal.action.type === "PLAY_CARD" &&
      legal.action.cardId === cardId &&
      typeof legal.label === "string" &&
      legal.label.toLowerCase().includes("movement")
  );
}

/**
 * Every implemented, hand-playable card face in the WHOLE library that grants
 * hero movement from a printed `mapOnly` side — derived, never a card-id list,
 * so a future movement card joins these tests automatically.
 */
function movementFacesInLibrary(): {
  cardId: string;
  card: CardDefinition;
  optionIndex: number;
  amount: number;
  expertOnly: boolean;
  requiresSeaTile: boolean;
  removeSelf: boolean;
}[] {
  const faces: ReturnType<typeof movementFacesInLibrary> = [];
  for (const card of Object.values(cardLibrary)) {
    if (card.implementationStatus !== "implemented" || card.kind === "spell") {
      continue;
    }
    if (card.effect.type !== "CHOOSE_ONE") {
      continue;
    }
    for (const [optionIndex, option] of card.effect.options.entries()) {
      if (option.effect.type !== "GAIN_HERO_MOVEMENT" || !option.mapOnly || option.trigger) {
        continue;
      }
      faces.push({
        cardId: card.id,
        card,
        optionIndex,
        amount: option.effect.amount,
        expertOnly: Boolean(option.expertOnly),
        requiresSeaTile: Boolean(option.requiresSeaTile),
        removeSelf: Boolean(option.cost?.removeSelf)
      });
    }
  }
  return faces;
}

describe("a +Movement card is playable DURING a neutral combat", () => {
  it("REPRO: Boots of Speed's '+1 movement' side is offered on the fighter's own activation, and that movement really buys another combat round", () => {
    let state = driveToOwnActivation(startNeutralFight("mid-fight-boots"));
    const active = state.combat!.units[state.combat!.activeUnitId!];
    expect(active.controllerId, "p1's own unit is activating — a real mid-fight card window").toBe("p1");
    expect(state.combat!.awaitingContinue ?? false, "this is NOT the continue-or-retreat window").toBe(false);

    // Out of movement: without a top-up this fight ends when the round does.
    getMainHero(state, "p1")!.movementPoints = 0;
    state.players.p1.hand = ["artifact.boots_of_speed"];

    const offers = movementOffers(state, "artifact.boots_of_speed");
    expect(offers, "the map-only '+1 movement' side IS offered mid-fight").toHaveLength(1);
    expect(offers[0]!.action.type === "PLAY_CARD" && offers[0]!.action.optionIndex).toBe(0);

    state = apply(state, offers[0]!.action);

    // The OBSERVABLE outcome: the fighting hero's pool rose by the printed 1,
    // the card is spent, and the fight is still running.
    expect(getMainHero(state, "p1")!.movementPoints).toBe(1);
    expect(state.players.p1.discard).toContain("artifact.boots_of_speed");
    expect(state.combat?.outcome ?? null).toBeNull();

    // …and that movement is what pays for the extra round at the round's end.
    state = driveToAwaitingContinue(state);
    expect(state.combat?.awaitingContinue).toBe(true);
    const cont = getLegalActions(state, "p1").find((legal) => legal.action.type === "CONTINUE_NEUTRAL_COMBAT");
    expect(cont, "the mid-fight top-up pays the continue").toBeTruthy();
    state = apply(state, cont!.action);
    expect(getMainHero(state, "p1")!.movementPoints).toBe(0);
    expect(state.combat?.awaitingContinue ?? false).toBe(false);
    expect(state.combat?.round).toBe(2);
  });

  it("CONTROL: with no movement card the same fight offers no top-up and cannot continue at 0 MP", () => {
    let state = driveToOwnActivation(startNeutralFight("mid-fight-boots"));
    getMainHero(state, "p1")!.movementPoints = 0;
    state.players.p1.hand = [];

    expect(getLegalActions(state, "p1").some((legal) => legal.action.type === "PLAY_CARD")).toBe(false);

    state = driveToAwaitingContinue(state);
    expect(state.combat?.awaitingContinue).toBe(true);
    expect(
      getLegalActions(state, "p1").some((legal) => legal.action.type === "CONTINUE_NEUTRAL_COMBAT"),
      "at 0 MP with nothing to spend, retreat is the only exit"
    ).toBe(false);
  });

  it("is offered at a neutral pre-activation pause too — not only on the fighter's own activation", () => {
    let state = startNeutralFight("mid-fight-pause");
    getMainHero(state, "p1")!.movementPoints = 0;
    state.players.p1.hand = ["artifact.boots_of_speed"];

    // Step to the first neutral pre-activation pause.
    let safety = 30;
    while (safety-- > 0 && !state.combat?.pendingNeutralStep) {
      const actions = getLegalActions(state, "p1");
      const next = actions.find((legal) => legal.action.type !== "PLAY_CARD");
      if (!next) break;
      state = apply(state, next.action);
    }
    expect(state.combat?.pendingNeutralStep?.kind, "an enemy guard is about to act").toBe("pre-activation");

    const offers = movementOffers(state, "artifact.boots_of_speed");
    expect(offers, "the movement side is offered off-turn, in the guard's pause").toHaveLength(1);
    state = apply(state, offers[0]!.action);
    expect(getMainHero(state, "p1")!.movementPoints).toBe(1);
  });

  it("FAMILY SWEEP: every implemented map-only '+movement' face in the library is offered mid-fight and applies its printed amount", () => {
    const faces = movementFacesInLibrary();
    // Non-vacuity: Boots, Equestrian's Gloves, Angel Wings, Shield of Naval
    // Glory, the Logistics ability, Dessa IV/VI, the WOG Gate Key (x2) and the
    // anime Phong Hỏa Luân (x2) — a floor so the sweep can never degenerate.
    expect(faces.length).toBeGreaterThanOrEqual(11);
    expect(new Set(faces.map((face) => face.cardId)).size).toBeGreaterThanOrEqual(9);

    for (const face of faces) {
      let state = driveToOwnActivation(startNeutralFight("sweep-" + face.cardId + face.optionIndex));
      const hero = getMainHero(state, "p1")!;
      hero.movementPoints = 0;
      state.players.p1.hand = [face.cardId];
      // Satisfy the two printed gates the offer honours.
      state.players.p1.limits.expertUses = 3;
      state.players.p1.combatStats.expertUsesSpentThisRound = 0;
      if (face.requiresSeaTile) {
        // Creature Banks are always land. For a sea-gated card's isolated
        // eligibility check, model the hero as standing on an ordinary water
        // field while retaining the already-started neutral combat fixture.
        state.adventure!.fields[hero.spaceId!]!.location = "empty_field";
        state.adventure!.fields[hero.spaceId!]!.terrain = "water";
      }

      const offer = getLegalActions(state, "p1").find(
        (legal) =>
          legal.action.type === "PLAY_CARD" &&
          legal.action.cardId === face.cardId &&
          legal.action.optionIndex === face.optionIndex
      );
      expect(offer, `${face.card.name} option ${face.optionIndex} is offered mid-fight`).toBeTruthy();

      const before = getMainHero(state, "p1")!.movementPoints;
      state = apply(state, offer!.action);
      expect(
        getMainHero(state, "p1")!.movementPoints - before,
        `${face.card.name} option ${face.optionIndex} grants its printed +${face.amount}`
      ).toBe(face.amount);
      // The card is really spent: a "remove this card" side leaves the game;
      // every other side goes to the discard — unless its printed walk-through
      // rider (Angel Wings, Dessa VI) is still LIVE, in which case the shared
      // "a live ongoing card is never in the discard" rule holds it in the
      // Ongoing tray instead. Either way it has left the hand.
      expect(state.players.p1.hand).not.toContain(face.cardId);
      if (face.removeSelf) {
        expect(state.players.p1.removed).toContain(face.cardId);
      } else {
        const held = state.players.p1.ongoingCards?.some((entry) => entry.cardId === face.cardId) ?? false;
        expect(held || state.players.p1.discard.includes(face.cardId)).toBe(true);
      }
    }
  });

  it("printed CONTROL — the Logistics EXPERT +movement needs a crown mid-fight, exactly as at the continue window", () => {
    const base = driveToOwnActivation(startNeutralFight("mid-fight-logistics"));
    getMainHero(base, "p1")!.movementPoints = 0;
    base.players.p1.hand = ["ability.logistics"];
    base.players.p1.limits.expertUses = 0;
    base.players.p1.combatStats.expertUsesSpentThisRound = 0;

    expect(
      movementOffers(base, "ability.logistics"),
      "no crown, no expert-only movement side"
    ).toHaveLength(0);

    base.players.p1.limits.expertUses = 1;
    const offers = movementOffers(base, "ability.logistics");
    expect(offers, "with a crown the expert +movement is offered").toHaveLength(1);
    expect(offers[0]!.action.type === "PLAY_CARD" && offers[0]!.action.mode).toBe("expert");
    const after = apply(base, offers[0]!.action);
    expect(getMainHero(after, "p1")!.movementPoints).toBe(1);
  });

  it("printed CONTROL — Shield of Naval Glory's sea side stays refused mid-fight on land", () => {
    const state = driveToOwnActivation(startNeutralFight("mid-fight-sea"));
    const hero = getMainHero(state, "p1")!;
    hero.movementPoints = 0;
    state.players.p1.hand = ["artifact.shield_of_naval_glory"];

    expect(
      movementOffers(state, "artifact.shield_of_naval_glory"),
      "on a land field the sea side is not offered"
    ).toHaveLength(0);
    const forged = applyAction(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "artifact.shield_of_naval_glory",
      optionIndex: 1,
      mode: "basic",
      target: { type: "none" }
    } as GameAction);
    expect(forged.errors.length, "and a forged play is rejected").toBeGreaterThan(0);

    // Same fight, hero standing on an ordinary water field: the printed
    // condition now holds. A Creature Bank itself remains land.
    state.adventure!.fields[hero.spaceId!]!.location = "empty_field";
    state.adventure!.fields[hero.spaceId!]!.terrain = "water";
    expect(movementOffers(state, "artifact.shield_of_naval_glory")).toHaveLength(1);
  });

  it("CONTROL — a map-only side that is NOT a movement grant is still refused mid-fight", () => {
    const state = driveToOwnActivation(startNeutralFight("mid-fight-nonmovement"));
    state.players.p1.hand = ["ability.logistics"];
    state.players.p1.limits.expertUses = 3;

    // Logistics option 0 is the map-only "Ongoing: step to an adjacent empty
    // field at the end of your turn" — a map-only side with no movement grant,
    // so the waiver must not reach it. (Its option 1, the expert +movement, IS
    // offered — the in-test control that this fight's window really is open.)
    expect(
      getLegalActions(state, "p1").some(
        (legal) =>
          legal.action.type === "PLAY_CARD" &&
          legal.action.cardId === "ability.logistics" &&
          legal.action.optionIndex === 1
      ),
      "in-test control: the movement side of the very same card IS offered here"
    ).toBe(true);
    expect(
      getLegalActions(state, "p1").some(
        (legal) =>
          legal.action.type === "PLAY_CARD" &&
          legal.action.cardId === "ability.logistics" &&
          legal.action.optionIndex === 0
      )
    ).toBe(false);
    const forged = applyAction(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "ability.logistics",
      optionIndex: 0,
      mode: "basic",
      target: { type: "none" }
    } as GameAction);
    expect(forged.errors.length).toBeGreaterThan(0);
  });
});

describe("scope: only a NEUTRAL fight this player's own hero is in", () => {
  it("CONTROL — the Battle-Test sandbox never offers it (no hero, so the points would land nowhere)", () => {
    const state = createInitialGameState("mid-fight-sandbox");
    state.players.p1.hand = ["artifact.boots_of_speed"];
    expect(state.combat).toBeTruthy();
    expect(heroMovementTopUpHeroId(state, "p1")).toBeNull();
    expect(movementOffers(state, "artifact.boots_of_speed")).toHaveLength(0);
    const forged = applyAction(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "artifact.boots_of_speed",
      optionIndex: 0,
      mode: "basic",
      target: { type: "none" }
    } as GameAction);
    expect(forged.errors.length).toBeGreaterThan(0);
  });

  it("CONTROL — a PvP battle never offers it (no movement point can be spent inside that fight)", () => {
    const state = driveToOwnActivation(startNeutralFight("mid-fight-pvp"));
    getMainHero(state, "p1")!.movementPoints = 0;
    state.players.p1.hand = ["artifact.boots_of_speed"];
    // Same live fight, same open card window — only the CONTEXT changes.
    expect(movementOffers(state, "artifact.boots_of_speed")).toHaveLength(1);

    state.combat!.context = { kind: "pvp", attackerHeroId: "hero_p1", defenderHeroId: "hero_p2" } as never;
    expect(heroMovementTopUpHeroId(state, "p1")).toBeNull();
    expect(movementOffers(state, "artifact.boots_of_speed")).toHaveLength(0);
    const forged = applyAction(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "artifact.boots_of_speed",
      optionIndex: 0,
      mode: "basic",
      target: { type: "none" }
    } as GameAction);
    expect(forged.errors.length).toBeGreaterThan(0);
  });

  it("SCOPE — it is a card-pass play, NOT a reaction-window join (and never opens one)", () => {
    // DELIBERATE, documented decision (see heroMovementTopUpHeroId): unlike the
    // 2026-08-06/08/10 instant batches, a "+movement" side is NOT offered inside
    // an open reaction window and never opens one. It cannot influence the
    // attack being resolved (it touches the hero's MAP pool only), and — unlike
    // the cards those batches rescued — it is already reachable in the same
    // fight: the holder is offered it on their own activation AND at every
    // neutral pre-activation pause, both pinned above. The printed `mapOnly`
    // ABSOLUTE bar in the reaction loop therefore stays standing.
    let state = startNeutralFight("mid-fight-window-scope");
    getMainHero(state, "p1")!.movementPoints = 0;
    // Armorer is a real printed defender reaction, so a guard's attack opens a
    // window; Boots rides along in the same hand.
    state.players.p1.hand = ["ability.armorer", "artifact.boots_of_speed"];

    let safety = 40;
    while (safety-- > 0 && !state.reactionWindow) {
      const actions = getLegalActions(state, "p1");
      const next =
        actions.find((legal) => legal.action.type === "CONTINUE_NEUTRAL_STEP") ??
        actions.find((legal) => legal.action.type === "END_ACTIVATION") ??
        actions.find((legal) => legal.action.type === "RESOLVE_COMBAT_DISCARD") ??
        actions.find((legal) => legal.action.type === "CHOOSE_OPTION") ??
        actions.find((legal) => legal.action.type !== "PLAY_CARD");
      if (!next) break;
      state = apply(state, next.action);
    }
    expect(state.reactionWindow, "a real attack window is open").toBeTruthy();

    const inWindow = getLegalActions(state, "p1");
    expect(
      inWindow.some((legal) => legal.action.type === "PASS_REACTION"),
      "in-test control: this really is the window's own menu"
    ).toBe(true);
    expect(
      inWindow.some(
        (legal) =>
          (legal.action.type === "PLAY_CARD" || legal.action.type === "PLAY_REACTION") &&
          legal.action.cardId === "artifact.boots_of_speed" &&
          typeof legal.label === "string" &&
          legal.label.toLowerCase().includes("movement")
      ),
      "the movement side is NOT a reaction"
    ).toBe(false);
  });

  it("CONTROL — a seat that is not the fighter gets nothing (the fight is not theirs)", () => {
    const state = driveToOwnActivation(startNeutralFight("mid-fight-bystander"));
    state.players.p2.hand = ["artifact.boots_of_speed"];
    expect(heroMovementTopUpHeroId(state, "p2")).toBeNull();
    expect(
      getLegalActions(state, "p2").some(
        (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "artifact.boots_of_speed"
      )
    ).toBe(false);
  });
});

describe("the points land on the hero IN the fight, not in a prompt nobody can answer", () => {
  it("with a Secondary Hero also on the map, a mid-fight top-up goes STRAIGHT to the fighting hero", () => {
    let state = driveToOwnActivation(startNeutralFight("mid-fight-two-heroes"));
    const hero = getMainHero(state, "p1")!;
    hero.movementPoints = 0;
    // A second hero of the same player, standing on the map.
    state.heroes["hero_p1_secondary"] = {
      ...hero,
      id: "hero_p1_secondary",
      kind: "secondary",
      spaceId: "second-field",
      movementPoints: 4
    } as never;
    state.players.p1.hand = ["artifact.boots_of_speed"];

    state = apply(state, movementOffers(state, "artifact.boots_of_speed")[0]!.action);

    // No "Which Hero gains +1 movement?" reward was queued — pumpAdventureQueues
    // is frozen during a combat, so such a prompt could not be answered until
    // the fight was over and the movement would arrive too late to buy a round.
    expect(state.adventure!.rewardQueue).toHaveLength(0);
    expect(state.adventure!.pendingVisit ?? null).toBeNull();
    expect(state.pendingChoice ?? null).toBeNull();
    expect(getMainHero(state, "p1")!.movementPoints, "the FIGHTING hero got the point").toBe(1);
    expect(state.heroes["hero_p1_secondary"]!.movementPoints, "the Secondary is untouched").toBe(4);

    // And it is immediately spendable on another combat round.
    state = driveToAwaitingContinue(state);
    const cont = getLegalActions(state, "p1").find((legal) => legal.action.type === "CONTINUE_NEUTRAL_COMBAT");
    expect(cont).toBeTruthy();
  });

  it("CONTROL — on the MAP with two heroes the printed 'which Hero?' pick still opens", () => {
    let state = createAdventureGameState({ seed: "map-two-heroes", difficulty: "easy", rollFirstPlayer: false });
    state =
      state.players.p1.needsHandRefresh || state.players.p1.canMulligan
        ? apply(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] })
        : state;
    const hero = getMainHero(state, "p1")!;
    state.heroes["hero_p1_secondary"] = {
      ...hero,
      id: "hero_p1_secondary",
      kind: "secondary",
      spaceId: hero.spaceId,
      movementPoints: 4
    } as never;
    expect(heroMovementTopUpHeroId(state, "p1"), "no combat ⇒ no top-up scope").toBeNull();
    state.players.p1.hand = ["artifact.boots_of_speed"];

    const offer = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "PLAY_CARD" &&
        legal.action.cardId === "artifact.boots_of_speed" &&
        legal.action.optionIndex === 0
    );
    expect(offer, "the map play is unchanged").toBeTruthy();
    const mainBefore = getMainHero(state, "p1")!.movementPoints;
    state = apply(state, offer!.action);

    // OFF the battlefield the printed "Which Hero gains +1 movement?" pick still
    // opens, and NEITHER hero has gained anything until it is answered — the
    // combat branch above is the ONLY place that pick is skipped.
    const steps = state.adventure!.pendingVisit?.steps ?? [];
    expect(
      steps.some((step) => step.type === "CHOOSE_ONE" && step.prompt.includes("movement")),
      "the map play opens the 'Which Hero gains +1 movement?' pick"
    ).toBe(true);
    expect(getMainHero(state, "p1")!.movementPoints).toBe(mainBefore);
    expect(state.heroes["hero_p1_secondary"]!.movementPoints).toBe(4);
  });
});

function observe(
  state: GameState,
  playerId: PlayerId
): { playerId: PlayerId; state: PlayerVisibleState; legalActions: ReturnType<typeof getLegalActions> } {
  return { playerId, state: state as unknown as PlayerVisibleState, legalActions: getLegalActions(state, playerId) };
}

describe("no automated seat can stall on the new offer", () => {
  it("a computer fighter picks a real action and the AFK/turn-timeout driver still closes the pause", () => {
    const state = startNeutralFight("mid-fight-ai");
    getMainHero(state, "p1")!.movementPoints = 0;
    state.players.p1.hand = ["artifact.boots_of_speed", "artifact.equestrians_gloves"];
    state.controllers = { p1: "computer", p2: "computer" } as never;

    const actions = getLegalActions(state, "p1");
    expect(actions.length).toBeGreaterThan(0);
    const chosen = chooseComputerAction(observe(state, "p1"));
    expect(chosen, "the AI always answers this window").toBeTruthy();
    // Whatever it picks must be a legal action of this very window.
    expect(actions.some((legal) => legal.action.type === chosen!.action.type)).toBe(true);

    // The shared forced-resolution driver (AFK kick / 10-minute timeout) also
    // has something to do here and never returns nothing.
    const forced = nextTurnTimeoutAction(state, "p1");
    expect(forced ?? null).not.toBeNull();
  });
});
