// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyAction, createCombatSandboxLobbyState } from "@/engine";
import { CombatSandboxSetupScreen } from "./combat-sandbox-setup";

afterEach(cleanup);

describe("CombatSandboxSetupScreen", () => {
  it("renders both seats and dispatches Begin deployment", () => {
    const state = createCombatSandboxLobbyState("ui-sandbox");
    const onAction = vi.fn();
    render(<CombatSandboxSetupScreen onAction={onAction} state={state} viewerPlayerId="p1" />);

    expect(screen.getByLabelText(/battle test setup/i)).toBeTruthy();
    expect(screen.getByLabelText(/p1 setup/i)).toBeTruthy();
    expect(screen.getByLabelText(/p2 setup/i)).toBeTruthy();

    // Battlefield picker is present.
    expect(screen.getByLabelText(/battlefield/i)).toBeTruthy();

    fireEvent.click(screen.getAllByRole("button", { name: /begin deployment/i })[0]);
    expect(onAction).toHaveBeenCalledWith({ type: "SANDBOX_BEGIN_COMBAT", playerId: "p1" });
  });

  it("offers BINH and Tournament rules mode before Begin", () => {
    const state = createCombatSandboxLobbyState("ui-mode");
    const onAction = vi.fn();
    render(<CombatSandboxSetupScreen onAction={onAction} state={state} viewerPlayerId="p1" />);
    const modeSelect = screen.getByLabelText(/rules mode/i) as HTMLSelectElement;
    expect(modeSelect.value).toBe("binh");
    fireEvent.change(modeSelect, { target: { value: "tournament" } });
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "SANDBOX_SET_OPTIONS",
        options: expect.objectContaining({ playMode: "tournament" })
      })
    );
  });

  it("dispatches SANDBOX_SET_OPTIONS when WOG Commanders is toggled", () => {
    const state = createCombatSandboxLobbyState("ui-wog");
    const onAction = vi.fn();
    render(<CombatSandboxSetupScreen onAction={onAction} state={state} viewerPlayerId="p1" />);

    fireEvent.click(screen.getByLabelText(/^WOG mod$/i));
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "SANDBOX_SET_OPTIONS",
        options: expect.objectContaining({ wog: expect.objectContaining({ enabled: true }) })
      })
    );
  });

  it("dispatches a faction change for the attacker seat", () => {
    const state = createCombatSandboxLobbyState("ui-faction");
    const onAction = vi.fn();
    render(<CombatSandboxSetupScreen onAction={onAction} state={state} viewerPlayerId="p1" />);

    const factionSelect = document.getElementById("p1-faction") as HTMLSelectElement;
    fireEvent.change(factionSelect, { target: { value: "inferno" } });
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "SANDBOX_CONFIGURE_SEAT",
        seatId: "p1",
        factionId: "inferno"
      })
    );
  });

  it("engine begin after UI-shaped options opens combat-setup deployment", () => {
    let state = createCombatSandboxLobbyState("ui-roundtrip");
    // Mimic the actions the screen fires.
    state = applyAction(state, {
      type: "SANDBOX_SET_OPTIONS",
      playerId: "p1",
      options: { boardArtId: "hell-necro", moraleCards: true, wog: { enabled: true, commanders: true } }
    }).state;
    state = applyAction(state, {
      type: "SANDBOX_CONFIGURE_SEAT",
      playerId: "p1",
      seatId: "p1",
      factionId: "rampart",
      heroDefId: "gelu"
    }).state;
    const begun = applyAction(state, { type: "SANDBOX_BEGIN_COMBAT", playerId: "p1" });
    expect(begun.errors).toEqual([]);
    expect(begun.state.phase).toBe("combat-setup");
    expect(begun.state.combat?.boardArtId).toBe("hell-necro");
    expect(begun.state.combat?.setup?.pendingPlayerIds).toEqual(["p1", "p2"]);
    expect(begun.state.players.p1.heroDefId).toBe("gelu");
    expect(Object.keys(begun.state.combat!.units)).toEqual([]);
  });
});
