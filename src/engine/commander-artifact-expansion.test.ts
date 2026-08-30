import { describe, expect, it } from "vitest";
import { COMMANDER_ARTIFACT_SPECS, aggregateCommanderArtifactBonuses } from "@/data/wog/commander-artifacts";
import { abilityFxPlans } from "@/data/fx";
import { applyAction, commanderUnitId, createAdventureGameState, createInitialGameState, getLegalActions, makeCommanderCombatUnit } from "./index";
import { markUnitRemovedIfNeeded } from "./combat-units";
import {
  commanderArtifactTierForDungeonFloor,
  commanderArtifactTierForNeutralVictory,
  queueNeutralCommanderArtifactOffer
} from "./commander-artifacts";
import { pumpAdventureQueues } from "./adventure-reducer";
import type { CommanderArtifactSlot, GameAction, GameState } from "./state";

const WOG_ON = { enabled: true, commanders: true, newObjects: false, newCreatures: false, artifacts: true };

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function settle(state: GameState): GameState {
  let current = state;
  let safety = 30;
  while (safety-- > 0 && (current.reactionWindow || current.pendingChoice?.type === "ATTACK_DIE_REROLL")) {
    if (current.reactionWindow) {
      current = apply(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
    } else if (current.pendingChoice?.type === "ATTACK_DIE_REROLL") {
      current = apply(current, {
        type: "CHOOSE_PENDING_ROLL",
        playerId: current.pendingChoice.playerId,
        choiceId: current.pendingChoice.id,
        candidateIndex: current.pendingChoice.candidates.length - 1
      });
    }
  }
  return current;
}

function combatWithArtifact(cardId: string, slot: CommanderArtifactSlot, position = 9): GameState {
  const state = createInitialGameState(`commander-artifact-${cardId}`);
  state.wog = { ...WOG_ON };
  state.players.p1.commander = {
    slug: "paladin",
    grades: { attack: 0, defense: 0, health: 0, damage: 0, magic: 0, speed: 0 },
    artifacts: { [slot]: cardId }
  };
  const commander = makeCommanderCombatUnit(state.players.p1, position)!;
  state.combat!.units[commander.id] = commander;
  state.players.p1.hand = [];
  state.players.p2.hand = [];
  return state;
}

function commanderStrike(cardId: string, slot: CommanderArtifactSlot, rolls: number[] = [0, 0]): GameState {
  const state = combatWithArtifact(cardId, slot);
  const commander = state.combat!.units[commanderUnitId("p1")];
  const target = state.combat!.units.unit_p2_skeletons;
  target.abilities = [];
  target.position = 10;
  target.defense = 0;
  target.maxHealth = 30;
  target.damage = 0;
  target.retaliatedThisRound = true;
  state.combat!.activeUnitId = commander.id;
  state.activePlayerId = "p1";
  state.combat!.dice.scriptedRolls = rolls;
  state.combat!.dice.rollCount = 0;
  return settle(apply(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId: commander.id, defenderId: target.id }));
}

describe("Commander Forge", () => {
  function mapState(seed: string): GameState {
    const state = createAdventureGameState({
      seed,
      ruleset: "binh",
      wog: WOG_ON,
      rollFirstPlayer: false,
      players: [
        { id: "p1", name: "One", factionId: "castle" as never, heroDefId: "catherine" },
        { id: "p2", name: "Two", factionId: "necropolis" as never }
      ]
    });
    state.activePlayerId = "p1";
    state.players.p1.resources.gold = 30;
    for (const player of Object.values(state.players)) {
      player.canMulligan = false;
      player.needsHandRefresh = false;
    }
    return state;
  }

  function forgeActions(state: GameState) {
    return getLegalActions(state, "p1").filter(
      (legal): legal is typeof legal & { action: Extract<GameAction, { type: "FORGE_COMMANDER_ARTIFACT" }> } =>
        legal.action.type === "FORGE_COMMANDER_ARTIFACT"
    );
  }

  it("offers exactly two Grade-I choices from round 2, charges 5 gold, and spends that lifetime use", () => {
    const state = mapState("forge-minor");
    state.round = 1;
    expect(forgeActions(state)).toHaveLength(0);
    state.round = 2;
    const offers = forgeActions(state);
    expect(offers).toHaveLength(2);
    expect(offers.every((offer) => offer.action.tier === "minor")).toBe(true);
    const after = apply(state, offers[0]!.action);
    expect(after.players.p1.resources.gold).toBe(25);
    expect(after.players.p1.hand).toContain(offers[0]!.action.cardId);
    expect(after.players.p1.commander?.forgeMinorUsed).toBe(true);
    expect(forgeActions(after).filter((offer) => offer.action.tier === "minor")).toHaveLength(0);
  });

  it("unlocks Grade II in round 7 and Grade III in round 9 with random-or-+2-specific pricing", () => {
    const state = mapState("forge-high");
    state.round = 7;
    let offers = forgeActions(state);
    expect(offers.filter((offer) => offer.action.tier === "major")).toHaveLength(2);
    expect(offers.filter((offer) => offer.action.tier === "relic")).toHaveLength(0);

    state.round = 9;
    offers = forgeActions(state);
    const randomRelics = offers.filter((offer) => offer.action.tier === "relic" && !offer.action.specific);
    const specificRelics = offers.filter((offer) => offer.action.tier === "relic" && offer.action.specific);
    expect(randomRelics).toHaveLength(1);
    expect(specificRelics.length).toBeGreaterThan(1);

    const randomAfter = apply(state, randomRelics[0]!.action);
    expect(randomAfter.players.p1.resources.gold).toBe(19);
    expect(randomAfter.players.p1.commander?.forgeRelicUsed).toBe(true);
    expect(forgeActions(randomAfter).some((offer) => offer.action.tier === "major")).toBe(true);

    const chosenState = mapState("forge-high-specific");
    chosenState.round = 9;
    const chosen = forgeActions(chosenState).find(
      (offer) => offer.action.tier === "relic" && offer.action.specific
    )!;
    const chosenAfter = apply(chosenState, chosen.action);
    expect(chosenAfter.players.p1.resources.gold).toBe(17);
    expect(chosenAfter.players.p1.commander?.forgeRelicUsed).toBe(true);
  });

  it("keeps Grade II and III as separate uses while respecting old shared-budget saves", () => {
    const state = mapState("forge-separate-high");
    state.round = 9;
    const major = forgeActions(state).find((offer) => offer.action.tier === "major")!;
    const afterMajor = apply(state, major.action);
    expect(afterMajor.players.p1.commander?.forgeMajorUsed).toBe(true);
    expect(forgeActions(afterMajor).some((offer) => offer.action.tier === "relic")).toBe(true);

    const legacy = mapState("forge-legacy-high");
    legacy.round = 9;
    legacy.players.p1.commander!.forgeHighUsed = true;
    expect(forgeActions(legacy).some((offer) => offer.action.tier !== "minor")).toBe(false);
  });

  it("maps victory difficulty to grade and buys a queued Grade-II offer for 8 gold", () => {
    expect([1, 2, 3, 4, 5, 6].map(commanderArtifactTierForNeutralVictory)).toEqual([
      null, null, "minor", "major", "major", null
    ]);
    expect([1, 3, 4, 7, 8, 10].map(commanderArtifactTierForDungeonFloor)).toEqual([
      "minor", "minor", "major", "major", "relic", "relic"
    ]);

    const state = mapState("neutral-offer");
    expect(queueNeutralCommanderArtifactOffer(state, "p1", 4)).toBe(true);
    pumpAdventureQueues(state);
    const choice = state.pendingChoice;
    expect(choice?.type === "OPTION_CHOICE" ? choice.context : null).toBe("commander-artifact-offer");
    if (choice?.type !== "OPTION_CHOICE") throw new Error("expected commander artifact purchase");
    const offeredId = choice.commanderArtifactOffer?.cardIds[0];
    expect(offeredId).toBeTruthy();
    const after = apply(state, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: choice.id, optionIndex: 0 });
    expect(after.players.p1.resources.gold).toBe(22);
    expect(after.players.p1.hand).toContain(offeredId);
  });

  it("removes artifacts claimed elsewhere before a queued offer is shown", () => {
    const state = mapState("neutral-offer-stale");
    expect(queueNeutralCommanderArtifactOffer(state, "p1", 4)).toBe(true);
    const queued = state.adventure?.rewardQueue.find((reward) => reward.kind === "commander-artifact-offer");
    if (!queued || queued.kind !== "commander-artifact-offer") throw new Error("expected queued artifact offer");
    const claimedId = queued.cardIds[0]!;
    state.players.p2.hand.push(claimedId);

    pumpAdventureQueues(state);

    const choice = state.pendingChoice;
    expect(choice?.type === "OPTION_CHOICE" ? choice.context : null).toBe("commander-artifact-offer");
    if (choice?.type !== "OPTION_CHOICE") throw new Error("expected filtered artifact offer");
    expect(choice.commanderArtifactOffer?.cardIds).not.toContain(claimedId);
  });
});

describe("expanded commander artifact behavior", () => {
  it("wires the requested lightning, thorn, and toxic animation/sound plans", () => {
    expect(abilityFxPlans["commander-artifact-power-overflow"]).toMatchObject({
      affect: [{ key: "lightning-bolt" }, { key: "lightning-crackle", delayMs: 220 }],
      sound: "spells/lightning-bolt"
    });
    expect(abilityFxPlans["commander-artifact-thorn-aura"]?.sound).toBe("effects/fire-shield-hit");
    expect(abilityFxPlans["commander-artifact-plague-censer"]).toMatchObject({
      affect: [{ key: "poison" }], sound: "spells/poison"
    });
  });

  it("pins all requested grades and numeric folds in the single source of truth", () => {
    expect(COMMANDER_ARTIFACT_SPECS["wog.artifact.hardened_shield"]?.tier).toBe("relic");
    expect(COMMANDER_ARTIFACT_SPECS["wog.artifact.boots_of_haste"]?.initiative).toBe(2);
    expect(COMMANDER_ARTIFACT_SPECS["wog.artifact.doomsday_blade"]).toMatchObject({ attack: 2, attackRollAdvantage: true });
    expect(COMMANDER_ARTIFACT_SPECS["wog.artifact.blood_patriarch_saber"]).toMatchObject({ attack: 1, attackRollAdvantage: true });
    expect(aggregateCommanderArtifactBonuses({ trinket: "wog.artifact.vitality_ring" }).health).toBe(1);
  });

  it("Doomsday Blade keeps the higher die and adds 2 Attack", () => {
    const after = commanderStrike("wog.artifact.doomsday_blade", "weapon", [-1, 1]);
    expect(after.combat!.units.unit_p2_skeletons.damage).toBe(5);
  });

  it("round-one and whole-combat guards force incoming disadvantage", () => {
    for (const [cardId, round] of [
      ["wog.artifact.duelist_guard", 1],
      ["wog.artifact.veil_of_dread", 2]
    ] as const) {
      const state = combatWithArtifact(cardId, "armor");
      const commander = state.combat!.units[commanderUnitId("p1")];
      commander.maxHealth = 30;
      const attacker = state.combat!.units.unit_p2_skeletons;
      attacker.abilities = [];
      attacker.attack = 5;
      attacker.position = 10;
      state.combat!.round = round;
      state.combat!.activeUnitId = attacker.id;
      state.activePlayerId = "p2";
      state.combat!.dice.scriptedRolls = [1, -1];
      const after = settle(apply(state, { type: "ATTACK_UNIT", playerId: "p2", attackerId: attacker.id, defenderId: commander.id }));
      const roll = after.eventLog.find(
        (event) => event.type === "ATTACK_ROLLED" && event.attackerId === attacker.id
      );
      expect(roll?.type === "ATTACK_ROLLED" ? roll.rolls : []).toEqual([1, -1]);
      expect(roll?.type === "ATTACK_ROLLED" ? roll.roll : null).toBe(-1);
    }
  });

  it("attack riders apply lasting stat penalties", () => {
    const cases = [
      ["wog.artifact.corrosive_edge", "DEFENSE_BONUS", -1],
      ["wog.artifact.enfeebling_mace", "ATTACK_BONUS", -1],
      ["wog.artifact.chrono_pike", "INITIATIVE_BONUS", -3]
    ] as const;
    for (const [cardId, type, amount] of cases) {
      const after = commanderStrike(cardId, "weapon");
      expect(
        after.activeEffects.some(
          (effect) => effect.target?.type === "unit" && effect.target.unitId === "unit_p2_skeletons" &&
            effect.duration.type === "combat" && effect.modifiers.some((modifier) => modifier.type === type && modifier.amount === amount)
        )
      ).toBe(true);
    }
  });

  it("Piercing Lance ignores 1 Defense and Vampiric Fang heals after a damaging attack", () => {
    const pierce = combatWithArtifact("wog.artifact.piercing_lance", "weapon");
    const pierceCommander = pierce.combat!.units[commanderUnitId("p1")];
    const pierceTarget = pierce.combat!.units.unit_p2_skeletons;
    pierceTarget.abilities = [];
    pierceTarget.position = 10;
    pierceTarget.defense = 2;
    pierceTarget.maxHealth = 20;
    pierceTarget.retaliatedThisRound = true;
    pierce.combat!.activeUnitId = pierceCommander.id;
    pierce.activePlayerId = "p1";
    pierce.combat!.dice.scriptedRolls = [0];
    expect(settle(apply(pierce, { type: "ATTACK_UNIT", playerId: "p1", attackerId: pierceCommander.id, defenderId: pierceTarget.id })).combat!.units.unit_p2_skeletons.damage).toBe(1);

    const fang = combatWithArtifact("wog.artifact.vampiric_fang", "weapon");
    const fangCommander = fang.combat!.units[commanderUnitId("p1")];
    const fangTarget = fang.combat!.units.unit_p2_skeletons;
    fangCommander.damage = 2;
    fangTarget.abilities = [];
    fangTarget.position = 10;
    fangTarget.defense = 0;
    fangTarget.retaliatedThisRound = true;
    fang.combat!.activeUnitId = fangCommander.id;
    fang.activePlayerId = "p1";
    fang.combat!.dice.scriptedRolls = [0];
    const healed = settle(apply(fang, { type: "ATTACK_UNIT", playerId: "p1", attackerId: fangCommander.id, defenderId: fangTarget.id }));
    expect(healed.combat!.units[fangCommander.id].damage).toBe(1);
  });

  it("Barbed Carapace returns a fixed 2 damage and Stormcleaver hits an adjacent enemy", () => {
    const thorn = combatWithArtifact("wog.artifact.barbed_carapace", "armor");
    const commander = thorn.combat!.units[commanderUnitId("p1")];
    commander.maxHealth = 30;
    commander.retaliatedThisRound = true;
    const attacker = thorn.combat!.units.unit_p2_skeletons;
    attacker.abilities = [];
    attacker.attack = 5;
    attacker.maxHealth = 30;
    attacker.position = 10;
    thorn.combat!.activeUnitId = attacker.id;
    thorn.activePlayerId = "p2";
    thorn.combat!.dice.scriptedRolls = [0];
    const reflected = settle(apply(thorn, { type: "ATTACK_UNIT", playerId: "p2", attackerId: attacker.id, defenderId: commander.id }));
    // The attacker dealt 4 to the commander (5 attack vs the paladin's base
    // Defense 1), but the thorn reflect is a FIXED 2 regardless of that.
    expect(reflected.combat!.units[commander.id].damage).toBe(4);
    expect(reflected.combat!.units[attacker.id].damage).toBe(2);

    // CAP: the reflect can never exceed the damage actually taken. A 1-attack
    // hit (vs Defense 1 ⇒ 1 damage) reflects only 1, not the full 2.
    const capped = combatWithArtifact("wog.artifact.barbed_carapace", "armor");
    const cappedCommander = capped.combat!.units[commanderUnitId("p1")];
    cappedCommander.maxHealth = 30;
    cappedCommander.retaliatedThisRound = true;
    const weakAttacker = capped.combat!.units.unit_p2_skeletons;
    weakAttacker.abilities = [];
    weakAttacker.attack = 2;
    weakAttacker.maxHealth = 30;
    weakAttacker.position = 10;
    capped.combat!.activeUnitId = weakAttacker.id;
    capped.activePlayerId = "p2";
    capped.combat!.dice.scriptedRolls = [0];
    const cappedResult = settle(apply(capped, { type: "ATTACK_UNIT", playerId: "p2", attackerId: weakAttacker.id, defenderId: cappedCommander.id }));
    expect(cappedResult.combat!.units[cappedCommander.id].damage).toBe(1);
    expect(cappedResult.combat!.units[weakAttacker.id].damage).toBe(1);

    const cleave = combatWithArtifact("wog.artifact.stormcleaver", "weapon");
    const cleaver = cleave.combat!.units[commanderUnitId("p1")];
    const target = cleave.combat!.units.unit_p2_skeletons;
    const adjacent = cleave.combat!.units.unit_p2_vampires;
    target.abilities = [];
    target.position = 10;
    target.defense = 0;
    target.retaliatedThisRound = true;
    adjacent.abilities = [];
    adjacent.position = 11;
    adjacent.damage = 0;
    cleave.combat!.obstacles = [];
    cleave.combat!.activeUnitId = cleaver.id;
    cleave.activePlayerId = "p1";
    cleave.combat!.dice.scriptedRolls = [0];
    const split = settle(apply(cleave, { type: "ATTACK_UNIT", playerId: "p1", attackerId: cleaver.id, defenderId: target.id }));
    expect(split.combat!.units[adjacent.id].damage).toBe(1);
  });

  it("Phoenix Plate revives once at 1 Health, while movement heals 1 and Defend heals 2", () => {
    const phoenix = combatWithArtifact("wog.artifact.phoenix_plate", "armor");
    const phoenixCommander = phoenix.combat!.units[commanderUnitId("p1")];
    phoenixCommander.damage = phoenixCommander.maxHealth;
    markUnitRemovedIfNeeded(phoenix, phoenixCommander);
    expect(phoenixCommander.maxHealth - phoenixCommander.damage).toBe(1);
    expect(phoenixCommander.usedRebirthThisCombat).toBe(true);

    const salve = combatWithArtifact("wog.artifact.travelers_salve", "trinket");
    const mover = salve.combat!.units[commanderUnitId("p1")];
    mover.damage = 2;
    salve.combat!.activeUnitId = mover.id;
    salve.activePlayerId = "p1";
    const move = getLegalActions(salve, "p1").find(
      (legal): legal is typeof legal & { action: Extract<GameAction, { type: "MOVE_UNIT" }> } =>
        legal.action.type === "MOVE_UNIT" && legal.action.unitId === mover.id
    );
    expect(move, "the commander should have an empty movement destination").toBeTruthy();
    const moved = apply(salve, move!.action);
    expect(moved.combat!.units[mover.id].damage).toBe(1);

    const bastion = combatWithArtifact("wog.artifact.bastion_heart", "armor");
    const defender = bastion.combat!.units[commanderUnitId("p1")];
    defender.damage = 2;
    bastion.combat!.activeUnitId = defender.id;
    bastion.activePlayerId = "p1";
    const defended = apply(bastion, { type: "DEFEND_UNIT", playerId: "p1", unitId: defender.id });
    expect(defended.combat!.units[defender.id].damage).toBe(0);
  });

  it("Plague Censer damages every adjacent unit when the commander activates", () => {
    const state = combatWithArtifact("wog.artifact.plague_censer", "trinket");
    const commander = state.combat!.units[commanderUnitId("p1")];
    const starter = state.combat!.units.unit_p2_skeletons;
    const adjacentFriend = state.combat!.units.unit_p1_crusaders;
    starter.position = 15;
    adjacentFriend.position = 8;
    adjacentFriend.damage = 0;
    for (const unit of Object.values(state.combat!.units)) unit.activatedThisRound = true;
    starter.activatedThisRound = false;
    commander.activatedThisRound = false;
    starter.initiative = 20;
    commander.initiative = 10;
    state.combat!.activeUnitId = starter.id;
    state.activePlayerId = "p2";
    const after = apply(state, { type: "DEFEND_UNIT", playerId: "p2", unitId: starter.id });
    expect(after.combat!.activeUnitId).toBe(commander.id);
    expect(after.combat!.units[adjacentFriend.id].damage).toBe(1);
    expect(after.eventLog.some((event) => event.type === "UNIT_ABILITY_TRIGGERED" && event.abilityId === "commander-artifact-plague-censer")).toBe(true);
  });
});
