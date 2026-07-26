// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { ArmyPanel } from "./screen";
import { CardZoomProvider } from "@/components/table/zoom";
import { coreUnitDefinitions } from "@/data/factions/units";
import { coreFactionDefinitions } from "@/data/factions/core";
import { CREATURE_BANK_UNIT_SIDES } from "@/data/map/creature-banks";
import { createAdventureGameState, type GameState } from "@/engine";

afterEach(cleanup);

function renderArmy(state: GameState) {
  render(
    <CardZoomProvider>
      <ArmyPanel state={state} playerId="p1" />
    </CardZoomProvider>
  );
}

function makeState(unitExperience: boolean, seed: string): GameState {
  const state = createAdventureGameState({
    seed,
    difficulty: "normal",
    rollFirstPlayer: false,
    ruleset: "legacy",
    ...(unitExperience ? { unitExperience: true } : {})
  } as Parameters<typeof createAdventureGameState>[0]);
  // Halberdiers standard path: R3 = 2 stats steps (+Def +Atk), R2 ability
  state.players.p1.army = [{ id: "vets", unitDefId: "castle.halberdiers", side: "few", experience: 10 }];
  return state;
}

describe("ArmyPanel veteran rank badge (unit experience)", () => {
  it("shows rank badge and schedule-folded stats for a rank-3 standard-path unit", () => {
    renderArmy(makeState(true, "rank-badge-on"));
    const badge = document.querySelector(".unitRankBadge.rank-3");
    expect(badge).toBeTruthy();
    const printed = coreUnitDefinitions["castle.halberdiers"]!.few!;
    const stats = document.querySelector(".armyUnitRow small")?.textContent ?? "";
    // R1 stats +1 Def, R3 stats +1 Atk (R2 is ability)
    expect(stats).toContain(`A${printed.attack + 1}`);
    expect(stats).toContain(`D${printed.defense + 1}`);
  });

  it("CONTROL — with the rule off the same card shows printed stats and no badge", () => {
    renderArmy(makeState(false, "rank-badge-off"));
    expect(document.querySelector(".unitRankBadge")).toBeNull();
    expect(document.querySelector(".armyExperienceBoard")).toBeNull();
    const printed = coreUnitDefinitions["castle.halberdiers"]!.few!;
    const stats = document.querySelector(".armyUnitRow small")?.textContent ?? "";
    expect(stats).toContain(`A${printed.attack}`);
    expect(stats).toContain(`D${printed.defense}`);
  });

  it("renders the FULL both-faces card display (same component as the town recruit roster)", () => {
    // User request: the in-game Unit deck should display units the SAME as the
    // town's recruit roster, i.e. the shared UnitSideCards (Few + Pack faces).
    renderArmy(makeState(false, "unit-deck-full-cards"));
    const cards = document.querySelector(".unitSideCards");
    expect(cards, "the Unit deck reuses the town's full card-face display").toBeTruthy();
    // Both printed faces (Few and Pack) are shown, with the owned Few badged.
    expect(document.querySelector(".unitSideCard.few")).toBeTruthy();
    expect(document.querySelector(".unitSideCard.pack")).toBeTruthy();
    expect(document.querySelector(".unitSideCard.few .unitOwnedBadge")).toBeTruthy();
    // The card ART is present (not just the old tiny compact-row thumb).
    expect(document.querySelector(".unitSideCards .recruitThumbImg")).toBeTruthy();
  });

  it("shows the rulebook Stack Token badge on a Stacked bank-reward Few card", () => {
    const state = createAdventureGameState({ seed: "army-stack-token", difficulty: "normal", rollFirstPlayer: false });
    // A Dragon Fly Hive / Griffin Conservatory Stacked reward: the Few card carries
    // a rulebook Stack Token (the actual game "Stacked" unit).
    state.players.p1.army = [{ id: "reward", unitDefId: "fortress.dragon_flies", side: "few", stackToken: "initiative" }];
    renderArmy(state);
    const badge = document.querySelector(".armyStackTokenBadge");
    expect(badge).toBeTruthy();
    expect(badge?.textContent).toBe("+2 INI");
    // It is NOT a Polish layer coin badge.
    expect(document.querySelector(".armyStackBadge")).toBeNull();
  });

  it("CONTROL — a plain Few card shows no Stack Token badge", () => {
    const state = createAdventureGameState({ seed: "army-no-stack-token", difficulty: "normal", rollFirstPlayer: false });
    state.players.p1.army = [{ id: "plain", unitDefId: "fortress.dragon_flies", side: "few" }];
    renderArmy(state);
    expect(document.querySelector(".armyStackTokenBadge")).toBeNull();
  });

  it("opens the Unit Experience Board picker, then a per-unit detail with STATS/ABILITY and Drill", () => {
    const state = makeState(true, "rank-badge-action");
    state.players.p1.army[0].experience = 1;
    state.players.p1.army.push({ id: "champs", unitDefId: "castle.champions", side: "few", experience: 0 });
    const dispatched: unknown[] = [];
    render(
      <CardZoomProvider>
        <ArmyPanel
          state={state}
          playerId="p1"
          legalActions={[{ label: "Drill", action: { type: "DRILL_UNIT", playerId: "p1", armyUnitId: "vets" } }]}
          onAction={(action) => dispatched.push(action)}
        />
      </CardZoomProvider>
    );
    expect(document.querySelector(".armyXpTrack")).toBeTruthy();
    const boardButton = document.querySelector("button.armyExperienceBoard") as HTMLButtonElement;
    expect(boardButton?.textContent).toContain("Unit Experience Board");
    fireEvent.click(boardButton);
    const dialog = document.querySelector(".heroSystemModal.unitXpWindow") as HTMLElement;
    expect(dialog).toBeTruthy();
    expect(dialog.textContent).toContain("Click a unit");
    expect(dialog.textContent).toContain("either stats or one ability");
    // Picker lists army cards — click one to open the large detail panel.
    const pickHalberdiers = dialog.querySelector(
      'button[aria-label="Open Few Halberdiers experience board"]'
    ) as HTMLButtonElement;
    expect(pickHalberdiers).toBeTruthy();
    fireEvent.click(pickHalberdiers);
    expect(dialog.classList.contains("unitXpDetailOpen")).toBe(true);
    const text = dialog.textContent ?? "";
    expect(text).toContain("1 · Seasoned");
    expect(text).toContain("2 · Veteran");
    expect(text).toContain("3 · Elite");
    expect(text).toContain("4 · Legend");
    expect(text).toContain("STATS");
    expect(text).toContain("ABILITY");
    expect(text).toContain("at 3 XP");
    // Halberdiers standard path ability rank (R2) — name + full rules text.
    expect(text).toContain("Thick Hide");
    expect(text).toContain("+1 Defense while this unit is defending");
    fireEvent.click(dialog.querySelector(".armyUnitActions button") as Element);
    expect(dispatched[0]).toEqual({ type: "DRILL_UNIT", playerId: "p1", armyUnitId: "vets" });
  });
});

// p1 defaults to Castle in createAdventureGameState.
const CASTLE_ROSTER_SIZE = coreFactionDefinitions.castle!.units.length;

describe("ArmyPanel — full faction roster (owned + unowned) with costs", () => {
  it("renders the WHOLE Castle roster — an unowned unit shows its cards + recruit cost + 'not recruited'", () => {
    // Own only Halberdiers Few; the other Castle units must still appear (user
    // request: "show all units even not available").
    renderArmy(makeState(false, "roster-full"));
    // One owned unit → the rest of the roster renders as unowned placeholders.
    expect(document.querySelectorAll(".armyRosterUnowned").length).toBe(CASTLE_ROSTER_SIZE - 1);
    // A NOT-recruited unit (Champions) shows its full card faces, dimmed…
    const champs = document.querySelector('[aria-label="Champions Few and Pack cards"]');
    expect(champs, "an unowned faction unit still shows its cards").toBeTruthy();
    expect(champs?.querySelector(".unitSideCard.unowned")).toBeTruthy();
    // …with its printed Few RECRUIT cost visible on the card…
    expect(
      document.querySelector('[aria-label^="Few recruit cost for Champions"]'),
      "unowned unit shows its recruit cost"
    ).toBeTruthy();
    // …and an explicit not-in-deck state line.
    expect(
      [...document.querySelectorAll(".armyRosterState")].some((el) => el.textContent === "not recruited")
    ).toBe(true);
  });

  it("an OWNED unit now carries its cost line on the cards too", () => {
    // Costs used to be omitted in the deck view; the user asked to "show cost to
    // recruit or reinforce too", so owned cards now display printed costs.
    renderArmy(makeState(false, "roster-owned-cost"));
    const halb = document.querySelector('[aria-label="Halberdiers Few and Pack cards"]');
    expect(halb).toBeTruthy();
    // The owned Few side stays badged AND now shows a cost line.
    expect(halb?.querySelector(".unitSideCard.few.owned .unitOwnedBadge")).toBeTruthy();
    expect(halb?.querySelector(".unitCost"), "owned unit shows a cost line").toBeTruthy();
    expect(document.querySelector('[aria-label^="Few recruit cost for Halberdiers"]')).toBeTruthy();
  });

  it("an empty army still lists the full unowned roster + the starting-units note", () => {
    const state = makeState(false, "roster-empty");
    state.players.p1.army = [];
    renderArmy(state);
    expect(document.querySelectorAll(".armyRosterUnowned").length).toBe(CASTLE_ROSTER_SIZE);
    expect(document.querySelector(".armyEmptyNote")?.textContent).toContain("starting units return");
    // No Unit Experience Board button when the deck is empty.
    expect(document.querySelector(".armyExperienceBoard")).toBeNull();
  });

  it("CONTROL — a recruited Neutral keeps its single-face owned row, outside the faction roster", () => {
    const state = makeState(false, "roster-neutral");
    // A recruited Neutral (no Few/Pack faces) is not part of faction.units.
    state.players.p1.army = [{ id: "boar", unitDefId: "neutral.boars", side: "neutral" }];
    renderArmy(state);
    // The whole Castle roster still shows as unowned…
    expect(document.querySelectorAll(".armyRosterUnowned").length).toBe(CASTLE_ROSTER_SIZE);
    // …and the Neutral appears as an owned row with its single-face thumb,
    // exactly as before (no Few/Pack card faces for a Neutral).
    const boarRow = [...document.querySelectorAll(".armyUnitRow")].find((el) => el.textContent?.includes("Boars"));
    expect(boarRow, "the recruited Neutral still renders").toBeTruthy();
    expect(boarRow?.querySelector(".armyUnitThumb")).toBeTruthy();
    // The Neutral is NOT rendered as an unowned roster placeholder.
    expect(
      [...document.querySelectorAll(".armyRosterUnowned")].some((el) => el.textContent?.includes("Boars"))
    ).toBe(false);
  });

  it("a won Creature Bank card shows its OWN bank face, the Stack Token fold, and no veteran track", () => {
    // The Dragon Fly Hive / Griffin Conservatory reward is a dedicated bank card
    // (`side: "bank"`), not the faction/Neutral card of the same name. The panel
    // must read it off CREATURE_BANK_UNIT_SIDES and fold its rulebook Stack
    // Token, or it shows numbers the engine will not fight with.
    const state = makeState(true, "roster-bank-card");
    state.players.p1.army = [
      { id: "bank1", unitDefId: "neutral.griffins", side: "bank", stackToken: "attack", experience: 14 }
    ];
    renderArmy(state);

    const row = [...document.querySelectorAll(".armyUnitRow")].find((el) => el.textContent?.includes("Griffins"));
    expect(row, "the won bank card renders as an owned row").toBeTruthy();
    expect(row?.textContent).toContain("Creature Bank");
    const bankSide = CREATURE_BANK_UNIT_SIDES["neutral.griffins"]!;
    const stats = row?.querySelector("small")?.textContent ?? "";
    // Bank face + the +1 Attack Stack Token; every other stat is the bank face.
    expect(stats).toContain(`A${bankSide.attack + 1}`);
    expect(stats).toContain(`D${bankSide.defense}`);
    // Tierless printed bank card: no veteran badge even carrying max XP with the
    // rule ON (the engine zeroes a bank face's experience).
    expect(row?.querySelector(".unitRankBadge"), "no veteran rank on a bank face").toBeNull();
    // A bank face has no Few/Pack sides, so the row keeps the single-face thumb
    // instead of the both-faces card block.
    expect(row?.querySelector(".armyUnitThumb"), "single bank face thumb").toBeTruthy();
    // …and it does NOT consume the faction's own Griffins roster slot: the
    // Castle card is still listed as un-recruited (the display twin of the
    // engine's `side !== "bank"` ownership reads).
    expect(
      [...document.querySelectorAll(".armyRosterUnowned")].some((el) => el.textContent?.includes("Griffins")),
      "the faction Griffins card is still recruitable"
    ).toBe(true);

    // CONTROL: the SAME creature as a recruited Neutral shows the Neutral face's
    // own (different) stats and the veteran badge its XP earns.
    cleanup();
    const control = makeState(true, "roster-bank-control");
    control.players.p1.army = [
      { id: "neutral1", unitDefId: "neutral.griffins", side: "neutral", experience: 14 }
    ];
    renderArmy(control);
    const controlRow = [...document.querySelectorAll(".armyUnitRow")].find((el) =>
      el.textContent?.includes("Griffins")
    );
    expect(controlRow?.textContent).toContain("Neutral");
    expect(controlRow?.querySelector(".unitRankBadge"), "a Neutral card DOES rank").toBeTruthy();
  });
});
