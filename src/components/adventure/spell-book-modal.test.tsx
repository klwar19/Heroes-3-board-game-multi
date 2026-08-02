// @vitest-environment jsdom
/**
 * SpellBookModal — the openable, two-page Spell Book (map UI redesign).
 *
 * Verifies the real content path, not just that it mounts: the left page lists
 * the stored spells, the right page shows the selected spell's plate (name,
 * a real definition, its school chip), picking another index entry turns the
 * page, and a stored spell's cast action is offered and reported to onCast.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SpellBookModal } from "./screen";
import * as sound from "@/lib/sound";
import { cardLibrary } from "@/data/cards/library";
import { spellPowerLadder, spellTimingKind } from "@/engine";
import type { LegalAction } from "@/engine/state";

afterEach(cleanup);

const EMPTY = new Map<string, LegalAction[]>();

describe("SpellBookModal — the openable Spell Book", () => {
  it("lists stored spells and shows the first spell's illustrated plate", () => {
    render(
      <SpellBookModal cardIds={["spell.haste", "spell.slow"]} castsByCard={EMPTY} onCast={() => {}} onClose={() => {}} />
    );
    expect(document.querySelectorAll(".spellBookIndexItem").length).toBe(2);
    // The right page opens on the first stored spell.
    expect(document.querySelector(".spellBookSpellTitle")?.textContent).toBe(cardLibrary["spell.haste"].name);
    // A real definition (not an empty stub) renders, along with the school chip.
    expect((document.querySelector(".spellBookDefinition")?.textContent ?? "").length).toBeGreaterThan(12);
    expect(document.querySelector(".spellBookArtSlot")).toBeTruthy();
    expect(document.body.textContent).toContain("Air");
  });

  it("turns to another spell's plate when picked from the index", () => {
    render(
      <SpellBookModal cardIds={["spell.haste", "spell.slow"]} castsByCard={EMPTY} onCast={() => {}} onClose={() => {}} />
    );
    const items = document.querySelectorAll<HTMLElement>(".spellBookIndexItem");
    fireEvent.click(items[1]);
    expect(document.querySelector(".spellBookSpellTitle")?.textContent).toBe(cardLibrary["spell.slow"].name);
  });

  it("flips a real paper leaf (and plays the page foley) on a turn — but not on the initial open", () => {
    const spy = vi.spyOn(sound, "playSpellBookPageTurn").mockImplementation(() => {});
    render(
      <SpellBookModal cardIds={["spell.haste", "spell.slow"]} castsByCard={EMPTY} onCast={() => {}} onClose={() => {}} />
    );
    // Freshly opened: the right page has not turned yet (no leaf animation class).
    const rightBefore = document.querySelector(".spellBookPage.right");
    expect(rightBefore?.classList.contains("turning")).toBe(false);
    expect(document.querySelector(".spellBookTurnLeaf")).toBeTruthy();
    expect(spy).not.toHaveBeenCalled();

    // Picking another spell turns the page: the remounted right page carries
    // the `turning` class (driving the 3D leaf flip) and the foley plays once.
    const items = document.querySelectorAll<HTMLElement>(".spellBookIndexItem");
    fireEvent.click(items[1]);
    const rightAfter = document.querySelector(".spellBookPage.right");
    expect(rightAfter?.classList.contains("turning")).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);

    // Re-picking the SAME spell is not a turn (no extra flip, no extra foley).
    fireEvent.click(document.querySelectorAll<HTMLElement>(".spellBookIndexItem")[1]);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it("offers a stored spell's cast action and reports the pick to onCast", () => {
    const cast = {
      action: { type: "PLAY_CARD", playerId: "p1", cardId: "spell.haste", fromSpellBook: true },
      label: "Cast Haste →"
    } as unknown as LegalAction;
    const casts = new Map<string, LegalAction[]>([["spell.haste", [cast]]]);
    const onCast = vi.fn();
    render(<SpellBookModal cardIds={["spell.haste"]} castsByCard={casts} onCast={onCast} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Cast Haste →" }));
    expect(onCast).toHaveBeenCalledWith(cast);
  });

  it("offers Mage Guild purchases and only the selected spell's Rolling Spells shortcut", () => {
    const buy = {
      label: "Buy spells (5 gold, Search 3)",
      action: { type: "SPELL_BOOK_ACTION", playerId: "p1" }
    } as LegalAction;
    const rollHaste = {
      label: "Rolling Spells: return Haste, pay 3 gold, Search 2",
      action: {
        type: "SPELL_BOOK_ACTION",
        playerId: "p1",
        rollSpell: { cardId: "spell.haste", source: "refreshed" }
      }
    } as LegalAction;
    const rollSlow = {
      label: "Rolling Spells: return Slow, pay 3 gold, Search 2",
      action: {
        type: "SPELL_BOOK_ACTION",
        playerId: "p1",
        rollSpell: { cardId: "spell.slow", source: "used" }
      }
    } as LegalAction;
    const onShortcut = vi.fn();
    render(
      <SpellBookModal
        cardIds={["spell.haste"]}
        usedCardIds={["spell.slow"]}
        castsByCard={EMPTY}
        shortcuts={[buy, rollHaste, rollSlow]}
        onCast={() => {}}
        onShortcut={onShortcut}
        onClose={() => {}}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Buy spells \(5 gold/i }));
    expect(onShortcut).toHaveBeenCalledWith(buy);
    expect(screen.getByRole("button", { name: /return Haste/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /return Slow/i })).toBeNull();

    fireEvent.click(document.querySelectorAll<HTMLElement>(".spellBookIndexItem")[1]);
    expect(screen.queryByRole("button", { name: /return Haste/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /return Slow/i }));
    expect(onShortcut).toHaveBeenCalledWith(rollSlow);
  });

  it("shows the empty-book state when nothing is stored", () => {
    render(<SpellBookModal cardIds={[]} castsByCard={EMPTY} onCast={() => {}} onClose={() => {}} />);
    expect(document.querySelector(".spellBookEmpty")).toBeTruthy();
    expect(document.querySelector(".spellBookEmptyPage")).toBeTruthy();
    expect(document.querySelector(".spellBookIndexItem")).toBeNull();
  });

  it("closes from the close button", () => {
    const onClose = vi.fn();
    render(<SpellBookModal cardIds={[]} castsByCard={EMPTY} onCast={() => {}} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /close the spell book/i }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe("SpellBookModal — the data-derived Power ladder and timing badge", () => {
  it("renders every Power rung of a damage spell with the effect's own numbers (Magic Arrow 0/1/2 → 1/2/3)", () => {
    // Guard the fixture: Magic Arrow's engine ladder is exactly 1/2/3 spell
    // damage, so a wrong render below is a real UI bug, not a data change.
    expect(spellPowerLadder(cardLibrary["spell.magic_arrow"])).toEqual([
      { power: 0, text: "1 spell damage" },
      { power: 1, text: "2 spell damage" },
      { power: 2, text: "3 spell damage" }
    ]);

    render(<SpellBookModal cardIds={["spell.magic_arrow"]} castsByCard={EMPTY} onCast={() => {}} onClose={() => {}} />);

    const section = document.querySelector(".spellBookLadder");
    expect(section).toBeTruthy();
    const rows = document.querySelectorAll(".spellBookLadderRow");
    expect(rows.length).toBe(3);
    // Each rung shows its tier and the DATA-derived damage — assert the numbers.
    expect(rows[0].textContent).toContain("Power 0");
    expect(rows[0].textContent).toContain("1 spell damage");
    expect(rows[1].textContent).toContain("Power 1");
    expect(rows[1].textContent).toContain("2 spell damage");
    expect(rows[2].textContent).toContain("Power 2");
    expect(rows[2].textContent).toContain("3 spell damage");
  });

  it("shows NO ladder section for a flat spell (CONTROL — no fake rows)", () => {
    // Cast a Spell resolves a fixed effect (no `*ByPower` table) — the plate
    // must render no ladder rather than an empty/fabricated one.
    expect(spellPowerLadder(cardLibrary["spell.cast_a_spell"])).toEqual([]);
    render(<SpellBookModal cardIds={["spell.cast_a_spell"]} castsByCard={EMPTY} onCast={() => {}} onClose={() => {}} />);
    expect(document.querySelector(".spellBookLadder")).toBeNull();
    expect(document.querySelectorAll(".spellBookLadderRow").length).toBe(0);
  });

  it("shows the Instant timing badge on an instant spell (and NOT the Ongoing one)", () => {
    render(<SpellBookModal cardIds={["spell.stone_skin"]} castsByCard={EMPTY} onCast={() => {}} onClose={() => {}} />);
    const badge = document.querySelector(".spellBookChip.timing");
    expect(badge?.classList.contains("instant")).toBe(true);
    expect(badge?.textContent).toContain("Instant");
    // CONTROL: an instant spell must not also read as ongoing.
    expect(document.querySelector(".spellBookChip.timing.ongoing")).toBeNull();
  });

  it("shows the Ongoing timing badge on an ongoing spell (and NOT the Instant one)", () => {
    // Haste is timing:"combat" but creates a combat-long ongoing effect — the
    // badge derivation (not the prose) must read it as Ongoing.
    render(<SpellBookModal cardIds={["spell.haste"]} castsByCard={EMPTY} onCast={() => {}} onClose={() => {}} />);
    const badge = document.querySelector(".spellBookChip.timing");
    expect(badge?.classList.contains("ongoing")).toBe(true);
    expect(badge?.textContent).toContain("Ongoing");
    expect(document.querySelector(".spellBookChip.timing.instant")).toBeNull();
  });

  it("shows the Combat badge on a plain combat-cast damage spell", () => {
    render(<SpellBookModal cardIds={["spell.magic_arrow"]} castsByCard={EMPTY} onCast={() => {}} onClose={() => {}} />);
    const badge = document.querySelector(".spellBookChip.timing");
    expect(badge?.classList.contains("combat")).toBe(true);
    expect(badge?.textContent).toContain("Combat");
  });

  it("keeps the Polish refreshed/used chips alongside the new sections", () => {
    // Polish Book: a used copy still shows its lifecycle chip AND the ladder.
    render(
      <SpellBookModal
        cardIds={[]}
        usedCardIds={["spell.magic_arrow"]}
        polishMode
        castsByCard={EMPTY}
        onCast={() => {}}
        onClose={() => {}}
      />
    );
    expect(document.querySelector(".spellBookChip.used")?.textContent).toContain("Used until next round");
    expect(document.querySelectorAll(".spellBookLadderRow").length).toBe(3);
    expect(document.querySelector(".spellBookChip.timing.combat")).toBeTruthy();
  });
});

describe("spellPowerLadder / spellTimingKind (engine helpers)", () => {
  it("reads a DEAL_DAMAGE ladder straight from amountByPower", () => {
    expect(spellPowerLadder(cardLibrary["spell.lightning_bolt"])).toEqual([
      { power: 0, text: "2 spell damage" },
      { power: 1, text: "3 spell damage" },
      { power: 2, text: "4 spell damage" }
    ]);
  });

  it("reads a CREATE_INITIATIVE_BUFF ladder with signed amounts (Haste + / Slow −)", () => {
    expect(spellPowerLadder(cardLibrary["spell.haste"])).toEqual([
      { power: 0, text: "+1 initiative" },
      { power: 1, text: "+2 initiative" },
      { power: 2, text: "+3 initiative" }
    ]);
    expect(spellPowerLadder(cardLibrary["spell.slow"])).toEqual([
      { power: 0, text: "-1 initiative" },
      { power: 1, text: "-2 initiative" },
      { power: 2, text: "-3 initiative" }
    ]);
  });

  it("reads a gradeByPower ladder (Anti-Magic immunity tiers)", () => {
    expect(spellPowerLadder(cardLibrary["spell.anti_magic"])).toEqual([
      { power: 0, text: "immune up to bronze" },
      { power: 2, text: "immune up to silver" },
      { power: 4, text: "immune up to gold" }
    ]);
  });

  it("merges an OR spell's option ladders per Power tier (Prayer)", () => {
    const ladder = spellPowerLadder(cardLibrary["spell.prayer"]);
    expect(ladder.map((row) => row.power)).toEqual([0, 2, 4]);
    expect(ladder[0].text).toBe("+1 attack / +1 defense / +1 initiative");
    expect(ladder[2].text).toBe("+3 attack / +3 defense / +3 initiative");
  });

  it("returns [] for a flat spell (no *ByPower table)", () => {
    expect(spellPowerLadder(cardLibrary["spell.cast_a_spell"])).toEqual([]);
    expect(spellPowerLadder(undefined)).toEqual([]);
  });

  it("derives the printed timing keyword from data, not prose", () => {
    expect(spellTimingKind(cardLibrary["spell.magic_arrow"])).toBe("combat");
    expect(spellTimingKind(cardLibrary["spell.stone_skin"])).toBe("instant");
    expect(spellTimingKind(cardLibrary["spell.haste"])).toBe("ongoing");
    expect(spellTimingKind(cardLibrary["spell.town_portal"])).toBe("map");
  });
});
