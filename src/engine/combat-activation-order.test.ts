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

  it("alternates sides on a cross-side tie, attacker-first (the player/attacker leads)", () => {
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

    // Single candidate per side, so no prompt — and the ATTACKER's unit (p1) acts
    // first on the even split, then the two sides alternate.
    expect(orderChoice(state)).toBeNull();
    expect(state.combat!.activeUnitId).toBe("unit_p1_griffins");

    state = applyOk(state, { type: "DEFEND_UNIT", playerId: "p1", unitId: "unit_p1_griffins" });
    expect(state.combat!.activeUnitId).toBe("unit_p2_vampires");
  });

  it("interleaves the two sides when both have several units at the same speed (attacker-first)", () => {
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

    // Even split → the ATTACKER side (p1) picks first.
    let choice = orderChoice(state);
    expect(choice, "attacker picks first on an even tie").toBeTruthy();
    expect(choice!.playerId).toBe("p1");
    state = applyOk(state, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: choice!.id, optionIndex: 0 });
    const firstAttacker = state.combat!.activeUnitId!;
    expect(P1).toContain(firstAttacker);
    state = applyOk(state, { type: "DEFEND_UNIT", playerId: "p1", unitId: firstAttacker });

    // Now the defender is behind, so it activates next — and it has two tied
    // units, so its owner is prompted.
    choice = orderChoice(state);
    expect(choice, "defender picks after the attacker's first unit").toBeTruthy();
    expect(choice!.playerId).toBe("p2");
    state = applyOk(state, { type: "CHOOSE_OPTION", playerId: "p2", choiceId: choice!.id, optionIndex: 0 });
    const firstDefender = state.combat!.activeUnitId!;
    expect(P2).toContain(firstDefender);
    state = applyOk(state, { type: "DEFEND_UNIT", playerId: "p2", unitId: firstDefender });

    // Back to the attacker's remaining unit — only one left at this speed, so no
    // prompt this time.
    expect(orderChoice(state)).toBeNull();
    const secondAttacker = state.combat!.activeUnitId!;
    expect(P1).toContain(secondAttacker);
    expect(secondAttacker).not.toBe(firstAttacker);
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
  it("interleaves the sides on a cross-side tie instead of listing one side first", () => {
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

    // Alternation: attacker, DEFENDER, attacker — the defender's single tied unit
    // activates SECOND, between the attacker's two. A flat "attacker-first" sort
    // would wrongly list it third (after both attacker units), so this fails if
    // the rail falls back to a plain initiative sort.
    expect(preview.slice(0, 3)).toEqual(["unit_p1_crusaders", "unit_p2_skeletons", "unit_p1_griffins"]);
    expect(preview.indexOf("unit_p2_skeletons")).toBeLessThan(preview.indexOf("unit_p1_griffins"));

    // And the preview is exactly the sequence the reducer actually plays.
    state = startFreshRound(state);
    expect(playOutRoundSequence(state)).toEqual(preview);
  });

  it("places a boosted defender ranged unit (e.g. Cyclopes) by its EFFECTIVE initiative, not its base", () => {
    let state = createInitialGameState("rail-boosted-defender");
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    // Defender (p2) ranged unit sits at a low printed initiative...
    state.combat!.units.unit_p2_skeletons.type = "ranged";
    setInitiatives(state, {
      unit_p1_griffins: 9,
      unit_p1_crusaders: 7,
      unit_p1_marksmen: 1,
      unit_p2_skeletons: 6,
      unit_p2_vampires: 1,
      unit_p2_dread_knights: 1
    });
    // ...but a +3 initiative shift (an Ammo Cart's +2 and Expert Archery's +1 on a
    // base-6 Cyclopes reach 9) lifts it to the top tier. It must sit by 9, ahead
    // of the attacker's 7-initiative unit — never stranded at its printed 6.
    addInitiativeShift(state, "unit_p2_skeletons", 3);

    const preview = getActivationOrder(state.combat!, state.activeEffects).map((unit) => unit.id);
    // griffins (attacker, 9) lead the 9-tie; the boosted defender follows at 9,
    // and both come before the attacker's 7-initiative crusaders.
    expect(preview.slice(0, 3)).toEqual(["unit_p1_griffins", "unit_p2_skeletons", "unit_p1_crusaders"]);

    state = startFreshRound(state);
    expect(playOutRoundSequence(state)).toEqual(preview);
  });

  it("re-queues Waited units at the TAIL, highest wait token first (CONTROL: unwaited lead)", () => {
    const state = createInitialGameState("rail-wait");
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    setInitiatives(state, {
      unit_p1_griffins: 9,
      unit_p1_crusaders: 8,
      unit_p1_marksmen: 7,
      unit_p2_skeletons: 6,
      unit_p2_vampires: 5,
      unit_p2_dread_knights: 4
    });
    const griffins = state.combat!.units.unit_p1_griffins;
    const crusaders = state.combat!.units.unit_p1_crusaders;
    // Both Waited in the main phase (activatedThisRound + waitPending). Crusaders
    // waited first (lower token 1); griffins later (token 2) → griffins re-acts
    // FIRST in the wait phase (highest token down).
    griffins.activatedThisRound = true;
    griffins.waitPending = true;
    griffins.waitToken = 2;
    crusaders.activatedThisRound = true;
    crusaders.waitPending = true;
    crusaders.waitToken = 1;

    const order = getActivationOrder(state.combat!, state.activeEffects).map((unit) => unit.id);
    // The two Waited units sit at the very tail, higher token first — NOT stranded
    // in the greyed "done" bucket their activatedThisRound flag would put them in.
    expect(order.slice(-2)).toEqual(["unit_p1_griffins", "unit_p1_crusaders"]);
    // Every un-waited unit comes before them.
    expect(order.indexOf("unit_p2_dread_knights")).toBeLessThan(order.indexOf("unit_p1_griffins"));

    // CONTROL: clear the waits — griffins (9) leads, crusaders (8) is second.
    for (const unit of [griffins, crusaders]) {
      unit.activatedThisRound = false;
      unit.waitPending = false;
      unit.waitToken = undefined;
    }
    const normal = getActivationOrder(state.combat!, state.activeEffects).map((unit) => unit.id);
    expect(normal.slice(0, 2)).toEqual(["unit_p1_griffins", "unit_p1_crusaders"]);
  });
});

/**
 * Imp Cache reproduction: Pack Orcs + Pack Ogres (both initiative 5) vs Neutral
 * Familiars (initiative 5). Cross-side alternation must put a Familiar between
 * the two player packs — including when the first pack's initiative DROPS after
 * it acts (Pack→Few flip mid-activation), which used to erase it from the tier
 * count and hand the next slot to Ogres (rail still showed Familiar next).
 */
describe("Imp Cache — Pack Orcs/Ogres (init 5) alternate with Familiars (init 5)", () => {
  it("after the first attacker unit acts, a Neutral unit is next — never the other pack", () => {
    let state = createInitialGameState("imp-cache-alt");
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    state.players[NEUTRAL_PLAYER_ID] = { ...structuredClone(state.players.p2), id: NEUTRAL_PLAYER_ID };
    state.combat!.defenderPlayerId = NEUTRAL_PLAYER_ID;
    for (const id of P2) {
      state.combat!.units[id].controllerId = NEUTRAL_PLAYER_ID;
    }
    // Orcs + Ogres + three Familiars all at 5 (marksmen slower).
    setInitiatives(state, {
      unit_p1_griffins: 5,
      unit_p1_crusaders: 5,
      unit_p1_marksmen: 1,
      unit_p2_skeletons: 5,
      unit_p2_vampires: 5,
      unit_p2_dread_knights: 5
    });

    state = startFreshRound(state);
    const choice = orderChoice(state);
    expect(choice, "attacker picks which pack goes first").toBeTruthy();
    // Pick griffins (stand-in for Orcs).
    const firstIdx = choice!.activationOrder!.unitIds.indexOf("unit_p1_griffins");
    state = applyOk(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: choice!.id,
      optionIndex: firstIdx >= 0 ? firstIdx : 0
    });
    expect(state.combat!.activeUnitId).toBe("unit_p1_griffins");

    state = applyOk(state, { type: "DEFEND_UNIT", playerId: "p1", unitId: "unit_p1_griffins" });

    // Next must be Neutral — never the second pack (crusaders / Ogres).
    const nextChoice = orderChoice(state);
    if (nextChoice) {
      expect(nextChoice.activationOrder!.side).toBe(NEUTRAL_PLAYER_ID);
    } else {
      const active = state.combat!.units[state.combat!.activeUnitId!];
      expect(active.controllerId).toBe(NEUTRAL_PLAYER_ID);
    }
    expect(state.combat!.activeUnitId).not.toBe("unit_p1_crusaders");
  });

  it("still hands the next slot to Neutral after a Pack→Few initiative drop (the real skip bug)", () => {
    const state = createInitialGameState("imp-cache-flip");
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    state.players[NEUTRAL_PLAYER_ID] = { ...structuredClone(state.players.p2), id: NEUTRAL_PLAYER_ID };
    state.combat!.defenderPlayerId = NEUTRAL_PLAYER_ID;
    for (const id of P2) {
      state.combat!.units[id].controllerId = NEUTRAL_PLAYER_ID;
    }
    setInitiatives(state, {
      unit_p1_griffins: 5,
      unit_p1_crusaders: 5,
      unit_p1_marksmen: 1,
      unit_p2_skeletons: 5,
      unit_p2_vampires: 5,
      unit_p2_dread_knights: 5
    });
    for (const unit of Object.values(state.combat!.units)) {
      unit.activatedThisRound = false;
    }

    // Synthetic mid-round state: Orcs already finished their activation at band 5,
    // then Pack→Few rewrote printed initiative to 4. Sticky activationInitiative
    // keeps them in the tier-5 count so Neutral is next (not Ogres).
    const orcs = state.combat!.units.unit_p1_griffins;
    orcs.activatedThisRound = true;
    orcs.activationInitiative = 5;
    orcs.initiative = 4;
    state.combat!.activeUnitId = null;
    state.pendingChoice = null;

    const step = getActivationStep(state.combat!, state.activeEffects);
    expect(step?.side).toBe(NEUTRAL_PLAYER_ID);
    expect(step?.candidates.every((unit) => unit.controllerId === NEUTRAL_PLAYER_ID)).toBe(true);

    // CONTROL: drop the sticky band — Orcs vanish from the tier-5 acted count,
    // even split at 5, attacker leads again → Ogres (crusaders) cut in.
    orcs.activationInitiative = undefined;
    const broken = getActivationStep(state.combat!, state.activeEffects);
    expect(broken?.side).toBe("p1");
    expect(broken?.candidates.map((unit) => unit.id)).toContain("unit_p1_crusaders");
  });

  it("Wait (polish-wait): after Orcs Wait, Neutral is next — never Ogres", () => {
    let state = createInitialGameState("imp-cache-wait");
    state.adventure = {
      ...(state.adventure ?? ({} as NonNullable<GameState["adventure"]>)),
      houseRules: { "polish-wait": true }
    } as GameState["adventure"];
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    state.players[NEUTRAL_PLAYER_ID] = { ...structuredClone(state.players.p2), id: NEUTRAL_PLAYER_ID };
    state.combat!.defenderPlayerId = NEUTRAL_PLAYER_ID;
    for (const id of P2) {
      state.combat!.units[id].controllerId = NEUTRAL_PLAYER_ID;
    }
    setInitiatives(state, {
      unit_p1_griffins: 5,
      unit_p1_crusaders: 5,
      unit_p1_marksmen: 1,
      unit_p2_skeletons: 5,
      unit_p2_vampires: 5,
      unit_p2_dread_knights: 5
    });

    state = startFreshRound(state);
    const choice = orderChoice(state)!;
    const firstIdx = choice.activationOrder!.unitIds.indexOf("unit_p1_griffins");
    state = applyOk(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: choice.id,
      optionIndex: firstIdx >= 0 ? firstIdx : 0
    });

    state = applyOk(state, { type: "WAIT_UNIT", playerId: "p1", unitId: "unit_p1_griffins" });
    expect(state.combat!.units.unit_p1_griffins.waitPending).toBe(true);

    const nextChoice = orderChoice(state);
    if (nextChoice) {
      expect(nextChoice.activationOrder!.side).toBe(NEUTRAL_PLAYER_ID);
    } else {
      expect(state.combat!.units[state.combat!.activeUnitId!].controllerId).toBe(NEUTRAL_PLAYER_ID);
    }
    expect(state.combat!.activeUnitId).not.toBe("unit_p1_crusaders");
  });
});
