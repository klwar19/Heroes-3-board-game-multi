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

function authoredSoloMap(): SharedMapRecord {
  const record = designedMap({ id: "solo-map", name: "Solo Ambush", players: 4 });
  const starts = record.tiles.filter((tile) => tile.group === "starting");
  starts[0].singlePlayer = {
    role: "computer",
    bonus: { gold: 3, buildingMaterials: 0, valuables: 0 }
  };
  starts[1].singlePlayer = { role: "computer" };
  starts[2].singlePlayer = { role: "human" };
  return record;
}

function makeSinglePlayer(state: GameState): void {
  state.sessionMode = "single-player";
  state.controllers = {
    p1: { kind: "human" },
    p2: { kind: "computer", difficulty: "standard", policyVersion: 1 }
  };
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
  it("a built-in sheet clears any designed map in the same action, and never touches the game MODE", async () => {
    const { dialog, onAction } = await open([], (state) => {
      // Start from a designed map so the switch has something to clear — and
      // from a deliberately chosen Custom mode, which the pick must preserve.
      state.setupLobby!.options.customMap = designedMap().tiles;
      state.setupLobby!.options.customMapName = "Twin Peaks";
      state.setupLobby!.options.customMode = true;
    });
    fireEvent.click(within(dialog).getByText("📜 Twin Kingdoms (2P Land)").closest("button") as HTMLElement);
    fireEvent.click(within(dialog).getByRole("button", { name: /Play this map/ }));

    expect(onAction).toHaveBeenCalledWith({
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: { scenarioId: "land-2p", customMap: null, customMapName: null }
    });
    // The mode key is the Game-mode box's alone — a map pick that sent
    // `customMode: false` here silently dropped the table out of Custom mode.
    expect(Object.keys(onAction.mock.calls[0][0].options)).not.toContain("customMode");
  });

  it("a designed map applies its tiles, seat count and preset — and never touches the game MODE", async () => {
    const record = designedMap();
    const { dialog, onAction } = await open([record]);
    fireEvent.click(within(dialog).getByText(/Twin Peaks/).closest("button") as HTMLElement);
    fireEvent.click(within(dialog).getByRole("button", { name: /Play this map/ }));

    expect(onAction).toHaveBeenCalledWith({
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: {
        playerCount: 2,
        customMap: record.tiles,
        customMapName: "Twin Peaks",
        customMapPreset: null
      }
    });
    // Sending `customMode: true` here threw a BINH/Legacy/Tournament table into
    // "Custom — your saved setup" on every designed-map pick.
    expect(Object.keys(onAction.mock.calls[0][0].options)).not.toContain("customMode");
  });

  it("single-player derives enemy count from authored Town roles while multiplayer still uses record.players", async () => {
    const record = authoredSoloMap();
    const { dialog, onAction } = await open([record], makeSinglePlayer);
    fireEvent.click(within(dialog).getByText(/Solo Ambush/).closest("button") as HTMLElement);

    expect(dialog.querySelector(".mapPickSoloSetup")?.textContent).toContain("2 computer opponents");
    expect(dialog.querySelector(".mapPickSoloSetup")?.textContent).toContain("you start at S3");
    fireEvent.click(within(dialog).getByRole("button", { name: /Play this map/ }));

    expect(onAction).toHaveBeenCalledWith({
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: {
        playerCount: 3,
        customMap: record.tiles,
        customMapName: "Solo Ambush",
        customMapPreset: null
      }
    });
  });

  // ---------------------------------------------------------------------
  // CO-OP step 5 — the supported-mode badge + the co-op capacity line
  // ---------------------------------------------------------------------

  it("CONTROL — a legacy designed map with no co-op fields reads as BOTH modes and shows no capacity", async () => {
    const { dialog } = await open([designedMap()]);
    fireEvent.click(within(dialog).getByText(/Twin Peaks/).closest("button") as HTMLElement);
    const badge = dialog.querySelector(".mapPickModeSupport")?.textContent ?? "";
    expect(badge).toContain("Modes: Clash + Co-op");
    expect(badge, "no roles authored ⇒ no capacity clause").not.toContain("Co-op:");
  });

  it("a CLASH-ONLY and a CO-OP-ONLY designed map each say so", async () => {
    const clashOnly = designedMap({
      id: "clash-only",
      name: "Border Duel",
      preset: { supportedModes: { coop: false } }
    });
    const coopOnly = designedMap({
      id: "coop-only",
      name: "Last Stand",
      preset: { supportedModes: { clash: false } }
    });
    const { dialog } = await open([clashOnly, coopOnly]);

    fireEvent.click(within(dialog).getByText(/Border Duel/).closest("button") as HTMLElement);
    expect(dialog.querySelector(".mapPickModeSupport")?.textContent).toContain("Modes: Clash only");

    fireEvent.click(within(dialog).getByText(/Last Stand/).closest("button") as HTMLElement);
    expect(dialog.querySelector(".mapPickModeSupport")?.textContent).toContain("Modes: Co-op only");
  });

  it("a map with authored co-op roles appends its starting-position capacity", async () => {
    const record = designedMap({ id: "coop-roles", name: "Invasion Route", players: 4 });
    const starts = record.tiles.filter((tile) => tile.group === "starting");
    starts[0].coopSeat = { role: "human" };
    starts[1].coopSeat = { role: "computer" };
    starts[2].coopSeat = { role: "computer" };
    // starts[3..] stay flexible.
    const { dialog } = await open([record]);
    fireEvent.click(within(dialog).getByText(/Invasion Route/).closest("button") as HTMLElement);
    const badge = dialog.querySelector(".mapPickModeSupport")?.textContent ?? "";
    expect(badge).toContain("Modes: Clash + Co-op");
    expect(badge).toContain("Co-op: 1 human / 2 computer / 3 flexible starting positions");
  });

  it("a BUILT-IN scenario sheet is playable in both modes", async () => {
    const { dialog } = await open();
    fireEvent.click(within(dialog).getByText("📜 Twin Kingdoms (2P Land)").closest("button") as HTMLElement);
    expect(dialog.querySelector(".mapPickModeSupport")?.textContent).toContain("Modes: Clash + Co-op");
  });

  it("single-player built-in maps reset to their minimum solo deployment without changing multiplayer payloads", async () => {
    const { dialog, onAction } = await open([], makeSinglePlayer);
    fireEvent.click(within(dialog).getByText("📜 Twin Kingdoms (2P Land)").closest("button") as HTMLElement);
    fireEvent.click(within(dialog).getByRole("button", { name: /Play this map/ }));

    expect(onAction).toHaveBeenCalledWith({
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: { scenarioId: "land-2p", playerCount: 2, customMap: null, customMapName: null }
    });
  });

  it("an EMPTY designed map cannot be applied — the engine would keep the scenario layout", async () => {
    // createAdventureGameState reads `setupOptions.customMap?.length`, so a
    // 0-tile plan builds the scenario sheet. Offering it as playable made the
    // Map box name the scenario while the list claimed the designed map.
    const empty = designedMap({ id: "empty", name: "Blank Slate", tiles: [] });
    const { dialog, onAction } = await open([empty]);
    fireEvent.click(within(dialog).getByText(/Blank Slate/).closest("button") as HTMLElement);

    expect(within(dialog).getByText(/has no tiles/)).toBeTruthy();
    const use = within(dialog).getByRole("button", { name: /Play this map/ }) as HTMLButtonElement;
    expect(use.disabled).toBe(true);
    fireEvent.click(use);
    expect(onAction).not.toHaveBeenCalled();
  });

  it("warns that a map with a different seat count closes seats — and their picks", async () => {
    // The lobby seats 2; this designed map was built for 4, so applying it
    // OPENS seats. Nothing about that lived in the Heroes & Draft box.
    const four = designedMap({ id: "four", name: "Quad Vale", players: 4, scenarioId: "skirmish" });
    const { dialog } = await open([four]);
    fireEvent.click(within(dialog).getByText(/Quad Vale/).closest("button") as HTMLElement);
    const note = dialog.querySelector(".mapPickSeatChange")?.textContent ?? "";
    expect(note).toContain("opens 4 seats");
    expect(note).toContain("the table has 2 now");
    // Nothing is LOST here, so no scare about picks.
    expect(note).not.toMatch(/picks go with them/);
  });

  it("names the picks a shrinking map would take with it", async () => {
    const two = designedMap({ id: "two", name: "Duel Vale", players: 2, scenarioId: "skirmish" });
    const { dialog } = await open([two], (state) => {
      const lobby = state.setupLobby!;
      // A 3-seat table where the third seat has already picked.
      lobby.seats.push({ playerId: "p3", name: "Player 3", factionId: "rampart", heroDefId: "gelu" });
    });
    fireEvent.click(within(dialog).getByText(/Duel Vale/).closest("button") as HTMLElement);
    const note = dialog.querySelector(".mapPickSeatChange")?.textContent ?? "";
    expect(note).toContain("opens 2 seats (the table has 3 now)");
    expect(note).toContain("1 seat closes, and their town & hero picks go with them");
  });

  it("CONTROL: a map that seats exactly what the table already has warns about nothing", async () => {
    const { dialog } = await open([designedMap()]);
    fireEvent.click(within(dialog).getByText(/Twin Peaks/).closest("button") as HTMLElement);
    expect(dialog.querySelector(".mapPickSeatChange")).toBeNull();
  });

  it("CONTROL: an empty designed map in the options is NOT marked in play", async () => {
    const empty = designedMap({ id: "empty", name: "Blank Slate", tiles: [] });
    const { dialog } = await open([empty], (state) => {
      state.setupLobby!.options.customMap = [];
      state.setupLobby!.options.customMapName = "Blank Slate";
    });
    // The built-in sheet the game will actually build is the one "in play".
    const applied = Array.from(rows(dialog)).filter((row) => row.classList.contains("applied"));
    expect(applied).toHaveLength(1);
    expect(applied[0].textContent).toContain("Border Skirmish");
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
