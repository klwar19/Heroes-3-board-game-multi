import { describe, expect, it } from "vitest";
import { abilityFxPlans, spellPresentationMs } from "@/data/fx";
import { applyAction, commanderUnitId, createInitialGameState, makeCommanderCombatUnit } from "./index";
import { maybeOpenCommanderCombatStartDecision } from "./adventure-reducer";
import { maybeOpenPlayerActivationChoice } from "./reducer";
import type { CommanderArtifactSlot, GameAction, GameState } from "./state";

const WOG_ON = { enabled: true, commanders: true, newObjects: false, newCreatures: false, artifacts: true };

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function settle(state: GameState): GameState {
  let current = state;
  for (let safety = 30; safety > 0 && (current.reactionWindow || current.pendingChoice?.type === "ATTACK_DIE_REROLL"); safety -= 1) {
    if (current.reactionWindow) {
      current = apply(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
    } else if (current.pendingChoice?.type === "ATTACK_DIE_REROLL") {
      current = apply(current, {
        type: "CHOOSE_PENDING_ROLL",
        playerId: current.pendingChoice.playerId,
        choiceId: current.pendingChoice.id,
        candidateIndex: current.pendingChoice.candidates.length - 1,
      });
    }
  }
  return current;
}

function sandbox(cardId?: string, slot: CommanderArtifactSlot = "weapon"): GameState {
  const state = createInitialGameState(`second-wave-${cardId ?? "control"}`);
  state.wog = { ...WOG_ON };
  state.players.p1.commander = {
    slug: "paladin",
    grades: { attack: 0, defense: 0, health: 0, damage: 0, magic: 0, speed: 0 },
    ...(cardId ? { artifacts: { [slot]: cardId } } : {}),
  };
  const commander = makeCommanderCombatUnit(state.players.p1, 9)!;
  state.combat!.units[commander.id] = commander;
  state.players.p1.hand = [];
  state.players.p2.hand = [];
  return state;
}

function chooseCurrentOption(state: GameState, optionIndex: number): GameState {
  const choice = state.pendingChoice;
  if (choice?.type !== "OPTION_CHOICE") throw new Error("expected an option choice");
  return apply(state, { type: "CHOOSE_OPTION", playerId: choice.playerId, choiceId: choice.id, optionIndex });
}

function startArtifactChoice(state: GameState): GameState {
  state.combat!.commanderCombatStartResolved = false;
  expect(maybeOpenCommanderCombatStartDecision(state)).toBe(true);
  return state;
}

function attack(
  state: GameState,
  attackerId: string,
  defenderId: string,
  playerId: "p1" | "p2",
): GameState {
  state.combat!.activeUnitId = attackerId;
  state.activePlayerId = playerId;
  state.combat!.dice.scriptedRolls = [0, 0, 0, 0];
  state.combat!.dice.rollCount = 0;
  return settle(apply(state, { type: "ATTACK_UNIT", playerId, attackerId, defenderId }));
}

describe("commander artifact second wave", () => {
  it("Lanternroot Crook lets the owner place a real one-round Starwind Familiar anywhere empty", () => {
    const state = startArtifactChoice(sandbox("wog.artifact.lanternroot_crook"));
    const choice = state.pendingChoice;
    expect(choice?.type === "OPTION_CHOICE" ? choice.context : null).toBe("commander-artifact-spirit");
    if (choice?.type !== "OPTION_CHOICE") throw new Error("expected spirit placement");
    const position = choice.commanderArtifactStart!.positions!.at(-1)!;
    const after = chooseCurrentOption(state, choice.options.length - 1);
    const familiar = Object.values(after.combat!.units).find((unit) => unit.position === position && unit.cardName === "Starwind Familiar");
    expect(familiar).toMatchObject({ attack: 2, defense: 1, maxHealth: 2, initiative: 8, summoned: true, temporary: true, heroGradeExpiresAfterRound: 1 });

    const control = sandbox();
    control.combat!.commanderCombatStartResolved = false;
    expect(maybeOpenCommanderCombatStartDecision(control)).toBe(false);
    expect(Object.values(control.combat!.units).some((unit) => unit.cardName === "Starwind Familiar")).toBe(false);
  });

  it("Counterfeit Cataclysm is optional, damages every ordinary unit, and respects Fire immunity/resistance", () => {
    const erupt = startArtifactChoice(sandbox("wog.artifact.counterfeit_cataclysm"));
    const commander = erupt.combat!.units[commanderUnitId("p1")];
    expect(commander.attack).toBe(3);
    const immune = erupt.combat!.units.unit_p1_griffins;
    immune.abilities = ["fire-elemental-immunity"];
    immune.damage = 0;
    const resistant = erupt.combat!.units.unit_p2_skeletons;
    resistant.abilities = ["reduce-spell-damage-2"];
    resistant.damage = 0;
    const ordinary = erupt.combat!.units.unit_p2_vampires;
    ordinary.abilities = [];
    ordinary.damage = 0;
    const after = chooseCurrentOption(erupt, 0);
    expect(after.combat!.units[commander.id].damage).toBe(1);
    expect(after.combat!.units[ordinary.id].damage).toBe(1);
    expect(after.combat!.units[immune.id].damage).toBe(0);
    expect(after.combat!.units[resistant.id].damage).toBe(0);

    const skipped = chooseCurrentOption(startArtifactChoice(sandbox("wog.artifact.counterfeit_cataclysm")), 1);
    expect(Object.values(skipped.combat!.units).every((unit) => unit.damage === 0)).toBe(true);
  });

  it("Ring of the Sealed Horizon places a blocking Force Field through round 2", () => {
    const state = startArtifactChoice(sandbox("wog.artifact.ring_of_the_sealed_horizon", "trinket"));
    const choice = state.pendingChoice;
    if (choice?.type !== "OPTION_CHOICE") throw new Error("expected barrier placement");
    const position = choice.commanderArtifactStart!.positions![0]!;
    let after = chooseCurrentOption(state, 0);
    expect(after.combat!.battlefieldTokens).toContainEqual(expect.objectContaining({
      kind: "force_field", position, expiresAtCombatRoundEnd: 2,
    }));
    after.combat!.activeUnitId = null;
    after = apply(after, { type: "END_COMBAT_ROUND", playerId: "p1" });
    expect(after.combat!.battlefieldTokens?.some((token) => token.position === position)).toBe(true);
    after.combat!.activeUnitId = null;
    after = apply(after, { type: "END_COMBAT_ROUND", playerId: "p1" });
    expect(after.combat!.battlefieldTokens?.some((token) => token.position === position)).toBe(false);
  });

  it("Widow's Courtesy gives only the first own attack +1 and punishes a ranged attacker", () => {
    const state = sandbox("wog.artifact.widows_courtesy");
    const commander = state.combat!.units[commanderUnitId("p1")];
    const target = state.combat!.units.unit_p2_skeletons;
    target.abilities = [];
    target.position = 10;
    target.defense = 0;
    target.maxHealth = 30;
    target.retaliatedThisRound = true;
    const after = attack(state, commander.id, target.id, "p1");
    expect(after.combat!.units[target.id].damage).toBe(3);
    const spent = sandbox("wog.artifact.widows_courtesy");
    const spentCommander = spent.combat!.units[commanderUnitId("p1")];
    spentCommander.commanderArtifactFirstOwnAttackUsed = true;
    const spentTarget = spent.combat!.units.unit_p2_skeletons;
    spentTarget.abilities = [];
    spentTarget.position = 10;
    spentTarget.defense = 0;
    spentTarget.maxHealth = 30;
    spentTarget.retaliatedThisRound = true;
    expect(attack(spent, spentCommander.id, spentTarget.id, "p1").combat!.units[spentTarget.id].damage).toBe(2);

    const ranged = sandbox("wog.artifact.widows_courtesy");
    const guarded = ranged.combat!.units[commanderUnitId("p1")];
    guarded.maxHealth = 30;
    guarded.retaliatedThisRound = true;
    const shooter = ranged.combat!.units.unit_p2_skeletons;
    shooter.type = "ranged";
    shooter.position = 13;
    shooter.attack = 2;
    shooter.abilities = [];
    const punished = attack(ranged, shooter.id, guarded.id, "p2");
    expect(punished.combat!.units[shooter.id].damage).toBe(1);
    const control = sandbox();
    const controlCommander = control.combat!.units[commanderUnitId("p1")];
    controlCommander.maxHealth = 30;
    controlCommander.retaliatedThisRound = true;
    const controlShooter = control.combat!.units.unit_p2_skeletons;
    controlShooter.type = "ranged";
    controlShooter.position = 13;
    controlShooter.abilities = [];
    expect(attack(control, controlShooter.id, controlCommander.id, "p2").combat!.units[controlShooter.id].damage).toBe(0);
  });

  it("Amulet of Recoil reduces only the first incoming attack, then damages and pushes an adjacent enemy on activation", () => {
    const state = sandbox("wog.artifact.amulet_of_recoil", "trinket");
    const commander = state.combat!.units[commanderUnitId("p1")];
    commander.maxHealth = 40;
    commander.retaliatedThisRound = true;
    const attacker = state.combat!.units.unit_p2_skeletons;
    attacker.attack = 5;
    attacker.abilities = [];
    attacker.position = 10;
    const first = attack(state, attacker.id, commander.id, "p2");
    expect(first.combat!.units[commander.id].damage).toBe(2);
    const spentWard = sandbox("wog.artifact.amulet_of_recoil", "trinket");
    const spentCommander = spentWard.combat!.units[commanderUnitId("p1")];
    spentCommander.maxHealth = 40;
    spentCommander.retaliatedThisRound = true;
    spentCommander.commanderArtifactFirstIncomingAttackUsed = true;
    const secondAttacker = spentWard.combat!.units.unit_p2_skeletons;
    secondAttacker.attack = 5;
    secondAttacker.abilities = [];
    secondAttacker.position = 10;
    expect(attack(spentWard, secondAttacker.id, spentCommander.id, "p2").combat!.units[spentCommander.id].damage).toBe(4);

    const activation = sandbox("wog.artifact.amulet_of_recoil", "trinket");
    const source = activation.combat!.units[commanderUnitId("p1")];
    const enemy = activation.combat!.units.unit_p2_skeletons;
    for (const unitId of Object.keys(activation.combat!.units)) {
      if (unitId !== source.id && unitId !== enemy.id) delete activation.combat!.units[unitId];
    }
    activation.combat!.obstacles = [];
    enemy.position = 10;
    enemy.maxHealth = 20;
    enemy.damage = 0;
    activation.combat!.activeUnitId = source.id;
    activation.activePlayerId = "p1";
    maybeOpenPlayerActivationChoice(activation);
    const recoil = activation.pendingChoice;
    expect(recoil?.type === "ABILITY_TARGET_CHOICE" ? recoil.kind : null).toBe("commander-artifact-recoil");
    if (recoil?.type !== "ABILITY_TARGET_CHOICE") throw new Error("expected recoil target");
    const pushed = apply(activation, { type: "CHOOSE_ABILITY_TARGET", playerId: "p1", choiceId: recoil.id, targetUnitId: enemy.id });
    expect(pushed.combat!.units[enemy.id].damage).toBe(2);
    expect(pushed.combat!.units[enemy.id].position).not.toBe(10);
  });

  it("Tomorrow's Grip defers up to 4 damage to round end and uses the artifact delay FX", () => {
    const state = sandbox("wog.artifact.temporal_cuirass", "armor");
    const commander = state.combat!.units[commanderUnitId("p1")];
    commander.maxHealth = 40;
    commander.retaliatedThisRound = true;
    const attacker = state.combat!.units.unit_p2_skeletons;
    attacker.attack = 7;
    attacker.abilities = [];
    attacker.position = 10;
    let after = attack(state, attacker.id, commander.id, "p2");
    expect(after.combat!.units[commander.id].damage).toBe(2);
    expect(after.combat!.units[commander.id].elementalVeterancy?.deferredDamage).toBe(4);
    after.combat!.activeUnitId = null;
    after = apply(after, { type: "END_COMBAT_ROUND", playerId: "p1" });
    expect(after.combat!.units[commander.id].damage).toBe(6);
    expect(abilityFxPlans["commander-artifact-temporal-cuirass"]?.sound).toBe("custom-ability/electric-impact");
  });

  it("ships the requested Armageddon, summon, barrier, knife, and recoil FX plans", () => {
    expect(abilityFxPlans["commander-artifact-counterfeit-cataclysm"]).toMatchObject({
      affect: [{ key: "armageddon" }],
      sound: "spells/armageddon",
      battlefield: true,
      playbackMs: 5590,
    });
    expect(spellPresentationMs(abilityFxPlans["commander-artifact-counterfeit-cataclysm"])).toBe(5590);
    expect(abilityFxPlans["commander-artifact-lanternroot-crook"]?.sound).toBe("spells/air-elemental");
    expect(abilityFxPlans["commander-artifact-sealed-horizon"]?.sound).toBe("spells/force-field");
    expect(abilityFxPlans["commander-artifact-widows-courtesy"]?.hit).toBe("magic-arrow-hit");
    expect(abilityFxPlans["commander-artifact-amulet-of-recoil"]?.sound).toBe("spells/implosion");
  });
});
