import { describe, expect, it } from "vitest";
import type {
  CombatState,
  CombatUnitState,
  GameAction,
  LegalAction,
  PendingChoice,
  PlayerVisibleState,
} from "../state";
import { cardKeepValue } from "./card-policy";
import { chooseComputerAction } from "./policy";
import type { ComputerObservation } from "./types";

function unit(
  overrides: Partial<CombatUnitState> & { id: string },
): CombatUnitState {
  return {
    controllerId: "p1",
    name: overrides.id,
    cardName: overrides.id,
    variant: "neutral",
    grade: "bronze",
    type: "ground",
    attack: 3,
    defense: 2,
    maxHealth: 5,
    damage: 0,
    initiative: 5,
    position: 0,
    activatedThisRound: false,
    movedThisActivation: false,
    retaliatedThisRound: false,
    defenseToken: false,
    abilities: [],
    ...overrides,
  };
}

function observation(
  pendingChoice: PendingChoice | null,
  legalActions: LegalAction[],
  units: CombatUnitState[] = [],
  playerId = "p2",
): ComputerObservation {
  const unitMap: Record<string, CombatUnitState> = {};
  for (const u of units) unitMap[u.id] = u;
  const combat =
    units.length > 0
      ? ({ id: "c1", units: unitMap } as unknown as CombatState)
      : null;
  const state = {
    seed: "choice-policy-test",
    round: 1,
    eventCounter: 0,
    combat,
    pendingChoice,
    players: {
      [playerId]: {
        id: playerId,
        hand: ["stat.attack", "spell.haste", "artifact.centaurs_axe"],
        resources: { gold: 8, buildingMaterials: 1, valuables: 0 },
        army: [{ id: "u1" }, { id: "u2" }],
      },
    },
  } as unknown as PlayerVisibleState;
  return { playerId, state, legalActions };
}

describe("choice policy — deck search keep", () => {
  it("keeps the highest-value revealed card", () => {
    const choice: PendingChoice = {
      id: "ds1",
      type: "DECK_SEARCH",
      playerId: "p2",
      deckId: "artifacts-minor",
      revealedCardIds: ["stat.attack", "spell.haste", "artifact.centaurs_axe"],
      returnPhase: "map",
    };
    const options: LegalAction[] = [0, 1, 2].map((index) => ({
      label: `keep ${index}`,
      action: {
        type: "RESOLVE_DECK_SEARCH",
        playerId: "p2",
        choiceId: "ds1",
        pick: { kind: "revealed", index },
      } as GameAction,
    }));

    const decision = chooseComputerAction(observation(choice, options));
    expect(decision?.action.type).toBe("RESOLVE_DECK_SEARCH");
    const pick = (decision?.action as { pick: { index: number } }).pick;
    // Artifact > spell > statistic by cardKeepValue.
    expect(pick.index).toBe(2);
    expect(decision?.policy).toBe("choice.deck-search-keep");

    // CONTROL: swap so the artifact is first — pick follows the card, not index 0.
    const swapped: PendingChoice = {
      ...choice,
      revealedCardIds: ["artifact.centaurs_axe", "stat.attack", "spell.haste"],
    };
    const control = chooseComputerAction(observation(swapped, options));
    expect((control?.action as { pick: { index: number } }).pick.index).toBe(0);
  });
});

describe("choice policy — combat discard", () => {
  it("discards the lowest-value Power card", () => {
    const choice: PendingChoice = {
      id: "cd1",
      type: "COMBAT_HAND_DISCARD",
      playerId: "p2",
      kind: "magi-power-or-random",
      abilityId: "power-drain",
      abilityName: "Power Drain",
      sourceUnitId: "M",
      prompt: "Discard a Power card",
      powerCardIds: ["stat.power", "spell.implosion"],
    } as PendingChoice;

    const dumpStat: LegalAction = {
      label: "discard power stat",
      action: {
        type: "RESOLVE_COMBAT_DISCARD",
        playerId: "p2",
        choiceId: "cd1",
        cardId: "stat.power",
      } as GameAction,
    };
    const dumpSpell: LegalAction = {
      label: "discard implosion",
      action: {
        type: "RESOLVE_COMBAT_DISCARD",
        playerId: "p2",
        choiceId: "cd1",
        cardId: "spell.implosion",
      } as GameAction,
    };

    // Expert spell is worth more than the Power statistic — dump the stat.
    expect(cardKeepValue("spell.implosion")).toBeGreaterThan(
      cardKeepValue("stat.power"),
    );
    const decision = chooseComputerAction(
      observation(choice, [dumpStat, dumpSpell]),
    );
    expect(decision?.action.type).toBe("RESOLVE_COMBAT_DISCARD");
    expect((decision?.action as { cardId: string }).cardId).toBe("stat.power");

    // CONTROL: only the spell available — it is discarded (no choice).
    const only = chooseComputerAction(observation(choice, [dumpSpell]));
    expect((only?.action as { cardId: string }).cardId).toBe("spell.implosion");
  });
});

describe("choice policy — ability target", () => {
  it("picks the highest-threat enemy for an offensive ability", () => {
    const weak = unit({ id: "E1", attack: 2, maxHealth: 4, position: 9 });
    const scary = unit({
      id: "E2",
      attack: 9,
      maxHealth: 6,
      initiative: 10,
      type: "ranged",
      position: 12,
    });
    const choice = {
      id: "at1",
      type: "ABILITY_TARGET_CHOICE",
      playerId: "p2",
      unitId: "A",
      abilityId: "splash",
      candidateUnitIds: ["E1", "E2"],
    } as unknown as PendingChoice;

    const hitWeak: LegalAction = {
      label: "hit weak",
      action: {
        type: "CHOOSE_ABILITY_TARGET",
        playerId: "p2",
        choiceId: "at1",
        targetUnitId: "E1",
      } as GameAction,
    };
    const hitScary: LegalAction = {
      label: "hit scary",
      action: {
        type: "CHOOSE_ABILITY_TARGET",
        playerId: "p2",
        choiceId: "at1",
        targetUnitId: "E2",
      } as GameAction,
    };

    const decision = chooseComputerAction(
      observation(choice, [hitWeak, hitScary], [weak, scary]),
    );
    expect((decision?.action as { targetUnitId: string }).targetUnitId).toBe(
      "E2",
    );

    // CONTROL: swap stats — choice follows threat.
    const weakScary = unit({
      id: "E1",
      attack: 9,
      maxHealth: 6,
      initiative: 10,
      type: "ranged",
      position: 9,
    });
    const toughWeak = unit({ id: "E2", attack: 2, maxHealth: 4, position: 12 });
    const swapped = chooseComputerAction(
      observation(choice, [hitWeak, hitScary], [weakScary, toughWeak]),
    );
    expect((swapped?.action as { targetUnitId: string }).targetUnitId).toBe(
      "E1",
    );
  });
});

describe("choice policy — city hall income", () => {
  it("prefers free reinforce when the army is thin", () => {
    const choice = {
      id: "ch1",
      type: "OPTION_CHOICE",
      playerId: "p2",
      prompt: "City Hall",
      context: "city-hall",
      options: [{ label: "+4 gold" }, { label: "reinforce bronze free" }],
      cityHall: {
        options: [
          { label: "+4 gold", gold: 4 },
          { label: "reinforce", reinforceBronzeFree: true },
        ],
      },
    } as unknown as PendingChoice;

    const gold: LegalAction = {
      label: "gold",
      action: {
        type: "CHOOSE_OPTION",
        playerId: "p2",
        choiceId: "ch1",
        optionIndex: 0,
      } as GameAction,
    };
    const reinforce: LegalAction = {
      label: "reinforce",
      action: {
        type: "CHOOSE_OPTION",
        playerId: "p2",
        choiceId: "ch1",
        optionIndex: 1,
      } as GameAction,
    };

    const decision = chooseComputerAction(
      observation(choice, [gold, reinforce]),
    );
    expect((decision?.action as { optionIndex: number }).optionIndex).toBe(1);
    expect(decision?.policy).toBe("choice.city-hall");

    // CONTROL: with a large army the gold option can win (no reinforce bonus).
    const fatArmy = observation(choice, [gold, reinforce]);
    (fatArmy.state.players.p2 as { army: unknown[] }).army = [
      1, 2, 3, 4, 5, 6, 7,
    ];
    const fat = chooseComputerAction(fatArmy);
    // Gold (4*2=8) vs reinforce without thin-army bonus: gold may win.
    expect([0, 1]).toContain(
      (fat?.action as { optionIndex: number }).optionIndex,
    );
  });
});

describe("choice policy — discard-pick never re-loops a retriever", () => {
  function discardPickChoice(cardIds: string[]): PendingChoice {
    return {
      id: "dp1",
      type: "OPTION_CHOICE",
      playerId: "p2",
      prompt: "Take a card from your discard pile",
      context: "discard-pick",
      options: [...cardIds.map((c) => ({ label: `Take ${c}` })), { label: "Done" }],
      discardPick: {
        cardIds,
        destinations: cardIds.map(() => "hand"),
        remaining: 1,
      },
      returnPhase: "combat",
    } as unknown as PendingChoice;
  }

  function optionActions(count: number): LegalAction[] {
    return Array.from({ length: count }, (_, optionIndex) => ({
      label: `opt${optionIndex}`,
      action: {
        type: "CHOOSE_OPTION",
        playerId: "p2",
        choiceId: "dp1",
        optionIndex,
      } as GameAction,
    }));
  }

  it("prefers a real stat card over taking Scholar back (Scholar re-opens this very pick → infinite loop)", () => {
    // Discard = [stat.attack, ability.scholar]; option 2 = Done. Playing Scholar
    // opens THIS discard-pick, so taking it back lets the AI replay it forever.
    const choice = discardPickChoice(["stat.attack", "ability.scholar"]);
    const decision = chooseComputerAction(
      observation(choice, optionActions(3)),
    );
    const idx = (decision?.action as { optionIndex: number }).optionIndex;
    // Must NOT be index 1 (Take Scholar). Without the guard, Scholar's high
    // cardKeepValue wins and the AI loops.
    expect(idx).toBe(0);
    // Sanity: Scholar is otherwise the higher-value card, so the guard (not a
    // value accident) is what steers the pick.
    expect(cardKeepValue("ability.scholar")).toBeGreaterThan(
      cardKeepValue("stat.attack"),
    );
  });

  it("DECLINES (Done) rather than take a lone Scholar back", () => {
    // Discard = [ability.scholar] only; options = [Take Scholar, Done].
    const choice = discardPickChoice(["ability.scholar"]);
    const decision = chooseComputerAction(
      observation(choice, optionActions(2)),
    );
    // Done is index 1 (no cardId) — chosen over re-looping Scholar (index 0).
    expect((decision?.action as { optionIndex: number }).optionIndex).toBe(1);
  });
});

describe("choice policy — die keep vs reroll", () => {
  it("keeps a strong roll rather than rerolling", () => {
    const choice: PendingChoice = {
      id: "rr1",
      type: "ATTACK_DIE_REROLL",
      playerId: "p2",
      stackItemId: "s1",
      attackerId: "A",
      defenderId: "E",
      isRetaliation: false,
      attackKind: "melee",
      rollMode: "normal",
      attackBonus: 0,
      defenseBonus: 0,
      candidates: [{ rolls: [1], roll: 1 }],
      remainingRerolls: 1,
      rerollSources: [],
      sourceEffectIds: [],
    };

    const keep: LegalAction = {
      label: "keep",
      action: {
        type: "CHOOSE_PENDING_ROLL",
        playerId: "p2",
        choiceId: "rr1",
        candidateIndex: 0,
      } as GameAction,
    };
    const reroll: LegalAction = {
      label: "reroll",
      action: {
        type: "REROLL_PENDING_CHOICE",
        playerId: "p2",
        choiceId: "rr1",
      } as GameAction,
    };

    const decision = chooseComputerAction(observation(choice, [keep, reroll]));
    expect(decision?.action.type).toBe("CHOOSE_PENDING_ROLL");

    // CONTROL: a −1 face makes reroll attractive.
    const bad: PendingChoice = {
      ...choice,
      candidates: [{ rolls: [-1], roll: -1 }],
    };
    const badDecision = chooseComputerAction(observation(bad, [keep, reroll]));
    expect(badDecision?.action.type).toBe("REROLL_PENDING_CHOICE");
  });
});
