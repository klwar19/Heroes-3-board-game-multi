import { expect, it, vi } from "vitest";
import { createAdventureGameState } from "../adventure-setup";
import * as navigation from "./map-navigation";
import { secondaryHeroOpportunity } from "./secondary-plan";
import { chooseComputerAction } from "./policy";
import type { PlayerVisibleState, GameAction } from "../state";
it("hires a second hero for reachable jobs, never merely for surplus cash", () => {
  const state = createAdventureGameState({
    seed: "hire-plan",
    playerCount: 2,
    events: false,
    rollFirstPlayer: false,
  });
  state.players.p2.factionId = "stronghold";
  state.players.p2.army = [
    "stronghold.goblins",
    "stronghold.orcs",
    "stronghold.ogres",
  ].map((unitDefId, i) => ({ id: String(i), unitDefId, side: "pack" }));
  state.players.p2.resources = {
    gold: 100,
    buildingMaterials: 20,
    valuables: 20,
  };
  const placement = Object.values(state.towns).find(
    (t) => t.controllerId === "p2",
  )!.fieldId!;
  // A Far (II-III) gold mine p2 has FLAGGED: the opening economy is secured,
  // which is the precondition for spending on a second hero at all.
  const sourceTile = Object.values(state.adventure!.tiles)[0];
  const sourceField = Object.values(state.adventure!.fields)[0];
  state.adventure!.tiles["hire-far"] = { ...sourceTile, id: "hire-far", group: "far", faceDown: false };
  state.adventure!.fields["h:99:99"] = {
    ...sourceField,
    spaceId: "h:99:99",
    tileInstanceId: "hire-far",
    location: "mine",
    resource: "gold",
    difficulty: undefined,
    flagOwnerId: "p2",
  };
  vi.spyOn(navigation, "primaryMapObjective").mockReturnValue(null);
  vi.spyOn(navigation, "collectMapObjectives").mockReturnValue([]);
  const hire: GameAction = {
    type: "HIRE_SECONDARY_HERO",
    playerId: "p2",
    heroDefId: "crag_hack",
    fieldId: placement,
  };
  const offers = [
    { label: "hire", action: hire },
    {
      label: "end",
      action: { type: "END_TURN", playerId: "p2" } as GameAction,
    },
  ];
  const obs = {
    playerId: "p2",
    state: state as unknown as PlayerVisibleState,
    legalActions: offers,
  };
  expect(chooseComputerAction(obs)?.action.type).toBe("END_TURN");
  vi.spyOn(navigation, "collectMapObjectives").mockReturnValue([
    { spaceId: "job1", kind: "visitable" },
    { spaceId: "job2", kind: "visitable" },
  ]);
  vi.spyOn(navigation, "objectiveDistanceField").mockReturnValue(
    new Map([[placement, 3]]),
  );
  expect(secondaryHeroOpportunity(state, "p2", placement).worthwhile).toBe(
    true,
  );
  expect(chooseComputerAction(obs)?.action).toEqual(hire);
  // Both jobs unreachable; the portrait cannot turn into an idle purchase.
  vi.spyOn(navigation, "objectiveDistanceField").mockReturnValue(new Map());
  expect(chooseComputerAction(obs)?.action.type).toBe("END_TURN");
  vi.spyOn(navigation, "objectiveDistanceField").mockReturnValue(
    new Map([[placement, 3]]),
  );
  state.players.p2.resources.gold = 15;
  expect(chooseComputerAction(obs)?.action.type).toBe("END_TURN");
  vi.restoreAllMocks();
});

it("lets a Gold army hire a collector that delays the next Gold step by at most one Resource Round", () => {
  const state = createAdventureGameState({ seed: "hire-slack", playerCount: 2, events: false, rollFirstPlayer: false });
  state.players.p2.factionId = "stronghold";
  // Cyclopes (Gold) stand; the next ladder step is the Behemoth Few (19 gold, 1 valuable).
  state.players.p2.army = [
    ["stronghold.goblins", "pack"], ["stronghold.orcs", "pack"], ["stronghold.ogres", "few"], ["stronghold.cyclopes", "few"],
  ].map(([unitDefId, side], i) => ({ id: String(i), unitDefId, side })) as typeof state.players.p2.army;
  state.players.p2.resources = { gold: 22, buildingMaterials: 20, valuables: 0 };
  state.players.p2.production = { gold: 5, buildingMaterials: 0, valuables: 1 };
  const town = Object.values(state.towns).find((t) => t.controllerId === "p2")!;
  for (const id of ["stronghold.dwelling_bronze", "stronghold.dwelling_silver", "stronghold.dwelling_gold"]) {
    if (!town.buildings.includes(id)) town.buildings.push(id);
  }
  const placement = town.fieldId!;
  vi.spyOn(navigation, "primaryMapObjective").mockReturnValue(null);
  vi.spyOn(navigation, "collectMapObjectives").mockReturnValue([
    { spaceId: "job1", kind: "visitable" },
    { spaceId: "job2", kind: "visitable" },
  ]);
  vi.spyOn(navigation, "objectiveDistanceField").mockReturnValue(new Map([[placement, 3], ["job1", 1], ["job2", 1]]));
  // Without the hire the Behemoth lands after 1 Resource Round; after paying 10 gold, after 2.
  expect(secondaryHeroOpportunity(state, "p2", placement).worthwhile).toBe(true);
  // CONTROL: a hire that would push the Gold step back by more than one round waits.
  state.players.p2.production = { gold: 2, buildingMaterials: 0, valuables: 1 };
  expect(secondaryHeroOpportunity(state, "p2", placement).worthwhile).toBe(false);
  vi.restoreAllMocks();
});
