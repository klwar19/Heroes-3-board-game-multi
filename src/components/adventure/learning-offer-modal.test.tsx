// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { LearningOfferModal, PromptTray } from "./screen";
import {
  createAdventureGameState,
  gainExperience,
  getLegalActions,
  getMainHero,
  levelOfExperience,
  pumpAdventureQueues
} from "@/engine";

afterEach(cleanup);

/**
 * Builds a real game state sitting on the Learning level-up offer: the Hero is
 * set to `experience`, given the Learning card (plus optional extras), then gains
 * 1 Experience and the queue is pumped — exactly as a Field visit / combat win
 * that crossed a level would do. This is the genuine engine state, not a mock.
 */
function gameOnLearningOffer(experience: number, opts: { exhaustExpert?: boolean } = {}) {
  const state = createAdventureGameState({ seed: "learning-ui", difficulty: "normal", rollFirstPlayer: false });
  const hero = getMainHero(state, "p1")!;
  hero.experience = experience;
  hero.level = levelOfExperience(experience);
  state.players.p1.hand = ["ability.learning"];
  // gainExperience crosses the level (queuing the offer + raising the expert-use
  // limit); to model "no crown left" we spend every expert use AFTER the gain but
  // BEFORE the pump, since the offer reads the available count at pump time.
  gainExperience(state, "p1", 1);
  if (opts.exhaustExpert) {
    state.players.p1.combatStats.expertUsesSpentThisRound = state.players.p1.limits.expertUses;
  }
  pumpAdventureQueues(state);
  return state;
}

describe("LearningOfferModal", () => {
  it("renders nothing when there is no Learning offer pending", () => {
    const state = createAdventureGameState({ seed: "no-offer", rollFirstPlayer: false });
    const { container } = render(
      <LearningOfferModal legalActions={getLegalActions(state, "p1")} onAction={vi.fn()} state={state} viewerPlayerId="p1" />
    );
    expect(container.innerHTML).toBe("");
  });

  it("pops up showing the Learning card and both the basic and expert (crown) plays", () => {
    const state = gameOnLearningOffer(5); // exp 6 (lvl 4), an expert use available
    render(
      <LearningOfferModal legalActions={getLegalActions(state, "p1")} onAction={vi.fn()} state={state} viewerPlayerId="p1" />
    );

    const dialog = screen.getByRole("dialog", { name: /Learning/i });
    expect(within(dialog).getByText(/about to level up/i)).toBeTruthy();
    // The Learning card art is shown ("with learning in hand").
    expect(within(dialog).getByRole("img", { name: /Learning/i })).toBeTruthy();
    // Both plays plus Decline are offered.
    expect(within(dialog).getByRole("button", { name: /advance a half level/i })).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: /advance a full level/i })).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: /Decline/i })).toBeTruthy();
  });

  it("hides the expert play when no expert use (crown) is available", () => {
    const state = gameOnLearningOffer(5, { exhaustExpert: true });
    render(
      <LearningOfferModal legalActions={getLegalActions(state, "p1")} onAction={vi.fn()} state={state} viewerPlayerId="p1" />
    );
    const dialog = screen.getByRole("dialog", { name: /Learning/i });
    expect(within(dialog).getByRole("button", { name: /advance a half level/i })).toBeTruthy();
    expect(within(dialog).queryByRole("button", { name: /advance a full level/i })).toBeNull();
  });

  it("dispatches the chosen CHOOSE_OPTION when the expert play is clicked", () => {
    const state = gameOnLearningOffer(5);
    const onAction = vi.fn();
    render(
      <LearningOfferModal legalActions={getLegalActions(state, "p1")} onAction={onAction} state={state} viewerPlayerId="p1" />
    );

    fireEvent.click(screen.getByRole("button", { name: /advance a full level/i }));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction.mock.calls[0][0]).toMatchObject({
      type: "CHOOSE_OPTION",
      playerId: "p1",
      optionIndex: 1 // [basic, expert] -> expert is index 1
    });
  });

  it("is NOT also rendered by the generic PromptTray (no duplicate popup)", () => {
    const state = gameOnLearningOffer(5);
    const { container } = render(
      <PromptTray legalActions={getLegalActions(state, "p1")} onAction={vi.fn()} state={state} viewerPlayerId="p1" />
    );
    // The dedicated modal owns this context; the generic tray stays out of it.
    expect(container.innerHTML).toBe("");
  });

  it("shows a quiet waiting strip (no dialog) when another player is deciding", () => {
    const state = gameOnLearningOffer(5);
    render(
      <LearningOfferModal legalActions={getLegalActions(state, "p2")} onAction={vi.fn()} state={state} viewerPlayerId="p2" />
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText(/about to level up/i)).toBeTruthy();
  });
});
