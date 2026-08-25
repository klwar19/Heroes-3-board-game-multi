// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { createAdventureGameState, createAdventureLobbyState } from "@/engine";
import { animeFactionPenalty } from "@/data/anime/faction-penalties";
import { AnimeFactionMechanicsOverlay, animeMechanicsIntroKey } from "./anime-faction-mechanics-overlay";

describe("AnimeFactionMechanicsOverlay", () => {
  beforeEach(() => window.localStorage.clear());

  it("briefs ONLY the viewer's own town: its signature mechanic AND its own penalty", () => {
    const state = createAdventureGameState({
      seed: "anime-penalty-ui",
      rollFirstPlayer: false,
      players: [
        { id: "p1", name: "Riki", factionId: "little_busters", heroDefId: "riki_naoe" },
        { id: "p2", name: "Catherine", factionId: "castle", heroDefId: "catherine" }
      ]
    });
    render(<AnimeFactionMechanicsOverlay state={state} viewerPlayerId="p1" />);
    const dialog = screen.getByRole("dialog", { name: /how your town plays/i });
    const text = dialog.textContent ?? "";
    // Signature mechanic (positive) is explained…
    expect(text).toContain("Campus Hero");
    expect(text).toMatch(/fights on the battlefield as a unit/i);
    // …and this town's OWN penalty (not a grouped roster).
    expect(text).toContain("−5 gold and −1 material each Resource round");
    expect(text).toContain("School Contribution Fund");
    // It is per-town: no OTHER anime town's penalty appears.
    expect(text).not.toContain("Fleet Maintenance");
    expect(text).not.toContain("Chakra Strain");
    expect(text).not.toContain("Grail War Upkeep");
    // Never the old grouped title.
    expect(text).not.toMatch(/Otherworld/);
    expect(animeMechanicsIntroKey(state, "p1")).toContain("start:");
  });

  it("tags a wuxia sect with the cultivation register and its own mechanic", () => {
    const state = createAdventureGameState({
      seed: "anime-penalty-wuxia",
      anime: { enabled: true, xianxiaTowns: true },
      rollFirstPlayer: false,
      players: [
        { id: "p1", name: "Sect", factionId: "heavenly_demon", heroDefId: undefined },
        { id: "p2", name: "Catherine", factionId: "castle", heroDefId: "catherine" }
      ]
    });
    render(<AnimeFactionMechanicsOverlay state={state} viewerPlayerId="p1" />);
    const dialog = screen.getByRole("dialog", { name: /how your town plays/i });
    expect(dialog.querySelector<HTMLElement>(".animeTownBriefing")?.getAttribute("data-register")).toBe("wuxia");
    expect(dialog.textContent).toContain("CULTIVATION SECT");
    expect(dialog.textContent).toContain("Demonic Arts");
    expect(dialog.textContent).toContain("Demonic Cult Tribute");
  });

  it("turns a matching engine note into the faction-art penalty notice", () => {
    const state = createAdventureGameState({
      seed: "anime-penalty-event-ui",
      rollFirstPlayer: false,
      players: [
        { id: "p1", name: "Riki", factionId: "little_busters", heroDefId: "riki_naoe" },
        { id: "p2", name: "Catherine", factionId: "castle", heroDefId: "catherine" }
      ]
    });
    state.eventLog.push({ id: "event_penalty", type: "EVENT_NOTE", playerId: "p1", message: "School Contribution Fund — 5 gold and 1 building material paid." });
    render(<AnimeFactionMechanicsOverlay state={state} viewerPlayerId="p1" />);
    const dialog = screen.getByRole("dialog", { name: /School Contribution Fund/i });
    expect(dialog.textContent).toContain("5 gold and 1 building material");
    expect(dialog.querySelector<HTMLElement>(".animePenaltyNotice")?.style.backgroundImage).toContain(
      animeFactionPenalty("little_busters")!.artImage.replace(/^.*\//, "")
    );
  });

  it("matches a town's NEW per-town penalty title (Grail War Upkeep), not the old grouped one", () => {
    const state = createAdventureGameState({
      seed: "anime-penalty-fuyuki",
      rollFirstPlayer: false,
      players: [
        { id: "p1", name: "Rin", factionId: "fuyuki", heroDefId: undefined },
        { id: "p2", name: "Catherine", factionId: "castle", heroDefId: "catherine" }
      ]
    });
    // Pretend the intro was already dismissed so only the penalty notice can show.
    window.localStorage.setItem("binh-anime-faction-mechanics", JSON.stringify([animeMechanicsIntroKey(state, "p1")]));
    state.eventLog.push({ id: "event_gold", type: "EVENT_NOTE", playerId: "p1", message: "Grail War Upkeep — 4 gold lost." });
    render(<AnimeFactionMechanicsOverlay state={state} viewerPlayerId="p1" />);
    expect(screen.getByRole("dialog", { name: /Grail War Upkeep/i }).textContent).toContain("4 gold lost");
  });

  it("opens the per-town briefing when an anime faction is selected in setup", () => {
    const state = createAdventureLobbyState({ seed: "anime-penalty-pick-ui", rollFirstPlayer: false });
    const seat = state.setupLobby!.seats.find((candidate) => candidate.playerId === "p1")!;
    seat.factionId = "hidden_leaf";
    seat.heroDefId = "naruto";
    render(<AnimeFactionMechanicsOverlay state={state} viewerPlayerId="p1" />);
    const dialog = screen.getByRole("dialog", { name: /how your town plays/i });
    expect(dialog.textContent).toContain("Shinobi Missions");
    expect(dialog.textContent).toContain("−1 hand limit each Resource round");
    expect(dialog.textContent).toContain("Chakra Strain");
    expect(animeMechanicsIntroKey(state, "p1")).toContain("pick:");
  });

  it("shows nothing for an ordinary (non-anime) town", () => {
    const state = createAdventureGameState({
      seed: "anime-penalty-control",
      rollFirstPlayer: false,
      players: [
        { id: "p1", name: "Catherine", factionId: "castle", heroDefId: "catherine" },
        { id: "p2", name: "Other", factionId: "rampart", heroDefId: undefined }
      ]
    });
    render(<AnimeFactionMechanicsOverlay state={state} viewerPlayerId="p1" />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
