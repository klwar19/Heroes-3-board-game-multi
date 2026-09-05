import { describe, expect, it } from "vitest";

import { hasMediaFile, mediaFileInfo } from "@/lib/media-manifest";

import { EQUIPMENT_IDS } from "@/data/anime/equipment";
import { HERO_GRADE_ICONS } from "@/data/anime/hero-grades";
import { coreFactionDefinitions } from "@/data/factions/core";
import { WUXIA_RANK_ABILITY_ICONS, unitRankAbilityIcon } from "@/data/units/experience";
import { applyAction, createAdventureGameState, createInitialGameState, healLegacyPlayerFields } from "./index";
import { resolveAnimeOptions } from "./anime";
import { markUnitRemovedIfNeeded } from "./combat-units";
import { expireHeroGradeFamiliars } from "./hero-grade-combat";
import type { CombatUnitState, GameAction, GameEvent, GameState } from "./state";
import {
  gainSectQiAfterMove,
  initializeCultivationFactionCombat,
  injectSoulBannerShade,
  SOUL_BANNER_SHADE_CARD_IMAGE
} from "./wuxia-factions";

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
      current = applyOk(current, {
        type: "PASS_REACTION",
        playerId: current.reactionWindow.priorityPlayerId
      });
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

function latestOwnAttack(state: GameState, attackerId: string): Extract<GameEvent, { type: "ATTACK_ROLLED" }> {
  const event = [...state.eventLog].reverse().find(
    (candidate) =>
      candidate.type === "ATTACK_ROLLED" &&
      candidate.attackerId === attackerId &&
      !candidate.isRetaliation
  );
  expect(event).toBeTruthy();
  return event as Extract<GameEvent, { type: "ATTACK_ROLLED" }>;
}

function combatState(
  factionId: "azure_breeze" | "heavenly_demon",
  heroDefId: "qingyun" | "xuedao" | "jianxu" | "yulian" | "luohun" | "shiyan"
): GameState {
  const state = createInitialGameState(`wuxia-${factionId}-${heroDefId}`);
  // Wuxia towns run Cultivation as their only progression; the signature-meter
  // upgrades fold onto the Cultivation Realm, so enable the module here.
  state.anime = resolveAnimeOptions({ enabled: true, cultivation: true });
  state.players.p1.factionId = factionId;
  state.heroes.hero_p1.heroDefId = heroDefId;
  state.players.p1.hand = [];
  state.players.p2.hand = [];
  state.combat!.dice.scriptedRolls = Array.from({ length: 40 }, () => 0);
  state.combat!.dice.rollCount = 0;
  initializeCultivationFactionCombat(state, state.combat!);
  return state;
}

function configure(
  state: GameState,
  unitId: string,
  position: number,
  controllerId: "p1" | "p2",
  attack = 0,
  defense = 0
): CombatUnitState {
  const unit = state.combat!.units[unitId];
  Object.assign(unit, {
    position,
    controllerId,
    attack,
    defense,
    maxHealth: 30,
    damage: 0,
    abilities: [],
    activatedThisRound: false,
    movedThisActivation: false,
    retaliatedThisRound: false,
    defenseToken: false
  });
  return unit;
}

function attack(state: GameState, attackerId: string, defenderId: string): GameState {
  const attacker = state.combat!.units[attackerId];
  attacker.abilities = [...new Set([...attacker.abilities, "ignores-retaliation"])];
  attacker.activatedThisRound = false;
  state.activePlayerId = attacker.controllerId;
  state.combat!.activeUnitId = attackerId;
  return settle(applyOk(state, {
    type: "ATTACK_UNIT",
    playerId: attacker.controllerId,
    attackerId,
    defenderId
  }));
}

describe("Azure Breeze cultivation combat", () => {
  it("Jianxu's Seven-Star Array gives a tight three-unit formation +1 Attack", () => {
    let state = combatState("azure_breeze", "jianxu");
    const attacker = configure(state, "unit_p1_marksmen", 9, "p1", 3);
    configure(state, "unit_p1_griffins", 8, "p1");
    configure(state, "unit_p1_crusaders", 5, "p1");
    configure(state, "unit_p2_skeletons", 10, "p2", 0, 1);
    configure(state, "unit_p2_vampires", 16, "p2");
    configure(state, "unit_p2_dread_knights", 19, "p2");
    state.combat!.cultivationFactions!.p1!.sectQi = 1;
    state.combat!.units.unit_p1_griffins.abilities = ["azure-sword-array"];

    state = attack(state, attacker.id, "unit_p2_skeletons");
    expect(latestOwnAttack(state, attacker.id).attackValue).toBe(4);
    expect(state.eventLog.some((event) => event.type === "HERO_SKILL_USED" && event.nodeId === "jianxu-seven-star-array")).toBe(true);
  });

  it("Yulian's Jade Body heals only the first damaged Shared Ward defender each round", () => {
    let state = combatState("azure_breeze", "yulian");
    const defender = configure(state, "unit_p1_marksmen", 9, "p1", 0, 10);
    defender.damage = 2;
    configure(state, "unit_p1_griffins", 8, "p1");
    const attacker = configure(state, "unit_p2_skeletons", 10, "p2", 0, 0);
    configure(state, "unit_p1_crusaders", 0, "p1");
    const secondAttacker = configure(state, "unit_p2_vampires", 5, "p2", 0, 0);
    configure(state, "unit_p2_dread_knights", 19, "p2");
    state.combat!.cultivationFactions!.p1!.sectQi = 1;

    state = attack(state, attacker.id, defender.id);
    expect(state.combat!.units[defender.id].damage).toBe(1);
    expect(state.combat!.cultivationFactions?.p1?.jadeBodyTemperingRound).toBe(1);

    state.combat!.units[defender.id].damage = 2;
    state.combat!.cultivationFactions!.p1!.sectQi = 1;
    state = attack(state, secondAttacker.id, defender.id);
    expect(state.combat!.units[defender.id].damage).toBe(2);
  });

  it("spends Sect Qi for an observable +1 Attack inside a living sword formation", () => {
    let state = combatState("azure_breeze", "qingyun");
    const attacker = configure(state, "unit_p1_marksmen", 9, "p1", 3);
    configure(state, "unit_p1_griffins", 8, "p1");
    configure(state, "unit_p2_skeletons", 10, "p2", 0, 1);
    configure(state, "unit_p1_crusaders", 0, "p1");
    configure(state, "unit_p2_vampires", 16, "p2");
    configure(state, "unit_p2_dread_knights", 19, "p2");

    expect(state.combat!.cultivationFactions?.p1?.sectQi).toBe(0);
    state.combat!.cultivationFactions!.p1!.sectQi = 1;
    state = attack(state, attacker.id, "unit_p2_skeletons");

    expect(latestOwnAttack(state, attacker.id).attackValue).toBe(4);
    expect(state.combat!.cultivationFactions?.p1).toMatchObject({ sectQi: 0, swordIntent: 1 });
  });

  it("gains Qi only when movement creates a new allied adjacency", () => {
    const state = combatState("azure_breeze", "qingyun");
    const mover = configure(state, "unit_p1_marksmen", 0, "p1");
    configure(state, "unit_p1_griffins", 6, "p1");
    state.combat!.cultivationFactions!.p1!.sectQi = 0;

    gainSectQiAfterMove(state, mover, 0, 5);
    expect(state.combat!.cultivationFactions?.p1?.sectQi).toBe(1);
    gainSectQiAfterMove(state, mover, 5, 9);
    expect(state.combat!.cultivationFactions?.p1?.sectQi).toBe(1);
  });

  it("releases fully tempered Sword Intent for +1 Attack, then the damaging release begins re-tempering", () => {
    let state = combatState("azure_breeze", "qingyun");
    const attacker = configure(state, "unit_p1_marksmen", 9, "p1", 3);
    configure(state, "unit_p2_skeletons", 10, "p2", 0, 1);
    configure(state, "unit_p1_griffins", 0, "p1");
    configure(state, "unit_p1_crusaders", 3, "p1");
    configure(state, "unit_p2_vampires", 16, "p2");
    configure(state, "unit_p2_dread_knights", 19, "p2");
    state.combat!.cultivationFactions!.p1 = { sectQi: 0, swordIntent: 3 };

    state = attack(state, attacker.id, "unit_p2_skeletons");

    expect(latestOwnAttack(state, attacker.id).attackValue).toBe(4);
    expect(state.combat!.cultivationFactions?.p1?.swordIntent).toBe(1);
  });

  it("cultivation starts with at most one Qi, caps at two, and shortens Sword Domain tempering", () => {
    let state = combatState("azure_breeze", "qingyun");
    // Realm 3 (Nascent Soul) folds in all three former grade nodes: Meridian
    // Circulation (r1), Body Refinement (r2) and Sword Domain (r3).
    state.heroes.hero_p1.cultivationRealm = 3;
    initializeCultivationFactionCombat(state, state.combat!);
    expect(state.combat!.cultivationFactions?.p1?.sectQi).toBe(1);

    const attacker = configure(state, "unit_p1_marksmen", 9, "p1", 3);
    configure(state, "unit_p1_griffins", 0, "p1");
    configure(state, "unit_p1_crusaders", 6, "p1");
    configure(state, "unit_p2_skeletons", 10, "p2", 0, 1);
    configure(state, "unit_p2_vampires", 16, "p2");
    configure(state, "unit_p2_dread_knights", 19, "p2");
    state.combat!.cultivationFactions!.p1 = { sectQi: 1, swordIntent: 0 };
    gainSectQiAfterMove(state, attacker, 9, 5);
    expect(state.combat!.cultivationFactions?.p1?.sectQi).toBe(2);

    attacker.position = 9;
    state.combat!.units.unit_p1_crusaders.position = 0;
    state.combat!.cultivationFactions!.p1 = { sectQi: 0, swordIntent: 2 };
    state = attack(state, attacker.id, "unit_p2_skeletons");
    expect(latestOwnAttack(state, attacker.id).attackValue).toBe(4);
    expect(state.combat!.cultivationFactions?.p1?.swordIntent).toBe(1);
  });
});

describe("cultivation art contract", () => {
  it("ships distinct realm, resource, equipment, and per-unit veterancy art for both towns", () => {
    const roster = [
      ...coreFactionDefinitions.azure_breeze.units,
      ...coreFactionDefinitions.heavenly_demon.units
    ];
    expect(roster).toHaveLength(14);
    expect(Object.keys(WUXIA_RANK_ABILITY_ICONS).sort()).toEqual([...roster].sort());

    const rankIcons = roster.map((unitId) => unitRankAbilityIcon("commander-max-damage", unitId));
    expect(new Set(rankIcons).size).toBe(14);
    const assets = [
      ...rankIcons,
      ...(HERO_GRADE_ICONS.xianxia ?? []),
      ...(HERO_GRADE_ICONS.modao ?? []),
      "/assets/anime/icons/cultivation/sect-qi.webp",
      "/assets/anime/icons/cultivation/sword-intent.webp",
      "/assets/anime/icons/cultivation/blood-essence.webp",
      "/assets/anime/equipment/ten_thousand_souls_banner.webp",
      SOUL_BANNER_SHADE_CARD_IMAGE,
      "/assets/anime/heroes/jianxu.webp",
      "/assets/anime/heroes/yulian.webp",
      "/assets/anime/heroes/luohun.webp",
      "/assets/anime/heroes/shiyan.webp",
      "/assets/units-commander-sword_saint.webp",
      "/assets/units-commander-demon_ancestor.webp"
    ];
    for (const asset of assets) {
      expect(hasMediaFile(asset), `${asset} is not published (npm run media:publish)`).toBe(true);
      expect(mediaFileInfo(asset)!.bytes, asset).toBeGreaterThan(10_000);
    }
  });
});

describe("Heavenly Demon cultivation combat", () => {
  it("Shiyan generates only one Essence from the first real casualty each round", () => {
    const state = combatState("heavenly_demon", "shiyan");
    const first = state.combat!.units.unit_p1_marksmen;
    const second = state.combat!.units.unit_p1_griffins;
    const third = state.combat!.units.unit_p1_crusaders;
    state.combat!.cultivationFactions!.p1!.bloodEssence = 0;
    for (const casualty of [first, second]) {
      casualty.variant = "pack";
      casualty.damage = casualty.maxHealth;
      markUnitRemovedIfNeeded(state, casualty);
    }
    expect(state.combat!.cultivationFactions?.p1?.bloodEssence).toBe(1);
    expect(state.combat!.cultivationFactions?.p1?.corpseFurnaceSurgeRound).toBe(1);

    state.combat!.round = 2;
    state.combat!.cultivationFactions!.p1!.bloodEssence = 0;
    third.variant = "pack";
    third.damage = third.maxHealth;
    markUnitRemovedIfNeeded(state, third);
    expect(state.combat!.cultivationFactions?.p1?.bloodEssence).toBe(1);
  });

  it("Bai Luohun's Soul Shepherd strengthens the Banner shade and keeps it through round 2", () => {
    const state = combatState("heavenly_demon", "luohun");
    state.heroes.hero_p1.equipment = { accessory: EQUIPMENT_IDS.soulBanner };
    const shade = injectSoulBannerShade(state, "p1", [18, 17]);
    expect(shade).toMatchObject({ attack: 2, defense: 1, maxHealth: 3, initiative: 8, heroGradeExpiresAfterRound: 2 });

    expireHeroGradeFamiliars(state, 1);
    expect(shade?.damage).toBe(0);
    expireHeroGradeFamiliars(state, 2);
    expect(shade?.damage).toBe(shade?.maxHealth);
  });

  it("Blood Frenzy spends one Essence for +1 Attack and cannot spend again in the same round", () => {
    let state = combatState("heavenly_demon", "xuedao");
    const first = configure(state, "unit_p1_marksmen", 9, "p1", 3);
    configure(state, "unit_p2_skeletons", 10, "p2", 0, 1);
    const second = configure(state, "unit_p1_griffins", 5, "p1", 3);
    configure(state, "unit_p2_vampires", 6, "p2", 0, 1);
    configure(state, "unit_p1_crusaders", 0, "p1");
    configure(state, "unit_p2_dread_knights", 19, "p2");
    state.combat!.cultivationFactions!.p1 = { bloodEssence: 1, swordIntent: 0 };

    state = attack(state, first.id, "unit_p2_skeletons");
    expect(latestOwnAttack(state, first.id).attackValue).toBe(4);
    expect(state.combat!.cultivationFactions?.p1).toMatchObject({ bloodEssence: 0, bloodFrenzySpentRound: 1 });

    state.combat!.cultivationFactions!.p1!.bloodEssence = 1;
    state = attack(state, second.id, "unit_p2_vampires");
    expect(latestOwnAttack(state, second.id).attackValue).toBe(3);
    expect(state.combat!.cultivationFactions?.p1?.bloodEssence).toBe(1);
  });

  it("a real Pack→Few casualty feeds one Blood Essence only once", () => {
    const state = combatState("heavenly_demon", "xuedao");
    const casualty = state.combat!.units.unit_p1_marksmen;
    state.combat!.cultivationFactions!.p1!.bloodEssence = 0;
    casualty.variant = "pack";
    casualty.damage = casualty.maxHealth;

    markUnitRemovedIfNeeded(state, casualty);
    expect(casualty.variant).toBe("few");
    expect(state.combat!.cultivationFactions?.p1?.bloodEssence).toBe(1);

    casualty.damage = casualty.maxHealth;
    markUnitRemovedIfNeeded(state, casualty);
    expect(state.combat!.cultivationFactions?.p1?.bloodEssence).toBe(1);
  });

  it("demonic-realm upgrades start Essence, raise its cap to 5, and empower Blood Frenzy to +2", () => {
    let state = combatState("heavenly_demon", "xuedao");
    // Realm 3 (Demon Soul) folds in all three former grade nodes: Blood
    // Refinement (r1), Corpse Furnace (r2) and Forbidden Overreach (r3).
    state.heroes.hero_p1.cultivationRealm = 3;
    initializeCultivationFactionCombat(state, state.combat!);
    expect(state.combat!.cultivationFactions?.p1?.bloodEssence).toBe(1);

    const casualty = state.combat!.units.unit_p1_marksmen;
    state.combat!.cultivationFactions!.p1!.bloodEssence = 4;
    casualty.variant = "pack";
    casualty.damage = casualty.maxHealth;
    markUnitRemovedIfNeeded(state, casualty);
    expect(state.combat!.cultivationFactions?.p1?.bloodEssence).toBe(5);

    const attacker = configure(state, "unit_p1_griffins", 9, "p1", 3);
    configure(state, "unit_p2_skeletons", 10, "p2", 0, 1);
    configure(state, "unit_p1_crusaders", 0, "p1");
    configure(state, "unit_p2_vampires", 16, "p2");
    configure(state, "unit_p2_dread_knights", 19, "p2");
    state.combat!.cultivationFactions!.p1!.bloodEssence = 1;
    state = attack(state, attacker.id, "unit_p2_skeletons");
    expect(latestOwnAttack(state, attacker.id).attackValue).toBe(5);
    expect(state.combat!.cultivationFactions?.p1?.bloodEssence).toBe(0);
  });

  it("the intrinsic Soul Banner summons one 2/0/2/8 flying token and it expires after round 1", () => {
    const state = combatState("heavenly_demon", "xuedao");
    state.anime = { ...state.anime!, enabled: true, equipment: false };
    state.heroes.hero_p1.equipment = { accessory: EQUIPMENT_IDS.soulBanner };

    const shade = injectSoulBannerShade(state, "p1", [18, 17]);
    expect(shade).toMatchObject({
      attack: 2,
      defense: 0,
      maxHealth: 2,
      initiative: 8,
      type: "flying",
      summoned: true,
      temporary: true,
      abilities: ["ignores-retaliation"]
    });
    expect(shade?.assets?.cardImage).toBe(SOUL_BANNER_SHADE_CARD_IMAGE);
    expect(injectSoulBannerShade(state, "p1", [17])?.id).toBe(shade?.id);

    expireHeroGradeFamiliars(state, 1);
    expect(shade?.damage).toBe(shade?.maxHealth);
  });

  it("starts the main hero with the Soul Banner even when the market module is off", () => {
    const state = createAdventureGameState({
      seed: "soul-banner-birthright",
      ruleset: "binh",
      anime: { enabled: true, equipment: false, xianxiaTowns: true },
      rollFirstPlayer: false,
      players: [
        { id: "p1", name: "Demon", factionId: "heavenly_demon", heroDefId: "xuedao" },
        { id: "p2", name: "Control", factionId: "castle", heroDefId: "catherine" }
      ]
    });
    const hero = Object.values(state.heroes).find((candidate) => candidate.controllerId === "p1" && candidate.kind === "main");
    expect(hero?.equipment?.accessory).toBe(EQUIPMENT_IDS.soulBanner);
  });

  it("migrates an old save by equipping the Banner and preserving its former accessory in the bag", () => {
    const state = createAdventureGameState({
      seed: "soul-banner-legacy",
      ruleset: "binh",
      anime: { enabled: true, equipment: false, xianxiaTowns: true },
      rollFirstPlayer: false,
      players: [
        { id: "p1", name: "Demon", factionId: "heavenly_demon", heroDefId: "xuedao" },
        { id: "p2", name: "Control", factionId: "castle", heroDefId: "catherine" }
      ]
    });
    const hero = Object.values(state.heroes).find((candidate) => candidate.controllerId === "p1" && candidate.kind === "main")!;
    hero.equipment = { accessory: EQUIPMENT_IDS.luckyCoin };
    hero.equipmentInventory = [];

    expect(healLegacyPlayerFields(state)).toBe(true);
    expect(hero.equipment.accessory).toBe(EQUIPMENT_IDS.soulBanner);
    expect(hero.equipmentInventory).toContain(EQUIPMENT_IDS.luckyCoin);
    expect(hero.equipmentInventory).not.toContain(EQUIPMENT_IDS.soulBanner);
    expect(healLegacyPlayerFields(state)).toBe(false);
  });
});
