// @vitest-environment jsdom
/**
 * Polish Bank Sizes A/B pick: the PromptTray shows each bank's field art ABOVE
 * the name + size coin so the choice is visual (not text-only "A · Crypt · size II").
 * "Leave it blocked" is a dedicated X-marked card, never an empty bank face.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

import { PromptTray } from "./screen";
import type { GameState, LegalAction } from "@/engine/state";
import { createInitialGameState } from "@/engine";

afterEach(cleanup);

describe("Polish bank choice art", () => {
  it("renders bank field art above the name and size, plus Leave-blocked X", () => {
    const state = createInitialGameState("polish-bank-choice-art") as GameState;
    const choiceId = "choice_polish_bank_ui";
    state.pendingChoice = {
      id: choiceId,
      type: "OPTION_CHOICE",
      playerId: "p1",
      prompt:
        "This Far tile has a Blocked Field — choose a rolled Creature Bank, or leave it blocked. Then rotate the tile.",
      options: [
        { label: "A · Crypt · size II" },
        { label: "B · Imp Cache · size I" },
        { label: "Leave it blocked" }
      ],
      context: "place-creature-bank",
      creatureBank: {
        fieldId: "tile_preview",
        tier: "far",
        candidates: [
          { bankId: "crypt", size: 2 },
          { bankId: "imp_cache", size: 1 }
        ],
        tileInstanceId: "tile_preview",
        preRotation: true
      },
      returnPhase: "map"
    };
    state.phase = "choice";
    state.priorityPlayerId = "p1";

    const legalActions: LegalAction[] = [
      {
        label: "A · Crypt · size II",
        action: { type: "CHOOSE_OPTION", playerId: "p1", choiceId, optionIndex: 0 }
      },
      {
        label: "B · Imp Cache · size I",
        action: { type: "CHOOSE_OPTION", playerId: "p1", choiceId, optionIndex: 1 }
      },
      {
        label: "Leave it blocked",
        action: { type: "CHOOSE_OPTION", playerId: "p1", choiceId, optionIndex: 2 }
      }
    ];

    const { container } = render(
      <PromptTray
        legalActions={legalActions}
        onAction={vi.fn()}
        state={state}
        viewerPlayerId="p1"
      />
    );

    const tray = container.querySelector(".promptTray.withPolishBankCards");
    expect(tray, "polish bank art tray").toBeTruthy();

    const cards = container.querySelectorAll(".polishBankOptionCard");
    expect(cards.length, "two banks + leave blocked").toBe(3);

    const firstImg = cards[0].querySelector(".polishBankOptionArt img") as HTMLImageElement | null;
    const secondImg = cards[1].querySelector(".polishBankOptionArt img") as HTMLImageElement | null;
    expect(firstImg?.getAttribute("src") ?? "", "Crypt art").toMatch(/crypt/i);
    expect(secondImg?.getAttribute("src") ?? "", "Imp Cache art").toMatch(/imp_cache/i);

    expect(cards[0].querySelector(".polishBankOptionName")?.textContent).toMatch(/Crypt/i);
    expect(cards[1].querySelector(".polishBankOptionName")?.textContent).toMatch(/Imp Cache/i);
    expect(cards[0].querySelector(".polishBankOptionSize")?.textContent).toMatch(/size/i);
    expect(cards[0].querySelector(".polishBankSizeCoin")?.textContent).toBe("2");
    expect(cards[1].querySelector(".polishBankSizeCoin")?.textContent).toBe("1");
    // Art sits above the name in the card layout (DOM order).
    const firstArt = cards[0].querySelector(".polishBankOptionArt");
    const firstName = cards[0].querySelector(".polishBankOptionName");
    expect(
      firstArt && firstName && Boolean(firstArt.compareDocumentPosition(firstName) & Node.DOCUMENT_POSITION_FOLLOWING)
    ).toBe(true);

    // Leave blocked is a clear X card — never an empty bank face labeled "Creature Bank".
    const leave = container.querySelector('[data-testid="leave-bank-blocked"]');
    expect(leave, "leave-blocked card").toBeTruthy();
    expect(leave?.classList.contains("leaveBlocked")).toBe(true);
    expect(leave?.querySelector(".polishBankLeaveX")?.textContent).toMatch(/✕|×|X/i);
    expect(leave?.querySelector(".polishBankOptionName")?.textContent).toMatch(/Leave it blocked/i);
    expect(leave?.querySelector("img")).toBeNull();
  });
});