import { describe, expect, it } from "vitest";

import { commanderDefinitions } from "@/data/commanders";
import { applyAction, createInitialGameState, getLegalActions, makeCommanderCombatUnit } from "./index";
import { resolveAnimeOptions } from "./anime";
import { applyCommanderCombatStart } from "./commanders";
import { markUnitRemovedIfNeeded } from "./combat-units";
import { expireHeroGradeFamiliars } from "./hero-grade-combat";
import type { CombatUnitState, GameAction, GameEvent, GameState, PlayerId, ResolutionStackItem } from "./state";
import { getBattlefieldPositions, hexPosition, isAdjacent } from "./battlefield";
import { unitCells, unitCellsAt } from "./hex-footprint";
import {
  applyCultivationAttackDeclaration,
  gainSectQiAfterMove,
  initializeCultivationFactionCombat,
  sectQiCapacity,
  wuxiaActivation
} from "./wuxia-factions";

/**
 * Wuxia rework (2026-09-23): every new Sect Qi / Blood Essence art, hero card
 * and commander is asserted on its OBSERVABLE outcome against a control where
 * the old and new rules diverge (removing the art makes the assertion fail).
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function settle(state: GameState): GameState {
  let current = state;
  let guard = 80;
  while (guard-- > 0 && (current.reactionWindow || current.pendingChoice?.type === "ATTACK_DIE_REROLL")) {
    if (current.reactionWindow) {
      current = applyOk(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
    } else if (current.pendingChoice?.type === "ATTACK_DIE_REROLL") {
      current = applyOk(current, {
        type: "CHOOSE_PENDING_ROLL",
        playerId: current.pendingChoice.playerId,
        choiceId: current.pendingChoice.id,
        candidateIndex: 0
      });
    }
  }
  expect(guard).toBeGreaterThan(0);
  return current;
}

function latestAttack(state: GameState, attackerId: string): Extract<GameEvent, { type: "ATTACK_ROLLED" }> {
  const event = [...state.eventLog].reverse().find(
    (candidate) => candidate.type === "ATTACK_ROLLED" && candidate.attackerId === attackerId && !candidate.isRetaliation
  );
  expect(event).toBeTruthy();
  return event as Extract<GameEvent, { type: "ATTACK_ROLLED" }>;
}

function combatState(factionId: "azure_breeze" | "heavenly_demon", heroDefId: string): GameState {
  const state = createInitialGameState(`wuxia-rework-${factionId}-${heroDefId}`);
  state.anime = resolveAnimeOptions({ enabled: true, cultivation: true });
  state.players.p1.factionId = factionId;
  state.heroes.hero_p1.heroDefId = heroDefId;
  state.players.p1.hand = [];
  state.players.p2.hand = [];
  state.combat!.dice.scriptedRolls = Array.from({ length: 60 }, () => 0);
  state.combat!.dice.rollCount = 0;
  // Park everyone far apart so only the units a test places interact.
  const parking = [0, 3, 16, 19, 12, 15];
  Object.values(state.combat!.units).forEach((unit, index) => {
    Object.assign(unit, {
      position: parking[index] ?? 19,
      abilities: [],
      damage: 0,
      maxHealth: 30,
      defense: 0,
      attack: 0,
      activatedThisRound: false,
      movedThisActivation: false,
      retaliatedThisRound: true,
      defenseToken: false
    });
  });
  initializeCultivationFactionCombat(state, state.combat!);
  return state;
}

function place(
  state: GameState,
  unitId: string,
  position: number,
  stats: Partial<CombatUnitState> = {}
): CombatUnitState {
  const unit = state.combat!.units[unitId];
  Object.assign(unit, { position, ...stats });
  return unit;
}

function record(state: GameState, playerId: PlayerId = "p1") {
  return state.combat!.cultivationFactions![playerId]!;
}

function attack(state: GameState, attackerId: string, defenderId: string): GameState {
  const attacker = state.combat!.units[attackerId];
  attacker.activatedThisRound = false;
  attacker.attackedThisActivation = false;
  state.activePlayerId = attacker.controllerId;
  state.combat!.activeUnitId = attackerId;
  return settle(applyOk(state, { type: "ATTACK_UNIT", playerId: attacker.controllerId, attackerId, defenderId }));
}

/** Declare an attack, play `cardId` (option `optionIndex`) as `reactor`'s reaction, then settle. */
function attackWithReaction(
  state: GameState,
  attackerId: string,
  defenderId: string,
  reactor: PlayerId,
  cardId: string,
  optionIndex: number
): GameState {
  const attacker = state.combat!.units[attackerId];
  attacker.activatedThisRound = false;
  attacker.attackedThisActivation = false;
  state.activePlayerId = attacker.controllerId;
  state.combat!.activeUnitId = attackerId;
  let current = applyOk(state, { type: "ATTACK_UNIT", playerId: attacker.controllerId, attackerId, defenderId });
  for (let guard = 20; guard > 0 && current.reactionWindow; guard -= 1) {
    const offer = getLegalActions(current, reactor).find(
      (legal) =>
        legal.action.type === "PLAY_REACTION" &&
        legal.action.cardId === cardId &&
        (legal.action.optionIndex ?? 0) === optionIndex
    );
    if (offer) {
      current = applyOk(current, offer.action);
      break;
    }
    current = applyOk(current, { type: "PASS_REACTION", playerId: current.reactionWindow!.priorityPlayerId });
  }
  return settle(current);
}

function playCardOffer(state: GameState, cardId: string, optionIndex: number, targetUnitId?: string) {
  return getLegalActions(state, "p1").find(
    (legal) =>
      legal.action.type === "PLAY_CARD" &&
      legal.action.cardId === cardId &&
      (legal.action.optionIndex ?? 0) === optionIndex &&
      (targetUnitId === undefined ||
        (legal.action.target?.type === "unit" && legal.action.target.unitId === targetUnitId))
  );
}

/** p1's griffins hold a fresh activation so combat plays are offered on-turn. */
function onTurn(state: GameState): GameState {
  const unit = state.combat!.units.unit_p1_griffins;
  unit.activatedThisRound = false;
  unit.attackedThisActivation = false;
  unit.movedThisActivation = false;
  state.activePlayerId = "p1";
  state.combat!.activeUnitId = unit.id;
  return state;
}

// Board: 4 columns × 5 rows; cell 9 touches 5, 8, 10 and 13.

describe("Azure Breeze — Sect Qi arts", () => {
  it("Qi Edge: a Qi-fuelled attack ignores 1 Defense (control: same attack without the art)", () => {
    const run = (abilities: string[]) => {
      let state = combatState("azure_breeze", "lingxi");
      place(state, "unit_p1_marksmen", 9, { attack: 3, abilities });
      place(state, "unit_p1_griffins", 8);
      place(state, "unit_p2_skeletons", 10, { defense: 2 });
      record(state).sectQi = 1;
      state = attack(state, "unit_p1_marksmen", "unit_p2_skeletons");
      return latestAttack(state, "unit_p1_marksmen");
    };
    expect(run([]).defenseValue).toBe(2);
    expect(run(["azure-qi-edge"]).defenseValue).toBe(1);
    expect(run(["azure-qi-edge"]).attackValue).toBe(4);
  });

  it("Sword Wave: after a Qi-fuelled hit, 1 damage to another enemy beside the attacker; none without Qi", () => {
    const run = (qi: number) => {
      let state = combatState("azure_breeze", "lingxi");
      place(state, "unit_p1_marksmen", 9, { attack: 3, abilities: ["azure-qi-edge", "azure-sword-wave"] });
      place(state, "unit_p1_griffins", 8);
      place(state, "unit_p2_skeletons", 10);
      place(state, "unit_p2_vampires", 5);
      record(state).sectQi = qi;
      state = attack(state, "unit_p1_marksmen", "unit_p2_skeletons");
      if (state.pendingChoice?.type === "OPTION_CHOICE") {
        state = settle(
          applyOk(state, {
            type: "CHOOSE_OPTION",
            playerId: state.pendingChoice.playerId,
            choiceId: state.pendingChoice.id,
            optionIndex: 0
          })
        );
      }
      return state.combat!.units.unit_p2_vampires.damage;
    };
    expect(run(1)).toBe(1);
    expect(run(0)).toBe(0);
  });

  it("Inheritance Burst spends 2 Qi for +2 Attack; without the art the same 2 Qi buys +1", () => {
    const run = (abilities: string[]) => {
      let state = combatState("azure_breeze", "lingxi");
      place(state, "unit_p1_marksmen", 9, { attack: 3, abilities });
      place(state, "unit_p1_griffins", 8);
      place(state, "unit_p2_skeletons", 10);
      record(state).sectQi = 2;
      state = attack(state, "unit_p1_marksmen", "unit_p2_skeletons");
      return { attack: latestAttack(state, "unit_p1_marksmen").attackValue, qi: record(state).sectQi };
    };
    expect(run([])).toEqual({ attack: 4, qi: 1 });
    expect(run(["azure-heir-burst"])).toEqual({ attack: 5, qi: 0 });
  });

  it("Formation Anchor gives an adjacent ally Shared Ward's +1 Defense with an empty Qi pool", () => {
    const run = (wardenAbilities: string[]) => {
      let state = combatState("azure_breeze", "lingxi");
      place(state, "unit_p1_marksmen", 9);
      place(state, "unit_p1_griffins", 8, { abilities: wardenAbilities });
      place(state, "unit_p2_skeletons", 10, { attack: 4 });
      record(state).sectQi = 0;
      state = attack(state, "unit_p2_skeletons", "unit_p1_marksmen");
      return latestAttack(state, "unit_p2_skeletons").defenseValue;
    };
    expect(run([])).toBe(0);
    expect(run(["azure-warden-anchor"])).toBe(1);
  });

  it("Jianxu's Seven-Star Array converts the spent Qi into +1 more Attack inside a 2-ally formation", () => {
    const run = (hero: string) => {
      let state = combatState("azure_breeze", hero);
      place(state, "unit_p1_marksmen", 9, { attack: 3 });
      place(state, "unit_p1_griffins", 8);
      place(state, "unit_p1_crusaders", 5);
      place(state, "unit_p2_skeletons", 10);
      record(state).sectQi = 1;
      state = attack(state, "unit_p1_marksmen", "unit_p2_skeletons");
      return latestAttack(state, "unit_p1_marksmen").attackValue;
    };
    expect(run("lingxi")).toBe(4);
    expect(run("jianxu")).toBe(5);
  });

  it("Cloud Relay and Qi Breathing let their unit's link gain Qi past the per-round link limit", () => {
    const run = (abilities: string[]) => {
      const state = combatState("azure_breeze", "lingxi");
      const first = place(state, "unit_p1_marksmen", 0);
      const mover = place(state, "unit_p1_crusaders", 11, { abilities });
      place(state, "unit_p1_griffins", 5);
      gainSectQiAfterMove(state, first, 0, 4); // first link of the round: +1
      gainSectQiAfterMove(state, mover, 11, 6); // second link: only an art can pay it
      const afterSecond = record(state).sectQi;
      mover.position = 11;
      gainSectQiAfterMove(state, mover, 11, 6); // third link, same round
      return [afterSecond, record(state).sectQi];
    };
    expect(run([])).toEqual([1, 1]);
    expect(run(["azure-crane-relay"])).toEqual([2, 2]); // once per round
    expect(run(["azure-outer-breathing"])).toEqual([2, 2]); // once per combat
  });

  it("Golden Core gains Qi on activation beside an ally (not alone), once per round", () => {
    const state = combatState("azure_breeze", "lingxi");
    const elder = place(state, "unit_p1_marksmen", 9, { abilities: ["azure-golden-core"] });
    wuxiaActivation(state, elder);
    expect(record(state).sectQi).toBe(0);
    place(state, "unit_p1_griffins", 8);
    wuxiaActivation(state, elder);
    expect(record(state).sectQi).toBe(1);
    wuxiaActivation(state, elder);
    expect(record(state).sectQi).toBe(1);
  });

  it("Golden Core is wired into the real activation start", () => {
    const run = (abilities: string[]) => {
      let state = combatState("azure_breeze", "lingxi");
      place(state, "unit_p1_crusaders", 9, { abilities });
      place(state, "unit_p1_marksmen", 8);
      for (const unit of Object.values(state.combat!.units)) {
        unit.activatedThisRound = unit.id !== "unit_p1_crusaders" && unit.id !== "unit_p1_griffins";
      }
      state.combat!.units.unit_p1_griffins.activatedThisRound = false;
      state.activePlayerId = "p1";
      state.combat!.activeUnitId = "unit_p1_griffins";
      state = applyOk(state, { type: "DEFEND_UNIT", playerId: "p1", unitId: "unit_p1_griffins" });
      return record(state).sectQi;
    };
    expect(run([])).toBe(0);
    expect(run(["azure-golden-core"])).toBe(1);
  });

  it("Qi Well gains 1 Qi after its Retaliation", () => {
    const run = (abilities: string[]) => {
      let state = combatState("azure_breeze", "lingxi");
      place(state, "unit_p1_crusaders", 9, { abilities, retaliatedThisRound: false });
      place(state, "unit_p2_skeletons", 10, { attack: 1 });
      state.combat!.units.unit_p2_skeletons.abilities = [];
      state.activePlayerId = "p2";
      state.combat!.activeUnitId = "unit_p2_skeletons";
      state.combat!.units.unit_p2_skeletons.activatedThisRound = false;
      state = settle(
        applyOk(state, { type: "ATTACK_UNIT", playerId: "p2", attackerId: "unit_p2_skeletons", defenderId: "unit_p1_crusaders" })
      );
      return record(state).sectQi;
    };
    expect(run([])).toBe(0);
    expect(run(["azure-mountain-qi-well"])).toBe(1);
  });

  it("capacity is 3, +1 at Core Formation", () => {
    const state = combatState("azure_breeze", "lingxi");
    expect(sectQiCapacity(state, "p1")).toBe(3);
    state.heroes.hero_p1.cultivationRealm = 2;
    expect(sectQiCapacity(state, "p1")).toBe(4);
  });
});

describe("Heavenly Demon — Blood Essence arts", () => {
  it("Blood Harvest: an attack that defeats an enemy side gains 1 Essence once per round", () => {
    let state = combatState("heavenly_demon", "guiyan");
    place(state, "unit_p1_marksmen", 9, { attack: 8 });
    place(state, "unit_p2_skeletons", 10, { maxHealth: 2 });
    record(state).bloodEssence = 0;
    // Blood Frenzy already fired this round, so it cannot eat the harvest.
    record(state).bloodFrenzySpentRound = state.combat!.round;
    state = attack(state, "unit_p1_marksmen", "unit_p2_skeletons");
    expect(record(state).bloodEssence).toBe(1);
    // A second defeat the same round harvests nothing more.
    place(state, "unit_p1_griffins", 5, { attack: 8 });
    place(state, "unit_p2_vampires", 6, { maxHealth: 2 });
    state = attack(state, "unit_p1_griffins", "unit_p2_vampires");
    expect(record(state).bloodEssence).toBe(1);
  });

  it("Reaper's Toll adds 1 more Essence on its own defeating blow, beyond the round limit", () => {
    let state = combatState("heavenly_demon", "guiyan");
    place(state, "unit_p1_marksmen", 9, { attack: 8 });
    place(state, "unit_p2_skeletons", 10, { maxHealth: 2 });
    record(state).bloodFrenzySpentRound = state.combat!.round;
    state = attack(state, "unit_p1_marksmen", "unit_p2_skeletons");
    place(state, "unit_p1_griffins", 5, { attack: 8, abilities: ["demon-reaper-toll"] });
    place(state, "unit_p2_vampires", 6, { maxHealth: 2 });
    state = attack(state, "unit_p1_griffins", "unit_p2_vampires");
    // Harvest (1) + Toll on the second kill (1); the second Harvest is round-capped.
    expect(record(state).bloodEssence).toBe(2);
  });

  it("Bloodscent: +1 Attack only against an already-damaged enemy", () => {
    const run = (targetDamage: number) => {
      let state = combatState("heavenly_demon", "guiyan");
      place(state, "unit_p1_marksmen", 9, { attack: 3, abilities: ["demon-bloodscent"] });
      place(state, "unit_p2_skeletons", 10, { damage: targetDamage });
      record(state).bloodEssence = 0;
      state = attack(state, "unit_p1_marksmen", "unit_p2_skeletons");
      return latestAttack(state, "unit_p1_marksmen").attackValue;
    };
    expect(run(0)).toBe(3);
    expect(run(1)).toBe(4);
  });

  it("Blood Frenzy now works after round 3", () => {
    let state = combatState("heavenly_demon", "guiyan");
    state.combat!.round = 5;
    place(state, "unit_p1_marksmen", 9, { attack: 3 });
    place(state, "unit_p2_skeletons", 10);
    record(state).bloodEssence = 1;
    state = attack(state, "unit_p1_marksmen", "unit_p2_skeletons");
    expect(latestAttack(state, "unit_p1_marksmen").attackValue).toBe(4);
    expect(record(state).bloodEssence).toBe(0);
  });

  it("Blood Oath: every flip and removal of the unit feeds 1 Essence (control: once per unit)", () => {
    // The flip re-derives abilities from the printed Few side, so this runs on
    // the real cards: Blood Disciples print the Oath on both sides, Castle's
    // Marksmen (the control) print nothing.
    const run = (unitDefId: string, abilities: string[]) => {
      const state = combatState("heavenly_demon", "guiyan");
      const unit = state.combat!.units.unit_p1_marksmen;
      Object.assign(unit, { unitDefId, abilities, variant: "pack", damage: unit.maxHealth });
      record(state).bloodEssence = 0;
      markUnitRemovedIfNeeded(state, unit);
      expect(unit.variant).toBe("few");
      unit.damage = unit.maxHealth;
      markUnitRemovedIfNeeded(state, unit);
      return record(state).bloodEssence;
    };
    expect(run("castle.marksmen", [])).toBe(1);
    expect(run("heavenly_demon.blood_disciples", ["heavenly-demon-blood-siphon", "demon-blood-oath"])).toBe(2);
  });

  it("Corpse Stitching spends 1 Essence on activation to heal 2", () => {
    const state = combatState("heavenly_demon", "guiyan");
    const puppet = place(state, "unit_p1_crusaders", 9, { abilities: ["demon-corpse-stitch"], damage: 3 });
    record(state).bloodEssence = 2;
    wuxiaActivation(state, puppet);
    expect(puppet.damage).toBe(1);
    expect(record(state).bloodEssence).toBe(1);
    wuxiaActivation(state, puppet); // once per round
    expect(puppet.damage).toBe(1);
  });

  it("Soulfire Volley spends 1 Essence (2+ held) to splash 1 damage beside the target", () => {
    const run = (essence: number) => {
      let state = combatState("heavenly_demon", "guiyan");
      place(state, "unit_p1_marksmen", 1, { attack: 3, type: "ranged", abilities: ["demon-soulfire-volley"] });
      place(state, "unit_p2_skeletons", 10);
      place(state, "unit_p2_vampires", 11);
      state.combat!.round = 2; // Frenzy already spent below
      record(state).bloodEssence = essence;
      record(state).bloodFrenzySpentRound = 2;
      state = attack(state, "unit_p1_marksmen", "unit_p2_skeletons");
      if (state.pendingChoice?.type === "OPTION_CHOICE") {
        state = settle(
          applyOk(state, {
            type: "CHOOSE_OPTION",
            playerId: state.pendingChoice.playerId,
            choiceId: state.pendingChoice.id,
            optionIndex: 0
          })
        );
      }
      return { splash: state.combat!.units.unit_p2_vampires.damage, essence: record(state).bloodEssence };
    };
    expect(run(1)).toEqual({ splash: 0, essence: 1 });
    expect(run(2)).toEqual({ splash: 1, essence: 1 });
  });

  it("Heavenly Demon Body spends 1 Essence for +1 Defense against the first attack each round", () => {
    const run = (abilities: string[]) => {
      let state = combatState("heavenly_demon", "guiyan");
      place(state, "unit_p1_crusaders", 9, { abilities });
      place(state, "unit_p2_skeletons", 10, { attack: 4 });
      record(state).bloodEssence = 1;
      state = attack(state, "unit_p2_skeletons", "unit_p1_crusaders");
      return { defense: latestAttack(state, "unit_p2_skeletons").defenseValue, essence: record(state).bloodEssence };
    };
    expect(run([])).toEqual({ defense: 0, essence: 1 });
    expect(run(["demon-body"])).toEqual({ defense: 1, essence: 0 });
  });

  it("Shiyan's Corpse-Furnace Sutra lifts the once-per-round Blood Price limit", () => {
    const run = (hero: string) => {
      const state = combatState("heavenly_demon", hero);
      record(state).bloodEssence = 0;
      for (const id of ["unit_p1_marksmen", "unit_p1_griffins"]) {
        const unit = state.combat!.units[id];
        unit.variant = "pack";
        unit.damage = unit.maxHealth;
        markUnitRemovedIfNeeded(state, unit);
      }
      return record(state).bloodEssence;
    };
    expect(run("guiyan")).toBe(1);
    expect(run("shiyan")).toBe(2);
  });
});

describe("wuxia hero specialty cards", () => {
  it("Xuedao: the paid option is offered only with Essence and spends it for +2 Attack", () => {
    let state = combatState("heavenly_demon", "xuedao");
    state.players.p1.hand = ["specialty.xuedao.1"];
    place(state, "unit_p1_marksmen", 9, { attack: 3 });
    place(state, "unit_p2_skeletons", 10);
    record(state).bloodEssence = 2;
    record(state).bloodFrenzySpentRound = 1; // isolate the card from Blood Frenzy
    state = attackWithReaction(state, "unit_p1_marksmen", "unit_p2_skeletons", "p1", "specialty.xuedao.1", 1);
    expect(latestAttack(state, "unit_p1_marksmen").attackValue).toBe(5);
    expect(record(state).bloodEssence).toBe(1);

    let broke = combatState("heavenly_demon", "xuedao");
    broke.players.p1.hand = ["specialty.xuedao.1"];
    place(broke, "unit_p1_marksmen", 9, { attack: 3 });
    place(broke, "unit_p2_skeletons", 10);
    record(broke).bloodEssence = 0;
    broke.activePlayerId = "p1";
    broke.combat!.activeUnitId = "unit_p1_marksmen";
    broke = applyOk(broke, { type: "ATTACK_UNIT", playerId: "p1", attackerId: "unit_p1_marksmen", defenderId: "unit_p2_skeletons" });
    const offers = getLegalActions(broke, "p1").filter(
      (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === "specialty.xuedao.1"
    );
    expect(offers.map((legal) => (legal.action as { optionIndex?: number }).optionIndex ?? 0)).toEqual([0]);
  });

  it("Qingyun I deals 1 damage and tempers 1 Sword Intent", () => {
    let state = onTurn(combatState("azure_breeze", "qingyun"));
    state.players.p1.hand = ["specialty.qingyun.1"];
    const offer = playCardOffer(state, "specialty.qingyun.1", 0, "unit_p2_vampires");
    expect(offer).toBeTruthy();
    state = settle(applyOk(state, offer!.action));
    expect(state.combat!.units.unit_p2_vampires.damage).toBe(1);
    expect(record(state).swordIntent).toBe(1);
  });

  it("Lingxi I gains 1 Sect Qi and draws 1 card", () => {
    let state = onTurn(combatState("azure_breeze", "lingxi"));
    state.players.p1.hand = ["specialty.lingxi.1"];
    state.players.p1.deck = ["stat.power", ...state.players.p1.deck];
    const handBefore = 0;
    state = settle(applyOk(state, playCardOffer(state, "specialty.lingxi.1", 0)!.action));
    expect(record(state).sectQi).toBe(1);
    expect(state.players.p1.hand.length).toBe(handBefore + 1);
  });

  it("Lingxi VI mends only units standing in formation, then banks 2 Qi", () => {
    let state = onTurn(combatState("azure_breeze", "lingxi"));
    state.players.p1.hand = ["specialty.lingxi.6"];
    place(state, "unit_p1_marksmen", 9, { damage: 2 });
    place(state, "unit_p1_griffins", 8, { damage: 2 });
    place(state, "unit_p1_crusaders", 19, { damage: 2 });
    state = settle(applyOk(state, playCardOffer(state, "specialty.lingxi.6", 0)!.action));
    expect(state.combat!.units.unit_p1_marksmen.damage).toBe(1);
    expect(state.combat!.units.unit_p1_griffins.damage).toBe(1);
    expect(state.combat!.units.unit_p1_crusaders.damage).toBe(2);
    expect(record(state).sectQi).toBe(2);
  });

  it("Jianxu I adds +1 Attack per ally beside the attacker, capped at +2", () => {
    const run = (allies: number[]) => {
      let state = combatState("azure_breeze", "jianxu");
      state.players.p1.hand = ["specialty.jianxu.1"];
      place(state, "unit_p1_marksmen", 9, { attack: 3 });
      const ids = ["unit_p1_griffins", "unit_p1_crusaders"];
      allies.forEach((cell, index) => place(state, ids[index]!, cell));
      place(state, "unit_p2_skeletons", 10);
      record(state).sectQi = 0;
      state = attackWithReaction(state, "unit_p1_marksmen", "unit_p2_skeletons", "p1", "specialty.jianxu.1", 0);
      return latestAttack(state, "unit_p1_marksmen").attackValue;
    };
    expect(run([8])).toBe(4);
    expect(run([8, 5])).toBe(5);
  });

  it("Yulian VI: +2 Defense against the attack, then the survivor recovers 2", () => {
    let state = combatState("azure_breeze", "yulian");
    state.players.p1.hand = ["specialty.yulian.6"];
    place(state, "unit_p1_crusaders", 9, { damage: 3 });
    place(state, "unit_p2_skeletons", 10, { attack: 5 });
    record(state).sectQi = 0;
    state = attackWithReaction(state, "unit_p2_skeletons", "unit_p1_crusaders", "p1", "specialty.yulian.6", 0);
    const hit = latestAttack(state, "unit_p2_skeletons");
    expect(hit.defenseValue).toBe(2);
    expect(state.combat!.units.unit_p1_crusaders.damage).toBe(3 + hit.damage - 2);
    expect(record(state).sectQi).toBe(1);
  });

  it("Xuanming IV: Blood Harvest fires twice a round and heals the harvester", () => {
    let state = onTurn(combatState("heavenly_demon", "xuanming"));
    state.players.p1.hand = ["specialty.xuanming.4"];
    state = settle(applyOk(state, playCardOffer(state, "specialty.xuanming.4", 0)!.action));
    expect(record(state).bloodEssence).toBe(1);
    place(state, "unit_p1_marksmen", 9, { attack: 8, damage: 2 });
    place(state, "unit_p2_skeletons", 10, { maxHealth: 2 });
    state = attack(state, "unit_p1_marksmen", "unit_p2_skeletons");
    place(state, "unit_p1_griffins", 5, { attack: 8 });
    place(state, "unit_p2_vampires", 6, { maxHealth: 2 });
    state = attack(state, "unit_p1_griffins", "unit_p2_vampires");
    // 1 (card) + 2 harvests - 1 Blood Frenzy on the first attack.
    expect(record(state).bloodEssence).toBe(2);
    expect(state.combat!.units.unit_p1_marksmen.damage).toBe(1);
  });

  it("Luohun IV (paid) summons an empowered Bound Soul beside the chosen unit that expires after next round", () => {
    let state = onTurn(combatState("heavenly_demon", "luohun"));
    state.players.p1.hand = ["specialty.luohun.4"];
    place(state, "unit_p1_crusaders", 9);
    record(state).bloodEssence = 1;
    state = settle(applyOk(state, playCardOffer(state, "specialty.luohun.4", 1, "unit_p1_crusaders")!.action));
    const souls = Object.values(state.combat!.units).filter((unit) => unit.name === "Bound Soul");
    expect(souls).toHaveLength(1);
    // Luohun's Soul Shepherd (+1 Def, +1 HP) and empowered (+1 Atk, +1 HP).
    expect(souls[0]).toMatchObject({ attack: 3, defense: 1, maxHealth: 4, heroGradeExpiresAfterRound: 2 });
    expect([5, 8, 10, 13]).toContain(souls[0]!.position);
    expect(record(state).bloodEssence).toBe(0);
    expireHeroGradeFamiliars(state, 2);
    expect(souls[0]!.damage).toBe(souls[0]!.maxHealth);
  });

  it("Guiyan I paid option deals 2 damage for 1 Essence", () => {
    let state = onTurn(combatState("heavenly_demon", "guiyan"));
    state.players.p1.hand = ["specialty.guiyan.1"];
    record(state).bloodEssence = 1;
    state = settle(applyOk(state, playCardOffer(state, "specialty.guiyan.1", 1, "unit_p2_vampires")!.action));
    expect(state.combat!.units.unit_p2_vampires.damage).toBe(2);
    expect(record(state).bloodEssence).toBe(0);
  });

  it("Molian I paid option stitches +2 maximum Health for 1 Essence", () => {
    let state = onTurn(combatState("heavenly_demon", "molian"));
    state.players.p1.hand = ["specialty.molian.1"];
    record(state).bloodEssence = 1;
    const before = state.combat!.units.unit_p1_crusaders.maxHealth;
    state = settle(applyOk(state, playCardOffer(state, "specialty.molian.1", 1, "unit_p1_crusaders")!.action));
    expect(state.combat!.units.unit_p1_crusaders.maxHealth).toBe(before + 2);
    expect(record(state).bloodEssence).toBe(0);
  });

  it("Yaoji I paid option removes 3 damage for 1 Essence", () => {
    let state = onTurn(combatState("heavenly_demon", "yaoji"));
    state.players.p1.hand = ["specialty.yaoji.1"];
    place(state, "unit_p1_crusaders", 9, { damage: 4 });
    record(state).bloodEssence = 1;
    state = settle(applyOk(state, playCardOffer(state, "specialty.yaoji.1", 1, "unit_p1_crusaders")!.action));
    expect(state.combat!.units.unit_p1_crusaders.damage).toBe(1);
    expect(record(state).bloodEssence).toBe(0);
  });

  it("Shiyan IV paid side: spend 1 Essence for +2 Power on your own Spell (CONTROL: same cast without it; no offer at 0 Essence)", () => {
    const cast = (essence: number, react: boolean) => {
      let state = onTurn(combatState("heavenly_demon", "shiyan"));
      state.players.p1.hand = ["spell.magic_arrow", "specialty.shiyan.4"];
      record(state).bloodEssence = essence;
      state = applyOk(state, {
        type: "CAST_SPELL",
        playerId: "p1",
        cardId: "spell.magic_arrow",
        target: { type: "unit", unitId: "unit_p2_vampires" }
      });
      const offered = getLegalActions(state, "p1").find(
        (legal) =>
          legal.action.type === "PLAY_REACTION" &&
          legal.action.cardId === "specialty.shiyan.4" &&
          (legal.action.optionIndex ?? 0) === 1
      );
      if (react && offered) state = applyOk(state, offered.action);
      state = settle(state);
      return { offered: Boolean(offered), damage: state.combat!.units.unit_p2_vampires.damage, essence: record(state).bloodEssence };
    };
    const paid = cast(1, true);
    const plain = cast(1, false);
    expect(paid.offered).toBe(true);
    expect(paid.essence).toBe(0);
    expect(plain.essence).toBe(1);
    expect(paid.damage).toBeGreaterThan(plain.damage);
    expect(cast(0, true).offered).toBe(false);
  });

  it("Shiyan I gains 1 Essence and draws 1 card", () => {
    let state = onTurn(combatState("heavenly_demon", "shiyan"));
    state.players.p1.hand = ["specialty.shiyan.1"];
    state.players.p1.deck = ["stat.power", ...state.players.p1.deck];
    record(state).bloodEssence = 0;
    state = settle(applyOk(state, playCardOffer(state, "specialty.shiyan.1", 0)!.action));
    expect(record(state).bloodEssence).toBe(1);
    expect(state.players.p1.hand.length).toBe(1);
  });
});

describe("wuxia commanders", () => {
  function withCommander(factionId: "azure_breeze" | "heavenly_demon", slug: "sword_saint" | "demon_ancestor", magic = 0): GameState {
    const state = combatState(factionId, factionId === "azure_breeze" ? "lingxi" : "guiyan");
    state.wog = { enabled: true, commanders: true, newObjects: false, newCreatures: false, artifacts: false };
    state.players.p1.commander = {
      slug,
      grades: { attack: 0, defense: 0, health: 0, damage: 0, magic, speed: 0 }
    };
    const unit = makeCommanderCombatUnit(state.players.p1, 9)!;
    state.combat!.units[unit.id] = unit;
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = unit.id;
    return state;
  }

  function cast(state: GameState, slug: "sword_saint" | "demon_ancestor", targetUnitId: string): GameState {
    const offer = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "USE_UNIT_ABILITY" && legal.action.abilityId === commanderDefinitions[slug].cast.abilityId
    );
    expect(offer, `${slug} cast offered`).toBeTruthy();
    const opened = applyOk(state, offer!.action);
    const choice = opened.pendingChoice;
    if (choice?.type !== "ABILITY_TARGET_CHOICE") throw new Error("expected the commander-cast target choice");
    return applyOk(opened, { type: "CHOOSE_ABILITY_TARGET", playerId: "p1", choiceId: choice.id, targetUnitId });
  }

  it("Sword Saint's Sect Grandmaster opens combat with 1 Qi and +1 capacity while it stands", () => {
    const state = withCommander("azure_breeze", "sword_saint");
    expect(sectQiCapacity(state, "p1")).toBe(4);
    applyCommanderCombatStart(state);
    expect(record(state).sectQi).toBe(1);
    const saint = Object.values(state.combat!.units).find((unit) => unit.commanderSlug === "sword_saint")!;
    saint.damage = saint.maxHealth;
    expect(sectQiCapacity(state, "p1")).toBe(3);
  });

  it("Sword Qi Transmission: +1 Attack this round on an adjacent ally and 1 Sect Qi", () => {
    let state = withCommander("azure_breeze", "sword_saint");
    place(state, "unit_p1_griffins", 8);
    record(state).sectQi = 0;
    state = cast(state, "sword_saint", "unit_p1_griffins");
    expect(record(state).sectQi).toBe(1);
    expect(
      state.activeEffects.some(
        (effect) => effect.target?.type === "unit" && effect.target.unitId === "unit_p1_griffins" &&
          effect.modifiers.some((modifier) => modifier.type === "ATTACK_BONUS" && modifier.amount === 1)
      )
    ).toBe(true);
  });

  it("Blood Offering bleeds an ally 1 for 2 Essence and never targets a unit it would kill", () => {
    let state = withCommander("heavenly_demon", "demon_ancestor");
    place(state, "unit_p1_griffins", 8);
    place(state, "unit_p1_crusaders", 10, { maxHealth: 30, damage: 29 });
    record(state).bloodEssence = 0;
    const offer = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "USE_UNIT_ABILITY" && legal.action.abilityId === "commander-cast-demon_ancestor"
    );
    const opened = applyOk(state, offer!.action);
    const choice = opened.pendingChoice;
    if (choice?.type !== "ABILITY_TARGET_CHOICE") throw new Error("expected target choice");
    expect(choice.candidateUnitIds).toContain("unit_p1_griffins");
    expect(choice.candidateUnitIds).not.toContain("unit_p1_crusaders");
    state = cast(state, "demon_ancestor", "unit_p1_griffins");
    expect(state.combat!.units.unit_p1_griffins.damage).toBe(1);
    expect(record(state).bloodEssence).toBe(2);
  });

  it("Ancestral Blood Furnace: the first hit on the Demon Ancestor each round gains 1 Essence", () => {
    let state = withCommander("heavenly_demon", "demon_ancestor");
    const ancestor = Object.values(state.combat!.units).find((unit) => unit.commanderSlug === "demon_ancestor")!;
    place(state, "unit_p2_skeletons", 10, { attack: 20 });
    ancestor.maxHealth = 40;
    ancestor.retaliatedThisRound = true;
    record(state).bloodEssence = 0;
    state = attack(state, "unit_p2_skeletons", ancestor.id);
    expect(record(state).bloodEssence).toBe(1);
    state = attack(state, "unit_p2_skeletons", ancestor.id);
    expect(record(state).bloodEssence).toBe(1);
  });
});

describe("wuxia rework — hex footprints", () => {
  // A double-wide body in an Azure army (a recruited neutral Azure Dragon): the
  // formation is read off its WHOLE footprint, so an ally beside only its tail
  // hex links it exactly like one beside its head.
  function hexFormation(): { state: GameState; dragon: CombatUnitState } {
    const state = combatState("azure_breeze", "lingxi");
    state.combat!.geometry = "hex";
    const corners = [hexPosition(12, 0), hexPosition(12, 8), hexPosition(0, 0), hexPosition(0, 8), hexPosition(12, 6), hexPosition(0, 6)];
    Object.values(state.combat!.units).forEach((unit, index) => {
      unit.position = corners[index] ?? hexPosition(6, 0)!;
    });
    const dragon = place(state, "unit_p1_marksmen", hexPosition(6, 4)!, { unitDefId: "neutral.azure_dragons", attack: 3 });
    expect(unitCells(state.combat!, dragon), "double-wide on the hex board").toHaveLength(2);
    return { state, dragon };
  }
  const hexes = getBattlefieldPositions("hex");
  const touching = (cell: number, cells: number[]) => cells.some((own) => isAdjacent(own, cell));

  it("Sword Formation spends Qi when the only ally touches the attacker's tail hex (CONTROL: an ally touching neither hex)", () => {
    const run = (tailAlly: boolean) => {
      const { state, dragon } = hexFormation();
      const [head, tail] = unitCells(state.combat!, dragon);
      const allyCell = hexes.find((cell) =>
        cell !== head && cell !== tail &&
        (tailAlly ? isAdjacent(cell, tail!) && !isAdjacent(cell, head!) : !touching(cell, [head!, tail!]) && Math.abs(((cell - 100) % 13) - 6) <= 3)
      )!;
      place(state, "unit_p1_griffins", allyCell);
      const enemy = place(state, "unit_p2_skeletons", hexes.find((cell) => isAdjacent(cell, head!) && !touching(cell, [allyCell]) && cell !== tail)!);
      record(state).sectQi = 1;
      const stackItem = { modifiers: { playedCardIds: [] } } as unknown as ResolutionStackItem;
      applyCultivationAttackDeclaration(state, stackItem, dragon, enemy, false);
      return { bonus: stackItem.modifiers.cultivationAttackBonus ?? 0, qi: record(state).sectQi };
    };
    expect(run(true)).toEqual({ bonus: 1, qi: 0 });
    expect(run(false)).toEqual({ bonus: 0, qi: 1 });
  });

  it("a move whose new TAIL hex closes the formation circulates Sect Qi (CONTROL: a landing that touches no ally)", () => {
    const run = (tailLink: boolean) => {
      const { state, dragon } = hexFormation();
      const from = dragon.position;
      const ally = place(state, "unit_p1_griffins", hexPosition(2, 4)!);
      // Land with the tail beside the ally and the head clear of it — or further east, beside nobody.
      const to = hexPosition(tailLink ? 4 : 8, 4)!;
      const [head, tail] = unitCellsAt(state.combat!, dragon, to);
      if (tailLink) {
        expect(isAdjacent(tail!, ally.position)).toBe(true);
        expect(isAdjacent(head!, ally.position)).toBe(false);
      }
      dragon.position = to;
      record(state).sectQi = 0;
      gainSectQiAfterMove(state, dragon, from, to);
      return record(state).sectQi;
    };
    expect(run(true)).toBe(1);
    expect(run(false)).toBe(0);
  });
});

describe("wuxia rework — audit regressions", () => {
  it("a meter-priced +Power side is never a free discard Power source (Shiyan IV/VI)", async () => {
    const { cardLibrary } = await import("@/data/cards/library");
    const { cardCanBoostPower, spellPowerValueOfCard } = await import("./effects");
    for (const id of ["specialty.shiyan.4", "specialty.shiyan.6"]) {
      expect(spellPowerValueOfCard(cardLibrary[id], []), id).toBe(0);
      expect(cardCanBoostPower(cardLibrary[id]), id).toBe(false);
    }
    // CONTROL: an ordinary +Power card still boosts.
    expect(cardCanBoostPower(cardLibrary["stat.power"])).toBe(true);
  });

  it("Yulian VI still mends the defender when the attacker has already died (e.g. to a Fire Shield)", async () => {
    const { wuxiaAfterAttack } = await import("./wuxia-factions");
    const state = combatState("azure_breeze", "yulian");
    const defender = place(state, "unit_p1_crusaders", 9, { damage: 3 });
    const attacker = place(state, "unit_p2_skeletons", 10);
    attacker.damage = attacker.maxHealth; // died on the way in
    const stackItem = { modifiers: { wuxiaJadeRecover: 2 } } as unknown as Parameters<typeof wuxiaAfterAttack>[1];
    wuxiaAfterAttack(state, stackItem, attacker, defender, false, 1);
    expect(defender.damage).toBe(1);
  });

  it("Heavenly Demon Body uses the round's first attack even with no Essence, so a later hit gets nothing", () => {
    let state = combatState("heavenly_demon", "guiyan");
    place(state, "unit_p1_crusaders", 9, { abilities: ["demon-body"] });
    place(state, "unit_p2_skeletons", 10, { attack: 4 });
    place(state, "unit_p2_vampires", 5, { attack: 4 });
    record(state).bloodEssence = 0;
    state = attack(state, "unit_p2_skeletons", "unit_p1_crusaders");
    record(state).bloodEssence = 1;
    state = attack(state, "unit_p2_vampires", "unit_p1_crusaders");
    expect(latestAttack(state, "unit_p2_vampires").defenseValue).toBe(0);
    expect(record(state).bloodEssence).toBe(1);
  });
});
