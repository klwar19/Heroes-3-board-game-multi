// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CommanderStatsPanel } from "./commander-card";

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
    const { getByText, getByTitle } = render(<CommanderStatsPanel slug="paladin" grades={{ magic: 2 }} />);
    // The Power ladder marks the current tier; the ward text reflects grade 2.
    expect(getByTitle("Power 2 (current)")).toBeTruthy();
    expect(getByText(/−2 Spell dmg/i)).toBeTruthy();
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
