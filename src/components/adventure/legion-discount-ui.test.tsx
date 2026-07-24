// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PromptTray, TownPanel } from "./screen";
import { applyAction, createAdventureGameState, getLegalActions } from "@/engine";
import type { GameAction, GameState } from "@/engine";

afterEach(cleanup);

/**
 * A real adventure game with p1 on Castle, controlling its town with the given
 * buildings and the Population token in hand. Mirrors town-building-effects.tsx.
 */
function castleTownState(buildings: string[]): GameState {
  const state = createAdventureGameState({ seed: "legion-ui", rollFirstPlayer: false });
  for (const _pl of Object.values(state.players)) { _pl.canMulligan = false; _pl.needsHandRefresh = false; }
  state.activePlayerId = "p1";
  state.players.p1.factionId = "castle";
  state.players.p1.needsHandRefresh = false;
  state.players.p1.townTokens.population = true;
  const town = Object.values(state.towns).find((candidate) => candidate.controllerId === "p1");
  if (!town) {
    throw new Error("p1 should control a town");
  }
  town.factionId = "castle";
  town.buildings = [...buildings];
  return state;
}

/**
 * The town-panel recruit/reinforce row whose text mentions `unitName`, including
 * the cost chips' aria-labels. `UnitCost` renders a price as an icon + number,
 * so the human-readable "N gold" text lives in the chip's aria-label/title (via
 * formatCost), not in `textContent` — read both so the discounted-price
 * assertions see it.
 */
function recruitRowText(unitName: string): string {
  const rows = Array.from(document.querySelectorAll(".recruitRow")) as HTMLElement[];
  const row = rows.find((candidate) => candidate.textContent?.includes(unitName));
  if (!row) {
    throw new Error(`no recruit row for ${unitName}`);
  }
  const labels = Array.from(row.querySelectorAll("[aria-label]"))
    .map((element) => element.getAttribute("aria-label"))
    .join(" | ");
  return `${row.textContent ?? ""} | ${labels}`;
}

function renderTown(state: GameState) {
  render(<TownPanel legalActions={getLegalActions(state, "p1")} onAction={vi.fn()} state={state} viewerPlayerId="p1" />);
}

describe("TownPanel — Legion voucher shows the discounted price", () => {
  it("shows a recruit's discounted gold and a Legion hint for the unit the voucher is reserved for", () => {
    const state = castleTownState(["castle.dwelling_bronze"]);
    state.players.p1.army = state.players.p1.army.filter((unit) => unit.unitDefId !== "castle.marksmen");
    // A −2 voucher reserved for the Marksmen recruit (Few cost 3 gold → 1 gold).
    state.players.p1.recruitDiscounts = [
      { cardId: "artifact.legs_of_legion", amount: 2, target: { kind: "recruit", unitDefId: "castle.marksmen" } }
    ];
    renderTown(state);

    const row = recruitRowText("Marksmen");
    expect(row).toMatch(/1 gold/);
    expect(row).toMatch(/Legion\s*[−-]\s*2/);

    // Griffins were not the voucher's target, so they show no Legion hint.
    expect(recruitRowText("Griffins")).not.toMatch(/Legion/);
  });

  it("shows a reinforce's discounted Pack gold and a Legion hint (town reinforce needs a Citadel)", () => {
    const state = castleTownState(["castle.dwelling_bronze", "castle.citadel"]);
    state.players.p1.army = state.players.p1.army.filter((unit) => unit.unitDefId !== "castle.griffins");
    state.players.p1.army.push({ id: "u_griffins", unitDefId: "castle.griffins", side: "few" });
    // A −4 voucher reserved for the Griffins reinforce (Pack cost 6 gold → 2 gold).
    state.players.p1.recruitDiscounts = [
      { cardId: "artifact.legs_of_legion", amount: 4, target: { kind: "reinforce", armyUnitId: "u_griffins" } }
    ];
    renderTown(state);

    const row = recruitRowText("Griffins");
    // The discounted Pack reinforce price (6 → 2 gold) shown on the reinforce chip.
    expect(row).toMatch(/Reinforce cost for Griffins: 2 gold/);
    expect(row).toMatch(/Legion\s*[−-]\s*4/);
  });
});

describe("PromptTray — the Legion 'pick a unit' window renders the real options", () => {
  function playLegsAndGetPromptState(): GameState {
    const state = castleTownState(["castle.dwelling_bronze", "castle.citadel"]);
    // A Champion Few on a Stables field is already −6: a Head of Legion (−6) STACKS
    // with it to −12, and the prompt must surface that stacked total.
    if (state.heroes.hero_p1.spaceId) {
      state.adventure!.fields[state.heroes.hero_p1.spaceId].location = "stables";
    }
    state.players.p1.army = state.players.p1.army.filter((unit) => unit.unitDefId !== "castle.marksmen");
    state.players.p1.army.push({ id: "champ_few", unitDefId: "castle.champions", side: "few" });
    state.players.p1.hand = ["artifact.head_of_legion"];

    const play = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "artifact.head_of_legion" && legal.action.optionIndex === 0
    );
    if (!play) {
      throw new Error("Head of Legion discount side should be playable");
    }
    const result = applyAction(state, play.action);
    expect(result.errors).toHaveLength(0);
    return result.state;
  }

  it("renders one button per recruit/reinforce target, showing the Champion's stacked total", () => {
    const state = playLegsAndGetPromptState();
    const onAction = vi.fn<(action: GameAction) => void>();
    render(<PromptTray legalActions={getLegalActions(state, "p1")} onAction={onAction} state={state} viewerPlayerId="p1" />);

    // A fresh target (Marksmen recruit) shows the plain −6 reduction…
    const marksmen = screen.getByRole("button", { name: /Recruit Marksmen .* reduce cost by 6 gold/i });
    expect(marksmen).toBeTruthy();

    // …and the Champion (already −6 from Stables) STACKS the Head of Legion's −6 to −12.
    const champion = screen.getByRole("button", { name: /Reinforce Champions .* total .*12 gold.*stacks with the .*6/i });
    expect(champion).toBeTruthy();

    // Clicking a target dispatches its RESOLVE_VISIT_STEP (the engine banks the voucher).
    fireEvent.click(marksmen);
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction.mock.calls[0][0]).toMatchObject({ type: "RESOLVE_VISIT_STEP" });
  });

  it("shows the TARGET UNIT's portrait on each option tile, not the Legion artifact image", () => {
    const state = playLegsAndGetPromptState();
    render(<PromptTray legalActions={getLegalActions(state, "p1")} onAction={vi.fn()} state={state} viewerPlayerId="p1" />);

    // The Marksmen recruit tile shows the Marksmen UNIT art…
    const marksmen = screen.getByRole("button", { name: /Recruit Marksmen/i });
    const marksmenImg = marksmen.querySelector("img");
    expect(marksmenImg).toBeTruthy();
    expect(marksmenImg?.getAttribute("src")).toMatch(/marksmen/);
    // …NOT the Head of Legion artifact card. The step's cardId is the ARTIFACT,
    // so the pre-fix code short-circuited every option to the same Legion image;
    // "legion" appears only in that buggy artifact path (no unit slug carries it).
    expect(marksmenImg?.getAttribute("src")).not.toMatch(/legion/);

    // The Champions reinforce tile shows the Champions UNIT art, again not the artifact.
    const champion = screen.getByRole("button", { name: /Reinforce Champions/i });
    const championImg = champion.querySelector("img");
    expect(championImg?.getAttribute("src")).toMatch(/champions/);
    expect(championImg?.getAttribute("src")).not.toMatch(/legion/);
  });
});
