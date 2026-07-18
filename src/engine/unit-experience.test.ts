import { describe, expect, it } from "vitest";

import {
  ELITE_UNIT_RANK_ABILITIES,
  UNIT_RANK_THRESHOLDS,
  UNIT_XP_BANK_MIN,
  UNIT_XP_PVP_WIN
} from "@/data/units/experience";
import { coreUnitDefinitions } from "@/data/factions/units";
import { unitAbilities } from "@/data/units/abilities";
import {
  applyAction,
  createAdventureGameState,
  createInitialGameState,
  getLegalActions,
  getMainHero,
  makeCombatUnitFromArmy,
  markUnitRemovedIfNeeded,
  NEUTRAL_PLAYER_ID
} from "./index";
import { finalizeAdventureCombat } from "./adventure-reducer";
import { ATTACK_DIE_FACES } from "./battlefield";
import type { CombatState, GameAction, GameState } from "./state";
import {
  awardUnitExperienceAfterCombat,
  unitRankForExperience,
  unitRankStatBonuses
} from "./unit-experience";

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function makeAdventure(
  seed: string,
  options: {
    unitExperience?: boolean;
    ruleset?: "legacy" | "binh";
    wog?: { enabled: boolean; unitExperience?: boolean };
    anime?: { enabled: boolean; unitExperience?: boolean };
    houseRules?: Record<string, boolean>;
  } = {}
): GameState {
  let state = createAdventureGameState({
    seed,
    difficulty: "normal",
    rollFirstPlayer: false,
    events: false,
    ruleset: options.ruleset ?? "legacy",
    ...(options.unitExperience !== undefined ? { unitExperience: options.unitExperience } : {}),
    ...(options.wog ? { wog: options.wog } : {}),
    ...(options.anime ? { anime: options.anime } : {}),
    ...(options.houseRules ? { houseRules: options.houseRules } : {})
  } as Parameters<typeof createAdventureGameState>[0]);
  if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
    state = applyOk(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
  }
  return state;
}

/** A finished neutral combat with the given units, ready for finalize. */
function finishNeutralCombat(
  state: GameState,
  units: CombatState["units"],
  outcomeWinner: "p1" | typeof NEUTRAL_PLAYER_ID,
  context?: Partial<Extract<CombatState["context"], { kind: "neutral" }>>
): void {
  const hero = getMainHero(state, "p1")!;
  state.phase = "combat";
  state.combat = {
    attackerPlayerId: "p1",
    defenderPlayerId: NEUTRAL_PLAYER_ID,
    units,
    setup: null,
    awaitingContinue: false,
    context: {
      kind: "neutral",
      heroId: hero.id,
      fieldId: hero.spaceId!,
      difficulty: 3,
      hasAzure: false,
      ...context
    },
    outcome:
      outcomeWinner === "p1"
        ? { winnerPlayerId: "p1", defeatedPlayerId: NEUTRAL_PLAYER_ID, reason: "all-enemy-units-defeated" }
        : { winnerPlayerId: NEUTRAL_PLAYER_ID, defeatedPlayerId: "p1", reason: "all-enemy-units-defeated" },
    dice: { faces: [...ATTACK_DIE_FACES], seed: "s", rollCount: 0 }
  } as CombatState;
  finalizeAdventureCombat(state);
}

const MARKSMEN = { id: "xp_marksmen", unitDefId: "castle.marksmen", side: "few" as const };
const GRIFFINS = { id: "xp_griffins", unitDefId: "castle.griffins", side: "pack" as const };
const ZEALOTS = { id: "xp_zealots", unitDefId: "castle.zealots", side: "few" as const };

// ---------------------------------------------------------------------------
// Rank math (thresholds + per-tier packages)
// ---------------------------------------------------------------------------

describe("Unit Experience — rank math", () => {
  it("tier-scaled thresholds: bronze 2/5/9, silver 3/7/12, gold & azure 4/9/15", () => {
    expect(UNIT_RANK_THRESHOLDS.bronze).toEqual([2, 5, 9]);
    expect(unitRankForExperience("bronze", 0)).toBe(0);
    expect(unitRankForExperience("bronze", 2)).toBe(1);
    expect(unitRankForExperience("bronze", 5)).toBe(2);
    expect(unitRankForExperience("bronze", 9)).toBe(3);
    expect(unitRankForExperience("bronze", 99), "rank caps at 3").toBe(3);
    expect(unitRankForExperience("silver", 3)).toBe(1);
    expect(unitRankForExperience("silver", 6)).toBe(1);
    expect(unitRankForExperience("silver", 12)).toBe(3);
    expect(unitRankForExperience("gold", 3), "gold ranks slower than bronze").toBe(0);
    expect(unitRankForExperience("gold", 4)).toBe(1);
    expect(unitRankForExperience("azure", 15)).toBe(3);
  });

  it("per-tier packages: low tiers earn Defense first, gold earns Attack first; bronze Elites gain Initiative", () => {
    expect(unitRankStatBonuses("bronze", 1)).toEqual({ attack: 0, defense: 1, health: 0, initiative: 0 });
    expect(unitRankStatBonuses("bronze", 2)).toEqual({ attack: 1, defense: 1, health: 0, initiative: 0 });
    expect(unitRankStatBonuses("bronze", 3)).toEqual({ attack: 1, defense: 1, health: 1, initiative: 1 });
    expect(unitRankStatBonuses("silver", 3)).toEqual({ attack: 1, defense: 1, health: 1, initiative: 0 });
    expect(unitRankStatBonuses("gold", 1)).toEqual({ attack: 1, defense: 0, health: 0, initiative: 0 });
    expect(unitRankStatBonuses("gold", 2)).toEqual({ attack: 1, defense: 1, health: 0, initiative: 0 });
    expect(unitRankStatBonuses("gold", 0)).toEqual({ attack: 0, defense: 0, health: 0, initiative: 0 });
  });

  it("REGISTRY HYGIENE: every elite entry names a real unit and an implemented ability the unit does not already print", () => {
    const entries = Object.entries(ELITE_UNIT_RANK_ABILITIES);
    expect(entries.length).toBeGreaterThanOrEqual(12);
    for (const [unitDefId, abilityId] of entries) {
      const def = coreUnitDefinitions[unitDefId];
      expect(def, `${unitDefId} must be a real unit`).toBeTruthy();
      const ability = unitAbilities[abilityId];
      expect(ability, `${abilityId} must exist`).toBeTruthy();
      expect(ability?.implementationStatus, `${abilityId} must be implemented`).toBe("implemented");
      expect(ability?.requiresStacked, `${abilityId} must not be bank-Stacked-gated`).not.toBe(true);
      for (const side of [def?.few, def?.pack, def?.neutral]) {
        expect(side?.abilities ?? [], `${unitDefId} must not already print ${abilityId}`).not.toContain(abilityId);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Toggle surfaces → the frozen adventure flag
// ---------------------------------------------------------------------------

describe("Unit Experience — toggle surfaces", () => {
  it("is OFF by default; the lobby option, the WOG module and the anime module each freeze it ON", () => {
    expect(makeAdventure("uxp-default").adventure?.unitExperience).toBeUndefined();
    expect(makeAdventure("uxp-lobby", { unitExperience: true }).adventure?.unitExperience).toBe(true);
    expect(
      makeAdventure("uxp-wog", { ruleset: "binh", wog: { enabled: true, unitExperience: true } }).adventure
        ?.unitExperience
    ).toBe(true);
    expect(
      makeAdventure("uxp-anime", { ruleset: "binh", anime: { enabled: true, unitExperience: true } }).adventure
        ?.unitExperience
    ).toBe(true);
    // CONTROLs: the module flag without the module enabled does nothing.
    expect(
      makeAdventure("uxp-wog-off", { ruleset: "binh", wog: { enabled: false, unitExperience: true } }).adventure
        ?.unitExperience
    ).toBeUndefined();
    expect(
      makeAdventure("uxp-anime-off", { ruleset: "binh", anime: { enabled: false, unitExperience: true } })
        .adventure?.unitExperience
    ).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// XP awards after combat
// ---------------------------------------------------------------------------

describe("Unit Experience — XP awards after combat", () => {
  it("a won neutral fight grants the difficulty in XP to SURVIVING deployed units only (dead / undeployed gain none)", () => {
    const state = makeAdventure("uxp-award", { unitExperience: true });
    state.players.p1.army = [{ ...MARKSMEN }, { ...GRIFFINS }, { ...ZEALOTS }];
    const survivor = makeCombatUnitFromArmy(state.players.p1.army[0], "p1", "u_survivor", 0, "legacy")!;
    const casualty = makeCombatUnitFromArmy(
      { ...state.players.p1.army[1], side: "few" },
      "p1",
      "u_casualty",
      1,
      "legacy"
    )!;
    casualty.damage = casualty.maxHealth; // fell in the fight
    finishNeutralCombat(state, { [survivor.id]: survivor, [casualty.id]: casualty }, "p1", { difficulty: 3 });

    expect(state.players.p1.army.find((unit) => unit.id === MARKSMEN.id)?.experience).toBe(3);
    expect(state.players.p1.army.find((unit) => unit.id === GRIFFINS.id), "casualty left the army").toBeUndefined();
    expect(
      state.players.p1.army.find((unit) => unit.id === ZEALOTS.id)?.experience,
      "a unit left at home trains nothing"
    ).toBeUndefined();
    // Bronze marksmen with 3 XP crossed the rank-1 threshold (2) → feed event.
    const rankUp = state.eventLog.find((event) => event.type === "UNIT_RANK_UP");
    expect(rankUp && "rank" in rankUp ? rankUp.rank : null).toBe(1);
  });

  it("CONTROL — with the rule OFF the identical won fight awards nothing and emits no event", () => {
    const state = makeAdventure("uxp-award-off");
    state.players.p1.army = [{ ...MARKSMEN }];
    const survivor = makeCombatUnitFromArmy(state.players.p1.army[0], "p1", "u_ctl", 0, "legacy")!;
    finishNeutralCombat(state, { [survivor.id]: survivor }, "p1", { difficulty: 3 });
    expect(state.players.p1.army[0].experience).toBeUndefined();
    expect(state.eventLog.some((event) => event.type === "UNIT_RANK_UP")).toBe(false);
  });

  it("CONTROL — a LOST fight trains nobody", () => {
    const state = makeAdventure("uxp-award-loss", { unitExperience: true });
    state.players.p1.army = [{ ...MARKSMEN }];
    const survivor = makeCombatUnitFromArmy(state.players.p1.army[0], "p1", "u_loss", 0, "legacy")!;
    finishNeutralCombat(state, { [survivor.id]: survivor }, NEUTRAL_PLAYER_ID, { difficulty: 3 });
    expect(state.players.p1.army[0].experience).toBeUndefined();
  });

  it("a Pack that flipped to Few in the fight still survived — it keeps earning (XP rides the CARD)", () => {
    const state = makeAdventure("uxp-flip", { unitExperience: true });
    state.players.p1.army = [{ ...GRIFFINS, experience: 1 }];
    const unit = makeCombatUnitFromArmy(state.players.p1.army[0], "p1", "u_flip", 0, "legacy")!;
    unit.variant = "few"; // flipped down mid-fight
    unit.damage = 0;
    finishNeutralCombat(state, { [unit.id]: unit }, "p1", { difficulty: 2 });
    const card = state.players.p1.army.find((entry) => entry.id === GRIFFINS.id)!;
    expect(card.side, "the casualty flip synced").toBe("few");
    expect(card.experience, "1 + 2 = 3 — the flip never dropped the XP").toBe(3);
  });

  it("a Creature Bank win pays max(2, Stacked count); PvP pays the flat 2 to the WINNER only", () => {
    const bank = makeAdventure("uxp-bank", { unitExperience: true });
    bank.players.p1.army = [{ ...MARKSMEN }];
    const bankUnit = makeCombatUnitFromArmy(bank.players.p1.army[0], "p1", "u_bank", 0, "legacy")!;
    finishNeutralCombat(bank, { [bankUnit.id]: bankUnit }, "p1", {
      difficulty: 0,
      bankId: "crypt",
      bankStackCount: 4
    });
    expect(bank.players.p1.army[0].experience, "Stacked count 4 > the min 2").toBe(4);
    expect(UNIT_XP_BANK_MIN).toBe(2);

    // PvP: exercise the shared award arm directly (the finalize call site is
    // the same one the neutral cases above prove).
    const pvp = makeAdventure("uxp-pvp", { unitExperience: true });
    pvp.players.p1.army = [{ ...MARKSMEN }];
    pvp.players.p2.army = [{ id: "p2_zealots", unitDefId: "castle.zealots", side: "few" }];
    const winnerUnit = makeCombatUnitFromArmy(pvp.players.p1.army[0], "p1", "u_pvp_w", 0, "legacy")!;
    const loserUnit = makeCombatUnitFromArmy(pvp.players.p2.army[0], "p2", "u_pvp_l", 1, "legacy")!;
    pvp.combat = {
      attackerPlayerId: "p1",
      defenderPlayerId: "p2",
      units: { [winnerUnit.id]: winnerUnit, [loserUnit.id]: loserUnit },
      setup: null,
      awaitingContinue: false,
      context: { kind: "player", attackerHeroId: "hero_p1", defenderHeroId: "hero_p2", fieldId: "f" },
      outcome: { winnerPlayerId: "p1", defeatedPlayerId: "p2", reason: "all-enemy-units-defeated" },
      dice: { faces: [...ATTACK_DIE_FACES], seed: "s", rollCount: 0 }
    } as CombatState;
    awardUnitExperienceAfterCombat(pvp);
    expect(pvp.players.p1.army[0].experience).toBe(UNIT_XP_PVP_WIN);
    expect(pvp.players.p2.army[0].experience, "the loser's survivors train nothing").toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Observable rank effects in combat (rule #1a: outcomes, not data)
// ---------------------------------------------------------------------------

/** p1 attacks p2's template skeleton with an army-built unit; scripted 0 dice. */
function resolveArmyAttack(
  seed: string,
  attackerArmy: { unitDefId: string; side: "few" | "pack" | "neutral"; experience?: number },
  defenderArmy?: { unitDefId: string; side: "few" | "pack" | "neutral"; experience?: number },
  defenderAttack = 0
): GameState {
  let state = createInitialGameState(seed);
  const attacker = makeCombatUnitFromArmy(
    { id: "xp_att", ...attackerArmy },
    "p1",
    "unit_p1_griffins",
    9,
    "legacy"
  )!;
  attacker.type = "ground";
  attacker.position = 9;
  state.combat!.units.unit_p1_griffins = attacker;
  if (defenderArmy) {
    const defender = makeCombatUnitFromArmy(
      { id: "xp_def", ...defenderArmy },
      "p2",
      "unit_p2_skeletons",
      13,
      "legacy"
    )!;
    defender.position = 13;
    defender.maxHealth = 40; // survive the hit so `damage` stays readable
    defender.attack = defenderAttack;
    state.combat!.units.unit_p2_skeletons = defender;
  } else {
    const defender = state.combat!.units.unit_p2_skeletons;
    defender.position = 13;
    defender.defense = 1;
    defender.maxHealth = 40;
    defender.damage = 0;
    defender.abilities = [];
    defender.attack = defenderAttack;
  }
  state.combat!.dice.scriptedRolls = Array(8).fill(0);
  state.combat!.dice.rollCount = 0;
  state.activePlayerId = "p1";
  state.combat!.activeUnitId = "unit_p1_griffins";
  state = applyOk(state, {
    type: "ATTACK_UNIT",
    playerId: "p1",
    attackerId: "unit_p1_griffins",
    defenderId: "unit_p2_skeletons"
  });
  // Settle reaction windows / reroll choices until the attack fully resolves.
  let safety = 40;
  while (safety-- > 0 && (state.reactionWindow || state.pendingChoice?.type === "ATTACK_DIE_REROLL")) {
    if (state.reactionWindow) {
      state = applyOk(state, { type: "PASS_REACTION", playerId: state.reactionWindow.priorityPlayerId });
      continue;
    }
    const choice = state.pendingChoice;
    if (choice?.type === "ATTACK_DIE_REROLL") {
      state = applyOk(state, {
        type: "CHOOSE_PENDING_ROLL",
        playerId: choice.playerId,
        choiceId: choice.id,
        candidateIndex: choice.candidates.length - 1
      });
    }
  }
  return state;
}

describe("Unit Experience — observable rank effects in combat", () => {
  it("gold rank 1 (+1 Attack) raises the resolved hit by exactly 1 over the XP-0 CONTROL", () => {
    // Champions few: printed attack 5 vs the template skeleton's defense 1.
    const control = resolveArmyAttack("uxp-atk-ctl", { unitDefId: "castle.champions", side: "few" });
    const veteran = resolveArmyAttack("uxp-atk-vet", {
      unitDefId: "castle.champions",
      side: "few",
      experience: 4
    });
    const controlDamage = control.combat!.units.unit_p2_skeletons.damage;
    expect(controlDamage, "5 attack + 0 die − 1 defense").toBe(4);
    expect(veteran.combat!.units.unit_p2_skeletons.damage).toBe(controlDamage + 1);
  });

  it("bronze rank 1 (+1 Defense) lowers the incoming hit by exactly 1 over the XP-0 CONTROL", () => {
    const control = resolveArmyAttack(
      "uxp-def-ctl",
      { unitDefId: "castle.champions", side: "few" },
      { unitDefId: "necropolis.skeletons", side: "few" }
    );
    const veteran = resolveArmyAttack(
      "uxp-def-vet",
      { unitDefId: "castle.champions", side: "few" },
      { unitDefId: "necropolis.skeletons", side: "few", experience: 2 }
    );
    const controlDamage = control.combat!.units.unit_p2_skeletons.damage;
    expect(controlDamage).toBeGreaterThan(0);
    expect(veteran.combat!.units.unit_p2_skeletons.damage).toBe(controlDamage - 1);
  });

  it("ELITE grant: rank-3 Champions ignore the Retaliation Attack (rank-2 CONTROL takes it)", () => {
    // Both arms: the defender retaliates at attack 6. Rank 2 and rank 3 gold
    // share Defense +1 (= 3), so the ONLY difference is the granted ability.
    const control = resolveArmyAttack(
      "uxp-elite-ctl",
      { unitDefId: "castle.champions", side: "few", experience: 9 },
      undefined,
      6
    );
    const elite = resolveArmyAttack(
      "uxp-elite",
      { unitDefId: "castle.champions", side: "few", experience: 15 },
      undefined,
      6
    );
    expect(
      control.combat!.units.unit_p1_griffins.damage,
      "rank 2: retaliation lands 6 + 0 die − 3 defense"
    ).toBe(3);
    expect(elite.combat!.units.unit_p1_griffins.damage, "rank 3: no retaliation").toBe(0);
  });

  it("bronze rank 3 folds +1 Health and +1 Initiative into the built unit", () => {
    const plain = makeCombatUnitFromArmy({ ...MARKSMEN }, "p1", "u_plain", 0, "legacy")!;
    const elite = makeCombatUnitFromArmy({ ...MARKSMEN, experience: 9 }, "p1", "u_elite", 0, "legacy")!;
    expect(elite.maxHealth).toBe(plain.maxHealth + 1);
    expect(elite.initiative).toBe(plain.initiative + 1);
    expect(elite.attack).toBe(plain.attack + 1);
    expect(elite.defense).toBe(plain.defense + 1);
    expect(elite.unitRank).toBe(3);
  });

  it("a mid-combat Pack→Few casualty flip KEEPS the rank folds (applyUnitCurrentSide re-fold)", () => {
    const state = makeAdventure("uxp-midflip", { unitExperience: true });
    const packDef = coreUnitDefinitions[GRIFFINS.unitDefId]!.pack!;
    const fewDef = coreUnitDefinitions[GRIFFINS.unitDefId]!.few!;
    const unit = makeCombatUnitFromArmy({ ...GRIFFINS, experience: 2 }, "p1", "u_mid", 0, "legacy")!;
    expect(unit.defense, "bronze rank 1 on the Pack side").toBe(packDef.defense + 1);
    unit.damage = unit.maxHealth;
    markUnitRemovedIfNeeded(state, unit);
    expect(unit.variant, "the Pack flipped to its Few side").toBe("few");
    expect(unit.defense, "the Few side keeps the rank-1 Defense fold").toBe(fewDef.defense + 1);
    expect(unit.unitRank).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Dilution (WoG Crexpmod read): upgrades cost experience
// ---------------------------------------------------------------------------

describe("Unit Experience — upgrade dilution", () => {
  it("reinforcing Few→Pack halves the card's XP (and announces it); CONTROL: an XP-less card is silent", () => {
    const state = makeAdventure("uxp-dilute", { unitExperience: true });
    state.players.p1.townTokens.population = true;
    state.players.p1.resources = { gold: 100, buildingMaterials: 10, valuables: 10 };
    const reinforceTown = Object.values(state.towns).find((candidate) => candidate.controllerId === "p1")!;
    for (const building of ["castle.citadel", "castle.dwelling_bronze"]) {
      if (!reinforceTown.buildings.includes(building)) {
        reinforceTown.buildings.push(building);
      }
    }
    state.players.p1.army = [
      { id: "vet_griffins", unitDefId: "castle.griffins", side: "few", experience: 7 },
      { id: "fresh_marksmen", unitDefId: "castle.marksmen", side: "few" }
    ];
    const next = applyOk(state, {
      type: "POPULATION_ACTION",
      playerId: "p1",
      purchases: [{ kind: "reinforce", unitDefId: "castle.griffins", armyUnitId: "vet_griffins" }]
    });
    const card = next.players.p1.army.find((unit) => unit.id === "vet_griffins")!;
    expect(card.side).toBe("pack");
    expect(card.experience, "7 → floor(7/2)").toBe(3);
    expect(next.eventLog.some((event) => event.type === "UNIT_XP_DILUTED")).toBe(true);

    const control = applyOk(next, {
      type: "POPULATION_ACTION",
      playerId: "p1",
      purchases: [{ kind: "reinforce", unitDefId: "castle.marksmen", armyUnitId: "fresh_marksmen" }]
    });
    expect(
      control.eventLog.filter((event) => event.type === "UNIT_XP_DILUTED"),
      "no XP — nothing to dilute, no second event"
    ).toHaveLength(1);
  });

  it("each purchased Polish Stack layer costs 1 XP", () => {
    const state = makeAdventure("uxp-stack-dilute", {
      unitExperience: true,
      houseRules: { "polish-unit-stacks": true }
    });
    state.players.p1.townTokens.population = true;
    state.players.p1.resources = { gold: 500, buildingMaterials: 10, valuables: 10 };
    const town = Object.values(state.towns).find((candidate) => candidate.controllerId === "p1")!;
    if (!town.buildings.includes("castle.citadel")) {
      town.buildings.push("castle.citadel");
    }
    state.players.p1.army = [{ id: "vet_pack", unitDefId: "castle.griffins", side: "pack", experience: 5 }];
    const next = applyOk(state, {
      type: "POPULATION_ACTION",
      playerId: "p1",
      purchases: [
        { kind: "stack", unitDefId: "castle.griffins", armyUnitId: "vet_pack" },
        { kind: "stack", unitDefId: "castle.griffins", armyUnitId: "vet_pack" }
      ]
    });
    const card = next.players.p1.army[0];
    expect(card.stacks).toBe(2);
    expect(card.experience, "5 − 1 − 1").toBe(3);
    expect(next.eventLog.filter((event) => event.type === "UNIT_XP_DILUTED")).toHaveLength(2);
  });

  it("EXCEPTION — the Hierophant First Aid flip-up restores this battle's casualties WITHOUT dilution", () => {
    const state = makeAdventure("uxp-firstaid", { unitExperience: true });
    state.players.p1.army = [{ id: "aid_griffins", unitDefId: "castle.griffins", side: "few", experience: 6 }];
    state.adventure!.pendingCommanderFirstAid = {
      playerId: "p1",
      options: [
        {
          label: "Restore Griffins to a Pack",
          kind: "flip-up",
          unitDefId: "castle.griffins",
          side: "pack",
          armyUnitId: "aid_griffins"
        }
      ]
    };
    const next = applyOk(state, { type: "COMMANDER_FIRST_AID", playerId: "p1", optionIndex: 0 });
    const card = next.players.p1.army[0];
    expect(card.side).toBe("pack");
    expect(card.experience, "the same veterans return — no dilution").toBe(6);
    expect(next.eventLog.some((event) => event.type === "UNIT_XP_DILUTED")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Drill (map action)
// ---------------------------------------------------------------------------

describe("Unit Experience — Drill", () => {
  function drillState(seed: string, on = true): GameState {
    const state = makeAdventure(seed, on ? { unitExperience: true } : {});
    const town = Object.values(state.towns).find((candidate) => candidate.controllerId === "p1")!;
    getMainHero(state, "p1")!.spaceId = town.fieldId ?? null;
    state.players.p1.resources = { gold: 10, buildingMaterials: 0, valuables: 0 };
    state.players.p1.army = [
      { ...MARKSMEN },
      // A maxed-out card (bronze rank 3 at 9 XP) must not be offered.
      { id: "maxed", unitDefId: "castle.halberdiers", side: "few", experience: 9 }
    ];
    return state;
  }

  it("pays 2 gold for +1 XP at the own Town, once per turn; maxed cards are not offered", () => {
    const state = drillState("uxp-drill");
    const offers = getLegalActions(state, "p1").filter((legal) => legal.action.type === "DRILL_UNIT");
    expect(offers.map((legal) => (legal.action.type === "DRILL_UNIT" ? legal.action.armyUnitId : ""))).toEqual([
      MARKSMEN.id
    ]);

    const next = applyOk(state, { type: "DRILL_UNIT", playerId: "p1", armyUnitId: MARKSMEN.id });
    expect(next.players.p1.resources.gold).toBe(8);
    expect(next.players.p1.army[0].experience).toBe(1);
    expect(next.eventLog.some((event) => event.type === "UNIT_DRILLED")).toBe(true);

    const again = applyAction(next, { type: "DRILL_UNIT", playerId: "p1", armyUnitId: MARKSMEN.id });
    expect(again.errors[0]?.message, "once per turn").toContain("once per turn");
  });

  it("CONTROLs: rejected with the rule off, and not offered away from an own Town", () => {
    const off = drillState("uxp-drill-off", false);
    expect(
      applyAction(off, { type: "DRILL_UNIT", playerId: "p1", armyUnitId: MARKSMEN.id }).errors[0]?.message
    ).toContain("off for this game");

    const away = drillState("uxp-drill-away");
    const heroAway = getMainHero(away, "p1")!;
    heroAway.spaceId =
      Object.keys(away.adventure!.fields).find((fieldId) => fieldId !== heroAway.spaceId) ?? null;
    expect(getLegalActions(away, "p1").some((legal) => legal.action.type === "DRILL_UNIT")).toBe(false);
    expect(
      applyAction(away, { type: "DRILL_UNIT", playerId: "p1", armyUnitId: MARKSMEN.id }).errors[0]?.message
    ).toContain("Town");
  });
});
