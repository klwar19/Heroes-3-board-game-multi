// @vitest-environment jsdom
/**
 * PvE monster-spell cue banners — DOM contract only.
 *
 * jsdom cannot compute CSS, so nothing here proves the banner is centered, gold
 * or above the board; the look is a real-browser concern with no e2e spec. What
 * IS pinned: it renders the spell name + the engine's explanation + the printed
 * rules line, it stacks several casts in log order, each removes itself on its
 * own timer, and it is PRESENTATION-ONLY — no button, no link, no click handler,
 * and `pointer-events: none` inline so it can never eat a click.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import {
  MONSTER_SPELL_CUE_MS,
  MONSTER_SPELL_CUE_STAGGER_MS,
  MonsterSpellCueOverlay
} from "./monster-spell-cue-overlay";
import type { MonsterSpellCue } from "./monster-spell-cue";

function cue(id: string, overrides: Partial<MonsterSpellCue> = {}): MonsterSpellCue {
  return {
    id,
    casterUnitId: "u_boss",
    casterName: "Bone Tyrant",
    targetUnitId: "u_pike",
    spellId: "shadow_bolt",
    spellName: "Shadow Bolt",
    headline: "Bone Tyrant casts Shadow Bolt",
    detail: "Bone Tyrant casts Shadow Bolt — 2 Spell damage to Pikemen.",
    rulesText: "2 Spell damage to your toughest living unit",
    soundKey: "spells/magic-arrow",
    ...overrides
  };
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("MonsterSpellCueOverlay", () => {
  it("renders nothing with no live cues", () => {
    const { container } = render(<MonsterSpellCueOverlay cues={[]} onDone={() => {}} />);
    expect(container.querySelector(".monsterSpellCueStack")).toBeNull();
  });

  it("names the spell, explains what just happened and what it always does", () => {
    render(<MonsterSpellCueOverlay cues={[cue("e1")]} onDone={() => {}} />);
    const banner = document.querySelector(".monsterSpellCue") as HTMLElement;
    expect(banner).toBeTruthy();
    expect(banner.dataset.monsterSpell).toBe("shadow_bolt");
    expect(screen.getByText("Bone Tyrant casts Shadow Bolt")).toBeTruthy();
    expect(screen.getByText(/2 Spell damage to Pikemen/)).toBeTruthy();
    expect(screen.getByText("2 Spell damage to your toughest living unit")).toBeTruthy();
    // Announced to assistive tech without stealing focus.
    expect(banner.getAttribute("role")).toBe("status");
    expect(banner.getAttribute("aria-live")).toBe("polite");
  });

  it("PRESENTATION ONLY: no control to press and it never takes a pointer", () => {
    const { container } = render(
      <MonsterSpellCueOverlay cues={[cue("e1"), cue("e2", { spellId: "mend_flesh" })]} onDone={() => {}} />
    );
    expect(container.querySelectorAll("button, a, input, [tabindex]")).toHaveLength(0);
    const stack = container.querySelector(".monsterSpellCueStack") as HTMLElement;
    expect(stack.style.pointerEvents).toBe("none");
    for (const banner of Array.from(container.querySelectorAll<HTMLElement>(".monsterSpellCue"))) {
      expect(banner.style.pointerEvents).toBe("none");
    }
  });

  it("stacks several casts of one round-start pass in log order", () => {
    const { container } = render(
      <MonsterSpellCueOverlay
        cues={[cue("e1"), cue("e2", { spellId: "withering_curse", headline: "Rime casts Withering Curse" })]}
        onDone={() => {}}
      />
    );
    const spells = Array.from(container.querySelectorAll<HTMLElement>(".monsterSpellCue")).map(
      (node) => node.dataset.monsterSpell
    );
    expect(spells).toEqual(["shadow_bolt", "withering_curse"]);
  });

  it("each banner dismisses itself, the later one held back so they read in turn", () => {
    vi.useFakeTimers();
    const done: string[] = [];
    render(
      <MonsterSpellCueOverlay
        cues={[cue("e1"), cue("e2")]}
        onDone={(id) => {
          done.push(id);
        }}
      />
    );
    expect(done).toEqual([]);
    act(() => {
      vi.advanceTimersByTime(MONSTER_SPELL_CUE_MS + 1);
    });
    expect(done).toEqual(["e1"]);
    act(() => {
      vi.advanceTimersByTime(MONSTER_SPELL_CUE_STAGGER_MS);
    });
    expect(done).toEqual(["e1", "e2"]);
  });
});
