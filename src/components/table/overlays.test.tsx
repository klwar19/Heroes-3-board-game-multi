// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DICE_PRESENT_MS, DiceOverlay, NeutralStepOverlay, ReactionTray, type DiceCue } from "./overlays";
import { CardZoomProvider } from "./zoom";
import {
  applyAction,
  createInitialGameState,
  getLegalActions,
  getPlayerView,
  type GameState,
  type LegalAction
} from "@/engine";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/** A bare attack-roll cue; `preDelayMs` is the neutral move-then-attack hold. */
function diceCue(overrides: Partial<DiceCue> = {}): DiceCue {
  return {
    id: "roll1",
    rolls: [1],
    roll: 1,
    dieMultiplier: 1,
    rollMode: "normal",
    attackerName: "Marksmen",
    defenderName: "Griffins",
    attackValue: 8,
    defenseValue: 5,
    attackBonus: 0,
    defenseBonus: 0,
    damage: 3,
    isRetaliation: false,
    ...overrides
  };
}

describe("DiceOverlay — tabletop pacing & neutral pre-attack pause", () => {
  it("rolls right away and settles after the roll when there is no pre-delay", () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    render(<DiceOverlay cue={diceCue()} onDone={onDone} />);

    // The dice are on screen from the first frame.
    expect(screen.getByRole("status", { name: /attack roll/i })).toBeTruthy();

    // It holds for the full roll-then-read window before dismissing itself.
    act(() => vi.advanceTimersByTime(DICE_PRESENT_MS - 100));
    expect(onDone).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(200));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("keeps the board clear during the pause, then throws the die", () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    // A neutral guard slid into range first: hold ~2.6s before the die appears.
    const preDelayMs = 2640;
    render(<DiceOverlay cue={diceCue({ preDelayMs })} onDone={onDone} />);

    // Nothing renders while the guard's move is read on the board below.
    expect(screen.queryByRole("status", { name: /attack roll/i })).toBeNull();
    act(() => vi.advanceTimersByTime(2000));
    expect(screen.queryByRole("status", { name: /attack roll/i })).toBeNull();

    // After the pause the die is thrown, and only then does the read clock start.
    act(() => vi.advanceTimersByTime(700));
    expect(screen.getByRole("status", { name: /attack roll/i })).toBeTruthy();
    expect(onDone).not.toHaveBeenCalled();

    // The pre-delay shifts the whole roll-then-read window later.
    act(() => vi.advanceTimersByTime(DICE_PRESENT_MS));
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});

describe("DiceOverlay — summed (Slayer/Inferno) and spell-roll modes", () => {
  it("keeps every die lit when all dice count (Slayer / apply-both)", () => {
    vi.useFakeTimers();
    // Two "+1"s summed to roll 2: a keep-one roll would dim both (neither equals
    // the sum), but a summed roll lights them all.
    const { container } = render(
      <DiceOverlay cue={diceCue({ rolls: [1, 1], roll: 2, sumAllDice: true })} onDone={vi.fn()} />
    );
    act(() => vi.advanceTimersByTime(2000)); // past the tumble, now settled
    expect(container.querySelectorAll(".dieScene").length).toBe(2);
    expect(container.querySelectorAll(".dieScene.dimmed").length).toBe(0);
  });

  it("still dims the unused face on an advantage keep-one roll (control)", () => {
    vi.useFakeTimers();
    const { container } = render(
      <DiceOverlay cue={diceCue({ rolls: [1, 0], roll: 1, rollMode: "advantage" })} onDone={vi.fn()} />
    );
    act(() => vi.advanceTimersByTime(2000));
    expect(container.querySelectorAll(".dieScene.dimmed").length).toBe(1);
  });

  it("shows the spell name and hit read-out in spell-roll mode (Inferno)", () => {
    vi.useFakeTimers();
    const { container } = render(
      <DiceOverlay
        cue={diceCue({
          spellMode: true,
          title: "Inferno",
          rolls: [1, 1, 1, 0],
          roll: 3,
          sumAllDice: true,
          caption: "3 hits → 3 damage each"
        })}
        onDone={vi.fn()}
      />
    );
    // Headed by the spell, not "Attack! … → …".
    expect(screen.getByRole("status", { name: /inferno roll/i })).toBeTruthy();
    act(() => vi.advanceTimersByTime(2000));
    expect(screen.getByText("Inferno")).toBeTruthy();
    expect(screen.getByText(/3 hits/)).toBeTruthy();
    // No attacker-vs-defender combat breakdown in spell mode.
    expect(container.querySelector(".versus")).toBeNull();
    expect(container.querySelector(".formula")).toBeNull();
    // Every die stays lit.
    expect(container.querySelectorAll(".dieScene.dimmed").length).toBe(0);
  });
});

/** Minimal state carrying a pre-activation guard pause for the overlay. */
function pauseState(intentTargetName?: string): GameState {
  return {
    players: { p1: { name: "You" }, neutrals: { name: "Neutrals" } },
    combat: {
      attackerPlayerId: "p1",
      units: { guard1: { id: "guard1", name: "Marksmen" } },
      pendingNeutralStep: {
        kind: "pre-activation",
        unitId: "guard1",
        name: "Marksmen",
        reactingPlayerId: "p1",
        intent: { kind: "attack", targetName: intentTargetName }
      }
    }
  } as unknown as GameState;
}

const resume: LegalAction = {
  label: "Let the unit act",
  action: { type: "CONTINUE_NEUTRAL_STEP", playerId: "p1" }
};
const castArrow: LegalAction = {
  label: "Cast Magic Arrow",
  action: { type: "CAST_SPELL", playerId: "p1", cardId: "spell.magic_arrow", target: { type: "none" } }
};

describe("NeutralStepOverlay — guard-step pacing", () => {
  it("auto-resumes after 2s when the player has nothing to react with", () => {
    vi.useFakeTimers();
    const onAction = vi.fn();
    render(<NeutralStepOverlay legalActions={[resume]} onAction={onAction} state={pauseState("Griffins")} viewerPlayerId="p1" />);

    // The pop-up shows the guard's planned attack and the auto-continue note.
    expect(screen.getByText(/Marksmen is about to attack your Griffins/)).toBeTruthy();
    expect(screen.getByText(/continuing automatically/i)).toBeTruthy();

    // Nothing fires before the beat is up; it resumes itself at 2s.
    act(() => vi.advanceTimersByTime(1900));
    expect(onAction).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(200));
    expect(onAction).toHaveBeenCalledWith({ type: "CONTINUE_NEUTRAL_STEP", playerId: "p1" });
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it("waits indefinitely when the player can actually react (no auto-resume)", () => {
    vi.useFakeTimers();
    const onAction = vi.fn();
    render(
      <NeutralStepOverlay legalActions={[castArrow, resume]} onAction={onAction} state={pauseState()} viewerPlayerId="p1" />
    );

    // A real reaction is on offer, so the pause prompts the player and holds.
    expect(screen.getByText(/Cast a Spell or play an instant/i)).toBeTruthy();
    act(() => vi.advanceTimersByTime(10000));
    expect(onAction).not.toHaveBeenCalled();
  });

  it("does not resume for a player who does not hold the pause", () => {
    vi.useFakeTimers();
    const onAction = vi.fn();
    // No CONTINUE action in this viewer's legal actions: they are a spectator
    // to the pause and must never auto-dispatch a resume.
    render(<NeutralStepOverlay legalActions={[]} onAction={onAction} state={pauseState()} viewerPlayerId="p2" />);

    expect(screen.getByText(/Waiting for/i)).toBeTruthy();
    act(() => vi.advanceTimersByTime(10000));
    expect(onAction).not.toHaveBeenCalled();
  });
});

describe("ReactionTray — in-progress selection survives only until the hand changes", () => {
  /** Sandbox attack window with p1 holding two Attack statistic cards. */
  function attackWindowState(hand: string[]): GameState {
    const state = createInitialGameState("tray-selection-seed");
    state.players.p1.hand = hand;
    state.players.p2.hand = [];
    state.combat!.units.unit_p1_griffins.position = 9;
    state.combat!.units.unit_p2_skeletons.position = 13;
    const result = applyAction(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_griffins",
      defenderId: "unit_p2_skeletons"
    });
    expect(result.errors).toEqual([]);
    return result.state;
  }

  function tray(state: GameState) {
    return (
      <CardZoomProvider>
        <ReactionTray
          legalActions={getLegalActions(state, "p1")}
          onAction={() => {}}
          state={state}
          view={getPlayerView(state, "p1")}
          viewerPlayerId="p1"
        />
      </CardZoomProvider>
    );
  }

  function renderTray(state: GameState) {
    return render(tray(state));
  }

  it("clears the picked statistic after one is played so the next can be added one-by-one", () => {
    // p1 holds two Attack statistics; the attacker keeps priority after each
    // play, so the tray is NOT remounted between plays. Picking one then playing
    // it must not leave the (now shifted) hand index showing as still picked —
    // otherwise the second card cannot be added cleanly.
    const state = attackWindowState(["stat.attack", "stat.attack"]);
    const { rerender } = renderTray(state);

    const picks = screen.getAllByRole("button", { name: /add to play/i });
    expect(picks).toHaveLength(2);
    act(() => {
      fireEvent.click(picks[0]);
    });
    expect(screen.getAllByRole("button").some((button) => button.getAttribute("aria-pressed") === "true")).toBe(true);

    // One Attack statistic is played; p1 still has priority and one card left.
    const afterPlay = applyAction(state, {
      type: "PLAY_REACTION",
      playerId: "p1",
      cardId: "stat.attack",
      mode: "basic"
    });
    expect(afterPlay.errors).toEqual([]);
    expect(afterPlay.state.reactionWindow?.priorityPlayerId).toBe("p1");

    rerender(tray(afterPlay.state));

    // The leftover Attack statistic is offered, and nothing is stuck "picked".
    expect(screen.getAllByRole("button", { name: /add to play/i })).toHaveLength(1);
    expect(screen.getAllByRole("button").some((button) => button.getAttribute("aria-pressed") === "true")).toBe(false);
  });
});

describe("ReactionTray — Power can still be added after Slayer arms the attack", () => {
  function tray(state: GameState) {
    return (
      <CardZoomProvider>
        <ReactionTray
          legalActions={getLegalActions(state, "p1")}
          onAction={() => {}}
          state={state}
          view={getPlayerView(state, "p1")}
          viewerPlayerId="p1"
        />
      </CardZoomProvider>
    );
  }

  it("does NOT block a lone +1 Power once Slayer is on the pending attack", () => {
    const state = createInitialGameState("tray-slayer-seed");
    state.players.p1.hand = ["spell.slayer", "spell.haste"]; // haste = a Spell to discard for Power
    state.players.p2.hand = [];
    state.combat!.activeUnitId = "unit_p1_griffins";
    const griffins = state.combat!.units.unit_p1_griffins;
    griffins.activatedThisRound = false;
    griffins.abilities = [];
    griffins.position = 9;
    const dread = state.combat!.units.unit_p2_dread_knights; // gold — Slayer's target
    dread.abilities = [];
    dread.position = 13;

    const declared = applyAction(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_griffins",
      defenderId: "unit_p2_dread_knights"
    });
    expect(declared.errors).toEqual([]);

    // Play Slayer: the window stays open with p1 still on priority and the attack
    // now empowerable, so further Power discards are legal.
    const played = applyAction(declared.state, {
      type: "PLAY_REACTION",
      playerId: "p1",
      cardId: "spell.slayer",
      mode: "basic"
    });
    expect(played.errors).toEqual([]);
    expect(played.state.reactionWindow?.priorityPlayerId).toBe("p1");

    render(tray(played.state));

    // Pick the "Discard Haste for +1 Power" boost on its own.
    const pick = screen.getByRole("button", { name: /discard for \+1 power/i });
    act(() => fireEvent.click(pick));

    // The confirm button is enabled and the "Power needs a Spell" warning is gone:
    // before the fix the tray rejected a lone Power boost even though Slayer had
    // already armed the attack.
    const confirm = screen.getByRole("button", { name: /play card/i }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(false);
    expect(screen.queryByText(/power only counts with a spell/i)).toBeNull();
  });
});
