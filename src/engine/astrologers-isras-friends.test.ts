import { describe, expect, it } from "vitest";
import { applyAction, createAdventureGameState, getLegalActions } from "./index";
import { startAdventureRound } from "./adventure";
import { pumpAdventureQueues } from "./adventure-reducer";
import type { GameState, PlayerId } from "./state";

function prepareIsraRound(options?: { polishUnitStacks?: boolean }): GameState {
  const state = createAdventureGameState({
    seed: `isras-friends-${options?.polishUnitStacks ? "stacks" : "classic"}`,
    rollFirstPlayer: false,
    houseRules: options?.polishUnitStacks
      ? { "polish-unit-stacks": true }
      : undefined,
    players: [
      { id: "p1", name: "Catherine", factionId: "castle", heroDefId: "catherine" },
      { id: "p2", name: "Sandro", factionId: "necropolis", heroDefId: "sandro" }
    ]
  });

  for (const player of Object.values(state.players)) {
    player.canMulligan = false;
    player.needsHandRefresh = false;
    player.resources = { gold: 30, buildingMaterials: 10, valuables: 10 };
  }

  // Hokage Vanguard's Pack costs 21 gold + 3 valuables. It proves that Isra
  // halves EVERY resource independently and rounds both odd halves upward.
  state.players.p1.army = [
    { id: "p1-hokage", unitDefId: "hidden_leaf.hokage_vanguard", side: "few" },
    { id: "p1-pack", unitDefId: "castle.halberdiers", side: "pack" }
  ];
  state.players.p2.army = [
    { id: "p2-marksmen", unitDefId: "castle.marksmen", side: "few" }
  ];

  const deck = state.decks.astrologers!;
  deck.drawPile = deck.drawPile.filter((id) => id !== "astrologers.isras_friends");
  deck.drawPile.push("astrologers.isras_friends");
  deck.discardPile = deck.discardPile.filter((id) => id !== "astrologers.isras_friends");
  state.activePlayerId = "p1";
  state.round = 2;
  startAdventureRound(state);
  pumpAdventureQueues(state);
  return state;
}

function resolveOption(state: GameState, playerId: PlayerId, label: RegExp): GameState {
  const legal = getLegalActions(state, playerId);
  const selected = legal.find((entry) => label.test(entry.label));
  expect(selected, `missing Isra option matching ${label}`).toBeTruthy();
  const result = applyAction(state, selected!.action);
  expect(result.errors).toEqual([]);
  return result.state;
}

describe("Astrologers — Isra's Friends", () => {
  it("offers each player only an immediate Few-unit reinforcement, charging half of every resource rounded up", () => {
    let state = prepareIsraRound();

    expect(state.adventure?.astrologers?.activeCardId).toBe("astrologers.isras_friends");
    expect(state.adventure?.pendingVisit?.playerId).toBe("p1");
    const p1Step = state.adventure?.pendingVisit?.steps[0];
    expect(p1Step?.type).toBe("CHOOSE_ONE");
    if (p1Step?.type !== "CHOOSE_ONE") throw new Error("Isra choice did not open");
    expect(p1Step.prompt).toMatch(/half cost \(rounded up\)/i);
    expect(p1Step.options).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: expect.stringMatching(/Reinforce Hokage Vanguard \(11 gold \+ 2 valuables\)/),
          steps: [
            expect.objectContaining({
              type: "REINFORCE_ARMY_UNIT",
              armyUnitId: "p1-hokage",
              halfCost: true,
              roundDown: false
            })
          ]
        }),
        expect.objectContaining({ label: "Skip", steps: [] })
      ])
    );
    expect(p1Step.options.some((option) => option.steps.some(
      (step) => step.type === "REINFORCE_ARMY_UNIT" && step.armyUnitId === "p1-pack"
    ))).toBe(false);

    // Isra is an atomic round-start choice: no movement, recruitment, card play,
    // or other game action can be used in place of resolving this window.
    const p1Legal = getLegalActions(state, "p1");
    expect(p1Legal.length).toBeGreaterThan(1);
    expect(p1Legal.every((entry) => entry.action.type === "RESOLVE_VISIT_STEP")).toBe(true);
    expect(getLegalActions(state, "p2")).toEqual([]);

    state = resolveOption(state, "p1", /Reinforce Hokage Vanguard/);
    expect(state.players.p1.army.find((unit) => unit.id === "p1-hokage")?.side).toBe("pack");
    expect(state.players.p1.resources).toEqual({
      gold: 19,
      buildingMaterials: 10,
      valuables: 8
    });

    // The next seat receives its own decision only after the first seat resolves.
    expect(state.adventure?.pendingVisit?.playerId).toBe("p2");
    expect(getLegalActions(state, "p1")).toEqual([]);
    const p2Legal = getLegalActions(state, "p2");
    expect(p2Legal.every((entry) => entry.action.type === "RESOLVE_VISIT_STEP")).toBe(true);
    state = resolveOption(state, "p2", /^Skip$/);
    expect(state.players.p2.army.find((unit) => unit.id === "p2-marksmen")?.side).toBe("few");
    expect(state.adventure?.pendingVisit).toBeNull();
    expect(state.adventure?.eventResolution).toBeNull();
  });

  it("keeps the same Few-to-Pack choice and rounded-up price with Polish Unit Stacks enabled", () => {
    const state = prepareIsraRound({ polishUnitStacks: true });
    const step = state.adventure?.pendingVisit?.steps[0];
    expect(step?.type).toBe("CHOOSE_ONE");
    if (step?.type !== "CHOOSE_ONE") throw new Error("Isra choice did not open");

    const reinforce = step.options.find((option) => /Hokage Vanguard/.test(option.label));
    expect(reinforce?.label).toContain("11 gold + 2 valuables");
    expect(reinforce?.steps[0]).toMatchObject({
      type: "REINFORCE_ARMY_UNIT",
      armyUnitId: "p1-hokage",
      halfCost: true,
      roundDown: false
    });
    // Isra says Reinforce a unit on its Few side. Polish Stack purchases for an
    // existing Pack therefore remain outside this proclamation.
    expect(step.options.some((option) => /Stack/i.test(option.label))).toBe(false);
  });
});
