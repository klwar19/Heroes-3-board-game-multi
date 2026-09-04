// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { TownPanel } from "./screen";
import { createAdventureGameState, getLegalActions } from "@/engine";
import type { FactionId } from "@/data/factions/types";

afterEach(cleanup);

/**
 * The town panel reads the viewer's faction (for the building list) and the
 * town it controls (for what is built). We seed a real adventure game, then
 * point p1 at the faction whose special building we want to exercise and mark
 * the building built — independent of which faction the seed happened to deal.
 */
function townWith(factionId: FactionId, built: string[]) {
  const state = createAdventureGameState({ seed: "ui-bld", rollFirstPlayer: false });
  state.activePlayerId = "p1";
  state.players.p1.factionId = factionId;
  const town = Object.values(state.towns).find((candidate) => candidate.controllerId === "p1");
  if (!town) {
    throw new Error("p1 should control a town");
  }
  town.factionId = factionId;
  town.buildings = [...built];
  return { state, town };
}

function tileFor(name: string): HTMLElement {
  const tile = screen.getByText(name).closest(".townBuilding");
  if (!(tile instanceof HTMLElement)) {
    throw new Error(`no building tile for ${name}`);
  }
  return tile;
}

function openPanel(buildingName: string): HTMLElement {
  fireEvent.click(within(tileFor(buildingName)).getByRole("button", { name: /Effect|Use/ }));
  return screen.getByLabelText(`${buildingName} effect`);
}

describe("TownPanel — in-place special-building effect / use buttons", () => {
  it("explains Inferno's Brimstone Stormclouds and its stored combat cubes", () => {
    const { state, town } = townWith("inferno", ["inferno.brimstone_stormclouds"]);
    town.factionCubes = { "inferno.brimstone_stormclouds": 2 };
    render(<TownPanel legalActions={getLegalActions(state, "p1")} onAction={vi.fn()} state={state} viewerPlayerId="p1" />);

    const panel = openPanel("Brimstone Stormclouds");
    expect(panel.textContent).toMatch(/\+1 Power/i);
    // Live cube status reflects the two cubes we stored.
    expect(panel.textContent).toMatch(/2 of 3 faction cubes/i);
  });

  it("explains Stronghold's Hall of Valhalla as a once-per-round combat boost", () => {
    const { state } = townWith("stronghold", ["stronghold.hall_of_valhalla"]);
    render(<TownPanel legalActions={getLegalActions(state, "p1")} onAction={vi.fn()} state={state} viewerPlayerId="p1" />);

    const panel = openPanel("Hall of Valhalla");
    expect(panel.textContent).toMatch(/\+1 attack/i);
    expect(panel.textContent).toMatch(/once per round/i);
    expect(panel.textContent).toMatch(/offered in combat/i);
  });

  it("marks Stronghold's Freelancer's Guild as an always-on bonus", () => {
    const { state } = townWith("stronghold", ["stronghold.freelancers_guild"]);
    render(<TownPanel legalActions={getLegalActions(state, "p1")} onAction={vi.fn()} state={state} viewerPlayerId="p1" />);

    const panel = openPanel("Freelancer's Guild");
    // The printed reward is 1 gold; the BINH `freelancers-guild-bounty` option
    // (named in the text) raises the live payout to 2. Resources substitute 1:1.
    expect(panel.textContent).toMatch(/win against Neutral Units, gain 1 gold \(2 with the BINH/i);
    expect(panel.textContent).toMatch(/valuables as gold at 1:1/i);
    expect(panel.textContent).toMatch(/always on/i);
  });

  it("lets the player exploit Castle Gate in place and dispatches its action", () => {
    const { state } = townWith("inferno", ["inferno.castle_gate"]);
    state.players.p1.resources.gold = 10;
    // Exactly one opponent (p2) holds a card, so the random-discard option is
    // offered once and unambiguously.
    for (const candidate of Object.values(state.players)) {
      if (candidate.id !== "p1" && candidate.id !== "neutrals") {
        candidate.hand = candidate.id === "p2" ? ["stat.attack"] : [];
      }
    }
    const onAction = vi.fn();
    render(<TownPanel legalActions={getLegalActions(state, "p1")} onAction={onAction} state={state} viewerPlayerId="p1" />);

    // An available action shows the "Use" affordance, not just "Effect".
    fireEvent.click(within(tileFor("Castle Gate")).getByRole("button", { name: /Use/ }));
    const panel = screen.getByLabelText("Castle Gate effect");
    fireEvent.click(within(panel).getByRole("button", { name: /random discard/i }));

    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction.mock.calls[0][0]).toMatchObject({
      type: "USE_TOWN_BUILDING",
      playerId: "p1",
      buildingId: "inferno.castle_gate"
    });
  });

  it("lets the player choose the City Hall OR bonus in place", () => {
    const { state } = townWith("castle", ["castle.city_hall"]);
    // A resource-round City Hall choice is pending for p1.
    (state as unknown as { pendingChoice: unknown }).pendingChoice = {
      id: "choice_ch",
      type: "OPTION_CHOICE",
      playerId: "p1",
      prompt: "City Hall: choose this round's bonus",
      options: [{ label: "Gain 5 gold" }, { label: "Gain +1 movement point this round" }],
      context: "city-hall",
      returnPhase: "player-turn"
    };
    state.phase = "choice";
    state.priorityPlayerId = "p1";
    const onAction = vi.fn();
    render(<TownPanel legalActions={getLegalActions(state, "p1")} onAction={onAction} state={state} viewerPlayerId="p1" />);

    // With a choice pending the City Hall reads as actionable ("Use"), and
    // opening it shows BOTH options to pick in place.
    fireEvent.click(within(tileFor("City Hall")).getByRole("button", { name: /Use/ }));
    const panel = screen.getByLabelText("City Hall effect");
    fireEvent.click(within(panel).getByRole("button", { name: /Gain 5 gold/i }));

    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction.mock.calls[0][0]).toMatchObject({ type: "CHOOSE_OPTION", playerId: "p1", optionIndex: 0 });
  });

  it("shows the City Hall OR options as plain effect text when no choice is pending", () => {
    const { state } = townWith("inferno", ["inferno.city_hall"]);
    render(<TownPanel legalActions={getLegalActions(state, "p1")} onAction={vi.fn()} state={state} viewerPlayerId="p1" />);

    const panel = openPanel("City Hall");
    // Both OR options are described even outside a Resource round.
    expect(panel.textContent).toMatch(/6 gold/i);
    expect(panel.textContent).toMatch(/3 building materials/i);
    expect(panel.textContent).toMatch(/Resource round/i);
  });

  it("describes Bulwark rune buildings as cap raisers with the house-rule rune gain rates", () => {
    const { state } = townWith("bulwark", ["bulwark.sieidi", "bulwark.altar"]);
    render(<TownPanel legalActions={getLegalActions(state, "p1")} onAction={vi.fn()} state={state} viewerPlayerId="p1" />);

    const sieidi = openPanel("Sieidi of the Runes");
    expect(sieidi.textContent).toMatch(/maximum Rune Level to 2/i);
    expect(sieidi.textContent).toMatch(/Current house rule/i);
    expect(sieidi.textContent).toMatch(/Attack \+1, Retaliate \+1, Defend \+2/i);
    expect(sieidi.textContent).not.toMatch(/starts every combat with 0 Runes/i);

    const altar = openPanel("Altar of the Runes");
    expect(altar.textContent).toMatch(/maximum Rune Level to 3/i);
    expect(altar.textContent).toMatch(/\+3 Initiative/i);
  });

  it("shows Bulwark City Hall's Rune-Empowered Resource-round option in town UI", () => {
    const { state } = townWith("bulwark", ["bulwark.city_hall"]);
    render(<TownPanel legalActions={getLegalActions(state, "p1")} onAction={vi.fn()} state={state} viewerPlayerId="p1" />);

    const panel = openPanel("City Hall");
    expect(panel.textContent).toMatch(/Rune-Empowered/i);
    expect(panel.textContent).toMatch(/\+2 starting Runes/i);
    expect(panel.textContent).toMatch(/until next Resource round/i);
  });

  it("explains the Cove Thieves' Guild and dispatches a chosen deck peek", () => {
    const { state } = townWith("cove", ["cove.thieves_guild"]);
    const onAction = vi.fn();
    render(<TownPanel legalActions={getLegalActions(state, "p1")} onAction={onAction} state={state} viewerPlayerId="p1" />);

    // An available action shows the "Use" affordance.
    fireEvent.click(within(tileFor("Thieves' Guild")).getByRole("button", { name: /Use/ }));
    const panel = screen.getByLabelText("Thieves' Guild effect");
    // The rules text matches the engine (was "No special effect." before wiring).
    expect(panel.textContent).toMatch(/top 2 cards/i);
    expect(panel.textContent).toMatch(/back on top/i);

    // A button is offered per eligible deck; picking your own M&M deck dispatches
    // the THIEVES_GUILD_ACTION for that deck (the deck-name label is stable).
    fireEvent.click(within(panel).getByRole("button", { name: /top 2 of your own Might & Magic deck/i }));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction.mock.calls[0][0]).toMatchObject({
      type: "THIEVES_GUILD_ACTION",
      playerId: "p1",
      buildingId: "cove.thieves_guild",
      target: { kind: "player", ownerId: "p1" }
    });
  });

  it("shows the Cove City Hall and Pub effect text (regression: not 'No special effect.')", () => {
    const { state } = townWith("cove", ["cove.city_hall", "cove.pub"]);
    render(<TownPanel legalActions={getLegalActions(state, "p1")} onAction={vi.fn()} state={state} viewerPlayerId="p1" />);

    const cityHall = openPanel("City Hall");
    expect(cityHall.textContent).toMatch(/Resource round/i);
    expect(cityHall.textContent).not.toMatch(/No special effect/i);

    const pub = openPanel("Pub");
    // Reworded 2026-08-22 with the Pub's timing fix ("any point of your turn",
    // Citadel-gated); the regression this pins is the missing text, not the copy.
    expect(pub.textContent).toMatch(/reinforce cost by 3 gold/i);
    expect(pub.textContent).not.toMatch(/No special effect/i);
  });

  it("redeems the Pub reinforcement directly from the Town menu", () => {
    const { state } = townWith("cove", ["cove.pub", "cove.citadel"]);
    state.players.p1.needsHandRefresh = false;
    state.players.p1.canMulligan = false;
    state.players.p1.resources.gold = 10;
    state.players.p1.army = [{ id: "army_sea_dogs", unitDefId: "cove.sea_dogs", side: "few" }];
    state.players.p1.reinforcementDiscounts = [{
      id: "pub_ui_discount",
      source: "pub",
      sourceName: "Pub",
      allowedTiers: ["bronze", "silver", "gold"],
      flatGoldDiscount: 3,
      requiresReinforceUnlock: true,
      expiresAfterRound: state.round
    }];
    const onAction = vi.fn();
    render(<TownPanel legalActions={getLegalActions(state, "p1")} onAction={onAction} state={state} viewerPlayerId="p1" />);

    fireEvent.click(within(tileFor("Pub")).getByRole("button", { name: /Use/ }));
    const panel = screen.getByLabelText("Pub effect");
    fireEvent.click(within(panel).getByRole("button", { name: /Pub: reinforce Sea Dogs/i }));

    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction.mock.calls[0][0]).toMatchObject({
      type: "REDEEM_REINFORCEMENT_DISCOUNT",
      playerId: "p1",
      discountId: "pub_ui_discount",
      armyUnitId: "army_sea_dogs",
      kind: "reinforce"
    });
  });

  it("explains that Magic University replaces a Spell Search instead of offering a free-standing dig", () => {
    const { state } = townWith("conflux", ["conflux.magic_university"]);
    const onAction = vi.fn();
    render(<TownPanel legalActions={getLegalActions(state, "p1")} onAction={onAction} state={state} viewerPlayerId="p1" />);

    const panel = openPanel("Magic University");
    expect(panel.textContent).toMatch(/when you next Search the shared Spell deck/i);
    expect(within(panel).queryByRole("button", { name: /Magic spell/i })).toBeNull();
    expect(onAction).not.toHaveBeenCalled();
  });

  it("shows the Magic University as spent once used this round (no dig buttons)", () => {
    const { state } = townWith("conflux", ["conflux.magic_university"]);
    state.players.p1.magicUniversityUsedRound = state.round;
    render(<TownPanel legalActions={getLegalActions(state, "p1")} onAction={vi.fn()} state={state} viewerPlayerId="p1" />);

    // No school action is offered, so the tile is a passive "Effect" panel whose
    // status line reports it is spent for the round.
    const panel = openPanel("Magic University");
    expect(within(panel).queryByRole("button", { name: /Magic spell/i })).toBeNull();
    expect(panel.textContent).toMatch(/already used this round/i);
  });

  it("offers no effect button for a plain dwelling", () => {
    const { state } = townWith("castle", ["castle.dwelling_bronze"]);
    render(<TownPanel legalActions={getLegalActions(state, "p1")} onAction={vi.fn()} state={state} viewerPlayerId="p1" />);

    expect(within(tileFor("Towers")).queryByRole("button", { name: /Effect|Use/ })).toBeNull();
  });
});
