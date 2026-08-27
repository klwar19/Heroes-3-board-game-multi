// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { GameAction, LegalAction } from "@/engine";
import { PochiPackDigMenu } from "./board";

afterEach(cleanup);

describe("Pochi Pack Dig chooser", () => {
  it("opens one real dialog and dispatches the selected adjacent cell", () => {
    const actions: LegalAction[] = [8, 12].map((position) => ({
      action: {
        type: "USE_UNIT_ABILITY",
        playerId: "p1",
        unitId: "pochi",
        abilityId: "mgq-pack-dig",
        target: { type: "space", position }
      },
      label: `Dig obstacle at cell ${position}`
    }));
    const onAction = vi.fn<(action: GameAction) => void>();

    render(<PochiPackDigMenu actions={actions} onAction={onAction} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getAllByRole("button")).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Pack Dig…" }));
    const dialog = screen.getByRole("dialog", { name: "Choose where Pochi digs" });
    expect(within(dialog).getByText("Choose an adjacent empty cell for the obstacle.")).toBeTruthy();

    fireEvent.click(within(dialog).getByRole("button", { name: "Dig obstacle at cell 12" }));
    expect(onAction).toHaveBeenCalledOnce();
    expect(onAction).toHaveBeenCalledWith(actions[1].action);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
