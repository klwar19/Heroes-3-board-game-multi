import { describe, expect, it } from "vitest";
import {
  applyAction,
  createInitialGameState,
  getActivationOrder,
  getActivationStep,
  makeActiveEffect,
  NEUTRAL_PLAYER_ID
} from "./index";
import type { GameAction, GameState, PendingChoice } from "./state";

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

/** Cleared-active-unit END_COMBAT_ROUND, so a fresh round opens cleanly. */
function startFreshRound(state: GameState): GameState {
  state.combat!.activeUnitId = null;
  state.activePlayerId = "p1";
  return applyOk(state, { type: "END_COMBAT_ROUND", playerId: "p1" });
}

function orderChoice(state: GameState): Extract<PendingChoice, { type: "OPTION_CHOICE" }> | null {
  const choice = state.pendingChoice;
  return choice?.type === "OPTION_CHOICE" && choice.context === "combat-activation-order" ? choice : null;
}

const P1 = ["unit_p1_marksmen", "unit_p1_griffins", "unit_p1_crusaders"] as const;
const P2 = ["unit_p2_skeletons", "unit_p2_vampires", "unit_p2_dread_knights"] as const;

function setInitiatives(state: GameState, values: Record<string, number>): void {
  for (const [id, initiative] of Object.entries(values)) {
    state.combat!.units[id].initiative = initiative;
  }
}

/** A lasting +amount initiative shift on one unit, exactly as Haste/Ammo Cart would. */
function addInitiativeShift(state: GameState, unitId: string, amount: number): void {
  state.activeEffects.push(
    makeActiveEffect(
      state,
      { name: "Initiative shift", scope: "unit", duration: { type: "combat" }, modifiers: [{ type: "INITIATIVE_BONUS", amount }] },
      { type: "system" },
      state.combat!.units[unitId].controllerId,
      { type: "unit", unitId }
    )
  );
}

describe("combat activation order — same-speed handling", () => {
  it("prompts the controlling player to pick when two of their own units share the top speed", () => {
    let state = createInitialGameState("order-same-team");
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    // p1's Griffins + Crusaders tie for the fastest; everything else is slower.
    setInitiatives(state, {
      unit_p1_griffins: 8,
      unit_p1_crusaders: 8,
      unit_p1_marksmen: 2,
      unit_p2_skeletons: 3,
      unit_p2_vampires: 3,
      unit_p2_dread_knights: 1
    });

    state = startFreshRound(state);

    // No unit is auto-activated; the owner is asked which tied unit goes first.
    const choice = orderChoice(state);
    expect(choice, "an activation-order choice should open").toBeTruthy();
    expect(state.combat!.activeUnitId).toBeNull();
    expect(choice!.playerId).toBe("p1");
    expect(new Set(choice!.activationOrder!.unitIds)).toEqual(new Set(["unit_p1_griffins", "unit_p1_crusaders"]));

    // Pick the Crusaders to go first.
    const crusadersIndex = choice!.activationOrder!.unitIds.indexOf("unit_p1_crusaders");
    state = applyOk(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: choice!.id,
      optionIndex: crusadersIndex
    });
    expect(state.combat!.activeUnitId).toBe("unit_p1_crusaders");

    // After it acts, the tied teammate is the only one left at that speed — no
    // second prompt, it just comes up.
    state = applyOk(state, { type: "DEFEND_UNIT", playerId: "p1", unitId: "unit_p1_crusaders" });
    expect(orderChoice(state)).toBeNull();
    expect(state.combat!.activeUnitId).toBe("unit_p1_griffins");
  });

  it("never prompts when a single unit holds the top speed", () => {
    let state = createInitialGameState("order-single");
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    setInitiatives(state, {
      unit_p1_griffins: 9,
      unit_p1_marksmen: 4,
      unit_p1_crusaders: 4,
      unit_p2_skeletons: 3,
      unit_p2_vampires: 3,
      unit_p2_dread_knights: 2
    });

    state = startFreshRound(state);
    expect(orderChoice(state)).toBeNull();
    expect(state.combat!.activeUnitId).toBe("unit_p1_griffins");
  });

  it("activates the attacker's tied unit before the defender's on a cross-side tie", () => {
    let state = createInitialGameState("order-cross-side");
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    // One unit per side tied at the top; the rest are slower and distinct.
    setInitiatives(state, {
      unit_p1_griffins: 7,
      unit_p1_marksmen: 4,
      unit_p1_crusaders: 3,
      unit_p2_vampires: 7,
      unit_p2_skeletons: 2,
      unit_p2_dread_knights: 1
    });

    state = startFreshRound(state);

    // Single candidate per side, so no prompt — the ATTACKER's unit (p1) acts
    // first on the tie, then the defender's tied unit follows.
    expect(orderChoice(state)).toBeNull();
    expect(state.combat!.activeUnitId).toBe("unit_p1_griffins");

    state = applyOk(state, { type: "DEFEND_UNIT", playerId: "p1", unitId: "unit_p1_griffins" });
    expect(state.combat!.activeUnitId).toBe("unit_p2_vampires");
  });

  it("runs ALL the attacker's tied units before any defender unit at that speed", () => {
    let state = createInitialGameState("order-cross-multi");
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    // Two per side tied at init 7; the odd units sit lower.
    setInitiatives(state, {
      unit_p1_griffins: 7,
      unit_p1_crusaders: 7,
      unit_p1_marksmen: 1,
      unit_p2_vampires: 7,
      unit_p2_skeletons: 7,
      unit_p2_dread_knights: 1
    });

    state = startFreshRound(state);

    // The attacker holds the tie outright: it is prompted to order BOTH of its
    // tied units first.
    let choice = orderChoice(state);
    expect(choice, "attacker picks first on a tie").toBeTruthy();
    expect(choice!.playerId).toBe("p1");
    state = applyOk(state, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: choice!.id, optionIndex: 0 });
    const firstAttacker = state.combat!.activeUnitId!;
    expect(P1).toContain(firstAttacker);
    state = applyOk(state, { type: "DEFEND_UNIT", playerId: "p1", unitId: firstAttacker });

    // The attacker's OTHER tied unit comes next — NOT the defender. With only one
    // attacker unit left at this speed there is no prompt.
    expect(orderChoice(state)).toBeNull();
    const secondAttacker = state.combat!.activeUnitId!;
    expect(P1).toContain(secondAttacker);
    expect(secondAttacker).not.toBe(firstAttacker);
    state = applyOk(state, { type: "DEFEND_UNIT", playerId: "p1", unitId: secondAttacker });

    // Only now, with the whole attacking side done at init 7, does the defender
    // activate — and it is prompted to order its own two tied units.
    choice = orderChoice(state);
    expect(choice, "defender activates only after every attacker at this speed").toBeTruthy();
    expect(choice!.playerId).toBe("p2");
    state = applyOk(state, { type: "CHOOSE_OPTION", playerId: "p2", choiceId: choice!.id, optionIndex: 0 });
    expect(P2).toContain(state.combat!.activeUnitId!);
  });
});

describe("getActivationStep — the ordering primitive", () => {
  it("returns every tied unit of the acting side as candidates", () => {
    const state = createInitialGameState("step-candidates");
    setInitiatives(state, {
      unit_p1_griffins: 8,
      unit_p1_crusaders: 8,
      unit_p1_marksmen: 2,
      unit_p2_skeletons: 3,
      unit_p2_vampires: 3,
      unit_p2_dread_knights: 1
    });
    // Nobody has acted yet this round.
    for (const id of [...P1, ...P2]) {
      state.combat!.units[id].activatedThisRound = false;
    }

    const step = getActivationStep(state.combat!, state.activeEffects);
    expect(step?.side).toBe("p1");
    expect(step?.initiative).toBe(8);
    expect(new Set(step?.candidates.map((unit) => unit.id))).toEqual(
      new Set(["unit_p1_griffins", "unit_p1_crusaders"])
    );
  });

  it("lets the attacker break a tied neutral side's order (the player operates the guards)", () => {
    let state = createInitialGameState("neutral-auto");
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    // Hand the defender's units to the neutral army (and give it a player record
    // so the round bookkeeping has somewhere to write).
    state.players[NEUTRAL_PLAYER_ID] = { ...structuredClone(state.players.p2), id: NEUTRAL_PLAYER_ID };
    state.combat!.defenderPlayerId = NEUTRAL_PLAYER_ID;
    for (const id of P2) {
      state.combat!.units[id].controllerId = NEUTRAL_PLAYER_ID;
    }
    // Two neutral units tie for the top speed.
    setInitiatives(state, {
      unit_p2_skeletons: 9,
      unit_p2_vampires: 9,
      unit_p2_dread_knights: 4,
      unit_p1_griffins: 2,
      unit_p1_marksmen: 1,
      unit_p1_crusaders: 1
    });

    state = startFreshRound(state);

    // The Neutral army cannot answer a prompt, so the attacker (p1, who runs the
    // guards) is asked which tied Neutral unit activates first. The choice is the
    // attacker's, but it lists the Neutral side's tied units.
    const choice = orderChoice(state);
    expect(choice, "the attacker breaks the neutral tie").toBeTruthy();
    expect(choice!.playerId).toBe("p1");
    expect(choice!.activationOrder!.side).toBe(NEUTRAL_PLAYER_ID);
    expect(state.combat!.activeUnitId).toBeNull();
    expect(new Set(choice!.activationOrder!.unitIds)).toEqual(
      new Set(["unit_p2_skeletons", "unit_p2_vampires"])
    );

    // Pick the Vampires: a Neutral unit becomes active even though p1 answered.
    const vampiresIndex = choice!.activationOrder!.unitIds.indexOf("unit_p2_vampires");
    state = applyOk(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: choice!.id,
      optionIndex: vampiresIndex
    });
    expect(state.combat!.activeUnitId).toBe("unit_p2_vampires");
    expect(state.combat!.units[state.combat!.activeUnitId!].controllerId).toBe(NEUTRAL_PLAYER_ID);
  });

  it("reports the neutral army as the acting side with all its tied units as candidates", () => {
    const state = createInitialGameState("step-neutral");
    // Reassign the defender's units to the neutral army and tie them at the top.
    state.combat!.defenderPlayerId = NEUTRAL_PLAYER_ID;
    setInitiatives(state, {
      unit_p1_griffins: 2,
      unit_p1_marksmen: 1,
      unit_p1_crusaders: 1,
      unit_p2_skeletons: 9,
      unit_p2_vampires: 9,
      unit_p2_dread_knights: 4
    });
    for (const id of P2) {
      state.combat!.units[id].controllerId = NEUTRAL_PLAYER_ID;
    }
    for (const id of [...P1, ...P2]) {
      state.combat!.units[id].activatedThisRound = false;
    }

    const step = getActivationStep(state.combat!, state.activeEffects);
    // The neutral side is up with two tied units; advanceActiveUnit then hands
    // the pick to the attacker (the player operating the guards), since the AI
    // cannot answer a prompt itself.
    expect(step?.side).toBe(NEUTRAL_PLAYER_ID);
    expect(step?.candidates.length).toBe(2);
  });
});

/**
 * Walks a whole round through the reducer and returns the ids in the exact
 * sequence units became active. Always picks the first tied candidate, the same
 * deterministic pick getActivationOrder previews, so the two can be compared.
 */
function playOutRoundSequence(state: GameState): string[] {
  let current = state;
  const sequence: string[] = [];
  for (let guard = 0; guard < 40; guard += 1) {
    const choice = orderChoice(current);
    if (choice) {
      current = applyOk(current, {
        type: "CHOOSE_OPTION",
        playerId: choice.playerId,
        choiceId: choice.id,
        optionIndex: 0
      });
      continue;
    }
    const activeId = current.combat!.activeUnitId;
    if (!activeId) {
      break;
    }
    sequence.push(activeId);
    current = applyOk(current, {
      type: "DEFEND_UNIT",
      playerId: current.combat!.units[activeId].controllerId,
      unitId: activeId
    });
  }
  return sequence;
}

describe("getActivationOrder — the rail preview matches the engine's real order", () => {
  it("lists every attacker unit at a tied speed before the defender's tied unit", () => {
    let state = createInitialGameState("rail-cross-tie");
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    // Attacker (p1) has TWO units tied at the top; the defender (p2) has ONE.
    setInitiatives(state, {
      unit_p1_griffins: 9,
      unit_p1_crusaders: 9,
      unit_p1_marksmen: 1,
      unit_p2_skeletons: 9,
      unit_p2_vampires: 1,
      unit_p2_dread_knights: 1
    });

    const preview = getActivationOrder(state.combat!, state.activeEffects).map((unit) => unit.id);

    // Attacker-first: BOTH attacker units at init 9 come before the defender's
    // tied unit. The defender never slips in between them.
    expect(preview.slice(0, 3)).toEqual(["unit_p1_crusaders", "unit_p1_griffins", "unit_p2_skeletons"]);
    expect(preview.indexOf("unit_p2_skeletons")).toBeGreaterThan(preview.indexOf("unit_p1_griffins"));

    // And the preview is exactly the sequence the reducer actually plays.
    state = startFreshRound(state);
    expect(playOutRoundSequence(state)).toEqual(preview);
  });

  it("keeps a defender Cyclopes lifted to a TIE behind the attacker's same-speed unit (Archery-only repro)", () => {
    // The reported bug: a defender Cyclopes (few, base initiative 6) plays Expert
    // Archery for +1 initiative, reaching 7, and was activating ahead of the
    // attacker. With attacker-first ties it must sit BEHIND the attacker's own
    // 7-initiative unit, and of course behind the attacker's 9-initiative flier.
    let state = createInitialGameState("rail-archery-cyclops");
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    state.combat!.units.unit_p2_skeletons.type = "ranged"; // stand-in for the Cyclopes
    setInitiatives(state, {
      unit_p1_griffins: 9, // attacker's Thunderbird-speed flier
      unit_p1_crusaders: 7, // attacker's 7-speed unit the Cyclopes ties
      unit_p1_marksmen: 1,
      unit_p2_skeletons: 6, // Cyclopes few base initiative
      unit_p2_vampires: 1,
      unit_p2_dread_knights: 1
    });
    addInitiativeShift(state, "unit_p2_skeletons", 1); // Expert Archery's +1 → 7

    const preview = getActivationOrder(state.combat!, state.activeEffects).map((unit) => unit.id);
    // 9 leads, then the attacker's 7 (tie won by the attacker), then the Cyclopes
    // at its boosted 7 — never first, never ahead of the same-speed attacker.
    expect(preview.slice(0, 3)).toEqual(["unit_p1_griffins", "unit_p1_crusaders", "unit_p2_skeletons"]);

    state = startFreshRound(state);
    const sequence = playOutRoundSequence(state);
    expect(sequence).toEqual(preview);
    // The Cyclopes is behind both the 9 flier and the tied 7 attacker.
    expect(sequence.indexOf("unit_p2_skeletons")).toBeGreaterThan(sequence.indexOf("unit_p1_griffins"));
    expect(sequence.indexOf("unit_p2_skeletons")).toBeGreaterThan(sequence.indexOf("unit_p1_crusaders"));
  });

  it("still places a defender unit by its EFFECTIVE initiative when it OUTSPEEDS the attacker", () => {
    let state = createInitialGameState("rail-boosted-defender");
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    // Defender (p2) ranged unit sits at a low printed initiative...
    state.combat!.units.unit_p2_skeletons.type = "ranged";
    setInitiatives(state, {
      unit_p1_griffins: 8,
      unit_p1_crusaders: 7,
      unit_p1_marksmen: 1,
      unit_p2_skeletons: 6,
      unit_p2_vampires: 1,
      unit_p2_dread_knights: 1
    });
    // ...but a +3 shift lifts it to 9, STRICTLY above every attacker unit. It then
    // leads — attacker-first only breaks ties, it never overrides a real speed gap.
    addInitiativeShift(state, "unit_p2_skeletons", 3);

    const preview = getActivationOrder(state.combat!, state.activeEffects).map((unit) => unit.id);
    expect(preview.slice(0, 3)).toEqual(["unit_p2_skeletons", "unit_p1_griffins", "unit_p1_crusaders"]);

    state = startFreshRound(state);
    expect(playOutRoundSequence(state)).toEqual(preview);
  });
});
