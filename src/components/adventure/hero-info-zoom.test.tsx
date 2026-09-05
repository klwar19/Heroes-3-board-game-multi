// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { SetupLobbyScreen } from "./screen";
import { createAdventureLobbyState } from "@/engine";
import { assetUrl } from "@/lib/asset-url";
import { cardFaceImage } from "@/data/cards/empowered-card-art";
import { polishBalanceCardImage } from "@/data/cards/polish-balance-art";
import { communityBalanceCardImage } from "@/data/cards/community-balance-art";
import type { HouseRuleId } from "@/engine";

afterEach(cleanup);

/**
 * The lobby hero popup: a SHORT summary derived from the card definitions, a
 * blink on the unread info button, and a card reader showing the hero's real
 * faces — swapped for the Polish / Community reprint when that pack is on.
 *
 * LIMIT: jsdom cannot compute CSS, so nothing here proves the blink actually
 * animates, that the reader sits at z 300 or that the ribbon is visible. Only
 * the DOM contract (class names, `src` attributes, text) is pinned; the look is
 * a real-browser concern and there is no e2e spec.
 */
function renderLobby(houseRules?: Partial<Record<HouseRuleId, boolean>>) {
  const state = createAdventureLobbyState({
    seed: "ui-hero-zoom",
    houseRules: houseRules as Record<HouseRuleId, boolean> | undefined,
  });
  render(
    <SetupLobbyScreen onAction={vi.fn()} state={state} viewerPlayerId="p1" />,
  );
  fireEvent.click(screen.getByRole("button", { name: /Heroes & Draft/ }));
}

function infoButton(heroName: string): HTMLElement {
  return screen.getByTitle(new RegExp(`^${heroName}: specialty`));
}

function openHeroInfo(
  heroName: string,
  houseRules?: Partial<Record<HouseRuleId, boolean>>,
): HTMLElement {
  renderLobby(houseRules);
  fireEvent.click(infoButton(heroName));
  return screen.getByRole("dialog", { name: "Hero details" });
}

function openHeroCards(
  heroName: string,
  houseRules?: Partial<Record<HouseRuleId, boolean>>,
): HTMLElement {
  const dialog = openHeroInfo(heroName, houseRules);
  fireEvent.click(
    within(dialog).getByRole("button", { name: "Read the cards" }),
  );
  return screen.getByRole("dialog", { name: "Hero cards" });
}

function srcs(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("img")).map(
    (img) => img.getAttribute("src") ?? "",
  );
}

describe("Lobby hero popup — concise summary", () => {
  it("never prints a balance-pack paragraph while both packs are OFF", () => {
    // REGRESSION: the old `cardRulesText` picked the LONGEST multi-word tag, and
    // the printed `ability.wisdom` definition carries the Polish reprint's own
    // "Balance pack: the basic side keeps −2 gold …" documentation tag — so Rion
    // (and every Wisdom / Tactics / Scouting hero) advertised a house rule that
    // is OFF by default.
    const dialog = openHeroInfo("Rion");
    expect(dialog.textContent).not.toContain("Balance pack");
    expect(dialog.textContent).not.toContain("Community balance");
    expect(dialog.textContent).toContain("Wisdom");
  });

  it("the card reader's Wisdom line is the PRINTED rule, not the reprint's tag", () => {
    // The same regression one level deeper: the reader shows a one-line summary
    // beside each face, and `ability.wisdom`'s printed definition still carries
    // the Polish reprint's documentation tag. With the pack OFF that sentence
    // must not be the line.
    const reader = openHeroCards("Rion");
    fireEvent.click(within(reader).getByRole("tab", { name: "Ability" }));
    expect(reader.textContent).not.toContain("Balance pack");
    expect(reader.textContent).not.toContain("the basic side keeps");
    expect(within(reader).queryByText("Polish Balance")).toBeNull();
  });

  it("shows the specialty name + ONE printed line, and no ability prose", () => {
    const dialog = openHeroInfo("Tamika");
    const text = dialog.textContent ?? "";
    // The tier-I one-liner, from the card's own printed tag.
    expect(text).toContain("+1 Attack when this unit attacks");
    // The printed level tail is dropped from the specialty NAME.
    expect(within(dialog).getByText("Dread Knights")).toBeTruthy();
    // The starting ability is a NAME only now — its rules text moved to the card.
    expect(text).toContain("Offense");
    expect(text).not.toContain("expert +2, then draw 1");
  });

  it("keeps the house-rule speculation off the summary line", () => {
    // The Initiative-specialty tag ends "(House rule: also +1 Combat movement.)
    // — OR — House rule: draw 1 card instead"; only the first sentence is shown.
    const dialog = openHeroInfo("Tamika");
    expect(dialog.textContent).not.toContain("House rule");
  });
});

describe("Lobby hero popup — the unread blink", () => {
  it("blinks until this hero's popup has been opened, per hero", () => {
    renderLobby();
    expect(infoButton("Tamika").className).toContain("blink");
    expect(infoButton("Moandor").className).toContain("blink");
    fireEvent.click(infoButton("Tamika"));
    expect(infoButton("Tamika").className).not.toContain("blink");
    // CONTROL: a hero the player has not opened still blinks.
    expect(infoButton("Moandor").className).toContain("blink");
  });
});

describe("Lobby hero popup — the card reader", () => {
  it("opens the hero's real card faces with prev/next navigation", () => {
    const reader = openHeroCards("Tamika");
    expect(srcs(reader)).toContain(
      assetUrl(cardFaceImage("specialty.tamika.1", false) ?? ""),
    );
    // Thumbnails for every face: the three specialty levels, the ability, the hero.
    for (const label of ["I", "IV", "VI", "Ability", "Hero"]) {
      expect(within(reader).getByRole("tab", { name: label })).toBeTruthy();
    }
    fireEvent.click(within(reader).getByRole("button", { name: "Next card" }));
    expect(srcs(reader)).toContain(
      assetUrl(cardFaceImage("specialty.tamika.4", false) ?? ""),
    );
  });

  it("swaps in the POLISH face for a reprinted specialty (Sandro I)", () => {
    const printed = assetUrl(cardFaceImage("specialty.sandro.1", false) ?? "");
    const polish = assetUrl(polishBalanceCardImage("specialty.sandro.1") ?? "");
    expect(polish).not.toBe(printed);

    const off = openHeroCards("Sandro");
    expect(srcs(off)).toContain(printed);
    expect(within(off).queryByText("Polish Balance")).toBeNull();
    cleanup();

    const on = openHeroCards("Sandro", { "polish-card-balance": true });
    expect(srcs(on)).toContain(polish);
    expect(srcs(on)).not.toContain(printed);
    expect(within(on).getByText("Polish Balance")).toBeTruthy();
  });

  it("CONTROL: a hero with no reprint keeps its printed face with the pack ON", () => {
    expect(polishBalanceCardImage("specialty.tamika.1")).toBeUndefined();
    const reader = openHeroCards("Tamika", { "polish-card-balance": true });
    expect(srcs(reader)).toContain(
      assetUrl(cardFaceImage("specialty.tamika.1", false) ?? ""),
    );
    expect(within(reader).queryByText("Polish Balance")).toBeNull();
  });

  it("COMMUNITY WINS over Polish on a card both packs cover (Wisdom)", () => {
    const polish = assetUrl(polishBalanceCardImage("ability.wisdom") ?? "");
    const community = assetUrl(
      communityBalanceCardImage("ability.wisdom") ?? "",
    );
    expect(polish).toBeTruthy();
    expect(community).not.toBe(polish);

    const reader = openHeroCards("Rion", {
      "polish-card-balance": true,
      "community-card-balance": true,
    });
    fireEvent.click(within(reader).getByRole("tab", { name: "Ability" }));
    expect(srcs(reader)).toContain(community);
    expect(srcs(reader)).not.toContain(polish);
    expect(within(reader).getByText("Community Balance")).toBeTruthy();
  });

  it("the summary line comes from the SAME balanced card as the face", () => {
    const dialog = openHeroInfo("Sandro", { "polish-card-balance": true });
    // The reprint's own "Balance pack: …" line, now that the pack IS on.
    expect(within(dialog).getByText("Polish Balance")).toBeTruthy();
    cleanup();
    // CONTROL: pack off, no ribbon and no reprint wording.
    const off = openHeroInfo("Sandro");
    expect(within(off).queryByText("Polish Balance")).toBeNull();
  });
});
