import { describe, expect, it } from "vitest";

import { hasMediaFile } from "@/lib/media-manifest";

import { ANIME_EQUIPMENT_DEFINITIONS, EQUIPMENT_IDS, equipmentImage, equipmentPackagesForFaction } from "@/data/anime/equipment";
import { coreFactionDefinitions, coreHeroDefinitions, coreBuildingDefinitions } from "@/data/factions/core";
import { coreUnitDefinitions } from "@/data/factions/units";
import { unitAbilities } from "@/data/units/abilities";
import cardContract from "../../scripts/anime-art/little-busters-unit-card-contract.json";
import { rankScheduleFor } from "@/data/units/experience-rank-abilities";
import { commanderDefinitions, COMMANDER_SLUG_BY_FACTION } from "@/data/commanders";
import { cardLibrary } from "@/data/cards/library";
import { heroUnitId, makeHeroCombatUnit } from "./heroes";
import {
  applyAction,
  createAdventureGameState,
  createInitialGameState,
  getDisplayAttackBonus,
  getLegalActions,
  getMainHero,
  isAdjacent,
  pickNeutralTarget
} from "./index";
import { expireEffectsForCombatRoundEnd } from "./active-effects";
import { maybeOpenDisciplinaryCommitteeStartChoice, startNeutralEncounter } from "./adventure-reducer";
import { startAdventureRound } from "./adventure";
import { deathStareFollowUpAppliesTo, type DeathStareFollowUp } from "./unit-abilities";
import { NEUTRAL_PLAYER_ID, type GameAction, type GameState, type HeroState } from "./state";

const FACTION = "little_busters";

function heroState(heroDefId: string, level = 1, grade = 0): HeroState {
  return {
    id: `hero_${heroDefId}`,
    controllerId: "p1",
    kind: "main",
    heroDefId,
    level,
    grade,
    experience: 0,
    movementPoints: 3,
    movementPointsMax: 3,
    spaceId: "0:0"
  };
}

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function settleAttack(state: GameState): GameState {
  let current = state;
  for (let safety = 40; safety > 0 && (current.reactionWindow || current.pendingChoice?.type === "ATTACK_DIE_REROLL"); safety -= 1) {
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

function enterNeutralFight(factionId: "little_busters" | "fuyuki", heroDefId: string): GameState {
  let state = createAdventureGameState({
    seed: `hero-body-${factionId}`,
    ruleset: "binh",
    anime: { enabled: true, isekaiTowns: true, heroGrades: true },
    rollFirstPlayer: false,
    players: [
      { id: "p1", name: "One", factionId, heroDefId },
      { id: "p2", name: "Two", factionId: "necropolis" }
    ]
  });
  if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
    state = apply(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
  }
  const hero = getMainHero(state, "p1")!;
  const field = state.adventure!.fields[hero.spaceId!];
  field.difficulty = 1;
  startNeutralEncounter(state, hero, field);
  const place = getLegalActions(state, "p1").find((legal) => legal.action.type === "PLACE_COMBAT_UNIT");
  state = apply(state, place!.action);
  return apply(state, { type: "FINISH_COMBAT_PLACEMENT", playerId: "p1" });
}

describe("Little Busters complete playable content", () => {
  it("pays the 6-gold and 1-material school contribution every Resource round without creating debt", () => {
    const state = createAdventureGameState({
      seed: "little-busters-school-fund",
      difficulty: "normal",
      rollFirstPlayer: false,
      events: false,
      players: [
        { id: "p1", name: "Riki", factionId: "little_busters", heroDefId: "riki_naoe" },
        { id: "p2", name: "Catherine", factionId: "castle", heroDefId: "catherine" }
      ]
    });
    state.pendingChoice = null;
    state.players.p1.resources.gold = 1;
    state.players.p1.resources.buildingMaterials = 2;
    state.players.p1.production.gold = 6;
    state.players.p1.production.buildingMaterials = 0;
    state.players.p2.resources.gold = 1;
    state.players.p2.production.gold = 6;
    state.round = 3;

    startAdventureRound(state);

    expect(state.players.p1.resources.gold).toBe(1); // 1 + 6 income - 6 fund
    expect(state.players.p1.resources.buildingMaterials).toBe(1);
    expect(state.players.p2.resources.gold).toBe(7); // control: no faction cost
    expect(state.eventLog.some((event) => event.type === "EVENT_NOTE" && event.message.includes("School Contribution Fund — 6 gold and 1 building material"))).toBe(true);

    state.players.p1.resources.gold = 0;
    state.players.p1.production.gold = 2;
    state.round = 5;
    startAdventureRound(state);
    expect(state.players.p1.resources.gold).toBe(0);
  });

  it("registers seven real units, eight buildings, six heroes and Kyousuke", () => {
    const faction = coreFactionDefinitions[FACTION];
    expect(faction.units).toHaveLength(7);
    expect(faction.buildings).toHaveLength(8);
    expect(faction.heroes).toHaveLength(6);
    for (const id of faction.units) {
      const unit = coreUnitDefinitions[id];
      expect(unit.faction).toBe(FACTION);
      // Veterancy: every unit resolves a four-rank schedule (the redesign's
      // explicit-override-or-generator resolver; there is no per-unit table).
      const schedule = rankScheduleFor(id);
      for (const rank of [1, 2, 3, 4] as const) {
        const step = schedule[rank];
        if (step.kind !== "stats") expect(step.choices.length, `${id} R${rank}`).toBeGreaterThan(0);
      }
      for (const side of [unit.few, unit.pack]) {
        expect(side).toBeDefined();
        expect(hasMediaFile(side!.cardImage!), `${id} card face is not published (npm run media:publish)`).toBe(true);
        for (const ability of side!.abilities) expect(unitAbilities[ability]?.implementationStatus, ability).toBe("implemented");
      }
    }
    for (const id of faction.buildings) expect(coreBuildingDefinitions[id]?.implementationStatus).toBe("implemented");
    const slug = COMMANDER_SLUG_BY_FACTION[FACTION];
    expect(slug).toBe("kyousuke_natsume");
    expect(commanderDefinitions[slug].cardImage).toContain("kyousuke_natsume");
  });

  it("keeps the established printed stats while applying only the requested type and cost corrections", () => {
    expect(coreUnitDefinitions["little_busters.disciplinary_committee"]).toMatchObject({
      type: "ranged",
      few: { attack: 2, defense: 1, health: 3, initiative: 6, cost: { gold: 4 } },
      pack: { attack: 3, defense: 1, health: 3, initiative: 7, cost: { gold: 6 } }
    });
    expect(coreUnitDefinitions["little_busters.masato"]).toMatchObject({
      few: { attack: 3, defense: 2, health: 5, initiative: 4 },
      pack: { attack: 4, defense: 2, health: 5, initiative: 5 }
    });
    expect(coreUnitDefinitions["little_busters.saya"]).toMatchObject({
      few: { attack: 6, defense: 2, health: 5, initiative: 8, cost: { gold: 14, valuables: 1 } },
      pack: { attack: 6, defense: 2, health: 7, initiative: 12, cost: { gold: 21, valuables: 2 } }
    });
    expect(coreUnitDefinitions["little_busters.mio"]).toMatchObject({
      type: "ranged",
      few: { attack: 5, defense: 2, health: 6, initiative: 4 },
      pack: { attack: 6, defense: 2, health: 8, initiative: 5, cost: { gold: 28, valuables: 2 } }
    });
  });

  it("uses one shared contract for all 14 printed faces and runtime definitions", () => {
    for (const entry of cardContract) {
      const runtime = coreUnitDefinitions[entry.id];
      expect(runtime.type, `${entry.id} type`).toBe(entry.type.toLowerCase());
      for (const sideName of ["few", "pack"] as const) {
        const side = runtime[sideName]!;
        const expected = entry[sideName];
        expect(
          {
            stats: {
              attack: side.attack,
              defense: side.defense,
              health: side.health,
              initiative: side.initiative
            },
            cost: side.cost,
            abilities: side.abilities,
            text: side.abilityText
          },
          `${entry.id} ${sideName}`
        ).toEqual(expected);
      }
    }
  });

  it("ships all six wired, illustrated seishun equipment items", () => {
    expect(equipmentPackagesForFaction(FACTION)).toEqual(["seishun"]);
    const ids = [
      EQUIPMENT_IDS.littleBustersGlassMarbles,
      EQUIPMENT_IDS.littleBustersMissionLetter,
      EQUIPMENT_IDS.littleBustersMiosParasol,
      EQUIPMENT_IDS.littleBustersFlightGoggles,
      EQUIPMENT_IDS.littleBustersPracticeBat,
      EQUIPMENT_IDS.littleBustersRevolutionWatch
    ];
    expect(new Set(ids.map((id) => ANIME_EQUIPMENT_DEFINITIONS[id].grade))).toEqual(new Set(["I", "II", "III"]));
    for (const id of ids) {
      expect(ANIME_EQUIPMENT_DEFINITIONS[id].package).toBe("seishun");
      expect(hasMediaFile(equipmentImage(id)!), `${id} equipment icon is not published (npm run media:publish)`).toBe(true);
    }
  });

  it("fields only Little Busters heroes and scales level plus Seishun grade", () => {
    const sasami1 = makeHeroCombatUnit(heroState("sasami_sasasegawa", 1, 0), 16)!;
    const sasami7 = makeHeroCombatUnit(heroState("sasami_sasasegawa", 7, 0), 16)!;
    const strongest = makeHeroCombatUnit(heroState("sasami_sasasegawa", 7, 3), 16)!;
    expect(sasami1.heroUnit).toBe(true);
    expect(sasami7.attack).toBeGreaterThan(sasami1.attack);
    expect(sasami7.maxHealth).toBeGreaterThan(sasami1.maxHealth);
    expect(strongest.attack).toBe(sasami7.attack + 1);
    expect(strongest.defense).toBe(sasami7.defense);
    expect(strongest.maxHealth).toBe(sasami7.maxHealth + 2);
    expect(strongest.initiative).toBe(sasami7.initiative + 1);

    // Defeat never writes into HeroState: rebuilding the next combat is full HP.
    sasami7.damage = sasami7.maxHealth;
    expect(makeHeroCombatUnit(heroState("sasami_sasasegawa", 7, 0), 16)?.damage).toBe(0);
    expect(makeHeroCombatUnit(heroState("bin", 7, 3), 16)).toBeNull();
    expect(coreHeroDefinitions.bin.faction).not.toBe(FACTION);
  });

  it("uses the requested explicit level tables and cumulative Seishun bonuses", () => {
    const might = [
      [2, 1, 4, 5], [3, 1, 4, 6], [3, 1, 5, 7], [3, 2, 5, 7],
      [4, 2, 6, 8], [4, 2, 7, 8], [4, 2, 9, 9]
    ];
    const magic = [
      [2, 0, 3, 6], [2, 1, 3, 7], [3, 1, 3, 7], [3, 1, 4, 8],
      [4, 1, 5, 9], [4, 1, 6, 10], [4, 1, 7, 12]
    ];
    for (const heroId of ["sasami_sasasegawa", "riki_naoe", "rin_natsume", "yuiko_kurugaya"]) {
      expect(might.map((_, index) => {
        const unit = makeHeroCombatUnit(heroState(heroId, index + 1, 0), 16)!;
        return [unit.attack, unit.defense, unit.maxHealth, unit.initiative];
      })).toEqual(might);
    }
    for (const heroId of ["kudryavka_noumi", "komari_kamikita"]) {
      expect(magic.map((_, index) => {
        const unit = makeHeroCombatUnit(heroState(heroId, index + 1, 0), 16)!;
        return [unit.attack, unit.defense, unit.maxHealth, unit.initiative];
      })).toEqual(magic);
    }
    const base = makeHeroCombatUnit(heroState("sasami_sasasegawa", 1, 0), 16)!;
    expect([0, 1, 2, 3].map((grade) => {
      const unit = makeHeroCombatUnit(heroState("sasami_sasasegawa", 1, grade), 16)!;
      return [unit.attack - base.attack, unit.defense - base.defense, unit.maxHealth - base.maxHealth, unit.initiative - base.initiative];
    })).toEqual([[0, 0, 0, 0], [0, 0, 1, 0], [0, 0, 1, 1], [1, 0, 2, 1]]);
  });

  it("assigns the new passives and specialty identities", () => {
    expect(makeHeroCombatUnit(heroState("rin_natsume"), 16)?.abilities).toEqual(["little-busters-rin-second-attack"]);
    expect(makeHeroCombatUnit(heroState("kudryavka_noumi"), 16)?.abilities).toEqual(["little-busters-kud-random-follow-up"]);
    expect(makeHeroCombatUnit(heroState("komari_kamikita"), 16)?.abilities).toEqual(["little-busters-komari-smile-ward"]);
    expect([1, 4, 6].map((level) => cardLibrary[`specialty.riki_naoe.${level}`]?.name)).toEqual([
      "Forgetfulness I", "Forgetfulness IV", "Forgetfulness VI"
    ]);
    expect([1, 4, 6].map((level) => cardLibrary[`specialty.yuiko_kurugaya.${level}`]?.name)).toEqual([
      "Fortune I", "Fortune IV", "Fortune VI"
    ]);
    expect([1, 4, 6].map((level) => cardLibrary[`specialty.kudryavka_noumi.${level}`]?.name)).toEqual([
      "Rocket Launcher I", "Rocket Launcher IV", "Rocket Launcher VI"
    ]);
    const rocketOne = cardLibrary["specialty.kudryavka_noumi.1"];
    const rocketSix = cardLibrary["specialty.kudryavka_noumi.6"];
    expect(rocketOne.tags?.find((tag) => tag.startsWith("Instant:"))).toBe(
      "Instant: Select a unit and 1 adjacent unit. Deal damage to each (friend or foe): 1 at Power 0–1, 2 at Power 2–3, or 3 at Power 4+."
    );
    expect(rocketSix.tags?.find((tag) => tag.startsWith("Instant:"))).toContain("2 adjacent units");
  });

  it("resolves Rin's -1 combo and Kud's random other-target attack as separate attacks", () => {
    const rinState = createInitialGameState("little-busters-rin-combo");
    rinState.players.p1.hand = [];
    rinState.players.p2.hand = [];
    const rin = rinState.combat!.units.unit_p1_griffins;
    const rinTarget = rinState.combat!.units.unit_p2_skeletons;
    Object.assign(rin, {
      position: 12,
      attack: 4,
      abilities: ["little-busters-rin-second-attack"],
      activatedThisRound: false,
      attackedThisActivation: false,
      attacksThisActivation: 0
    });
    Object.assign(rinTarget, { position: 13, defense: 0, maxHealth: 100, damage: 0, retaliatedThisRound: true });
    for (const unit of Object.values(rinState.combat!.units)) {
      if (unit.controllerId === "p2" && unit.id !== rinTarget.id) unit.damage = unit.maxHealth;
    }
    rinState.activePlayerId = "p1";
    rinState.combat!.activeUnitId = rin.id;
    rinState.combat!.dice.scriptedRolls = [0, 0];
    rinState.combat!.dice.rollCount = 0;
    const afterRin = settleAttack(apply(rinState, {
      type: "ATTACK_UNIT", playerId: "p1", attackerId: rin.id, defenderId: rinTarget.id
    }));
    expect(afterRin.combat!.units[rinTarget.id].damage).toBe(7);
    expect(afterRin.eventLog.some((event) =>
      event.type === "UNIT_ABILITY_TRIGGERED" && event.abilityId === "little-busters-rin-second-attack"
    )).toBe(true);

    const kudState = createInitialGameState("little-busters-kud-follow-up");
    kudState.players.p1.hand = [];
    kudState.players.p2.hand = [];
    const kud = kudState.combat!.units.unit_p1_marksmen;
    const primary = kudState.combat!.units.unit_p2_skeletons;
    const other = kudState.combat!.units.unit_p2_vampires;
    Object.assign(kud, {
      position: 0,
      attack: 2,
      abilities: ["little-busters-kud-random-follow-up"],
      activatedThisRound: false,
      attackedThisActivation: false,
      attacksThisActivation: 0
    });
    Object.assign(primary, { position: 12, defense: 0, maxHealth: 100, damage: 0, retaliatedThisRound: true });
    Object.assign(other, { position: 13, defense: 0, maxHealth: 100, damage: 0, retaliatedThisRound: true });
    for (const unit of Object.values(kudState.combat!.units)) {
      if (unit.controllerId === "p2" && unit.id !== primary.id && unit.id !== other.id) unit.damage = unit.maxHealth;
    }
    kudState.activePlayerId = "p1";
    kudState.combat!.activeUnitId = kud.id;
    kudState.combat!.dice.scriptedRolls = [0, 0];
    kudState.combat!.dice.rollCount = 0;
    const afterKud = settleAttack(apply(kudState, {
      type: "ATTACK_UNIT", playerId: "p1", attackerId: kud.id, defenderId: primary.id
    }));
    expect(afterKud.combat!.units[primary.id].damage).toBe(2);
    expect(afterKud.combat!.units[other.id].damage).toBe(2);
    expect(afterKud.eventLog.some((event) =>
      event.type === "UNIT_ABILITY_TRIGGERED" && event.abilityId === "little-busters-kud-random-follow-up"
    )).toBe(true);
  });

  it("injects the campus hero through real combat setup without affecting another town", () => {
    const campus = enterNeutralFight("little_busters", "sasami_sasasegawa");
    const campusHero = getMainHero(campus, "p1")!;
    expect(campus.combat!.units[heroUnitId(campusHero.id)]).toMatchObject({
      heroUnit: true,
      heroDefId: "sasami_sasasegawa",
      damage: 0,
      controllerId: "p1"
    });

    const control = enterNeutralFight("fuyuki", "bin");
    expect(Object.values(control.combat!.units).some((unit) => unit.heroUnit)).toBe(false);
  });

  it("Masato redirects one attack on any adjacent ally, including a Gold battlefield hero, per combat round", () => {
    const state = createInitialGameState("little-busters-masato-bodyguard");
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    const attacker = state.combat!.units.unit_p2_skeletons;
    const protectedUnit = state.combat!.units.unit_p1_griffins;
    const masato = state.combat!.units.unit_p1_crusaders;

    Object.assign(attacker, { position: 13, attack: 3, abilities: [], activatedThisRound: false, attackedThisRound: false });
    Object.assign(protectedUnit, { position: 9, defense: 0, maxHealth: 100, damage: 0, abilities: [], grade: "gold", heroUnit: true, retaliatedThisRound: true });
    Object.assign(masato, {
      position: 10,
      cardName: "Pack of Masato the Wall",
      defense: 0,
      maxHealth: 100,
      damage: 0,
      abilities: ["masato-bodyguard-intercept"],
      retaliatedThisRound: true
    });
    state.activePlayerId = "p2";
    state.combat!.activeUnitId = attacker.id;
    state.combat!.dice.scriptedRolls = [0, 0, 0, 0];
    state.combat!.dice.rollCount = 0;

    let after = settleAttack(apply(state, {
      type: "ATTACK_UNIT",
      playerId: "p2",
      attackerId: attacker.id,
      defenderId: protectedUnit.id
    }));
    expect(after.combat!.units[protectedUnit.id].damage).toBe(0);
    expect(after.combat!.units[masato.id].damage).toBeGreaterThan(0);
    expect(after.combat!.units[masato.id].bodyguardInterceptUsedRound).toBe(1);
    expect(after.eventLog.some((event) => event.type === "UNIT_ABILITY_TRIGGERED" && event.abilityId === "masato-bodyguard-intercept")).toBe(true);

    const firstMasatoDamage = after.combat!.units[masato.id].damage;
    Object.assign(after.combat!.units[attacker.id], {
      activatedThisRound: false,
      attackedThisActivation: false,
      attacksThisActivation: 0,
      movedThisActivation: false
    });
    after.activePlayerId = "p2";
    after.combat!.activeUnitId = attacker.id;
    after = settleAttack(apply(after, {
      type: "ATTACK_UNIT",
      playerId: "p2",
      attackerId: attacker.id,
      defenderId: protectedUnit.id
    }));
    expect(after.combat!.units[protectedUnit.id].damage).toBeGreaterThan(0);
    expect(after.combat!.units[masato.id].damage).toBe(firstMasatoDamage);
  });

  it("the Little Busters battlefield hero retaliates normally", () => {
    const state = createInitialGameState("little-busters-hero-retaliation");
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    const attacker = state.combat!.units.unit_p2_skeletons;
    const hero = state.combat!.units.unit_p1_griffins;
    Object.assign(attacker, { position: 13, attack: 2, defense: 0, maxHealth: 100, damage: 0, abilities: [], activatedThisRound: false, attackedThisActivation: false });
    Object.assign(hero, { position: 9, attack: 3, defense: 0, maxHealth: 100, damage: 0, abilities: [], heroUnit: true, retaliatedThisRound: false });
    state.activePlayerId = "p2";
    state.combat!.activeUnitId = attacker.id;
    state.combat!.dice.scriptedRolls = [0, 0, 0, 0];
    state.combat!.dice.rollCount = 0;

    const after = settleAttack(apply(state, {
      type: "ATTACK_UNIT",
      playerId: "p2",
      attackerId: attacker.id,
      defenderId: hero.id
    }));
    expect(after.combat!.units[attacker.id].damage).toBeGreaterThan(0);
    expect(after.combat!.units[hero.id].retaliatedThisRound).toBe(true);
  });

  it("Masato does not redirect an attack when the ally is not adjacent to him", () => {
    const state = createInitialGameState("little-busters-masato-non-adjacent-control");
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    const attacker = state.combat!.units.unit_p2_skeletons;
    const protectedUnit = state.combat!.units.unit_p1_griffins;
    const masato = state.combat!.units.unit_p1_crusaders;

    Object.assign(attacker, { position: 13, attack: 3, abilities: [], activatedThisRound: false, attackedThisRound: false });
    Object.assign(protectedUnit, { position: 9, defense: 0, maxHealth: 100, damage: 0, abilities: [], retaliatedThisRound: true });
    Object.assign(masato, {
      position: 6,
      cardName: "Pack of Masato the Wall",
      defense: 0,
      maxHealth: 100,
      damage: 0,
      abilities: ["masato-bodyguard-intercept"],
      retaliatedThisRound: true
    });
    state.activePlayerId = "p2";
    state.combat!.activeUnitId = attacker.id;
    state.combat!.dice.scriptedRolls = [0, 0, 0, 0];
    state.combat!.dice.rollCount = 0;

    const after = settleAttack(apply(state, {
      type: "ATTACK_UNIT",
      playerId: "p2",
      attackerId: attacker.id,
      defenderId: protectedUnit.id
    }));
    expect(after.combat!.units[protectedUnit.id].damage).toBeGreaterThan(0);
    expect(after.combat!.units[masato.id].damage).toBe(0);
    expect(after.combat!.units[masato.id].bodyguardInterceptUsedRound).toBeUndefined();
  });

  it("Disciplinary Committee Pack chooses a real enemy for -1 Attack in round 1 only", () => {
    let state = createAdventureGameState({
      seed: "little-busters-disciplinary-start",
      ruleset: "binh",
      anime: { enabled: true, isekaiTowns: true },
      rollFirstPlayer: false,
      players: [
        { id: "p1", name: "One", factionId: "little_busters", heroDefId: "riki_naoe" },
        { id: "p2", name: "Two", factionId: "necropolis", heroDefId: "sandro" }
      ]
    });
    if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
      state = apply(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
    }
    const original = state.players.p1.army[0];
    state.players.p1.army = [{ ...original, unitDefId: "little_busters.disciplinary_committee", side: "pack" }];
    const hero = getMainHero(state, "p1")!;
    const field = state.adventure!.fields[hero.spaceId!];
    field.difficulty = 1;
    startNeutralEncounter(state, hero, field);
    state = apply(state, getLegalActions(state, "p1").find((legal) => legal.action.type === "PLACE_COMBAT_UNIT")!.action);
    expect(Object.values(state.combat!.units).find((unit) => unit.controllerId === "p1" && unit.armyUnitId)?.abilities).toContain(
      "disciplinary-sanction"
    );
    state = apply(state, { type: "FINISH_COMBAT_PLACEMENT", playerId: "p1" });
    const tactics = getLegalActions(state, "p1").find((legal) => legal.action.type === "FINISH_TACTICS");
    if (tactics) state = apply(state, tactics.action);
    expect(state.pendingChoice?.type).toBe("OPTION_CHOICE");
    expect(state.pendingChoice?.type === "OPTION_CHOICE" ? state.pendingChoice.context : null).toBe(
      "disciplinary-committee-start"
    );
    const choice = state.pendingChoice!;
    if (choice.type !== "OPTION_CHOICE" || !choice.disciplinaryCommitteeStart) throw new Error("missing choice");
    const targetId = choice.disciplinaryCommitteeStart.targetUnitIds[0];
    state = apply(state, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: choice.id, optionIndex: 0 });
    expect(getDisplayAttackBonus(state, state.combat!.units[targetId])).toBe(-1);
    const effect = state.activeEffects.find((candidate) => candidate.target?.type === "unit" && candidate.target.unitId === targetId);
    expect(effect?.expiresAtCombatRoundEnd).toBe(1);
    expireEffectsForCombatRoundEnd(state, 1);
    expect(getDisplayAttackBonus(state, state.combat!.units[targetId])).toBe(0);
  });

  // SIBLING of the Bounty-Hunter Mark regression (see
  // factory-unit-abilities.test.ts): the NEUTRAL seat holds no client, and the
  // reducer pump has no auto-resolver for this OPTION_CHOICE context, so a
  // neutral-controlled Disciplinary Committee opening a window would leave a
  // pendingChoice nobody can ever answer. It sanctions deterministically.
  it("a NEUTRAL-controlled Disciplinary Committee sanctions automatically instead of freezing the table", () => {
    const state = createInitialGameState("little-busters-disciplinary-neutral");
    Object.assign(state.combat!.units.unit_p2_skeletons, {
      cardName: "Pack of the Disciplinary Committee",
      controllerId: NEUTRAL_PLAYER_ID,
      abilities: ["disciplinary-sanction"],
      maxHealth: 30,
      damage: 0,
      position: 13
    });
    Object.assign(state.combat!.units.unit_p2_vampires, {
      controllerId: NEUTRAL_PLAYER_ID,
      abilities: [],
      maxHealth: 30,
      damage: 0,
      position: 14
    });
    Object.assign(state.combat!.units.unit_p1_marksmen, { maxHealth: 20, damage: 0, position: 9 });
    Object.assign(state.combat!.units.unit_p1_crusaders, { maxHealth: 10, damage: 0, position: 10 });

    expect(maybeOpenDisciplinaryCommitteeStartChoice(state), "no window opens for the neutral seat").toBe(false);
    expect(state.pendingChoice).toBeNull();
    expect(state.priorityPlayerId).not.toBe(NEUTRAL_PLAYER_ID);
    expect(state.combat!.disciplinaryCommitteeStartResolved).toBe(true);
    // The strongest living enemy really takes the printed -1 Attack.
    expect(getDisplayAttackBonus(state, state.combat!.units.unit_p1_marksmen)).toBe(-1);
    expect(getDisplayAttackBonus(state, state.combat!.units.unit_p1_crusaders)).toBe(0);
    expect(getLegalActions(state, "p1").length).toBeGreaterThan(0);
  });

  it("Saya Pack moves anywhere, ignores Retaliation, and applies one non-stacking Armor Break only on -1", () => {
    function sayaAttack(roll: -1 | 0 | 1): GameState {
      const state = createInitialGameState(`little-busters-saya-runtime-${roll}`);
      state.players.p1.hand = [];
      state.players.p2.hand = [];
      const saya = state.combat!.units.unit_p1_griffins;
      const target = state.combat!.units.unit_p2_skeletons;
      Object.assign(saya, {
        cardName: "Pack of Saya Tokido",
        attack: 6,
        defense: 2,
        maxHealth: 100,
        damage: 0,
        type: "ground",
        abilities: ["saya-infiltration", "ignores-retaliation", "saya-armor-break"],
        activatedThisRound: false,
        movedThisActivation: false,
        attackedThisActivation: false,
        attacksThisActivation: 0
      });
      Object.assign(target, { defense: 3, maxHealth: 100, damage: 0, abilities: [], retaliatedThisRound: false });
      state.activePlayerId = "p1";
      state.combat!.activeUnitId = saya.id;
      state.combat!.dice.scriptedRolls = [roll, roll, roll, roll];
      state.combat!.dice.rollCount = 0;

      if (roll === -1) {
        const anywhereMove = getLegalActions(state, "p1").find(
          (legal) =>
            legal.action.type === "MOVE_UNIT" &&
            !isAdjacent(saya.position, legal.action.destination) &&
            legal.action.destination !== saya.position
        );
        expect(anywhereMove, "Saya can choose a non-adjacent empty battlefield space").toBeTruthy();
      }

      // Adjacent ground attackers normally provoke Retaliation. Saya does not.
      saya.position = 13;
      target.position = 9;
      return settleAttack(apply(state, {
        type: "ATTACK_UNIT",
        playerId: "p1",
        attackerId: saya.id,
        defenderId: target.id
      }));
    }

    const hit = sayaAttack(-1);
    const target = hit.combat!.units.unit_p2_skeletons;
    expect(target.tokens?.filter((token) => token.kind === "corrosion").map((token) => token.amount)).toEqual([1]);
    expect(target.damage).toBe(2);
    expect(hit.combat!.units.unit_p1_griffins.damage).toBe(0);
    expect(target.retaliatedThisRound).toBe(false);
    expect(hit.eventLog.some((event) => event.type === "UNIT_ABILITY_TRIGGERED" && event.abilityId === "saya-armor-break")).toBe(true);

    for (const roll of [0, 1] as const) {
      const miss = sayaAttack(roll).combat!.units.unit_p2_skeletons;
      expect(miss.tokens?.some((token) => token.kind === "corrosion") ?? false).toBe(false);
      expect(miss.damage).toBe(3 + roll);
    }
  });

  it("Komari's Everyone Smiles reduces spell damage on adjacent units (a non-adjacent unit takes it in full)", () => {
    // The aura is a live positional read: only Komari herself and units
    // standing NEXT to her are shielded, so the same Magic Arrow that bounces
    // off her neighbour still wounds a far unit for its printed 1.
    function magicArrowDamageAt(position: number, seed: string): number {
      const state = createInitialGameState(seed);
      state.players.p1.hand = [];
      const komari = makeHeroCombatUnit(heroState("komari_kamikita", 1, 0), 6)!;
      state.combat!.units[komari.id] = komari;
      const target = state.combat!.units.unit_p1_marksmen;
      Object.assign(target, { position, damage: 0, maxHealth: 10 });
      state.players.p2.hand = ["spell.magic_arrow"];
      state.combat!.activeUnitId = "unit_p2_skeletons";
      state.activePlayerId = "p2";
      let after = apply(state, {
        type: "CAST_SPELL",
        playerId: "p2",
        cardId: "spell.magic_arrow",
        target: { type: "unit", unitId: target.id }
      });
      while (after.reactionWindow) {
        after = apply(after, { type: "PASS_REACTION", playerId: after.reactionWindow.priorityPlayerId });
      }
      return after.combat!.units[target.id].damage;
    }
    // Cell 5 is orthogonally adjacent to Komari on 6 — the arrow's 1 damage is
    // absorbed to 0. CONTROL: cell 16 is out of the aura, the full 1 lands.
    expect(magicArrowDamageAt(5, "lb-komari-aura-adjacent")).toBe(0);
    expect(magicArrowDamageAt(16, "lb-komari-aura-control")).toBe(1);
  });

  it("the campus hero is tierless both ways: never a tier-gated target, never Devour bait, hit LAST by graded neutrals", () => {
    // (a) Tier-gated casts skip it: Blind targets by grade, and the hero (like
    // a commander) has none — other units stay offered, the hero never is.
    const blind = createInitialGameState("lb-hero-tierless-blind");
    const blindHero = makeHeroCombatUnit(heroState("sasami_sasasegawa", 4, 0), 2)!;
    blind.combat!.units[blindHero.id] = blindHero;
    blind.players.p2.hand = ["spell.blind"];
    blind.combat!.activeUnitId = "unit_p2_skeletons";
    blind.activePlayerId = "p2";
    const blindTargets = getLegalActions(blind, "p2")
      .filter((legal) => legal.action.type === "CAST_SPELL" && legal.action.cardId === "spell.blind")
      .map((legal) =>
        legal.action.type === "CAST_SPELL" && legal.action.target?.type === "unit" ? legal.action.target.unitId : null
      );
    expect(blindTargets.length).toBeGreaterThan(0);
    expect(blindTargets).not.toContain(blindHero.id);

    // (b) A tier-gated stare (raid-boss Devour, "at most gold") never threatens
    // the hero even though its cosmetic grade field reads "gold". CONTROL: a
    // plain gold unit IS threatened by the same follow-up.
    const devour: DeathStareFollowUp = {
      abilityId: "boss-devour",
      abilityName: "Devour",
      diceCount: 1,
      onRoll: 1,
      targetGradeAtMost: "gold"
    };
    const stareState = createInitialGameState("lb-hero-tierless-stare");
    const stareHero = makeHeroCombatUnit(heroState("sasami_sasasegawa", 4, 0), 2)!;
    expect(deathStareFollowUpAppliesTo(devour, stareHero)).toBe(false);
    const plainGold = { ...stareState.combat!.units.unit_p1_griffins, grade: "gold" as const };
    expect(deathStareFollowUpAppliesTo(devour, plainGold)).toBe(true);

    // (c) A GRADED neutral attacker deprioritises the hero exactly like a
    // commander: adjacent hero + far graded unit → it walks to the far graded
    // unit. CONTROL: with a plain graded unit adjacent instead, nearest wins.
    // Everything is GOLD so the hero's cosmetic `grade: "gold"` field alone
    // cannot save the claim — only the heroUnit no-tier read can.
    function neutralTargetScenario(adjacentIsHero: boolean): string | undefined {
      const state = createInitialGameState(`lb-hero-target-last-${adjacentIsHero}`);
      const attacker = state.combat!.units.unit_p2_skeletons;
      Object.assign(attacker, { controllerId: NEUTRAL_PLAYER_ID, position: 0, type: "ground", grade: "gold" });
      const far = state.combat!.units.unit_p1_crusaders;
      Object.assign(far, { position: 19, type: "ground", grade: "gold", damage: 0 });
      let adjacentId: string;
      if (adjacentIsHero) {
        const hero = makeHeroCombatUnit(heroState("sasami_sasasegawa", 1, 0), 1)!;
        state.combat!.units[hero.id] = hero;
        adjacentId = hero.id;
      } else {
        const plain = state.combat!.units.unit_p1_griffins;
        Object.assign(plain, { position: 1, type: "ground", grade: "gold", damage: 0 });
        adjacentId = plain.id;
      }
      for (const unit of Object.values(state.combat!.units)) {
        if (unit.id !== attacker.id && unit.id !== far.id && unit.id !== adjacentId) {
          unit.damage = unit.maxHealth;
        }
      }
      return pickNeutralTarget(state.combat!, attacker)?.id;
    }
    expect(neutralTargetScenario(true), "hero adjacent → the far graded unit is struck first").toBe("unit_p1_crusaders");
    expect(neutralTargetScenario(false), "CONTROL: plain graded unit adjacent → nearest wins").toBe("unit_p1_griffins");
  });
});
