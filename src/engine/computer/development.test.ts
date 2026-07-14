import { describe, expect, it } from "vitest";
import { coreBuildingDefinitions, coreFactionDefinitions } from "@/data/factions/core";
import type { TownBuildingEffect } from "@/data/factions/types";
import { createAdventureGameState } from "../adventure-setup";
import type { GameAction, GameState, PlayerVisibleState } from "../state";
import { scoreCardAction } from "./card-policy";
import {
  armyDevelopmentProfile,
  developmentResourceTargets,
} from "./development";
import { resourceDeficits, scoreMapAction } from "./map-policy";
import { observeForComputer } from "./observation";
import { chooseComputerAction } from "./policy";
import type { ComputerObservation } from "./types";

function game(): GameState {
  return createAdventureGameState({
    seed: "computer-development",
    scenarioId: "skirmish",
    playerCount: 2,
    events: false,
    rollFirstPlayer: false,
  });
}

function observation(state: GameState): ComputerObservation {
  return {
    playerId: "p2",
    state: state as unknown as PlayerVisibleState,
    legalActions: [],
  };
}

function buildingWith(
  state: GameState,
  predicate: (effect: TownBuildingEffect) => boolean,
): string {
  const factionId = state.players.p2.factionId!;
  const buildingId = coreFactionDefinitions[factionId].buildings.find((id) => {
    const effect = coreBuildingDefinitions[id]?.effect;
    return effect ? predicate(effect) : false;
  });
  if (!buildingId) throw new Error("fixture faction is missing a required building");
  return buildingId;
}

function establishPacks(state: GameState): void {
  for (const unit of state.players.p2.army) unit.side = "pack";
}

describe("computer long-horizon development plan", () => {
  it("chooses the real legal sequence: reinforcement unlock, Packs, Silver, then Gold", () => {
    const state = game();
    state.phase = "player-turn";
    state.activePlayerId = "p2";
    state.priorityPlayerId = "p2";
    state.players.p2.canMulligan = false;
    state.players.p2.needsHandRefresh = false;
    state.players.p2.resources = {
      gold: 99,
      buildingMaterials: 99,
      valuables: 99,
    };
    const citadel = buildingWith(
      state,
      (effect) => effect.type === "UNLOCK_REINFORCE",
    );
    const bronze = buildingWith(
      state,
      (effect) =>
        effect.type === "UNLOCK_RECRUIT_TIER" && effect.tier === "bronze",
    );
    const silver = buildingWith(
      state,
      (effect) =>
        effect.type === "UNLOCK_RECRUIT_TIER" && effect.tier === "silver",
    );
    const gold = buildingWith(
      state,
      (effect) =>
        effect.type === "UNLOCK_RECRUIT_TIER" && effect.tier === "gold",
    );
    const town = Object.values(state.towns).find(
      (candidate) => candidate.controllerId === "p2",
    )!;

    town.buildings = [];
    const unlock = chooseComputerAction(observeForComputer(state, "p2"));
    expect(unlock?.action).toMatchObject({
      type: "BUILD_STRUCTURE",
      buildingId: citadel,
    });

    town.buildings = [citadel, bronze];
    const pack = chooseComputerAction(observeForComputer(state, "p2"));
    expect(pack?.action.type).toBe("POPULATION_ACTION");
    const packAction = pack?.action as
      | Extract<GameAction, { type: "POPULATION_ACTION" }>
      | undefined;
    expect(packAction?.purchases[0]?.kind).toBe("reinforce");

    establishPacks(state);
    const unlockSilver = chooseComputerAction(observeForComputer(state, "p2"));
    expect(unlockSilver?.action).toMatchObject({
      type: "BUILD_STRUCTURE",
      buildingId: silver,
    });

    town.buildings.push(silver);
    const unlockGold = chooseComputerAction(observeForComputer(state, "p2"));
    expect(unlockGold?.action).toMatchObject({
      type: "BUILD_STRUCTURE",
      buildingId: gold,
    });
  });

  it("prioritizes reinforcing the three-unit core above an ordinary map march", () => {
    const state = game();
    const citadel = buildingWith(state, (effect) => effect.type === "UNLOCK_REINFORCE");
    const bronze = buildingWith(
      state,
      (effect) => effect.type === "UNLOCK_RECRUIT_TIER" && effect.tier === "bronze",
    );
    const town = Object.values(state.towns).find((candidate) => candidate.controllerId === "p2")!;
    town.buildings = [citadel, bronze];
    const unit = state.players.p2.army[0];
    const score = scoreMapAction(observation(state), {
      type: "POPULATION_ACTION",
      playerId: "p2",
      purchases: [
        {
          kind: "reinforce",
          unitDefId: unit.unitDefId,
          armyUnitId: unit.id,
        },
      ],
    });
    expect(score?.score).toBeGreaterThan(900);
    expect(score?.policy).toBe("map.recruit-army");
  });

  it("dwelling-first: a side build that would eat the Silver fund waits", () => {
    const state = game();
    establishPacks(state);
    const citadel = buildingWith(state, (effect) => effect.type === "UNLOCK_REINFORCE");
    const bronze = buildingWith(
      state,
      (effect) => effect.type === "UNLOCK_RECRUIT_TIER" && effect.tier === "bronze",
    );
    const town = Object.values(state.towns).find((candidate) => candidate.controllerId === "p2")!;
    town.buildings = [citadel, bronze];
    expect(armyDevelopmentProfile(state, "p2").phase).toBe("unlock-silver");

    const side = buildingWith(
      state,
      (effect) =>
        effect.type === "MAGE_GUILD" ||
        effect.type === "RESOURCE_ROUND_CHOICE" ||
        effect.type === "RESOURCE_ROUND_SEARCH_DISCARD",
    );
    const sideCost = coreBuildingDefinitions[side].cost ?? {};
    expect(
      (sideCost.gold ?? 0) +
        (sideCost.buildingMaterials ?? 0) +
        (sideCost.valuables ?? 0),
      "fixture side building must actually cost something",
    ).toBeGreaterThan(0);
    const target = developmentResourceTargets(state, "p2");
    // Treasury EXACTLY covers the dwelling plan — any side spend breaks it.
    state.players.p2.resources = {
      gold: target.gold,
      buildingMaterials: target.buildingMaterials,
      valuables: target.valuables,
    };
    const buildSide: GameAction = {
      type: "BUILD_STRUCTURE",
      playerId: "p2",
      townId: town.id,
      buildingId: side,
    } as GameAction;
    const starved = scoreMapAction(observation(state), buildSide);
    expect(starved!.score).toBeLessThanOrEqual(280);

    // CONTROL: genuine surplus (fund + the side cost) keeps the build allowed.
    state.players.p2.resources = {
      gold: target.gold + (sideCost.gold ?? 0),
      buildingMaterials: target.buildingMaterials + (sideCost.buildingMaterials ?? 0),
      valuables: target.valuables + (sideCost.valuables ?? 0),
    };
    const flush = scoreMapAction(observation(state), buildSide);
    expect(flush!.score).toBeGreaterThan(700);
  });

  it("buys spells only with Wisdom in hand or surplus gold (army funds first)", () => {
    const state = game();
    establishPacks(state);
    const town = Object.values(state.towns).find((candidate) => candidate.controllerId === "p2")!;
    town.buildings = [
      buildingWith(state, (effect) => effect.type === "UNLOCK_REINFORCE"),
      buildingWith(
        state,
        (effect) => effect.type === "UNLOCK_RECRUIT_TIER" && effect.tier === "bronze",
      ),
      buildingWith(
        state,
        (effect) => effect.type === "UNLOCK_RECRUIT_TIER" && effect.tier === "silver",
      ),
      buildingWith(
        state,
        (effect) => effect.type === "UNLOCK_RECRUIT_TIER" && effect.tier === "gold",
      ),
    ];
    expect(armyDevelopmentProfile(state, "p2").phase).toBe("improve-army");
    const target = developmentResourceTargets(state, "p2");
    const buySpells: GameAction = {
      type: "SPELL_BOOK_ACTION",
      playerId: "p2",
    } as GameAction;

    // Gold at the development target, no Wisdom — the purchase waits.
    state.players.p2.resources = {
      gold: target.gold,
      buildingMaterials: 1,
      valuables: 0,
    };
    state.players.p2.hand = [];
    const tight = scoreMapAction(observation(state), buySpells);
    expect(tight?.policy).toBe("town.skip-spell-buy-fund-army");
    expect(tight!.score).toBeLessThan(300);

    // CONTROL: surplus gold funds the Spell Book.
    state.players.p2.resources.gold = target.gold + 4;
    const flush = scoreMapAction(observation(state), buySpells);
    expect(flush?.policy).toBe("town.buy-spells-after-army-core");
    expect(flush!.score).toBe(620);

    // CONTROL: Wisdom rides along (cheaper buy, bigger Search) — worth it even
    // on a tight budget.
    state.players.p2.resources.gold = target.gold;
    state.players.p2.hand = ["ability.wisdom"];
    const wise = scoreMapAction(observation(state), buySpells);
    expect(wise?.policy).toBe("town.buy-spells-after-army-core");
    expect(wise!.score).toBe(620);
  });

  it("unlocks Silver after three Packs, then Gold after Silver", () => {
    const state = game();
    establishPacks(state);
    const citadel = buildingWith(state, (effect) => effect.type === "UNLOCK_REINFORCE");
    const bronze = buildingWith(
      state,
      (effect) => effect.type === "UNLOCK_RECRUIT_TIER" && effect.tier === "bronze",
    );
    const silver = buildingWith(
      state,
      (effect) => effect.type === "UNLOCK_RECRUIT_TIER" && effect.tier === "silver",
    );
    const gold = buildingWith(
      state,
      (effect) => effect.type === "UNLOCK_RECRUIT_TIER" && effect.tier === "gold",
    );
    const town = Object.values(state.towns).find((candidate) => candidate.controllerId === "p2")!;
    town.buildings = [citadel, bronze];

    expect(armyDevelopmentProfile(state, "p2").phase).toBe("unlock-silver");
    const silverScore = scoreMapAction(observation(state), {
      type: "BUILD_STRUCTURE",
      playerId: "p2",
      townId: town.id,
      buildingId: silver,
    });
    expect(silverScore?.score).toBe(955);

    town.buildings.push(silver);
    expect(armyDevelopmentProfile(state, "p2").phase).toBe("unlock-gold");
    const goldScore = scoreMapAction(observation(state), {
      type: "BUILD_STRUCTURE",
      playerId: "p2",
      townId: town.id,
      buildingId: gold,
    });
    expect(goldScore?.score).toBe(950);
  });

  it("saves the exact materials and valuables required by the next dwelling", () => {
    const state = game();
    establishPacks(state);
    const citadel = buildingWith(state, (effect) => effect.type === "UNLOCK_REINFORCE");
    const bronze = buildingWith(
      state,
      (effect) => effect.type === "UNLOCK_RECRUIT_TIER" && effect.tier === "bronze",
    );
    const town = Object.values(state.towns).find((candidate) => candidate.controllerId === "p2")!;
    town.buildings = [citadel, bronze];
    const target = developmentResourceTargets(state, "p2");
    state.players.p2.resources = {
      gold: target.gold,
      buildingMaterials: Math.max(0, target.buildingMaterials - 1),
      valuables: target.valuables,
    };
    const deficit = resourceDeficits(state, "p2");
    expect(deficit.buildingMaterials).toBe(1);
    expect(deficit.valuables).toBe(0);
  });

  it("plays a resource card before moving when it completes the next build fund", () => {
    const state = game();
    establishPacks(state);
    const citadel = buildingWith(state, (effect) => effect.type === "UNLOCK_REINFORCE");
    const bronze = buildingWith(
      state,
      (effect) => effect.type === "UNLOCK_RECRUIT_TIER" && effect.tier === "bronze",
    );
    const town = Object.values(state.towns).find((candidate) => candidate.controllerId === "p2")!;
    town.buildings = [citadel, bronze];
    const target = developmentResourceTargets(state, "p2");
    state.players.p2.resources = {
      gold: target.gold,
      buildingMaterials: Math.max(0, target.buildingMaterials - 2),
      valuables: target.valuables,
    };
    state.players.p2.hand = ["artifact.inexhaustible_cart_of_lumber"];
    const scored = scoreCardAction(observation(state), {
      type: "PLAY_CARD",
      playerId: "p2",
      cardId: "artifact.inexhaustible_cart_of_lumber",
      optionIndex: 0,
      target: { type: "none" },
    });
    expect(scored?.score).toBeGreaterThan(800);
    expect(scored?.policy).toBe("card.play-artifact");
  });
});
