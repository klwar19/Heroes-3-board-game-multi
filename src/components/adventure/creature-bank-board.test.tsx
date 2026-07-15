// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { HexMapBoard } from "./screen";
import { instantiateTile } from "@/engine/adventure";
import { CREATURE_BANK_FIELD_IMAGES } from "@/data/assets/homm-assets";
import {
  createAdventureGameState,
  getLegalActions,
  getPlayerView,
  getTileFootprintSpaceIds,
  type GameState,
  type MapTileState
} from "@/engine";

afterEach(cleanup);

function adv(state: GameState) {
  if (!state.adventure) {
    throw new Error("no adventure state");
  }
  return state.adventure;
}

/** A face-up tile on the board so its fields render as real hexes. */
function boardWithTile(): { state: GameState; tile: MapTileState } {
  const state = createAdventureGameState({ seed: "creature-bank-art-ui", difficulty: "normal", rollFirstPlayer: false });
  state.activePlayerId = "p1";
  const tile = instantiateTile(adv(state), "F3", { row: 24, col: 12 }, 0, false);
  return { state, tile };
}

function renderBoard(state: GameState): HTMLElement {
  const { container } = render(
    <HexMapBoard
      legalActions={getLegalActions(state, "p1")}
      moveCue={null}
      onAction={() => {}}
      placement={null}
      readOnly
      state={state}
      view={getPlayerView(state, "p1")}
      viewerPlayerId="p1"
    />
  );
  return container;
}

function bankTokenHref(container: HTMLElement, spaceId: string): string {
  const token = container.querySelector(`image.locationToken[data-space-id="${spaceId}"]`);
  expect(token, `a bank token must render on ${spaceId}`).toBeTruthy();
  return token!.getAttribute("href") ?? "";
}

describe("Creature Bank hex art — per-bank field tile on the board", () => {
  it("draws each placed bank's OWN field-tile scan, not a shared image", () => {
    const { state, tile } = boardWithTile();
    const [cryptSpace, pyramidSpace] = getTileFootprintSpaceIds(tile);

    const crypt = adv(state).fields[cryptSpace]!;
    crypt.location = "creature_bank";
    crypt.bankId = "crypt";
    const pyramid = adv(state).fields[pyramidSpace]!;
    pyramid.location = "creature_bank";
    pyramid.bankId = "pyramid";

    const container = renderBoard(state);

    // Each hex shows its bank's distinct art — a regression to one-image-for-all
    // would make these equal and fail.
    expect(bankTokenHref(container, cryptSpace)).toContain(CREATURE_BANK_FIELD_IMAGES.crypt);
    expect(bankTokenHref(container, pyramidSpace)).toContain(CREATURE_BANK_FIELD_IMAGES.pyramid);
    expect(bankTokenHref(container, cryptSpace)).not.toBe(bankTokenHref(container, pyramidSpace));
  });

  it("clips the landscape scan to the hex and covers it (no axis-stretching squash)", () => {
    const { state, tile } = boardWithTile();
    const [bankSpace] = getTileFootprintSpaceIds(tile);
    const field = adv(state).fields[bankSpace]!;
    field.location = "creature_bank";
    field.bankId = "dragon_utopia";

    const container = renderBoard(state);
    const token = container.querySelector(`image.locationToken[data-space-id="${bankSpace}"]`)!;
    // "slice" centres + crops to fill the hex undistorted; the old "none" squashed
    // the wide tile into the tall hex box. And it must be clipped to the hex.
    expect(token.getAttribute("preserveAspectRatio")).toBe("xMidYMid slice");
    expect(token.getAttribute("clip-path") ?? token.getAttribute("clipPath")).toMatch(/^url\(#bankClip-/);
  });

  it("draws the bank art click-through so you can select the field to walk in", () => {
    // The bank art is an overlay painted ON TOP of the clickable hex. If it
    // captured pointer events it would swallow the move click and the player
    // could never select the bank to enter it — the literal "can't get in" bug.
    const { state, tile } = boardWithTile();
    const [bankSpace] = getTileFootprintSpaceIds(tile);
    const field = adv(state).fields[bankSpace]!;
    field.location = "creature_bank";
    field.bankId = "crypt";

    const container = renderBoard(state);
    const token = container.querySelector(`image.locationToken[data-space-id="${bankSpace}"]`) as SVGImageElement;
    expect(token).toBeTruthy();
    // Non-interactive: the click falls through to the hex cell beneath it.
    expect(token.style.pointerEvents).toBe("none");
  });

  it("shows the permanent bronze/silver/gold-style size marker on a placed bank", () => {
    const { state, tile } = boardWithTile();
    const [bankSpace] = getTileFootprintSpaceIds(tile);
    const field = adv(state).fields[bankSpace]!;
    field.location = "creature_bank";
    field.bankId = "crypt";
    field.bankSize = 4;

    const container = renderBoard(state);
    const badge = container.querySelector(`.bankSizeSvgBadge.placed.size-4`);
    expect(badge).toBeTruthy();
    expect(badge?.textContent).toContain("Ⅳ");
  });

  it("previews both rolled candidates with distinct size badges before rotation", () => {
    const { state, tile } = boardWithTile();
    tile.awaitingRotation = true;
    tile.reservedBankId = "crypt";
    tile.reservedBankOptions = [
      { bankId: "crypt", size: 2 },
      { bankId: "pyramid", size: 3 }
    ];

    const container = renderBoard(state);
    const badges = container.querySelectorAll(`.bankSizeSvgBadge:not(.placed)`);
    expect(badges).toHaveLength(2);
    expect(container.textContent).toContain("A · Crypt · Ⅱ");
    expect(container.textContent).toContain("B · Pyramid · Ⅲ");
  });
});
