import { describe, expect, it } from "vitest";
import { createAdventureGameState, type GameState, type HouseRuleId } from "./index";
import { getMainHero, getTownOfPlayer, hasRecruitResources, spendRecruitResources } from "./adventure";
import { startNeutralEncounter } from "./adventure-reducer";

// ---------------------------------------------------------------------------
// Freelancer's Guild — PRINTED + HOUSE RULES
//   1. Printed bounty is 1 gold; the BINH option raises it to 2.
//   2. Recruiting/Reinforcing may pay a gold shortfall with building materials
//      and valuables at the printed 1:1 rate.
// ---------------------------------------------------------------------------

function makeGame(houseRules?: Partial<Record<HouseRuleId, boolean>>): GameState {
  const state = createAdventureGameState({ seed: "freelancers-guild", rollFirstPlayer: false, houseRules });
  for (const player of Object.values(state.players)) {
    player.canMulligan = false;
    player.needsHandRefresh = false;
  }
  return state;
}

function giveGuild(state: GameState): void {
  getTownOfPlayer(state, "p1")!.buildings.push("stronghold.freelancers_guild");
}

describe("Freelancer's Guild — neutral-win bounty", () => {
  it("BINH option pays 2 gold when a hero wins a neutral fight (Quick Combat)", () => {
    const state = makeGame();
    giveGuild(state);
    const hero = getMainHero(state, "p1")!;
    hero.level = 2; // beats a difficulty-1 field → Quick Combat win
    hero.spaceId = "test-field";
    state.adventure!.fields["test-field"] = {
      spaceId: "test-field",
      tileInstanceId: "t",
      slot: 0,
      location: "mine",
      difficulty: 1,
      blackCube: false,
      flagOwnerId: null,
      everFlagged: false,
      settlementResource: null
    };
    const goldBefore = state.players.p1.resources.gold;

    startNeutralEncounter(state, hero, state.adventure!.fields["test-field"]);

    // The buffed bounty is exactly +2 gold (the win itself, not the field reward).
    expect(state.players.p1.resources.gold).toBe(goldBefore + 2);
    expect(state.eventLog.some((event) => event.type === "QUICK_COMBAT_WON")).toBe(true);
  });

  it("option OFF pays the 1 gold printed on the board", () => {
    const state = makeGame({ "freelancers-guild-bounty": false });
    giveGuild(state);
    const hero = getMainHero(state, "p1")!;
    hero.level = 2;
    hero.spaceId = "test-field";
    state.adventure!.fields["test-field"] = {
      spaceId: "test-field",
      tileInstanceId: "t",
      slot: 0,
      location: "mine",
      difficulty: 1,
      blackCube: false,
      flagOwnerId: null,
      everFlagged: false,
      settlementResource: null
    };
    const goldBefore = state.players.p1.resources.gold;

    startNeutralEncounter(state, hero, state.adventure!.fields["test-field"]);

    expect(state.players.p1.resources.gold).toBe(goldBefore + 1);
  });

  it("CONTROL: no gold without the Guild", () => {
    const state = makeGame();
    const hero = getMainHero(state, "p1")!;
    hero.level = 2;
    hero.spaceId = "test-field";
    state.adventure!.fields["test-field"] = {
      spaceId: "test-field",
      tileInstanceId: "t",
      slot: 0,
      location: "mine",
      difficulty: 1,
      blackCube: false,
      flagOwnerId: null,
      everFlagged: false,
      settlementResource: null
    };
    const goldBefore = state.players.p1.resources.gold;

    startNeutralEncounter(state, hero, state.adventure!.fields["test-field"]);

    expect(state.players.p1.resources.gold).toBe(goldBefore);
  });
});

describe("Freelancer's Guild — 1:1 resource-for-gold payment", () => {
  it("spends three valuables to cover a 3-gold cost", () => {
    const state = makeGame();
    giveGuild(state);
    state.players.p1.resources = { gold: 0, buildingMaterials: 0, valuables: 3 };

    expect(hasRecruitResources(state, "p1", { gold: 3 })).toBe(true);
    spendRecruitResources(state, "p1", { gold: 3 }, "test recruit");
    expect(state.players.p1.resources.valuables).toBe(0);
    expect(state.players.p1.resources.gold).toBe(0);
  });

  it("uses the chosen resource first and the other only for the remainder", () => {
    const state = makeGame();
    giveGuild(state);
    state.players.p1.resources = { gold: 0, buildingMaterials: 3, valuables: 3 };

    spendRecruitResources(state, "p1", { gold: 4 }, "test recruit", "valuables-first");
    expect(state.players.p1.resources.valuables).toBe(0);
    expect(state.players.p1.resources.buildingMaterials).toBe(2);
    expect(state.players.p1.resources.gold).toBe(0);
  });

  it("materials still pay 1:1 (1 material = 1 gold)", () => {
    const state = makeGame();
    giveGuild(state);
    state.players.p1.resources = { gold: 0, buildingMaterials: 3, valuables: 0 };

    expect(hasRecruitResources(state, "p1", { gold: 3 })).toBe(true);
    spendRecruitResources(state, "p1", { gold: 3 }, "test recruit");
    expect(state.players.p1.resources.buildingMaterials).toBe(0);
  });

  it("one valuable covers exactly one missing gold and cannot overpay", () => {
    const state = makeGame();
    giveGuild(state);
    state.players.p1.resources = { gold: 0, buildingMaterials: 0, valuables: 1 };

    expect(hasRecruitResources(state, "p1", { gold: 2 })).toBe(false);
    expect(hasRecruitResources(state, "p1", { gold: 1 })).toBe(true);
  });

  it("stays unaffordable when the market value falls short", () => {
    const state = makeGame();
    giveGuild(state);
    // One valuable is one gold, so it cannot cover a 4-gold cost.
    state.players.p1.resources = { gold: 0, buildingMaterials: 0, valuables: 1 };

    expect(hasRecruitResources(state, "p1", { gold: 4 })).toBe(false);
  });

  it("CONTROL: without the Guild, resources never substitute for gold", () => {
    const state = makeGame();
    state.players.p1.resources = { gold: 0, buildingMaterials: 9, valuables: 9 };

    expect(hasRecruitResources(state, "p1", { gold: 3 })).toBe(false);
  });
});
