// @vitest-environment jsdom
/**
 * PvE ENEMY FORCE cue banner — DOM contract only.
 *
 * jsdom cannot compute CSS, so nothing here proves the banner is centered, on
 * top of anything, or visible at all; it reuses the committed
 * `.enemyForceCue*` classes and the documented z-index 93 slot, and the visible
 * half is a real-browser concern with no e2e spec. What IS pinned: WHEN a cue is
 * built, that it names the card and repeats the engine's own outcome line, that
 * it renders the CARD FACE, that it takes NO input (so it can never block a
 * player or stall an AI/AFK seat), and that it removes itself on its timer.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { createInitialGameState } from "@/engine";
import type { GameEvent, GameState } from "@/engine/state";
import { buildEnemyForceCue, buildEnemyForceCues, isEnemyForcePlayEvent } from "./enemy-force-cue";
import {
  ENEMY_FORCE_CUE_MS,
  EnemyForceCueOverlay
} from "./enemy-force-cue-overlay";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function playEvent(overrides: Partial<GameEvent & { type: "ENEMY_FORCE_CARD_PLAYED" }> = {}) {
  return {
    id: "evt_1",
    type: "ENEMY_FORCE_CARD_PLAYED" as const,
    unitId: "u_boss",
    cardId: "spell.lightning_bolt",
    targetUnitId: "u_victim",
    message: "Goblin King plays Lightning Bolt — 3 Spell damage to Crusaders.",
    ...overrides
  } as GameEvent;
}

function stateWithBoss(): GameState {
  const state = createInitialGameState("cue");
  const anyUnit = Object.values(state.combat!.units)[0];
  state.combat!.units.u_boss = { ...anyUnit, id: "u_boss", cardName: "Goblin King" };
  return state;
}

describe("enemy-force cue — recognition", () => {
  it("recognises a play event, and only a play event", () => {
    expect(isEnemyForcePlayEvent(playEvent())).toBe(true);
    expect(isEnemyForcePlayEvent({ type: "UNIT_ABILITY_TRIGGERED" })).toBe(false);
    expect(isEnemyForcePlayEvent({ type: "DAMAGE_ASSIGNED" })).toBe(false);
  });

  it("a play naming a card OUTSIDE the curated pool is not a cue (derived, not a hand list)", () => {
    expect(isEnemyForcePlayEvent(playEvent({ cardId: "spell.town_portal" }))).toBe(false);
    expect(buildEnemyForceCue(playEvent({ cardId: "spell.town_portal" }), stateWithBoss())).toBeNull();
  });
});

describe("enemy-force cue — the model", () => {
  it("names the boss and the CARD, carries the card face, and repeats the engine's own outcome line", () => {
    const cue = buildEnemyForceCue(playEvent(), stateWithBoss())!;
    expect(cue).not.toBeNull();
    expect(cue.headline).toBe("Goblin King plays Lightning Bolt");
    expect(cue.cardName).toBe("Lightning Bolt");
    // The player must be able to SEE the card that was played.
    expect(cue.cardImage).toContain("lightning_bolt");
    // The detail is the engine's message verbatim — numbers included, so the
    // words on screen can never disagree with what the engine did.
    expect(cue.detail).toContain("3 Spell damage");
    expect(cue.targetUnitId).toBe("u_victim");
    // A reused H3 spell sound, so the play is audible.
    expect(cue.soundKey).toBeTruthy();
  });

  it("falls back to a generic caster name when the unit is gone from the snapshot", () => {
    const cue = buildEnemyForceCue(playEvent({ unitId: "u_missing" }), stateWithBoss())!;
    expect(cue.headline).toContain("The enemy force");
  });

  it("builds one cue per play, in log order, skipping non-plays", () => {
    const cues = buildEnemyForceCues(
      [
        playEvent({ id: "a", cardId: "spell.lightning_bolt" }),
        { id: "b", type: "DAMAGE_ASSIGNED" } as unknown as GameEvent,
        playEvent({ id: "c", cardId: "spell.slow" })
      ],
      stateWithBoss()
    );
    expect(cues.map((cue) => cue.id)).toEqual(["a", "c"]);
  });
});

describe("enemy-force cue — the overlay", () => {
  const cue = {
    id: "evt_1",
    casterUnitId: "u_boss",
    casterName: "Goblin King",
    cardId: "spell.lightning_bolt",
    cardName: "Lightning Bolt",
    cardImage: "/assets/spells-lightning_bolt.webp",
    headline: "Goblin King plays Lightning Bolt",
    detail: "Goblin King plays Lightning Bolt — 3 Spell damage to Crusaders.",
    rulesText: "Printed rules line."
  };

  it("renders nothing when there are no cues", () => {
    const { container } = render(<EnemyForceCueOverlay cues={[]} onDone={() => {}} />);
    expect(container.querySelector(".enemyForceCueStack")).toBeNull();
  });

  it("renders the banner with the card face and takes NO input (it can never block a click)", () => {
    const { container } = render(<EnemyForceCueOverlay cues={[cue]} onDone={() => {}} />);
    const stack = container.querySelector(".enemyForceCueStack") as HTMLElement;
    const banner = container.querySelector(".enemyForceCue") as HTMLElement;
    expect(stack).not.toBeNull();
    expect(banner).not.toBeNull();
    // The half jsdom CAN pin: the inline pointer-events, on both levels.
    expect(stack.style.pointerEvents).toBe("none");
    expect(banner.style.pointerEvents).toBe("none");
    // No focusable / clickable child at all — nothing to dispatch.
    expect(container.querySelectorAll("button, a, input, [tabindex]")).toHaveLength(0);
    expect(banner.getAttribute("data-enemy-force-card")).toBe("spell.lightning_bolt");
    expect(container.querySelector(".enemyForceCueCard")).not.toBeNull();
    expect(container.textContent).toContain("Goblin King plays Lightning Bolt");
    expect(container.textContent).toContain("3 Spell damage");
  });

  it("a cue with no card face still renders its words", () => {
    const { container } = render(
      <EnemyForceCueOverlay cues={[{ ...cue, cardImage: undefined }]} onDone={() => {}} />
    );
    expect(container.querySelector(".enemyForceCueCard")).toBeNull();
    expect(container.textContent).toContain("Lightning Bolt");
  });

  it("removes itself on its own timer (no click required)", () => {
    vi.useFakeTimers();
    const done: string[] = [];
    render(<EnemyForceCueOverlay cues={[cue]} onDone={(id) => done.push(id)} />);
    expect(done).toEqual([]);
    act(() => {
      vi.advanceTimersByTime(ENEMY_FORCE_CUE_MS + 50);
    });
    expect(done).toEqual(["evt_1"]);
  });

  it("several plays stack and are staggered, each reporting itself once", () => {
    vi.useFakeTimers();
    const done: string[] = [];
    const second = { ...cue, id: "evt_2", cardId: "spell.slow" };
    const { container } = render(
      <EnemyForceCueOverlay cues={[cue, second]} onDone={(id) => done.push(id)} />
    );
    expect(container.querySelectorAll(".enemyForceCue")).toHaveLength(2);
    act(() => {
      vi.advanceTimersByTime(ENEMY_FORCE_CUE_MS + 50);
    });
    // The first is due; the staggered second is not yet.
    expect(done).toEqual(["evt_1"]);
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(done).toEqual(["evt_1", "evt_2"]);
  });
});
