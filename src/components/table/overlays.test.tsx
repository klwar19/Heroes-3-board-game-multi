// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DICE_PRESENT_MS, DiceOverlay, NeutralStepOverlay, ReactionTray, SearchModal, type DiceCue } from "./overlays";
import { CardZoomProvider } from "./zoom";
import {
  applyAction,
  createInitialGameState,
  getLegalActions,
  getPlayerView,
  type GameAction,
  type GameState,
  type LegalAction,
  type PlayerId
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

  function trayFor(state: GameState, viewer: PlayerId) {
    return (
      <CardZoomProvider>
        <ReactionTray
          legalActions={getLegalActions(state, viewer)}
          onAction={() => {}}
          state={state}
          view={getPlayerView(state, viewer)}
          viewerPlayerId={viewer}
        />
      </CardZoomProvider>
    );
  }

  it("offers the attacked side its Resistance against the attacker's Curse", () => {
    const state = createInitialGameState("tray-resist-seed");
    state.players.p1.hand = ["spell.curse"];
    state.players.p2.hand = ["ability.resistance"];
    state.combat!.activeUnitId = "unit_p1_griffins";
    const griffins = state.combat!.units.unit_p1_griffins;
    griffins.activatedThisRound = false;
    griffins.abilities = [];
    griffins.position = 9;
    state.combat!.units.unit_p2_skeletons.position = 13;

    const declared = applyAction(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_griffins",
      defenderId: "unit_p2_skeletons"
    });
    expect(declared.errors).toEqual([]);
    // p1 casts Curse; p1 has no more cards, so priority moves to p2.
    let next = applyAction(declared.state, { type: "PLAY_REACTION", playerId: "p1", cardId: "spell.curse", mode: "basic" });
    expect(next.errors).toEqual([]);
    while (next.state.reactionWindow && next.state.reactionWindow.priorityPlayerId === "p1") {
      next = applyAction(next.state, { type: "PASS_REACTION", playerId: "p1" });
    }
    expect(next.state.reactionWindow?.priorityPlayerId).toBe("p2");

    render(trayFor(next.state, "p2"));
    // p2 sees its Resistance card offered to end the Curse on this attack.
    expect(screen.getByText("Resistance")).toBeTruthy();
  });

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

describe("ReactionTray — live Power readout", () => {
  function trayFor(state: GameState, viewer: PlayerId) {
    return (
      <CardZoomProvider>
        <ReactionTray
          legalActions={getLegalActions(state, viewer)}
          onAction={() => {}}
          state={state}
          view={getPlayerView(state, viewer)}
          viewerPlayerId={viewer}
        />
      </CardZoomProvider>
    );
  }

  /** p1 casts Magic Arrow at p2's skeletons, holding spare Power to empower. */
  function castWindow(): GameState {
    const state = createInitialGameState("tray-power-seed");
    state.players.p1.hand = ["spell.magic_arrow", "stat.power", "stat.power"];
    state.players.p2.hand = ["spell.magic_mirror"];
    state.combat!.activeUnitId = "unit_p1_marksmen";
    state.combat!.units.unit_p1_marksmen.activatedThisRound = false;
    const cast = applyAction(state, {
      type: "CAST_SPELL",
      playerId: "p1",
      cardId: "spell.magic_arrow",
      target: { type: "unit", unitId: "unit_p2_skeletons" }
    });
    expect(cast.errors).toEqual([]);
    return cast.state;
  }

  it("shows the caster the spell's current Power, climbing as Power is paid", () => {
    const state = castWindow();
    // p1 (caster) holds priority first; the readout opens at Power 0.
    render(trayFor(state, "p1"));
    expect(screen.getByText("Power 0")).toBeTruthy();
    expect(screen.getByText(/no Power added yet/)).toBeTruthy();
    cleanup();

    const empowered = applyAction(state, {
      type: "PLAY_REACTION",
      playerId: "p1",
      cardId: "stat.power",
      mode: "basic"
    });
    expect(empowered.errors).toEqual([]);
    render(trayFor(empowered.state, "p1"));
    // Magic Arrow at Power 1 reads "Power 1" and "2 damage", with the fuel split.
    expect(screen.getByText("Power 1")).toBeTruthy();
    expect(screen.getByText(/2 damage · 0 base \+ 1 fuelled/)).toBeTruthy();
  });

  it("shows the waiting opponent the same live Power so they can judge Resistance vs Magic Mirror", () => {
    const state = castWindow();
    // p2 is not on priority (the caster is), so it sees the waiting strip — which
    // still carries the Power readout.
    render(trayFor(state, "p2"));
    expect(screen.getByText("Power 0")).toBeTruthy();
  });
});

describe("ReactionTray — Sorrow pays its skip with a Power-value cost picker", () => {
  function trayFor(state: GameState, onAction: (action: GameAction) => void) {
    return (
      <CardZoomProvider>
        <ReactionTray
          legalActions={getLegalActions(state, "p1")}
          onAction={onAction}
          state={state}
          view={getPlayerView(state, "p1")}
          viewerPlayerId="p1"
        />
      </CardZoomProvider>
    );
  }

  /** A silver unit (vampires) is about to activate; p1 holds Sorrow + `power`. */
  function silverSkipWindow(power: string[]): GameState {
    const state = createInitialGameState("sorrow-tray-seed");
    state.players.p1.hand = ["spell.sorrow", ...power];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";
    for (const unit of Object.values(state.combat!.units)) {
      unit.activatedThisRound = unit.id !== "unit_p1_griffins" && unit.id !== "unit_p2_vampires";
    }
    const result = applyAction(state, { type: "DEFEND_UNIT", playerId: "p1", unitId: "unit_p1_griffins" });
    expect(result.errors).toEqual([]);
    expect(result.state.reactionWindow?.priorityPlayerId).toBe("p1");
    expect(result.state.combat!.activeUnitId).toBe("unit_p2_vampires");
    return result.state;
  }

  const confirmButton = () => screen.getByRole("button", { name: /play card/i }) as HTMLButtonElement;

  it("gates the silver skip until two +1 Power cards are clicked, then plays them as the cost", () => {
    // Before this fix the silver/gold skip (a `powerCost`, not a `discardCards`,
    // cost) drew NO payment picker, so the Power could never be added and the play
    // was rejected by the engine. The picker must let the player click Power.
    const state = silverSkipWindow(["stat.power", "stat.power"]);

    const onAction = vi.fn();
    render(trayFor(state, onAction));

    const pick = screen.getByRole("button", { name: /skip a silver unit/i });
    act(() => fireEvent.click(pick));
    expect(confirmButton().disabled, "2 Power is owed but none paid yet").toBe(true);

    // Two Power chips, each worth +1, appear in the picker.
    const chips = () => screen.getAllByRole("button", { name: /^Power \(\+1\)$/ });
    expect(chips()).toHaveLength(2);

    act(() => fireEvent.click(chips()[0]));
    expect(confirmButton().disabled, "1 of 2 Power is not enough").toBe(true);

    act(() => fireEvent.click(chips()[1]));
    expect(confirmButton().disabled, "2 Power reaches the silver skip").toBe(false);

    act(() => fireEvent.click(confirmButton()));
    expect(onAction).toHaveBeenCalledTimes(1);
    const played = onAction.mock.calls[0][0] as Extract<GameAction, { type: "PLAY_REACTION" }>;
    expect(played).toMatchObject({ type: "PLAY_REACTION", playerId: "p1", cardId: "spell.sorrow", optionIndex: 1 });
    expect(played.costCardIds).toEqual(["stat.power", "stat.power"]);

    // The engine accepts exactly that action: the silver vampires are skipped.
    const applied = applyAction(state, played);
    expect(applied.errors).toEqual([]);
    expect(applied.state.combat!.units.unit_p2_vampires.activatedThisRound).toBe(true);
  });

  it("reaches the silver skip with one +2 Power card (value, not card count) and blocks over-paying", () => {
    // The cost is a Power VALUE: a single +2 source pays the 2-Power skip on its
    // own, where the old "discard 2 cards" rule demanded two. A spare +1 Power
    // card is then disabled, so the engine's no-over-pay rule is never tripped.
    const state = silverSkipWindow(["artifact.necklace_of_dragonteeth", "stat.power"]);

    const onAction = vi.fn();
    render(trayFor(state, onAction));

    act(() => fireEvent.click(screen.getByRole("button", { name: /skip a silver unit/i })));
    const necklace = screen.getByRole("button", { name: /necklace of dragonteeth \(\+2\)/i });
    act(() => fireEvent.click(necklace));

    // The +2 alone satisfies the skip, so the spare +1 Power chip is disabled.
    expect(confirmButton().disabled).toBe(false);
    expect((screen.getByRole("button", { name: /^Power \(\+1\)$/ }) as HTMLButtonElement).disabled).toBe(true);

    act(() => fireEvent.click(confirmButton()));
    const played = onAction.mock.calls[0][0] as Extract<GameAction, { type: "PLAY_REACTION" }>;
    expect(played.costCardIds).toEqual(["artifact.necklace_of_dragonteeth"]);
    const applied = applyAction(state, played);
    expect(applied.errors).toEqual([]);
    expect(applied.state.combat!.units.unit_p2_vampires.activatedThisRound).toBe(true);
  });
});

describe("ReactionTray — Magic Mirror's paid redirect can pay its cost in the picker", () => {
  function trayFor(state: GameState, onAction: (action: GameAction) => void) {
    return (
      <CardZoomProvider>
        <ReactionTray
          legalActions={getLegalActions(state, "p1")}
          onAction={onAction}
          state={state}
          view={getPlayerView(state, "p1")}
          viewerPlayerId="p1"
        />
      </CardZoomProvider>
    );
  }

  /** p2 casts Magic Arrow at p1's griffins; p1 holds Magic Mirror + 1 Power. */
  function redirectWindow(): GameState {
    const state = createInitialGameState("mirror-tray-seed");
    state.players.p1.hand = ["spell.magic_mirror", "stat.power"];
    state.players.p2.hand = ["spell.magic_arrow"];
    state.activePlayerId = "p2";
    state.combat!.activeUnitId = "unit_p2_skeletons";
    state.combat!.units.unit_p2_skeletons.activatedThisRound = false;
    const cast = applyAction(state, {
      type: "CAST_SPELL",
      playerId: "p2",
      cardId: "spell.magic_arrow",
      target: { type: "unit", unitId: "unit_p1_griffins" }
    });
    expect(cast.errors).toEqual([]);
    expect(cast.state.reactionWindow?.priorityPlayerId).toBe("p1");
    return cast.state;
  }

  it("draws a cost picker for the silver redirect (a non-batchable play that still owes 1 Power)", () => {
    // REDIRECT_SPELL is window-ending (non-batchable), so the tray used to render
    // it as a lone one-click button — fine for the FREE bronze grade, but the
    // silver/gold grades owe Power and the engine rejects a play that pays none.
    // A paid window-ender must offer the cost picker, kept solo, fired by Confirm.
    const state = redirectWindow();
    const onAction = vi.fn();
    render(trayFor(state, onAction));

    // Free bronze redirect stays a one-click button…
    expect(screen.getByRole("button", { name: /redirect the spell to a bronze unit/i })).toBeTruthy();
    // …the paid silver redirect now gets a pick + payment picker.
    act(() => fireEvent.click(screen.getByRole("button", { name: /bronze or silver unit \(pay 1 power\)/i })));

    const confirm = () => screen.getByRole("button", { name: /play card/i }) as HTMLButtonElement;
    expect(confirm().disabled, "1 Power is owed but unpaid").toBe(true);

    act(() => fireEvent.click(screen.getByRole("button", { name: /^Power$/ })));
    expect(confirm().disabled, "the 1-Power cost is now covered").toBe(false);

    act(() => fireEvent.click(confirm()));
    expect(onAction).toHaveBeenCalledTimes(1);
    const played = onAction.mock.calls[0][0] as Extract<GameAction, { type: "PLAY_REACTION" }>;
    expect(played).toMatchObject({ type: "PLAY_REACTION", cardId: "spell.magic_mirror", optionIndex: 1 });
    expect(played.costCardIds).toEqual(["stat.power"]);

    // The engine accepts it: the redirect's new-target choice opens, no errors.
    const applied = applyAction(state, played);
    expect(applied.errors).toEqual([]);
    expect(applied.state.pendingChoice?.type).toBe("ABILITY_TARGET_CHOICE");
  });
});

describe("ReactionTray — Bowstring carries its chosen ranged unit through the play", () => {
  function trayFor(state: GameState, onAction: (action: GameAction) => void) {
    return (
      <CardZoomProvider>
        <ReactionTray
          legalActions={getLegalActions(state, "p1")}
          onAction={onAction}
          state={state}
          view={getPlayerView(state, "p1")}
          viewerPlayerId="p1"
        />
      </CardZoomProvider>
    );
  }

  /** Enemy skeletons about to act; p1 holds Bowstring + a fresh ranged Marksmen. */
  function bowstringWindow(): GameState {
    const state = createInitialGameState("bowstring-tray-seed");
    state.players.p1.hand = ["artifact.bowstring_of_the_unicorns_mane"];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";
    const marksmen = state.combat!.units.unit_p1_marksmen;
    marksmen.type = "ranged";
    marksmen.initiative = 1;
    state.combat!.units.unit_p2_skeletons.initiative = 99;
    for (const unit of Object.values(state.combat!.units)) {
      unit.activatedThisRound = !["unit_p1_griffins", "unit_p2_skeletons", "unit_p1_marksmen"].includes(unit.id);
    }
    const result = applyAction(state, { type: "DEFEND_UNIT", playerId: "p1", unitId: "unit_p1_griffins" });
    expect(result.errors).toEqual([]);
    expect(result.state.reactionWindow?.priorityPlayerId).toBe("p1");
    expect(result.state.combat!.activeUnitId).toBe("unit_p2_skeletons");
    return result.state;
  }

  it("fires the out-of-order activation WITH its target, so the engine activates that unit (not a no-op)", () => {
    // The reaction's per-unit target rides only on a single PLAY_REACTION. The
    // tray used to group plays by card+option and drop the target, so the engine
    // received a targetless play and silently activated nobody. The button must
    // carry the unit it names.
    const state = bowstringWindow();
    const onAction = vi.fn();
    render(trayFor(state, onAction));

    act(() => fireEvent.click(screen.getByRole("button", { name: /activate/i })));
    expect(onAction).toHaveBeenCalledTimes(1);
    const played = onAction.mock.calls[0][0] as Extract<GameAction, { type: "PLAY_REACTION" }>;
    expect(played).toMatchObject({
      type: "PLAY_REACTION",
      cardId: "artifact.bowstring_of_the_unicorns_mane",
      optionIndex: 0,
      target: { type: "unit", unitId: "unit_p1_marksmen" }
    });

    const applied = applyAction(state, played);
    expect(applied.errors).toEqual([]);
    expect(applied.state.combat!.activeUnitId).toBe("unit_p1_marksmen");
  });
});

describe("SearchModal — Basic X Magic surfaces a School-of-Magic fetch", () => {
  function searchState(): GameState {
    const state = createInitialGameState("modal-fetch");
    state.activePlayerId = "p1";
    state.players.p1.hand = [];
    state.activeEffects.push({
      id: "fetch_air",
      name: "Basic Air Magic",
      scope: "player",
      duration: { type: "permanent" },
      polarity: "positive",
      removable: false,
      modifiers: [{ type: "SPELL_SCHOOL_FETCH", school: "air" }],
      source: { type: "card", cardId: "ability.basic_air_magic", controllerId: "p1" },
      controllerId: "p1",
      startedRound: state.round,
      startedCombatRound: state.combat?.round ?? 0,
      usedRollEventIds: [],
      usedChoiceIds: [],
      usedCombatRoundNumbers: []
    } as (typeof state.activeEffects)[number]);
    state.decks["spells"].drawPile = ["spell.haste", "spell.slow", "spell.slow", "spell.slow"];
    state.decks["spells"].discardPile = [];
    return applyAction(state, { type: "SEARCH_DECK", playerId: "p1", deckId: "spells", count: 2 }).state;
  }

  it("renders both keep-a-card and 'draw from the School of Magic', and dispatches the fetch", () => {
    const state = searchState();
    const onAction = vi.fn();
    render(
      <CardZoomProvider>
        <SearchModal state={state} view={getPlayerView(state, "p1")} viewerPlayerId="p1" onAction={onAction} />
      </CardZoomProvider>
    );

    // The normal "buy" branch (keep a revealed card) is still offered…
    expect(screen.getAllByRole("button", { name: /Keep / }).length).toBeGreaterThan(0);
    // …alongside the School-of-Magic fetch.
    const fetchButton = screen.getByRole("button", { name: /Draw the first Air Magic spell/i });
    fireEvent.click(fetchButton);

    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "RESOLVE_DECK_SEARCH",
        playerId: "p1",
        pick: { kind: "school-fetch", school: "air" }
      })
    );
  });
});
