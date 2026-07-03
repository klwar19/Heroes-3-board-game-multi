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
import { cardLibrary } from "@/data/cards/library";
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
