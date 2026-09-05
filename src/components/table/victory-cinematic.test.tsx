// @vitest-environment jsdom
/**
 * Combat-outcome cinematics — DOM + music contract (jsdom cannot compute CSS,
 * so the look is a real-browser concern). Every "shows" claim has a CONTROL
 * that must NOT show, and the media it references must be PUBLISHED
 * (media-manifest.json), never merely present on this disk.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";

import type { GameState } from "@/engine";
import { hasMediaFile } from "@/lib/media-manifest";
import soundManifest from "../../../public/sounds/manifest.json";

vi.mock("@/lib/music", () => ({
  playCombatSting: vi.fn(),
  VICTORY_FANFARE_TRACK: "music/win-battle",
  DEFEAT_STING_TRACK: "music/lose-combat"
}));

import { playCombatSting } from "@/lib/music";
import {
  COMBAT_OUTCOME_STINGS,
  COMBAT_OUTCOME_VIDEOS,
  VictoryCinematic,
  __resetVictoryCinematicForTests,
  combatOutcomeCinematic,
  victoryCinematicApplies
} from "./victory-cinematic";

type Outcome = { winnerPlayerId: string; defeatedPlayerId: string; reason: string };

function stateWith(outcome: Outcome | undefined, kind: "neutral" | "player" | "sandbox" = "neutral", combatId = "combat-1"): GameState {
  return {
    players: { p1: { name: "Ann" }, p2: { name: "Bob" } },
    combat: combatId === "none" ? undefined : { id: combatId, context: { kind }, outcome }
  } as unknown as GameState;
}

const WON: Outcome = { winnerPlayerId: "p1", defeatedPlayerId: "neutrals", reason: "all-enemy-units-defeated" };
const LOST: Outcome = { winnerPlayerId: "neutrals", defeatedPlayerId: "p1", reason: "all-enemy-units-defeated" };
const PVP: Outcome = { winnerPlayerId: "p1", defeatedPlayerId: "p2", reason: "hero-defeated" };

beforeEach(() => {
  __resetVictoryCinematicForTests();
  vi.mocked(playCombatSting).mockClear();
});

afterEach(() => {
  cleanup();
});

describe("combatOutcomeCinematic — exactly the popup's Victory! / Defeat titles", () => {
  it("victory for the winner and defeat for the loser, over neutrals AND in PvP", () => {
    expect(combatOutcomeCinematic(stateWith(WON), "p1")).toBe("victory");
    expect(combatOutcomeCinematic(stateWith(LOST), "p1")).toBe("defeat");
    expect(combatOutcomeCinematic(stateWith(PVP, "player"), "p1")).toBe("victory");
    expect(combatOutcomeCinematic(stateWith(PVP, "player"), "p2")).toBe("defeat");
    expect(victoryCinematicApplies(stateWith(WON), "p1")).toBe(true);
    expect(victoryCinematicApplies(stateWith(LOST), "p1")).toBe(false);
  });

  it("CONTROL: a bystander, an undecided fight, no combat, the sandbox and every escape reason get NO clip", () => {
    expect(combatOutcomeCinematic(stateWith(PVP, "player"), "p3")).toBeNull();
    expect(combatOutcomeCinematic(stateWith(undefined), "p1")).toBeNull();
    expect(combatOutcomeCinematic(stateWith(undefined, "neutral", "none"), "p1")).toBeNull();
    expect(combatOutcomeCinematic(stateWith(WON, "sandbox"), "p1")).toBeNull();
    for (const reason of ["surrender", "surrender-secondary", "retreat"]) {
      expect(combatOutcomeCinematic(stateWith({ ...PVP, reason }, "player"), "p1"), `${reason} winner`).toBeNull();
      expect(combatOutcomeCinematic(stateWith({ ...PVP, reason }, "player"), "p2"), `${reason} loser`).toBeNull();
    }
  });
});

describe("<VictoryCinematic>", () => {
  it("VICTORY: renders the win clip through assetUrl and plays the fanfare ONCE, even across re-renders", () => {
    const view = render(<VictoryCinematic state={stateWith(WON)} viewerPlayerId="p1" />);
    const root = view.getByTestId("victory-cinematic");
    expect(root.getAttribute("data-combat-id")).toBe("combat-1");
    expect(root.getAttribute("data-outcome")).toBe("victory");
    const video = root.querySelector("video")!;
    // Same-origin in tests: the logical path (production maps it to the CDN object).
    expect(video.getAttribute("src")).toBe(COMBAT_OUTCOME_VIDEOS.victory);
    expect(video.muted).toBe(true);
    expect(video.autoplay).toBe(true);
    expect(playCombatSting).toHaveBeenCalledTimes(1);
    expect(playCombatSting).toHaveBeenLastCalledWith(COMBAT_OUTCOME_STINGS.victory);

    act(() => {
      view.rerender(<VictoryCinematic state={stateWith(WON)} viewerPlayerId="p1" />);
    });
    expect(playCombatSting).toHaveBeenCalledTimes(1);

    // A DIFFERENT combat plays again.
    act(() => {
      view.rerender(<VictoryCinematic state={stateWith(WON, "neutral", "combat-2")} viewerPlayerId="p1" />);
    });
    expect(playCombatSting).toHaveBeenCalledTimes(2);
  });

  it("DEFEAT: renders the lose clip and plays the LoseCombat sting for the losing viewer", () => {
    const view = render(<VictoryCinematic state={stateWith(PVP, "player")} viewerPlayerId="p2" />);
    const root = view.getByTestId("victory-cinematic");
    expect(root.getAttribute("data-outcome")).toBe("defeat");
    expect(root.querySelector("video")!.getAttribute("src")).toBe(COMBAT_OUTCOME_VIDEOS.defeat);
    expect(playCombatSting).toHaveBeenCalledTimes(1);
    expect(playCombatSting).toHaveBeenLastCalledWith(COMBAT_OUTCOME_STINGS.defeat);
  });

  it("CONTROL: renders nothing and plays nothing for a bystander or an escape", () => {
    const bystander = render(<VictoryCinematic state={stateWith(PVP, "player")} viewerPlayerId="p3" />);
    expect(bystander.container.innerHTML).toBe("");
    const surrendered = render(<VictoryCinematic state={stateWith({ ...PVP, reason: "surrender" }, "player")} viewerPlayerId="p2" />);
    expect(surrendered.container.innerHTML).toBe("");
    expect(playCombatSting).not.toHaveBeenCalled();
  });

  it("omits the video (keeps the sting) under prefers-reduced-motion", () => {
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true }));
    try {
      const view = render(<VictoryCinematic state={stateWith(WON)} viewerPlayerId="p1" />);
      expect(view.getByTestId("victory-cinematic").querySelector("video")).toBeNull();
      expect(playCombatSting).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("both clips and both stings are PUBLISHED (media-manifest.json), so the CDN really serves them", () => {
    const library = soundManifest as Record<string, { src?: string }>;
    for (const kind of ["victory", "defeat"] as const) {
      expect(hasMediaFile(COMBAT_OUTCOME_VIDEOS[kind]), `${kind} clip — run \`npm run media:publish\``).toBe(true);
      const sting = library[COMBAT_OUTCOME_STINGS[kind]];
      expect(sting?.src, `${kind} sting must be a sound-manifest entry`).toMatch(/^\/sounds\/music\//u);
      expect(hasMediaFile(sting!.src!), `${kind} sting — run \`npm run media:publish\``).toBe(true);
    }
  });
});
