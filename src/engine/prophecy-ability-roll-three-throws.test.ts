/**
 * Polish Balance Pack Cards of Prophecy, option B — on an **ABILITY roll**.
 *
 * PRINTED FACE (`public/assets/polish-balance/artifact-cards_of_prophecy.webp`,
 * the authority): "When you are about to roll any die, play this BEFORE the roll:
 * that die is rolled 3 times and you resolve 1 chosen result."
 *
 * REPORTED 2026-08-26: "polish balance rule: Card of Prophecy. Lower part effect
 * - still not working."
 *
 * ROOT CAUSE. The 2026-08-22 PRE-ROLL rewrite (76d5ae05) moved option B out of
 * the post-roll die windows and into the attack's own pre-roll window
 * (`USE_PROPHECY_PRE_ROLL`). That is right for the ATTACK die, which HAS a
 * pre-roll window — but an ABILITY roll (Death Stare & co.) has none: its dice
 * are thrown inline while an attack resolves. The commit deleted
 * `AttackRerollSource.rollExtraCandidates` and filtered the card out of the
 * ability window too, with NOTHING offered in its place, so with the rule ON:
 *   - the card was unspendable on any ability roll, and
 *   - the ability-roll window stopped OPENING at all (no sources ⇒ no window),
 * i.e. the reprint was strictly WORSE than the rule OFF, where the printed
 * "Reroll any die" reaction still worked. `artifacts-balance.ts`'s own header
 * claimed the ability-roll window all along — the code had diverged from it.
 *
 * THE FIX. In the ability window the card's one use throws the CHOSEN die twice
 * more and unlocks the free pick, so the player resolves 1 of 3 faces for that
 * die — the printed roll-3-keep-1 outcome, declared at the only moment the engine
 * offers. Same documented reading the MAP Resource/Treasure dice already ship
 * (`prophecy-diplomacy-artifacts.test.ts`).
 *
 * Every spec below is scripted so the THREE candidates carry DIFFERENT outcomes
 * (the target petrified or not), so it fails if the extra throws OR the free pick
 * are removed — not merely if a flag stops being written (CLAUDE.md #1a).
 */
import { describe, expect, it } from "vitest";
import { applyAction, createInitialGameState, getLegalActions } from "./index";
import { nextTurnTimeoutAction } from "./afk-drop";
import { chooseComputerAction } from "./computer/policy";
import type { ComputerObservation } from "./computer/types";
import type { CardId, GameAction, GameEvent, GameState } from "./state";

const PROPHECY = "artifact.cards_of_prophecy" as CardId;
const RING = "artifact.diplomats_ring" as CardId;

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function applyFails(state: GameState, action: GameAction): string {
  const result = applyAction(state, action);
  expect(result.errors.length, "the action should have been refused").toBeGreaterThan(0);
  return result.errors.map((error) => error.message).join("; ");
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

/**
 * The p1 Marksmen (Death Stare, window "-1" on BOTH dice) shoot the p2 Skeletons
 * as a Few, so a petrified target is really REMOVED. `hand` is dealt to p1 and
 * `houseRules` frozen on the sandbox, the `polish-card-balance-artifacts.test.ts`
 * fixture pattern. Stops with the ABILITY-roll window open: the pre-roll attack
 * window (where option B lives for the ATTACK die) is passed on the way, which is
 * exactly the player keeping the card for the ability roll instead.
 */
function stareWindow(options: {
  balance: boolean;
  community?: boolean;
  hand?: CardId[];
  rolls: number[];
}): GameState {
  const state = createInitialGameState(`prophecy-ability-${options.balance}-${options.community ?? false}`);
  state.adventure = {
    houseRules: {
      "polish-card-balance": options.balance,
      "community-card-balance": options.community ?? false,
      "combat-move-initiative": false
    }
  } as unknown as GameState["adventure"];
  const attacker = state.combat!.units.unit_p1_marksmen;
  attacker.abilities = ["gorgon-death-stare"];
  attacker.attack = 3;
  attacker.position = 1;
  const defender = state.combat!.units.unit_p2_skeletons;
  defender.abilities = [];
  defender.position = 13;
  defender.defense = 0;
  defender.maxHealth = 20;
  defender.damage = 0;
  defender.variant = "few";
  state.players.p1.hand = options.hand ?? [PROPHECY];
  state.players.p2.hand = [];
  state.players.p1.morale = 0;
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

/**
 * Walk past the ATTACK die's own post-roll window if one opened, keeping the face
 * it shows, so the ABILITY-roll window is the open one. A table where the held
 * card IS a post-roll attack source (the rule OFF, or Diplomat's Ring) pauses
 * there first; the Balance-Pack Prophecy table does not.
 */
function advanceToAbilityWindow(state: GameState): GameState {
  const choice = state.pendingChoice;
  if (choice?.type !== "ATTACK_DIE_REROLL" || choice.abilityRoll) {
    return state;
  }
  return passAllReactions(
    applyOk(state, {
      type: "CHOOSE_PENDING_ROLL",
      playerId: "p1",
      choiceId: choice.id,
      candidateIndex: choice.candidates.length - 1
    })
  );
}

/** The open ATTACK_DIE_REROLL window, asserted to be the ABILITY-roll one. */
function abilityWindow(state: GameState) {
  const choice = state.pendingChoice;
  expect(choice?.type, "an ability-roll window is open").toBe("ATTACK_DIE_REROLL");
  if (choice?.type !== "ATTACK_DIE_REROLL") {
    throw new Error("no reroll window");
  }
  expect(choice.abilityRoll?.kind, "the Death Stare ability roll").toBe("death-stare");
  return choice;
}

/**
 * The window's reroll offers. `REROLL_PENDING_CHOICE` names no source (the engine
 * picks the next one in spend order), so this is only unambiguous because these
 * fixtures give p1 NO other source at all — no morale token, no reroll ability, a
 * one-card hand. Asserted here so a fixture change cannot quietly make the
 * per-die / one-shot claims below read another source's offers.
 */
function prophecyOffers(state: GameState) {
  const choice = state.pendingChoice;
  if (choice?.type !== "ATTACK_DIE_REROLL") return [];
  expect(
    choice.rerollSources.filter((source) => source.cardId !== PROPHECY),
    "the fixture leaves Cards of Prophecy as the only reroll source"
  ).toEqual([]);
  return getLegalActions(state, "p1")
    .map((legal) => legal.action)
    .filter(
      (action): action is Extract<GameAction, { type: "REROLL_PENDING_CHOICE" }> =>
        action.type === "REROLL_PENDING_CHOICE" && action.useSetDie !== true
    );
}

function petrified(state: GameState): boolean {
  return state.eventLog.some(
    (event: GameEvent) => event.type === "UNIT_REMOVED" && event.unitId === "unit_p2_skeletons"
  );
}

function keep(state: GameState, candidateIndex: number): GameState {
  const choice = abilityWindow(state);
  return passAllReactions(
    applyOk(state, {
      type: "CHOOSE_PENDING_ROLL",
      playerId: choice.playerId,
      choiceId: choice.id,
      candidateIndex
    })
  );
}

/**
 * The scripted scene every spec below shares.
 *
 * Rolls: attack "+1", then the Death Stare pair -1 / 0 (a MISS — the window needs
 * "-1" on BOTH dice), then die 2's two Prophecy throws: -1 then +1. So spending
 * the card on die 2 produces exactly three candidates:
 *   index 0  [-1,  0]  the face already on the table  → miss
 *   index 1  [-1, -1]  the first re-throw             → PETRIFIED
 *   index 2  [-1, +1]  the second (extra) throw       → miss
 * Three different outcomes, and the winning one is NEITHER the original nor the
 * latest — so keeping it needs BOTH the extra throw and the free pick.
 */
const SCENE = [1, -1, 0, -1, 1];

describe("Balance Pack Cards of Prophecy option B — ABILITY rolls (Death Stare)", () => {
  it("the ability-roll window OPENS and offers the card (the reported bug: it did neither)", () => {
    const state = stareWindow({ balance: true, rolls: SCENE });
    const choice = abilityWindow(state);
    expect(
      choice.rerollSources.map((source) => source.name),
      "the held card is a source in the window it can actually be spent in"
    ).toContain("Cards of Prophecy");
    // One button PER DIE (the printed singular "that die" — the Death Stare
    // one-die rule), never a single whole-roll press.
    const offers = prophecyOffers(state);
    expect(new Set(offers.map((offer) => offer.dieIndex))).toEqual(new Set([0, 1]));
  });

  it("spending it throws the chosen die 3 times and the CHOSEN result really petrifies", () => {
    let state = stareWindow({ balance: true, rolls: SCENE });
    const choice = abilityWindow(state);
    expect(choice.candidates).toHaveLength(1);
    expect(choice.candidates[0].rolls).toEqual([-1, 0]);

    state = applyOk(state, {
      type: "REROLL_PENDING_CHOICE",
      playerId: "p1",
      choiceId: choice.id,
      dieIndex: 1
    });

    const rolled = abilityWindow(state);
    // THREE faces for the die it was spent on — "that die is rolled 3 times".
    // A plain reroll would leave 2 candidates; this is the whole fix.
    expect(rolled.candidates).toHaveLength(3);
    expect(rolled.candidates.map((candidate) => candidate.rolls)).toEqual([
      [-1, 0],
      [-1, -1],
      [-1, 1]
    ]);
    // "you resolve 1 CHOSEN result" — every candidate is keepable, not just the last.
    expect(rolled.freeCandidateChoice).toBe(true);
    // The UNTOUCHED first die is preserved verbatim in every candidate.
    expect(rolled.candidates.every((candidate) => candidate.rolls[0] === -1)).toBe(true);
    // One card, one use.
    expect(state.players.p1.hand).not.toContain(PROPHECY);
    expect(state.players.p1.discard).toContain(PROPHECY);

    // OBSERVABLE: keeping the winning MIDDLE candidate petrifies the target.
    expect(petrified(keep(state, 1))).toBe(true);
  });

  it("the other two of the three results really lose — the pick decides the outcome", () => {
    // Same scene, the same one press, a different pick each time. Identical
    // scripted dice, opposite observable outcome ⇒ the choice is real.
    for (const candidateIndex of [0, 2]) {
      let state = stareWindow({ balance: true, rolls: SCENE });
      state = applyOk(state, {
        type: "REROLL_PENDING_CHOICE",
        playerId: "p1",
        choiceId: abilityWindow(state).id,
        dieIndex: 1
      });
      expect(petrified(keep(state, candidateIndex)), `candidate ${candidateIndex} is a miss`).toBe(false);
    }
  });

  it("the card is a ONE-shot: no second press remains after it is spent", () => {
    let state = stareWindow({ balance: true, rolls: [...SCENE, -1, -1] });
    state = applyOk(state, {
      type: "REROLL_PENDING_CHOICE",
      playerId: "p1",
      choiceId: abilityWindow(state).id,
      dieIndex: 1
    });
    expect(prophecyOffers(state)).toHaveLength(0);
    expect(abilityWindow(state).remainingRerolls).toBe(0);
  });

  // ---- CONTROLs -----------------------------------------------------------

  it("CONTROL: with the rule OFF it is the printed SINGLE reroll — 2 candidates, no free pick", () => {
    let state = stareWindow({ balance: false, rolls: SCENE });
    // The rule-OFF table opens the ATTACK-die window first (the card IS a
    // post-roll source there): keep its face and walk on to the ability roll.
    expect(
      state.pendingChoice?.type === "ATTACK_DIE_REROLL" && !state.pendingChoice.abilityRoll,
      "the attack die's own window comes first without the reprint"
    ).toBe(true);
    state = advanceToAbilityWindow(state);

    const choice = abilityWindow(state);
    state = applyOk(state, {
      type: "REROLL_PENDING_CHOICE",
      playerId: "p1",
      choiceId: choice.id,
      dieIndex: 1
    });
    const rolled = abilityWindow(state);
    expect(rolled.candidates, "one re-throw only").toHaveLength(2);
    expect(rolled.freeCandidateChoice ?? false, "no free pick without the reprint").toBe(false);
    // And the rulebook's "only the latest counts" really binds: the original
    // face is REFUSED, where the reprint above keeps it.
    applyFails(state, {
      type: "CHOOSE_PENDING_ROLL",
      playerId: "p1",
      choiceId: rolled.id,
      candidateIndex: 0
    });
  });

  it("CONTROL: not spending it resolves the faces already shown (the miss stands)", () => {
    const state = stareWindow({ balance: true, rolls: SCENE });
    expect(abilityWindow(state).candidates[0].rolls).toEqual([-1, 0]);
    expect(petrified(keep(state, 0)), "an unspent card changes nothing").toBe(false);
    expect(state.players.p1.hand, "and stays in hand").toContain(PROPHECY);
  });

  it("CONTROL: Diplomat's Ring gets NO extra throws — the roll-3 is Prophecy's alone", () => {
    // The Ring stays a post-roll ATTACK-die source under the rule, so that
    // window opens first — walk past it to the ability roll.
    let state = advanceToAbilityWindow(stareWindow({ balance: true, hand: [RING], rolls: SCENE }));
    const choice = abilityWindow(state);
    expect(choice.rerollSources.map((source) => source.name)).toContain("Diplomat's Ring");
    state = applyOk(state, {
      type: "REROLL_PENDING_CHOICE",
      playerId: "p1",
      choiceId: choice.id
    });
    const rolled = abilityWindow(state);
    // The Ring is the ONE "reroll any die OR ANY ROLL" card: it re-throws BOTH
    // dice once (2 candidates), and never unlocks a free pick.
    expect(rolled.candidates).toHaveLength(2);
    expect(rolled.freeCandidateChoice ?? false).toBe(false);
  });

  it("CONTROL: the COMMUNITY reprint wins — its Search half leaves no ability-roll source", () => {
    const state = stareWindow({ balance: true, community: true, rolls: SCENE });
    const choice = state.pendingChoice;
    if (choice?.type === "ATTACK_DIE_REROLL") {
      expect(choice.rerollSources.map((source) => source.name)).not.toContain("Cards of Prophecy");
    }
    expect(prophecyOffers(state)).toHaveLength(0);
  });

  it("never stalls a table: the AI and the AFK driver answer the offer AND the 3-way pick", () => {
    // The window is reached through an ORDINARY reroll offer plus the existing
    // free-pick shape, so no `computer/window.ts` lockstep change was needed — but
    // this is the seam that proves it (the reprint newly re-opens a window a
    // computer seat could previously never see).
    const observation = (state: GameState): ComputerObservation => ({
      state: state as unknown as ComputerObservation["state"],
      playerId: "p1",
      legalActions: getLegalActions(state, "p1")
    });

    let state = stareWindow({ balance: true, rolls: SCENE });
    const aiOffer = chooseComputerAction(observation(state));
    expect(aiOffer, "the AI answers the ability-roll window").toBeTruthy();
    expect(applyAction(state, aiOffer!.action).errors).toEqual([]);
    expect(nextTurnTimeoutAction(state, "p1"), "so does the AFK/turn-timeout driver").toBeTruthy();

    // After the three throws the free pick is answerable by both, too.
    state = applyOk(state, {
      type: "REROLL_PENDING_CHOICE",
      playerId: "p1",
      choiceId: abilityWindow(state).id,
      dieIndex: 1
    });
    expect(abilityWindow(state).candidates).toHaveLength(3);
    const aiPick = chooseComputerAction(observation(state));
    expect(aiPick, "the AI answers the free pick").toBeTruthy();
    expect(applyAction(state, aiPick!.action).errors).toEqual([]);
    const driven = nextTurnTimeoutAction(state, "p1");
    expect(driven, "and the AFK driver answers the free pick").toBeTruthy();
    expect(applyAction(state, driven!).errors).toEqual([]);
  });

  it("CONTROL: the ATTACK die keeps its PRE-ROLL declaration — never a post-roll source", () => {
    // The attack-die half is unchanged by this fix: with the rule ON the card is
    // offered BEFORE the roll and is absent from the post-roll attack window (so
    // it can never be spent after seeing that die). Pinned here beside the
    // ability half so the two windows' split cannot silently drift.
    const state = createInitialGameState("prophecy-attack-split");
    state.adventure = {
      houseRules: { "polish-card-balance": true, "combat-move-initiative": false }
    } as unknown as GameState["adventure"];
    const attacker = state.combat!.units.unit_p1_marksmen;
    attacker.abilities = [];
    attacker.attack = 5;
    attacker.position = 1;
    const defender = state.combat!.units.unit_p2_skeletons;
    defender.abilities = [];
    defender.position = 13;
    defender.defense = 0;
    defender.maxHealth = 40;
    defender.damage = 0;
    state.players.p1.hand = [PROPHECY];
    state.players.p2.hand = [];
    state.players.p1.morale = 0;
    state.combat!.dice.scriptedRolls = [-1, 0, 1];
    state.combat!.dice.rollCount = 0;
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_marksmen";
    const declared = applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_marksmen",
      defenderId: "unit_p2_skeletons"
    });
    // The PRE-roll offer, before anything is thrown.
    expect(
      getLegalActions(declared, "p1").some((legal) => legal.action.type === "USE_PROPHECY_PRE_ROLL"),
      "the attack die is declared on BEFORE the roll"
    ).toBe(true);
    // Passing it resolves the single first face — the card is not a post-roll
    // attack-die source and no window pauses the roll.
    const passed = passAllReactions(declared);
    expect(passed.pendingChoice ?? undefined).toBeUndefined();
    expect(passed.combat!.units.unit_p2_skeletons.damage).toBe(4);
    expect(passed.players.p1.hand).toContain(PROPHECY);
  });
});
