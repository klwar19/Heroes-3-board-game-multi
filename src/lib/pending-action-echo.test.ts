import { describe, expect, it } from "vitest";
import type { GameAction } from "@/engine";
import {
  beginPendingEcho,
  initialPendingEchoState,
  PENDING_ECHO_TTL_MS,
  pendingEchoCardIds,
  prunePendingEchoes,
  resolvePendingEcho
} from "./pending-action-echo";

const playCard = (cardId: string): GameAction =>
  ({ type: "PLAY_CARD", playerId: "p1", cardId }) as GameAction;

describe("pending-action echo (plan slice N2)", () => {
  it("tracks a submit and resolves it on ack", () => {
    const begin = beginPendingEcho(initialPendingEchoState(), playCard("spell.haste"), 1_000);
    expect(begin.accepted).toBe(true);
    if (!begin.accepted) throw new Error("unreachable");
    expect(pendingEchoCardIds(begin.state).has("spell.haste")).toBe(true);

    const acked = resolvePendingEcho(begin.state, begin.id);
    expect(acked.entries).toHaveLength(0);
    expect(pendingEchoCardIds(acked).has("spell.haste")).toBe(false);
  });

  it("restores on an error result exactly like an ack (rollback = drop the CSS state)", () => {
    const begin = beginPendingEcho(initialPendingEchoState(), playCard("spell.haste"), 1_000);
    if (!begin.accepted) throw new Error("unreachable");
    // The submit settled with rules errors: the same resolve un-dims the card.
    const restored = resolvePendingEcho(begin.state, begin.id);
    expect(pendingEchoCardIds(restored).size).toBe(0);
    // Resolving an unknown id is a same-reference no-op.
    expect(resolvePendingEcho(restored, 999)).toBe(restored);
  });

  it("suppresses a duplicate submit of the SAME action while in flight, never a different one", () => {
    const first = beginPendingEcho(initialPendingEchoState(), playCard("spell.haste"), 1_000);
    if (!first.accepted) throw new Error("unreachable");

    // Same action, still pending → refused (the double-click latch).
    const dup = beginPendingEcho(first.state, playCard("spell.haste"), 1_050);
    expect(dup.accepted).toBe(false);

    // A different action passes.
    const other = beginPendingEcho(first.state, playCard("spell.slow"), 1_060);
    expect(other.accepted).toBe(true);

    // Once resolved, the same action may be submitted again.
    const cleared = resolvePendingEcho(first.state, first.id);
    expect(beginPendingEcho(cleared, playCard("spell.haste"), 1_100).accepted).toBe(true);
  });

  it("expires stale entries on timeout so a lost ack can never wedge the latch shut", () => {
    const begin = beginPendingEcho(initialPendingEchoState(), playCard("spell.haste"), 1_000);
    if (!begin.accepted) throw new Error("unreachable");

    // Inside the TTL the latch holds…
    expect(beginPendingEcho(begin.state, playCard("spell.haste"), 1_000 + PENDING_ECHO_TTL_MS - 1).accepted).toBe(
      false
    );
    // …at/after the TTL the stale entry is swept and the resubmit is accepted.
    const retry = beginPendingEcho(begin.state, playCard("spell.haste"), 1_000 + PENDING_ECHO_TTL_MS);
    expect(retry.accepted).toBe(true);
    expect(retry.state.entries).toHaveLength(1);
  });

  it("clear-on-snapshot: the TTL prune drops hung entries and keeps live ones (same reference when clean)", () => {
    const first = beginPendingEcho(initialPendingEchoState(), playCard("spell.haste"), 1_000);
    if (!first.accepted) throw new Error("unreachable");
    const second = beginPendingEcho(first.state, playCard("spell.slow"), 10_000);
    if (!second.accepted) throw new Error("unreachable");

    // Nothing stale yet → the SAME reference (no render churn on snapshots).
    expect(prunePendingEchoes(second.state, 11_000)).toBe(second.state);

    // The first entry outlives the TTL (its ack was lost) → swept; the newer
    // in-flight entry survives.
    const pruned = prunePendingEchoes(second.state, 1_000 + PENDING_ECHO_TTL_MS);
    expect(pruned.entries.map((entry) => entry.cardId)).toEqual(["spell.slow"]);
  });

  it("only true HAND plays dim a card: Spell Book / Scroll casts carry no cardId echo", () => {
    const bookPlay = {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "spell.town_portal",
      fromSpellBook: true
    } as GameAction;
    const begin = beginPendingEcho(initialPendingEchoState(), bookPlay, 1_000);
    if (!begin.accepted) throw new Error("unreachable");
    expect(pendingEchoCardIds(begin.state).size).toBe(0);
    // Non-card actions echo (for the latch) without a card id either.
    const endTurn = beginPendingEcho(begin.state, { type: "END_TURN", playerId: "p1" } as GameAction, 1_001);
    if (!endTurn.accepted) throw new Error("unreachable");
    expect(pendingEchoCardIds(endTurn.state).size).toBe(0);
  });
});
