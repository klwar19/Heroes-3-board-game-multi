import { describe, expect, it } from "vitest";
import {
  applyAction,
  createAdventureGameState,
  createInitialGameState,
  getLegalActions,
  spellLimitFor,
  unitMatchesSpecialtyName,
  NEUTRAL_DECK_IDS
} from "./index";
import { adventureCards } from "@/data/cards/adventure";
import type { ActiveEffectModifier, GameAction, GameEvent, GameState, UnitId } from "./state";

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function attackBonusBy(state: GameState, attackerId: UnitId): number | undefined {
  return [...state.eventLog]
    .reverse()
    .find(
      (event): event is Extract<GameEvent, { type: "ATTACK_ROLLED" }> =>
        event.type === "ATTACK_ROLLED" && event.attackerId === attackerId
    )?.attackBonus;
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

function findPlay(state: GameState, cardId: string, optionIndex?: number, unitId?: UnitId) {
  return getLegalActions(state, "p1").find(
    (legal) =>
      legal.action.type === "PLAY_CARD" &&
      legal.action.cardId === cardId &&
      (optionIndex === undefined || legal.action.optionIndex === optionIndex) &&
      (unitId === undefined || (legal.action.target?.type === "unit" && legal.action.target.unitId === unitId))
  );
}

// ---------------------------------------------------------------------------
// Every hero specialty — including the former Tower hold-outs (Solmyr's Chain
// Lightning damage chain + deck dig, Cyra's initiative-conditional Haste, and
// Torosar's Ballista grants/activation) — is now implemented. No specialty may
// ship "needs-implementation" any more, so none can silently regress.
// ---------------------------------------------------------------------------

describe("all hero specialties are implemented", () => {
  it("has no remaining not-implemented hero specialty", () => {
    const specialties = Object.values(adventureCards).filter((card) => card.kind === "hero-specialty");
    expect(specialties.length).toBeGreaterThan(0);
    for (const card of specialties) {
      expect(card.implementationStatus, `${card.id} should be implemented`).toBe("implemented");
      expect(card.tags, `${card.id} still flagged needs-implementation`).not.toContain("needs-implementation");
    }
  });
});

// ---------------------------------------------------------------------------
// Signature-unit matching now also covers two-unit descriptors (Gelu).
// ---------------------------------------------------------------------------

describe("unitMatchesSpecialtyName multi-unit descriptors", () => {
  it("matches either unit in an \"X and Y\" descriptor", () => {
    expect(unitMatchesSpecialtyName("Elves", "Elves and Sharpshooters")).toBe(true);
    expect(unitMatchesSpecialtyName("Sharpshooters", "Elves and Sharpshooters")).toBe(true);
    expect(unitMatchesSpecialtyName("Griffins", "Elves and Sharpshooters")).toBe(false);
    // The single-unit and Dragons-family behaviour is unchanged.
    expect(unitMatchesSpecialtyName("Crusaders", "Crusaders")).toBe(true);
    expect(unitMatchesSpecialtyName("Black Dragons", "a Dragons unit")).toBe(true);
    expect(unitMatchesSpecialtyName("Dragon Flies", "a Dragons unit")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Might heroes IV (HP) and VI (initiative), doubled for the signature unit.
// ---------------------------------------------------------------------------

describe("Catherine / Tamika / Mutare upper specialties (HP IV, initiative VI)", () => {
  it("Catherine IV adds +1 HP, doubled (+2) on a Crusaders unit", () => {
    const state = createInitialGameState("cath-iv");
    state.players.p1.hand = ["specialty.catherine.4"];
    const crusaders = state.combat!.units.unit_p1_crusaders;
    crusaders.name = "Crusaders";
    const before = crusaders.maxHealth;

    const play = findPlay(state, "specialty.catherine.4", undefined, "unit_p1_crusaders");
    expect(play, "Catherine IV should be playable on a friendly unit").toBeTruthy();
    const next = applyOk(state, play!.action);
    expect(next.combat!.units.unit_p1_crusaders.maxHealth).toBe(before + 2);
  });

  it("Catherine IV adds only +1 HP on a non-Crusaders unit", () => {
    const state = createInitialGameState("cath-iv-b");
    state.players.p1.hand = ["specialty.catherine.4"];
    const before = state.combat!.units.unit_p1_griffins.maxHealth;
    const play = findPlay(state, "specialty.catherine.4", undefined, "unit_p1_griffins");
    const next = applyOk(state, play!.action);
    expect(next.combat!.units.unit_p1_griffins.maxHealth).toBe(before + 1);
  });

  it("Catherine VI adds a +1 initiative buff, doubled (+2) on a Crusaders unit", () => {
    const state = createInitialGameState("cath-vi");
    state.players.p1.hand = ["specialty.catherine.6"];
    state.combat!.units.unit_p1_crusaders.name = "Crusaders";
    const play = findPlay(state, "specialty.catherine.6", undefined, "unit_p1_crusaders");
    expect(play, "Catherine VI should be playable").toBeTruthy();
    const next = applyOk(state, play!.action);
    expect(modifierTotalOn(next, "unit_p1_crusaders", "INITIATIVE_BONUS")).toBe(2);
  });

  it("Mutare IV doubles the +1 HP for the whole Dragons family", () => {
    const state = createInitialGameState("mut-iv");
    state.players.p1.hand = ["specialty.mutare.4"];
    const griffins = state.combat!.units.unit_p1_griffins;
    griffins.name = "Gold Dragons";
    const before = griffins.maxHealth;
    const play = findPlay(state, "specialty.mutare.4", undefined, "unit_p1_griffins");
    const next = applyOk(state, play!.action);
    expect(next.combat!.units.unit_p1_griffins.maxHealth).toBe(before + 2);
  });
});

// ---------------------------------------------------------------------------
// Gelu I (now doubles for Elves AND Sharpshooters) and VI (+2 initiative).
// ---------------------------------------------------------------------------

describe("Gelu's Sharpshooters specialty", () => {
  function attackWith(seed: string, cardId: string, attackerName: string): GameState {
    const state = createInitialGameState(seed);
    state.players.p1.hand = [cardId];
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
  }

  it("I doubles the +1 attack for BOTH Elves and Sharpshooters, not other units", () => {
    for (const name of ["Elves", "Sharpshooters"]) {
      const doubled = applyOk(attackWith(`gelu-${name}`, "specialty.gelu.1", name), {
        type: "PLAY_REACTIONS",
        playerId: "p1",
        plays: [{ cardId: "specialty.gelu.1", optionIndex: 0 }]
      });
      expect(attackBonusBy(doubled, "unit_p1_griffins"), `${name} should double`).toBe(2);
    }

    const single = applyOk(attackWith("gelu-griffins", "specialty.gelu.1", "Griffins"), {
      type: "PLAY_REACTIONS",
      playerId: "p1",
      plays: [{ cardId: "specialty.gelu.1", optionIndex: 0 }]
    });
    expect(attackBonusBy(single, "unit_p1_griffins")).toBe(1);
  });

  it("VI grants +2 initiative, doubled to +4 for Elves/Sharpshooters", () => {
    const state = createInitialGameState("gelu-vi");
    state.players.p1.hand = ["specialty.gelu.6"];
    state.combat!.units.unit_p1_crusaders.name = "Sharpshooters";
    const play = findPlay(state, "specialty.gelu.6", undefined, "unit_p1_crusaders");
    expect(play, "Gelu VI should be playable").toBeTruthy();
    const next = applyOk(state, play!.action);
    expect(modifierTotalOn(next, "unit_p1_crusaders", "INITIATIVE_BONUS")).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// Gelu IV: discard a Pack of Elves to fetch the Sharpshooters Neutral card.
// ---------------------------------------------------------------------------

describe("Gelu IV — trade a Pack of Elves for the Sharpshooters", () => {
  function geluMap(): GameState {
    const state = createAdventureGameState({
      seed: "gelu-iv-map",
      rollFirstPlayer: false,
      players: [
        { id: "p1", name: "Gelu", factionId: "rampart", heroDefId: "gelu" },
        { id: "p2", name: "Catherine", factionId: "castle", heroDefId: "catherine" }
      ]
    });
  for (const _pl of Object.values(state.players)) { _pl.canMulligan = false; _pl.needsHandRefresh = false; }
    state.activePlayerId = "p1";
    state.pendingChoice = null;
    state.reactionWindow = null;
    state.players.p1.hand = ["specialty.gelu.4"];
    return state;
  }

  it("converts a Pack of Elves into the unique Sharpshooters card", () => {
    let state = geluMap();
    state.players.p1.army = [{ id: "army_elves", unitDefId: "rampart.elves", side: "pack" }];
    const silver = state.decks[NEUTRAL_DECK_IDS.silver];
    expect(silver.drawPile).toContain("neutral.sharpshooters");

    const convert = findPlay(state, "specialty.gelu.4", 0);
    expect(convert, "the Elves→Sharpshooters trade should be offered").toBeTruthy();
    state = applyOk(state, convert!.action);

    expect(state.players.p1.army.some((unit) => unit.unitDefId === "rampart.elves")).toBe(false);
    expect(state.players.p1.army.some((unit) => unit.unitDefId === "neutral.sharpshooters")).toBe(true);
    expect(state.decks[NEUTRAL_DECK_IDS.silver].drawPile).not.toContain("neutral.sharpshooters");
  });

  it("does not offer the trade without a Pack of Elves, but always offers the draw", () => {
    const state = geluMap();
    state.players.p1.army = [{ id: "army_centaurs", unitDefId: "rampart.centaurs", side: "pack" }];
    expect(findPlay(state, "specialty.gelu.4", 0)).toBeFalsy();
    expect(findPlay(state, "specialty.gelu.4", 1), "the draw option is always available").toBeTruthy();
  });

  it("does not offer the trade when a Sharpshooters is already owned (unique)", () => {
    const state = geluMap();
    state.players.p1.army = [
      { id: "army_elves", unitDefId: "rampart.elves", side: "pack" },
      { id: "army_ss", unitDefId: "neutral.sharpshooters", side: "neutral" }
    ];
    expect(findPlay(state, "specialty.gelu.4", 0)).toBeFalsy();
  });

  it("the draw option draws a card", () => {
    let state = geluMap();
    state.players.p1.hand = ["specialty.gelu.4"];
    state.players.p1.deck = ["stat.attack"];
    const draw = findPlay(state, "specialty.gelu.4", 1);
    state = applyOk(state, draw!.action);
    expect(state.players.p1.hand).toContain("stat.attack");
  });
});

// ---------------------------------------------------------------------------
// Rashka IV/VI — Fire Shield (melee attacker takes 1, or 2 for an Efreet at VI).
// ---------------------------------------------------------------------------

describe("Rashka's Demoniac Fire Shield specialty", () => {
  it("IV places a 1-damage Fire Shield on the chosen unit", () => {
    const state = createInitialGameState("rashka-iv");
    state.players.p1.hand = ["specialty.rashka.4"];
    const play = findPlay(state, "specialty.rashka.4", undefined, "unit_p1_crusaders");
    expect(play, "Rashka IV should be playable on a friendly unit").toBeTruthy();
    const next = applyOk(state, play!.action);
    expect(modifierTotalOn(next, "unit_p1_crusaders", "FIRE_SHIELD")).toBe(1);
  });

  it("VI doubles the Fire Shield to 2 on an Efreet (and stays 1 otherwise)", () => {
    const efreet = createInitialGameState("rashka-vi-efreet");
    efreet.players.p1.hand = ["specialty.rashka.6"];
    efreet.combat!.units.unit_p1_crusaders.name = "Efreet";
    const onEfreet = applyOk(efreet, findPlay(efreet, "specialty.rashka.6", undefined, "unit_p1_crusaders")!.action);
    expect(modifierTotalOn(onEfreet, "unit_p1_crusaders", "FIRE_SHIELD")).toBe(2);

    const other = createInitialGameState("rashka-vi-other");
    other.players.p1.hand = ["specialty.rashka.6"];
    const onGriffins = applyOk(other, findPlay(other, "specialty.rashka.6", undefined, "unit_p1_griffins")!.action);
    expect(modifierTotalOn(onGriffins, "unit_p1_griffins", "FIRE_SHIELD")).toBe(1);
  });

  it("the Fire Shield burns a melee attacker after it strikes the shielded unit", () => {
    const state = createInitialGameState("rashka-burn");
    state.players.p1.hand = ["specialty.rashka.4"];
    state.players.p2.hand = [];
    // Shield p1's griffins, then let an adjacent enemy melee it.
    state.combat!.units.unit_p1_griffins.position = 9;
    state.combat!.units.unit_p2_skeletons.position = 13;
    const shielded = applyOk(state, findPlay(state, "specialty.rashka.4", undefined, "unit_p1_griffins")!.action);

    shielded.activePlayerId = "p2";
    shielded.combat!.activeUnitId = "unit_p2_skeletons";
    shielded.combat!.dice.scriptedRolls = [0];
    shielded.combat!.dice.rollCount = 0;
    const burned = applyOk(shielded, {
      type: "ATTACK_UNIT",
      playerId: "p2",
      attackerId: "unit_p2_skeletons",
      defenderId: "unit_p1_griffins"
    });
    // The shield deals its 1 damage to the melee attacker as "effect" damage
    // (separate from any retaliation, which is "attack" damage).
    const fireShieldHit = burned.eventLog.some(
      (event) =>
        event.type === "DAMAGE_ASSIGNED" &&
        event.target.type === "unit" &&
        event.target.unitId === "unit_p2_skeletons" &&
        event.damageKind === "effect" &&
        event.amount === 1
    );
    expect(fireShieldHit).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Rion IV/VI — remove damage or paralysis, then draw (VI: draw 2, discard 1).
// ---------------------------------------------------------------------------

describe("Rion's Battlefield Medic IV/VI", () => {
  it("IV option A removes 1 damage and draws 1", () => {
    const state = createInitialGameState("rion-iv-a");
    state.players.p1.hand = ["specialty.rion.4"];
    state.players.p1.deck = ["stat.attack"];
    state.combat!.units.unit_p1_crusaders.damage = 2;
    const play = findPlay(state, "specialty.rion.4", 0, "unit_p1_crusaders");
    const next = applyOk(state, play!.action);
    expect(next.combat!.units.unit_p1_crusaders.damage).toBe(1);
    expect(next.players.p1.hand).toEqual(["stat.attack"]);
  });

  it("IV option B clears a Paralysis token and draws 1", () => {
    const state = createInitialGameState("rion-iv-b");
    state.players.p1.hand = ["specialty.rion.4"];
    state.players.p1.deck = ["stat.attack"];
    state.combat!.units.unit_p1_crusaders.tokens = [
      { id: "tok1", kind: "paralysis", amount: 0, sourceName: "test" }
    ];
    const play = findPlay(state, "specialty.rion.4", 1, "unit_p1_crusaders");
    expect(play, "the paralysis-removal option should be offered").toBeTruthy();
    const next = applyOk(state, play!.action);
    expect(next.combat!.units.unit_p1_crusaders.tokens ?? []).toHaveLength(0);
    expect(next.players.p1.hand).toEqual(["stat.attack"]);
  });

  it("VI heals up to 2, draws 2, and only THEN discards 1 — a net +1 card", () => {
    // Printed order: "… then draw 2 cards AND discard 1 card from your hand."
    // The discard is a post-draw rider, so the drawn cards are candidates.
    const state = createInitialGameState("rion-vi");
    state.players.p1.hand = ["specialty.rion.6", "stat.power"];
    state.players.p1.deck = ["stat.attack", "stat.defense"];
    state.combat!.units.unit_p1_crusaders.damage = 2;

    const play = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "PLAY_CARD" &&
        legal.action.cardId === "specialty.rion.6" &&
        legal.action.optionIndex === 0 &&
        legal.action.target?.type === "unit" &&
        legal.action.target.unitId === "unit_p1_crusaders"
    );
    expect(play, "Rion VI heal option should be playable").toBeTruthy();
    // No `costCardIds`: the discard is no longer an up-front cost.
    const drawn = applyOk(state, play!.action);
    expect(drawn.combat!.units.unit_p1_crusaders.damage).toBe(0);
    // Both deck cards are in hand BEFORE anything is pitched.
    expect([...drawn.players.p1.hand].sort()).toEqual(["stat.attack", "stat.defense", "stat.power"]);
    const pick = drawn.pendingChoice;
    expect(pick?.type === "OPTION_CHOICE" ? pick.context : null, "the discard picker is open").toBe(
      "hand-discard"
    );
    const discardAction = getLegalActions(drawn, "p1").find(
      (legal) => legal.action.type === "CHOOSE_OPTION" && legal.label === "Discard Attack"
    );
    expect(discardAction, "a just-DRAWN card can pay the discard").toBeTruthy();
    const next = applyOk(drawn, discardAction!.action);
    expect([...next.players.p1.hand].sort()).toEqual(["stat.defense", "stat.power"]);
    expect(next.players.p1.discard).toContain("stat.attack");
  });

  it("VI IS playable with nothing else in hand — the cards it draws pay the discard", () => {
    // CONTROL of the fix: under the old up-front `cost.discardCards` this play
    // was withheld entirely (nothing to pitch), so the specialty was dead as the
    // last card in hand.
    const state = createInitialGameState("rion-vi-nocost");
    state.players.p1.hand = ["specialty.rion.6"];
    state.players.p1.deck = ["stat.attack", "stat.defense"];
    state.combat!.units.unit_p1_crusaders.damage = 2;
    const play = findPlay(state, "specialty.rion.6", 0, "unit_p1_crusaders" as UnitId);
    expect(play, "offered as the only card in hand").toBeTruthy();
    const next = applyOk(state, play!.action);
    expect(next.combat!.units.unit_p1_crusaders.damage, "healed 2").toBe(0);
    expect([...next.players.p1.hand].sort(), "drew 2 with an otherwise empty hand").toEqual([
      "stat.attack",
      "stat.defense"
    ]);
  });
});

// ---------------------------------------------------------------------------
// Gem IV (remove 2 damage) and VI (double the First Aid Tent this combat).
// ---------------------------------------------------------------------------

describe("Gem's First Aid IV/VI", () => {
  it("IV removes 2 damage from one of your units", () => {
    const state = createInitialGameState("gem-iv");
    state.players.p1.hand = ["specialty.gem.4"];
    state.combat!.units.unit_p1_crusaders.damage = 3;
    const play = findPlay(state, "specialty.gem.4", undefined, "unit_p1_crusaders");
    expect(play, "Gem IV should be playable on a wounded friendly").toBeTruthy();
    const next = applyOk(state, play!.action);
    expect(next.combat!.units.unit_p1_crusaders.damage).toBe(1);
  });

  it("VI doubles the in-play First Aid Tent's per-round heal for the combat", () => {
    let state = createInitialGameState("gem-vi");
    state.players.p1.hand = ["war_machine.first_aid_tent"];
    state.players.p2.hand = [];
    // Put the Tent into play (its combat heal effect appears).
    state = applyOk(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "war_machine.first_aid_tent",
      target: { type: "none" }
    });
    const healAmount = () =>
      state.activeEffects
        .flatMap((effect) => effect.modifiers)
        .filter((modifier) => modifier.type === "HEAL_ONCE_PER_COMBAT_ROUND")
        .map((modifier) => (modifier.type === "HEAL_ONCE_PER_COMBAT_ROUND" ? modifier.amount : 0));
    expect(healAmount()).toEqual([1]);

    state.players.p1.hand = ["specialty.gem.6"];
    const play = findPlay(state, "specialty.gem.6", 0);
    expect(play, "Gem VI should be offered with a Tent in play").toBeTruthy();
    state = applyOk(state, play!.action);
    expect(healAmount()).toEqual([2]);
  });

  it("VI is not offered without a First Aid Tent in play", () => {
    const state = createInitialGameState("gem-vi-none");
    state.players.p1.hand = ["specialty.gem.6"];
    expect(findPlay(state, "specialty.gem.6", 0)).toBeFalsy();
  });
});

// ---------------------------------------------------------------------------
// Xyron IV (discard 1: area blast) and VI (area blast at no cost).
// ---------------------------------------------------------------------------

describe("Xyron's Inferno IV/VI", () => {
  it("IV discards 1 card and damages the centre plus every adjacent unit", () => {
    const state = createInitialGameState("xyron-iv");
    state.players.p1.hand = ["specialty.xyron.4", "stat.attack"];
    state.players.p2.hand = [];
    state.combat!.units.unit_p1_crusaders.position = 10;
    // Xyron's Inferno now selects a SPACE — centre it on the vampires' space.
    const vampires = state.combat!.units.unit_p2_vampires;
    const blast = applyOk(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "specialty.xyron.4",
      mode: "basic",
      optionIndex: 0,
      target: { type: "space", position: vampires.position },
      costCardIds: ["stat.attack"]
    });
    expect(blast.combat!.units.unit_p2_vampires.damage).toBe(1);
    expect(blast.combat!.units.unit_p2_skeletons.damage).toBe(1);
    expect(blast.combat!.units.unit_p1_crusaders.damage).toBe(1);
    expect(blast.players.p1.hand).toEqual([]);
  });

  it("IV cannot be played without a card to discard", () => {
    const state = createInitialGameState("xyron-iv-nocost");
    state.players.p1.hand = ["specialty.xyron.4"];
    expect(findPlay(state, "specialty.xyron.4", 0)).toBeFalsy();
  });

  it("VI blasts at no cost", () => {
    const state = createInitialGameState("xyron-vi");
    state.players.p1.hand = ["specialty.xyron.6"];
    state.players.p2.hand = [];
    // Centre the no-cost blast on the vampires' space (any-space target).
    const vampires = state.combat!.units.unit_p2_vampires;
    const play = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "PLAY_CARD" &&
        legal.action.cardId === "specialty.xyron.6" &&
        legal.action.optionIndex === 0 &&
        legal.action.target?.type === "space" &&
        legal.action.target.position === vampires.position
    );
    expect(play, "Xyron VI should be castable on the vampires' space").toBeTruthy();
    const blast = applyOk(state, play!.action);
    expect(blast.combat!.units.unit_p2_vampires.damage).toBe(1);
    expect(blast.combat!.units.unit_p2_skeletons.damage).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Zydar IV (next spell ignores the limit) and VI (ongoing draw-after-cast).
// ---------------------------------------------------------------------------

describe("Zydar's Sorcery IV/VI", () => {
  it("IV raises the spell limit by 1 for the round (the next spell is 'free')", () => {
    const state = createInitialGameState("zydar-iv");
    state.players.p1.hand = ["specialty.zydar.4"];
    expect(spellLimitFor(state, state.players.p1)).toBe(1);
    const play = findPlay(state, "specialty.zydar.4", 0);
    expect(play, "Zydar IV's limit option should be playable in combat").toBeTruthy();
    const next = applyOk(state, play!.action);
    expect(spellLimitFor(next, next.players.p1)).toBe(2);
  });

  it("VI draws a card after each spell cast while it is active", () => {
    let state = createInitialGameState("zydar-vi");
    state.players.p1.hand = ["specialty.zydar.6", "spell.magic_arrow"];
    state.players.p1.deck = ["stat.attack"];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";

    const setup = findPlay(state, "specialty.zydar.6", 0);
    expect(setup, "Zydar VI's ongoing option should be playable in combat").toBeTruthy();
    state = applyOk(state, setup!.action);
    expect(state.players.p1.deck).toEqual(["stat.attack"]);

    state = applyOk(state, {
      type: "CAST_SPELL",
      playerId: "p1",
      cardId: "spell.magic_arrow",
      target: { type: "unit", unitId: "unit_p2_skeletons" }
    });
    // The cast fired the ongoing draw: stat.attack moved from deck to hand.
    expect(state.players.p1.hand).toContain("stat.attack");
    expect(state.players.p1.deck).toEqual([]);
  });

  it("VI offers a +2 Power reaction while you cast a spell", () => {
    const state = createInitialGameState("zydar-vi-power");
    state.players.p1.hand = ["specialty.zydar.6", "spell.magic_arrow"];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";
    const cast = applyOk(state, {
      type: "CAST_SPELL",
      playerId: "p1",
      cardId: "spell.magic_arrow",
      target: { type: "unit", unitId: "unit_p2_skeletons" }
    });
    const powerPlay = (cast.reactionWindow?.legalReactions.p1 ?? []).some(
      (legal) =>
        legal.action.type === "PLAY_REACTION" &&
        legal.action.cardId === "specialty.zydar.6" &&
        legal.action.optionIndex === 1
    );
    expect(powerPlay).toBe(true);
  });
});
