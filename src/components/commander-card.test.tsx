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

  it("shows the WOG Commander-Artifact slots — bound chip + empty placeholders", () => {
    const { getByText, container } = render(
      <CommanderStatsPanel
        slug="paladin"
        grades={{}}
        showArtifactSlots
        artifacts={{ weapon: "wog.artifact.axe_of_smashing" }}
      />
    );
    // The section header and the bound weapon chip (icon + name + effect line).
    expect(getByText(/COMMANDER ARTIFACTS/i)).toBeTruthy();
    expect(getByText(/Axe of Smashing/)).toBeTruthy();
    expect(container.querySelector('img[src*="/assets/wog/artifacts/icons/axe_of_smashing.webp"]')).toBeTruthy();
    const weaponRow = container.querySelector('[data-artifact-slot="weapon"]');
    expect(weaponRow?.getAttribute("data-artifact-bound")).toBe("true");
    // The two unfilled slots render an empty placeholder.
    expect(container.querySelector('[data-artifact-slot="armor"]')?.getAttribute("data-artifact-bound")).toBe("false");
    expect(container.querySelector('[data-artifact-slot="trinket"]')?.getAttribute("data-artifact-bound")).toBe("false");
    cleanup();
    // Without the module flag the section is hidden entirely.
    const off = render(<CommanderStatsPanel slug="paladin" grades={{}} />);
    expect(off.queryByText(/COMMANDER ARTIFACTS/i)).toBeNull();
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

describe("CommanderCardFace — themed commander layouts", () => {
  it("uses a single contained themed information layout for Azur Lane", () => {
    const { container, queryByText, getByText } = render(<CommanderCardFace slug="belfast" grades={{}} level={2} />);

    expect(container.querySelector('[data-card-layout="azur-lane"]')).toBeTruthy();
    expect(container.querySelector(".themedCommanderStats")).toBeTruthy();
    expect(container.querySelector(".themedCommanderAbility")).toBeTruthy();
    expect(getByText(/Royal Salvo/)).toBeTruthy();
    // Belfast's commissioned art already contains the title; the renderer
    // must not add a second text title over it.
    expect(queryByText("Belfast")).toBeNull();
  });

  it("puts Demon Ancestor in the same true commander frame as Sword Saint", () => {
    const { container, getByText } = render(<CommanderCardFace slug="demon_ancestor" grades={{}} />);

    expect(container.querySelector('[data-card-layout="classic"]')).toBeTruthy();
    expect(container.querySelector(".themedCommanderStats")).toBeNull();
    expect(container.querySelector(".themedCommanderAbility")).toBeNull();
    expect(getByText("Demon Ancestor")).toBeTruthy();
    expect(getByText(/Blood Frenzy/)).toBeTruthy();
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
    expect(container.textContent).toMatch(/Raise Speed to grade I to arrange your commander/i);
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
// NOTE: it PORTALS to <body>, so `container` (the render root) is empty and the
// assertions below read `baseElement` / document.body. That portal is the fix
// for the reported "can't scroll down to Speed": rendered inline it lived in the
// left rail's `.leftRailDock` stacking context (z-index 20) under the fixed hand
// tray, and in phone mode inside a `display: none` rail on every non-Army tab.
describe("CommanderLevelUpOverlay", () => {
  it("pops the banner, the commander face and the stat picker", () => {
    const { getByText, baseElement } = render(
      <CommanderLevelUpOverlay slug="paladin" grades={{}} level={3} gradePoints={2} onGradeUp={() => undefined} onClose={() => undefined} />
    );
    expect(getByText(/COMMANDER LEVEL UP/i)).toBeTruthy();
    expect(baseElement.querySelector(".commanderLevelUpPicker")).toBeTruthy();
    // The face (with its rainbow spark) is shown inside the modal.
    expect(baseElement.querySelector('[data-testid="commander-rainbow-spark"]')).toBeTruthy();
  });

  it("closes via the Done / Spend-later button", () => {
    let closed = false;
    const { getByRole } = render(
      <CommanderLevelUpOverlay slug="paladin" grades={{}} gradePoints={0} onGradeUp={() => undefined} onClose={() => { closed = true; }} />
    );
    fireEvent.click(getByRole("button", { name: /done/i }));
    expect(closed).toBe(true);
  });

  // The reported bug: the last option (Speed) was unreachable. jsdom cannot
  // compute CSS, so what is pinned here is the DOM contract the CSS fix relies
  // on; the visible half (the box really scrolls) is a real-browser concern and
  // the CSS declarations themselves are pinned in
  // commander-level-up-layout.test.ts.
  it("portals to <body> so no rail stacking context can bury it", () => {
    const { container, baseElement } = render(
      <CommanderLevelUpOverlay slug="paladin" grades={{}} level={3} gradePoints={1} onGradeUp={() => undefined} onClose={() => undefined} />
    );
    // Nothing is rendered in place — the whole overlay hangs off <body>.
    expect(container.querySelector(".commanderLevelUpBackdrop")).toBeNull();
    const backdrop = document.body.querySelector(".commanderLevelUpBackdrop");
    expect(backdrop).toBeTruthy();
    expect(backdrop?.parentElement).toBe(document.body);
    expect(baseElement).toBe(document.body);
  });

  it("puts ALL SIX stat options — Speed last — inside the scroll region, and Speed is clickable", () => {
    const picked: string[] = [];
    render(
      <CommanderLevelUpOverlay slug="paladin" grades={{}} level={5} gradePoints={1} onGradeUp={(stat) => picked.push(stat)} onClose={() => undefined} />
    );
    const scroll = document.body.querySelector(".commanderLevelUpScroll");
    expect(scroll, "the scroll region carries .commanderLevelUpScroll").toBeTruthy();
    const options = Array.from(scroll!.querySelectorAll("button.commanderPickStat"));
    expect(options.map((option) => option.getAttribute("data-stat"))).toEqual([
      "attack",
      "defense",
      "health",
      "damage",
      "magic",
      "speed"
    ]);
    // The reported casualty: the LAST option must be reachable and live.
    const speed = scroll!.querySelector('button.commanderPickStat[data-stat="speed"]') as HTMLButtonElement;
    expect(speed.disabled).toBe(false);
    fireEvent.click(speed);
    expect(picked).toEqual(["speed"]);
  });

  it("keeps the banner and the escape button OUTSIDE the scroll region (never scrolled away)", () => {
    render(
      <CommanderLevelUpOverlay slug="paladin" grades={{}} level={3} gradePoints={2} onGradeUp={() => undefined} onClose={() => undefined} />
    );
    const modal = document.body.querySelector(".commanderLevelUpModal") as HTMLElement;
    const scroll = modal.querySelector(".commanderLevelUpScroll") as HTMLElement;
    const banner = modal.querySelector(".commanderLevelUpBanner") as HTMLElement;
    const done = modal.querySelector(".commanderLevelUpDone") as HTMLElement;
    // Three pinned-scroller-pinned rows: the CSS grid-template-rows contract.
    expect(Array.from(modal.children)).toEqual([banner, scroll, done]);
    expect(scroll.contains(banner)).toBe(false);
    expect(scroll.contains(done)).toBe(false);
    // The fall-back surface is always offered: points can be spent later from
    // the commander dock card, so the popup can never hard-stick.
    expect(done.textContent).toMatch(/spend later/i);
  });
});
