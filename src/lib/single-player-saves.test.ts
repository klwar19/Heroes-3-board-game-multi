// @vitest-environment jsdom
/**
 * Single-player save slots — the browser half. Pins: distinct names are
 * DISTINCT save points (several of the same room), same name overwrites its
 * slot, the stored state round-trips exactly, the slot cap refuses instead of
 * silently dropping, deletion removes the state blob, saves are stamped with
 * the engine signature but an old-signature save STAYS loadable (patch
 * tolerance — the confirm dialog warns instead), and the menu-page pending
 * marker is consumed once by the right room only.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { ENGINE_SIGNATURE, type GameState } from "@/engine";
import {
  MAX_SINGLE_PLAYER_SAVES,
  deleteSavedSinglePlayerGame,
  loadSavedSinglePlayerGames,
  loadSavedSinglePlayerGameState,
  saveMatchesEngine,
  saveSinglePlayerGame,
  setPendingSinglePlayerLoad,
  takePendingSinglePlayerLoad
} from "./single-player-saves";

function fakeState(round: number, marker: string): GameState {
  return { round, players: { p1: { name: marker } }, phase: "adventure" } as unknown as GameState;
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("single-player save slots (browser storage)", () => {
  it("distinct names are distinct save points of the SAME room; the state round-trips exactly", () => {
    const first = saveSinglePlayerGame("Before the bank fight", "sp-room-1", fakeState(3, "early"));
    const second = saveSinglePlayerGame("After the bank fight", "sp-room-1", fakeState(4, "late"));
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;

    const saves = loadSavedSinglePlayerGames();
    expect(saves).toHaveLength(2);
    expect(new Set(saves.map((save) => save.id)).size).toBe(2);
    expect(loadSavedSinglePlayerGameState(first.save.id)).toEqual(fakeState(3, "early"));
    expect(loadSavedSinglePlayerGameState(second.save.id)).toEqual(fakeState(4, "late"));
  });

  it("reusing a name overwrites that slot (same id, count unchanged)", () => {
    const first = saveSinglePlayerGame("Checkpoint", "sp-room-1", fakeState(2, "v1"));
    const second = saveSinglePlayerGame("Checkpoint", "sp-room-1", fakeState(6, "v2"));
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.save.id).toBe(first.save.id);
    expect(loadSavedSinglePlayerGames()).toHaveLength(1);
    expect(loadSavedSinglePlayerGameState(first.save.id)).toEqual(fakeState(6, "v2"));
  });

  it("refuses past the slot cap with a reason (never a silent drop); overwrite still allowed (CONTROL)", () => {
    for (let index = 0; index < MAX_SINGLE_PLAYER_SAVES; index += 1) {
      expect(saveSinglePlayerGame(`Slot ${index}`, "sp-room-1", fakeState(index, `s${index}`)).ok).toBe(true);
    }
    const overflow = saveSinglePlayerGame("One too many", "sp-room-1", fakeState(99, "over"));
    expect(overflow.ok).toBe(false);
    expect(loadSavedSinglePlayerGames()).toHaveLength(MAX_SINGLE_PLAYER_SAVES);
    // CONTROL: overwriting an existing name is not a NEW slot and still works.
    expect(saveSinglePlayerGame("Slot 0", "sp-room-1", fakeState(50, "rewrite")).ok).toBe(true);
  });

  it("delete removes the meta AND the state blob", () => {
    const saved = saveSinglePlayerGame("Doomed", "sp-room-1", fakeState(1, "gone"));
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    deleteSavedSinglePlayerGame(saved.save.id);
    expect(loadSavedSinglePlayerGames()).toHaveLength(0);
    expect(loadSavedSinglePlayerGameState(saved.save.id)).toBeNull();
  });

  it("stamps the engine signature; an old-signature save is flagged but STAYS listed and loadable", () => {
    const saved = saveSinglePlayerGame("Fresh", "sp-room-1", fakeState(1, "fresh"));
    expect(saved.ok && saveMatchesEngine(saved.ok ? saved.save : (null as never))).toBe(true);

    // Simulate a save written by a previous deploy: rewrite its index stamp.
    const indexKey = Object.keys(window.localStorage).find((key) => key.startsWith("homm3bg.sp-save-index:"))!;
    const entries = JSON.parse(window.localStorage.getItem(indexKey)!) as { signature: string; id: string }[];
    entries[0].signature = "older-build";
    window.localStorage.setItem(indexKey, JSON.stringify(entries));

    const [old] = loadSavedSinglePlayerGames();
    expect(old.signature).toBe("older-build");
    expect(saveMatchesEngine(old)).toBe(false);
    expect(ENGINE_SIGNATURE).not.toBe("older-build");
    // Patch tolerance: the state itself still loads.
    expect(loadSavedSinglePlayerGameState(old.id)).toEqual(fakeState(1, "fresh"));
  });
});

describe("pending menu-page load marker", () => {
  it("is consumed once by the matching room and left alone by others", () => {
    const saved = saveSinglePlayerGame("Menu load", "sp-room-A", fakeState(4, "menu"));
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    setPendingSinglePlayerLoad(saved.save.id, "sp-room-A");

    // A different room never consumes it.
    expect(takePendingSinglePlayerLoad("sp-room-B")).toBeNull();
    // The right room takes it exactly once.
    const taken = takePendingSinglePlayerLoad("sp-room-A");
    expect(taken?.save.id).toBe(saved.save.id);
    expect(taken?.state).toEqual(fakeState(4, "menu"));
    expect(takePendingSinglePlayerLoad("sp-room-A")).toBeNull();
  });

  it("drops a stale marker (an abandoned navigation cannot overwrite a later session)", () => {
    const saved = saveSinglePlayerGame("Stale", "sp-room-A", fakeState(2, "stale"));
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    window.localStorage.setItem(
      "homm3bg.sp-pending-load",
      JSON.stringify({ id: saved.save.id, roomId: "sp-room-A", at: Date.now() - 10 * 60 * 1000 })
    );
    expect(takePendingSinglePlayerLoad("sp-room-A")).toBeNull();
  });
});
