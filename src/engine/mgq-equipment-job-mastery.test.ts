import { describe, expect, it } from "vitest";

import {
  DEFAULT_ANIME_OPTIONS,
  applyAction,
  createAdventureGameState,
  createInitialGameState,
  effectiveHandLimit,
  getMainHero,
  standingSpellPower,
  type GameAction,
  type GameState
} from "./index";
import {
  applyEquipmentStageCostumeDefenseToken,
  equipmentFirstAttackBonus,
  equipmentIncomingAttackPenalty,
  markEquipmentAttackResolved
} from "./anime-equipment";
import {
  heroGradeNodesForRegister,
  heroGradePickableNodes
} from "./anime-hero-grades";
import {
  MGQ_JOB_GOLD_COST,
  MGQ_JOB_MASTERY_NODE_ID,
  consumesMgqKitchenCharge,
  mgqJobAssignmentCost
} from "./mgq-jobs";
import { EQUIPMENT_IDS } from "@/data/anime/equipment";
import { MGQ_JOB_MASTERY_NODE } from "@/data/anime/hero-grades";
import { cardLibrary } from "@/data/cards/library";

const EQUIPMENT_ON = { ...DEFAULT_ANIME_OPTIONS, enabled: true, equipment: true };
const GRADES_ON = { ...DEFAULT_ANIME_OPTIONS, enabled: true, heroGrades: true };

function equip(
  state: GameState,
  slot: "weapon" | "armor" | "accessory",
  equipmentId: string
): void {
  const hero = getMainHero(state, "p1")!;
  hero.equipment = { ...(hero.equipment ?? {}), [slot]: equipmentId };
}

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function gradeState(seed: string, factionId: "castle" | "mgq"): GameState {
  let state = createAdventureGameState({
    seed,
    difficulty: "normal",
    rollFirstPlayer: false,
    anime: GRADES_ON
  });
  if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
    state = applyOk(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
  }
  // The engine FactionId registration is owned by the MGQ state/mechanics
  // segment; this focused fold test only needs the live player register read.
  state.players.p1.factionId = factionId as never;
  const hero = getMainHero(state, "p1")!;
  hero.grade = 3;
  hero.gradePoints = 1;
  hero.gradeNodes = [];
  return state;
}

describe("MGQ equipment fold reuses", () => {
  it("Angel Halo grants +1 only to the first declared attack and spends that charge", () => {
    const state = createInitialGameState("mgq-angel-halo");
    state.anime = { ...EQUIPMENT_ON };
    equip(state, "weapon", EQUIPMENT_IDS.mgqAngelHalo);
    const attacker = state.combat!.units.unit_p1_griffins;
    const defender = state.combat!.units.unit_p2_skeletons;

    expect(equipmentFirstAttackBonus(state, attacker, false)).toBe(1);
    expect(equipmentFirstAttackBonus(state, attacker, true)).toBe(0);
    markEquipmentAttackResolved(state, attacker, defender, false);
    expect(equipmentFirstAttackBonus(state, attacker, false)).toBe(0);
  });

  it("Heavenly Knight's Aegis grants the first-incoming Defense token and never the -1 Attack fold", () => {
    const state = createInitialGameState("mgq-heavenly-aegis");
    state.anime = { ...EQUIPMENT_ON };
    equip(state, "armor", EQUIPMENT_IDS.mgqHeavenlyKnightsAegis);
    const defender = state.combat!.units.unit_p1_griffins;
    defender.defenseToken = false;

    // Mutation control: putting Aegis in INCOMING_PENALTY_ITEMS would make this 1.
    expect(equipmentIncomingAttackPenalty(state, defender, false)).toBe(0);
    applyEquipmentStageCostumeDefenseToken(state, defender);
    expect(defender.defenseToken).toBe(true);

    const secondDefender = { controllerId: "p1" as const, id: "second-defender", defenseToken: false };
    applyEquipmentStageCostumeDefenseToken(state, secondDefender);
    expect(secondDefender.defenseToken).toBe(false);
  });

  it("Monster Lord's Ring contributes +1 spell Power and +1 hand limit at once", () => {
    const state = createAdventureGameState({
      seed: "mgq-monster-lord-ring",
      difficulty: "normal",
      rollFirstPlayer: false,
      anime: EQUIPMENT_ON
    });
    const spell = cardLibrary["spell.magic_arrow"];
    const basePower = standingSpellPower(state, "p1", spell);
    const baseHand = effectiveHandLimit(state, "p1");

    equip(state, "accessory", EQUIPMENT_IDS.mgqMonsterLordsRing);
    expect(standingSpellPower(state, "p1", spell)).toBe(basePower + 1);
    expect(effectiveHandLimit(state, "p1")).toBe(baseHand + 1);
  });
});

describe("MGQ Job Mastery grade node", () => {
  it("appears only in the MGQ register tree; a non-MGQ forced pick is rejected", () => {
    expect(heroGradeNodesForRegister("mgq").map((node) => node.id)).toContain(MGQ_JOB_MASTERY_NODE.id);
    expect(heroGradeNodesForRegister("core").map((node) => node.id)).not.toContain(MGQ_JOB_MASTERY_NODE.id);

    const castle = gradeState("mgq-job-mastery-castle", "castle");
    expect(heroGradePickableNodes(castle, "p1").map((node) => node.id)).not.toContain(MGQ_JOB_MASTERY_NODE.id);
    const forced = applyAction(castle, {
      type: "HERO_GRADE_PICK",
      playerId: "p1",
      nodeId: MGQ_JOB_MASTERY_NODE.id
    });
    expect(forced.errors.length).toBeGreaterThan(0);
  });

  it("an MGQ hero can pick Job Mastery and the shared 2-gold assignment gate becomes free", () => {
    let state = gradeState("mgq-job-mastery-pick", "mgq");
    expect(MGQ_JOB_MASTERY_NODE_ID).toBe(MGQ_JOB_MASTERY_NODE.id);
    expect(mgqJobAssignmentCost(state, "p1")).toBe(MGQ_JOB_GOLD_COST);
    expect(heroGradePickableNodes(state, "p1").map((node) => node.id)).toContain(MGQ_JOB_MASTERY_NODE.id);

    state = applyOk(state, {
      type: "HERO_GRADE_PICK",
      playerId: "p1",
      nodeId: MGQ_JOB_MASTERY_NODE.id
    });
    expect(getMainHero(state, "p1")!.gradeNodes).toContain(MGQ_JOB_MASTERY_NODE.id);
    expect(mgqJobAssignmentCost(state, "p1")).toBe(0);
    expect(consumesMgqKitchenCharge(state, "p1")).toBe(false);
  });
});

