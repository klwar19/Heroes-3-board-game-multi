// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CustomMapTilePlan } from "@/engine";

vi.mock("@/lib/shared-maps", () => ({
  fetchSharedMaps: vi.fn(async () => []),
  saveSharedMap: vi.fn(),
  deleteSharedMap: vi.fn()
}));

vi.mock("@/lib/identity", () => ({
  getAccountIdentity: vi.fn(() => null),
  getClientId: vi.fn(() => "designer-test-client"),
  getDisplayName: vi.fn(() => "Designer Test")
}));

vi.mock("@/components/adventure/map-preset-editor", () => ({
  MapPresetEditor: () => <div data-testid="preset-editor" />
}));

vi.mock("@/components/adventure/map-designer", () => ({
  MapDesigner: ({
    customMap,
    onChange
  }: {
    customMap: CustomMapTilePlan[];
    onChange: (next: CustomMapTilePlan[]) => void;
  }) => (
    <div>
      <output data-testid="placed-tile-count">{customMap.length}</output>
      <button
        onClick={() =>
          onChange([
            ...customMap,
            { row: 8, col: 8, group: "near", faceDown: true }
          ])
        }
        type="button"
      >
        Simulate map edit
      </button>
    </div>
  )
}));

import MapDesignerPage from "./page";

describe("Map designer Undo", () => {
  it("restores the complete prior map edit and disables itself at the beginning of history", async () => {
    render(<MapDesignerPage />);
    await waitFor(() => expect(screen.queryByText(/Loading the shared library/i)).toBeNull());

    const undo = screen.getByRole("button", { name: "Undo last map edit" });
    expect(undo.hasAttribute("disabled")).toBe(true);
    expect(screen.getByTestId("placed-tile-count").textContent).toBe("0");

    fireEvent.click(screen.getByRole("button", { name: "Simulate map edit" }));
    expect(screen.getByTestId("placed-tile-count").textContent).toBe("1");
    expect(undo.hasAttribute("disabled")).toBe(false);

    fireEvent.click(undo);
    expect(screen.getByTestId("placed-tile-count").textContent).toBe("0");
    expect(undo.hasAttribute("disabled")).toBe(true);
  });
});
