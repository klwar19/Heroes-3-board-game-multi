// @vitest-environment jsdom
//
// Regression guard for the reported Stronghold bug: "Orcs and Cyclopes
// interfere with each other — clicking to upgrade the Orcs points at the
// Cyclopes' cost, and dragging the Orcs into combat deploys a Cyclopes."
//
// Root cause: army-unit ids were minted with a module-global counter that is
// NOT part of the serialized state, so it resets to 0 whenever the host process
// recycles (serverless cold start / idle reclaim of a multiplayer room). After
// a recycle a recruit could be minted with an id a surviving unit already held.
// The engine matches army units by id everywhere (`army.find(u => u.id === …)`),
// so a collision makes reinforce / deployment resolve to the wrong unit. Orcs
// (bronze) and Cyclopes (gold) are the pair the player happened to hit.
//
// These tests pin: (1) ids are unique by construction, (2) a corrupted save with
// a shared id self-heals, and (3) after healing, reinforcing/deploying the Orcs
// touches the Orcs — never the Cyclopes.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TownPanel, PlacementPanel } from "@/components/adventure/screen";
import {
  applyAction,
  createAdventureGameState,
  ensureUniqueArmyUnitIds,
  getLegalActions,
  type GameState,
  type LegalAction
} from "@/engine";
import { populationAction } from "./adventure-reducer";
import { addArmyUnit } from "./adventure";

afterEach(cleanup);

function strongholdTown(): { state: GameState; orcId: string; cyclopesId: string } {
  const state = createAdventureGameState({ seed: "orc-cyclops", rollFirstPlayer: false });
  state.activePlayerId = "p1";
  state.players.p1.factionId = "stronghold";
  const town = Object.values(state.towns).find((t) => t.controllerId === "p1")!;
  town.factionId = "stronghold";
  town.buildings = [
    "stronghold.dwelling_bronze",
    "stronghold.dwelling_silver",
    "stronghold.dwelling_gold",
    "stronghold.citadel"
  ];
  const p1 = state.players.p1;
  p1.army = [];
  const orc = addArmyUnit(p1, "stronghold.orcs", "few");
  const cyclopes = addArmyUnit(p1, "stronghold.cyclopes", "few");
  p1.townTokens.population = true;
  p1.resources = { gold: 999, buildingMaterials: 999, valuables: 999 };
  return { state, orcId: orc.id, cyclopesId: cyclopes.id };
}

describe("army-unit id uniqueness (root cause)", () => {
  it("addArmyUnit never reuses an id already present in the army", () => {
    const player = { id: "p1", army: [] as { id: string; unitDefId: string; side: "few" | "pack" | "neutral" }[] };
    // Seed an army holding exactly the id the next mint would naturally pick
    // (army_p1_<length+1>), forcing the collision path.
    player.army.push({ id: "army_p1_2", unitDefId: "stronghold.cyclopes", side: "few" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const added = addArmyUnit(player as any, "stronghold.orcs", "few");
    expect(added.id).not.toBe("army_p1_2");
    const ids = player.army.map((u) => u.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("ensureUniqueArmyUnitIds re-mints a shared id and keeps the first holder", () => {
    const { state, orcId, cyclopesId } = strongholdTown();
    expect(orcId).not.toBe(cyclopesId);
    // Simulate the corruption a host recycle could have produced: the Cyclopes
    // ends up sharing the Orcs' id.
    state.players.p1.army[1].id = orcId;

    const changed = ensureUniqueArmyUnitIds(state);
    expect(changed).toBe(true);
    const army = state.players.p1.army;
    expect(army[0].id).toBe(orcId); // first holder keeps it
    expect(army[1].id).not.toBe(orcId); // collision re-minted
    expect(new Set(army.map((u) => u.id)).size).toBe(army.length);
    // unitDefIds are never touched — an Orc stays an Orc.
    expect(army[0].unitDefId).toBe("stronghold.orcs");
    expect(army[1].unitDefId).toBe("stronghold.cyclopes");
  });
});

describe("Stronghold Orcs vs Cyclopes — reinforce/deploy hit the right unit", () => {
  it("a save whose Orcs/Cyclopes shared an id heals so each can be reinforced on its own", () => {
    const { state } = strongholdTown();
    state.combat = null;
    // Corrupt the save the way a host recycle could: the two units share one id.
    const sharedId = state.players.p1.army[0].id;
    state.players.p1.army[1].id = sharedId;

    // Heal-on-read (what the room store does before serving a snapshot) gives the
    // client distinct ids, so it now sends the Orcs' OWN id when reinforcing.
    ensureUniqueArmyUnitIds(state);
    const orc = state.players.p1.army.find((u) => u.unitDefId === "stronghold.orcs")!;
    const cyclopesBefore = state.players.p1.army.find((u) => u.unitDefId === "stronghold.cyclopes")!;
    expect(orc.id).not.toBe(cyclopesBefore.id);

    const result = applyAction(state, {
      type: "POPULATION_ACTION",
      playerId: "p1",
      purchases: [{ kind: "reinforce", unitDefId: "stronghold.orcs", armyUnitId: orc.id }]
    });

    expect(result.errors).toEqual([]);
    const army = result.state.players.p1.army;
    expect(army.find((u) => u.unitDefId === "stronghold.orcs")!.side).toBe("pack"); // Orcs upgraded
    expect(army.find((u) => u.unitDefId === "stronghold.cyclopes")!.side).toBe("few"); // Cyclopes untouched
    expect(new Set(army.map((u) => u.id)).size).toBe(army.length);
  });

  it("the engine reinforces the Orcs only, leaving the Cyclopes a Few", () => {
    const { state, orcId, cyclopesId } = strongholdTown();
    state.combat = null;

    populationAction(state, {
      type: "POPULATION_ACTION",
      playerId: "p1",
      purchases: [{ kind: "reinforce", unitDefId: "stronghold.orcs", armyUnitId: orcId }]
    });

    const orc = state.players.p1.army.find((u) => u.id === orcId)!;
    const cyclopes = state.players.p1.army.find((u) => u.id === cyclopesId)!;
    expect(orc.unitDefId).toBe("stronghold.orcs");
    expect(orc.side).toBe("pack");
    expect(cyclopes.unitDefId).toBe("stronghold.cyclopes");
    expect(cyclopes.side).toBe("few");
  });

  it("the town reinforce checkbox dispatches the Orcs army unit, never the Cyclopes", () => {
    const { state, orcId, cyclopesId } = strongholdTown();
    state.combat = null;
    const onAction = vi.fn();
    render(<TownPanel legalActions={getLegalActions(state, "p1")} onAction={onAction} state={state} viewerPlayerId="p1" />);

    fireEvent.click(screen.getByLabelText(/Reinforce Orcs to a pack/i));
    fireEvent.click(screen.getByRole("button", { name: /Buy/i }));

    expect(onAction).toHaveBeenCalledTimes(1);
    const purchases = onAction.mock.calls[0][0].purchases;
    expect(purchases).toEqual([{ kind: "reinforce", unitDefId: "stronghold.orcs", armyUnitId: orcId }]);
    expect(purchases[0].armyUnitId).not.toBe(cyclopesId);
  });

  it("deploying the Orcs tile places the Orcs army unit, never the Cyclopes", () => {
    const { state, orcId } = strongholdTown();
    state.combat = {
      id: "c1",
      round: 1,
      attackerPlayerId: "p1",
      defenderPlayerId: "p2",
      activeUnitId: null,
      context: { kind: "sandbox" },
      setup: { pendingPlayerIds: ["p1", "p2"], placedUnitIds: { p1: [], p2: [] }, unitLimit: 7 },
      awaitingContinue: false,
      outcome: null,
      dice: { faces: [0], seed: "s", rollCount: 0 },
      units: {},
      obstacles: []
    } as unknown as GameState["combat"];

    const placeActions: LegalAction[] = [
      { action: { type: "PLACE_COMBAT_UNIT", playerId: "p1", armyUnitId: orcId, position: 16 }, label: "Place few Orcs at back-left" },
      { action: { type: "PLACE_COMBAT_UNIT", playerId: "p1", armyUnitId: orcId, position: 17 }, label: "Place few Orcs at back-mid" },
      { action: { type: "FINISH_COMBAT_PLACEMENT", playerId: "p1" }, label: "Ready for battle" }
    ];

    const onAction = vi.fn();
    render(<PlacementPanel legalActions={placeActions} onAction={onAction} state={state} viewerPlayerId="p1" />);

    fireEvent.click(screen.getByRole("button", { name: /few Orcs/i }));
    const cellButtons = Array.from(document.querySelectorAll(".placementCells .commandButton"));
    expect(cellButtons.length).toBeGreaterThan(0);
    fireEvent.click(cellButtons[0] as Element);

    expect(onAction).toHaveBeenCalledTimes(1);
    const action = onAction.mock.calls[0][0];
    expect(action.type).toBe("PLACE_COMBAT_UNIT");
    expect(action.armyUnitId).toBe(orcId);
  });
});
