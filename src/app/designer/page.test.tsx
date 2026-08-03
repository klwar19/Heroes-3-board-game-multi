// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
import { deleteSharedMap, fetchSharedMaps } from "@/lib/shared-maps";
import type { SharedMapRecord } from "@/server/map-registry";

const mapRecord = (over: Partial<SharedMapRecord> = {}): SharedMapRecord => ({
  id: "m1",
  name: "Alpha Vale",
  scenarioId: "skirmish",
  players: 2,
  tiles: [
    { row: 10, col: 10, group: "starting", faceDown: false },
    { row: 8, col: 8, group: "near", faceDown: true }
  ],
  createdByClientId: null,
  createdByName: "Ann",
  createdByUserId: null,
  createdAt: 0,
  updatedAt: 0,
  ...over
});

const openLibrary = async () => {
  fireEvent.click(screen.getByRole("button", { name: /^Maps/ }));
  await waitFor(() => expect(screen.getByRole("dialog", { name: "Map library" })).toBeTruthy());
};

beforeEach(() => {
  vi.mocked(fetchSharedMaps).mockResolvedValue([]);
  vi.mocked(deleteSharedMap).mockResolvedValue([]);
});

describe("Map designer — saved-map library popup", () => {
  it("moves the saved maps out of a permanent aside and behind the Maps button", async () => {
    vi.mocked(fetchSharedMaps).mockResolvedValue([mapRecord()]);
    const { container } = render(<MapDesignerPage />);
    await waitFor(() => expect(vi.mocked(fetchSharedMaps)).toHaveBeenCalled());
    // The old always-on right rail is gone; nothing lists maps until the popup opens.
    expect(container.querySelector(".designerSaved")).toBeNull();
    expect(screen.queryByRole("dialog", { name: "Map library" })).toBeNull();
    await openLibrary();
    expect(screen.getByRole("option", { name: /Alpha Vale/ })).toBeTruthy();
  });

  it("loads a selected map into the designer and closes the popup", async () => {
    vi.mocked(fetchSharedMaps).mockResolvedValue([mapRecord()]);
    render(<MapDesignerPage />);
    await waitFor(() => expect(vi.mocked(fetchSharedMaps)).toHaveBeenCalled());
    expect(screen.getByTestId("placed-tile-count").textContent).toBe("0");
    await openLibrary();
    fireEvent.click(screen.getByRole("option", { name: /Alpha Vale/ }));
    fireEvent.click(screen.getByRole("button", { name: /Open in the designer/i }));
    // The loaded map's two tiles reach the (mocked) MapDesigner, and the popup closes.
    expect(screen.getByTestId("placed-tile-count").textContent).toBe("2");
    expect(screen.queryByRole("dialog", { name: "Map library" })).toBeNull();
  });

  it("offers a delete control for an unowned map but a lock for a foreign-owned one", async () => {
    vi.mocked(fetchSharedMaps).mockResolvedValue([
      mapRecord({ id: "own", name: "Free Map", createdByUserId: null }),
      mapRecord({ id: "foreign", name: "Locked Map", createdByUserId: "someone-else" })
    ]);
    render(<MapDesignerPage />);
    await waitFor(() => expect(vi.mocked(fetchSharedMaps)).toHaveBeenCalled());
    await openLibrary();

    fireEvent.click(screen.getByRole("option", { name: /Free Map/ }));
    expect(screen.getByRole("button", { name: "Delete Free Map" })).toBeTruthy();
    // The popup portals to <body>, so query the document, not the render container.
    expect(document.querySelector(".savedMapLock")).toBeNull();

    // CONTROL: the foreign-owned map shows the lock chip, no delete button.
    fireEvent.click(screen.getByRole("option", { name: /Locked Map/ }));
    expect(screen.queryByRole("button", { name: "Delete Locked Map" })).toBeNull();
    expect(document.querySelector(".savedMapLock")).toBeTruthy();
  });

  it("deletes through deleteSharedMap with the acting actor", async () => {
    vi.mocked(fetchSharedMaps).mockResolvedValue([mapRecord({ id: "own", name: "Free Map" })]);
    vi.mocked(deleteSharedMap).mockResolvedValue([]);
    render(<MapDesignerPage />);
    await waitFor(() => expect(vi.mocked(fetchSharedMaps)).toHaveBeenCalled());
    await openLibrary();
    fireEvent.click(screen.getByRole("option", { name: /Free Map/ }));
    fireEvent.click(screen.getByRole("button", { name: "Delete Free Map" }));
    expect(vi.mocked(deleteSharedMap)).toHaveBeenCalledWith("own", { userId: null, role: null });
  });

  it("New blank map resets the draft and closes the popup", async () => {
    vi.mocked(fetchSharedMaps).mockResolvedValue([mapRecord()]);
    render(<MapDesignerPage />);
    await waitFor(() => expect(vi.mocked(fetchSharedMaps)).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "Simulate map edit" }));
    expect(screen.getByTestId("placed-tile-count").textContent).toBe("1");
    await openLibrary();
    fireEvent.click(screen.getByRole("button", { name: /New blank map/i }));
    expect(screen.getByTestId("placed-tile-count").textContent).toBe("0");
    expect(screen.queryByRole("dialog", { name: "Map library" })).toBeNull();
  });
});

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
