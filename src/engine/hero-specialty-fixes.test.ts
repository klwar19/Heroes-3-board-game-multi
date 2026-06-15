import { describe, expect, it } from "vitest";
import {
  applyAction,
  createAdventureGameState,
  createInitialGameState,
  getEffectDamageAmount,
  getLegalActions,
  makeCombatUnitFromArmy,
  unitMatchesSpecialtyName
} from "./index";
import { coreFactionDefinitions, startingTileByFaction } from "@/data/factions/core";
import { coreUnitDefinitions } from "@/data/factions/units";
import { adventureCards } from "@/data/cards/adventure";
import { unitAbilities } from "@/data/units/abilities";
import { allTileDefinitions } from "@/data/map/tiles";
import { cardLibrary } from "@/data/cards/library";
import type { GameAction, GameEvent, GameState, PlayerId } from "./state";

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function lastAttackRolled(state: GameState): Extract<GameEvent, { type: "ATTACK_ROLLED" }> | undefined {
  return [...state.eventLog].reverse().find((event): event is Extract<GameEvent, { type: "ATTACK_ROLLED" }> => event.type === "ATTACK_ROLLED");
}

function hasAbilityEvent(state: GameState, abilityId: string): boolean {
  return state.eventLog.some((event) => event.type === "UNIT_ABILITY_TRIGGERED" && event.abilityId === abilityId);
}

// ---------------------------------------------------------------------------
// Issue 4: Inferno starting-tile data is consistent (S6, not S5/Fortress)
// ---------------------------------------------------------------------------

describe("Inferno starting tile data", () => {
  it("points Inferno at S6 (the Inferno tile) in both the faction data and the setup map", () => {
    expect(coreFactionDefinitions.inferno.startingTileId).toBe("S6");
    expect(startingTileByFaction.inferno).toBe("S6");
    // S6 is the Inferno tile; S5 is the (unplayable) Fortress tile.
    expect(allTileDefinitions.S6.fields[0]).toMatchObject({ location: "town", faction: "inferno" });
    expect(allTileDefinitions.S5.fields[0]).toMatchObject({ location: "town", faction: "fortress" });
  });

  it("derives the setup map from the faction definitions so they cannot drift", () => {
    for (const faction of Object.values(coreFactionDefinitions)) {
      expect(startingTileByFaction[faction.id]).toBe(faction.startingTileId);
    }
  });

  it("places the S6 Inferno tile for an Inferno seat at setup", () => {
    const state = createAdventureGameState({
      seed: "inferno-tile",
      rollFirstPlayer: false,
      players: [
        { id: "p1", name: "Xyron", factionId: "inferno", heroDefId: "xyron" },
        { id: "p2", name: "Catherine", factionId: "castle", heroDefId: "catherine" }
      ]
    });
    const tiles = Object.values(state.adventure!.tiles);
    expect(tiles.some((tile) => tile.tileDefId === "S6")).toBe(true);
    expect(tiles.some((tile) => tile.tileDefId === "S5")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Issue 2: Mutare's "a Dragons unit" doubling matches the whole Dragons family
// ---------------------------------------------------------------------------

describe("hero-specialty signature-unit matching", () => {
  it("matches exact unit names and the Dragons family, but never Dragon Flies", () => {
    expect(unitMatchesSpecialtyName("Crusaders", "Crusaders")).toBe(true);
    expect(unitMatchesSpecialtyName("Crusaders", "Efreet")).toBe(false);
    expect(unitMatchesSpecialtyName("Black Dragons", "a Dragons unit")).toBe(true);
    expect(unitMatchesSpecialtyName("Gold Dragons", "a Dragons unit")).toBe(true);
    expect(unitMatchesSpecialtyName("Rust Dragons", "a Dragons unit")).toBe(true);
    expect(unitMatchesSpecialtyName("Dragon Flies", "a Dragons unit")).toBe(false);
    expect(unitMatchesSpecialtyName("Black Dragons", undefined)).toBe(false);
    expect(unitMatchesSpecialtyName(undefined, "a Dragons unit")).toBe(false);
  });

  it("doubles Mutare's +1 attack when the attacker is a Dragons unit", () => {
    const dragonState = (attackerName: string): GameState => {
      const state = createInitialGameState("mutare-seed");
      state.players.p1.hand = ["specialty.mutare.1"];
      state.players.p2.hand = [];
      const attacker = state.combat!.units.unit_p1_griffins;
      attacker.name = attackerName;
      attacker.position = 9;
      state.combat!.units.unit_p2_skeletons.position = 13;
      return applyOk(state, {
        type: "ATTACK_UNIT",
        playerId: "p1",
        attackerId: "unit_p1_griffins",
        defenderId: "unit_p2_skeletons"
      });
    };

    const dragons = applyOk(dragonState("Black Dragons"), {
      type: "PLAY_REACTIONS",
      playerId: "p1",
      plays: [{ cardId: "specialty.mutare.1", optionIndex: 0 }]
    });
    expect(lastAttackRolled(dragons)?.attackBonus).toBe(2);

    const nonDragon = applyOk(dragonState("Griffins"), {
      type: "PLAY_REACTIONS",
      playerId: "p1",
      plays: [{ cardId: "specialty.mutare.1", optionIndex: 0 }]
    });
    expect(lastAttackRolled(nonDragon)?.attackBonus).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Issue 3: Rion's Battlefield Medic heals 1 AND draws 1
// ---------------------------------------------------------------------------

describe("Rion's Battlefield Medic I", () => {
  it("heals 1 damage and then draws 1 card", () => {
    const state = createInitialGameState("rion-seed");
    state.players.p1.hand = ["specialty.rion.1"];
    state.players.p1.deck = ["stat.attack"];
    state.combat!.units.unit_p1_crusaders.damage = 2;

    const play = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "PLAY_CARD" &&
        legal.action.cardId === "specialty.rion.1" &&
        legal.action.target?.type === "unit" &&
        legal.action.target.unitId === "unit_p1_crusaders"
    );
    expect(play, "Rion's heal should be playable on a wounded friendly").toBeTruthy();

    const next = applyOk(state, play!.action);
    expect(next.combat!.units.unit_p1_crusaders.damage).toBe(1);
    // The Rion card left the hand and the printed "draw 1" pulled stat.attack in.
    expect(next.players.p1.hand).toEqual(["stat.attack"]);
    expect(next.players.p1.deck).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Issue 6: Vial of Lifeblood's heal option removes 3 (not 0) damage
// ---------------------------------------------------------------------------

describe("Vial of Lifeblood heal option", () => {
  it("removes up to 3 damage from the chosen unit", () => {
    const state = createInitialGameState("vial-seed");
    state.players.p1.hand = ["artifact.vial_of_lifeblood"];
    state.combat!.units.unit_p1_crusaders.damage = 3;

    const heal = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "PLAY_CARD" &&
        legal.action.cardId === "artifact.vial_of_lifeblood" &&
        legal.action.optionIndex === 0 &&
        legal.action.target?.type === "unit" &&
        legal.action.target.unitId === "unit_p1_crusaders"
    );
    expect(heal, "the heal option should target a wounded friendly").toBeTruthy();

    const healed = applyOk(state, heal!.action);
    expect(healed.combat!.units.unit_p1_crusaders.damage).toBe(0);
  });

  it("getEffectDamageAmount reads the resolved option, not the CHOOSE_ONE parent", () => {
    const vial = cardLibrary["artifact.vial_of_lifeblood"];
    // The parent CHOOSE_ONE has no amount of its own.
    expect(getEffectDamageAmount(vial.effect.type === "CHOOSE_ONE" ? null : vial.effect, 0)).toBe(0);
    const healOption = vial.effect.type === "CHOOSE_ONE" ? vial.effect.options[0].effect : null;
    expect(getEffectDamageAmount(healOption, 0)).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Issue 1a: Gem's First Aid I takes the First Aid Tent (or draws a card)
// ---------------------------------------------------------------------------

describe("Gem's First Aid I", () => {
  function gemAdventure(): GameState {
    const state = createAdventureGameState({
      seed: "gem-seed",
      rollFirstPlayer: false,
      players: [
        { id: "p1", name: "Gem", factionId: "rampart", heroDefId: "gem" },
        { id: "p2", name: "Catherine", factionId: "castle", heroDefId: "catherine" }
      ]
    });
    state.activePlayerId = "p1";
    state.pendingChoice = null;
    state.reactionWindow = null;
    return state;
  }

  it("is a live (implemented) starting card, not a dead one", () => {
    expect(adventureCards["specialty.gem.1"].implementationStatus).toBe("implemented");
  });

  it("takes the First Aid Tent from the supply for free, then draws when none is left", () => {
    let state = gemAdventure();
    state.players.p1.hand = ["specialty.gem.1"];
    expect(state.adventure!.warMachineSupply).toContain("war_machine.first_aid_tent");

    const grab = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "specialty.gem.1"
    );
    expect(grab, "Gem's First Aid I should be playable on the map").toBeTruthy();

    state = applyOk(state, grab!.action);
    expect(state.players.p1.hand).toContain("war_machine.first_aid_tent");
    expect(state.adventure!.warMachineSupply).not.toContain("war_machine.first_aid_tent");

    // Played again with the Tent already gone: the alternative draws 1 card.
    state.players.p1.hand = ["specialty.gem.1"];
    state.players.p1.deck = ["stat.attack"];
    const again = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "specialty.gem.1"
    );
    state = applyOk(state, again!.action);
    expect(state.players.p1.hand).toEqual(["stat.attack"]);
    expect(state.adventure!.warMachineSupply).not.toContain("war_machine.first_aid_tent");
  });
});

// ---------------------------------------------------------------------------
// Issue 1b: Xyron's Inferno I deals 1 damage to a space and its neighbours
// ---------------------------------------------------------------------------

describe("Xyron's Inferno I", () => {
  it("discards 2 cards and damages the target plus every adjacent unit (friend or foe)", () => {
    const state = createInitialGameState("xyron-seed");
    state.players.p1.hand = ["specialty.xyron.1", "stat.attack", "stat.defense"];
    state.players.p2.hand = [];
    // A friendly unit next to the enemy centre takes the blast too.
    state.combat!.units.unit_p1_crusaders.position = 10;

    const blast = applyOk(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "specialty.xyron.1",
      optionIndex: 0,
      target: { type: "unit", unitId: "unit_p2_vampires" },
      costCardIds: ["stat.attack", "stat.defense"]
    });

    // Centre + orthogonal neighbours of position 14: skeletons(13), dread_knights(18), crusaders(10).
    expect(blast.combat!.units.unit_p2_vampires.damage).toBe(1);
    expect(blast.combat!.units.unit_p2_skeletons.damage).toBe(1);
    expect(blast.combat!.units.unit_p2_dread_knights.damage).toBe(1);
    expect(blast.combat!.units.unit_p1_crusaders.damage).toBe(1);
    // The card and its two-card cost left the hand.
    expect(blast.players.p1.hand).toEqual([]);
    expect(blast.players.p1.discard).toContain("specialty.xyron.1");
  });

  it("cannot be played without two other cards to discard", () => {
    const state = createInitialGameState("xyron-seed-2");
    state.players.p1.hand = ["specialty.xyron.1"];
    const offered = getLegalActions(state, "p1").some(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "specialty.xyron.1"
    );
    expect(offered).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Issue 1c: Alamar's Resurrection cancels a lethal normal attack (only), by
// grade, suppresses the saved unit's retaliation, and is paid with Power/Spell
// cards. It never reacts to spells or specialty damage.
// ---------------------------------------------------------------------------

describe("Alamar's Resurrection (asked when a unit is about to die)", () => {
  // Sets up a lethal attack on a p1 unit and applies it; the engine pauses in
  // the lethal-save window when p1 can Resurrect (otherwise the unit just dies).
  function lethalAttackOn(defenderGrade: "bronze" | "silver" | "gold", p1Hand: string[]): GameState {
    const state = createInitialGameState("alamar-seed");
    state.players.p1.hand = p1Hand;
    state.players.p2.hand = [];
    const defender = state.combat!.units.unit_p1_griffins; // p1's unit
    defender.grade = defenderGrade;
    defender.position = 9;
    defender.damage = defender.maxHealth - 1; // one hit from death
    const attacker = state.combat!.units.unit_p2_skeletons;
    attacker.position = 13;
    attacker.attack = 5; // clearly lethal
    state.combat!.dice.scriptedRolls = [0];
    state.combat!.dice.rollCount = 0;
    state.activePlayerId = "p2";
    state.combat!.activeUnitId = "unit_p2_skeletons";
    return applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p2",
      attackerId: "unit_p2_skeletons",
      defenderId: "unit_p1_griffins"
    });
  }

  it("asks the controller (a lethal-save window) only after the attack rolls lethal", () => {
    const declared = lethalAttackOn("bronze", ["specialty.alamar.1", "stat.power"]);
    expect(declared.reactionWindow?.triggerEvent.type).toBe("UNIT_LETHAL_HIT");
    const offered = (declared.reactionWindow?.legalReactions.p1 ?? []).some(
      (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === "specialty.alamar.1"
    );
    expect(offered).toBe(true);
  });

  it("cancels the killing blow (discard 1 Power) and stops the saved unit's retaliation", () => {
    const declared = lethalAttackOn("bronze", ["specialty.alamar.1", "stat.power"]);
    const saved = applyOk(declared, {
      type: "PLAY_REACTIONS",
      playerId: "p1",
      plays: [{ cardId: "specialty.alamar.1", optionIndex: 0, costCardIds: ["stat.power"] }]
    });
    const griffins = saved.combat!.units.unit_p1_griffins;
    expect(griffins.damage).toBe(griffins.maxHealth - 1); // unchanged: the attack was cancelled
    expect(hasAbilityEvent(saved, "resurrection")).toBe(true);
    // The blow on the griffins landed for 0, and the griffins never retaliate.
    expect(saved.eventLog.some((event) => event.type === "ATTACK_ROLLED" && event.attackerId === "unit_p1_griffins")).toBe(
      false
    );
    expect(saved.combat!.attackSequence ?? null).toBeNull();
    expect(saved.players.p1.discard).toContain("stat.power");
  });

  it("lets the unit die when the controller passes the save", () => {
    const declared = lethalAttackOn("bronze", ["specialty.alamar.1", "stat.power"]);
    const died = applyOk(declared, { type: "PASS_REACTION", playerId: "p1" });
    expect(hasAbilityEvent(died, "resurrection")).toBe(false);
    // The lethal hit landed — the griffins flipped to its Few side or left.
    const griffins = died.combat!.units.unit_p1_griffins;
    expect(griffins.variant === "few" || griffins.damage >= griffins.maxHealth).toBe(true);
  });

  it("offers only the option matching the unit's grade", () => {
    const declared = lethalAttackOn("silver", ["specialty.alamar.1", "stat.power", "spell.magic_arrow"]);
    const resurrectionOptions = (declared.reactionWindow?.legalReactions.p1 ?? [])
      .filter((legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === "specialty.alamar.1")
      .map((legal) => (legal.action.type === "PLAY_REACTION" ? legal.action.optionIndex : undefined));
    // Only the silver option (index 1) is offered for a silver unit.
    expect(resurrectionOptions).toEqual([1]);

    const saved = applyOk(declared, {
      type: "PLAY_REACTIONS",
      playerId: "p1",
      plays: [{ cardId: "specialty.alamar.1", optionIndex: 1, costCardIds: ["stat.power", "spell.magic_arrow"] }]
    });
    expect(hasAbilityEvent(saved, "resurrection")).toBe(true);
    expect(saved.combat!.units.unit_p1_griffins.damage).toBe(saved.combat!.units.unit_p1_griffins.maxHealth - 1);
  });

  it("is not offered when the controller cannot pay the Power cost — the unit dies", () => {
    // A gold unit needs 4 Power for Resurrection I; with only 1 Power card the
    // save is unaffordable, so no window opens and the attack resolves.
    const resolved = lethalAttackOn("gold", ["specialty.alamar.1", "stat.power"]);
    expect(resolved.reactionWindow ?? null).toBeNull();
    expect(hasAbilityEvent(resolved, "resurrection")).toBe(false);
  });

  it("works at level VI: a bronze unit is saved for free", () => {
    const declared = lethalAttackOn("bronze", ["specialty.alamar.6"]);
    expect(declared.reactionWindow?.triggerEvent.type).toBe("UNIT_LETHAL_HIT");
    const bronzeOption = (declared.reactionWindow?.legalReactions.p1 ?? []).find(
      (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === "specialty.alamar.6"
    );
    expect(bronzeOption, "the free bronze save should be offered").toBeTruthy();
    const saved = applyOk(declared, bronzeOption!.action);
    expect(hasAbilityEvent(saved, "resurrection")).toBe(true);
    const griffins = saved.combat!.units.unit_p1_griffins;
    expect(griffins.damage).toBe(griffins.maxHealth - 1); // saved, no cards discarded
  });

  it("works at level IV: a silver unit is saved by discarding 1 Power", () => {
    const declared = lethalAttackOn("silver", ["specialty.alamar.4", "stat.power"]);
    const silverOption = (declared.reactionWindow?.legalReactions.p1 ?? []).find(
      (legal) =>
        legal.action.type === "PLAY_REACTION" &&
        legal.action.cardId === "specialty.alamar.4" &&
        legal.action.optionIndex === 1
    );
    expect(silverOption, "the silver save should be offered").toBeTruthy();
    const saved = applyOk(declared, {
      type: "PLAY_REACTIONS",
      playerId: "p1",
      plays: [{ cardId: "specialty.alamar.4", optionIndex: 1, costCardIds: ["stat.power"] }]
    });
    expect(hasAbilityEvent(saved, "resurrection")).toBe(true);
    expect(saved.combat!.units.unit_p1_griffins.damage).toBe(saved.combat!.units.unit_p1_griffins.maxHealth - 1);
  });

  it("does not react to a lethal spell (attacks only) — the spell still strikes", () => {
    const state = createInitialGameState("alamar-spell-seed");
    state.players.p1.hand = ["specialty.alamar.1", "stat.power"];
    state.players.p2.hand = ["spell.magic_arrow"];
    const defender = state.combat!.units.unit_p1_griffins;
    defender.grade = "bronze";
    defender.damage = defender.maxHealth - 1; // 1 HP — Magic Arrow's 1 damage is lethal
    state.activePlayerId = "p2";
    state.combat!.activeUnitId = "unit_p2_skeletons";

    // Resurrection is never offered against a spell, so no reaction window even
    // opens for p1 — the spell resolves at once and the hit lands.
    const resolved = applyOk(state, {
      type: "CAST_SPELL",
      playerId: "p2",
      cardId: "spell.magic_arrow",
      target: { type: "unit", unitId: "unit_p1_griffins" }
    });
    expect(hasAbilityEvent(resolved, "resurrection")).toBe(false);
    const hitGriffins = resolved.eventLog.some(
      (event) =>
        event.type === "DAMAGE_ASSIGNED" &&
        event.target.type === "unit" &&
        event.target.unitId === "unit_p1_griffins"
    );
    expect(hitGriffins).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Issue 5: Pit Lords' Summon Demons (after a friendly unit is removed)
// ---------------------------------------------------------------------------

describe("Pit Lords' Summon Demons", () => {
  function pitLordsCombat(): GameState {
    const state = createInitialGameState("pit-lords-seed");
    const combat = state.combat!;
    combat.obstacles = [];
    combat.units = {
      unit_p1_marksmen: makeCombatUnitFromArmy(
        { id: "army_p1_m", unitDefId: "castle.marksmen", side: "pack" },
        "p1",
        "unit_p1_marksmen",
        1
      )!,
      unit_p2_pit_lords: makeCombatUnitFromArmy(
        { id: "army_p2_pl", unitDefId: "inferno.pit_lords", side: "pack" },
        "p2",
        "unit_p2_pit_lords",
        10
      )!,
      unit_p2_demons: makeCombatUnitFromArmy(
        { id: "army_p2_dem", unitDefId: "inferno.demons", side: "few" },
        "p2",
        "unit_p2_demons",
        13
      )!
    };
    state.players.p2.army = [
      { id: "army_p2_pl", unitDefId: "inferno.pit_lords", side: "pack" },
      { id: "army_p2_dem", unitDefId: "inferno.demons", side: "few" }
    ];
    state.activePlayerId = "p2";
    combat.activeUnitId = "unit_p2_pit_lords";
    return state;
  }

  it("is an implemented ability, not a display-only one", () => {
    expect(unitAbilities["summon-demons"].implementationStatus).toBe("implemented");
    expect(coreUnitDefinitions["inferno.pit_lords"].pack?.abilities).toContain("summon-demons");
  });

  it("offers nothing until one of your units has been removed this combat", () => {
    const state = pitLordsCombat();
    const before = getLegalActions(state, "p2").some((legal) => legal.action.type === "SUMMON_DEMONS");
    expect(before).toBe(false);

    state.combat!.unitRemovedControllerIds = ["p2"];
    const after = getLegalActions(state, "p2").some((legal) => legal.action.type === "SUMMON_DEMONS");
    expect(after).toBe(true);
  });

  it("summons a Few of Demons onto an empty adjacent space and keeps it in the army", () => {
    const state = pitLordsCombat();
    state.combat!.unitRemovedControllerIds = ["p2"];

    const summon = getLegalActions(state, "p2").find(
      (legal) => legal.action.type === "SUMMON_DEMONS" && legal.action.mode === "summon"
    );
    expect(summon, "a summon onto an empty adjacent space should be offered").toBeTruthy();

    const next = applyOk(state, summon!.action);
    const summonPosition = summon!.action.type === "SUMMON_DEMONS" ? summon!.action.position : undefined;
    const summoned = Object.values(next.combat!.units).find(
      (unit) => unit.unitDefId === "inferno.demons" && unit.position === summonPosition
    );
    expect(summoned).toBeTruthy();
    expect(summoned!.variant).toBe("few");
    // It joined the army and the Pit Lords spent their action (once per combat).
    expect(next.players.p2.army.filter((unit) => unit.unitDefId === "inferno.demons")).toHaveLength(2);
    expect(next.combat!.units.unit_p2_pit_lords.summonedThisCombat).toBe(true);
    expect(next.combat!.units.unit_p2_pit_lords.activatedThisRound).toBe(true);
  });

  it("reinforces a friendly Few of Demons up to a Pack", () => {
    const state = pitLordsCombat();
    state.combat!.unitRemovedControllerIds = ["p2"];

    const reinforce = getLegalActions(state, "p2").find(
      (legal) =>
        legal.action.type === "SUMMON_DEMONS" &&
        legal.action.mode === "reinforce" &&
        legal.action.targetUnitId === "unit_p2_demons"
    );
    expect(reinforce, "reinforcing the Few of Demons should be offered").toBeTruthy();

    const next = applyOk(state, reinforce!.action);
    expect(next.combat!.units.unit_p2_demons.variant).toBe("pack");
    // The backing army card was upgraded too, so the Pack survives the combat.
    expect(next.players.p2.army.find((unit) => unit.id === "army_p2_dem")?.side).toBe("pack");
  });

  it("can only summon or reinforce once per combat", () => {
    const state = pitLordsCombat();
    state.combat!.unitRemovedControllerIds = ["p2"];
    state.combat!.units.unit_p2_pit_lords.summonedThisCombat = true;
    const offered = getLegalActions(state, "p2").some((legal) => legal.action.type === "SUMMON_DEMONS");
    expect(offered).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// War machine expert abilities: First Aid Tent (heal 3×) and Ballista (fire 3×)
// ---------------------------------------------------------------------------

function endCombatRound(state: GameState, playerId: PlayerId): GameState {
  state.combat!.activeUnitId = null;
  state.activePlayerId = playerId;
  return applyOk(state, { type: "END_COMBAT_ROUND", playerId });
}

describe("First Aid Tent expert", () => {
  function fatInPlay(): GameState {
    const state = createInitialGameState("fat-expert-seed");
    state.players.p1.hand = ["war_machine.first_aid_tent"];
    state.players.p2.hand = [];
    // A tanky wounded friendly so it stays wounded after several heals.
    state.combat!.units.unit_p1_crusaders.maxHealth = 6;
    state.combat!.units.unit_p1_crusaders.damage = 4;
    // griffins is the active p1 unit — play the Tent as a permanent.
    return applyOk(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "war_machine.first_aid_tent",
      target: { type: "none" }
    });
  }

  function healEffectId(state: GameState): string {
    const effect = state.activeEffects.find((candidate) => candidate.name === "First Aid Tent");
    expect(effect, "the Tent's heal effect should be in play").toBeTruthy();
    return effect!.id;
  }

  it("heals 3 times for a single expert use, then offers no more heals that round", () => {
    let state = fatInPlay();
    const effectId = healEffectId(state);
    const heal = (mode?: "expert") =>
      applyOk(state, {
        type: "USE_ACTIVE_EFFECT",
        playerId: "p1",
        effectId,
        target: { type: "unit", unitId: "unit_p1_crusaders" },
        ...(mode ? { mode } : {})
      });

    state = heal("expert"); // activate expert: spend 1 crown, heal 1
    expect(state.players.p1.combatStats.expertUsesSpentThisRound).toBe(1);
    expect(state.combat!.units.unit_p1_crusaders.damage).toBe(3);

    state = heal(); // 2nd heal — no extra crown
    state = heal(); // 3rd heal
    expect(state.combat!.units.unit_p1_crusaders.damage).toBe(1);
    expect(state.players.p1.combatStats.expertUsesSpentThisRound).toBe(1);

    // The unit is still wounded, but the 3 expert heals are spent for the round.
    const moreHeals = getLegalActions(state, "p1").filter((legal) => legal.action.type === "USE_ACTIVE_EFFECT");
    expect(moreHeals).toHaveLength(0);
  });

  it("blocks the expert once the basic heal was used (and vice versa)", () => {
    let state = fatInPlay();
    const effectId = healEffectId(state);

    // A basic heal first: the expert can no longer be activated this round.
    state = applyOk(state, {
      type: "USE_ACTIVE_EFFECT",
      playerId: "p1",
      effectId,
      target: { type: "unit", unitId: "unit_p1_crusaders" }
    });
    const offers = getLegalActions(state, "p1").filter((legal) => legal.action.type === "USE_ACTIVE_EFFECT");
    expect(offers).toHaveLength(0); // basic used up the round; no expert either

    const expertResult = applyAction(state, {
      type: "USE_ACTIVE_EFFECT",
      playerId: "p1",
      effectId,
      target: { type: "unit", unitId: "unit_p1_crusaders" },
      mode: "expert"
    });
    expect(expertResult.errors.length).toBeGreaterThan(0);
  });

  it("cannot use the expert with no expert uses left", () => {
    const state = fatInPlay();
    state.players.p1.limits.expertUses = 0;
    healEffectId(state); // the heal effect is present; only the expert is gated
    const offered = getLegalActions(state, "p1").filter(
      (legal) => legal.action.type === "USE_ACTIVE_EFFECT" && legal.action.mode === "expert"
    );
    expect(offered).toHaveLength(0);
  });
});

// The Ballista no longer fires 3× on its own: the same-target volley is the
// Artillery ability's expert side. Full Artillery coverage lives in
// artillery.test.ts; here we just guard that the Ballista alone never triples.
describe("Ballista without Artillery", () => {
  function ballistaRoundStart(crowns: number): GameState {
    const state = createInitialGameState("ballista-expert-seed");
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    state.players.p1.permanents = ["war_machine.ballista"];
    state.players.p1.limits.expertUses = crowns;
    // One clearly-slowest, tanky enemy so the shot lands on it deterministically.
    const target = state.combat!.units.unit_p2_dread_knights;
    target.initiative = 1;
    target.maxHealth = 12;
    target.damage = 0;
    return endCombatRound(state, "p1");
  }

  it("fires a single basic shot at round start even with crowns free (no Artillery card)", () => {
    const fired = ballistaRoundStart(2);
    // No Artillery in hand → no expert offer at all; the Ballista just shoots once.
    expect(fired.pendingChoice ?? null).toBeNull();
    expect(fired.combat!.units.unit_p2_dread_knights.damage).toBe(1);
    expect(fired.players.p1.combatStats.expertUsesSpentThisRound).toBe(0);
  });

  it("still fires its single shot with no crown available", () => {
    const fired = ballistaRoundStart(0);
    expect(fired.pendingChoice ?? null).toBeNull();
    expect(fired.combat!.units.unit_p2_dread_knights.damage).toBe(1);
  });
});
