// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BattlefieldBoard, InspectPanel } from "./board";
import { CardZoomProvider } from "./zoom";
import { createInitialGameState, makeCombatUnitFromArmy, markUnitRemovedIfNeeded, type GameState } from "@/engine";
import { coreUnitDefinitions } from "@/data/factions/units";

/**
 * REPORTED BUG (2026-08-10): "Haspid when go from pack to few, not show the +2
 * attack in stats — only show the +1 attack from unit experience buff."
 *
 * The engine always folded Cove Haspids' "Vengeance" +2 into the real attack;
 * only the READOUT was missing it. These are the DOM half of the fix — the two
 * surfaces a player actually looks at (the unit card on the battlefield and the
 * inspector's LIVE TOTALS row) — with the engine invariant ("the number shown
 * is the number the dice use") pinned in
 * `src/engine/innate-flat-attack-display.test.ts`.
 */

afterEach(cleanup);

const PRINTED_FEW_ATTACK = coreUnitDefinitions["cove.haspids"].few!.attack; // 5
const VENGEANCE = 2;

/** p1's Marksmen slot replaced by an army-minted unit standing on cell 12. */
function boardWith(options: { unitDefId: string; side: "few" | "pack"; experience?: number }): GameState {
  const state = createInitialGameState("haspid-display-seed");
  const slot = state.combat!.units.unit_p1_marksmen;
  const minted = makeCombatUnitFromArmy(
    {
      id: "army_test_unit",
      unitDefId: options.unitDefId,
      side: options.side,
      ...(options.experience !== undefined ? { experience: options.experience } : {})
    },
    "p1",
    slot.id,
    0,
    "binh",
    {}
  )!;
  Object.assign(slot, minted, { id: slot.id, controllerId: slot.controllerId, position: 12 });
  return state;
}

function flipDown(state: GameState): void {
  const unit = state.combat!.units.unit_p1_marksmen;
  unit.damage = unit.maxHealth;
  markUnitRemovedIfNeeded(state, unit);
}

function renderBoard(state: GameState) {
  return render(
    <CardZoomProvider>
      <BattlefieldBoard
        state={state}
        viewerPlayerId="p1"
        legalActions={[]}
        selectedCardAction={null}
        onAction={vi.fn()}
        onInspect={() => {}}
      />
    </CardZoomProvider>
  );
}

function renderInspect(state: GameState) {
  return render(
    <CardZoomProvider>
      <InspectPanel state={state} unitId="unit_p1_marksmen" />
    </CardZoomProvider>
  );
}

describe("a flipped Haspid's Vengeance +2 is visible on the battlefield card", () => {
  it("draws a +2 Attack stat token and an up arrow after the Pack→Few flip", () => {
    const state = boardWith({ unitDefId: "cove.haspids", side: "pack" });
    flipDown(state);
    const { container } = renderBoard(state);

    const tokens = container.querySelector(".boardCardStatTokens")!;
    expect(tokens, "the flipped card must carry a stat-token rail").toBeTruthy();
    expect(tokens.querySelector(".boardStatToken.attack.up")?.textContent).toContain(`+${VENGEANCE}`);
    // The tooltip names the live total, not just the delta.
    expect(container.querySelector(".boardStatToken.attack")?.getAttribute("title")).toContain(
      `Attack ${PRINTED_FEW_ATTACK + VENGEANCE}`
    );
    expect(container.querySelector(".boardStatChange.attack.up")).toBeTruthy();
  });

  it("CONTROL — the same Haspid card BEFORE the flip draws no Attack token", () => {
    const state = boardWith({ unitDefId: "cove.haspids", side: "pack" });
    const { container } = renderBoard(state);
    expect(container.querySelector(".boardStatToken.attack")).toBeNull();
    expect(container.querySelector(".boardStatChange.attack")).toBeNull();
  });

  it("CONTROL — a flipped card with no innate Attack ability draws no Attack token", () => {
    const state = boardWith({ unitDefId: "castle.crusaders", side: "pack" });
    flipDown(state);
    const { container } = renderBoard(state);
    expect(container.querySelector(".boardStatToken.attack")).toBeNull();
  });
});

describe("the inspector's LIVE TOTALS row reads the flipped Haspid's real Attack", () => {
  it("shows Attack 8 (base 6) once the veteran +1 and the Vengeance +2 are both live", () => {
    // 10 XP = gold rank 2, whose first stats step is +1 Attack — the "+1 from
    // unit experience" the report said was the ONLY thing showing.
    const state = boardWith({ unitDefId: "cove.haspids", side: "pack", experience: 10 });
    flipDown(state);
    const { container } = renderInspect(state);

    const stats = container.querySelector(".inspectStats")!;
    const base = PRINTED_FEW_ATTACK + 1; // printed Few + the veteran rank fold
    expect(stats.textContent).toContain(`⚔ ${base + VENGEANCE} (base ${base})`);
    expect(container.querySelector(".inspectStats .statUp")).toBeTruthy();
  });

  it("CONTROL — an UNflipped Haspid Few shows its bare printed Attack, no (base …)", () => {
    const state = boardWith({ unitDefId: "cove.haspids", side: "few" });
    const { container } = renderInspect(state);
    const stats = container.querySelector(".inspectStats")!;
    expect(stats.textContent).toContain(`⚔ ${PRINTED_FEW_ATTACK}`);
    expect(stats.textContent).not.toMatch(/base/);
    expect(container.querySelector(".inspectStats .statUp")).toBeNull();
  });
});

describe("the Pack card's flip-side note promises the Attack the flip really produces", () => {
  it("a Haspid Pack previews the flipped Attack with the printed value noted", () => {
    const state = boardWith({ unitDefId: "cove.haspids", side: "pack" });
    const { container } = renderInspect(state);
    const flip = container.querySelector(".inspectFlipStats")!;
    expect(flip.textContent).toContain(`⚔ ${PRINTED_FEW_ATTACK + VENGEANCE} (printed ${PRINTED_FEW_ATTACK})`);
  });

  it("CONTROL — a Pack with no flip-triggered ability previews its plain printed Attack", () => {
    const state = boardWith({ unitDefId: "castle.crusaders", side: "pack" });
    const { container } = renderInspect(state);
    const flip = container.querySelector(".inspectFlipStats")!;
    expect(flip.textContent).toContain(`⚔ ${coreUnitDefinitions["castle.crusaders"].few!.attack} `);
    expect(flip.textContent).not.toMatch(/printed/);
  });
});
