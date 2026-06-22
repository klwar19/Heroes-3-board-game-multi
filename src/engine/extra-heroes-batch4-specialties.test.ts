import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { applyAction, createInitialGameState, createAdventureGameState, getLegalActions } from "./index";
import { startWarMachineRound } from "./permanents";
import { coreFactionDefinitions, coreHeroDefinitions } from "@/data/factions/core";
import { adventureCards } from "@/data/cards/adventure";
import type { GameAction, GameEvent, GameState, UnitId } from "./state";

// ---------------------------------------------------------------------------
// Additional heroes, batch 4 — three placeholder-art wiki heroes for existing
// factions, all with fully engine-wired I/IV/VI specialties (mutation-checked:
// each test fails if the specialty's engine wiring is removed). Each tackles a
// NEW engine mechanic:
//
//   Ivor (Rampart, Ranger)   — Elves: FORCE the dice of an attack roll (I sets
//                              the next roll to "0", VI's 2nd option sets your
//                              roll to "+1"); IV doubles +1 A/D for a ranged unit
//                              (NEW doubleForUnitType).
//   Tarnum (Castle, Knight)  — Ballista: I/IV reuse the Ballista engine; VI
//                              damages 2 chosen enemies (NEW DAMAGE_CHOSEN_ENEMIES).
//   Merist (Fortress, Witch) — Stone Skin: I a defense reaction with an adjacency
//                              bonus (NEW extraIfAdjacentToAttacker); IV grants a
//                              Defense token to every friendly unit (NEW
//                              GRANT_DEFENSE_TOKENS); VI also makes those tokens
//                              pay out on a "0" roll (NEW STONE_SKIN_AURA).
// ---------------------------------------------------------------------------

const assetPath = (src: string) => fileURLToPath(new URL(`../../public${src}`, import.meta.url));

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function findPlay(state: GameState, cardId: string, optionIndex?: number, unitId?: UnitId) {
  return getLegalActions(state, "p1").find(
    (legal) =>
      legal.action.type === "PLAY_CARD" &&
      legal.action.cardId === cardId &&
      (optionIndex === undefined || legal.action.optionIndex === optionIndex) &&
      (unitId === undefined || (legal.action.target?.type === "unit" && legal.action.target.unitId === unitId))
  );
}

function passAllReactions(state: GameState): GameState {
  let current = state;
  let safety = 40;
  while (current.reactionWindow && safety > 0) {
    safety -= 1;
    current = applyOk(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
  }
  return current;
}

function lastAttackRolled(
  state: GameState,
  predicate: (event: Extract<GameEvent, { type: "ATTACK_ROLLED" }>) => boolean
): Extract<GameEvent, { type: "ATTACK_ROLLED" }> | undefined {
  return [...state.eventLog]
    .reverse()
    .find((event): event is Extract<GameEvent, { type: "ATTACK_ROLLED" }> => event.type === "ATTACK_ROLLED" && predicate(event));
}

// ===========================================================================
// Roster + art wiring (CLAUDE.md rule #2: data states exactly what runs)
// ===========================================================================

describe("batch-4 heroes are registered with PC-portrait art and implemented specialties", () => {
  const heroes: Array<[string, keyof typeof coreFactionDefinitions]> = [
    ["ivor", "rampart"],
    ["tarnum_castle", "castle"],
    ["merist", "fortress"]
  ];

  it("each carries a real PC portrait, NO board scan, and 3 implemented, face-less specialties", () => {
    for (const [heroId, factionId] of heroes) {
      const hero = coreHeroDefinitions[heroId];
      expect(hero, `${heroId} should be defined`).toBeTruthy();
      expect(coreFactionDefinitions[factionId].heroes, `${factionId} roster`).toContain(heroId);
      expect(hero.portrait, `${heroId} portrait path`).toMatch(/^\/assets\/hero_portraits-/);
      expect(hero.boardScan, `${heroId} has no board scan`).toBeUndefined();
      expect(existsSync(assetPath(hero.portrait!)), `${heroId} portrait file on disk`).toBe(true);
      for (const level of [1, 4, 6] as const) {
        const card = adventureCards[hero.specialtyCardIds[level]];
        expect(card, `${hero.specialtyCardIds[level]} should exist`).toBeTruthy();
        expect(card.implementationStatus, `${card.id} implemented`).toBe("implemented");
        expect(card.tags, `${card.id} not flagged needs-implementation`).not.toContain("needs-implementation");
        // No printed specialty face exists for these heroes (placeholder art), so
        // — like Cyra/Torosar/batch-3 — the card must not reference a missing file.
        expect(card.assets?.cardImage, `${card.id} omits a missing image`).toBeUndefined();
      }
    }
  });

  it("Tarnum (Castle) is the Knight variant, distinct from the other heroes", () => {
    expect(coreHeroDefinitions.tarnum_castle.name).toBe("Tarnum");
    expect(coreHeroDefinitions.tarnum_castle.class).toBe("Knight");
    expect(coreHeroDefinitions.tarnum_castle.faction).toBe("castle");
  });
});

// ===========================================================================
// Ivor (Rampart) — Elves: forced attack dice + doubling by unit TYPE
// ===========================================================================

describe("Ivor's Elves specialty", () => {
  /** griffins (p1) attack skeletons; the attack die is scripted to `scriptedRoll`. */
  function attackWith(seed: string, cardId: string | null, optionIndex: number | undefined, scriptedRoll: number) {
    const state = createInitialGameState(seed);
    state.players.p1.hand = cardId ? [cardId] : [];
    state.players.p2.hand = [];
    const attacker = state.combat!.units.unit_p1_griffins;
    attacker.abilities = [];
    attacker.position = 9;
    attacker.attack = 4;
    const defender = state.combat!.units.unit_p2_skeletons;
    defender.abilities = [];
    defender.position = 13;
    defender.defense = 0;
    defender.maxHealth = 40;
    defender.damage = 0;
    state.combat!.dice.scriptedRolls = new Array(8).fill(scriptedRoll);
    state.combat!.dice.rollCount = 0;
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";
    const declared = applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_griffins",
      defenderId: "unit_p2_skeletons"
    });
    if (!cardId) {
      return passAllReactions(declared);
    }
    const reaction = (declared.reactionWindow?.legalReactions.p1 ?? []).find(
      (legal) =>
        legal.action.type === "PLAY_REACTION" &&
        legal.action.cardId === cardId &&
        (optionIndex === undefined || legal.action.optionIndex === optionIndex)
    );
    expect(reaction, `${cardId} option ${optionIndex} should be offered on the declared attack`).toBeTruthy();
    return passAllReactions(applyOk(declared, reaction!.action));
  }

  it("I forces the next attack roll to \"0\", overriding a scripted \"+1\"", () => {
    // Baseline: the scripted "+1" stands, so the die contributes +1 to the hit.
    const base = attackWith("ivor-1-base", null, undefined, 1);
    expect(lastAttackRolled(base, (event) => event.attackerId === "unit_p1_griffins")?.roll).toBe(1);
    // Ivor I sets the die to 0 — the +1 is gone.
    const forced = attackWith("ivor-1-forced", "specialty.ivor.1", undefined, 1);
    const rolled = lastAttackRolled(forced, (event) => event.attackerId === "unit_p1_griffins");
    expect(rolled?.roll, "the forced die shows 0").toBe(0);
    expect(rolled?.damage, "4 attack, 0 defense, die 0 -> 4 damage").toBe(4);
  });

  it("I is offered as an instant on EITHER side's attack (controller \"any\")", () => {
    // p2 declares the attack; Ivor's owner (p1) may still set that roll to 0.
    const state = createInitialGameState("ivor-1-enemy");
    state.players.p1.hand = ["specialty.ivor.1"];
    state.players.p2.hand = [];
    state.combat!.units.unit_p2_skeletons.position = 13;
    state.combat!.units.unit_p1_griffins.position = 9;
    state.activePlayerId = "p2";
    state.combat!.activeUnitId = "unit_p2_skeletons";
    const declared = applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p2",
      attackerId: "unit_p2_skeletons",
      defenderId: "unit_p1_griffins"
    });
    const reaction = (declared.reactionWindow?.legalReactions.p1 ?? []).find(
      (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === "specialty.ivor.1"
    );
    expect(reaction, "Ivor I reacts to the enemy's attack too").toBeTruthy();
  });

  it("IV's +1 attack doubles (+2) for a RANGED attacker only (NEW doubleForUnitType)", () => {
    const ground = createInitialGameState("ivor-4-ground");
    ground.combat!.units.unit_p1_griffins.type = "ground";
    const groundResult = (() => {
      ground.players.p1.hand = ["specialty.ivor.4"];
      ground.players.p2.hand = [];
      const a = ground.combat!.units.unit_p1_griffins;
      a.abilities = [];
      a.position = 9;
      a.attack = 4;
      const d = ground.combat!.units.unit_p2_skeletons;
      d.abilities = [];
      d.position = 13;
      d.defense = 0;
      d.maxHealth = 40;
      d.damage = 0;
      ground.combat!.dice.scriptedRolls = new Array(8).fill(0);
      ground.combat!.dice.rollCount = 0;
      ground.activePlayerId = "p1";
      ground.combat!.activeUnitId = "unit_p1_griffins";
      const declared = applyOk(ground, {
        type: "ATTACK_UNIT",
        playerId: "p1",
        attackerId: "unit_p1_griffins",
        defenderId: "unit_p2_skeletons"
      });
      const reaction = (declared.reactionWindow?.legalReactions.p1 ?? []).find(
        (legal) =>
          legal.action.type === "PLAY_REACTION" && legal.action.cardId === "specialty.ivor.4" && legal.action.optionIndex === 0
      );
      return passAllReactions(applyOk(declared, reaction!.action));
    })();
    expect(lastAttackRolled(groundResult, (event) => event.attackerId === "unit_p1_griffins")?.attackBonus).toBe(1);

    const ranged = createInitialGameState("ivor-4-ranged");
    ranged.combat!.units.unit_p1_griffins.type = "ranged";
    const rangedResult = (() => {
      ranged.players.p1.hand = ["specialty.ivor.4"];
      ranged.players.p2.hand = [];
      const a = ranged.combat!.units.unit_p1_griffins;
      a.abilities = [];
      a.position = 9;
      a.attack = 4;
      const d = ranged.combat!.units.unit_p2_skeletons;
      d.abilities = [];
      d.position = 13;
      d.defense = 0;
      d.maxHealth = 40;
      d.damage = 0;
      ranged.combat!.dice.scriptedRolls = new Array(8).fill(0);
      ranged.combat!.dice.rollCount = 0;
      ranged.activePlayerId = "p1";
      ranged.combat!.activeUnitId = "unit_p1_griffins";
      const declared = applyOk(ranged, {
        type: "ATTACK_UNIT",
        playerId: "p1",
        attackerId: "unit_p1_griffins",
        defenderId: "unit_p2_skeletons"
      });
      const reaction = (declared.reactionWindow?.legalReactions.p1 ?? []).find(
        (legal) =>
          legal.action.type === "PLAY_REACTION" && legal.action.cardId === "specialty.ivor.4" && legal.action.optionIndex === 0
      );
      return passAllReactions(applyOk(declared, reaction!.action));
    })();
    expect(lastAttackRolled(rangedResult, (event) => event.attackerId === "unit_p1_griffins")?.attackBonus).toBe(2);
  });

  it("VI option A adds +2 HP to the combat (selected unit)", () => {
    const state = createInitialGameState("ivor-6a");
    state.players.p1.hand = ["specialty.ivor.6"];
    const before = state.combat!.units.unit_p1_griffins.maxHealth;
    const play = findPlay(state, "specialty.ivor.6", 0, "unit_p1_griffins");
    expect(play, "the +2 HP option should be a combat play on a friendly unit").toBeTruthy();
    const after = applyOk(state, play!.action);
    expect(after.combat!.units.unit_p1_griffins.maxHealth).toBe(before + 2);
  });

  it("VI option B forces your attack roll to \"+1\", overriding a scripted \"0\"", () => {
    const base = attackWith("ivor-6b-base", null, undefined, 0);
    expect(lastAttackRolled(base, (event) => event.attackerId === "unit_p1_griffins")?.roll).toBe(0);
    const forced = attackWith("ivor-6b-forced", "specialty.ivor.6", 1, 0);
    const rolled = lastAttackRolled(forced, (event) => event.attackerId === "unit_p1_griffins");
    expect(rolled?.roll, "the forced die shows +1").toBe(1);
    expect(rolled?.damage, "4 attack, 0 defense, die +1 -> 5 damage").toBe(5);
  });
});

// ===========================================================================
// Tarnum (Castle) — Ballista (reuse) + multi-target chosen damage (NEW)
// ===========================================================================

describe("Tarnum (Castle)'s Ballista specialty", () => {
  it("I option B activates an owned Ballista for a shot at the slowest enemy", () => {
    const state = createInitialGameState("tarnum-castle-i");
    state.players.p1.hand = ["specialty.tarnum_castle.1"];
    state.players.p1.permanents = ["war_machine.ballista"];
    state.players.p2.hand = [];
    state.combat!.units.unit_p2_skeletons.initiative = 1; // slowest enemy
    state.combat!.units.unit_p2_vampires.initiative = 5;
    state.combat!.units.unit_p2_dread_knights.initiative = 5;
    const activate = findPlay(state, "specialty.tarnum_castle.1", 1);
    expect(activate, "the activate option needs a Ballista in play").toBeTruthy();
    const next = applyOk(state, activate!.action);
    expect(next.combat!.units.unit_p2_skeletons.damage).toBe(1);
  });

  it("I option B is not offered without any Ballista", () => {
    const state = createInitialGameState("tarnum-castle-i-none");
    state.players.p1.hand = ["specialty.tarnum_castle.1"];
    state.players.p1.permanents = [];
    expect(findPlay(state, "specialty.tarnum_castle.1", 1)).toBeFalsy();
  });

  it("I option A pays 5 gold to take a Ballista from the supply into hand (map)", () => {
    const state = createAdventureGameState({
      seed: "tarnum-castle-map",
      rollFirstPlayer: false,
      players: [
        { id: "p1", name: "Tarnum", factionId: "castle", heroDefId: "tarnum_castle" },
        { id: "p2", name: "Sandro", factionId: "necropolis", heroDefId: "sandro" }
      ]
    });
  for (const _pl of Object.values(state.players)) { _pl.canMulligan = false; _pl.needsHandRefresh = false; }
    state.activePlayerId = "p1";
    state.pendingChoice = null;
    state.reactionWindow = null;
    state.players.p1.hand = ["specialty.tarnum_castle.1"];
    state.players.p1.resources.gold = 12;
    expect(state.adventure?.warMachineSupply).toContain("war_machine.ballista");
    const gain = findPlay(state, "specialty.tarnum_castle.1", 0);
    expect(gain, "the gain-a-Ballista option should be offered on the map").toBeTruthy();
    const next = applyOk(state, gain!.action);
    expect(next.players.p1.hand).toContain("war_machine.ballista");
    expect(next.players.p1.resources.gold).toBe(7);
  });

  it("IV option A fields an extra Ballista that fires at the next combat-round start", () => {
    const state = createInitialGameState("tarnum-castle-iv");
    state.players.p1.hand = ["specialty.tarnum_castle.4"];
    state.players.p1.permanents = [];
    state.players.p2.hand = [];
    state.combat!.units.unit_p2_skeletons.initiative = 1;
    state.combat!.units.unit_p2_vampires.initiative = 5;
    state.combat!.units.unit_p2_dread_knights.initiative = 5;
    const next = applyOk(state, findPlay(state, "specialty.tarnum_castle.4", 0)!.action);
    expect(
      next.activeEffects.some(
        (effect) => effect.controllerId === "p1" && effect.modifiers.some((modifier) => modifier.type === "EXTRA_BALLISTA")
      ),
      "an EXTRA_BALLISTA grant is held for the combat"
    ).toBe(true);
    startWarMachineRound(next);
    expect(next.combat!.units.unit_p2_skeletons.damage).toBe(1);
  });

  it("IV option B draws a card", () => {
    const state = createInitialGameState("tarnum-castle-iv-draw");
    state.players.p1.hand = ["specialty.tarnum_castle.4"];
    state.players.p1.deck = ["stat.attack", "stat.defense"];
    state.players.p2.hand = [];
    const before = state.players.p1.hand.length;
    const play = findPlay(state, "specialty.tarnum_castle.4", 1);
    expect(play, "the draw option should be a combat play").toBeTruthy();
    const after = applyOk(state, play!.action);
    expect(after.players.p1.hand.length).toBe(before - 1 + 1);
  });

  it("VI deals 2 damage to each of 2 chosen enemy units, never a friendly one (NEW)", () => {
    const state = createInitialGameState("tarnum-castle-vi");
    state.players.p1.hand = ["specialty.tarnum_castle.6"];
    state.players.p2.hand = [];
    // Leave exactly two living enemies so both are hit automatically.
    for (const id of ["unit_p2_skeletons", "unit_p2_vampires"] as const) {
      const unit = state.combat!.units[id];
      unit.abilities = [];
      unit.maxHealth = 40;
      unit.damage = 0;
    }
    state.combat!.units.unit_p2_dread_knights.damage = state.combat!.units.unit_p2_dread_knights.maxHealth; // removed
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";
    const before = state.combat!.units.unit_p1_griffins.damage;
    const play = findPlay(state, "specialty.tarnum_castle.6");
    expect(play, "VI should be a combat play").toBeTruthy();
    const after = applyOk(state, play!.action);
    expect(after.combat!.units.unit_p2_skeletons.damage, "enemy 1 hit for 2").toBe(2);
    expect(after.combat!.units.unit_p2_vampires.damage, "enemy 2 hit for 2").toBe(2);
    expect(after.combat!.units.unit_p1_griffins.damage, "friendly never hit").toBe(before);
  });

  it("VI opens a 2-of-N pick when more than two enemies are alive", () => {
    const state = createInitialGameState("tarnum-castle-vi-pick");
    state.players.p1.hand = ["specialty.tarnum_castle.6"];
    state.players.p2.hand = [];
    for (const id of ["unit_p2_skeletons", "unit_p2_vampires", "unit_p2_dread_knights"] as const) {
      const unit = state.combat!.units[id];
      unit.abilities = [];
      unit.maxHealth = 40;
      unit.damage = 0;
    }
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";
    const after = applyOk(state, findPlay(state, "specialty.tarnum_castle.6")!.action);
    expect(after.pendingChoice?.type, "a pick choice opens with 3 enemies and 2 picks").toBe("ABILITY_TARGET_CHOICE");
    expect(after.pendingChoice && "picksRemaining" in after.pendingChoice ? after.pendingChoice.picksRemaining : 0).toBe(2);
  });
});

// ===========================================================================
// Merist (Fortress) — Stone Skin: adjacency defense + Defense-token mechanics
// ===========================================================================

describe("Merist's Stone Skin specialty", () => {
  /** p2's unit (optionally ranged/far) attacks p1's griffins; p1 may react with `cardId`. */
  function defenseReact(
    seed: string,
    cardId: string | null,
    optionIndex: number | undefined,
    opts: { attackerType?: "ground" | "ranged"; attackerPosition?: number } = {}
  ) {
    const state = createInitialGameState(seed);
    state.players.p1.hand = cardId ? [cardId] : [];
    state.players.p2.hand = [];
    const attacker = state.combat!.units.unit_p2_skeletons;
    attacker.abilities = [];
    attacker.position = opts.attackerPosition ?? 13;
    attacker.attack = 4;
    if (opts.attackerType) {
      attacker.type = opts.attackerType;
    }
    const defender = state.combat!.units.unit_p1_griffins;
    defender.abilities = [];
    defender.position = 9; // orthogonally adjacent to position 13
    defender.defense = 0;
    defender.defenseToken = false;
    defender.maxHealth = 40;
    defender.damage = 0;
    state.combat!.dice.scriptedRolls = new Array(8).fill(0);
    state.combat!.dice.rollCount = 0;
    state.activePlayerId = "p2";
    state.combat!.activeUnitId = "unit_p2_skeletons";
    const declared = applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p2",
      attackerId: "unit_p2_skeletons",
      defenderId: "unit_p1_griffins"
    });
    if (cardId) {
      const reaction = (declared.reactionWindow?.legalReactions.p1 ?? []).find(
        (legal) =>
          legal.action.type === "PLAY_REACTION" &&
          legal.action.cardId === cardId &&
          (optionIndex === undefined || legal.action.optionIndex === optionIndex)
      );
      expect(reaction, `${cardId} should be offered to the defender`).toBeTruthy();
      return passAllReactions(applyOk(declared, reaction!.action));
    }
    return passAllReactions(declared);
  }

  it("I gives +1 defense, and +1 MORE when the defender is adjacent to the attacker (NEW)", () => {
    // Adjacent melee attacker (position 13 next to defender 9) -> +2.
    const adjacent = defenseReact("merist-1-adj", "specialty.merist.1", undefined);
    expect(lastAttackRolled(adjacent, (event) => event.attackerId === "unit_p2_skeletons" && !event.isRetaliation)?.defenseBonus).toBe(2);

    // A ranged attacker firing from afar (position 1) is NOT adjacent -> +1 only.
    const distant = defenseReact("merist-1-far", "specialty.merist.1", undefined, {
      attackerType: "ranged",
      attackerPosition: 1
    });
    expect(lastAttackRolled(distant, (event) => event.attackerId === "unit_p2_skeletons" && !event.isRetaliation)?.defenseBonus).toBe(1);
  });

  it("IV gives every friendly unit a Defense token (NEW GRANT_DEFENSE_TOKENS)", () => {
    const state = createInitialGameState("merist-4");
    state.players.p1.hand = ["specialty.merist.4"];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";
    state.combat!.units.unit_p1_griffins.activatedThisRound = false;
    for (const unit of Object.values(state.combat!.units)) {
      unit.defenseToken = false;
    }
    const after = applyOk(state, findPlay(state, "specialty.merist.4")!.action);
    for (const unit of Object.values(after.combat!.units)) {
      if (unit.controllerId === "p1") {
        expect(unit.defenseToken, `${unit.id} (friendly) gains a token`).toBe(true);
      } else {
        expect(unit.defenseToken, `${unit.id} (enemy) is untouched`).toBe(false);
      }
    }
  });

  /** p2 attacks a defending p1 unit; returns the defender's resolved defense value. */
  function defendValue(seed: string, withAura: boolean, defendDie: number): number | undefined {
    const state = createInitialGameState(seed);
    state.players.p1.hand = withAura ? ["specialty.merist.6"] : [];
    state.players.p2.hand = [];
    const defender = state.combat!.units.unit_p1_griffins;
    defender.abilities = [];
    defender.position = 9;
    defender.defense = 0;
    defender.defenseToken = true; // already defending
    defender.maxHealth = 40;
    defender.damage = 0;
    const attacker = state.combat!.units.unit_p2_skeletons;
    attacker.abilities = [];
    attacker.position = 13;
    attacker.attack = 6;
    // [attack die, defend die, …].
    state.combat!.dice.scriptedRolls = [0, defendDie, 0, 0, 0, 0, 0, 0];
    state.combat!.dice.rollCount = 0;
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";
    let current = state;
    if (withAura) {
      current = passAllReactions(applyOk(current, findPlay(current, "specialty.merist.6")!.action));
    }
    current.activePlayerId = "p2";
    current.combat!.activeUnitId = "unit_p2_skeletons";
    const declared = applyOk(current, {
      type: "ATTACK_UNIT",
      playerId: "p2",
      attackerId: "unit_p2_skeletons",
      defenderId: "unit_p1_griffins"
    });
    const settled = passAllReactions(declared);
    return lastAttackRolled(settled, (event) => event.attackerId === "unit_p2_skeletons" && !event.isRetaliation)?.defenseValue;
  }

  it("VI places Defense tokens on all your units AND creates the on-\"0\" aura", () => {
    const state = createInitialGameState("merist-6-setup");
    state.players.p1.hand = ["specialty.merist.6"];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";
    state.combat!.units.unit_p1_griffins.activatedThisRound = false;
    for (const unit of Object.values(state.combat!.units)) {
      unit.defenseToken = false;
    }
    const after = passAllReactions(applyOk(state, findPlay(state, "specialty.merist.6")!.action));
    expect(after.combat!.units.unit_p1_griffins.defenseToken, "friendly gains a token").toBe(true);
    expect(after.combat!.units.unit_p2_skeletons.defenseToken, "enemy untouched").toBe(false);
    expect(
      after.activeEffects.some(
        (effect) =>
          effect.controllerId === "p1" && effect.modifiers.some((modifier) => modifier.type === "DEFENSE_TOKEN_ON_ZERO")
      ),
      "the on-zero aura is active for p1"
    ).toBe(true);
  });

  it("VI makes a Defense token pay out on a \"0\" roll (NEW), while normally it does not", () => {
    // A plain Defense token: a "0" Defend roll grants nothing; only a "+1" does.
    expect(defendValue("merist-6-plain-0", false, 0), "token, roll 0, no aura -> +0").toBe(0);
    expect(defendValue("merist-6-plain-1", false, 1), "token, roll +1, no aura -> +1 (unchanged)").toBe(1);
    // With Merist VI's aura, the same "0" roll grants +1.
    expect(defendValue("merist-6-aura-0", true, 0), "token, roll 0, aura -> +1").toBe(1);
  });
});
