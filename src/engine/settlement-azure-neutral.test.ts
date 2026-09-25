import { describe, expect, it } from "vitest";
import { azureNeutralCounterpartId, neutralUnitIdsByFaction } from "@/data/factions/core";
import { coreUnitDefinitions } from "@/data/factions/units";
import { applyAction, createAdventureGameState, getLegalActions } from "./index";
import { flagField, playerCanRecruitFewNow, playerRecruitUnitIds, playerRecruitUnitSide } from "./adventure";
import type { GameAction, GameState, MapFieldState } from "./state";

// USER RULE 2026-09-11 (BINH `settlement-neutral-recruitment`): a Settlement
// owner who has built a Gold Dwelling may ALSO buy the Settlement faction's
// azure signature Neutral card (Gold Dragons / Titans / Hydras / Phoenixes).

function ready(): GameState {
  let state = createAdventureGameState({
    seed: "settlement-azure-neutral", rollFirstPlayer: false, events: false,
    houseRules: { "settlement-neutral-recruitment": true },
  });
  if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
    state = ok(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
  }
  state.players.p1.army = [];
  state.players.p1.resources = { gold: 10000, buildingMaterials: 10000, valuables: 10000 };
  return state;
}

function ok(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors.map((error) => error.message)).toEqual([]);
  return result.state;
}

function town(state: GameState) {
  return Object.values(state.towns).find((candidate) => candidate.controllerId === "p1")!;
}

function settlement(state: GameState, faction: string): MapFieldState {
  const field: MapFieldState = {
    spaceId: "azure-settlement", tileInstanceId: "test", slot: 0, location: "settlement",
    blackCube: false, flagOwnerId: null, everFlagged: false, settlementResource: null, faction,
  };
  state.adventure!.fields[field.spaceId] = field;
  return field;
}

describe("azureNeutralCounterpartId", () => {
  it("maps the five signature creatures by name and nothing else", () => {
    expect(azureNeutralCounterpartId("rampart")).toBe("neutral.gold_dragons");
    expect(azureNeutralCounterpartId("tower")).toBe("neutral.titans");
    expect(azureNeutralCounterpartId("fortress")).toBe("neutral.hydras");
    expect(azureNeutralCounterpartId("conflux")).toBe("neutral.phoenixes");
    expect(azureNeutralCounterpartId("forge")).toBe("neutral.cyberbrutes");
    for (const faction of ["castle", "dungeon", "necropolis", "inferno", "stronghold", "cove", "bulwark", "factory"]) {
      expect(azureNeutralCounterpartId(faction)).toBeUndefined();
    }
    expect(azureNeutralCounterpartId("no-such-faction")).toBeUndefined();
    // The same-tier list still deliberately omits the azure card.
    expect(neutralUnitIdsByFaction.tower).not.toContain("neutral.titans");
  });
});

describe("BINH settlement Neutral recruitment — azure signature creature", () => {
  it("sells the Settlement faction's azure card only once a Gold Dwelling is built", () => {
    let state = ready();
    const t = town(state);
    t.buildings = [`${t.factionId}.dwelling_bronze`, `${t.factionId}.dwelling_silver`];
    const field = settlement(state, "tower");
    flagField(state, "p1", field);
    expect(field.settlementRecruitFactionId).toBe("tower");

    // CONTROL: no Gold Dwelling → the ordinary Tower neutrals, never Titans.
    expect(playerRecruitUnitIds(state, "p1")).toEqual(expect.arrayContaining(neutralUnitIdsByFaction.tower));
    expect(playerRecruitUnitIds(state, "p1")).not.toContain("neutral.titans");
    expect(playerCanRecruitFewNow(state, "p1", "neutral.titans")).toBe(false);
    expect(getLegalActions(state, "p1").some((offer) =>
      offer.action.type === "POPULATION_ACTION" &&
      offer.action.purchases.some((purchase) => purchase.kind === "recruit" && purchase.unitDefId === "neutral.titans")
    )).toBe(false);

    // Gold Dwelling built → Titans join the Settlement shop on the Neutral side.
    t.buildings.push(`${t.factionId}.dwelling_gold`);
    expect(playerRecruitUnitIds(state, "p1")).toContain("neutral.titans");
    expect(playerRecruitUnitSide(state, "p1", "neutral.titans")).toBe("neutral");
    expect(playerCanRecruitFewNow(state, "p1", "neutral.titans")).toBe(true);
    // The player's OWN roster is untouched: Tower's Few/Pack Titans stay out.
    expect(playerRecruitUnitIds(state, "p1")).not.toContain("tower.titans");

    const azureDeck = Object.values(state.decks).find((deck) => deck.drawPile.includes("neutral.titans"))!;
    const deckBefore = azureDeck.drawPile.filter((id) => id === "neutral.titans").length;
    expect(deckBefore).toBeGreaterThan(0);
    const beforeGold = state.players.p1.resources.gold;
    const printed = coreUnitDefinitions["neutral.titans"]!.neutral!.cost;
    state = ok(state, { type: "POPULATION_ACTION", playerId: "p1", purchases: [{ kind: "recruit", unitDefId: "neutral.titans" }] });
    expect(state.players.p1.army.at(-1)).toMatchObject({ unitDefId: "neutral.titans", side: "neutral" });
    expect(state.players.p1.resources.gold).toBe(beforeGold - (printed.gold ?? 0));
    // The copy left the azure Neutral deck, exactly like every other Neutral recruit.
    expect(state.decks[azureDeck.id].drawPile.filter((id) => id === "neutral.titans").length).toBe(deckBefore - 1);
    // Single-sided: it can never be reinforced, and a second copy is refused.
    expect(playerCanRecruitFewNow(state, "p1", "neutral.titans")).toBe(false);
  });

  it("offers nothing extra for a Settlement whose faction has no azure printing", () => {
    const state = ready();
    const t = town(state);
    t.buildings = [`${t.factionId}.dwelling_bronze`, `${t.factionId}.dwelling_silver`, `${t.factionId}.dwelling_gold`];
    const field = settlement(state, "dungeon");
    flagField(state, "p1", field);
    const ids = playerRecruitUnitIds(state, "p1");
    expect(ids).toEqual(expect.arrayContaining(neutralUnitIdsByFaction.dungeon));
    for (const id of ids) {
      expect(coreUnitDefinitions[id]?.tier).not.toBe("azure");
    }
  });

  it("stays off while the house rule is off", () => {
    const state = ready();
    state.adventure!.houseRules!["settlement-neutral-recruitment"] = false;
    const t = town(state);
    t.buildings = [`${t.factionId}.dwelling_gold`];
    const field = settlement(state, "tower");
    flagField(state, "p1", field);
    expect(playerRecruitUnitIds(state, "p1")).not.toContain("neutral.titans");
  });
});

// v178: Bulwark/Factory/Forge print their Neutral side under the Few/Pack id,
// so an own-faction Settlement lists the owner's roster ids as Neutral cards.
describe("expansion faction owning its own Settlement", () => {
  function forgeReady(): GameState {
    const state = ready();
    state.players.p1.factionId = "forge";
    const t = town(state);
    t.factionId = "forge";
    t.buildings = [];
    const field = settlement(state, "forge");
    flagField(state, "p1", field);
    expect(field.settlementRecruitFactionId).toBe("forge");
    return state;
  }

  it("recruits the Few card at its own built Dwelling, the Neutral card otherwise", () => {
    const state = forgeReady();
    expect(neutralUnitIdsByFaction.forge).toContain("forge.grunts");
    // CONTROL: no bronze Dwelling → only the Settlement's Neutral card is on offer.
    expect(playerRecruitUnitSide(state, "p1", "forge.grunts")).toBe("neutral");
    town(state).buildings.push("forge.dwelling_bronze");
    expect(playerRecruitUnitSide(state, "p1", "forge.grunts")).toBe("few");
  });

  it("treats an owned Neutral-side card and the Few card as different cards", () => {
    const state = forgeReady();
    town(state).buildings.push("forge.dwelling_bronze");
    state.players.p1.army = [{ id: "army_neutral_grunts", unitDefId: "forge.grunts", side: "neutral" }];
    expect(playerCanRecruitFewNow(state, "p1", "forge.grunts")).toBe(true);
    // CONTROL: owning the Few card still blocks a second Few (no copy rule).
    state.players.p1.army = [{ id: "army_few_grunts", unitDefId: "forge.grunts", side: "few" }];
    expect(playerCanRecruitFewNow(state, "p1", "forge.grunts")).toBe(false);
  });
});
