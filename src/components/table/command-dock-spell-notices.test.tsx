// @vitest-environment jsdom
/**
 * "Why is there no cast button?" — the combat command dock renders the engine's
 * spell-cast restriction notices beside the Spell counter.
 *
 * The strip is PRESENTATION over `spellCastRestrictionNotices` (the same reads
 * that strip the CAST_SPELL offers). These cases pin that it renders the engine's
 * text when a restriction bites and renders NOTHING when none does — so deleting
 * the `spellCastRestrictionNotices` call in board.tsx fails here.
 */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CommandDock } from "./board";
import { CardZoomProvider } from "./zoom";
import { createInitialGameState, spellCastRestrictionNotices, type GameState } from "@/engine";

afterEach(cleanup);

function scene(seed = "dock-spell-notice"): GameState {
  const state = createInitialGameState(seed);
  state.players.p1.hand = ["spell.magic_arrow"];
  state.activePlayerId = "p1";
  state.combat!.activeUnitId = "unit_p1_griffins";
  return state;
}

function renderDock(state: GameState, viewerPlayerId = "p1") {
  return render(
    <CardZoomProvider>
      <CommandDock legalActions={[]} onAction={vi.fn()} state={state} viewerPlayerId={viewerPlayerId as never} />
    </CardZoomProvider>
  );
}

describe("CommandDock — spell-cast restriction notices", () => {
  it("renders NOTHING while nothing restricts the viewer's casting (CONTROL)", () => {
    const state = scene();
    expect(spellCastRestrictionNotices(state, "p1")).toEqual([]);
    const { container } = renderDock(state);
    expect(container.querySelector(".dockSpellNotices")).toBeNull();
  });

  it("renders the engine's own notice text for a live Faerie Dragons spell lock", () => {
    const state = scene("dock-faerie");
    const faerie = state.combat!.units.unit_p2_skeletons;
    faerie.abilities = ["bank-faerie-dragon-spell-lock"];
    faerie.cardName = "Faerie Dragons";
    faerie.stackToken = "attack";

    const expected = spellCastRestrictionNotices(state, "p1");
    expect(expected.map((notice) => notice.id)).toContain("enemy-spell-lock");

    const { container } = renderDock(state);
    const strip = container.querySelector(".dockSpellNotices");
    expect(strip).not.toBeNull();
    // Every engine notice reaches the screen, verbatim.
    for (const notice of expected) {
      expect(strip!.textContent).toContain(notice.text);
    }
    expect(strip!.getAttribute("aria-label")).toBe("Spell restrictions");
  });

  it("shows the spent-limit warning next to the Spell counter it explains", () => {
    const state = scene("dock-limit");
    state.players.p1.combatStats.spellsCastThisRound = 1;
    const { container } = renderDock(state);
    expect(container.querySelector(".dockLimits")?.textContent).toMatch(/Spell\s*1\/1/);
    expect(container.querySelector(".dockSpellNotices")?.textContent).toContain("Spell limit spent");
  });

  it("follows the FIGHTER, like the rest of the dock: a watcher reads their restrictions", () => {
    const state = scene("dock-watcher-notice");
    // p1 (the attacker) is the one blocked; p3 merely watches with a clean hand.
    state.players.p1.combatStats.spellsCastThisRound = 1;
    state.players.p3 = { ...structuredClone(state.players.p2), id: "p3", name: "Watcher" };
    for (const unit of Object.values(state.combat!.units)) {
      if (unit.controllerId === "p3") {
        unit.damage = unit.maxHealth;
      }
    }
    const { container } = renderDock(state, "p3");
    const strip = container.querySelector(".dockSpellNotices");
    expect(strip?.getAttribute("aria-label")).toContain("spell restrictions");
    expect(strip?.getAttribute("aria-label")).toContain(state.players.p1.name);
    expect(strip?.textContent).toContain("Spell limit spent");
  });
});
