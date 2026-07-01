import { describe, expect, it } from "vitest";
import { applyAction, createAdventureGameState, createInitialGameState, getLegalActions } from "./index";
import { coreFactionDefinitions, coreHeroDefinitions } from "@/data/factions/core";
import { adventureCards } from "@/data/cards/adventure";
import type {
  ActiveEffectModifier,
  GameAction,
  GameEvent,
  GameState,
  UnitId
} from "./state";

// ---------------------------------------------------------------------------
// Additional heroes (fan-wiki "Regular Stretch Goals 2024"), shipped with their
// real printed art and fully engine-wired I/IV/VI specialties:
//   Fiona (Inferno)  — Cerberi specialist  (A/D, +1 HP, +2 attack)
//   Mephala (Rampart) — Armorer specialist (+2/+3/+4 defense, no signature unit)
//   Clancy (Rampart) — Unicorns specialist (A/D, +1 initiative, Spell Ward)
//   Adelaide (Castle) — Frost Ring specialist (ring blast I/VI, discard recall IV)
// Every test below fails if the specialty's engine wiring is removed.
// ---------------------------------------------------------------------------

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

function attackBonusBy(state: GameState, attackerId: UnitId): number | undefined {
  return [...state.eventLog]
    .reverse()
    .find(
      (event): event is Extract<GameEvent, { type: "ATTACK_ROLLED" }> =>
        event.type === "ATTACK_ROLLED" && event.attackerId === attackerId
    )?.attackBonus;
}

function defenseBonusOn(state: GameState, defenderId: UnitId): number | undefined {
  return [...state.eventLog]
    .reverse()
    .find(
      (event): event is Extract<GameEvent, { type: "ATTACK_ROLLED" }> =>
        event.type === "ATTACK_ROLLED" && event.defenderId === defenderId
    )?.defenseBonus;
}

function modifierTotalOn(state: GameState, unitId: UnitId, kind: ActiveEffectModifier["type"]): number {
  let total = 0;
  for (const effect of state.activeEffects) {
    if (effect.target?.type !== "unit" || effect.target.unitId !== unitId) {
      continue;
    }
    for (const modifier of effect.modifiers) {
      if (modifier.type === kind && "amount" in modifier) {
        total += modifier.amount;
      }
    }
  }
  return total;
}

// ===========================================================================
// Roster + art wiring (CLAUDE.md rule #2: the data must state what runs)
// ===========================================================================

describe("new heroes are registered in their factions with art and implemented specialties", () => {
  const roster: Array<[string, string]> = [
    ["fiona", "inferno"],
    ["mephala", "rampart"],
    ["clancy", "rampart"],
    ["adelaide", "castle"]
  ];

  it("each hero sits in its faction roster, carries portrait + board scan, and has 3 implemented specialties", () => {
    for (const [heroId, factionId] of roster) {
      const hero = coreHeroDefinitions[heroId];
      expect(hero, `${heroId} should be defined`).toBeTruthy();
      expect(coreFactionDefinitions[factionId].heroes, `${factionId} roster`).toContain(heroId);
      expect(hero.portrait, `${heroId} portrait`).toContain(`/assets/hero_boardart-${heroId}.webp`);
      expect(hero.boardScan, `${heroId} board scan`).toContain(`/assets/heroes-${factionId}-`);
      for (const level of [1, 4, 6] as const) {
        const cardId = hero.specialtyCardIds![level];
        const card = adventureCards[cardId];
        expect(card, `${cardId} should exist`).toBeTruthy();
        expect(card.implementationStatus, `${cardId} implemented`).toBe("implemented");
        expect(card.tags, `${cardId} not flagged needs-implementation`).not.toContain("needs-implementation");
        expect(card.assets?.cardImage, `${cardId} art`).toContain(`/assets/hero_specialties-${heroId}-${level}.webp`);
      }
    }
  });
});

// ===========================================================================
// Fiona (Inferno) — Cerberi specialist
// ===========================================================================

describe("Fiona's Cerberi specialty", () => {
  it("IV adds +1 HP, doubled (+2) on a Cerberi unit", () => {
    const doubled = createInitialGameState("fiona-iv-cerberi");
    doubled.players.p1.hand = ["specialty.fiona.4"];
    doubled.combat!.units.unit_p1_crusaders.name = "Cerberi";
    const before = doubled.combat!.units.unit_p1_crusaders.maxHealth;
    const onCerberi = applyOk(doubled, findPlay(doubled, "specialty.fiona.4", undefined, "unit_p1_crusaders")!.action);
    expect(onCerberi.combat!.units.unit_p1_crusaders.maxHealth).toBe(before + 2);

    const plain = createInitialGameState("fiona-iv-plain");
    plain.players.p1.hand = ["specialty.fiona.4"];
    const baseline = plain.combat!.units.unit_p1_griffins.maxHealth;
    const onGriffins = applyOk(plain, findPlay(plain, "specialty.fiona.4", undefined, "unit_p1_griffins")!.action);
    expect(onGriffins.combat!.units.unit_p1_griffins.maxHealth).toBe(baseline + 1);
  });

  it("VI grants +2 attack on a single attack, doubled (+4) for a Cerberi unit", () => {
    function attackWith(seed: string, attackerName: string): GameState {
      const state = createInitialGameState(seed);
      state.players.p1.hand = ["specialty.fiona.6"];
      state.players.p2.hand = [];
      const attacker = state.combat!.units.unit_p1_griffins;
      attacker.name = attackerName;
      attacker.position = 9;
      state.combat!.units.unit_p2_skeletons.position = 13;
      const declared = applyOk(state, {
        type: "ATTACK_UNIT",
        playerId: "p1",
        attackerId: "unit_p1_griffins",
        defenderId: "unit_p2_skeletons"
      });
      return applyOk(declared, {
        type: "PLAY_REACTIONS",
        playerId: "p1",
        plays: [{ cardId: "specialty.fiona.6" }]
      });
    }

    expect(attackBonusBy(attackWith("fiona-vi-plain", "Griffins"), "unit_p1_griffins")).toBe(2);
    expect(attackBonusBy(attackWith("fiona-vi-cerberi", "Cerberi"), "unit_p1_griffins")).toBe(4);
  });

  it("I's attack option grants +1, doubled (+2) for a Cerberi unit", () => {
    function attackWith(seed: string, attackerName: string): GameState {
      const state = createInitialGameState(seed);
      state.players.p1.hand = ["specialty.fiona.1"];
      state.players.p2.hand = [];
      const attacker = state.combat!.units.unit_p1_griffins;
      attacker.name = attackerName;
      attacker.position = 9;
      state.combat!.units.unit_p2_skeletons.position = 13;
      const declared = applyOk(state, {
        type: "ATTACK_UNIT",
        playerId: "p1",
        attackerId: "unit_p1_griffins",
        defenderId: "unit_p2_skeletons"
      });
      return applyOk(declared, {
        type: "PLAY_REACTIONS",
        playerId: "p1",
        plays: [{ cardId: "specialty.fiona.1", optionIndex: 0 }]
      });
    }
    expect(attackBonusBy(attackWith("fiona-i-plain", "Griffins"), "unit_p1_griffins")).toBe(1);
    expect(attackBonusBy(attackWith("fiona-i-cerberi", "Cerberi"), "unit_p1_griffins")).toBe(2);
  });
});

// ===========================================================================
// Mephala (Rampart) — Armorer specialist (flat +2/+3/+4 defense, no doubling)
// ===========================================================================

describe("Mephala's Armorer specialty", () => {
  it("declares a flat defense reaction at each level (no signature-unit doubling)", () => {
    const levels: Array<[1 | 4 | 6, number]> = [
      [1, 2],
      [4, 3],
      [6, 4]
    ];
    for (const [level, amount] of levels) {
      const card = adventureCards[`specialty.mephala.${level}`];
      expect(card.effect.type).toBe("ADD_COMBAT_STAT");
      if (card.effect.type === "ADD_COMBAT_STAT") {
        expect(card.effect.stat).toBe("defense");
        expect(card.effect.amount).toBe(amount);
        expect(card.effect.doubleForUnitName).toBeUndefined();
      }
      expect(card.trigger).toEqual({ event: "UNIT_ATTACK_DECLARED", controller: "opponent" });
    }
  });

  it("I adds +2 defense to the attacked unit when an enemy strikes", () => {
    const state = createInitialGameState("mephala-i");
    state.players.p1.hand = ["specialty.mephala.1"];
    state.players.p2.hand = [];
    state.combat!.units.unit_p2_skeletons.position = 9;
    state.combat!.units.unit_p1_griffins.position = 13;
    state.activePlayerId = "p2";
    state.combat!.activeUnitId = "unit_p2_skeletons";
    state.combat!.dice.scriptedRolls = [0, 0, 0];
    state.combat!.dice.rollCount = 0;
    const declared = applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p2",
      attackerId: "unit_p2_skeletons",
      defenderId: "unit_p1_griffins"
    });
    const reaction = (declared.reactionWindow?.legalReactions.p1 ?? []).find(
      (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === "specialty.mephala.1"
    );
    expect(reaction, "Mephala's defense reaction should be offered to the defender").toBeTruthy();
    const after = applyOk(declared, reaction!.action);
    expect(defenseBonusOn(after, "unit_p1_griffins")).toBe(2);
  });
});

// ===========================================================================
// Clancy (Rampart) — Unicorns specialist
// ===========================================================================

describe("Clancy's Unicorns specialty", () => {
  it("IV adds +1 initiative, doubled (+2) for a Unicorns unit", () => {
    const plain = createInitialGameState("clancy-iv-plain");
    plain.players.p1.hand = ["specialty.clancy.4"];
    const onGriffins = applyOk(plain, findPlay(plain, "specialty.clancy.4", undefined, "unit_p1_griffins")!.action);
    expect(modifierTotalOn(onGriffins, "unit_p1_griffins", "INITIATIVE_BONUS")).toBe(1);

    const doubled = createInitialGameState("clancy-iv-unicorns");
    doubled.players.p1.hand = ["specialty.clancy.4"];
    doubled.combat!.units.unit_p1_crusaders.name = "Unicorns";
    const onUnicorns = applyOk(doubled, findPlay(doubled, "specialty.clancy.4", undefined, "unit_p1_crusaders")!.action);
    expect(modifierTotalOn(onUnicorns, "unit_p1_crusaders", "INITIATIVE_BONUS")).toBe(2);
  });

  it("VI creates a Spell Ward (SPELL_DAMAGE_REDUCTION 1), doubled (2) on a Unicorns unit", () => {
    const plain = createInitialGameState("clancy-vi-plain");
    plain.players.p1.hand = ["specialty.clancy.6"];
    const onGriffins = applyOk(plain, findPlay(plain, "specialty.clancy.6", undefined, "unit_p1_griffins")!.action);
    expect(modifierTotalOn(onGriffins, "unit_p1_griffins", "SPELL_DAMAGE_REDUCTION")).toBe(1);

    const doubled = createInitialGameState("clancy-vi-unicorns");
    doubled.players.p1.hand = ["specialty.clancy.6"];
    doubled.combat!.units.unit_p1_crusaders.name = "Unicorns";
    const onUnicorns = applyOk(doubled, findPlay(doubled, "specialty.clancy.6", undefined, "unit_p1_crusaders")!.action);
    expect(modifierTotalOn(onUnicorns, "unit_p1_crusaders", "SPELL_DAMAGE_REDUCTION")).toBe(2);
  });

  it("the Spell Ward actually blunts incoming Spell damage (Magic Arrow 1 → 0)", () => {
    const state = createInitialGameState("clancy-vi-arrow");
    state.players.p1.hand = ["specialty.clancy.6"];
    state.players.p2.hand = [];
    const guard = state.combat!.units.unit_p1_griffins;
    guard.maxHealth = 20;
    guard.damage = 0;
    const warded = applyOk(state, findPlay(state, "specialty.clancy.6", undefined, "unit_p1_griffins")!.action);

    // The enemy now casts a 1-damage Magic Arrow at the warded unit.
    warded.players.p2.scrolls = [{ id: "scroll_1", spellCardIds: ["spell.magic_arrow"] }];
    warded.activePlayerId = "p2";
    warded.combat!.activeUnitId = "unit_p2_skeletons";
    const cast = getLegalActions(warded, "p2").find(
      (legal) =>
        legal.action.type === "CAST_SPELL" &&
        legal.action.fromScroll === "scroll_1" &&
        legal.action.target?.type === "unit" &&
        legal.action.target.unitId === "unit_p1_griffins"
    );
    expect(cast, "the enemy should be able to cast Magic Arrow at the warded unit").toBeTruthy();
    let resolved = applyOk(warded, cast!.action);
    let safety = 20;
    while (resolved.reactionWindow && safety > 0) {
      safety -= 1;
      resolved = applyOk(resolved, { type: "PASS_REACTION", playerId: resolved.reactionWindow.priorityPlayerId });
    }
    expect(resolved.combat!.units.unit_p1_griffins.damage).toBe(0);
  });
});

// ===========================================================================
// Adelaide (Castle) — Frost Ring specialist
// ===========================================================================

describe("Adelaide's Frost Ring specialty", () => {
  function ringState(seed: string, cardId: string): GameState {
    const state = createInitialGameState(seed);
    state.players.p1.hand = [cardId, "stat.attack", "stat.defense"];
    state.players.p2.hand = [];
    // Centre on space 9 (row 2, col 1): neighbours are 5, 13, 8, 10. Give the
    // units plenty of HP so the ring damage stays a clean `damage` reading
    // rather than a kill (which would open a death/save window mid-resolution).
    for (const id of ["unit_p1_crusaders", "unit_p1_griffins", "unit_p2_skeletons", "unit_p2_vampires"]) {
      state.combat!.units[id].maxHealth = 20;
      state.combat!.units[id].damage = 0;
    }
    state.combat!.units.unit_p1_crusaders.position = 9; // on the centre — spared
    state.combat!.units.unit_p1_griffins.position = 5; // adjacent — hit
    state.combat!.units.unit_p2_skeletons.position = 13; // adjacent — hit
    state.combat!.units.unit_p2_vampires.position = 0; // far away — untouched
    return state;
  }

  it("I rings a space for 1 damage to every ADJACENT unit (friend or foe), sparing the centre, for a 1-card discard", () => {
    const state = ringState("adelaide-i", "specialty.adelaide.1");
    const blast = applyOk(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "specialty.adelaide.1",
      mode: "basic",
      optionIndex: 0,
      target: { type: "space", position: 9 },
      costCardIds: ["stat.attack"]
    });
    expect(blast.combat!.units.unit_p1_griffins.damage).toBe(1);
    expect(blast.combat!.units.unit_p2_skeletons.damage).toBe(1);
    expect(blast.combat!.units.unit_p1_crusaders.damage).toBe(0); // centre spared
    expect(blast.combat!.units.unit_p2_vampires.damage).toBe(0); // out of range
    expect(blast.players.p1.discard).toContain("stat.attack");
  });

  it("I cannot be played without a card to discard", () => {
    const state = createInitialGameState("adelaide-i-nocost");
    state.players.p1.hand = ["specialty.adelaide.1"];
    expect(findPlay(state, "specialty.adelaide.1", 0)).toBeFalsy();
  });

  it("VI rings a space for 2 damage to adjacent units for a 2-card discard", () => {
    const state = ringState("adelaide-vi", "specialty.adelaide.6");
    const blast = applyOk(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "specialty.adelaide.6",
      mode: "basic",
      optionIndex: 0,
      target: { type: "space", position: 9 },
      costCardIds: ["stat.attack", "stat.defense"]
    });
    expect(blast.combat!.units.unit_p1_griffins.damage).toBe(2);
    expect(blast.combat!.units.unit_p2_skeletons.damage).toBe(2);
    expect(blast.combat!.units.unit_p1_crusaders.damage).toBe(0);
  });

  it("IV returns a Spell or Specialty from the discard pile to hand (and never another card kind)", () => {
    const game = createAdventureGameState({
      seed: "adelaide-iv",
      rollFirstPlayer: false,
      players: [
        { id: "p1", name: "Adelaide", factionId: "castle", heroDefId: "adelaide" },
        { id: "p2", name: "Catherine", factionId: "castle", heroDefId: "catherine" }
      ]
    });
    let state = (game.players.p1.needsHandRefresh || game.players.p1.canMulligan)
      ? applyOk(game, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] })
      : game;
    state.activePlayerId = "p1";
    state.pendingChoice = null;
    state.reactionWindow = null;
    state.players.p1.hand = ["specialty.adelaide.4"];
    state.players.p1.discard = ["spell.magic_arrow", "specialty.catherine.1", "stat.attack"];

    const play = findPlay(state, "specialty.adelaide.4", 0);
    expect(play, "Adelaide IV should be offered on the map with a Spell/Specialty in discard").toBeTruthy();
    state = applyOk(state, play!.action);

    const choice = state.pendingChoice;
    expect(choice?.type === "OPTION_CHOICE" && choice.context).toBe("discard-pick");
    // Only the Spell and the Specialty are eligible — the Statistic card is not.
    const labels = choice?.type === "OPTION_CHOICE" ? choice.options.map((option) => option.label) : [];
    expect(labels.some((label) => label.includes("Magic Arrow"))).toBe(true);
    expect(labels.some((label) => label.includes("Crusaders"))).toBe(true);
    expect(labels.some((label) => label.includes("Attack"))).toBe(false);

    state = applyOk(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: (choice as { id: string }).id,
      optionIndex: labels.findIndex((label) => label.includes("Magic Arrow"))
    });
    expect(state.players.p1.hand).toContain("spell.magic_arrow");
    expect(state.players.p1.discard).not.toContain("spell.magic_arrow");
  });
});
