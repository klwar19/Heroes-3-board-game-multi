import { describe, expect, it } from "vitest";
import { EQUIPMENT_GRADE_COST, EQUIPMENT_IDS, getEquipmentDefinition } from "@/data/anime/equipment";
import { cardLibrary } from "@/data/cards/library";
import { applyAction } from "./reducer";
import { createAdventureGameState, createInitialGameState, getMainHero } from "./index";
import { buildEquipmentGradePurchaseStep, grantCreatureBankReward } from "./adventure";
import { getLegalActions } from "./legal-actions";
import {
  consumeEquipmentDrawRiderBonus,
  consumeEquipmentFirstDamagePrevention,
  equipmentAttackRerollSources,
  equipmentBronzeInitiativeBonus,
  equipmentCombatUnitOffers,
  equipmentRowDefenseBonus
} from "./anime-equipment";
import { DEFAULT_ANIME_OPTIONS } from "./anime";
import type { GameAction, GameState } from "./state";

const anime = { ...DEFAULT_ANIME_OPTIONS, enabled: true, equipment: true };

function combat(seed: string): GameState {
  const state = createInitialGameState(seed);
  state.anime = anime;
  state.players.p1.hand = [];
  state.players.p2.hand = [];
  state.players.p1.morale = 0;
  state.players.p2.morale = 0;
  const attacker = state.combat!.units.unit_p1_griffins;
  const defender = state.combat!.units.unit_p2_skeletons;
  attacker.abilities = [];
  attacker.position = 9;
  attacker.attack = 8;
  defender.abilities = [];
  defender.position = 10;
  defender.defense = 2;
  defender.maxHealth = 100;
  defender.damage = 0;
  state.combat!.activeUnitId = attacker.id;
  state.activePlayerId = "p1";
  state.combat!.dice.scriptedRolls = [0, 0, 0, 0, 0, 0];
  return state;
}

function equip(state: GameState, slot: "weapon" | "armor" | "accessory" | "mount", id: string): void {
  const hero = Object.values(state.heroes).find((candidate) => candidate.controllerId === "p1" && candidate.kind === "main")!;
  hero.equipment = { ...(hero.equipment ?? {}), [slot]: id };
}

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action, { cards: cardLibrary });
  expect(result.errors).toEqual([]);
  return result.state;
}

function reachReaction(state: GameState, type: GameAction["type"]): { state: GameState; action: GameAction } {
  let current = state;
  for (let guard = 0; guard < 12; guard += 1) {
    const owner = current.reactionWindow?.priorityPlayerId;
    if (!owner) break;
    const action = getLegalActions(current, owner).find((entry) => entry.action.type === type)?.action;
    if (action) return { state: current, action };
    current = applyOk(current, { type: "PASS_REACTION", playerId: owner });
  }
  throw new Error(`Reaction ${type} was not offered.`);
}

function passAll(state: GameState): GameState {
  let current = state;
  for (let guard = 0; current.reactionWindow && guard < 20; guard += 1) {
    current = applyOk(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
  }
  return current;
}

describe("expanded anime equipment effects", () => {
  it("builds complete grade-limited purchase menus at the 5/7/10 gold prices", () => {
    const state = createAdventureGameState({ seed: "equipment-grade-menus", rollFirstPlayer: false, anime });
    for (const grade of ["I", "II", "III"] as const) {
      const step = buildEquipmentGradePurchaseStep(state, "p1", [grade], `Grade ${grade}`);
      expect(step?.type).toBe("CHOOSE_ONE");
      if (step?.type !== "CHOOSE_ONE") throw new Error("missing equipment offer");
      const purchases = step.options.filter((option) => option.steps[0]?.type === "BUY_EQUIPMENT");
      expect(purchases.length).toBeGreaterThan(0);
      for (const option of purchases) {
        const first = option.steps[0];
        if (first?.type !== "BUY_EQUIPMENT") continue;
        expect(getEquipmentDefinition(first.equipmentId)?.grade).toBe(grade);
        expect(option.label).toContain(`${EQUIPMENT_GRADE_COST[grade]} gold`);
      }
    }
  });

  it("grants Far-bank Grade I equipment for free", () => {
    const state = createAdventureGameState({ seed: "far-bank-free-equipment", rollFirstPlayer: false, anime });
    const hero = getMainHero(state, "p1")!;
    const field = state.adventure!.fields[hero.spaceId!]!;
    field.location = "creature_bank";
    field.bankId = "imp_cache";
    const goldBefore = state.players.p1.resources.gold;

    grantCreatureBankReward(state, hero.id, field.spaceId, 0);
    const step = state.adventure!.pendingVisit?.steps[0];
    expect(step?.type).toBe("CHOOSE_ONE");
    if (step?.type !== "CHOOSE_ONE") throw new Error("missing Far-bank equipment reward");
    expect(step.prompt).toContain("take 1 Grade I equipment item for free");
    expect(step.options.every((option) => option.steps[0]?.type === "GRANT_EQUIPMENT")).toBe(true);

    const next = applyAction(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: 0 });
    expect(next.errors).toEqual([]);
    expect(next.state.players.p1.resources.gold).toBe(goldBefore + 3); // bank's printed 3 gold only
    const gained = Object.values(getMainHero(next.state, "p1")!.equipment ?? {})[0];
    expect(getEquipmentDefinition(gained!)?.grade).toBe("I");
  });

  it("rolls Near-bank equipment between Grade II and III, then grants it free", () => {
    const seen = new Set<string>();
    for (let index = 0; index < 30 && seen.size < 2; index += 1) {
      const state = createAdventureGameState({ seed: `near-bank-free-equipment-${index}`, rollFirstPlayer: false, anime });
      const hero = getMainHero(state, "p1")!;
      const field = state.adventure!.fields[hero.spaceId!]!;
      field.location = "creature_bank";
      field.bankId = "derelict_ship";
      grantCreatureBankReward(state, hero.id, field.spaceId, 0);
      const step = state.adventure!.pendingVisit?.steps[0];
      if (step?.type !== "CHOOSE_ONE") throw new Error("missing Near-bank equipment reward");
      const grade = step.prompt.match(/Grade (II|III) won/)?.[1];
      expect(grade).toBeTruthy();
      seen.add(grade!);
      expect(step.options.every((option) => option.steps[0]?.type === "GRANT_EQUIPMENT")).toBe(true);
      for (const option of step.options) {
        const reward = option.steps[0];
        if (reward?.type === "GRANT_EQUIPMENT") {
          expect(getEquipmentDefinition(reward.equipmentId)?.grade).toBe(grade);
        }
      }
    }
    expect(seen).toEqual(new Set(["II", "III"]));
  });

  it("applies each combat-long Grade II unit selection exactly once", () => {
    for (const [equipmentId, slot, modifier, amount] of [
      [EQUIPMENT_IDS.duelistInsignia, "accessory", "ATTACK_BONUS", 1],
      [EQUIPMENT_IDS.clockworkSpurs, "mount", "INITIATIVE_BONUS", 2]
    ] as const) {
      let state = combat(`selection-${equipmentId}`);
      equip(state, slot, equipmentId);
      const offer = equipmentCombatUnitOffers(state, "p1")[0];
      expect(offer).toBeTruthy();
      state = applyOk(state, {
        type: "SELECT_EQUIPMENT_COMBAT_UNIT",
        playerId: "p1",
        equipmentId,
        unitId: offer.unitId
      });
      expect(equipmentCombatUnitOffers(state, "p1")).toEqual([]);
      expect(state.activeEffects.some((effect) =>
        effect.target?.type === "unit" && effect.target.unitId === offer.unitId &&
        effect.modifiers.some((entry) => entry.type === modifier && "amount" in entry && entry.amount === amount)
      )).toBe(true);
    }
  });

  it("Corrosion Edge and Wyvern Needle each arm once and alter the surviving target", () => {
    for (const [equipmentId, expected] of [
      [EQUIPMENT_IDS.corrosionEdge, "corrosion"],
      [EQUIPMENT_IDS.wyvernNeedle, "poison"]
    ] as const) {
      let state = combat(`rider-${equipmentId}`);
      equip(state, "weapon", equipmentId);
      state = applyOk(state, {
        type: "ATTACK_UNIT", playerId: "p1", attackerId: "unit_p1_griffins", defenderId: "unit_p2_skeletons"
      });
      const reaction = reachReaction(state, "USE_EQUIPMENT_ATTACK_RIDER");
      state = passAll(applyOk(reaction.state, reaction.action));
      const defender = state.combat!.units.unit_p2_skeletons;
      if (expected === "corrosion") expect(defender.tokens?.some((token) => token.kind === "corrosion")).toBe(true);
      else expect(defender.poisonCubes).toBe(1);
      expect(state.players.p1.combatStats.equipmentUsesThisCombat).toContain(equipmentId);
    }
  });

  it("Field Medic Kit heals instantly, while Guardian Mirror cancels the whole attack", () => {
    let heal = combat("field-medic");
    equip(heal, "armor", EQUIPMENT_IDS.fieldMedicKit);
    heal.combat!.units.unit_p1_griffins.damage = 2;
    heal.combat!.activeUnitId = "unit_p2_skeletons";
    heal.activePlayerId = "p2";
    heal = applyOk(heal, {
      type: "ATTACK_UNIT", playerId: "p2", attackerId: "unit_p2_skeletons", defenderId: "unit_p1_griffins"
    });
    const medic = reachReaction(heal, "USE_EQUIPMENT_HEAL_REACTION");
    heal = applyOk(medic.state, medic.action);
    expect(heal.eventLog.some((event) => event.type === "DAMAGE_HEALED" && event.amount === 1)).toBe(true);
    expect(heal.players.p1.combatStats.equipmentUsesThisCombat).toContain(EQUIPMENT_IDS.fieldMedicKit);

    let mirror = combat("guardian-mirror");
    equip(mirror, "armor", EQUIPMENT_IDS.guardianMirror);
    mirror.combat!.activeUnitId = "unit_p2_skeletons";
    mirror.activePlayerId = "p2";
    mirror = applyOk(mirror, {
      type: "ATTACK_UNIT", playerId: "p2", attackerId: "unit_p2_skeletons", defenderId: "unit_p1_griffins"
    });
    const guardian = reachReaction(mirror, "USE_EQUIPMENT_GUARDIAN_REACTION");
    mirror = passAll(applyOk(guardian.state, guardian.action));
    expect(mirror.combat!.units.unit_p1_griffins.damage).toBe(0);
    expect(mirror.activeEffects.some((effect) => effect.modifiers.some((entry) => entry.type === "CANNOT_RETALIATE"))).toBe(true);
  });

  it("exposes the redistributed rerolls and consumes the draw-rider bonus once per round", () => {
    const state = combat("equipment-rerolls");
    equip(state, "weapon", EQUIPMENT_IDS.crusadersPoleaxe);
    expect(equipmentAttackRerollSources(state, "p1", false).map((source) => source.equipmentId))
      .toContain(EQUIPMENT_IDS.crusadersPoleaxe);

    equip(state, "accessory", EQUIPMENT_IDS.foldedTacticsManual);
    expect(consumeEquipmentDrawRiderBonus(state, "p1")).toBe(1);
    expect(consumeEquipmentDrawRiderBonus(state, "p1")).toBe(0);
    state.round += 1;
    expect(consumeEquipmentDrawRiderBonus(state, "p1")).toBe(1);
  });

  it("applies bronze initiative, row defense, and first-damage prevention only to valid units", () => {
    const state = combat("equipment-passives");
    const griffins = state.combat!.units.unit_p1_griffins;
    griffins.grade = "bronze";
    equip(state, "weapon", EQUIPMENT_IDS.mgqAngelHalo);
    expect(equipmentBronzeInitiativeBonus(state, griffins)).toBe(2);

    equip(state, "armor", EQUIPMENT_IDS.ironbarkCuirass);
    griffins.type = "ground";
    griffins.position = 16;
    expect(equipmentRowDefenseBonus(state, griffins)).toBe(1);

    equip(state, "armor", EQUIPMENT_IDS.repairToolkit);
    expect(consumeEquipmentFirstDamagePrevention(state, griffins)).toBe(1);
    expect(consumeEquipmentFirstDamagePrevention(state, griffins)).toBe(0);
  });
});
