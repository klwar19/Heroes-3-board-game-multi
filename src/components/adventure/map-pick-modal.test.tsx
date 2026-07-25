// @vitest-environment jsdom
/**
 * The Setup Hub's Map window: every playable map in one filterable list, a
 * read-only shape preview + info panel, and the difficulty bar as four chess
 * pieces. These assert the WIRING — the filters really narrow the list, the
 * preview draws the picked map's tiles, and picking a map / difficulty
 * dispatches the exact SET_GAME_OPTIONS payloads the engine reads (the same
 * ones the classic Map & Setup controls send).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createAdventureLobbyState, scenarioDefinitions, type GameState } from "@/engine";
import { fetchSharedMaps, type SharedMapRecord } from "@/lib/shared-maps";
import { DIFFICULTY_CHESS_ICONS } from "@/data/assets/homm-assets";
import { MapPickModal } from "./map-pick-modal";
import { scenarioToTilePlans } from "./map-shape-preview";

vi.mock("@/lib/shared-maps", () => ({ fetchSharedMaps: vi.fn(async () => []) }));

afterEach(cleanup);

/** A valid 2-player designed map built from the skirmish layout (passes validation). */
function designedMap(overrides: Partial<SharedMapRecord> = {}): SharedMapRecord {
  const layout = scenarioDefinitions.skirmish.layout;
  const tiles = [
    ...layout.starts.map((start) => ({ ...start, group: "starting" as const, faceDown: false })),
    ...(layout.far ?? []).map((tile) => ({ ...tile, group: "far" as const, faceDown: true })),
    ...layout.near.map((tile) => ({ ...tile, group: "near" as const, faceDown: true })),
    ...layout.center.map((tile) => ({ ...tile, group: "center" as const, faceDown: true }))
  ];
  return {
    id: "map-twin",
    name: "Twin Peaks",
    scenarioId: "skirmish",
    players: 2,
    tiles,
    createdByClientId: "c1",
    createdByName: "Binh",
    createdByUserId: null,
    createdAt: 1,
    updatedAt: 1,
    ...overrides
  } as SharedMapRecord;
}

async function open(maps: SharedMapRecord[] = [], mutate?: (state: GameState) => void) {
  vi.mocked(fetchSharedMaps).mockResolvedValue(maps);
  const onAction = vi.fn();
  const state = createAdventureLobbyState({ seed: "map-pick" });
  mutate?.(state);
  render(<MapPickModal onAction={onAction} onClose={vi.fn()} state={state} viewerPlayerId="p1" />);
  const dialog = screen.getByRole("dialog", { name: "Choose a map" });
  if (maps.length) {
    await waitFor(() => expect(within(dialog).getByText(new RegExp(maps[0].name))).toBeTruthy());
  }
  return { onAction, dialog, state };
}

function rows(dialog: HTMLElement) {
  return within(dialog)
    .getByRole("listbox", { name: "Available maps" })
    .querySelectorAll(".mapPickRow");
}

beforeEach(() => {
  vi.mocked(fetchSharedMaps).mockResolvedValue([]);
});

describe("Map window — the list", () => {
  it("lists every built-in scenario sheet plus the designed maps", async () => {
    const { dialog } = await open([designedMap()]);
    const builtinCount = Object.keys(scenarioDefinitions).length;
    const listed = Array.from(rows(dialog)).map((row) => row.textContent ?? "");
    expect(listed).toHaveLength(builtinCount + 1);
    for (const scenario of Object.values(scenarioDefinitions)) {
      expect(listed.some((text) => text.includes(scenario.name)), scenario.name).toBe(true);
    }
    expect(listed.some((text) => text.includes("Twin Peaks") && text.includes("by Binh"))).toBe(true);
  });

  it("each filter narrows the list", async () => {
    const { dialog } = await open([designedMap(), designedMap({ id: "m4", name: "Four Corners", players: 4 })]);
    const builtinCount = Object.keys(scenarioDefinitions).length;

    // Source: designed only / built-in only.
    fireEvent.click(within(dialog).getByRole("button", { name: "Designed" }));
    expect(rows(dialog)).toHaveLength(2);
    fireEvent.click(within(dialog).getByRole("button", { name: "Built-in" }));
    expect(rows(dialog)).toHaveLength(builtinCount);

    // Player count: a designed map matches its exact seats, a built-in its range.
    fireEvent.click(within(dialog).getByRole("button", { name: "All" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "4p" }));
    const fourPlayer = Array.from(rows(dialog)).map((row) => row.textContent ?? "");
    expect(fourPlayer.some((text) => text.includes("Four Corners"))).toBe(true);
    expect(fourPlayer.some((text) => text.includes("Twin Peaks"))).toBe(false);

    // Name search (matches the map name AND its author).
    fireEvent.click(within(dialog).getByRole("button", { name: "Any players" }));
    fireEvent.change(within(dialog).getByRole("searchbox", { name: "Search maps" }), {
      target: { value: "twin pea" }
    });
    expect(rows(dialog)).toHaveLength(1);
    expect(rows(dialog)[0].textContent).toContain("Twin Peaks");

    fireEvent.change(within(dialog).getByRole("searchbox", { name: "Search maps" }), { target: { value: "binh" } });
    expect(rows(dialog)).toHaveLength(2);

    fireEvent.change(within(dialog).getByRole("searchbox", { name: "Search maps" }), { target: { value: "zzz" } });
    expect(rows(dialog)).toHaveLength(0);
    expect(within(dialog).getByText(/No map matches these filters/)).toBeTruthy();
  });
});

describe("Map window — preview + info", () => {
  it("draws one flower outline per tile of the selected built-in scenario", async () => {
    const { dialog, state } = await open();
    // The applied scenario previews by default (no explicit selection yet).
    const scenario = scenarioDefinitions[state.setupLobby!.options.scenarioId];
    const expected = scenarioToTilePlans(scenario).length;
    expect(expected).toBeGreaterThan(1);

    const svg = dialog.querySelector(".mapShapePreviewSvg") as SVGElement;
    expect(svg).toBeTruthy();
    expect(svg.querySelectorAll("path")).toHaveLength(expected);
    // Seat tiles are numbered.
    expect(Array.from(svg.querySelectorAll("text")).map((node) => node.textContent)).toEqual(
      scenario.layout.starts.map((_, index) => String(index + 1))
    );
    // Info panel: player range + description.
    const info = dialog.querySelector(".mapPickInfo") as HTMLElement;
    expect(info.textContent).toContain(`${scenario.minPlayers}–${scenario.maxPlayers} players`);
    expect(info.textContent).toContain(scenario.description.slice(0, 24));
  });

  it("selecting a designed map previews ITS tiles and shows author + preset conditions", async () => {
    const record = designedMap({
      preset: { victoryPoints: { enabled: true } } as SharedMapRecord["preset"]
    });
    const { dialog } = await open([record]);
    fireEvent.click(within(dialog).getByText(/Twin Peaks/).closest("button") as HTMLElement);

    const svg = dialog.querySelector(".mapShapePreviewSvg") as SVGElement;
    expect(svg.querySelectorAll("path")).toHaveLength(record.tiles.length);
    const info = dialog.querySelector(".mapPickInfo") as HTMLElement;
    expect(info.textContent).toContain("by Binh");
    expect(info.textContent).toContain(`${record.tiles.length} tiles`);
    expect(within(dialog).getByText(/This map has special conditions/)).toBeTruthy();
  });

  it("an invalid designed map cannot be applied", async () => {
    // A half-finished map: a FACE-UP slot with no tile chosen for it — exactly
    // what validateCustomMapPlan rejects ("pick a tile for the face-up slot").
    const broken = designedMap({ id: "broken", name: "Broken Isle", tiles: [{ row: 0, col: 0, group: "near", faceDown: false }] });
    const { dialog, onAction } = await open([broken]);
    fireEvent.click(within(dialog).getByText(/Broken Isle/).closest("button") as HTMLElement);

    expect(within(dialog).getByText(/Needs fixing in the designer/)).toBeTruthy();
    const use = within(dialog).getByRole("button", { name: /Play this map/ }) as HTMLButtonElement;
    expect(use.disabled).toBe(true);
    fireEvent.click(use);
    expect(onAction).not.toHaveBeenCalled();
  });
});

describe("Map window — applying a map", () => {
  it("a built-in sheet clears any designed map in the same action", async () => {
    const { dialog, onAction } = await open([], (state) => {
      // Start from a designed map so the switch has something to clear.
      state.setupLobby!.options.customMap = designedMap().tiles;
      state.setupLobby!.options.customMapName = "Twin Peaks";
      state.setupLobby!.options.customMode = true;
    });
    fireEvent.click(within(dialog).getByText("📜 Twin Kingdoms (2P Land)").closest("button") as HTMLElement);
    fireEvent.click(within(dialog).getByRole("button", { name: /Play this map/ }));

    expect(onAction).toHaveBeenCalledWith({
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: { scenarioId: "land-2p", customMode: false, customMap: null, customMapName: null }
    });
  });

  it("a designed map applies its tiles, seat count and preset", async () => {
    const record = designedMap();
    const { dialog, onAction } = await open([record]);
    fireEvent.click(within(dialog).getByText(/Twin Peaks/).closest("button") as HTMLElement);
    fireEvent.click(within(dialog).getByRole("button", { name: /Play this map/ }));

    expect(onAction).toHaveBeenCalledWith({
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: {
        playerCount: 2,
        customMode: true,
        customMap: record.tiles,
        customMapName: "Twin Peaks",
        customMapPreset: null
      }
    });
  });

  it("the map already in play is marked and cannot be re-applied", async () => {
    const { dialog, onAction } = await open();
    const applied = Array.from(rows(dialog)).find((row) => row.classList.contains("applied")) as HTMLElement;
    expect(applied.textContent).toContain("in play");
    fireEvent.click(applied);
    const use = within(dialog).getByRole("button", { name: /In play/ }) as HTMLButtonElement;
    expect(use.disabled).toBe(true);
    fireEvent.click(use);
    expect(onAction).not.toHaveBeenCalled();
  });
});

describe("Map window — the chess-piece difficulty bar", () => {
  it("shows the four pieces with the live pick pressed, and dispatches on click", async () => {
    const { dialog, onAction } = await open();
    const bar = within(dialog).getByRole("group", { name: "Neutral difficulty" });

    // Pawn / Knight / Rook / King art, in ladder order.
    expect(Array.from(bar.querySelectorAll("img")).map((img) => img.getAttribute("src"))).toEqual([
      DIFFICULTY_CHESS_ICONS.easy,
      DIFFICULTY_CHESS_ICONS.normal,
      DIFFICULTY_CHESS_ICONS.hard,
      DIFFICULTY_CHESS_ICONS.impossible
    ]);

    // aria-pressed follows the lobby's live difficulty (Impossible by default).
    expect(within(bar).getByRole("button", { name: /Impossible/ }).getAttribute("aria-pressed")).toBe("true");
    expect(within(bar).getByRole("button", { name: /^Easy/ }).getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(within(bar).getByRole("button", { name: /^Hard/ }));
    expect(onAction).toHaveBeenCalledWith({
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: { difficulty: "hard" }
    });
  });

  it("CONTROL: the pressed piece follows a different seeded difficulty", async () => {
    const { dialog } = await open([], (state) => {
      state.setupLobby!.options.difficulty = "easy";
    });
    const bar = within(dialog).getByRole("group", { name: "Neutral difficulty" });
    expect(within(bar).getByRole("button", { name: /^Easy/ }).getAttribute("aria-pressed")).toBe("true");
    expect(within(bar).getByRole("button", { name: /Impossible/ }).getAttribute("aria-pressed")).toBe("false");
  });

  it("says whether the SELECTED map brings a difficulty of its own", async () => {
    const authored = designedMap({
      id: "map-hard",
      name: "Hard Pass",
      preset: { difficulty: "hard" } as SharedMapRecord["preset"]
    });
    const { dialog } = await open([authored]);
    const note = () => dialog.querySelector(".mapPickDifficultyNote")?.textContent ?? "";

    // A map whose AUTHOR set a difficulty: the note names it and says the pick
    // applies it (the bar itself only moves once "Play this map" is pressed).
    const row = (name: RegExp) =>
      Array.from(rows(dialog)).find((node) => name.test(node.textContent ?? "")) as HTMLElement;

    fireEvent.click(row(/Hard Pass/));
    expect(note()).toContain("Hard Pass sets Hard");
    expect(note()).toMatch(/Play this map/);

    // CONTROL: a built-in sheet authors none, so the bar staying put is correct —
    // and the note says so instead of leaving the control looking dead.
    fireEvent.click(row(/Border Skirmish/));
    expect(note()).toContain("brings no difficulty of its own");
    expect(note()).not.toContain("sets Hard");
  });

  it("marks the SELECTED map's own difficulty on the bar, and the gold ring still follows the LIVE value", async () => {
    const authored = designedMap({
      id: "map-hard",
      name: "Hard Pass",
      preset: { difficulty: "hard" } as SharedMapRecord["preset"]
    });
    const { dialog } = await open([authored]); // lobby difficulty: impossible
    const bar = within(dialog).getByRole("group", { name: "Neutral difficulty" });
    const btn = (name: RegExp) => within(bar).getByRole("button", { name });

    fireEvent.click(
      Array.from(rows(dialog)).find((node) => /Hard Pass/.test(node.textContent ?? "")) as HTMLElement
    );

    // The map's Hard is TAGGED (so browsing the list visibly moves something)…
    expect(btn(/^Hard/).className).toContain("mapSet");
    expect(btn(/^Hard/).getAttribute("title")).toContain("this map sets it");
    // …while the picked-difficulty ring stays on the LIVE lobby value until
    // "Play this map" commits — and never doubles up on one button.
    expect(btn(/Impossible/).className).toContain("selected");
    expect(btn(/^Hard/).className).not.toContain("selected");
    expect(btn(/Impossible/).className).not.toContain("mapSet");

    // CONTROL: a map authoring nothing tags nothing.
    fireEvent.click(
      Array.from(rows(dialog)).find((node) => /Border Skirmish/.test(node.textContent ?? "")) as HTMLElement
    );
    expect(bar.querySelectorAll(".mapSet")).toHaveLength(0);
  });
});
