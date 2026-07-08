// @vitest-environment jsdom
import { cleanup, fireEvent, render, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/sound", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/sound")>();
  return { ...actual, playLibrarySound: vi.fn() };
});

import {
  CommanderCardFace,
  CommanderLevelUpOverlay,
  CommanderLevelUpPicker,
  CommanderStatsPanel
} from "./commander-card";

afterEach(cleanup);

// The engine behaviour is pinned in src/engine/wog-commander*.test.ts; these
// tests only prove the "pro" stats view renders the authentic comm3 symbols and
// spells out the grade bonuses (Defense token, Damage dice, Power ladder, the
// combination skills) — the surfaces the user asked to be correct and detailed.
describe("CommanderStatsPanel", () => {
  it("renders the authentic WoG comm3 stat symbols", () => {
    const { container } = render(<CommanderStatsPanel slug="paladin" grades={{}} />);
    for (const key of ["attack", "defense", "health", "damage", "magic", "speed"]) {
      expect(
        container.querySelector(`img[src*="/assets/commander-icons/stat-${key}.jpg"]`),
        `${key} stat symbol`
      ).toBeTruthy();
    }
  });

  it("spells out the Defense grade II '+1 def when attacked' token, gone at grade III", () => {
    const two = render(<CommanderStatsPanel slug="paladin" grades={{ defense: 2 }} />);
    expect(two.getByText(/\+1 def when attacked/i)).toBeTruthy();
    cleanup();
    const three = render(<CommanderStatsPanel slug="paladin" grades={{ defense: 3 }} />);
    expect(three.queryByText(/\+1 def when attacked/i)).toBeNull();
    expect(three.getByText(/reliable flat defense/i)).toBeTruthy();
  });

  it("describes the Damage grade as extra attack dice (not a flat bonus)", () => {
    const { getByText } = render(<CommanderStatsPanel slug="paladin" grades={{ damage: 2 }} />);
    expect(getByText(/extra attack dice/i)).toBeTruthy();
  });

  it("shows the Magic Power ladder with the current tier and spell ward", () => {
    // The spec ladders Power 0/0/1/2: grade 2 = Power 1, ward −1.
    const { getByText, getByTitle } = render(<CommanderStatsPanel slug="paladin" grades={{ magic: 2 }} />);
    expect(getByTitle("Power 1 (current)")).toBeTruthy();
    expect(getByText(/−1 Spell dmg/i)).toBeTruthy();
    expect(getByText(/immune to ongoing effects/i)).toBeTruthy();
    cleanup();
    // Grade 3 = Power 2, ward −3.
    const top = render(<CommanderStatsPanel slug="paladin" grades={{ magic: 3 }} />);
    expect(top.getByTitle("Power 2 (current)")).toBeTruthy();
    expect(top.getByText(/−3 Spell dmg/i)).toBeTruthy();
  });

  it("says a Magic grade-0 commander gets the cast only (no ward, not immune)", () => {
    const { getByText } = render(<CommanderStatsPanel slug="paladin" grades={{ magic: 0 }} />);
    expect(getByText(/cast only/i)).toBeTruthy();
    expect(getByText(/grade I gains both/i)).toBeTruthy();
  });

  it("shows the Conflux commander's new Elemental Scourge specialty", () => {
    const { getByText } = render(<CommanderStatsPanel slug="astral_spirit" grades={{}} />);
    expect(getByText(/Elemental Scourge/)).toBeTruthy();
    expect(getByText(/every enemy neutral unit takes 1 damage/i)).toBeTruthy();
  });

  it("explains an unlocked combination skill with its comm3 symbol and tag", () => {
    // Attack 3 + Magic 2 unlocks No Enemy Retaliation ([N]).
    const { getByText, container } = render(
      <CommanderStatsPanel slug="paladin" grades={{ attack: 3, magic: 2 }} />
    );
    const chip = getByText(/No Enemy Retaliation/).closest("div") as HTMLElement;
    expect(within(chip).getByText(/\[N\]/)).toBeTruthy();
    expect(container.querySelector('img[src*="/assets/commander-icons/combo-N.jpg"]')).toBeTruthy();
  });
});

// The rainbow frame spark (a purely decorative animated ring) is present on a
// living commander's card face and hidden once it has fallen.
describe("CommanderCardFace — rainbow frame spark", () => {
  it("shows the spark for a living commander, hidden when fallen", () => {
    const live = render(<CommanderCardFace slug="paladin" grades={{}} />);
    expect(live.queryByTestId("commander-rainbow-spark")).toBeTruthy();
    cleanup();
    const dead = render(<CommanderCardFace slug="paladin" grades={{}} dead />);
    expect(dead.queryByTestId("commander-rainbow-spark")).toBeNull();
  });
});

// The clearer level-up picker: one separated, highlighted option per stat.
describe("CommanderLevelUpPicker", () => {
  it("lists all six stats, each its own highlighted option showing the grade jump", () => {
    const picked: string[] = [];
    const { container } = render(
      <CommanderLevelUpPicker grades={{ attack: 1 }} gradePoints={2} onGradeUp={(s) => picked.push(s)} />
    );
    for (const key of ["attack", "defense", "health", "damage", "magic", "speed"]) {
      expect(container.querySelector(`button.commanderPickStat[data-stat="${key}"]`), key).toBeTruthy();
    }
    // The Attack option shows its grade jump (→ II) and the numeric value it buys.
    const attack = container.querySelector('button[data-stat="attack"]') as HTMLButtonElement;
    expect(attack.textContent).toContain("→ II");
    expect(attack.textContent).toContain("Attack 4"); // grade II Attack value
    // One click spends one point on that stat.
    fireEvent.click(attack);
    expect(picked).toEqual(["attack"]);
  });

  it("disables and marks a capped (grade III) stat", () => {
    const { container } = render(
      <CommanderLevelUpPicker grades={{ magic: 3 }} gradePoints={1} onGradeUp={() => undefined} />
    );
    const magic = container.querySelector('button[data-stat="magic"]') as HTMLButtonElement;
    expect(magic.disabled).toBe(true);
    expect(magic.getAttribute("data-capped")).toBe("true");
    expect(magic.textContent?.toLowerCase()).toContain("max");
  });
});

// The level-up popup: a celebratory modal carrying the picker.
describe("CommanderLevelUpOverlay", () => {
  it("pops the banner, the commander face and the stat picker", () => {
    const { getByText, container } = render(
      <CommanderLevelUpOverlay slug="paladin" grades={{}} level={3} gradePoints={2} onGradeUp={() => undefined} onClose={() => undefined} />
    );
    expect(getByText(/COMMANDER LEVEL UP/i)).toBeTruthy();
    expect(container.querySelector(".commanderLevelUpPicker")).toBeTruthy();
    // The face (with its rainbow spark) is shown inside the modal.
    expect(container.querySelector('[data-testid="commander-rainbow-spark"]')).toBeTruthy();
  });

  it("closes via the Done / Spend-later button", () => {
    let closed = false;
    const { getByRole } = render(
      <CommanderLevelUpOverlay slug="paladin" grades={{}} gradePoints={0} onGradeUp={() => undefined} onClose={() => { closed = true; }} />
    );
    fireEvent.click(getByRole("button", { name: /done/i }));
    expect(closed).toBe(true);
  });
});
