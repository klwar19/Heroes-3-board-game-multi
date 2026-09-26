// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { createInitialGameState, type GameAction, type GameState, type LegalAction } from "@/engine";
import { hexApproachFollowUp, type HexApproachQueued } from "./board";

const ATTACKER = "unit_p1_crusaders";
const DEFENDER = "unit_p2_skeletons";
const NOW = 1_000_000;

/** A queued move-then-attack whose walk has landed on hex 30, the attack not yet sent. */
function arrived(seed: string): { state: GameState; queued: HexApproachQueued; attack: GameAction; offers: LegalAction[] } {
  const state = createInitialGameState(seed);
  const combat = state.combat!;
  const attacker = combat.units[ATTACKER];
  combat.activeUnitId = ATTACKER;
  attacker.attackedThisActivation = false;
  const origin = attacker.position;
  attacker.position = 30;
  const queued: HexApproachQueued = {
    attackerId: ATTACKER,
    defenderId: DEFENDER,
    destination: 30,
    origin,
    round: combat.round,
    activationStart: attacker.activationStartPosition,
    sentAt: NOW,
    arrivedAt: null
  };
  const attack: GameAction = { type: "ATTACK_UNIT", playerId: "p1", attackerId: ATTACKER, defenderId: DEFENDER };
  return { state, queued, attack, offers: [{ label: "Attack Skeletons", action: attack }] };
}

describe("hexApproachFollowUp (hex board move-then-attack click)", () => {
  it("CONTROL: once arrived with no prompt open, sends exactly the attack the engine offers", () => {
    const { state, queued, attack, offers } = arrived("hex-approach-send");
    expect(hexApproachFollowUp(queued, state, offers, "p1", NOW + 500)).toEqual({ kind: "send", action: attack });
  });

  it("a prompt / choice open after arrival cancels the queued attack (never sent later)", () => {
    const withChoice = arrived("hex-approach-choice");
    withChoice.state.pendingChoice = { id: "choice_trap", type: "OPTION_CHOICE", playerId: "p1" } as unknown as GameState["pendingChoice"];
    expect(hexApproachFollowUp(withChoice.queued, withChoice.state, [], "p1", NOW + 500)).toEqual({ kind: "drop" });
    // Even if the attack happens to be offered alongside the prompt.
    expect(hexApproachFollowUp(withChoice.queued, withChoice.state, withChoice.offers, "p1", NOW + 500)).toEqual({ kind: "drop" });

    const withWindow = arrived("hex-approach-window");
    withWindow.state.reactionWindow = { id: "rw" } as unknown as GameState["reactionWindow"];
    expect(hexApproachFollowUp(withWindow.queued, withWindow.state, [], "p1", NOW + 500)).toEqual({ kind: "drop" });
  });

  it("waits for a walk still on its origin hex, and drops one stopped short elsewhere", () => {
    const { state, queued, offers } = arrived("hex-approach-walking");
    state.combat!.units[ATTACKER].position = queued.origin;
    expect(hexApproachFollowUp(queued, state, offers, "p1", NOW + 100)).toEqual({ kind: "wait" });
    state.combat!.units[ATTACKER].position = queued.origin === 31 ? 32 : 31;
    expect(hexApproachFollowUp(queued, state, offers, "p1", NOW + 100)).toEqual({ kind: "drop" });
  });

  it("an offer a frame behind is waited for briefly, then dropped", () => {
    const { state, queued } = arrived("hex-approach-late-offer");
    expect(hexApproachFollowUp(queued, state, [], "p1", NOW + 100)).toEqual({ kind: "wait" });
    expect(queued.arrivedAt).toBe(NOW + 100);
    expect(hexApproachFollowUp(queued, state, [], "p1", NOW + 4200)).toEqual({ kind: "drop" });
  });
});
