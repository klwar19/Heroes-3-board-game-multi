import { describe, expect, it } from "vitest";
import { createAdventureGameState, type GameState } from "./index";
import { getMainHero, getTownOfPlayer, hasRecruitResources, spendRecruitResources } from "./adventure";
import { startNeutralEncounter } from "./adventure-reducer";

// ---------------------------------------------------------------------------
// Freelancer's Guild — HOUSE RULES
//   1. Winning against Neutral Units pays 2 gold (was 1).
//   2. Recruiting/Reinforcing may pay the gold cost with building materials and
//      valuables at MARKET rates: 1 material = 1 gold, 1 valuables = 3 gold.
// ---------------------------------------------------------------------------

function makeGame(): GameState {
  const state = createAdventureGameState({ seed: "freelancers-guild", rollFirstPlayer: false });
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
  it("pays 2 gold when a hero wins a neutral fight (Quick Combat)", () => {
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

describe("Freelancer's Guild — market-rate resource-for-gold payment", () => {
  it("spends ONE valuables to cover a 3-gold cost (1 valuables = 3 gold)", () => {
    const state = makeGame();
    giveGuild(state);
    state.players.p1.resources = { gold: 0, buildingMaterials: 0, valuables: 1 };

    // Under the OLD 1:1 rule a single valuables covers only 1 gold, so a 3-gold
    // cost would be UNAFFORDABLE. At market rate one valuables covers all 3.
    expect(hasRecruitResources(state, "p1", { gold: 3 })).toBe(true);
    spendRecruitResources(state, "p1", { gold: 3 }, "test recruit");
    expect(state.players.p1.resources.valuables).toBe(0);
    expect(state.players.p1.resources.gold).toBe(0);
  });

  it("settles the exact remainder with materials before overshooting a valuables lot", () => {
    const state = makeGame();
    giveGuild(state);
    // 4-gold cost, no gold: one valuables lot (3) + one material (1) = exact.
    state.players.p1.resources = { gold: 0, buildingMaterials: 5, valuables: 2 };

    expect(hasRecruitResources(state, "p1", { gold: 4 })).toBe(true);
    spendRecruitResources(state, "p1", { gold: 4 }, "test recruit");
    expect(state.players.p1.resources.valuables).toBe(1); // 2 → 1 (one lot spent)
    expect(state.players.p1.resources.buildingMaterials).toBe(4); // 5 → 4 (exact remainder)
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

  it("a valuables lot may overshoot the last gold, market-style", () => {
    const state = makeGame();
    giveGuild(state);
    // 2-gold cost, only a valuables (worth 3) to pay with: the lot overshoots.
    state.players.p1.resources = { gold: 0, buildingMaterials: 0, valuables: 1 };

    expect(hasRecruitResources(state, "p1", { gold: 2 })).toBe(true);
    spendRecruitResources(state, "p1", { gold: 2 }, "test recruit");
    expect(state.players.p1.resources.valuables).toBe(0);
  });

  it("stays unaffordable when the market value falls short", () => {
    const state = makeGame();
    giveGuild(state);
    // 1 valuables (3 gold) cannot cover a 4-gold cost with no materials/gold.
    state.players.p1.resources = { gold: 0, buildingMaterials: 0, valuables: 1 };

    expect(hasRecruitResources(state, "p1", { gold: 4 })).toBe(false);
  });

  it("CONTROL: without the Guild, resources never substitute for gold", () => {
    const state = makeGame();
    state.players.p1.resources = { gold: 0, buildingMaterials: 9, valuables: 9 };

    expect(hasRecruitResources(state, "p1", { gold: 3 })).toBe(false);
  });
});
