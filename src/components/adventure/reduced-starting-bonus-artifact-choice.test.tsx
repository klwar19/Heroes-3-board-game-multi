// @vitest-environment jsdom
/**
 * Polish reduced starting bonus — the Minor-Artifact pick shows the CARDS.
 *
 * REPORTED: "Starting bonus - reduced mode. Please make artifacts with graphic -
 * not only text." The opening pick every player makes under
 * `polish-reduced-starting-bonus` ("Draw 2 Minor Artifacts and choose 1") opened
 * a CHOOSE_ONE whose only identity was the option LABEL — "Keep <name>" — so the
 * player chose their opening artifact without ever seeing either card face.
 *
 * The engine is UNTOUCHED: its `RESOLVE_DRAW_CHOOSE_MINOR` step already carries
 * the whole reveal (`drawn` + `keepIndexes`), exactly like the Polish Pandora
 * Search's `RESOLVE_PANDORA_SEARCH`, so the tray reuses that same card row.
 *
 * What is pinned here: one tile per drawn artifact with THAT card id's image,
 * and DISPATCH EQUALITY — the click sends the very `LegalAction` the engine
 * offered (same RESOLVE_VISIT_STEP optionIndex), so no payload is rebuilt.
 * jsdom cannot compute CSS, so the row's sideways scrolling / layout is a
 * REAL-BROWSER concern; only the DOM contract is pinned here.
 *
 * Mutation check: dropping `RESOLVE_DRAW_CHOOSE_MINOR` from
 * `KEEP_ONE_DRAWN_STEP_KINDS` (screen.tsx) fails "shows every drawn Minor
 * Artifact's own face…" and "reads as an ARTIFACT pick…". It deliberately does
 * NOT fail the dispatch test: the generic text button carries the SAME engine
 * label and the SAME action, which is exactly the equality that test exists to
 * pin (the art tests are what prove the row took over).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PromptTray } from "./screen";
import { cardLibrary } from "@/data/cards/library";
import {
  applyAction,
  createAdventureGameState,
  getLegalActions,
  type GameAction,
  type GameState,
  type PlayerId
} from "@/engine";
import { getPlayerView } from "@/engine/player-view";

afterEach(cleanup);

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toHaveLength(0);
  return result.state;
}

/** The live "Starting bonus (Reduced)" CHOOSE_ONE, before either option is taken. */
function reducedBonusState(seed: string, playerCount = 1): GameState {
  let state = createAdventureGameState({
    seed,
    difficulty: "normal",
    rollFirstPlayer: false,
    startingBonus: true,
    playerCount,
    houseRules: { "polish-reduced-starting-bonus": true, "split-decks": true }
  });
  for (let i = 0; i < 30; i += 1) {
    const visit = state.adventure?.pendingVisit;
    if (
      visit?.playerId === "p1" &&
      visit.steps[0]?.type === "CHOOSE_ONE" &&
      visit.steps[0].prompt.includes("Reduced")
    ) {
      return state;
    }
    const legal = getLegalActions(state, visit?.playerId ?? "p1");
    const auto = legal.find((entry) => entry.action.type === "RESOLVE_VISIT_STEP");
    if (!auto) {
      break;
    }
    state = apply(state, auto.action);
  }
  throw new Error("could not reach the reduced starting-bonus prompt");
}

/** Take the "Draw 2 Minor Artifacts" option — the keep-one pick is then open. */
function minorArtifactPickState(seed: string, playerCount = 1): GameState {
  const state = reducedBonusState(seed, playerCount);
  const draw = getLegalActions(state, "p1").find(
    (entry) => entry.action.type === "RESOLVE_VISIT_STEP" && entry.action.optionIndex === 0
  );
  expect(draw, "the engine offers the draw-2-Minor-Artifacts option").toBeTruthy();
  const after = apply(state, draw!.action);
  const step = after.adventure?.pendingVisit?.steps[0];
  expect(step?.type, "the draw opens a keep-one CHOOSE_ONE").toBe("CHOOSE_ONE");
  return after;
}

/** The drawn artifact ids, in the ENGINE's own option order. */
function drawnArtifactIds(state: GameState): string[] {
  const step = state.adventure!.pendingVisit!.steps[0];
  if (step.type !== "CHOOSE_ONE") throw new Error("no CHOOSE_ONE");
  return step.options.map((option) => {
    const inner = option.steps.find((entry) => entry.type === "RESOLVE_DRAW_CHOOSE_MINOR");
    if (inner?.type !== "RESOLVE_DRAW_CHOOSE_MINOR") throw new Error("no resolve step");
    return inner.drawn[inner.keepIndexes[0]!]!;
  });
}

function tray(state: GameState, viewerPlayerId: PlayerId, onAction = vi.fn()) {
  const rendered = render(
    <PromptTray
      legalActions={getLegalActions(state, viewerPlayerId)}
      onAction={onAction}
      state={state}
      viewerPlayerId={viewerPlayerId}
    />
  );
  return { ...rendered, onAction };
}

describe("Polish reduced starting bonus — pick the Minor Artifact by its card face", () => {
  it("shows every drawn Minor Artifact's own face, never a text-only list", () => {
    const state = minorArtifactPickState("reduced-bonus-art");
    const drawnIds = drawnArtifactIds(state);
    expect(drawnIds.length).toBeGreaterThanOrEqual(2);

    const { container } = tray(state, "p1");
    const row = container.querySelector(".promptOptions.pandoraCardRow");
    expect(row, "the pick renders as the card row").toBeTruthy();
    const tiles = container.querySelectorAll(".pandoraCardTile");
    expect(tiles).toHaveLength(drawnIds.length);

    drawnIds.forEach((cardId, index) => {
      const card = cardLibrary[cardId];
      expect(card?.kind, `${cardId} is an artifact`).toBe("artifact");
      const image = card?.assets?.cardImage;
      expect(image, `${cardId} has card art`).toBeTruthy();
      // THIS tile shows THIS card — not a shared glyph, not the deck back.
      expect(tiles[index]!.querySelector("img")?.getAttribute("src")).toContain(image!);
      expect(tiles[index]!.textContent).toContain(card!.name);
    });
  });

  it("clicking a card dispatches the engine's own RESOLVE_VISIT_STEP, unchanged", () => {
    const state = minorArtifactPickState("reduced-bonus-dispatch");
    const drawnIds = drawnArtifactIds(state);
    const engineOffer = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "RESOLVE_VISIT_STEP" && legal.action.optionIndex === 1
    );
    expect(engineOffer, "the engine offers option 1").toBeTruthy();

    const { onAction } = tray(state, "p1");
    // The engine's own label stays the accessible name, so the button provably
    // carries the same offer the old text button did.
    fireEvent.click(screen.getByRole("button", { name: `Keep ${cardLibrary[drawnIds[1]!]!.name}` }));
    expect(onAction).toHaveBeenLastCalledWith(engineOffer!.action);
    expect(onAction).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: "RESOLVE_VISIT_STEP", optionIndex: 1 })
    );
    // …and the dispatched action really keeps that artifact.
    const after = apply(state, engineOffer!.action);
    expect(after.players.p1.hand).toContain(drawnIds[1]!);
    expect(after.players.p1.hand).not.toContain(drawnIds[0]!);
  });

  it("reads as an ARTIFACT pick — its own hint and button wording, not the Pandora one", () => {
    const state = minorArtifactPickState("reduced-bonus-wording");
    const { container } = tray(state, "p1");
    expect(container.querySelector(".pandoraCardRow")?.getAttribute("data-row-kind")).toBe("artifact");
    expect(container.querySelector(".pandoraCardHint")?.textContent).toContain("Minor Artifact");
    expect(container.querySelector(".pandoraCardHint")?.textContent).not.toContain("Pandora");
    expect(container.querySelectorAll(".pandoraCardActions .commandButton")).toHaveLength(2);
    for (const button of Array.from(container.querySelectorAll(".pandoraCardActions .commandButton"))) {
      expect(button.textContent).toBe("Keep this Artifact");
    }
  });

  it("HIDDEN INFO: another seat's view carries no drawn ids and renders no card faces", () => {
    const state = minorArtifactPickState("reduced-bonus-mask", 2);
    const oppView = getPlayerView(state, "p2");
    // The engine already blanks a non-owner's visit steps (player-view.ts) —
    // re-pinned because the row must only render what the viewer's own state has.
    expect(oppView.adventure?.pendingVisit?.steps).toEqual([]);

    const { container } = tray(oppView as unknown as GameState, "p2");
    expect(container.querySelector(".pandoraCardRow")).toBeNull();
    expect(container.querySelectorAll("img")).toHaveLength(0);
  });
});

describe("CONTROL — the surrounding prompts are unchanged", () => {
  it("the reduced starting-bonus prompt ITSELF keeps its glyph options (no card row)", () => {
    // Its two options carry DRAW_CHOOSE_MINOR_ARTIFACTS / ROLL_RESOURCE_DICE —
    // no cards are on the table yet, so there is nothing to show a face for.
    const state = reducedBonusState("reduced-bonus-outer");
    const { container } = tray(state, "p1");
    expect(container.querySelector(".pandoraCardRow")).toBeNull();
    expect(container.querySelector(".pandoraCardTile")).toBeNull();
    expect(screen.getByRole("button", { name: /Draw 2 Minor Artifacts/ })).toBeTruthy();
  });

  it("a plain visit CHOOSE_ONE still renders plain text options", () => {
    const state = reducedBonusState("reduced-bonus-control");
    const adventure = state.adventure!;
    adventure.pendingVisit!.steps = [
      {
        type: "CHOOSE_ONE",
        prompt: "Pick a bonus",
        options: [
          { label: "Gain 3 gold", steps: [{ type: "GAIN_RESOURCES", gold: 3 }] },
          { label: "Gain 1 movement", steps: [{ type: "GAIN_MOVEMENT", amount: 1 }] }
        ]
      }
    ];

    const { container } = tray(state, "p1");
    expect(container.querySelector(".pandoraCardRow")).toBeNull();
    expect(screen.getByRole("button", { name: /Gain 1 movement/ })).toBeTruthy();
  });
});
