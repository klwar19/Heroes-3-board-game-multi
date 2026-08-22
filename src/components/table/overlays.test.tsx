// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ABILITY_DICE_READ_MS,
  AfkVotePanel,
  DICE_PRESENT_MS,
  DICE_ROLL_MS,
  DiceOverlay,
  FirstPlayerRollOverlay,
  MapDiceOverlay,
  MapNoticeOverlay,
  MeteorPowerWindow,
  NeutralStepOverlay,
  REROLL_FLASH_MS,
  REROLL_TUMBLE_MS,
  ReactionTray,
  ResetVotePanel,
  RerollModal,
  type DiceCue
} from "./overlays";
import { CardZoomProvider } from "./zoom";
import {
  AFK_AUTO_KICK_MS,
  AFK_IDLE_MS,
  DEFAULT_ANIME_OPTIONS,
  applyAction,
  createAdventureGameState,
  createInitialGameState,
  getAfkState,
  getLegalActions,
  getPlayerView,
  TURN_TIME_LIMIT_MS,
  type GameAction,
  type GameState,
  type LegalAction,
  type PlayerId
} from "@/engine";
import { applyPermanentCombatEffects } from "@/engine/permanents";

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
  it("explicitly labels a printed follow-up as the 2nd attack", () => {
    render(
      <DiceOverlay
        cue={diceCue({
          attackerName: "Gold Dragons",
          defenderName: "Pegasi",
          attackValue: 3,
          damage: 3,
          abilityAttack: { name: "Dragon Breath", baseAttack: 3 }
        })}
        onDone={vi.fn()}
      />
    );

    expect(screen.getByText(/2nd attack — Dragon Breath \(Attack 3\)! Gold Dragons → Pegasi/i)).toBeTruthy();
    expect(screen.getByRole("status", { name: /attack roll/i })).toBeTruthy();
  });

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

describe("FirstPlayerRollOverlay opening confirmation", () => {
  it("waits for confirmation before rolling for first player", () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    render(
      <FirstPlayerRollOverlay
        cue={{
          id: "first-roll",
          attempts: [
            {
              rolls: [
                { playerId: "p1", name: "Player 1", value: 1 },
                { playerId: "p2", name: "Player 2", value: 0 }
              ]
            }
          ],
          winnerPlayerId: "p1",
          winnerName: "Player 1",
          order: [
            { playerId: "p1", name: "Player 1" },
            { playerId: "p2", name: "Player 2" }
          ]
        }}
        onDone={onDone}
      />
    );

    expect(screen.getByRole("button", { name: /roll for first player/i })).toBeTruthy();
    act(() => vi.advanceTimersByTime(10_000));
    expect(screen.queryByText(/plays first/i)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /roll for first player/i }));
    act(() => vi.advanceTimersByTime(10_000));
    expect(screen.getByText("Player 1 plays first!")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /begin the adventure/i }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});

describe("MapDiceOverlay — Treasure result is visibly staged before Resource dice", () => {
  it("labels the Treasure throw as step 1 and identifies its rolled face", () => {
    vi.useFakeTimers();
    render(
      <MapDiceOverlay
        cue={{
          id: "fluffy-treasure",
          playerName: "Adrienne",
          dice: "treasure",
          results: ["Roll 2 Resource dice, choose one"],
          treasureRolls: ["double-resource-die"]
        }}
        onDone={vi.fn()}
      />
    );

    expect(screen.getByText("STEP 1 · TREASURE DIE")).toBeTruthy();
    expect(screen.getByText(/Adrienne rolls the Treasure die/i)).toBeTruthy();
    act(() => vi.advanceTimersByTime(DICE_ROLL_MS + 20));
    expect(screen.getByText(/Treasure result → Roll 2 Resource dice, choose one/i)).toBeTruthy();
  });

  it("labels the caused Resource throw as a separate step 2", () => {
    vi.useFakeTimers();
    render(
      <MapDiceOverlay
        cue={{
          id: "fluffy-resource",
          playerName: "Adrienne",
          dice: "resource",
          origin: "treasure",
          results: ["3 gold", "2 materials"],
          resourceRolls: [
            { resource: "gold", amount: 3 },
            { resource: "buildingMaterials", amount: 2 }
          ]
        }}
        onDone={vi.fn()}
      />
    );

    expect(screen.getByText("STEP 2 · RESOURCE DICE FROM TREASURE")).toBeTruthy();
    expect(screen.getByText(/Adrienne rolls the Resource die/i)).toBeTruthy();
  });

  // The Resource die's "2 valuables" face is the BINH house rule
  // `resource-die-single-valuables` (capped to 1) vs. the printed die. The cube
  // must paint the die THIS table rolls, so the caller passes the six faces.
  const dieFaceAmounts = (container: HTMLElement): string[] =>
    Array.from(container.querySelectorAll(".mapDieFace-resource b")).map((node) => node.textContent ?? "");

  it("paints the six faces of the die the table actually rolls", () => {
    vi.useFakeTimers();
    const cue = {
      id: "die-layout",
      playerName: "Adrienne",
      dice: "resource" as const,
      results: ["2 valuables"],
      resourceRolls: [{ resource: "valuables" as const, amount: 2 }]
    };
    const printed = render(
      <MapDiceOverlay
        cue={cue}
        onDone={vi.fn()}
        resourceLayout={[
          { resource: "buildingMaterials", amount: 2 },
          { resource: "buildingMaterials", amount: 4 },
          { resource: "valuables", amount: 1 },
          { resource: "valuables", amount: 2 },
          { resource: "gold", amount: 3 },
          { resource: "gold", amount: 6 }
        ]}
      />
    );
    expect(dieFaceAmounts(printed.container)).toEqual(["2", "4", "1", "2", "3", "6"]);
    printed.unmount();

    // CONTROL: the house-rule die shows 1 on BOTH valuables faces.
    const capped = render(
      <MapDiceOverlay
        cue={cue}
        onDone={vi.fn()}
        resourceLayout={[
          { resource: "buildingMaterials", amount: 2 },
          { resource: "buildingMaterials", amount: 4 },
          { resource: "valuables", amount: 1 },
          { resource: "valuables", amount: 1 },
          { resource: "gold", amount: 3 },
          { resource: "gold", amount: 6 }
        ]}
      />
    );
    expect(dieFaceAmounts(capped.container)).toEqual(["2", "4", "1", "1", "3", "6"]);
  });
});

describe("ReactionTray — Adrienne's pending damage is explicit and resolves", () => {
  it("shows Adrienne's pending 2 damage on the resolve button and lands it on Fangarm", () => {
    let state = createInitialGameState("adrienne-visible-auto-resolve");
    state.players.p1.hand = ["specialty.adrienne.1"];
    state.players.p2.hand = [];

    const specialty = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "specialty.adrienne.1"
    );
    expect(specialty).toBeTruthy();
    state = applyAction(state, specialty!.action).state;

    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";
    state.combat!.units.unit_p1_griffins.activatedThisRound = false;
    // Keep one legal Power response so the real Instant window remains open;
    // without any response the engine already resolves the cast immediately.
    state.players.p1.hand = ["spell.magic_arrow", "stat.power"];
    const fangarm = state.combat!.units.unit_p2_skeletons;
    fangarm.abilities = ["fangarm-nondamage-immunity"];
    fangarm.maxHealth = 40;
    fangarm.damage = 0;

    const cast = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "CAST_SPELL" &&
        legal.action.cardId === "spell.magic_arrow" &&
        legal.action.target.type === "unit" &&
        legal.action.target.unitId === fangarm.id
    );
    expect(cast).toBeTruthy();
    state = applyAction(state, cast!.action).state;
    expect(state.reactionWindow?.priorityPlayerId).toBe("p1");

    let resolved = state;
    const onAction = vi.fn((action: GameAction) => {
      resolved = applyAction(resolved, action).state;
      while (resolved.reactionWindow) {
        resolved = applyAction(resolved, {
          type: "PASS_REACTION",
          playerId: resolved.reactionWindow.priorityPlayerId
        }).state;
      }
    });
    render(
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

    expect(screen.getByText(/Magic Arrow · 2 damage/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Resolve Magic Arrow — deal 2 damage/i }));

    expect(onAction).toHaveBeenCalledWith({ type: "PASS_REACTION", playerId: "p1" });
    expect(resolved.combat!.units[fangarm.id].damage).toBe(2);
    expect(
      resolved.eventLog.some(
        (event) =>
          event.type === "DAMAGE_ASSIGNED" &&
          event.target.type === "unit" &&
          event.target.unitId === fangarm.id &&
          event.amount === 2
      )
    ).toBe(true);
  });
});

describe("ReactionTray - retaliation morale draw", () => {
  it("surfaces the token draw as a clickable action before the counterattack roll", () => {
    const initial = createInitialGameState("tray-retaliation-morale");
    initial.players.p1.hand = [];
    initial.players.p2.hand = [];
    initial.players.p1.morale = 1;
    for (const unit of Object.values(initial.combat!.units)) {
      unit.abilities = [];
    }
    initial.combat!.units.unit_p1_griffins.type = "ground";
    initial.combat!.units.unit_p1_griffins.position = 9;
    initial.combat!.units.unit_p1_griffins.attack = 1;
    initial.combat!.units.unit_p2_skeletons.position = 13;
    initial.combat!.units.unit_p2_skeletons.defense = 0;
    initial.combat!.units.unit_p2_skeletons.maxHealth = 40;
    initial.combat!.units.unit_p2_skeletons.retaliatedThisRound = false;
    initial.combat!.dice.scriptedRolls = [0, 0];
    initial.combat!.dice.rollCount = 0;
    initial.activePlayerId = "p1";
    initial.combat!.activeUnitId = "unit_p1_griffins";

    let result = applyAction(initial, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_griffins",
      defenderId: "unit_p2_skeletons"
    });
    expect(result.errors).toEqual([]);
    let state = result.state;
    let safety = 30;
    while (safety-- > 0) {
      if (
        state.reactionWindow?.triggerEvent.type === "UNIT_ATTACK_DECLARED" &&
        state.reactionWindow.triggerEvent.isRetaliation
      ) {
        break;
      }
      if (state.reactionWindow) {
        result = applyAction(state, {
          type: "PASS_REACTION",
          playerId: state.reactionWindow.priorityPlayerId
        });
        expect(result.errors).toEqual([]);
        state = result.state;
        continue;
      }
      if (state.pendingChoice?.type === "ATTACK_DIE_REROLL") {
        const choice = state.pendingChoice;
        result = applyAction(state, {
          type: "CHOOSE_PENDING_ROLL",
          playerId: choice.playerId,
          choiceId: choice.id,
          candidateIndex: choice.candidates.length - 1
        });
        expect(result.errors).toEqual([]);
        state = result.state;
        continue;
      }
      break;
    }
    while (state.reactionWindow && state.reactionWindow.priorityPlayerId !== "p1") {
      result = applyAction(state, {
        type: "PASS_REACTION",
        playerId: state.reactionWindow.priorityPlayerId
      });
      expect(result.errors).toEqual([]);
      state = result.state;
    }
    expect(state.reactionWindow?.triggerEvent).toMatchObject({
      type: "UNIT_ATTACK_DECLARED",
      isRetaliation: true
    });

    const onAction = vi.fn();
    render(
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

    const drawButtons = screen.getAllByRole("button", {
      name: /Spend morale: draw a card/i
    });
    // Exactly one tile — the addMoraleActions offer; no duplicate look-alike.
    expect(drawButtons).toHaveLength(1);
    fireEvent.click(drawButtons[0]);
    expect(onAction).toHaveBeenCalledWith({
      type: "SPEND_MORALE",
      playerId: "p1",
      benefit: "draw"
    });
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

describe("DiceOverlay — ability rolls (Death Stare & friends)", () => {
  /** An ability-roll cue as page.tsx's makeAbilityDiceCue builds it. */
  function abilityCue(overrides: Partial<DiceCue> = {}): DiceCue {
    return diceCue({
      spellMode: true,
      sumAllDice: true,
      title: "Death Stare — Mighty Gorgons",
      caption: "Silver Pegasi are reduced to 0 Health!",
      tone: "good",
      rolls: [-1, -1],
      roll: 1,
      readMs: ABILITY_DICE_READ_MS,
      ...overrides
    });
  }

  it("shows the ability heading, outcome caption and all dice lit", () => {
    vi.useFakeTimers();
    const { container } = render(<DiceOverlay cue={abilityCue()} onDone={vi.fn()} />);
    expect(screen.getByRole("status", { name: /death stare — mighty gorgons roll/i })).toBeTruthy();
    act(() => vi.advanceTimersByTime(2000));
    expect(screen.getByText(/reduced to 0 Health/)).toBeTruthy();
    // A landed effect reads dramatic (.hit); every die counts, none dim.
    expect(container.querySelector(".damageResult.hit")).toBeTruthy();
    expect(container.querySelectorAll(".dieScene.dimmed").length).toBe(0);
  });

  it("a missed roll reads calm (.blocked) via tone, whatever the roll value", () => {
    vi.useFakeTimers();
    const { container } = render(
      <DiceOverlay cue={abilityCue({ tone: "bad", caption: "No effect.", rolls: [-1, 1], roll: 0 })} onDone={vi.fn()} />
    );
    act(() => vi.advanceTimersByTime(2000));
    expect(container.querySelector(".damageResult.blocked")).toBeTruthy();
  });

  it("dismisses after the SHORTER ability read, not the full attack read", () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    render(<DiceOverlay cue={abilityCue()} onDone={onDone} />);
    act(() => vi.advanceTimersByTime(DICE_ROLL_MS + ABILITY_DICE_READ_MS - 100));
    expect(onDone).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(200));
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});

describe("DiceOverlay — roll modifiers, Defend die and Might dice", () => {
  it("shows Guarded as printed Defense 1 + die 1 = total 2 without double-counting the chip", () => {
    vi.useFakeTimers();
    const { container } = render(
      <DiceOverlay
        cue={diceCue({ defenseValue: 2, defenseBonus: 1, defendRoll: 1 })}
        onDone={vi.fn()}
      />
    );
    act(() => vi.advanceTimersByTime(2000));
    const formulas = container.querySelectorAll(".diceBreakdown .formula");
    expect(formulas[1]?.textContent?.replace(/\s+/g, " ")).toContain("1 + 1 = 2");
    expect(container.querySelectorAll(".diceModChip.shield")).toHaveLength(1);
  });

  it("lists the modifier chips and the Defend-die chip once the dice settle", () => {
    vi.useFakeTimers();
    const { container } = render(
      <DiceOverlay
        cue={diceCue({
          defendRoll: 1,
          modifiers: [{ source: "Negative Morale", text: "-1 to this Attack roll" }]
        })}
        onDone={vi.fn()}
      />
    );
    act(() => vi.advanceTimersByTime(2000));
    expect(screen.getByText(/Defend die \+1 → \+1 Defense/)).toBeTruthy();
    expect(screen.getByText("Negative Morale")).toBeTruthy();
    expect(screen.getByText(/-1 to this Attack roll/)).toBeTruthy();
    expect(container.querySelectorAll(".diceModChip").length).toBe(2);
  });

  it("renders the commander's Might dice as extra cubes behind a Might tag", () => {
    vi.useFakeTimers();
    const { container } = render(
      <DiceOverlay cue={diceCue({ mightRolls: [1, -1] })} onDone={vi.fn()} />
    );
    act(() => vi.advanceTimersByTime(2000));
    // 1 main die + 2 Might dice, none of the Might dice ever dimmed.
    expect(container.querySelectorAll(".dieScene").length).toBe(3);
    expect(container.querySelector(".mightDiceTag")).toBeTruthy();
    expect(container.querySelectorAll(".dieScene.dimmed").length).toBe(0);
  });

  it("shows no chip row on a plain roll (control)", () => {
    vi.useFakeTimers();
    const { container } = render(<DiceOverlay cue={diceCue()} onDone={vi.fn()} />);
    act(() => vi.advanceTimersByTime(2000));
    expect(container.querySelector(".diceModifiers")).toBeNull();
    expect(container.querySelector(".mightDiceTag")).toBeNull();
  });
});

describe("DiceOverlay — forced '+1' reroll replay (Hourglass / Negative Morale)", () => {
  it("replays the reroll: flags the die then reveals the '+1' → kept face, on the SAME clock as a normal roll", () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    const { container } = render(
      <DiceOverlay
        cue={diceCue({ rolls: [-1], roll: -1, damage: 0, rerollBeats: [{ index: 0, from: 1, to: -1 }] })}
        onDone={onDone}
      />
    );
    // While the dice tumble the breakdown and the reroll chip stay hidden.
    expect(container.querySelector(".diceBreakdown.hidden")).toBeTruthy();
    expect(container.querySelector("[data-testid='dice-reroll-beat']")).toBeNull();

    // The throw lands on the "+1" and holds — the rerolled die is flagged, but
    // the outcome (chip + breakdown) is NOT revealed until the replay finishes.
    act(() => vi.advanceTimersByTime(DICE_ROLL_MS + 50));
    expect(container.querySelector(".dieScene.rerolled")).toBeTruthy();
    expect(container.querySelector("[data-testid='dice-reroll-beat']")).toBeNull();
    expect(container.querySelector(".diceBreakdown.hidden")).toBeTruthy();

    // Flash + re-tumble complete → the kept face reads out and the chip names
    // the "+1" that was thrown away and the face it landed on.
    act(() => vi.advanceTimersByTime(REROLL_FLASH_MS + REROLL_TUMBLE_MS));
    const chip = container.querySelector("[data-testid='dice-reroll-beat']");
    expect(chip?.textContent).toMatch(/rerolled/i);
    expect(container.querySelector(".diceBreakdown.hidden")).toBeNull();

    // The replay is contained inside the read window: dismissal is on the exact
    // same DICE_ROLL_MS + DICE_READ_MS clock a plain roll uses — never later.
    expect(onDone).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(DICE_PRESENT_MS));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("CONTROL: a plain roll settles in one step, no reroll marker or chip", () => {
    vi.useFakeTimers();
    const { container } = render(<DiceOverlay cue={diceCue()} onDone={vi.fn()} />);
    act(() => vi.advanceTimersByTime(DICE_ROLL_MS + 50));
    expect(container.querySelector(".dieScene.rerolled")).toBeNull();
    expect(container.querySelector("[data-testid='dice-reroll-beat']")).toBeNull();
    // Settled immediately after the single tumble — the breakdown is shown.
    expect(container.querySelector(".diceBreakdown.hidden")).toBeNull();
  });
});

describe("MapNoticeOverlay location art", () => {
  function renderNotice(location: string, icon = "X") {
    vi.useFakeTimers();
    return render(
      <MapNoticeOverlay
        cue={{
          id: `notice-${location}`,
          icon,
          title: location,
          subtitle: "p1 visits",
          lines: [],
          location
        }}
        onDone={vi.fn()}
      />
    );
  }

  it("uses HD notice art for resource, treasure and creature-bank visits", () => {
    const expected: Record<string, string> = {
      creature_bank: "/assets/ui/notice-creature-bank.webp",
      resource_symbol: "/assets/ui/notice-resource.webp",
      treasure_symbol: "/assets/ui/notice-treasure-chest.webp"
    };

    for (const [location, src] of Object.entries(expected)) {
      const { container, unmount } = renderNotice(location);
      const image = container.querySelector<HTMLImageElement>(".mapNoticeArt");
      expect(image?.getAttribute("src")).toBe(src);
      expect(container.querySelector(".mapNoticeIcon.withArt")).toBeTruthy();
      unmount();
    }
  });

  it("insets the edge-to-edge treasure-chest art but not the padded bank/resource art", () => {
    const chest = renderNotice("treasure_symbol");
    expect(chest.container.querySelector(".mapNoticeArt.compact")).toBeTruthy();
    chest.unmount();

    for (const location of ["creature_bank", "resource_symbol"]) {
      const { container, unmount } = renderNotice(location);
      expect(container.querySelector(".mapNoticeArt")).toBeTruthy();
      expect(container.querySelector(".mapNoticeArt.compact")).toBeNull();
      unmount();
    }
  });

  it("falls back to the cue glyph when a location has no dedicated art", () => {
    renderNotice("windmill", "W");

    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText("W")).toBeTruthy();
  });

  it("renders reward chips (icon + label) instead of the text list, and a mine's resource token as the notice art", () => {
    vi.useFakeTimers();
    const { container } = render(
      <MapNoticeOverlay
        cue={{
          id: "notice-mine",
          icon: "⛏",
          title: "Mine",
          subtitle: "p1 visits",
          lines: ["p1 flags Mine.", "p1 +1 gold production."],
          location: "mine",
          iconImage: "/assets/icons/resource-gold.webp",
          rewards: [
            { icon: "/assets/icons/resource-gold.webp", label: "+1/turn", title: "+1 gold production", tone: "gain" }
          ]
        }}
        onDone={vi.fn()}
      />
    );

    // Chips replace the "mass of text" bullet list.
    const chips = container.querySelectorAll(".mapNoticeReward");
    expect(chips).toHaveLength(1);
    expect(chips[0].querySelector("img")?.getAttribute("src")).toContain("resource-gold");
    expect(chips[0].textContent).toContain("+1/turn");
    expect(container.querySelector(".mapNotice ul"), "no text list when chips are present").toBeNull();

    // The mine wears its resource token instead of the pickaxe emoji.
    expect(container.querySelector(".mapNoticeResourceArt")?.getAttribute("src")).toContain("resource-gold");
    expect(container.textContent).not.toContain("⛏");
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

  it("labels the header by the viewer's role — only the reacting side is told to react", () => {
    const onAction = vi.fn();
    // The reacting side (p1) is invited to react.
    const { unmount } = render(
      <NeutralStepOverlay legalActions={[castArrow, resume]} onAction={onAction} state={pauseState()} viewerPlayerId="p1" />
    );
    expect(screen.getByText("Enemy turn — react?")).toBeTruthy();
    expect(screen.queryByText("Reaction window")).toBeNull();
    unmount();

    // The side whose own unit is about to act (p2) gets a neutral, waiting header
    // — never "Enemy turn — react?" over its own unit.
    render(<NeutralStepOverlay legalActions={[]} onAction={onAction} state={pauseState()} viewerPlayerId="p2" />);
    expect(screen.getByText("Reaction window")).toBeTruthy();
    expect(screen.queryByText("Enemy turn — react?")).toBeNull();
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

describe("ReactionTray — Balance-Pack Celestial Necklace shows its +1 base", () => {
  // User report (screenshot): the reaction bar read "Discard X cards: +X attack"
  // and a "+0 Attack" total — the classic printed face — while the engine (which
  // reads the reprint) actually grants +1 + X. The tray must resolve the
  // Balance-Pack reprint for the label AND the running total.
  function necklaceWindow(balance: boolean): GameState {
    const state = createInitialGameState(`necklace-tray-${balance}`);
    // The combat sandbox has no adventure; freeze one carrying the rule flag so
    // houseRuleEnabled reads it (getPlayerView needs tiles/playerFarTiles).
    state.adventure = {
      houseRules: { "polish-card-balance": balance },
      tiles: {},
      playerFarTiles: {}
    } as unknown as GameState["adventure"];
    state.players.p1.hand = ["artifact.celestial_necklace_of_bliss", "spell.haste"];
    state.players.p2.hand = [];
    state.combat!.units.unit_p1_griffins.position = 13;
    state.combat!.units.unit_p2_skeletons.position = 14;
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

  it("labels the option '+1 attack …' and totals '+1 Attack' with nothing discarded (rule ON)", () => {
    const state = necklaceWindow(true);
    expect(state.reactionWindow?.priorityPlayerId).toBe("p1");
    render(tray(state));

    // The reprint label carries the +1 base; the classic label never does.
    const pick = screen.getByRole("button", { name: /\+1 attack.*discard/i });
    act(() => {
      fireEvent.click(pick);
    });
    // Running total with zero cards discarded: the base alone, +1 — not +0.
    expect(screen.getByText("+1 Attack")).toBeTruthy();
  });

  it("CONTROL: with the rule OFF the tray shows the classic '+0 Attack' base", () => {
    const state = necklaceWindow(false);
    expect(state.reactionWindow?.priorityPlayerId).toBe("p1");
    render(tray(state));

    // The classic printed option has no +1 base — its label is "Discard X …".
    expect(screen.queryByRole("button", { name: /\+1 attack.*discard/i })).toBeNull();
    const pick = screen.getByRole("button", { name: /discard x cards: \+x attack/i });
    act(() => {
      fireEvent.click(pick);
    });
    expect(screen.getByText("+0 Attack")).toBeTruthy();
  });
});

describe("ReactionTray — Basic X Magic in-play +3 expert has a button", () => {
  // User bug ("cannot play the expert effect (+3 sp)"): the in-play Basic X
  // Magic fetch permanent's +3 is a standalone USE_SCHOOL_FETCH_EXPERT action
  // (the permanent is NOT discarded), so no PLAY_REACTION card tile surfaces it.
  // Without a dedicated tray tile it was engine-offered but had no button.
  function arrowCastState(seed: string, crowns: number): GameState {
    const state = createInitialGameState(seed);
    // Keep a spare Spell in hand: as a "+1 Power" discard it holds the reaction
    // window open even in the no-crown CONTROL, so the tray genuinely renders
    // (and the +3 button's absence there is a real gate, not a closed window).
    state.players.p1.hand = ["spell.magic_arrow", "spell.haste"];
    state.players.p2.hand = [];
    state.players.p1.permanents = ["ability.basic_fire_magic"];
    state.players.p1.limits.expertUses = crowns;
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_marksmen";
    const target = state.combat!.units.unit_p2_skeletons;
    target.abilities = [];
    target.maxHealth = 40;
    const cast = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "CAST_SPELL" &&
        legal.action.cardId === "spell.magic_arrow" &&
        legal.action.target?.type === "unit" &&
        legal.action.target.unitId === "unit_p2_skeletons"
    );
    const result = applyAction(state, cast!.action);
    expect(result.errors).toEqual([]);
    return result.state;
  }

  function tray(state: GameState, onAction: (action: GameAction) => void) {
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

  it("renders the +3 button and dispatches USE_SCHOOL_FETCH_EXPERT when clicked", () => {
    const state = arrowCastState("tray-fetch-expert", 1);
    expect(state.reactionWindow?.priorityPlayerId).toBe("p1");
    const onAction = vi.fn();
    render(tray(state, onAction));

    const button = screen.getByRole("button", { name: /Basic Fire Magic.*\+3 Power/i });
    act(() => {
      fireEvent.click(button);
    });
    expect(onAction).toHaveBeenCalledWith({ type: "USE_SCHOOL_FETCH_EXPERT", playerId: "p1", school: "fire" });
  });

  it("CONTROL: with no crown the tray is open (Power discard) but shows no +3 button", () => {
    const state = arrowCastState("tray-fetch-nocrown", 0);
    expect(state.reactionWindow?.priorityPlayerId).toBe("p1");
    render(tray(state, vi.fn()));
    // The window is genuinely open (the spare Spell's +1 Power tile renders)...
    expect(screen.queryByText(/No playable instants/i)).toBeNull();
    // ...but the crown-gated +3 expert has no button.
    expect(screen.queryByRole("button", { name: /Basic Fire Magic.*\+3 Power/i })).toBeNull();
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

  it("lets the DEFENDER fuel a Spell Book Weakness with a lone +1 Power (hand Magic Arrow)", () => {
    // Player report: casting Weakness from the Spell Book on an enemy's attack,
    // you "can't use Magic Arrow at hand to power it up". A Book instant is a
    // ONE-CLICK play that never joins the tray's `selections`, so afterwards the
    // only selection is the lone Magic-Arrow "+1 Power" — and the tray's
    // "empowerable?" check was attacker-only (attackOwner === viewer), so the
    // DEFENDER's already-played Weakness was ignored and the Power was blocked.
    const state = createInitialGameState("tray-book-weakness-power");
    state.players.p1.hand = [];
    state.players.p2.hand = ["spell.magic_arrow"]; // the outside Power source
    state.players.p2.spellBook = ["spell.weakness"]; // played from the Book
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

    // The attacker (p1) has nothing to add, so priority passes to the defender p2.
    let handed = declared.state;
    let guard = 10;
    while (handed.reactionWindow?.priorityPlayerId === "p1" && guard-- > 0) {
      handed = applyAction(handed, { type: "PASS_REACTION", playerId: "p1" }).state;
    }
    expect(handed.reactionWindow?.priorityPlayerId).toBe("p2");

    // p2 plays Weakness FROM THE BOOK (a one-click reaction). The window stays
    // open with p2 on priority — the defender keeps empowering their own instant.
    const bookWeakness = getLegalActions(handed, "p2").find(
      (legal) =>
        legal.action.type === "PLAY_REACTION" &&
        legal.action.cardId === "spell.weakness" &&
        legal.action.fromSpellBook === true
    );
    expect(bookWeakness, "a Book Weakness should be offered to the attacked player").toBeTruthy();
    const played = applyAction(handed, bookWeakness!.action);
    expect(played.errors).toEqual([]);
    expect(played.state.reactionWindow?.priorityPlayerId).toBe("p2");

    render(trayFor(played.state, "p2"));

    // Pick the lone "Discard Magic Arrow for +1 Power".
    const pick = screen.getByRole("button", { name: /discard for \+1 power/i });
    act(() => fireEvent.click(pick));

    // Confirm is enabled — the defender's Weakness IS empowerable, so its owner
    // may fuel it with a lone Power. Before the fix this stayed disabled.
    const confirm = screen.getByRole("button", { name: /play card/i }) as HTMLButtonElement;
    expect(confirm.disabled, "the defender should be able to fuel their own Weakness with Magic Arrow").toBe(false);
    expect(screen.queryByText(/power only counts with a spell/i)).toBeNull();
  });

  it("offers Frenzy (a target-less instant buff) to the attacker as a clickable tile that dispatches PLAY_REACTION", () => {
    const state = createInitialGameState("tray-frenzy-seed");
    state.players.p1.hand = ["spell.frenzy"];
    state.players.p2.hand = [];
    state.combat!.activeUnitId = "unit_p1_griffins";
    const griffins = state.combat!.units.unit_p1_griffins;
    griffins.activatedThisRound = false;
    griffins.abilities = [];
    griffins.position = 9;
    const skeletons = state.combat!.units.unit_p2_skeletons;
    skeletons.abilities = [];
    skeletons.position = 13;

    const declared = applyAction(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_griffins",
      defenderId: "unit_p2_skeletons"
    });
    expect(declared.errors).toEqual([]);
    // The attacker holds priority in the just-opened attack window and Frenzy is offered.
    expect(declared.state.reactionWindow?.priorityPlayerId).toBe("p1");
    expect(
      getLegalActions(declared.state, "p1").some(
        (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === "spell.frenzy"
      ),
      "Frenzy must be offered to the attacker"
    ).toBe(true);

    const dispatched: GameAction[] = [];
    render(
      <CardZoomProvider>
        <ReactionTray
          legalActions={getLegalActions(declared.state, "p1")}
          onAction={(action) => dispatched.push(action)}
          state={declared.state}
          view={getPlayerView(declared.state, "p1")}
          viewerPlayerId="p1"
        />
      </CardZoomProvider>
    );

    // Frenzy is not a CHOOSE_ONE, so its group renders the generic "Add to play".
    const add = screen.getByRole("button", { name: /add to play/i });
    act(() => fireEvent.click(add));
    const confirm = screen.getByRole("button", { name: /play card/i }) as HTMLButtonElement;
    expect(confirm.disabled, "confirming a lone target-less Frenzy is legal").toBe(false);
    act(() => fireEvent.click(confirm));
    expect(
      dispatched.some(
        (action) => action.type === "PLAY_REACTION" && (action as { cardId?: string }).cardId === "spell.frenzy"
      ),
      "clicking play must dispatch PLAY_REACTION for Frenzy"
    ).toBe(true);
  });

  it("plays an EMPOWERED ability's Expert side with 0 crowns (does not count it against the crown budget)", () => {
    // Empowered abilities (Dragon Fly Hive / Griffin Conservatory bonus) play
    // their Expert side crown-free. The engine offers Offense-expert at 0 crowns,
    // but the tray counted it as a crown → Confirm disabled + "no crowns left".
    const state = createInitialGameState("tray-empowered-expert");
    state.players.p1.hand = ["ability.offense"];
    state.players.p2.hand = [];
    state.players.p1.empoweredAbilities = ["ability.offense"];
    state.players.p1.limits.expertUses = 0; // NO crowns available
    state.players.p1.combatStats.expertUsesSpentThisRound = 0;
    state.combat!.activeUnitId = "unit_p1_griffins";
    const griffins = state.combat!.units.unit_p1_griffins;
    griffins.activatedThisRound = false;
    griffins.abilities = [];
    griffins.position = 9;
    state.combat!.units.unit_p2_skeletons.position = 13;
    state.combat!.units.unit_p2_skeletons.abilities = [];

    const declared = applyAction(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_griffins",
      defenderId: "unit_p2_skeletons"
    });
    expect(declared.errors).toEqual([]);
    // The engine offers the Expert reaction crown-free.
    const expertOffered = getLegalActions(declared.state, "p1").some(
      (legal) =>
        legal.action.type === "PLAY_REACTION" && legal.action.cardId === "ability.offense" && legal.action.mode === "expert"
    );
    expect(expertOffered, "engine offers the empowered Offense expert at 0 crowns").toBe(true);

    render(tray(declared.state));

    // Pick Offense, then toggle its Expert side.
    act(() => fireEvent.click(screen.getByRole("button", { name: /add to play/i })));
    act(() => fireEvent.click(screen.getByRole("button", { name: /^Expert$/i })));

    // Confirm is enabled and NO "no crowns" warning — the empowered Expert is free.
    const confirm = screen.getByRole("button", { name: /play card/i }) as HTMLButtonElement;
    expect(confirm.disabled, "an empowered Expert reaction is playable with 0 crowns").toBe(false);
    expect(screen.queryByText(/no crowns left/i)).toBeNull();
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
    // (Meter also shows top-tier / needs-min chips when relevant — match loosely.)
    expect(screen.getByText("Power 1")).toBeTruthy();
    expect(screen.getAllByText(/2 damage/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/0 base \+ 1 fuelled/)).toBeTruthy();
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

  it("reaches the silver skip with ONE +1 Power card upgraded to expert with a crown", () => {
    // A single basic Power card is worth +1 — not enough for the 2-Power silver
    // skip. Clicking its Crown toggle values it at its expert +2 (spending a
    // crown), which pays the skip on its own. The emitted action must carry
    // costCardModes so the engine spends the crown and takes the expert value.
    const state = silverSkipWindow(["stat.power"]);
    expect(state.players.p1.limits.expertUses, "sandbox seat has crowns").toBeGreaterThan(0);

    const onAction = vi.fn();
    render(trayFor(state, onAction));

    act(() => fireEvent.click(screen.getByRole("button", { name: /skip a silver unit/i })));
    // Pick the lone Power card (basic +1) — still 1 short of the 2-Power skip.
    act(() => fireEvent.click(screen.getByRole("button", { name: /^Power \(\+1\)$/ })));
    expect(confirmButton().disabled, "basic +1 is one short of the 2-Power skip").toBe(true);

    // The Crown toggle appears for the picked Power source; clicking it upgrades
    // the value to +2 and satisfies the cost.
    act(() => fireEvent.click(screen.getByRole("button", { name: /Crown/i })));
    expect(confirmButton().disabled, "expert +2 reaches the silver skip").toBe(false);

    act(() => fireEvent.click(confirmButton()));
    const played = onAction.mock.calls[0][0] as Extract<GameAction, { type: "PLAY_REACTION" }>;
    expect(played.costCardIds).toEqual(["stat.power"]);
    expect(played.costCardModes).toEqual(["expert"]);

    // The engine accepts it: the silver vampires are skipped and the crown spent.
    const applied = applyAction(state, played);
    expect(applied.errors).toEqual([]);
    expect(applied.state.combat!.units.unit_p2_vampires.activatedThisRound).toBe(true);
    expect(applied.state.players.p1.combatStats.expertUsesSpentThisRound).toBe(1);
  });

  /**
   * REPORTED BUG (2026-08-22): "Sorrow should be 1 SP for silver unit. Even with
   * 2 SP cannot play it."
   *
   * A School-of-Magic ability (Earth Magic — and Sorrow is an EARTH spell) is
   * printed `ADD_SPELL_POWER { amount: 0, expertAmount: 3 }`: worth NOTHING at
   * basic, +3 with a crown. `canAffordCardCost` greedily assigns the crown and
   * therefore OFFERS the silver skip, but the tray hid every payment chip whose
   * BASIC Power was 0 — so the offered play had no payable card and the Confirm
   * button could never leave "0/2 chosen". The engine accepts the very same play
   * when it is paid at the expert value, which is what these tests drive.
   */
  /** Same setup, but no reaction window is expected (nothing is payable). */
  function silverSkipAttempt(power: string[], crownsLeft?: number): GameState {
    const state = createInitialGameState("sorrow-tray-seed");
    state.players.p1.hand = ["spell.sorrow", ...power];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";
    if (crownsLeft !== undefined) {
      state.players.p1.combatStats.expertUsesSpentThisRound = state.players.p1.limits.expertUses - crownsLeft;
    }
    for (const unit of Object.values(state.combat!.units)) {
      unit.activatedThisRound = unit.id !== "unit_p1_griffins" && unit.id !== "unit_p2_vampires";
    }
    const result = applyAction(state, { type: "DEFEND_UNIT", playerId: "p1", unitId: "unit_p1_griffins" });
    expect(result.errors).toEqual([]);
    return result.state;
  }

  it("pays the silver skip with Earth Magic's expert side (0 basic / +3 with a crown)", () => {
    const state = silverSkipWindow(["ability.earth_magic"]);
    // The ENGINE really offers it — the bug was the payment surface, not the gate.
    expect(
      getLegalActions(state, "p1").some(
        (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === "spell.sorrow"
      ),
      "the engine offers the silver skip off Earth Magic's expert Power"
    ).toBe(true);

    const onAction = vi.fn();
    render(trayFor(state, onAction));
    act(() => fireEvent.click(screen.getByRole("button", { name: /skip a silver unit/i })));
    expect(confirmButton().disabled, "2 Power is owed and nothing is paid yet").toBe(true);

    // The chip is shown at the value that can actually pay: its expert +3.
    const chip = screen.getByRole("button", { name: /^Earth Magic \(\+3\)$/ }) as HTMLButtonElement;
    act(() => fireEvent.click(chip));
    expect(confirmButton().disabled, "Earth Magic's expert +3 covers the 2-Power skip").toBe(false);

    act(() => fireEvent.click(confirmButton()));
    const played = onAction.mock.calls[0][0] as Extract<GameAction, { type: "PLAY_REACTION" }>;
    expect(played.costCardIds).toEqual(["ability.earth_magic"]);
    // Picked at "basic" the source brings 0 Power and the engine rejects it, so
    // the chip must arm itself at expert.
    expect(played.costCardModes).toEqual(["expert"]);

    const applied = applyAction(state, played);
    expect(applied.errors.map((error) => error.message)).toEqual([]);
    expect(applied.state.combat!.units.unit_p2_vampires.activatedThisRound).toBe(true);
    expect(applied.state.players.p1.combatStats.expertUsesSpentThisRound).toBe(1);
  });

  it("CONTROL: with no crowns left Earth Magic pays nothing — no window, no chip", () => {
    // The expert +3 is unreachable without a crown, so the engine opens no window
    // at all. The fix must not invent an offer the engine would refuse.
    const state = silverSkipAttempt(["ability.earth_magic"], 0);
    expect(state.reactionWindow, "nothing is payable, so no skip window opens").toBeNull();
    expect(
      getLegalActions(state, "p1").some(
        (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === "spell.sorrow"
      )
    ).toBe(false);
    render(trayFor(state, vi.fn()));
    expect(screen.queryByRole("button", { name: /^Earth Magic/ })).toBeNull();
  });

  it("CONTROL: a wrong-school School of Magic (Fire) never pays the EARTH Sorrow", () => {
    // Alone it opens no window …
    expect(silverSkipAttempt(["ability.fire_magic"]).reactionWindow).toBeNull();
    // … and inside a window opened by a real Power card its chip stays hidden:
    // spellPowerValueOfCard is 0 for Fire Magic on an Earth spell at BOTH modes.
    const state = silverSkipWindow(["stat.power", "ability.fire_magic"]);
    render(trayFor(state, vi.fn()));
    act(() => fireEvent.click(screen.getByRole("button", { name: /skip a silver unit/i })));
    expect(screen.getByRole("button", { name: /^Power \(\+1\)$/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Fire Magic/ })).toBeNull();
  });

  it("shows one Meteor Shower aim action and sends targeting to the battlefield", () => {
    const state = silverSkipWindow(["stat.power", "ability.basic_water_magic"]);
    state.players.p1.hand[0] = "specialty.deemer.1";
    const onAction = vi.fn();
    const onSelectCardAction = vi.fn();
    const meteor = (unitId: string) => ({
      label: `Meteor Shower at ${unitId}`,
      action: {
        type: "PLAY_CARD" as const,
        playerId: "p1" as const,
        cardId: "specialty.deemer.1",
        mode: "basic" as const,
        optionIndex: 0,
        target: { type: "unit" as const, unitId }
      }
    });
    render(
      <CardZoomProvider>
        <ReactionTray
          legalActions={[meteor("unit_p2_skeletons"), meteor("unit_p2_vampires")]}
          onAction={onAction}
          onSelectCardAction={onSelectCardAction}
          state={state}
          view={getPlayerView(state, "p1")}
          viewerPlayerId="p1"
        />
      </CardZoomProvider>
    );

    const aim = screen.getAllByRole("button", { name: "Choose Power & target" });
    expect(aim).toHaveLength(1);
    expect(screen.queryByText(/Meteor Shower at/i)).toBeNull();
    act(() => fireEvent.click(aim[0]));
    expect(onSelectCardAction).toHaveBeenCalledTimes(1);
    const armedAction = onSelectCardAction.mock.calls[0][0];
    cleanup();

    const onAim = vi.fn();
    render(
      <CardZoomProvider>
        <MeteorPowerWindow
          action={armedAction}
          onAim={onAim}
          onCancel={() => {}}
          state={state}
          view={getPlayerView(state, "p1")}
          viewerPlayerId="p1"
        />
      </CardZoomProvider>
    );
    expect(screen.getByRole("dialog", { name: /Meteor Shower I Power/i })).toBeTruthy();
    expect(screen.queryByText("Basic Water Magic")).toBeNull();
    expect(screen.queryByText(/Meteor Shower at/i)).toBeNull();
    act(() => fireEvent.click(screen.getByRole("button", { name: /^\+1 Power$/ })));
    act(() => fireEvent.click(screen.getByRole("button", { name: /Use crown/i })));
    act(() => fireEvent.click(screen.getByRole("button", { name: /Use Power & choose target/i })));
    expect(onAction).not.toHaveBeenCalled();
    expect(onAim).toHaveBeenCalledTimes(1);
    expect(onAim.mock.calls[0][0].cardId).toBe("specialty.deemer.1");
    expect(onAim.mock.calls[0][1]).toEqual({
      costCardIds: ["stat.power"],
      costCardModes: ["expert"]
    });
  });

  it("CONTROL: with no crowns the +1 Power source shows no Crown toggle and cannot reach the skip", () => {
    const state = silverSkipWindow(["stat.power"]);
    state.players.p1.limits.expertUses = 0;

    const onAction = vi.fn();
    render(trayFor(state, onAction));

    act(() => fireEvent.click(screen.getByRole("button", { name: /skip a silver unit/i })));
    act(() => fireEvent.click(screen.getByRole("button", { name: /^Power \(\+1\)$/ })));
    // No crown → no expert toggle, and basic +1 never reaches the 2-Power skip.
    expect(screen.queryByRole("button", { name: /Crown/i })).toBeNull();
    expect(confirmButton().disabled, "basic +1 with no crown cannot pay the skip").toBe(true);
  });

  /** A gold unit is about to activate; p1 holds Sorrow + two basic Power cards. */
  function goldSkipWindow(): GameState {
    const state = createInitialGameState("sorrow-gold-tray-seed");
    state.players.p1.hand = ["spell.sorrow", "stat.power", "stat.power"];
    state.players.p2.hand = [];
    state.players.p1.limits.expertUses = 2; // two crowns available
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";
    state.combat!.units.unit_p2_vampires.grade = "gold";
    for (const unit of Object.values(state.combat!.units)) {
      unit.activatedThisRound = unit.id !== "unit_p1_griffins" && unit.id !== "unit_p2_vampires";
    }
    const result = applyAction(state, { type: "DEFEND_UNIT", playerId: "p1", unitId: "unit_p1_griffins" });
    expect(result.errors).toEqual([]);
    expect(result.state.combat!.activeUnitId).toBe("unit_p2_vampires");
    return result.state;
  }

  it("pays the Power-4 gold skip with TWO Power cards each upgraded by its own crown", () => {
    const state = goldSkipWindow();

    const onAction = vi.fn();
    render(trayFor(state, onAction));

    act(() => fireEvent.click(screen.getByRole("button", { name: /skip a gold unit/i })));
    // Pick both basic Power cards — 1 + 1 = 2, still short of the 4-Power skip.
    const powerChips = () => screen.getAllByRole("button", { name: /^Power \(\+1\)$/ });
    expect(powerChips()).toHaveLength(2);
    act(() => fireEvent.click(powerChips()[0]));
    act(() => fireEvent.click(powerChips()[1]));
    expect(confirmButton().disabled, "two basic Power (2) < the 4-Power gold skip").toBe(true);

    // Each picked source gets its own Crown toggle; upgrading BOTH reaches +2+2=4.
    const crownToggles = () => screen.getAllByRole("button", { name: /Crown/i });
    expect(crownToggles()).toHaveLength(2);
    act(() => fireEvent.click(crownToggles()[0]));
    expect(confirmButton().disabled, "one crown (3) is still short of 4").toBe(true);
    act(() => fireEvent.click(crownToggles()[0])); // the second remaining toggle
    expect(confirmButton().disabled, "two crowns (4) reach the gold skip").toBe(false);

    act(() => fireEvent.click(confirmButton()));
    const played = onAction.mock.calls[0][0] as Extract<GameAction, { type: "PLAY_REACTION" }>;
    expect(played.costCardIds).toEqual(["stat.power", "stat.power"]);
    expect(played.costCardModes).toEqual(["expert", "expert"]);

    // The engine accepts it: the gold unit is skipped and both crowns are spent.
    const applied = applyAction(state, played);
    expect(applied.errors).toEqual([]);
    expect(applied.state.combat!.units.unit_p2_vampires.activatedThisRound).toBe(true);
    expect(applied.state.players.p1.combatStats.expertUsesSpentThisRound).toBe(2);
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

describe("ReactionTray — Magic Mirror from the Spell Book is clickable", () => {
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

  it("shows a Spell Book tile for Book-only Magic Mirror and plays it with fromSpellBook", () => {
    // Mirror lives ONLY in the Book — empty hand. The tray must surface it as a
    // Book reaction (not a hand tile) and emit PLAY_REACTION with fromSpellBook.
    const state = createInitialGameState("mirror-book-tray");
    state.players.p1.hand = [];
    state.players.p1.spellBook = ["spell.magic_mirror"];
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

    // Engine offers the Book Mirror.
    const offered = getLegalActions(cast.state, "p1").some(
      (legal) =>
        legal.action.type === "PLAY_REACTION" &&
        legal.action.cardId === "spell.magic_mirror" &&
        legal.action.fromSpellBook === true
    );
    expect(offered, "engine must offer Book Magic Mirror").toBe(true);

    const onAction = vi.fn();
    render(trayFor(cast.state, onAction));

    // Spell Book tile: "Play from Spell Book" for the free bronze grade.
    const playBook = screen.getByRole("button", { name: /play from spell book/i });
    expect(playBook).toBeTruthy();
    act(() => fireEvent.click(playBook));

    expect(onAction).toHaveBeenCalledTimes(1);
    const played = onAction.mock.calls[0][0] as Extract<GameAction, { type: "PLAY_REACTION" }>;
    expect(played).toMatchObject({
      type: "PLAY_REACTION",
      cardId: "spell.magic_mirror",
      fromSpellBook: true,
      optionIndex: 0
    });

    // Engine accepts the Book play and opens the redirect target choice.
    const applied = applyAction(cast.state, played);
    expect(applied.errors, applied.errors.map((e) => e.message).join("; ")).toEqual([]);
    expect(applied.state.pendingChoice?.type).toBe("ABILITY_TARGET_CHOICE");
    expect(applied.state.players.p1.spellBook).not.toContain("spell.magic_mirror");
    expect(applied.state.players.p1.discard).toContain("spell.magic_mirror");
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

describe("ReactionTray — Archangels' free lethal save is reachable in the UI", () => {
  /**
   * A guaranteed-lethal p2 attack on p1's Griffins, paused in the UNIT_LETHAL_HIT
   * window. p1 holds NO save cards — the only rescue is the Archangels' (here the
   * Crusaders') once-per-combat free "Resurrection" unit ability. Before the fix
   * the tray rendered no tile for it (USE_UNIT_RESURRECTION is not a PLAY_REACTION),
   * so a human could only "Let it die".
   */
  function lethalWindowWithArchangelSave(): GameState {
    const state = createInitialGameState("tray-resurrection-seed");
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    const defender = state.combat!.units.unit_p1_griffins;
    defender.position = 9;
    defender.defense = 0;
    defender.damage = defender.maxHealth - 1; // one hit from death
    const archangel = state.combat!.units.unit_p1_crusaders;
    archangel.abilities = ["archangel-lethal-save"];
    archangel.position = 6;
    const attacker = state.combat!.units.unit_p2_skeletons;
    attacker.abilities = [];
    attacker.attack = 5; // clearly lethal
    attacker.position = 13; // adjacent below the Griffins
    state.combat!.dice.scriptedRolls = [0];
    state.combat!.dice.rollCount = 0;
    state.activePlayerId = "p2";
    state.combat!.activeUnitId = "unit_p2_skeletons";
    const result = applyAction(state, {
      type: "ATTACK_UNIT",
      playerId: "p2",
      attackerId: "unit_p2_skeletons",
      defenderId: "unit_p1_griffins"
    });
    expect(result.errors).toEqual([]);
    return result.state;
  }

  it("renders a tile that fires USE_UNIT_RESURRECTION for the saving unit", () => {
    const state = lethalWindowWithArchangelSave();
    // Sanity: the engine paused in the lethal window with p1 holding the save.
    expect(state.reactionWindow?.triggerEvent.type).toBe("UNIT_LETHAL_HIT");
    expect(state.reactionWindow?.priorityPlayerId).toBe("p1");
    expect(
      getLegalActions(state, "p1").some((legal) => legal.action.type === "USE_UNIT_RESURRECTION")
    ).toBe(true);

    const onAction = vi.fn();
    render(
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

    const saveButton = screen.getByRole("button", { name: /cancel the killing blow/i });
    act(() => fireEvent.click(saveButton));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction.mock.calls[0][0]).toMatchObject({
      type: "USE_UNIT_RESURRECTION",
      playerId: "p1",
      savingUnitId: "unit_p1_crusaders"
    });

    // The fired action resolves cleanly in the engine (end-to-end sanity).
    const applied = applyAction(state, onAction.mock.calls[0][0] as GameAction);
    expect(applied.errors).toEqual([]);
    expect(applied.state.combat!.units.unit_p1_crusaders.usedLethalSaveThisCombat).toBe(true);
  });

  /**
   * Halberdiers' Parry (USE_UNIT_DIE_IGNORE): a standalone legal action like
   * the resurrection save — without its own tile the engine offer existed but
   * a human saw only "Pass" and could never Parry.
   */
  function parryWindow(): GameState {
    const state = createInitialGameState("tray-parry-seed");
    const attacker = state.combat!.units.unit_p1_griffins;
    attacker.type = "ground";
    attacker.position = 9;
    attacker.attack = 5;
    attacker.abilities = [];
    const defender = state.combat!.units.unit_p2_skeletons;
    defender.position = 13;
    defender.defense = 1;
    defender.maxHealth = 40;
    defender.abilities = ["halberdier-die-ignore"];
    state.players.p1.hand = [];
    state.players.p2.hand = ["stat.attack"];
    state.combat!.dice.scriptedRolls = [1, 0, 0];
    state.combat!.dice.rollCount = 0;
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";
    let result = applyAction(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_griffins",
      defenderId: "unit_p2_skeletons"
    });
    expect(result.errors).toEqual([]);
    let safety = 12;
    while (
      safety-- > 0 &&
      result.state.reactionWindow &&
      result.state.reactionWindow.triggerEvent.type === "UNIT_ATTACK_DECLARED"
    ) {
      result = applyAction(result.state, {
        type: "PASS_REACTION",
        playerId: result.state.reactionWindow.priorityPlayerId
      });
      expect(result.errors).toEqual([]);
    }
    return result.state;
  }

  it("renders a Parry tile that fires USE_UNIT_DIE_IGNORE with the chosen discard", () => {
    const state = parryWindow();
    expect(state.reactionWindow?.triggerEvent.type).toBe("ATTACK_DIE_SETTLED");
    expect(
      getLegalActions(state, "p2").some((legal) => legal.action.type === "USE_UNIT_DIE_IGNORE")
    ).toBe(true);

    const onAction = vi.fn();
    render(
      <CardZoomProvider>
        <ReactionTray
          legalActions={getLegalActions(state, "p2")}
          onAction={onAction}
          state={state}
          view={getPlayerView(state, "p2")}
          viewerPlayerId="p2"
        />
      </CardZoomProvider>
    );

    const parryButton = screen.getByRole("button", { name: /ignore the attack die/i });
    act(() => fireEvent.click(parryButton));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction.mock.calls[0][0]).toMatchObject({
      type: "USE_UNIT_DIE_IGNORE",
      playerId: "p2",
      defenderUnitId: "unit_p2_skeletons",
      discardCardId: "stat.attack"
    });

    // The fired action resolves cleanly in the engine (end-to-end sanity).
    const applied = applyAction(state, onAction.mock.calls[0][0] as GameAction);
    expect(applied.errors).toEqual([]);
    expect(applied.state.players.p2.hand).toHaveLength(0);
  });

  /**
   * "Instant (any time during Combat)" cards joining an open window (engine:
   * combatAnytimeInstantWindowJoins) are PLAY_CARD offers, so the batch card tray
   * never surfaces them — without their own tiles the reported case ("use the
   * ballista before the counter attack") was an engine offer with no button.
   * Fails if the `combatInstantJoins` tiles are removed from ReactionTray.
   */
  it("renders a tile per 'any time' instant joining the window, naming its target", () => {
    const state = createInitialGameState("tray-instant-join-seed");
    state.players.p1.hand = ["specialty.gerwulf.6"];
    state.players.p1.permanents = ["war_machine.ballista"];
    state.players.p2.hand = [];
    const attacker = state.combat!.units.unit_p1_marksmen;
    attacker.type = "ground";
    attacker.position = 14;
    attacker.attack = 1;
    attacker.abilities = [];
    const target = state.combat!.units.unit_p2_skeletons;
    target.position = 13;
    target.maxHealth = 30;
    target.attack = 6;
    target.defense = 0;
    target.abilities = [];
    state.combat!.units.unit_p2_vampires.position = 10;
    state.combat!.units.unit_p2_dread_knights.position = 9;
    state.combat!.dice.scriptedRolls = [0, 0, 0, 0];
    state.combat!.dice.rollCount = 0;
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_marksmen";

    const declared = applyAction(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_marksmen",
      defenderId: "unit_p2_skeletons"
    });
    expect(declared.errors).toEqual([]);
    // The incoming Retaliation Attack's window — p1 is the side about to be hit.
    expect(declared.state.reactionWindow?.triggerEvent.type).toBe("UNIT_ATTACK_DECLARED");

    const onAction = vi.fn();
    render(
      <CardZoomProvider>
        <ReactionTray
          legalActions={getLegalActions(declared.state, "p1")}
          onAction={onAction}
          state={declared.state}
          view={getPlayerView(declared.state, "p1")}
          viewerPlayerId="p1"
        />
      </CardZoomProvider>
    );

    // One tile per enemy target, each naming the unit it would hit.
    const shot = screen.getByRole("button", { name: /Discard your Ballista.*→.*Skeletons/i });
    act(() => fireEvent.click(shot));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction.mock.calls[0][0]).toMatchObject({
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "specialty.gerwulf.6",
      optionIndex: 1,
      target: { type: "unit", unitId: "unit_p2_skeletons" }
    });

    // The fired action resolves cleanly in the engine (end-to-end sanity).
    const applied = applyAction(declared.state, onAction.mock.calls[0][0] as GameAction);
    expect(applied.errors).toEqual([]);
    expect(applied.state.combat!.units.unit_p2_skeletons.damage).toBe(4);
  });
});

describe("ReactionTray — First Aid Tent heal is reachable as an instant reaction", () => {
  /**
   * p2's Skeletons attack p1's wounded Crusaders. p1 fields a First Aid Tent, so
   * the engine opens the attack window offering p1 the Tent's heal as an instant
   * (USE_ACTIVE_EFFECT) — mended BEFORE the hit lands. The tray used to render no
   * tile for it (only PLAY_REACTION cards), so the prompt read "Keep normal
   * attack" and the Tent looked like it could not react — the user's bug report.
   */
  function tentAttackWindow(): GameState {
    const state = createInitialGameState("tray-first-aid-seed");
    state.players.p1.hand = []; // no First Aid CARD — isolate the TENT's own heal
    state.players.p2.hand = [];
    state.players.p1.permanents = ["war_machine.first_aid_tent"];
    applyPermanentCombatEffects(state);

    const wounded = state.combat!.units.unit_p1_crusaders;
    wounded.maxHealth = 6;
    wounded.damage = 2;
    wounded.position = 14;
    const attacker = state.combat!.units.unit_p2_skeletons;
    attacker.position = 13; // adjacent to 14
    attacker.activatedThisRound = false;
    attacker.attackedThisActivation = false;
    state.activePlayerId = "p2";
    state.combat!.activeUnitId = "unit_p2_skeletons";

    const result = applyAction(state, {
      type: "ATTACK_UNIT",
      playerId: "p2",
      attackerId: "unit_p2_skeletons",
      defenderId: "unit_p1_crusaders"
    });
    expect(result.errors).toEqual([]);
    return result.state;
  }

  it("renders a tile that fires the Tent heal (USE_ACTIVE_EFFECT) in the attack window", () => {
    const state = tentAttackWindow();
    // Sanity: the attack paused with p1 on priority and the heal on offer.
    expect(state.reactionWindow?.triggerEvent.type).toBe("UNIT_ATTACK_DECLARED");
    expect(state.reactionWindow?.priorityPlayerId).toBe("p1");
    expect(
      getLegalActions(state, "p1").some((legal) => legal.action.type === "USE_ACTIVE_EFFECT")
    ).toBe(true);

    const onAction = vi.fn();
    render(
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

    const healButton = screen.getByRole("button", { name: /First Aid Tent heal/i });
    act(() => fireEvent.click(healButton));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction.mock.calls[0][0]).toMatchObject({
      type: "USE_ACTIVE_EFFECT",
      playerId: "p1",
      target: { type: "unit", unitId: "unit_p1_crusaders" }
    });

    // The fired heal resolves cleanly: a DAMAGE_HEALED on the Crusaders is logged
    // (the wound is mended before the incoming hit is then calculated).
    const applied = applyAction(state, onAction.mock.calls[0][0] as GameAction);
    expect(applied.errors).toEqual([]);
    const healed = applied.state.eventLog.some(
      (event) =>
        event.type === "DAMAGE_HEALED" &&
        event.target.type === "unit" &&
        event.target.unitId === "unit_p1_crusaders"
    );
    expect(healed, "the Tent heal mended the Crusaders before the hit").toBe(true);
  });
});

describe("ReactionTray — Crag Hack Offense VI convert is reachable", () => {
  /**
   * Offense VI is a combat-long aura: every held card may be discarded for an
   * instant +1 attack. The engine offers CONVERT_CARD_TO_ATTACK (not PLAY_REACTION),
   * so without a dedicated tile the specialty is invisible in the reaction tray.
   */
  it("renders one-click tiles that fire CONVERT_CARD_TO_ATTACK for each held card", () => {
    const state = createInitialGameState("tray-offense-vi");
    state.players.p1.hand = ["specialty.crag_hack.6", "stat.attack", "stat.defense"];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";
    const attacker = state.combat!.units.unit_p1_griffins;
    attacker.abilities = [];
    attacker.type = "ground";
    attacker.position = 9;
    const defender = state.combat!.units.unit_p2_skeletons;
    defender.abilities = [];
    defender.position = 13;

    // Play the ongoing VI aura first (via legal-actions, not a forged PLAY_CARD).
    const playVi = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "specialty.crag_hack.6"
    );
    expect(playVi, "Offense VI is a combat play").toBeTruthy();
    const played = applyAction(state, playVi!.action);
    expect(played.errors).toEqual([]);
    const declared = applyAction(played.state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_griffins",
      defenderId: "unit_p2_skeletons"
    });
    expect(declared.errors).toEqual([]);
    expect(
      getLegalActions(declared.state, "p1").some((legal) => legal.action.type === "CONVERT_CARD_TO_ATTACK")
    ).toBe(true);

    const onAction = vi.fn();
    render(
      <CardZoomProvider>
        <ReactionTray
          legalActions={getLegalActions(declared.state, "p1")}
          onAction={onAction}
          state={declared.state}
          view={getPlayerView(declared.state, "p1")}
          viewerPlayerId="p1"
        />
      </CardZoomProvider>
    );

    // At least one Offense VI convert button is visible and fires the action.
    const convert = screen.getAllByRole("button", { name: /offense vi: discard/i })[0];
    act(() => fireEvent.click(convert));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction.mock.calls[0][0]).toMatchObject({
      type: "CONVERT_CARD_TO_ATTACK",
      playerId: "p1"
    });
  });
});

describe("RerollModal — the die rolls before the keep/reroll choice", () => {
  /** Minimal state carrying an open attack-die reroll choice for `playerId`. */
  function rerollState(playerId: PlayerId = "p1"): GameState {
    return {
      players: { p1: { name: "You" }, p2: { name: "Rival" } },
      pendingChoice: {
        id: "choice_1",
        type: "ATTACK_DIE_REROLL",
        playerId,
        stackItemId: "stack_1",
        attackerId: "att1",
        defenderId: "def1",
        isRetaliation: false,
        attackKind: "melee",
        rollMode: "normal",
        attackBonus: 0,
        defenseBonus: 0,
        candidates: [{ rolls: [1], roll: 1 }],
        remainingRerolls: 1,
        rerollSources: [],
        sourceEffectIds: []
      },
      combat: { units: { att1: { id: "att1", name: "Crusaders" }, def1: { id: "def1", name: "Skeletons" } } }
    } as unknown as GameState;
  }

  const keep: LegalAction = {
    label: "Keep +1",
    action: { type: "CHOOSE_PENDING_ROLL", playerId: "p1", candidateIndex: 0 } as unknown as GameAction
  };
  const reroll: LegalAction = {
    label: "Reroll attack die (1 left)",
    action: { type: "REROLL_PENDING_CHOICE", playerId: "p1" } as unknown as GameAction
  };

  it("tumbles the die first, hiding keep/reroll until it settles", () => {
    vi.useFakeTimers();
    const onAction = vi.fn();
    const { container } = render(
      <RerollModal legalActions={[keep, reroll]} onAction={onAction} state={rerollState()} viewerPlayerId="p1" />
    );

    // While the cube is mid-throw the choice is withheld and the die tumbles.
    expect(container.querySelector(".dieCube.tumbling")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Keep/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Reroll/ })).toBeNull();

    // Just before it settles, still rolling.
    act(() => vi.advanceTimersByTime(DICE_ROLL_MS - 50));
    expect(screen.queryByRole("button", { name: /^Keep/ })).toBeNull();

    // Once the throw lands, the keep/reroll choice appears for the result.
    act(() => vi.advanceTimersByTime(100));
    expect(container.querySelector(".dieCube.tumbling")).toBeNull();
    expect(screen.getByRole("button", { name: /^Keep/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Reroll/ })).toBeTruthy();
  });

  it("re-tumbles each fresh reroll candidate before re-offering the choice", () => {
    vi.useFakeTimers();
    const onAction = vi.fn();
    const state = rerollState();
    const { container, rerender } = render(
      <RerollModal legalActions={[keep, reroll]} onAction={onAction} state={state} viewerPlayerId="p1" />
    );
    act(() => vi.advanceTimersByTime(DICE_ROLL_MS + 10));
    expect(screen.getByRole("button", { name: /^Keep/ })).toBeTruthy();

    // A reroll lands a second candidate: the modal must tumble again, not flash
    // the new face straight into a keep button.
    const rerolled = rerollState();
    (rerolled.pendingChoice as { candidates: { rolls: number[]; roll: number }[] }).candidates = [
      { rolls: [1], roll: 1 },
      { rolls: [-1], roll: -1 }
    ];
    // The engine offers the keep against the NEW latest candidate (index 1).
    const keepLatest: LegalAction = {
      label: "Keep -1",
      action: { type: "CHOOSE_PENDING_ROLL", playerId: "p1", candidateIndex: 1 } as unknown as GameAction
    };
    rerender(<RerollModal legalActions={[keepLatest, reroll]} onAction={onAction} state={rerolled} viewerPlayerId="p1" />);
    expect(container.querySelector(".dieCube.tumbling")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Keep/ })).toBeNull();

    act(() => vi.advanceTimersByTime(DICE_ROLL_MS + 10));
    expect(screen.getByRole("button", { name: /^Keep/ })).toBeTruthy();
  });

  it("shows the waiting strip (no tumble, no buttons) to the non-choosing side", () => {
    const onAction = vi.fn();
    const { container } = render(
      <RerollModal legalActions={[]} onAction={onAction} state={rerollState("p2")} viewerPlayerId="p1" />
    );
    expect(screen.getByText(/may reroll the attack die/i)).toBeTruthy();
    expect(container.querySelector(".dieCube.tumbling")).toBeNull();
    expect(screen.queryByRole("button", { name: /^Keep/ })).toBeNull();
  });
});

describe("AfkVotePanel — the vote UI and the idle call-a-vote button", () => {
  function adventureGame(): GameState {
    const state = createAdventureGameState({ seed: "afk-panel", difficulty: "normal", rollFirstPlayer: false });
    // The AFK vote / auto-kick / turn timer UI shows only on a CLOSED (hosted)
    // table — an open table carries no time pressure.
    state.room = { hosted: true, hostClientId: "host", members: [] };
    return state;
  }

  it("offers Kick / Wait to a live non-target viewer and dispatches the vote", () => {
    const state = adventureGame();
    getAfkState(state).vote = {
      targetPlayerId: "p1",
      startedByPlayerId: "p2",
      startedAt: Date.now(),
      votes: { p2: "kick" }
    };
    // A 2-player game: the starter p2 already voted, so render as an
    // (impossible in play, but shape-wise fine) undecided third seat is not
    // available — instead check the TARGET p1 sees no buttons, only the hint.
    const onAction = vi.fn();
    render(<AfkVotePanel onAction={onAction} state={state} viewerPlayerId={"p1" as PlayerId} />);
    expect(screen.queryByRole("button", { name: "Kick" })).toBeNull();
    expect(screen.getByText(/act to cancel the vote/i)).toBeTruthy();
    cleanup();

    // An undecided live voter gets both buttons; clicking dispatches the vote.
    const open = adventureGame();
    getAfkState(open).vote = {
      targetPlayerId: "p1",
      startedByPlayerId: "p2",
      startedAt: Date.now(),
      votes: {}
    };
    render(<AfkVotePanel onAction={onAction} state={open} viewerPlayerId={"p2" as PlayerId} />);
    fireEvent.click(screen.getByRole("button", { name: "Kick" }));
    expect(onAction).toHaveBeenCalledWith({ type: "CAST_AFK_VOTE", playerId: "p2", vote: "kick" });
    fireEvent.click(screen.getByRole("button", { name: "Wait" }));
    expect(onAction).toHaveBeenCalledWith({ type: "CAST_AFK_VOTE", playerId: "p2", vote: "wait" });
  });

  it("calls a vote in two steps (arm then confirm), only against the idle awaited seat", () => {
    const state = adventureGame();
    state.activePlayerId = "p1"; // p1 is on turn → the awaited, kickable seat
    const afk = getAfkState(state);
    afk.lastActionAt.p1 = Date.now() - AFK_IDLE_MS - 60_000; // long gone
    afk.lastActionAt.p2 = Date.now();
    const onAction = vi.fn();
    render(<AfkVotePanel onAction={onAction} state={state} viewerPlayerId={"p2" as PlayerId} />);
    // First click ARMS the target — it must NOT dispatch the vote yet.
    fireEvent.click(screen.getByRole("button", { name: /is away .* call a kick vote/i }));
    expect(onAction).not.toHaveBeenCalled();
    // The confirm step is shown; confirming dispatches the vote.
    fireEvent.click(screen.getByRole("button", { name: /confirm vote/i }));
    expect(onAction).toHaveBeenCalledWith({ type: "START_AFK_VOTE", playerId: "p2", targetPlayerId: "p1" });
    cleanup();

    // CONTROL 1 (fresh): with both seats fresh, no button renders at all.
    const fresh = adventureGame();
    getAfkState(fresh).lastActionAt = { p1: Date.now(), p2: Date.now() };
    render(<AfkVotePanel onAction={vi.fn()} state={fresh} viewerPlayerId={"p2" as PlayerId} />);
    expect(screen.queryByRole("button")).toBeNull();
    cleanup();

    // CONTROL 2 (not their turn): p1 is idle but it is p2's turn, so p1 is NOT
    // offered as a kick target in ordered play.
    const notTheirTurn = adventureGame();
    notTheirTurn.activePlayerId = "p2";
    const afk2 = getAfkState(notTheirTurn);
    afk2.lastActionAt = { p1: Date.now() - AFK_IDLE_MS - 60_000, p2: Date.now() };
    render(<AfkVotePanel onAction={vi.fn()} state={notTheirTurn} viewerPlayerId={"p2" as PlayerId} />);
    expect(screen.queryByRole("button", { name: /call a kick vote/i })).toBeNull();
  });

  it("turn timer: shows the countdown once an open turn is under five minutes (a fresh turn is the CONTROL)", () => {
    const state = adventureGame();
    state.activePlayerId = "p1";
    const afk = getAfkState(state);
    afk.lastActionAt = { p1: Date.now(), p2: Date.now() }; // nobody is idle
    afk.turnOpenSince = { p1: Date.now() - TURN_TIME_LIMIT_MS + 4 * 60_000 }; // 4:00 left
    render(<AfkVotePanel onAction={vi.fn()} state={state} viewerPlayerId={"p1" as PlayerId} />);
    expect(screen.getByText(/Your turn auto-ends in/i)).toBeTruthy();
    cleanup();

    // The opponent sees the same countdown named after the seat it is about.
    render(<AfkVotePanel onAction={vi.fn()} state={state} viewerPlayerId={"p2" as PlayerId} />);
    expect(screen.getByText(/turn ends in/i)).toBeTruthy();
    cleanup();

    // CONTROL: a freshly-opened turn (9+ minutes left) shows no countdown.
    const fresh = adventureGame();
    fresh.activePlayerId = "p1";
    const afk2 = getAfkState(fresh);
    afk2.lastActionAt = { p1: Date.now(), p2: Date.now() };
    afk2.turnOpenSince = { p1: Date.now() };
    render(<AfkVotePanel onAction={vi.fn()} state={fresh} viewerPlayerId={"p1" as PlayerId} />);
    expect(screen.queryByText(/auto-ends in/i)).toBeNull();
  });

  it("turn timer: auto-fires FORCE_TURN_TIMEOUT once the open turn is over budget (still-in-budget is the CONTROL)", () => {
    const state = adventureGame();
    state.activePlayerId = "p1";
    const afk = getAfkState(state);
    afk.lastActionAt = { p1: Date.now(), p2: Date.now() }; // actively clicking, never "idle"
    afk.turnOpenSince = { p1: Date.now() - TURN_TIME_LIMIT_MS - 1_000 }; // budget burned
    const onAction = vi.fn();
    render(<AfkVotePanel onAction={onAction} state={state} viewerPlayerId={"p2" as PlayerId} />);
    expect(onAction).toHaveBeenCalledWith({ type: "FORCE_TURN_TIMEOUT", playerId: "p2", targetPlayerId: "p1" });
    cleanup();

    // CONTROL: with budget left nothing fires.
    const inBudget = adventureGame();
    inBudget.activePlayerId = "p1";
    const afk2 = getAfkState(inBudget);
    afk2.lastActionAt = { p1: Date.now(), p2: Date.now() };
    afk2.turnOpenSince = { p1: Date.now() - 60_000 };
    const onAction2 = vi.fn();
    render(<AfkVotePanel onAction={onAction2} state={inBudget} viewerPlayerId={"p2" as PlayerId} />);
    expect(onAction2).not.toHaveBeenCalledWith(expect.objectContaining({ type: "FORCE_TURN_TIMEOUT" }));
  });

  it("auto-fires the certain 30-minute kick against a seat idle that long", () => {
    const state = adventureGame();
    const afk = getAfkState(state);
    afk.lastActionAt.p1 = Date.now() - AFK_AUTO_KICK_MS - 1_000; // 30 min+ gone
    afk.lastActionAt.p2 = Date.now();
    const onAction = vi.fn();
    render(<AfkVotePanel onAction={onAction} state={state} viewerPlayerId={"p2" as PlayerId} />);
    expect(onAction).toHaveBeenCalledWith({ type: "FORCE_AFK_KICK", playerId: "p2", targetPlayerId: "p1" });
    cleanup();

    // CONTROL: idle only ~10 min (past the vote window, short of the 30-min hard
    // kick) fires no auto-kick.
    const shorter = adventureGame();
    const afk2 = getAfkState(shorter);
    afk2.lastActionAt = { p1: Date.now() - AFK_IDLE_MS - 1_000, p2: Date.now() };
    const onAction2 = vi.fn();
    render(<AfkVotePanel onAction={onAction2} state={shorter} viewerPlayerId={"p2" as PlayerId} />);
    expect(onAction2).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "FORCE_AFK_KICK" })
    );
  });

  it("CONTROL: an OPEN (non-hosted) table renders no AFK panel and fires no auto-kick", () => {
    const state = adventureGame();
    state.room = { hosted: false, hostClientId: null, members: [] };
    const afk = getAfkState(state);
    afk.lastActionAt.p1 = Date.now() - AFK_AUTO_KICK_MS - 1_000; // 30 min+ gone
    afk.lastActionAt.p2 = Date.now();
    const onAction = vi.fn();
    const { container } = render(
      <AfkVotePanel onAction={onAction} state={state} viewerPlayerId={"p2" as PlayerId} />
    );
    expect(container.firstChild).toBeNull();
    expect(onAction).not.toHaveBeenCalled();
  });
});

describe("ResetVotePanel — the New-adventure confirmation UI", () => {
  function game(): GameState {
    return createAdventureGameState({ seed: "reset-panel", difficulty: "normal", rollFirstPlayer: false });
  }
  function openVote(state: GameState) {
    state.resetVote = {
      startedByPlayerId: "p1",
      startedByClientId: "cA",
      startedAt: Date.now(),
      confirmations: { p1: true }
    };
  }

  it("renders nothing when no vote is open", () => {
    const { container } = render(<ResetVotePanel onAction={vi.fn()} state={game()} viewerPlayerId={"p2" as PlayerId} />);
    expect(container.firstChild).toBeNull();
  });

  it("offers Confirm to a not-yet-confirmed seat and dispatches CONFIRM_ROOM_RESET", () => {
    const state = game();
    openVote(state);
    const onAction = vi.fn();
    render(<ResetVotePanel onAction={onAction} state={state} viewerPlayerId={"p2" as PlayerId} />);
    fireEvent.click(screen.getByRole("button", { name: /confirm new adventure/i }));
    expect(onAction).toHaveBeenCalledWith({ type: "CONFIRM_ROOM_RESET", playerId: "p2" });
    // Decline cancels the whole vote for the table.
    fireEvent.click(screen.getByRole("button", { name: /decline/i }));
    expect(onAction).toHaveBeenCalledWith({ type: "CANCEL_ROOM_RESET", playerId: "p2" });
  });

  it("a HOSTED room offers the viewer only their OWN seat — the requester (already confirmed) sees Withdraw, not Confirm", () => {
    const state = game();
    openVote(state);
    state.room = { hosted: true, hostClientId: "cA", members: [] };
    // The requester p1 has already confirmed: in a hosted room only their own
    // seat is offered, so there is no Confirm button — only Withdraw. (The
    // CONTROL: an open table WOULD offer them p2's seat.)
    render(<ResetVotePanel onAction={vi.fn()} state={state} viewerPlayerId={"p1" as PlayerId} />);
    expect(screen.queryByRole("button", { name: /confirm/i })).toBeNull();
    expect(screen.getByRole("button", { name: /withdraw/i })).toBeTruthy();
  });

  it("offers the HOST a 'Start now' override that fires onForceReset (escape hatch for a stuck vote)", () => {
    const state = game();
    openVote(state);
    state.room = { hosted: true, hostClientId: "cA", members: [] };
    const onForceReset = vi.fn();
    render(
      <ResetVotePanel
        onAction={vi.fn()}
        state={state}
        viewerPlayerId={"p1" as PlayerId}
        canForceReset
        onForceReset={onForceReset}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /start now/i }));
    expect(onForceReset).toHaveBeenCalledTimes(1);
  });

  it("CONTROL: a non-host viewer never sees the 'Start now' override", () => {
    const state = game();
    openVote(state);
    state.room = { hosted: true, hostClientId: "cA", members: [] };
    // canForceReset defaults to false — the override button is host-only.
    render(<ResetVotePanel onAction={vi.fn()} state={state} viewerPlayerId={"p2" as PlayerId} />);
    expect(screen.queryByRole("button", { name: /start now/i })).toBeNull();
  });
});

describe("ReactionTray — spell cast Power floor / ceiling", () => {
  function castImplosionOpen(seed: string, hand: string[]): GameState {
    const state = createInitialGameState(seed);
    state.players.p1.hand = hand;
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_marksmen";
    state.combat!.units.unit_p2_skeletons.abilities = [];
    state.combat!.units.unit_p2_skeletons.maxHealth = 30;
    const cast = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "CAST_SPELL" && legal.action.cardId === "spell.implosion"
    );
    expect(cast).toBeTruthy();
    const next = applyAction(state, cast!.action);
    expect(next.errors).toEqual([]);
    return next.state;
  }

  it("shows under-min warning and a Go-back dialog when Pass is clicked at Power 0 with fuel left", () => {
    const onAction = vi.fn();
    const state = castImplosionOpen("tray-impl-under", ["spell.implosion", "stat.power"]);
    render(
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

    expect(screen.getByText(/needs ≥1/i)).toBeTruthy();
    expect(screen.getByText(/needs at least Power 1/i)).toBeTruthy();

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /resolve implosion/i }));
    });
    // Modal: go back only — no resolve path while under min with fuel available.
    expect(screen.getByRole("dialog", { name: /spell power check/i })).toBeTruthy();
    expect(screen.getByText(/not enough power/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /go back — add power/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /resolve anyway/i })).toBeNull();
    expect(onAction).not.toHaveBeenCalled();

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /go back — add power/i }));
    });
    expect(screen.queryByRole("dialog", { name: /spell power check/i })).toBeNull();
    expect(onAction).not.toHaveBeenCalled();
  });

  it("warns when Power is past the top tier and offers Go back or Resolve anyway", () => {
    const onAction = vi.fn();
    // Seed high Power on the cast stack so the meter reads over Implosion's top tier (5).
    const state = castImplosionOpen("tray-impl-over", ["spell.implosion", "stat.power"]);
    const stack = state.stack.at(-1);
    expect(stack?.action.type).toBe("CAST_SPELL");
    if (stack) {
      stack.modifiers.spellPowerBonus = 7; // 0 printed + 7 fuelled → past 5
    }

    render(
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

    expect(screen.getByText(/past top tier|top tier 5/i)).toBeTruthy();

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /resolve implosion/i }));
    });
    expect(screen.getByRole("dialog", { name: /spell power check/i })).toBeTruthy();
    expect(screen.getByText(/power past the top tier/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /go back — adjust power/i })).toBeTruthy();

    // Go back does not submit.
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /go back — adjust power/i }));
    });
    expect(onAction).not.toHaveBeenCalled();

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /resolve implosion/i }));
    });
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /resolve anyway/i }));
    });
    expect(onAction).toHaveBeenCalledWith({ type: "PASS_REACTION", playerId: "p1" });
  });
});

describe("ReactionTray — anime Hero Grade reaction skill is reachable (§3.11)", () => {
  /**
   * p2's Skeletons attack p1's Griffins. p1's main hero has the Iron Will node,
   * so the engine offers USE_HERO_SKILL_REACTION (a non-card instant, +1 Defense
   * on the incoming hit) in the attack window. It is not a PLAY_REACTION card, so
   * the tray renders its own bespoke tile.
   */
  function ironWillWindow(): GameState {
    const state = createInitialGameState("tray-hero-grade-seed");
    state.anime = { ...DEFAULT_ANIME_OPTIONS, enabled: true, heroGrades: true };
    state.heroes.hero_p1.grade = 2;
    state.heroes.hero_p1.gradeNodes = ["iron-will"];
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    const target = state.combat!.units.unit_p1_griffins;
    target.abilities = [];
    target.position = 9;
    const attacker = state.combat!.units.unit_p2_skeletons;
    attacker.abilities = [];
    state.activePlayerId = "p2";
    state.combat!.activeUnitId = "unit_p2_skeletons";
    const result = applyAction(state, {
      type: "ATTACK_UNIT",
      playerId: "p2",
      attackerId: "unit_p2_skeletons",
      defenderId: "unit_p1_griffins"
    });
    expect(result.errors).toEqual([]);
    return result.state;
  }

  it("renders a tile that fires USE_HERO_SKILL_REACTION in the attack window", () => {
    const state = ironWillWindow();
    expect(state.reactionWindow?.priorityPlayerId).toBe("p1");
    expect(getLegalActions(state, "p1").some((legal) => legal.action.type === "USE_HERO_SKILL_REACTION")).toBe(true);

    const onAction = vi.fn();
    render(
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

    const skillButton = screen.getByRole("button", { name: /Iron Will/i });
    act(() => fireEvent.click(skillButton));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction.mock.calls[0][0]).toMatchObject({
      type: "USE_HERO_SKILL_REACTION",
      playerId: "p1",
      nodeId: "iron-will"
    });
  });
});

describe("ReactionTray — a PAUSED window (Scholar's discard pick) yields to the choice prompt", () => {
  // Reported bug tail: Scholar played as the last card in hand pauses the
  // window while its TAKE_FROM_DISCARD pick is owed. getLegalActions then offers
  // ONLY the pick, so the tray would render "No playable instants — pass to
  // continue." next to a Pass button the engine REJECTS.
  function scholarPausedState(): GameState {
    const state = createInitialGameState("tray-scholar-paused");
    state.players.p1.hand = ["ability.scholar"];
    state.players.p1.discard = ["ability.offense"];
    state.players.p2.hand = [];
    const units = state.combat!.units;
    units.unit_p1_crusaders.position = 14;
    const attacker = units.unit_p2_skeletons;
    attacker.position = 13;
    attacker.activatedThisRound = false;
    attacker.attackedThisActivation = false;
    state.activePlayerId = "p2";
    state.combat!.activeUnitId = "unit_p2_skeletons";

    const declared = applyAction(state, {
      type: "ATTACK_UNIT",
      playerId: "p2",
      attackerId: "unit_p2_skeletons",
      defenderId: "unit_p1_crusaders"
    });
    expect(declared.errors).toEqual([]);
    const offer = getLegalActions(declared.state, "p1").find(
      (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === "ability.scholar"
    );
    const played = applyAction(declared.state, offer!.action);
    expect(played.errors).toEqual([]);
    return played.state;
  }

  function tray(state: GameState) {
    return (
      <CardZoomProvider>
        <ReactionTray
          legalActions={getLegalActions(state, "p1")}
          onAction={vi.fn()}
          state={state}
          view={getPlayerView(state, "p1")}
          viewerPlayerId="p1"
        />
      </CardZoomProvider>
    );
  }

  it("renders nothing while the pick is owed, then comes back with the taken card", () => {
    const paused = scholarPausedState();
    expect(paused.pendingChoice?.playerId, "p1 owes the discard pick").toBe("p1");
    expect(paused.reactionWindow?.priorityPlayerId, "the window is paused with p1").toBe("p1");

    const { unmount } = render(tray(paused));
    expect(screen.queryByText(/Instant window/i), "no tray while the pick is owed").toBeNull();
    expect(screen.queryByText(/No playable instants/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /^Pass$/i })).toBeNull();
    unmount();
    cleanup();

    // Answer the pick (take Offense back): the tray returns with the RE-DERIVED
    // offers, including the just-recovered card.
    const choice = paused.pendingChoice!;
    const optionIndex =
      choice.type === "OPTION_CHOICE"
        ? choice.options.findIndex((option) => option.label.toLowerCase().includes("offense"))
        : -1;
    expect(optionIndex).toBeGreaterThanOrEqual(0);
    const taken = applyAction(paused, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: choice.id,
      optionIndex
    });
    expect(taken.errors).toEqual([]);
    expect(taken.state.pendingChoice).toBeFalsy();

    render(tray(taken.state));
    expect(screen.getByText(/Instant window/i), "the tray is back").toBeTruthy();
    // The just-recovered Offense really is offered in the SAME window (it joins
    // as a draw-only reaction on the defender side), so the keep-playing flow
    // has a real button — not merely an empty tray.
    expect(
      getLegalActions(taken.state, "p1").some(
        (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === "ability.offense"
      ),
      "the engine offers the recovered card in this window"
    ).toBe(true);
    expect(screen.queryByText(/No playable instants/i), "the recovered card has a tile").toBeNull();
  });
});

describe("ReactionTray — WOG commander instant reaction has a button", () => {
  /** Opens a real instant window (a Magic Arrow cast) so the tray renders. */
  function openWindow(seed: string) {
    let state = createInitialGameState(seed);
    state.players.p1.hand = ["spell.magic_arrow", "stat.power"];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";
    state.combat!.units.unit_p1_griffins.activatedThisRound = false;
    const target = state.combat!.units.unit_p2_skeletons;
    const cast = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "CAST_SPELL" &&
        legal.action.cardId === "spell.magic_arrow" &&
        legal.action.target.type === "unit" &&
        legal.action.target.unitId === target.id
    );
    state = applyAction(state, cast!.action).state;
    expect(state.reactionWindow, "an instant window is open").toBeTruthy();
    return { state, targetId: target.id };
  }

  it("renders a clickable tile for USE_COMMANDER_CAST_REACTION and dispatches it", () => {
    // The engine OFFER is pinned in wog-commander-casts.test.ts. This pins the UI
    // half the bug lived in: the human reaction tray renders only an allow-list of
    // action types, and USE_COMMANDER_CAST_REACTION was on none of them — so a
    // commander instant (Rampart Hierophant's Shield…) "never worked", the tray
    // showing only "No playable instants — pass".
    const { state, targetId } = openWindow("tray-commander-cast");
    const commanderAction: GameAction = {
      type: "USE_COMMANDER_CAST_REACTION",
      playerId: "p1",
      commanderUnitId: "unit_p1_griffins",
      targetUnitId: targetId
    };
    const legalActions = [
      { action: commanderAction, label: "Hierophant: cast Shield (Power 3) on Skeletons" }
    ] as unknown as LegalAction[];
    const onAction = vi.fn();
    render(
      <CardZoomProvider>
        <ReactionTray
          legalActions={legalActions}
          onAction={onAction}
          state={state}
          view={getPlayerView(state, "p1")}
          viewerPlayerId="p1"
        />
      </CardZoomProvider>
    );
    const button = screen.getByRole("button", { name: /Hierophant: cast Shield \(Power 3\) on Skeletons/i });
    fireEvent.click(button);
    expect(onAction).toHaveBeenCalledWith(commanderAction);
    expect(
      screen.queryByText(/No playable instants/i),
      "the commander cast is a real tile, not the empty state"
    ).toBeNull();
  });

  // Cards of Prophecy's PRE-ROLL declaration (Polish Balance Pack option B, USER
  // RULING 2026-08-22) is the same shape: a standalone legal action, not a
  // PLAY_REACTION card, so without its own tile the engine would offer it in the
  // attack window and a human would have no button (the commander-cast bug class).
  it("renders a clickable tile for USE_PROPHECY_PRE_ROLL and dispatches it", () => {
    const { state } = openWindow("tray-prophecy-pre-roll");
    const prophecyAction: GameAction = {
      type: "USE_PROPHECY_PRE_ROLL",
      playerId: "p1",
      unitId: "unit_p1_griffins"
    };
    const legalActions = [
      {
        action: prophecyAction,
        label: "Cards of Prophecy: roll Griffins's attack die 3 times and resolve 1 chosen result"
      }
    ] as unknown as LegalAction[];
    const onAction = vi.fn();
    render(
      <CardZoomProvider>
        <ReactionTray
          legalActions={legalActions}
          onAction={onAction}
          state={state}
          view={getPlayerView(state, "p1")}
          viewerPlayerId="p1"
        />
      </CardZoomProvider>
    );
    const button = screen.getByRole("button", { name: /Cards of Prophecy: roll .* 3 times/i });
    fireEvent.click(button);
    expect(onAction).toHaveBeenCalledWith(prophecyAction);
    expect(
      screen.queryByText(/No playable instants/i),
      "the pre-roll declaration is a real tile, not the empty state"
    ).toBeNull();
  });

  it("CONTROL: with no commander cast offered, the tray shows the empty state", () => {
    const { state } = openWindow("tray-commander-cast-control");
    render(
      <CardZoomProvider>
        <ReactionTray
          legalActions={[]}
          onAction={vi.fn()}
          state={state}
          view={getPlayerView(state, "p1")}
          viewerPlayerId="p1"
        />
      </CardZoomProvider>
    );
    expect(screen.getByText(/No playable instants/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /cast Shield/i })).toBeNull();
  });
});
