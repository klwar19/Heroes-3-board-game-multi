import { describe, expect, it } from "vitest";
import { applyAction, createAdventureGameState, createInitialGameState, getLegalActions } from "./index";
import { startAdventureRound } from "./adventure";
import { pumpAdventureQueues } from "./adventure-reducer";
import { makeCommanderCombatUnit } from "./commanders";
import type { GameAction, GameState, PlayerId } from "./state";

/**
 * The two Rampart war-machine Astrologers proclamations, engine-enforced end to
 * end (CLAUDE.md #1 — every assertion below fails if its wiring is deleted):
 *
 *   - McGiver (GRANT_WAR_MACHINE_CHOICE): at the next Resource round each player
 *     may take one War Machine of their choice from the shared supply for free.
 *   - Ammo Cart (WAR_MACHINE_BUFF): while face up, every Ballista deals +1, every
 *     First Aid Tent heals +1, and an Ammo Cart owner's ranged units may reroll 1
 *     Attack die.
 *
 * McGiver is driven through the real Resource-round → reward-queue → visit-step
 * flow; Ammo Cart's three clauses are read where the engine actually applies them
 * (the war-machine round, the permanent-combat-effect seed, and the attack-reroll
 * pool builder).
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

/** Minimal adventure substate so getActiveAstrologersCard returns this card. */
function setProclamation(state: GameState, cardId: string | null): void {
  state.adventure = {
    astrologers: {
      activeCardId: cardId,
      nextResourceModifiers: { gold: 0, valuables: 0 },
      crazyWizardUsedBy: [],
      swiftWeaselUsedBy: []
    }
  } as unknown as GameState["adventure"];
}

function visitOptionLabels(state: GameState, playerId: PlayerId): string[] {
  return getLegalActions(state, playerId)
    .filter((entry) => entry.action.type === "RESOLVE_VISIT_STEP")
    .map((entry) => entry.label);
}

function chooseVisitOption(state: GameState, playerId: PlayerId, match: RegExp): GameState {
  const legal = getLegalActions(state, playerId).find(
    (entry) => entry.action.type === "RESOLVE_VISIT_STEP" && match.test(entry.label)
  );
  expect(legal, `expected a visit option matching ${match}`).toBeTruthy();
  return applyOk(state, legal!.action);
}

// ===========================================================================
// McGiver — free War Machine of choice at the next Resource round
// ===========================================================================

describe("Astrologers — McGiver (free War Machine next round)", () => {
  function resourceRoundWithMcGiver(): GameState {
    const state = createAdventureGameState({ seed: "mcgiver", difficulty: "normal", rollFirstPlayer: false, events: false });
    // Round 3 is a Resource round (odd, > 1); the proclamation is still face up.
    state.round = 3;
    state.adventure!.astrologers = {
      activeCardId: "astrologers.mcgiver",
      nextResourceModifiers: { gold: 0, valuables: 0 },
      crazyWizardUsedBy: [],
      swiftWeaselUsedBy: []
    };
    return state;
  }

  it("queues a war-machine grant offer for each human player at the Resource round", () => {
    const state = resourceRoundWithMcGiver();
    startAdventureRound(state);

    const offers = (state.adventure?.rewardQueue ?? []).filter(
      (reward) => reward.kind === "visit-steps" && reward.steps[0]?.type === "WAR_MACHINE_GRANT_OFFER"
    );
    expect(offers.map((offer) => offer.playerId).sort()).toEqual(["p1", "p2"]);
  });

  it("lets a player take one machine of their choice for free; the catalog is NOT depleted", () => {
    const state = resourceRoundWithMcGiver();
    const supplyBefore = [...(state.adventure!.warMachineSupply ?? [])];
    expect(supplyBefore).toContain("war_machine.ballista");

    startAdventureRound(state);
    pumpAdventureQueues(state);

    expect(state.adventure?.pendingVisit?.playerId).toBe("p1");
    const labels = visitOptionLabels(state, "p1");
    expect(labels.some((label) => /Take Ballista \(free\)/.test(label))).toBe(true);
    expect(labels).toContain("Skip");

    const goldBefore = state.players.p1.resources.gold;
    const next = chooseVisitOption(state, "p1", /Take Ballista \(free\)/);

    expect(next.players.p1.hand).toContain("war_machine.ballista");
    // HOUSE RULE: per-player catalog — taking a machine never removes it for the
    // rest of the table, so it stays in the shared catalog.
    expect(next.adventure?.warMachineSupply).toContain("war_machine.ballista");
    // "At no cost" — the take is free.
    expect(next.players.p1.resources.gold).toBe(goldBefore);
  });

  it("per-player catalog: a later player CAN still take a machine an earlier player took", () => {
    const state = resourceRoundWithMcGiver();
    startAdventureRound(state);
    pumpAdventureQueues(state);

    // p1 takes the Ballista...
    const afterP1 = chooseVisitOption(state, "p1", /Take Ballista \(free\)/);
    // ...then p2's offer opens, and the Ballista is STILL there for p2 to take.
    expect(afterP1.adventure?.pendingVisit?.playerId).toBe("p2");
    const p2Labels = visitOptionLabels(afterP1, "p2");
    expect(p2Labels.some((label) => /Take Ballista \(free\)/.test(label))).toBe(true);

    const afterP2 = chooseVisitOption(afterP1, "p2", /Take Ballista \(free\)/);
    // BOTH players own their own Ballista.
    expect(afterP2.players.p1.hand).toContain("war_machine.ballista");
    expect(afterP2.players.p2.hand).toContain("war_machine.ballista");
  });

  it("is optional — Skip takes nothing and leaves the supply intact", () => {
    const state = resourceRoundWithMcGiver();
    const supplyBefore = [...(state.adventure!.warMachineSupply ?? [])];
    startAdventureRound(state);
    pumpAdventureQueues(state);

    const next = chooseVisitOption(state, "p1", /^Skip$/);
    expect(next.players.p1.hand.filter((id) => id.startsWith("war_machine."))).toEqual([]);
    // Skipping p1 does not consume any machine; the supply still holds them all.
    for (const cardId of supplyBefore) {
      expect(next.adventure?.warMachineSupply).toContain(cardId);
    }
  });

  it("offers nothing when the supply is empty", () => {
    const state = resourceRoundWithMcGiver();
    state.adventure!.warMachineSupply = [];
    startAdventureRound(state);
    pumpAdventureQueues(state);

    expect(state.adventure?.pendingVisit).toBeNull();
    const grantOffers = (state.adventure?.rewardQueue ?? []).filter(
      (reward) => reward.kind === "visit-steps" && reward.steps[0]?.type === "WAR_MACHINE_GRANT_OFFER"
    );
    expect(grantOffers).toEqual([]);
  });

  it("does not fire on a normal Resource round without McGiver up", () => {
    const state = resourceRoundWithMcGiver();
    state.adventure!.astrologers!.activeCardId = "astrologers.dead_silence";
    startAdventureRound(state);

    const offers = (state.adventure?.rewardQueue ?? []).filter(
      (reward) => reward.kind === "visit-steps" && reward.steps[0]?.type === "WAR_MACHINE_GRANT_OFFER"
    );
    expect(offers).toEqual([]);
  });
});

// ===========================================================================
// Ammo Cart — Ballista deals +1 damage
// ===========================================================================

/** END_COMBAT_ROUND with the active unit cleared, so the war-machine round fires. */
function endRound(state: GameState, playerId: PlayerId): GameState {
  state.combat!.activeUnitId = null;
  state.activePlayerId = playerId;
  return applyOk(state, { type: "END_COMBAT_ROUND", playerId });
}

/** Makes `unitId` the uniquely slowest enemy and tanky enough to read the damage. */
function singleSlowest(state: GameState, unitId: string): void {
  const units = state.combat!.units;
  let next = 8;
  for (const id of Object.keys(units)) {
    if (units[id].controllerId === "p2") {
      units[id].initiative = id === unitId ? 1 : next--;
    }
  }
  units[unitId].maxHealth = 12;
  units[unitId].damage = 0;
}

describe("Astrologers — Ammo Cart: Ballista +1 damage", () => {
  function ballistaSetup(proclamation: string | null): GameState {
    const state = createInitialGameState("ammo-cart-ballista");
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    state.players.p1.permanents = ["war_machine.ballista"];
    singleSlowest(state, "unit_p2_dread_knights");
    setProclamation(state, proclamation);
    return state;
  }

  it("a Ballista fires 1 at the slowest enemy without the proclamation", () => {
    const fired = endRound(ballistaSetup(null), "p1");
    expect(fired.combat!.units.unit_p2_dread_knights.damage).toBe(1);
  });

  it("Ammo Cart makes the same Ballista shot deal 2", () => {
    const fired = endRound(ballistaSetup("astrologers.ammo_cart"), "p1");
    expect(fired.combat!.units.unit_p2_dread_knights.damage).toBe(2);
  });

  it("a non-war-machine proclamation leaves Ballista damage at 1", () => {
    const fired = endRound(ballistaSetup("astrologers.dead_silence"), "p1");
    expect(fired.combat!.units.unit_p2_dread_knights.damage).toBe(1);
  });

  it.each([
    ["classic", {}, "expert", 1, 6],
    ["Polish Basic", { "polish-card-balance": true }, "basic", 0, 4],
    ["Polish Expert", { "polish-card-balance": true }, "expert", 1, 6],
    ["Community", { "community-card-balance": true }, "expert", 1, 6],
    [
      "Community precedence when both packs are on",
      { "polish-card-balance": true, "community-card-balance": true },
      "expert",
      1,
      6
    ]
  ] as const)("stacks with %s Artillery for the correct complete volley", (_name, rules, mode, crowns, expected) => {
    let state = ballistaSetup("astrologers.ammo_cart");
    state.adventure!.houseRules = { ...rules };
    state.players.p1.hand = ["ability.artillery"];
    state.players.p1.limits.expertUses = crowns;

    state = endRound(state, "p1");
    const volley = getLegalActions(state, "p1").find(
      (legal) => legal.label.includes("Artillery") && legal.label.includes(`(${mode})`)
    );
    expect(volley, `${_name} ${mode} volley should be offered`).toBeTruthy();
    state = applyOk(state, volley!.action);

    // Balance printings grant free aim, so finish their target choice. Classic
    // has one uniquely slowest target and resolves immediately.
    if (state.pendingChoice?.type === "ABILITY_TARGET_CHOICE") {
      state = applyOk(state, {
        type: "CHOOSE_ABILITY_TARGET",
        playerId: "p1",
        choiceId: state.pendingChoice.id,
        targetUnitId: "unit_p2_dread_knights"
      });
    }
    expect(state.combat!.units.unit_p2_dread_knights.damage).toBe(expected);
  });

  it.each([
    "specialty.torosar.1",
    "specialty.tarnum_castle.1",
    "specialty.gerwulf.1"
  ])("buffs the immediate physical Ballista fired by %s", (cardId) => {
    const state = ballistaSetup("astrologers.ammo_cart");
    state.players.p1.hand = [cardId];
    const play = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === cardId && legal.action.optionIndex === 1
    );
    expect(play).toBeTruthy();
    const fired = applyOk(state, play!.action);
    expect(fired.combat!.units.unit_p2_dread_knights.damage).toBe(2);
  });

  it("buffs every Ballista in Torosar VI's activate-all volley", () => {
    const state = ballistaSetup("astrologers.ammo_cart");
    state.players.p1.hand = ["specialty.torosar.6"];
    const play = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "specialty.torosar.6"
    );
    expect(play).toBeTruthy();
    const fired = applyOk(state, play!.action);
    // One physical Ballista + the specialty's additional Ballista, 2 damage each.
    expect(fired.combat!.units.unit_p2_dread_knights.damage).toBe(4);
  });

  it("buffs Tarnum IV's additional Ballista when it fires at round start", () => {
    let state = ballistaSetup("astrologers.ammo_cart");
    state.players.p1.hand = ["specialty.tarnum_castle.4"];
    const grant = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "PLAY_CARD" &&
        legal.action.cardId === "specialty.tarnum_castle.4" &&
        legal.action.optionIndex === 0
    );
    expect(grant).toBeTruthy();
    state = applyOk(state, grant!.action);
    state = endRound(state, "p1");
    // The standing machine and Tarnum's additional one each fire for 2.
    expect(state.combat!.units.unit_p2_dread_knights.damage).toBe(4);
  });

  it.each([
    ["specialty.gerwulf.4", 1, 3],
    ["specialty.gerwulf.6", 1, 4]
  ] as const)("buffs the physical Ballista sacrificed by %s", (cardId, optionIndex, expected) => {
    const state = ballistaSetup("astrologers.ammo_cart");
    state.players.p1.hand = [cardId];
    const play = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "PLAY_CARD" &&
        legal.action.cardId === cardId &&
        legal.action.optionIndex === optionIndex &&
        legal.action.target?.type === "unit" &&
        legal.action.target.unitId === "unit_p2_dread_knights"
    );
    expect(play).toBeTruthy();
    const fired = applyOk(state, play!.action);
    expect(fired.combat!.units.unit_p2_dread_knights.damage).toBe(expected);
    expect(fired.players.p1.permanents).not.toContain("war_machine.ballista");
  });

  it("does not boost Ballista-named specialty damage when no Ballista deals it", () => {
    const state = ballistaSetup("astrologers.ammo_cart");
    state.players.p1.hand = ["specialty.tarnum_castle.6"];
    // Exactly two living enemies makes Tarnum VI resolve both printed hits
    // immediately; this effect neither fires nor sacrifices a Ballista.
    state.combat!.units.unit_p2_skeletons.damage = state.combat!.units.unit_p2_skeletons.maxHealth;
    const play = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "specialty.tarnum_castle.6"
    );
    expect(play).toBeTruthy();
    const fired = applyOk(state, play!.action);
    expect(fired.combat!.units.unit_p2_dread_knights.damage).toBe(2);
    expect(fired.combat!.units.unit_p2_vampires.damage).toBe(2);
  });

  it("keeps Gerwulf VI's aim freedom while applying the bonus to the aimed shot", () => {
    let state = ballistaSetup("astrologers.ammo_cart");
    state.players.p1.hand = ["specialty.gerwulf.6"];
    const aim = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "PLAY_CARD" &&
        legal.action.cardId === "specialty.gerwulf.6" &&
        legal.action.optionIndex === 0
    );
    expect(aim).toBeTruthy();
    state = applyOk(state, aim!.action);
    state = endRound(state, "p1");
    expect(state.pendingChoice?.type).toBe("ABILITY_TARGET_CHOICE");
    state = applyOk(state, {
      type: "CHOOSE_ABILITY_TARGET",
      playerId: "p1",
      choiceId: state.pendingChoice!.id,
      targetUnitId: "unit_p2_vampires"
    });
    expect(state.combat!.units.unit_p2_vampires.damage).toBe(2);
    expect(state.combat!.units.unit_p2_dread_knights.damage).toBe(0);
  });

  it("combines with the Ogre Leader's target choice, but stops when that commander falls", () => {
    const setup = (commanderDamage: number) => {
      const state = ballistaSetup("astrologers.ammo_cart");
      state.wog = { enabled: true, commanders: true, newObjects: false, newCreatures: false, artifacts: false };
      state.players.p1.commander = {
        slug: "ogre_leader",
        grades: { attack: 0, defense: 0, health: 0, damage: 0, magic: 0, speed: 0 }
      };
      const commander = makeCommanderCombatUnit(state.players.p1, 9)!;
      commander.damage = commanderDamage;
      state.combat!.units[commander.id] = commander;
      return state;
    };

    let aimed = endRound(setup(0), "p1");
    expect(aimed.pendingChoice?.type).toBe("ABILITY_TARGET_CHOICE");
    expect(
      aimed.pendingChoice?.type === "ABILITY_TARGET_CHOICE"
        ? aimed.pendingChoice.candidateUnitIds
        : []
    ).toContain("unit_p2_vampires");
    aimed = applyOk(aimed, {
      type: "CHOOSE_ABILITY_TARGET",
      playerId: "p1",
      choiceId: aimed.pendingChoice!.id,
      targetUnitId: "unit_p2_vampires"
    });
    expect(aimed.combat!.units.unit_p2_vampires.damage).toBe(2);

    const fallenSetup = setup(999);
    const fallen = endRound(fallenSetup, "p1");
    expect(fallen.pendingChoice).toBeNull();
    expect(fallen.combat!.units.unit_p2_dread_knights.damage).toBe(2);
    expect(fallen.combat!.units.unit_p2_vampires.damage).toBe(0);
  });
});

// ===========================================================================
// Ammo Cart — First Aid Tent heals +1
// ===========================================================================

describe("Astrologers — Ammo Cart: First Aid Tent +1 heal", () => {
  function tentSetup(proclamation: string | null): GameState {
    const state = createInitialGameState("ammo-cart-first-aid");
    state.players.p1.hand = ["war_machine.first_aid_tent"];
    state.players.p2.hand = [];
    state.players.p1.permanents = [];
    const wounded = state.combat!.units.unit_p1_crusaders;
    wounded.maxHealth = 8;
    wounded.damage = 5;
    // The proclamation must be face up BEFORE the Tent is played: the heal amount
    // is fixed when the permanent's combat effect is seeded.
    setProclamation(state, proclamation);
    return applyOk(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "war_machine.first_aid_tent",
      target: { type: "none" }
    });
  }

  function basicHeal(state: GameState): GameState {
    const effect = state.activeEffects.find((candidate) => candidate.name === "First Aid Tent");
    expect(effect, "the Tent's heal effect should be seeded").toBeTruthy();
    return applyOk(state, {
      type: "USE_ACTIVE_EFFECT",
      playerId: "p1",
      effectId: effect!.id,
      target: { type: "unit", unitId: "unit_p1_crusaders" }
    });
  }

  it("heals 1 without the proclamation (5 damage -> 4)", () => {
    const healed = basicHeal(tentSetup(null));
    expect(healed.combat!.units.unit_p1_crusaders.damage).toBe(4);
  });

  it("Ammo Cart makes the Tent heal 2 (5 damage -> 3)", () => {
    const healed = basicHeal(tentSetup("astrologers.ammo_cart"));
    expect(healed.combat!.units.unit_p1_crusaders.damage).toBe(3);
  });

  it("stacks in the correct order with Gem VI: double the boosted Tent effect", () => {
    let state = tentSetup("astrologers.ammo_cart");
    state.players.p1.hand = ["specialty.gem.6"];
    const double = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "specialty.gem.6"
    );
    expect(double, "Gem VI should be playable with the Tent in play").toBeTruthy();
    state = applyOk(state, double!.action);
    state = basicHeal(state);
    // (Tent 1 + proclamation 1) × Gem VI 2 = 4.
    expect(state.combat!.units.unit_p1_crusaders.damage).toBe(1);
  });
});

// ===========================================================================
// Ammo Cart — ranged units may reroll 1 Attack die (when you own an Ammo Cart)
// ===========================================================================

const ATTACK_MARKSMEN: Extract<GameAction, { type: "ATTACK_UNIT" }> = {
  type: "ATTACK_UNIT",
  playerId: "p1",
  attackerId: "unit_p1_marksmen",
  defenderId: "unit_p2_skeletons"
};

describe("Astrologers — Ammo Cart: ranged Attack-die reroll", () => {
  /** p1 Marksmen (ranged) shoot a distant p2 Skeletons; the attack roll is a "0". */
  function rangedSetup(opts: { proclamation: string | null; ownsCart: boolean }): GameState {
    const state = createInitialGameState("ammo-cart-reroll");
    const attacker = state.combat!.units.unit_p1_marksmen;
    attacker.abilities = []; // strip any unit-ability rerolls so only Ammo Cart can fire
    attacker.attack = 3;
    attacker.position = 1;
    const defender = state.combat!.units.unit_p2_skeletons;
    defender.abilities = [];
    defender.position = 13; // non-adjacent → a ranged shot, no retaliation
    defender.defense = 0;
    defender.maxHealth = 20;
    defender.damage = 0;
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    state.players.p1.morale = 0; // no morale-token reroll
    state.players.p1.permanents = opts.ownsCart ? ["war_machine.ammo_cart"] : [];
    state.combat!.dice.scriptedRolls = [0];
    state.combat!.dice.rollCount = 0;
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_marksmen";
    setProclamation(state, opts.proclamation);
    return state;
  }

  /** Whether attacking offers an "Ammo Cart" Attack-die reroll source. */
  function ammoCartRerollOffered(state: GameState, action = ATTACK_MARKSMEN): boolean {
    let current = applyOk(state, action);
    let safety = 20;
    while (safety-- > 0) {
      if (current.pendingChoice?.type === "ATTACK_DIE_REROLL") {
        return current.pendingChoice.rerollSources.some((source) => source.name === "Ammo Cart");
      }
      if (current.reactionWindow) {
        current = applyOk(current, {
          type: "PASS_REACTION",
          playerId: current.reactionWindow.priorityPlayerId
        });
        continue;
      }
      break;
    }
    return false;
  }

  it("offers a ranged unit the Ammo Cart reroll when its owner fields one", () => {
    expect(ammoCartRerollOffered(rangedSetup({ proclamation: "astrologers.ammo_cart", ownsCart: true }))).toBe(true);
  });

  it("does not offer it without the proclamation face up", () => {
    expect(ammoCartRerollOffered(rangedSetup({ proclamation: null, ownsCart: true }))).toBe(false);
  });

  it("does not offer it when the player owns no Ammo Cart", () => {
    expect(ammoCartRerollOffered(rangedSetup({ proclamation: "astrologers.ammo_cart", ownsCart: false }))).toBe(false);
  });

  it("does not offer it to a non-ranged unit", () => {
    const state = rangedSetup({ proclamation: "astrologers.ammo_cart", ownsCart: true });
    // Same owner + cart + proclamation, but the attacker is no longer ranged.
    state.combat!.units.unit_p1_marksmen.type = "ground";
    state.combat!.units.unit_p2_skeletons.position = 5; // adjacent → a legal melee swing
    expect(ammoCartRerollOffered(state)).toBe(false);
  });
});
