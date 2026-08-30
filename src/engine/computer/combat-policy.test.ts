import { describe, expect, it } from "vitest";
import type {
  CombatState,
  CombatUnitState,
  GameAction,
  LegalAction,
  PlayerVisibleState,
} from "../state";
import { chooseComputerAction } from "./policy";
import { scoreCombatAction } from "./combat-policy";
import type { ComputerObservation } from "./types";

/** Minimal combat unit; only the fields the policy reads matter, the rest are
 * inert defaults so the fixture compiles as a real CombatUnitState. */
function unit(overrides: Partial<CombatUnitState> & { id: string }): CombatUnitState {
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
  units: CombatUnitState[],
  legalActions: LegalAction[],
  playerId = "p2",
): ComputerObservation {
  const unitMap: Record<string, CombatUnitState> = {};
  for (const u of units) unitMap[u.id] = u;
  const combat = { id: "c1", units: unitMap } as unknown as CombatState;
  const state = {
    seed: "combat-policy-test",
    round: 1,
    eventCounter: 0,
    combat,
    players: {},
  } as unknown as PlayerVisibleState;
  return { playerId, state, legalActions };
}

const attackOn = (attackerId: string, defenderId: string): LegalAction => ({
  action: { type: "ATTACK_UNIT", playerId: "p2", attackerId, defenderId } as GameAction,
  label: `attack ${defenderId}`,
});

const moveTo = (unitId: string, destination: number): LegalAction => ({
  action: { type: "MOVE_UNIT", playerId: "p2", unitId, destination } as GameAction,
  label: `move ${destination}`,
});

const defend = (unitId: string): LegalAction => ({
  action: { type: "DEFEND_UNIT", playerId: "p2", unitId } as GameAction,
  label: "defend",
});

const continueNeutral: LegalAction = {
  action: { type: "CONTINUE_NEUTRAL_COMBAT", playerId: "p2" },
  label: "Continue combat",
};

const retreatNeutral: LegalAction = {
  action: { type: "RETREAT_FROM_COMBAT", playerId: "p2" },
  label: "Retreat",
};

describe("combat policy — neutral continue risk", () => {
  it("retreats instead of spending another round with only two outmatched attackers", () => {
    const ownA = unit({ id: "A", controllerId: "p2", attack: 2, defense: 1, maxHealth: 3 });
    const ownB = unit({ id: "B", controllerId: "p2", attack: 2, defense: 1, maxHealth: 3 });
    const mummyA = unit({ id: "M1", attack: 7, defense: 5, maxHealth: 8, grade: "silver" });
    const mummyB = unit({ id: "M2", attack: 7, defense: 5, maxHealth: 8, grade: "silver" });

    const decision = chooseComputerAction(
      observation([ownA, ownB, mummyA, mummyB], [continueNeutral, retreatNeutral]),
    );
    expect(decision?.action.type).toBe("RETREAT_FROM_COMBAT");
    expect(decision?.policy).toBe("combat.retreat-hopeless");
  });

  it("continues when two survivors still clearly overpower the neutral side", () => {
    const ownA = unit({ id: "A", controllerId: "p2", attack: 9, defense: 6, maxHealth: 9, grade: "gold" });
    const ownB = unit({ id: "B", controllerId: "p2", attack: 8, defense: 6, maxHealth: 9, grade: "gold" });
    const enemy = unit({ id: "E", attack: 2, defense: 1, maxHealth: 3 });

    expect(
      chooseComputerAction(
        observation([ownA, ownB, enemy], [continueNeutral, retreatNeutral]),
      )?.action.type,
    ).toBe("CONTINUE_NEUTRAL_COMBAT");
  });
});

describe("combat policy — attack target selection", () => {
  it("uses physical damage on the lower-Defense target", () => {
    const attacker = unit({
      id: "A",
      controllerId: "p2",
      attack: 6,
      position: 5,
    });
    const armoured = unit({
      id: "ARMOUR",
      attack: 4,
      defense: 7,
      maxHealth: 10,
      position: 6,
    });
    const exposed = unit({
      id: "OPEN",
      attack: 4,
      defense: 1,
      maxHealth: 10,
      position: 4,
    });
    const decision = chooseComputerAction(
      observation(
        [attacker, armoured, exposed],
        [attackOn("A", "ARMOUR"), attackOn("A", "OPEN")],
      ),
    );
    expect((decision?.action as { defenderId: string }).defenderId).toBe("OPEN");
  });

  it("takes a lethal removal over a bigger but non-lethal hit", () => {
    // Attacker (att 6). E1 is the better CHIP target (6-0=6 of 8 HP) but cannot
    // be killed this hit; E2 is fragile and dies (6-2=4 >= 3 HP). The lethal
    // removal is preferred over the larger non-lethal chip.
    const attacker = unit({ id: "A", controllerId: "p2", attack: 6, defense: 2, position: 8 });
    const e1 = unit({ id: "E1", attack: 5, defense: 0, maxHealth: 8, position: 9 });
    const e2Lethal = unit({ id: "E2", attack: 2, defense: 2, maxHealth: 3, position: 12 });

    const lethal = chooseComputerAction(
      observation([attacker, e1, e2Lethal], [attackOn("A", "E1"), attackOn("A", "E2")]),
    );
    expect(lethal?.action.type).toBe("ATTACK_UNIT");
    expect((lethal?.action as { defenderId: string }).defenderId).toBe("E2");
    expect(lethal?.policy).toBe("combat.attack-target");

    // CONTROL: make E2 durable (6-2=4 < 12 HP), a poor chip. With no lethal
    // removal available, the harder-hit E1 becomes the pick — proving the lethal
    // bonus, not the target order, drove the first choice.
    const e2Survives = unit({ id: "E2", attack: 2, defense: 2, maxHealth: 12, position: 12 });
    const chipped = chooseComputerAction(
      observation([attacker, e1, e2Survives], [attackOn("A", "E1"), attackOn("A", "E2")]),
    );
    expect((chipped?.action as { defenderId: string }).defenderId).toBe("E1");
  });

  it("learns from the Absolution–VuHy replay not to lose a commander to retaliation", () => {
    // VuHy's final battle action: a 4-Health Shaman attacked a wounded Haspid,
    // dealt only 1, then died to the Haspid's 4-damage retaliation. Commander
    // death ended the battle. The AI must end its activation instead.
    const shaman = unit({
      id: "SHAMAN",
      controllerId: "p2",
      commanderSlug: "shaman",
      attack: 4,
      defense: 2,
      maxHealth: 4,
      position: 9,
    });
    const haspid = unit({
      id: "HASPID",
      controllerId: "p1",
      attack: 6,
      defense: 3,
      maxHealth: 8,
      damage: 5,
      position: 5,
    });
    const endActivation: LegalAction = {
      action: { type: "END_ACTIVATION", playerId: "p2", unitId: "SHAMAN" },
      label: "End activation",
    };

    const decision = chooseComputerAction(
      observation(
        [shaman, haspid],
        [attackOn("SHAMAN", "HASPID"), endActivation],
      ),
    );
    expect(decision?.action.type).toBe("END_ACTIVATION");

    // CONTROL: if the same commander attack removes the target, there is no
    // retaliation and the AI correctly takes the winning hit.
    const fragileHaspid = unit({
      ...haspid,
      maxHealth: 6,
      damage: 5,
    });
    const lethal = chooseComputerAction(
      observation(
        [shaman, fragileHaspid],
        [attackOn("SHAMAN", "HASPID"), endActivation],
      ),
    );
    expect(lethal?.action.type).toBe("ATTACK_UNIT");
  });

  it("among lethal removals, deletes the higher-threat enemy", () => {
    // Both enemies die to the att-10 attacker; E2 is the far scarier unit.
    const attacker = unit({ id: "A", controllerId: "p2", attack: 10, position: 8 });
    const weak = unit({ id: "E1", attack: 3, defense: 0, maxHealth: 3, initiative: 4, position: 9 });
    const scary = unit({ id: "E2", attack: 9, defense: 0, maxHealth: 3, initiative: 9, position: 12 });

    const decision = chooseComputerAction(
      observation([attacker, weak, scary], [attackOn("A", "E1"), attackOn("A", "E2")]),
    );
    expect((decision?.action as { defenderId: string }).defenderId).toBe("E2");

    // CONTROL: move the scary stats onto E1 and the choice follows the threat.
    const weakSwapped = unit({ id: "E1", attack: 9, defense: 0, maxHealth: 3, initiative: 9, position: 9 });
    const scarySwapped = unit({ id: "E2", attack: 3, defense: 0, maxHealth: 3, initiative: 4, position: 12 });
    const swapped = chooseComputerAction(
      observation([attacker, weakSwapped, scarySwapped], [attackOn("A", "E1"), attackOn("A", "E2")]),
    );
    expect((swapped?.action as { defenderId: string }).defenderId).toBe("E1");
  });

  it("prefers the equal target that cannot retaliate", () => {
    // Two identical durable enemies; only E2 has already retaliated this round,
    // so hitting it draws no counter-damage.
    const attacker = unit({ id: "A", controllerId: "p2", attack: 5, defense: 2, position: 8 });
    const e1 = unit({ id: "E1", attack: 9, defense: 3, maxHealth: 12, position: 9, retaliatedThisRound: false });
    const e2 = unit({ id: "E2", attack: 9, defense: 3, maxHealth: 12, position: 7, retaliatedThisRound: true });

    const decision = chooseComputerAction(
      observation([attacker, e1, e2], [attackOn("A", "E1"), attackOn("A", "E2")]),
    );
    expect((decision?.action as { defenderId: string }).defenderId).toBe("E2");

    // CONTROL: swap which enemy has spent its retaliation and the choice swaps.
    const e1Spent = unit({ id: "E1", attack: 9, defense: 3, maxHealth: 12, position: 9, retaliatedThisRound: true });
    const e2Ready = unit({ id: "E2", attack: 9, defense: 3, maxHealth: 12, position: 7, retaliatedThisRound: false });
    const swapped = chooseComputerAction(
      observation([attacker, e1Spent, e2Ready], [attackOn("A", "E1"), attackOn("A", "E2")]),
    );
    expect((swapped?.action as { defenderId: string }).defenderId).toBe("E1");
  });
});

describe("combat policy — kill enemy shooters first", () => {
  it("removes the lower-threat SHOOTER over a scarier melee target", () => {
    // Attacker (att 10) kills either. The ground E1 is the bigger raw threat
    // (att 7 → threat 29) than the ranged E2 (att 4 → threat 26+6): without the
    // explicit shooter bonus the threat-scaled lethal quality picks E1; the
    // shooter-first rule flips the removal onto the ranged unit.
    const attacker = unit({ id: "A", controllerId: "p2", attack: 10, position: 8 });
    const melee = unit({ id: "E1", attack: 7, defense: 0, maxHealth: 3, position: 9 });
    const shooter = unit({
      id: "E2", type: "ranged", attack: 4, defense: 0, maxHealth: 3, position: 12,
    });

    const decision = chooseComputerAction(
      observation([attacker, melee, shooter], [attackOn("A", "E1"), attackOn("A", "E2")]),
    );
    expect((decision?.action as { defenderId: string }).defenderId).toBe("E2");

    // CONTROL: swap which unit is the shooter and the pick follows the TYPE,
    // not the unit id or stats.
    const meleeSwapped = unit({
      id: "E1", type: "ranged", attack: 7, defense: 0, maxHealth: 3, position: 9,
    });
    const shooterSwapped = unit({
      id: "E2", attack: 4, defense: 0, maxHealth: 3, position: 12,
    });
    const swapped = chooseComputerAction(
      observation(
        [attacker, meleeSwapped, shooterSwapped],
        [attackOn("A", "E1"), attackOn("A", "E2")],
      ),
    );
    expect((swapped?.action as { defenderId: string }).defenderId).toBe("E1");
  });

  it("prefers chipping the shooter when neither hit is lethal", () => {
    // Neither enemy dies (both def 2, hp 10) and neither can retaliate this
    // round. The ground E1 carries the higher threat (att 8 vs att 4), yet the
    // ranged E2 is the better chip target under the shooter-first rule.
    const attacker = unit({ id: "A", controllerId: "p2", attack: 5, defense: 2, position: 8 });
    const melee = unit({
      id: "E1", attack: 8, defense: 2, maxHealth: 10, position: 9, retaliatedThisRound: true,
    });
    const shooter = unit({
      id: "E2", type: "ranged", attack: 4, defense: 2, maxHealth: 10, position: 7,
      retaliatedThisRound: true,
    });

    const decision = chooseComputerAction(
      observation([attacker, melee, shooter], [attackOn("A", "E1"), attackOn("A", "E2")]),
    );
    expect((decision?.action as { defenderId: string }).defenderId).toBe("E2");
  });
});

describe("combat policy — refuse a value-losing trade", () => {
  // A fragile high-value attacker (att 7, hp 3, threat 32) can only chip the
  // durable defender (att 5/def 5/hp 14, threat 31) for 2 of 14 while the
  // retaliation (5) kills it outright — a losing trade for the better unit.
  const keyUnit = () =>
    unit({
      id: "A", controllerId: "p2", attack: 7, defense: 0, maxHealth: 3,
      initiative: 8, position: 8,
    });
  const wall = () =>
    unit({
      id: "E", attack: 5, defense: 5, maxHealth: 14, initiative: 2, position: 9,
    });

  it("defends the more valuable unit instead of dying for a chip", () => {
    const decision = chooseComputerAction(
      observation([keyUnit(), wall()], [attackOn("A", "E"), defend("A")]),
    );
    expect(decision?.action.type).toBe("DEFEND_UNIT");
  });

  it("CONTROL: survivable retaliation keeps the strike", () => {
    // Same chip, but the attacker survives the counter (hp 6 > 5) — trade on.
    const sturdy = unit({
      id: "A", controllerId: "p2", attack: 7, defense: 0, maxHealth: 6,
      initiative: 8, position: 8,
    });
    const decision = chooseComputerAction(
      observation([sturdy, wall()], [attackOn("A", "E"), defend("A")]),
    );
    expect(decision?.action.type).toBe("ATTACK_UNIT");
  });

  it("CONTROL: a unit NOT worth more than its target still trades", () => {
    // Identical lethal retaliation + small chip, but the attacker (init 1 →
    // threat 25) is no longer more valuable than the defender (31) — trade on.
    const chaff = unit({
      id: "A", controllerId: "p2", attack: 7, defense: 0, maxHealth: 3,
      initiative: 1, position: 8,
    });
    const decision = chooseComputerAction(
      observation([chaff, wall()], [attackOn("A", "E"), defend("A")]),
    );
    expect(decision?.action.type).toBe("ATTACK_UNIT");
  });
});

describe("combat policy — defend the high-value threatened unit", () => {
  // A (att 5 vs def 6 → 0 damage) pokes for nothing while E's retaliation
  // (9 − 2 = 7) kills it outright; A's threat value (26) is worth keeping.
  const highValue = () =>
    unit({ id: "A", controllerId: "p2", attack: 5, defense: 2, maxHealth: 6, position: 8 });
  const executioner = () =>
    unit({ id: "E", attack: 9, defense: 6, maxHealth: 8, position: 9 });

  it("defends a high-value unit instead of a suicidal 0-damage poke", () => {
    const decision = chooseComputerAction(
      observation([highValue(), executioner()], [attackOn("A", "E"), defend("A")]),
    );
    expect(decision?.action.type).toBe("DEFEND_UNIT");
    expect(decision?.policy).toBe("combat.defend-high-value");
  });

  it("CONTROL: a real strike still beats defending", () => {
    // Same mortal danger, but the attack now lands 2 damage — strike.
    const hitter = unit({
      id: "A", controllerId: "p2", attack: 8, defense: 2, maxHealth: 6, position: 8,
    });
    const decision = chooseComputerAction(
      observation([hitter, executioner()], [attackOn("A", "E"), defend("A")]),
    );
    expect(decision?.action.type).toBe("ATTACK_UNIT");
  });

  it("CONTROL: a low-value unit keeps trading rather than turtling", () => {
    // Same suicidal poke, but the chaff body (threat 17) is not worth a Defend.
    const chaff = unit({
      id: "A", controllerId: "p2", attack: 2, defense: 2, maxHealth: 6, position: 8,
    });
    const decision = chooseComputerAction(
      observation([chaff, executioner()], [attackOn("A", "E"), defend("A")]),
    );
    expect(decision?.action.type).toBe("ATTACK_UNIT");
  });

  it("CONTROL: out of reach, the high-value unit is not defense-locked", () => {
    // The executioner is far away and not ranged — no incoming threat, so the
    // plain wounded-defend baseline applies (attack at 545+ would still win,
    // but here only MOVE/DEFEND are offered and closing distance wins).
    const distantExecutioner = unit({
      id: "E", attack: 9, defense: 6, maxHealth: 8, position: 3,
    });
    const decision = chooseComputerAction(
      observation(
        [highValue(), distantExecutioner],
        [moveTo("A", 9), defend("A")],
      ),
    );
    expect(decision?.action.type).toBe("MOVE_UNIT");
  });
});

describe("combat policy — target value (tier / caster)", () => {
  it("finishes the higher-VALUE (tier) kill among two lethal removals", () => {
    // A (att 8) kills either fragile enemy. BR is the bigger RAW threat
    // (att 6 → base 26) than SV (att 5 → base 23), but SV is a silver-tier body:
    // its tier weight (23+8=31) makes it the better prize, so the removal lands
    // on the silver.
    const attacker = unit({ id: "A", controllerId: "p2", attack: 8, position: 8 });
    const silver = unit({
      id: "SV", grade: "silver", attack: 5, defense: 0, maxHealth: 3,
      initiative: 5, position: 9,
    });
    const bronze = unit({
      id: "BR", grade: "bronze", attack: 6, defense: 0, maxHealth: 3,
      initiative: 5, position: 12,
    });
    const decision = chooseComputerAction(
      observation([attacker, silver, bronze], [attackOn("A", "SV"), attackOn("A", "BR")]),
    );
    expect((decision?.action as { defenderId: string }).defenderId).toBe("SV");

    // CONTROL: neutralize the value layer — make SV bronze too. Its base threat
    // (23) now trails BR's (26), so the choice follows raw threat to the bronze,
    // proving the tier weight drove the first pick.
    const silverAsBronze = unit({
      id: "SV", grade: "bronze", attack: 5, defense: 0, maxHealth: 3,
      initiative: 5, position: 9,
    });
    const control = chooseComputerAction(
      observation([attacker, silverAsBronze, bronze], [attackOn("A", "SV"), attackOn("A", "BR")]),
    );
    expect((control?.action as { defenderId: string }).defenderId).toBe("BR");
  });

  it("hunts the reachable enemy CASTER over an equal-stat plain melee", () => {
    // A (att 10) kills either. CAST carries an activation caster ability
    // (Enchanter heal); PLN is an identical-stat plain body. Reaching the caster
    // with melee this activation earns the hunt bonus, so the removal lands on it.
    const attacker = unit({ id: "A", controllerId: "p2", attack: 10, position: 8 });
    const caster = unit({
      id: "CAST", attack: 5, defense: 0, maxHealth: 3, position: 9,
      abilities: ["enchanter-heal-or-buff"],
    });
    const plain = unit({
      id: "PLN", attack: 5, defense: 0, maxHealth: 3, position: 12, abilities: [],
    });
    const decision = chooseComputerAction(
      observation([attacker, caster, plain], [attackOn("A", "CAST"), attackOn("A", "PLN")]),
    );
    expect((decision?.action as { defenderId: string }).defenderId).toBe("CAST");

    // CONTROL: move the caster ability onto the other body — the pick follows
    // the ABILITY, not the id or stats.
    const casterPlain = unit({
      id: "CAST", attack: 5, defense: 0, maxHealth: 3, position: 9, abilities: [],
    });
    const plainCaster = unit({
      id: "PLN", attack: 5, defense: 0, maxHealth: 3, position: 12,
      abilities: ["enchanter-heal-or-buff"],
    });
    const control = chooseComputerAction(
      observation([attacker, casterPlain, plainCaster], [attackOn("A", "CAST"), attackOn("A", "PLN")]),
    );
    expect((control?.action as { defenderId: string }).defenderId).toBe("PLN");
  });
});

describe("combat policy — focus fire", () => {
  it("chips the enemy the army can FINISH this round, not an unfinishable spread", () => {
    // A chips either identical enemy for 5 of 10 (non-lethal alone). Un-acted
    // ally B (att 7) is adjacent to E1 only — A+B together finish E1 (5+5≥10) —
    // so the damage stacks onto E1 rather than spreading onto E2.
    const attacker = unit({
      id: "A", controllerId: "p2", attack: 7, defense: 2, maxHealth: 10, position: 5,
    });
    const ally = unit({
      id: "B", controllerId: "p2", attack: 7, defense: 2, maxHealth: 10, position: 10,
    });
    const e1 = unit({ id: "E1", attack: 7, defense: 2, maxHealth: 10, position: 6 });
    const e2 = unit({ id: "E2", attack: 7, defense: 2, maxHealth: 10, position: 4 });
    const decision = chooseComputerAction(
      observation([attacker, ally, e1, e2], [attackOn("A", "E1"), attackOn("A", "E2")]),
    );
    expect((decision?.action as { defenderId: string }).defenderId).toBe("E1");

    // CONTROL: move the ally adjacent to E2 instead — now the army can finish E2
    // this round, so the focus-fire flips there.
    const allyAtE2 = unit({
      id: "B", controllerId: "p2", attack: 7, defense: 2, maxHealth: 10, position: 8,
    });
    const control = chooseComputerAction(
      observation([attacker, allyAtE2, e1, e2], [attackOn("A", "E1"), attackOn("A", "E2")]),
    );
    expect((control?.action as { defenderId: string }).defenderId).toBe("E2");
  });
});

describe("combat policy — value-adjusted march", () => {
  it("walks toward the reachable gold target over a nearer, more-wounded low body", () => {
    // Mover M(9). E_HIGH(12, gold) and E_LOW(1, bronze) are both distance 2. Both
    // candidate steps close the nearest-enemy distance equally (2→1), so the
    // focus march decides: it converges on the gold body (value primary) even
    // though the bronze is slightly more wounded.
    const mover = unit({ id: "M", controllerId: "p2", position: 9 });
    const high = unit({
      id: "HI", grade: "gold", attack: 6, defense: 0, maxHealth: 6, damage: 0,
      initiative: 4, position: 12,
    });
    const low = unit({
      id: "LO", grade: "bronze", attack: 6, defense: 0, maxHealth: 10, damage: 6,
      initiative: 6, position: 1,
    });
    const decision = chooseComputerAction(
      observation([mover, high, low], [moveTo("M", 8), moveTo("M", 5)]),
    );
    expect(decision?.action.type).toBe("MOVE_UNIT");
    expect((decision?.action as { destination: number }).destination).toBe(8);

    // CONTROL: neutralize the value layer — make HI bronze too. Now the wounded
    // LO is the higher-priority focus, so the march flips toward it (step to 5).
    const highAsBronze = unit({
      id: "HI", grade: "bronze", attack: 6, defense: 0, maxHealth: 6, damage: 0,
      initiative: 4, position: 12,
    });
    const control = chooseComputerAction(
      observation([mover, highAsBronze, low], [moveTo("M", 8), moveTo("M", 5)]),
    );
    expect((control?.action as { destination: number }).destination).toBe(5);
  });
});

describe("combat policy — EV trade guard (1-damage into lethal retaliation)", () => {
  const wall = () =>
    unit({ id: "E", attack: 5, defense: 4, maxHealth: 14, initiative: 2, position: 9 });

  it("a valuable unit declines a 1-damage poke that invites a lethal retaliation", () => {
    // V (threat 33) chips the wall (threat 31) for 1 of 14 while the counter (5)
    // kills it — value removed (≈2) far below value lost (33). Defend instead.
    const valuable = unit({
      id: "A", controllerId: "p2", attack: 5, defense: 0, maxHealth: 3,
      initiative: 15, position: 8,
    });
    const decision = chooseComputerAction(
      observation([valuable, wall()], [attackOn("A", "E"), defend("A")]),
    );
    expect(decision?.action.type).toBe("DEFEND_UNIT");

    // CONTROL: same 1-damage lethal-retaliation poke, but the attacker (init 1 →
    // threat 19) is no longer worth more than the target — chaff keeps trading.
    const chaff = unit({
      id: "A", controllerId: "p2", attack: 5, defense: 0, maxHealth: 3,
      initiative: 1, position: 8,
    });
    const control = chooseComputerAction(
      observation([chaff, wall()], [attackOn("A", "E"), defend("A")]),
    );
    expect(control?.action.type).toBe("ATTACK_UNIT");
  });
});

describe("combat policy — do not wake a skippable paralyzed enemy", () => {
  const paralyzed = (tokens: boolean) =>
    unit({
      id: "E", attack: 4, defense: 2, maxHealth: 10, position: 9,
      activatedThisRound: false,
      tokens: tokens
        ? [{ id: "t", kind: "paralysis", amount: 0, sourceName: "Blind" }]
        : [],
    });

  it("does not spend a non-lethal chip to wake a paralyzed, still-skippable enemy", () => {
    // A can only chip E (3 of 10) — not kill it, and no ally can finish it. E is
    // paralyzed and has not acted, so leaving it lets it skip its activation.
    const attacker = unit({
      id: "A", controllerId: "p2", attack: 5, defense: 3, maxHealth: 8, position: 8,
    });
    const decision = chooseComputerAction(
      observation([attacker, paralyzed(true)], [attackOn("A", "E"), defend("A")]),
    );
    expect(decision?.action.type).toBe("DEFEND_UNIT");

    // CONTROL: a LETHAL hit removes the unit entirely — the wake-up is moot, so
    // the kill is taken.
    const executioner = unit({
      id: "A", controllerId: "p2", attack: 12, defense: 3, maxHealth: 8, position: 8,
    });
    const lethal = chooseComputerAction(
      observation([executioner, paralyzed(true)], [attackOn("A", "E"), defend("A")]),
    );
    expect(lethal?.action.type).toBe("ATTACK_UNIT");

    // CONTROL: the same non-lethal chip on a NON-paralyzed enemy is taken — the
    // Paralysis token is exactly what suppresses the poke.
    const attacker2 = unit({
      id: "A", controllerId: "p2", attack: 5, defense: 3, maxHealth: 8, position: 8,
    });
    const noToken = chooseComputerAction(
      observation([attacker2, paralyzed(false)], [attackOn("A", "E"), defend("A")]),
    );
    expect(noToken?.action.type).toBe("ATTACK_UNIT");
  });
});

describe("combat policy — closing distance", () => {
  it("advances toward the enemy when no attack is in reach, but never below a defend", () => {
    // Mover at A1(0), enemy at D1(3), Manhattan distance 3. B1(1) is distance 2
    // (closer); A2(4) is distance 4 (farther). DEFEND is the foundation exit.
    const mover = unit({ id: "M", controllerId: "p2", position: 0 });
    const enemy = unit({ id: "E", attack: 4, position: 3 });

    const advance = chooseComputerAction(
      observation([mover, enemy], [moveTo("M", 1), moveTo("M", 4), defend("M")]),
    );
    expect(advance?.action.type).toBe("MOVE_UNIT");
    expect((advance?.action as { destination: number }).destination).toBe(1);
    expect(advance?.policy).toBe("combat.close-distance");

    // CONTROL: without a distance-reducing move, defending in place beats
    // wandering to the farther cell — the unit never flees.
    const hold = chooseComputerAction(
      observation([mover, enemy], [moveTo("M", 4), defend("M")]),
    );
    expect(hold?.action.type).toBe("DEFEND_UNIT");
  });

  it("takes the safe approach instead of stepping into an unsupported surround", () => {
    const mover = unit({ id: "M", controllerId: "p2", position: 18 });
    const first = unit({ id: "E1", attack: 6, position: 9 });
    const second = unit({ id: "E2", attack: 6, position: 12 });
    const decision = chooseComputerAction(
      observation(
        [mover, first, second],
        [moveTo("M", 13), moveTo("M", 14)],
      ),
    );
    expect((decision?.action as { destination: number }).destination).toBe(14);
  });

  it.each([
    ["Hydras", "hydra-multi-attack"],
    ["Cerberi", "cerberi-second-head"],
  ])("lets Pack %s occupy a two-target surround", (_name, abilityId) => {
    const mover = unit({
      id: "M",
      controllerId: "p2",
      defense: 2,
      maxHealth: 10,
      position: 18,
      abilities: ["ignores-retaliation", abilityId],
    });
    const first = unit({ id: "E1", attack: 6, position: 9 });
    const second = unit({ id: "E2", attack: 6, position: 12 });
    const decision = chooseComputerAction(
      observation(
        [mover, first, second],
        [moveTo("M", 13), moveTo("M", 14)],
      ),
    );
    expect((decision?.action as { destination: number }).destination).toBe(13);
  });

  it("occupies a flying landing lane to screen a threatened shooter", () => {
    const mover = unit({ id: "M", controllerId: "p2", position: 13 });
    const shooter = unit({
      id: "R",
      controllerId: "p2",
      type: "ranged",
      position: 18,
    });
    const flyer = unit({ id: "F", type: "flying", attack: 7, position: 10 });
    const decision = chooseComputerAction(
      observation(
        [mover, shooter, flyer],
        [moveTo("M", 14), moveTo("M", 9)],
      ),
    );
    expect((decision?.action as { destination: number }).destination).toBe(14);
  });
});

describe("combat policy — strategic Defend invariant", () => {
  it("sometimes holds a PvP chip when retaliation plus follow-up is fatal", () => {
    const attacker = unit({
      id: "A",
      controllerId: "p2",
      attack: 5,
      defense: 0,
      maxHealth: 12,
      initiative: 8,
      position: 5,
    });
    const defender = unit({
      id: "E1",
      attack: 5,
      defense: 3,
      maxHealth: 10,
      position: 6,
    });
    const follower = unit({
      id: "E2",
      type: "ranged",
      attack: 8,
      maxHealth: 8,
      position: 15,
    });
    const observed = observation(
      [attacker, defender, follower],
      [attackOn("A", "E1"), defend("A")],
    );
    observed.state.combat!.context = {
      kind: "player",
      attackerHeroId: "hero-p2",
      defenderHeroId: "hero-p1",
      fieldId: "h:0:0",
    };
    observed.state.combat!.attackerPlayerId = "p2";
    observed.state.combat!.defenderPlayerId = "p1";
    expect(chooseComputerAction(observed)?.action.type).toBe("DEFEND_UNIT");

    // CONTROL: once the ranged follower has already acted, the same attacker
    // survives the retaliation/next-activation estimate and takes its strike.
    const spentFollower = unit({
      ...follower,
      id: "E2",
      activatedThisRound: true,
    });
    const control = observation(
      [attacker, defender, spentFollower],
      [attackOn("A", "E1"), defend("A")],
    );
    control.state.combat!.context = observed.state.combat!.context;
    control.state.combat!.attackerPlayerId = "p2";
    control.state.combat!.defenderPlayerId = "p1";
    expect(chooseComputerAction(control)?.action.type).toBe("ATTACK_UNIT");
  });

  it("defends when outnumbered by two live attackers", () => {
    const defender = unit({
      id: "A",
      controllerId: "p2",
      grade: "gold",
      attack: 4,
      defense: 2,
      maxHealth: 8,
      position: 5,
    });
    const left = unit({ id: "E1", attack: 8, defense: 7, position: 4 });
    const right = unit({ id: "E2", attack: 8, defense: 7, position: 6 });
    const decision = chooseComputerAction(
      observation(
        [defender, left, right],
        [attackOn("A", "E1"), defend("A")],
      ),
    );
    expect(decision?.action.type).toBe("DEFEND_UNIT");
  });

  it("hard-rejects consecutive Defend even if it is offered synthetically", () => {
    const defender = unit({
      id: "A",
      controllerId: "p2",
      defendedLastActivation: true,
    });
    const score = scoreCombatAction(observation([defender], []), {
      type: "DEFEND_UNIT",
      playerId: "p2",
      unitId: "A",
    } as GameAction);
    expect(score?.score).toBe(-1_000);
    expect(score?.policy).toBe("combat.defend-consecutive-refuse");
  });
});

const commanderCast = (unitId: string, abilityId: string): GameAction =>
  ({
    type: "USE_UNIT_ABILITY",
    playerId: "p2",
    unitId,
    abilityId,
    target: { type: "none" },
  }) as GameAction;

describe("combat policy — WOG commander activation cast (gap 4)", () => {
  it("prefers a heal that swings the fight; a healthy-ally cast is a marginal skip", () => {
    // soul_eater commander carries a heal cast. A badly wounded ally is on the
    // board and the only enemy is far, so this melee commander would have to WALK
    // to attack — but the big heal is worth more than the walk, so it still casts
    // (the movement-lock penalty is waived for a swing cast).
    const cmdr = unit({
      id: "C",
      controllerId: "p2",
      commanderSlug: "soul_eater",
      position: 8,
      type: "ground",
    } as Partial<CombatUnitState> & { id: string });
    const woundedAlly = unit({
      id: "ALLY",
      controllerId: "p2",
      maxHealth: 6,
      damage: 4,
      position: 5,
    });
    const farEnemy = unit({ id: "E", controllerId: "p1", position: 19 });

    const heal = scoreCombatAction(
      observation([cmdr, woundedAlly, farEnemy], []),
      commanderCast("C", "commander-cast-soul_eater"),
    );
    expect(heal?.policy).toBe("combat.commander-cast");
    expect(heal!.score).toBeGreaterThan(640); // a real heal — swings the fight

    // CONTROL: same board, HEALTHY ally. The cast now heals nothing, and the
    // melee commander with no adjacent enemy is stranded from its walk, so the
    // movement-lock penalty drops the cast far below — proving the heal size +
    // swing gate, not the cast itself, drove the first score.
    const healthyAlly = unit({
      id: "ALLY",
      controllerId: "p2",
      maxHealth: 6,
      damage: 0,
      position: 5,
    });
    const marginal = scoreCombatAction(
      observation([cmdr, healthyAlly, farEnemy], []),
      commanderCast("C", "commander-cast-soul_eater"),
    );
    expect(marginal!.score).toBeLessThan(500);
    expect(marginal!.score).toBeLessThan(heal!.score - 100);
  });

  it("buffs before an in-place strike, but not when the buff would strand a needed walk", () => {
    // brute commander carries an attack-buff cast. With an ADJACENT enemy the
    // commander can buff and then strike this same activation — a clear swing.
    const cmdr = unit({
      id: "C",
      controllerId: "p2",
      commanderSlug: "brute",
      position: 8,
      type: "ground",
    } as Partial<CombatUnitState> & { id: string });
    const adjacentEnemy = unit({ id: "E", controllerId: "p1", position: 9 });

    const buffThenStrike = scoreCombatAction(
      observation([cmdr, adjacentEnemy], []),
      commanderCast("C", "commander-cast-brute"),
    );
    expect(buffThenStrike?.policy).toBe("combat.commander-cast");
    expect(buffThenStrike!.score).toBeGreaterThan(620); // buff, then attack in place

    // CONTROL: the only enemy is now far. A melee commander must WALK to fight,
    // and the cast LOCKS movement — so buffing loses to MOVE_AND_ATTACK (620+) and
    // the score drops below a real strike so the runner walks in instead.
    const farEnemy = unit({ id: "E", controllerId: "p1", position: 19 });
    const strandedBuff = scoreCombatAction(
      observation([cmdr, farEnemy], []),
      commanderCast("C", "commander-cast-brute"),
    );
    expect(strandedBuff!.score).toBeLessThan(500);
    expect(strandedBuff!.score).toBeLessThan(buffThenStrike!.score - 100);
  });
});
