// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { createAdventureGameState, createInitialGameState, applyAction, getLegalActions, getPlayerView } from "@/engine";
import { NEUTRAL_PLAYER_ID, type GameAction } from "@/engine/state";
import { HandFan } from "./seats";
import { BattlefieldBoard } from "./board";
import { ReactionTray } from "./overlays";
import { CardZoomProvider } from "./zoom";
import type { CardBoardAction } from "./utils";

afterEach(cleanup);

/** A neutral fight where `playerId` holds Magic Arrow + a Power statistic. */
function arrowCombat(playerId: string, school?: string, useExpert = false) {
  const state = createAdventureGameState({ seed: "arrow-live-flow", ruleset: "binh", rollFirstPlayer: false, spellBook: true });
  state.combat = createInitialGameState("arrow-units").combat;
  const combat = state.combat!;
  combat.attackerPlayerId = playerId;
  combat.defenderPlayerId = NEUTRAL_PLAYER_ID;
  combat.context = { kind: "neutral", heroId: `hero_${playerId}`, fieldId: state.heroes[`hero_${playerId}`].spaceId!, difficulty: 3, hasAzure: false };
  for (const unit of Object.values(combat.units)) {
    unit.controllerId = unit.id.includes("p1") ? playerId : NEUTRAL_PLAYER_ID;
    unit.abilities = [];
  }
  combat.activeUnitId = "unit_p1_marksmen";
  const target = combat.units.unit_p2_skeletons;
  target.maxHealth = 50;
  target.damage = 0;
  state.phase = "combat";
  state.pendingChoice = null;
  state.activePlayerId = playerId;
  for (const player of Object.values(state.players)) player.hand = [];
  state.players[playerId].hand = ["spell.magic_arrow", "stat.power"];
  if (school) state.players[playerId].permanents = [school];
  if (useExpert) state.players[playerId].limits.expertUses = 1;
  return state;
}

/**
 * Arming a board-target Spell from the hand fan is PURELY LOCAL: it selects the
 * card, dispatches NOTHING, and clicking the same card again disarms it. That is
 * what makes the two-step "pick the card, then pick the target" flow safe — the
 * cast only leaves the client once a target is clicked. Pinned separately from
 * the happy path below because a regression here (arming that dispatched, or a
 * re-click that re-armed) would spend the card with no target chosen.
 */
it("arming Magic Arrow dispatches nothing, and re-clicking the card disarms it", () => {
  const state = arrowCombat("p1");
  const before = JSON.stringify({
    hand: state.players.p1.hand,
    permanents: state.players.p1.permanents ?? [],
    crowns: state.players.p1.limits.expertUses,
    damage: state.combat!.units.unit_p2_skeletons.damage,
    stack: state.stack.length,
  });
  let selected: CardBoardAction | null = null;
  const submit = vi.fn();
  const ui = () => (
    <CardZoomProvider>
      <HandFan
        state={state}
        view={getPlayerView(state, "p1")}
        viewerPlayerId="p1"
        legalActions={getLegalActions(state, "p1")}
        selectedCardAction={selected}
        trayActive={false}
        onSelectCardAction={(action) => {
          selected = action;
        }}
        onAction={submit}
      />
    </CardZoomProvider>
  );
  const { rerender } = render(ui());

  // 1. Arming: the card is selected, nothing is dispatched.
  fireEvent.click(screen.getByRole("button", { name: /Magic Arrow card/i }));
  expect(selected).toMatchObject({ type: "CAST_SPELL", cardId: "spell.magic_arrow" });
  expect(submit).not.toHaveBeenCalled();

  // 2. Clicking the SAME card again disarms it (seats.tsx `sameCardSelection`),
  //    still without dispatching.
  rerender(ui());
  fireEvent.click(screen.getByRole("button", { name: /Magic Arrow card/i }));
  expect(selected).toBeNull();
  expect(submit).not.toHaveBeenCalled();

  // 3. Nothing about the game moved: no card left the hand, no permanent was
  //    consumed, no crown spent, no damage dealt, no cast on the stack.
  expect(
    JSON.stringify({
      hand: state.players.p1.hand,
      permanents: state.players.p1.permanents ?? [],
      crowns: state.players.p1.limits.expertUses,
      damage: state.combat!.units.unit_p2_skeletons.damage,
      stack: state.stack.length,
    })
  ).toBe(before);
});

it.each([
  ["p1", undefined, false, 2],
  ["p2", undefined, false, 2],
  ["p1", "ability.earth_magic", false, 3],
  ["p2", "ability.earth_magic", true, 3],
  ["p1", "ability.basic_earth_magic", true, 3],
])("Magic Arrow hand → enemy target → Power window for %s with %s (expert %s)", (playerId, school, useExpert, expectedDamage) => {
  let state = arrowCombat(playerId, school, useExpert);
  const target = state.combat!.units.unit_p2_skeletons;
  let selected: CardBoardAction | null = null;
  const submit = vi.fn((action: GameAction) => {
    const result = applyAction(state, action);
    expect(result.errors).toEqual([]);
    state = result.state;
    selected = null;
  });
  const ui = () => <CardZoomProvider>
    <HandFan state={state} view={getPlayerView(state, playerId)} viewerPlayerId={playerId}
      legalActions={getLegalActions(state, playerId)} selectedCardAction={selected}
      trayActive={Boolean(state.reactionWindow)} onSelectCardAction={action => { selected = action; }} onAction={submit} />
    <BattlefieldBoard state={state} viewerPlayerId={playerId} legalActions={getLegalActions(state, playerId)}
      selectedCardAction={selected} onAction={submit} onInspect={vi.fn()} />
    <ReactionTray state={state} view={getPlayerView(state, playerId)} viewerPlayerId={playerId}
      legalActions={getLegalActions(state, playerId)} onAction={submit} />
  </CardZoomProvider>;
  const { rerender } = render(ui());
  fireEvent.click(screen.getByRole("button", { name: /Magic Arrow card/i }));
  expect(selected).toMatchObject({ type: "CAST_SPELL", cardId: "spell.magic_arrow" });
  rerender(ui());
  fireEvent.click(screen.getByRole("button", { name: `Target ${target.name}` }));
  expect(submit).toHaveBeenCalledWith(expect.objectContaining({ type: "CAST_SPELL", target: { type: "unit", unitId: target.id } }));
  expect(state.combat!.units[target.id].damage).toBe(0);
  expect(state.reactionWindow?.priorityPlayerId).toBe(playerId);
  rerender(ui());
  if (useExpert) {
    const expertLabel = school === "ability.basic_earth_magic"
      ? /Basic Earth Magic: \+3 Power/i
      : /Earth Magic: \+3 Power/i;
    fireEvent.click(screen.getByRole("button", { name: expertLabel }));
  } else {
    fireEvent.click(screen.getByRole("button", { name: "Add to play" }));
    fireEvent.click(screen.getByRole("button", { name: "Play card" }));
  }
  while (state.reactionWindow) submit({ type: "PASS_REACTION", playerId: state.reactionWindow.priorityPlayerId });
  expect(state.combat!.units[target.id].damage).toBe(expectedDamage);
  if (useExpert) {
    expect(state.players[playerId].discard).toContain(school);
    expect(state.players[playerId].hand).toContain("stat.power");
  } else {
    expect(state.players[playerId].discard).toContain("stat.power");
  }
});
