import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { applyAction, createAdventureGameState, createInitialGameState, getLegalActions } from "./index";
import { getSchoolPowerBonus } from "./active-effects";
import { coreFactionDefinitions, coreHeroDefinitions } from "@/data/factions/core";
import type { FactionId } from "@/data/factions/types";
import { adventureCards } from "@/data/cards/adventure";
import { spellCards } from "@/data/cards/spells";
import type { ActiveEffectModifier, GameAction, GameEvent, GameState, TargetRef, UnitId, VisitStep } from "./state";

// ---------------------------------------------------------------------------
// Additional heroes, batch 2 — shipped with their real printed art and fully
// engine-wired I/IV/VI specialties. Every test fails if the specialty's engine
// wiring is removed (mutation-checked).
//
//   Lord Haart (Castle)  — Estates: gain 2/3/5 gold (map play)
//   Jeddite (Dungeon)    — Mysterious Warlock: dig-keep Spells+Specialties (I/VI),
//                          lethal save costing Power 0/1/2 (IV)
//   Tazar (Fortress)     — War Hero: +2 defense reaction (I), +1 defense buff (IV),
//                          remove/discard to draw the top Artifact (VI)
//   Adrienne (Fortress)  — Fire Magic: +1/+2 Power to Fire-school casts (I/VI),
//                          Search(3) + reshuffle the discard (IV)
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

function defenseBonusOn(state: GameState, defenderId: UnitId): number | undefined {
  return [...state.eventLog]
    .reverse()
    .find(
      (event): event is Extract<GameEvent, { type: "ATTACK_ROLLED" }> =>
        event.type === "ATTACK_ROLLED" && event.defenderId === defenderId
    )?.defenseBonus;
}

/** A two-player adventure game with p1 on the given hero, ready for a map play. */
function adventureState(seed: string, heroDefId: string, factionId: FactionId): GameState {
  const game = createAdventureGameState({
    seed,
    rollFirstPlayer: false,
    players: [
      { id: "p1", name: "Hero", factionId, heroDefId },
      { id: "p2", name: "Foe", factionId: "castle", heroDefId: "catherine" }
    ]
  });
  const state = game.players.p1.needsHandRefresh
    ? applyOk(game, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] })
    : game;
  state.activePlayerId = "p1";
  state.pendingChoice = null;
  state.reactionWindow = null;
  return state;
}

// ===========================================================================
// Roster + art wiring (CLAUDE.md rule #2: the data must state what runs)
// ===========================================================================

describe("batch-2 heroes are registered in their factions with art and implemented specialties", () => {
  const roster: Array<[string, string]> = [
    ["lord_haart", "castle"],
    ["jeddite", "dungeon"],
    ["tazar", "fortress"],
    ["adrienne", "fortress"]
  ];

  it("each hero sits in its faction roster, carries portrait + board scan, and has 3 implemented specialties", () => {
    for (const [heroId, factionId] of roster) {
      const hero = coreHeroDefinitions[heroId];
      expect(hero, `${heroId} should be defined`).toBeTruthy();
      expect(coreFactionDefinitions[factionId].heroes, `${factionId} roster`).toContain(heroId);
      expect(hero.portrait, `${heroId} portrait`).toContain(`/assets/hero_boardart-${heroId}.webp`);
      expect(hero.boardScan, `${heroId} board scan`).toContain(`/assets/heroes-${factionId}-`);
      // The portrait + board scan webp files are actually on disk.
      expect(existsSync(assetPath(hero.portrait!)), `${heroId} portrait file`).toBe(true);
      expect(existsSync(assetPath(hero.boardScan!)), `${heroId} board scan file`).toBe(true);
      for (const level of [1, 4, 6] as const) {
        const cardId = hero.specialtyCardIds[level];
        const card = adventureCards[cardId];
        expect(card, `${cardId} should exist`).toBeTruthy();
        expect(card.implementationStatus, `${cardId} implemented`).toBe("implemented");
        expect(card.tags, `${cardId} not flagged needs-implementation`).not.toContain("needs-implementation");
        expect(card.assets?.cardImage, `${cardId} art`).toContain(`/assets/hero_specialties-${heroId}-${level}.webp`);
        expect(existsSync(assetPath(card.assets!.cardImage!)), `${cardId} art file`).toBe(true);
      }
    }
  });
});

// ===========================================================================
// Lord Haart (Castle) — Estates gold
// ===========================================================================

describe("Lord Haart's Estates specialty", () => {
  const levels: Array<[1 | 4 | 6, number]> = [
    [1, 2],
    [4, 3],
    [6, 5]
  ];

  for (const [level, gold] of levels) {
    it(`${level} gains ${gold} gold as a map play`, () => {
      const state = adventureState(`haart-${level}`, "lord_haart", "castle");
      state.players.p1.hand = [`specialty.lord_haart.${level}`];
      const before = state.players.p1.resources.gold;
      const play = findPlay(state, `specialty.lord_haart.${level}`, 0);
      expect(play, `Estates ${level} should be a map play`).toBeTruthy();
      const after = applyOk(state, play!.action);
      expect(after.players.p1.resources.gold).toBe(before + gold);
    });
  }

  it("is map-only — not offered during combat", () => {
    const combat = createInitialGameState("haart-combat");
    combat.players.p1.hand = ["specialty.lord_haart.6"];
    expect(findPlay(combat, "specialty.lord_haart.6")).toBeFalsy();
  });
});

// ===========================================================================
// Start-of-turn draw — using a card forfeits it (no use-then-refill exploit).
// The player must draw/discard FIRST, then use cards: using any card on the
// quiet map turn spends the start-of-turn draw so a freed hand slot can never be
// drawn back up to the hand limit. Movement does NOT spend it (it changes no
// hand size), so moving before drawing stays allowed — the UI warns about it.
// ===========================================================================

describe("Start-of-turn draw is forfeited by using a card", () => {
  it("playing a map card spends the draw, so the freed slot cannot be drawn back up", () => {
    const state = adventureState("draw-forfeit-play", "lord_haart", "castle");
    state.players.p1.hand = ["specialty.lord_haart.1", "stat.attack"];
    state.players.p1.canMulligan = true;

    // Before any card use the draw is offered.
    expect(getLegalActions(state, "p1").some((l) => l.action.type === "REFRESH_HAND")).toBe(true);

    const play = findPlay(state, "specialty.lord_haart.1", 0);
    expect(play, "Estates should be a map play").toBeTruthy();
    const after = applyOk(state, play!.action);

    // Using the card spent the start-of-turn draw…
    expect(after.players.p1.canMulligan).toBe(false);
    // …so REFRESH_HAND is no longer offered and a forced draw is rejected.
    expect(getLegalActions(after, "p1").some((l) => l.action.type === "REFRESH_HAND")).toBe(false);
    const forced = applyAction(after, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
    expect(forced.errors.length, "drawing after a card use must be rejected").toBeGreaterThan(0);
  });

  it("moving before drawing also forfeits the draw (why the UI warns on an early move)", () => {
    const state = adventureState("draw-forfeit-move", "lord_haart", "castle");
    state.players.p1.canMulligan = true;

    const move = getLegalActions(state, "p1").find((l) => l.action.type === "MOVE_HERO");
    expect(move, "a hero move should be available at turn start").toBeTruthy();
    const after = applyOk(state, move!.action);

    // Beginning the turn with a map action spends the start-of-turn draw, so the
    // player can no longer draw — hence the UI warns before an undrawn move.
    expect(after.players.p1.canMulligan).toBe(false);
    expect(getLegalActions(after, "p1").some((l) => l.action.type === "REFRESH_HAND")).toBe(false);
  });
});

// ===========================================================================
// Jeddite (Dungeon) — Mysterious Warlock
// ===========================================================================

describe("Jeddite's Mysterious Warlock dig (I/VI)", () => {
  it("I digs the top 3 of your deck, keeps the Spell + Specialty, discards the rest", () => {
    const state = adventureState("jeddite-i", "jeddite", "dungeon");
    state.players.p1.hand = ["specialty.jeddite.1"];
    // Top of the deck is the LAST element (pop order): magic_arrow, gem.1, stat.attack.
    state.players.p1.deck = ["stat.attack", "specialty.gem.1", "spell.magic_arrow"];
    state.players.p1.discard = [];
    const after = applyOk(state, findPlay(state, "specialty.jeddite.1", 0)!.action);
    expect(after.players.p1.hand).toContain("spell.magic_arrow");
    expect(after.players.p1.hand).toContain("specialty.gem.1");
    expect(after.players.p1.discard).toContain("stat.attack");
    expect(after.players.p1.hand).not.toContain("stat.attack");
    expect(after.players.p1.deck).toEqual([]); // all 3 dug
  });

  it("VI digs the top 4, keeping every Spell + Specialty", () => {
    const state = adventureState("jeddite-vi", "jeddite", "dungeon");
    state.players.p1.hand = ["specialty.jeddite.6"];
    state.players.p1.deck = ["stat.attack", "stat.defense", "specialty.gem.1", "spell.magic_arrow"];
    state.players.p1.discard = [];
    const after = applyOk(state, findPlay(state, "specialty.jeddite.6", 0)!.action);
    expect(after.players.p1.hand).toEqual(expect.arrayContaining(["spell.magic_arrow", "specialty.gem.1"]));
    expect(after.players.p1.discard).toEqual(expect.arrayContaining(["stat.attack", "stat.defense"]));
  });

  it("only digs as deep as the deck allows (no crash on a short deck)", () => {
    const state = adventureState("jeddite-short", "jeddite", "dungeon");
    state.players.p1.hand = ["specialty.jeddite.1"];
    state.players.p1.deck = ["spell.magic_arrow"];
    state.players.p1.discard = [];
    const after = applyOk(state, findPlay(state, "specialty.jeddite.1", 0)!.action);
    expect(after.players.p1.hand).toContain("spell.magic_arrow");
    expect(after.players.p1.deck).toEqual([]);
  });
});

describe("Jeddite's Mysterious Warlock IV (lethal save, Power 0/1/2)", () => {
  function lethalSetup(defenderGrade: "bronze" | "silver" | "gold", p1Hand: string[]): GameState {
    const state = createInitialGameState("jeddite-iv");
    state.players.p1.hand = p1Hand;
    state.players.p2.hand = [];
    const defender = state.combat!.units.unit_p1_griffins;
    defender.grade = defenderGrade;
    defender.position = 9;
    defender.defense = 0;
    defender.damage = defender.maxHealth - 1; // one hit from death
    const attacker = state.combat!.units.unit_p2_skeletons;
    attacker.attack = 5; // clearly lethal
    attacker.position = 13;
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

  function save(state: GameState) {
    return (state.reactionWindow?.legalReactions.p1 ?? []).find(
      (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === "specialty.jeddite.4"
    );
  }

  it("saves a bronze unit for free (Power 0)", () => {
    const declared = lethalSetup("bronze", ["specialty.jeddite.4"]);
    expect(declared.reactionWindow?.triggerEvent.type).toBe("UNIT_LETHAL_HIT");
    const reaction = save(declared);
    expect(reaction, "the free bronze save should be offered").toBeTruthy();
    const saved = applyOk(declared, reaction!.action);
    const griffins = saved.combat!.units.unit_p1_griffins;
    expect(griffins.damage).toBe(griffins.maxHealth - 1); // unscathed, not killed
  });

  it("cannot save a gold unit without 2 Power, but can with 2 Power-source cards", () => {
    const noPower = lethalSetup("gold", ["specialty.jeddite.4"]);
    expect(save(noPower), "no save without the 2 Power cost").toBeFalsy();

    const withPower = lethalSetup("gold", ["specialty.jeddite.4", "stat.power", "stat.power"]);
    const reaction = save(withPower);
    expect(reaction, "the gold save should be offered once 2 Power can be paid").toBeTruthy();
    const saved = applyOk(withPower, { ...reaction!.action, costCardIds: ["stat.power", "stat.power"] } as GameAction);
    const griffins = saved.combat!.units.unit_p1_griffins;
    expect(griffins.damage).toBe(griffins.maxHealth - 1);
    // The 2 Power-source cards were spent paying the save.
    expect(saved.players.p1.hand).not.toContain("stat.power");
  });
});

// ===========================================================================
// Tazar (Fortress) — War Hero
// ===========================================================================

describe("Tazar's War Hero specialty", () => {
  it("I adds +2 defense to the attacked unit as a reaction", () => {
    const state = createInitialGameState("tazar-i");
    state.players.p1.hand = ["specialty.tazar.1"];
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
      (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === "specialty.tazar.1"
    );
    expect(reaction, "War Hero I should be offered to the defender").toBeTruthy();
    const after = applyOk(declared, reaction!.action);
    expect(defenseBonusOn(after, "unit_p1_griffins")).toBe(2);
  });

  it("IV gives a chosen unit +1 defense (a DEFENSE_BONUS modifier) for the combat", () => {
    const state = createInitialGameState("tazar-iv");
    state.players.p1.hand = ["specialty.tazar.4"];
    const after = applyOk(state, findPlay(state, "specialty.tazar.4", undefined, "unit_p1_griffins")!.action);
    expect(modifierTotalOn(after, "unit_p1_griffins", "DEFENSE_BONUS")).toBe(1);
  });

  it("VI removes 1 card, then draws the top of an Artifact deck of your choice (Minor/Major/Relic)", () => {
    const state = adventureState("tazar-vi-remove", "tazar", "fortress");
    state.players.p1.hand = ["specialty.tazar.6", "stat.attack"];
    state.players.p1.discard = [];
    const played = applyOk(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "specialty.tazar.6",
      mode: "basic",
      optionIndex: 0,
      target: { type: "none" },
      costCardIds: ["stat.attack"]
    });
    // Remove-1 cost is paid (removed from the game, not discarded), and a deck choice opens.
    expect(played.players.p1.hand).not.toContain("stat.attack");
    expect(played.players.p1.discard).not.toContain("stat.attack");
    const choice = played.pendingChoice;
    expect(choice?.type === "OPTION_CHOICE" && choice.context).toBe("artifact-deck-pick");
    const deckIds = choice?.type === "OPTION_CHOICE" ? (choice.artifactDeckPick?.deckIds ?? []) : [];
    // BINH default: all three split Artifact decks are offered.
    expect(deckIds).toEqual(expect.arrayContaining(["artifacts-minor", "artifacts-major", "artifacts-relic"]));

    // Draw from the RELIC deck specifically — proves it is not locked to Minor.
    const relicIndex = deckIds.indexOf("artifacts-relic");
    const relicTop = played.decks["artifacts-relic"].drawPile.at(-1)!;
    const before = played.decks["artifacts-relic"].drawPile.length;
    const drawn = applyOk(played, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: (choice as { id: string }).id,
      optionIndex: relicIndex
    });
    expect(drawn.players.p1.hand).toContain(relicTop);
    expect(drawn.decks["artifacts-relic"].drawPile.length).toBe(before - 1);
    expect(drawn.pendingChoice).toBeNull();
  });

  it("VI's discard-3 option pays 3 cards, then draws the chosen deck's top", () => {
    const state = adventureState("tazar-vi-discard", "tazar", "fortress");
    state.players.p1.hand = ["specialty.tazar.6", "stat.attack", "stat.defense", "stat.power"];
    state.players.p1.discard = [];
    const played = applyOk(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "specialty.tazar.6",
      mode: "basic",
      optionIndex: 1,
      target: { type: "none" },
      costCardIds: ["stat.attack", "stat.defense", "stat.power"]
    });
    expect(played.players.p1.discard).toEqual(expect.arrayContaining(["stat.attack", "stat.defense", "stat.power"]));
    const choice = played.pendingChoice;
    const deckIds = choice?.type === "OPTION_CHOICE" ? (choice.artifactDeckPick?.deckIds ?? []) : [];
    const minorIndex = deckIds.indexOf("artifacts-minor");
    const minorTop = played.decks["artifacts-minor"].drawPile.at(-1)!;
    const drawn = applyOk(played, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: (choice as { id: string }).id,
      optionIndex: minorIndex
    });
    expect(drawn.players.p1.hand).toContain(minorTop);
  });
});

// ===========================================================================
// Adrienne (Fortress) — Fire Magic
// ===========================================================================

describe("Adrienne's Fire Magic specialty", () => {
  function castResolvedPower(state: GameState, cardId: string, target: TargetRef): number | undefined {
    const cast = applyOk(state, { type: "CAST_SPELL", playerId: "p1", cardId, target });
    const resolved = passAllReactions(cast);
    return [...resolved.eventLog]
      .reverse()
      .find(
        (event): event is Extract<GameEvent, { type: "SPELL_CAST_RESOLVED" }> =>
          event.type === "SPELL_CAST_RESOLVED" && event.spellCardId === cardId
      )?.power;
  }

  function fireMagicCombat(level: 1 | 6): GameState {
    const state = createInitialGameState(`adrienne-${level}`);
    state.players.p1.hand = [`specialty.adrienne.${level}`];
    state.players.p2.hand = [];
    return applyOk(state, findPlay(state, `specialty.adrienne.${level}`)!.action);
  }

  it("I creates a player-scoped Fire +1 Power effect; VI a +2 effect", () => {
    const one = fireMagicCombat(1);
    expect(getSchoolPowerBonus(one, "p1", spellCards["spell.blind"])).toBe(1);
    const six = fireMagicCombat(6);
    expect(getSchoolPowerBonus(six, "p1", spellCards["spell.blind"])).toBe(2);
  });

  it("only boosts the caster's Fire-school spells, never another school or another player", () => {
    const one = fireMagicCombat(1);
    expect(getSchoolPowerBonus(one, "p1", spellCards["spell.frost_ring"])).toBe(0); // water
    expect(getSchoolPowerBonus(one, "p1", spellCards["spell.weakness"])).toBe(0); // water
    expect(getSchoolPowerBonus(one, "p2", spellCards["spell.blind"])).toBe(0); // opponent
  });

  it("a Fire spell actually resolves at the boosted Power (Blind cast at base 0 -> Power 1)", () => {
    const state = fireMagicCombat(1);
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";
    state.combat!.units.unit_p1_griffins.activatedThisRound = false;
    state.players.p1.hand = ["spell.blind"];
    state.players.p2.hand = [];
    state.combat!.units.unit_p2_skeletons.grade = "bronze";
    const power = castResolvedPower(state, "spell.blind", {
      type: "unit",
      unitId: "unit_p2_skeletons"
    });
    expect(power).toBe(1);
  });

  it("does NOT boost a Water spell cast under the same effect (Frost Ring stays Power 0)", () => {
    const state = fireMagicCombat(6);
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";
    state.combat!.units.unit_p1_griffins.activatedThisRound = false;
    state.players.p1.hand = ["spell.frost_ring"];
    state.players.p2.hand = [];
    // Cast on an empty corner space with no adjacent units, so the ring is a clean no-op.
    for (const unit of Object.values(state.combat!.units)) {
      unit.position = 15 - 0; // park everyone bottom-right cluster away from space 0's ring
    }
    state.combat!.units.unit_p1_griffins.position = 19;
    const power = castResolvedPower(state, "spell.frost_ring", { type: "space", position: 0 });
    expect(power).toBe(0);
  });

  // The Fire-magic bonus also reaches the instant attack-window Fire spells
  // (Curse, Slayer, Frenzy), whose Power is pooled on the attack stack — not just
  // the activation casts above.
  function p1FireInstant(seed: string, level: 1 | 6 | null, instantCardId: string, prep: (s: GameState) => void): GameState {
    let state = createInitialGameState(seed);
    state.players.p1.hand = level ? [`specialty.adrienne.${level}`, instantCardId] : [instantCardId];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";
    state.combat!.units.unit_p1_griffins.activatedThisRound = false;
    state.combat!.units.unit_p1_griffins.abilities = [];
    state.combat!.units.unit_p1_griffins.position = 9;
    state.combat!.dice.scriptedRolls = [0, 0, 0, 0, 0, 0, 0, 0];
    state.combat!.dice.rollCount = 0;
    prep(state); // prep may override the scripted dice (e.g. Slayer needs "+1" faces)
    if (level) {
      state = applyOk(state, findPlay(state, `specialty.adrienne.${level}`)!.action);
    }
    const declared = applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_griffins",
      defenderId: "unit_p2_skeletons"
    });
    const reaction = (declared.reactionWindow?.legalReactions.p1 ?? []).find(
      (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === instantCardId
    );
    expect(reaction, `${instantCardId} should be castable on the declared attack`).toBeTruthy();
    return passAllReactions(applyOk(declared, reaction!.action));
  }

  it("buffs the instant Curse: under Fire Magic I it resolves at +1 Power (-2 Defense, not -1)", () => {
    const prep = (s: GameState) => {
      s.combat!.units.unit_p2_skeletons.position = 13;
      s.combat!.units.unit_p2_skeletons.maxHealth = 40;
    };
    expect(defenseBonusOn(p1FireInstant("curse-plain", null, "spell.curse", prep), "unit_p2_skeletons")).toBe(-1);
    expect(defenseBonusOn(p1FireInstant("curse-fire", 1, "spell.curse", prep), "unit_p2_skeletons")).toBe(-2);
  });

  it("buffs the instant Slayer: under Fire Magic VI (+2 Power) it rolls more dice, dealing more damage", () => {
    const prep = (s: GameState) => {
      const def = s.combat!.units.unit_p2_skeletons;
      def.position = 13;
      def.grade = "gold";
      def.defense = 0;
      def.maxHealth = 40;
      def.abilities = [];
      s.combat!.units.unit_p1_griffins.attack = 1;
      // Every Slayer die reads "+1", so its bonus equals the number of dice it
      // rolls: 2 at base Power, 4 once Fire Magic VI lifts it to Power 2.
      s.combat!.dice.scriptedRolls = Array.from({ length: 12 }, () => 1);
      s.combat!.dice.rollCount = 0;
    };
    const plain = p1FireInstant("slayer-plain", null, "spell.slayer", prep).combat!.units.unit_p2_skeletons.damage;
    const boosted = p1FireInstant("slayer-fire", 6, "spell.slayer", prep).combat!.units.unit_p2_skeletons.damage;
    expect(boosted).toBeGreaterThan(plain);
  });

  it("buffs the instant Frenzy: under Fire Magic VI (+2 Power) it pierces a silver unit's Defense", () => {
    const prep = (s: GameState) => {
      const def = s.combat!.units.unit_p2_skeletons;
      def.position = 13;
      def.grade = "silver";
      def.defense = 12; // far above the attacker's Attack: no damage unless pierced
      def.maxHealth = 40;
      def.abilities = [];
      s.combat!.units.unit_p1_griffins.attack = 3;
    };
    // Power 0 → bronze pierce only: the silver defender keeps its Defense (0 damage).
    expect(p1FireInstant("frenzy-plain", null, "spell.frenzy", prep).combat!.units.unit_p2_skeletons.damage).toBe(0);
    // Fire Magic VI lifts the cast to Power 2 → silver pierce → Defense ignored.
    expect(
      p1FireInstant("frenzy-fire", 6, "spell.frenzy", prep).combat!.units.unit_p2_skeletons.damage
    ).toBeGreaterThan(0);
  });
});

// ===========================================================================
// Adrienne IV — Search(3) then reshuffle the discard into the deck
// ===========================================================================

describe("Adrienne's Fire Magic IV (Search 3, then reshuffle discard into deck)", () => {
  it("takes one of the top 3, then shuffles the whole discard pile back into the deck", () => {
    const state = adventureState("adrienne-iv", "adrienne", "fortress");
    state.players.p1.hand = ["specialty.adrienne.4"];
    state.players.p1.deck = ["stat.power", "stat.attack", "stat.defense"]; // top = last = stat.defense
    state.players.p1.discard = ["spell.magic_arrow"];

    const play = findPlay(state, "specialty.adrienne.4", 0);
    expect(play, "Fire Magic IV should be a map play with cards in the deck").toBeTruthy();
    let next = applyOk(state, play!.action);

    expect(next.pendingChoice?.type).toBe("OPTION_CHOICE");
    // Keep the first revealed card (stat.defense); the other two head to discard,
    // then the whole discard pile shuffles back into the deck.
    next = applyOk(next, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: next.pendingChoice!.id,
      optionIndex: 0
    });

    expect(next.players.p1.hand).toContain("stat.defense");
    expect(next.players.p1.discard).toEqual([]); // reshuffled away
    // The two unpicked search cards + the prior discard now live in the deck.
    expect(next.players.p1.deck).toEqual(
      expect.arrayContaining(["spell.magic_arrow", "stat.attack", "stat.power"])
    );
    expect(next.players.p1.deck).not.toContain("stat.defense");
  });

  it("with 0/1 cards revealed it still reshuffles the discard into the deck (no choice)", () => {
    const state = adventureState("adrienne-iv-one", "adrienne", "fortress");
    state.players.p1.hand = ["specialty.adrienne.4"];
    state.players.p1.deck = ["spell.magic_arrow"]; // single reveal -> auto-kept
    state.players.p1.discard = ["stat.attack", "stat.defense"];
    const next = applyOk(state, findPlay(state, "specialty.adrienne.4", 0)!.action);
    expect(next.pendingChoice).toBeNull();
    expect(next.players.p1.hand).toContain("spell.magic_arrow");
    expect(next.players.p1.discard).toEqual([]);
    expect(next.players.p1.deck).toEqual(expect.arrayContaining(["stat.attack", "stat.defense"]));
  });
});

// ===========================================================================
// Vidomina (Necropolis) — Necromancy specialist
// ===========================================================================

/** Reinforce-choice option labels queued by a Necromancy reinforce. */
function reinforceLabels(state: GameState): string[] {
  const labels: string[] = [];
  const collect = (steps: VisitStep[] | undefined) => {
    for (const step of steps ?? []) {
      if (step.type === "CHOOSE_ONE") {
        labels.push(...step.options.map((option) => option.label));
      }
    }
  };
  for (const reward of state.adventure?.rewardQueue ?? []) {
    if (reward.kind === "visit-steps") {
      collect(reward.steps);
    }
  }
  collect(state.adventure?.pendingVisit?.steps);
  return labels;
}

describe("Vidomina's Necromancy specialty", () => {
  it("IV places the Horde of Skeletons (A3 D1 H2 I6) on a Pack of Skeletons (TRANSFORM_UNIT)", () => {
    const state = adventureState("vidomina-iv", "vidomina", "necropolis");
    state.players.p1.hand = ["specialty.vidomina.4"];
    state.players.p1.army = [{ id: "army_skel", unitDefId: "necropolis.skeletons", side: "pack" }];
    const play = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "specialty.vidomina.4"
    );
    expect(play, "Vidomina IV should be placeable on a Pack of Skeletons").toBeTruthy();
    const after = applyOk(state, play!.action);
    const horde = after.players.p1.army.find((unit) => unit.id === "army_skel")?.transforms?.at(-1);
    expect(horde).toMatchObject({ name: "Horde of Skeletons", attack: 3, defense: 1, health: 2, initiative: 6 });
  });

  it("IV cannot be placed on a Few of Skeletons (the printed card targets the Pack only)", () => {
    const state = adventureState("vidomina-iv-few", "vidomina", "necropolis");
    state.players.p1.hand = ["specialty.vidomina.4"];
    state.players.p1.army = [{ id: "army_skel", unitDefId: "necropolis.skeletons", side: "few" }];
    const play = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "specialty.vidomina.4"
    );
    expect(play).toBeFalsy();
  });

  function playReinforce(level: 1 | 6): GameState {
    const state = adventureState(`vidomina-${level}`, "vidomina", "necropolis");
    state.players.p1.hand = [`specialty.vidomina.${level}`];
    state.players.p1.necromancyWindow = true;
    state.adventure!.pendingNecromancy = { playerId: "p1" };
    state.players.p1.resources.gold = 60;
    // A bronze, a silver and a gold Few unit to reinforce.
    state.players.p1.army = [
      { id: "a_skel", unitDefId: "necropolis.skeletons", side: "few" },
      { id: "a_vamp", unitDefId: "necropolis.vampires", side: "few" },
      { id: "a_dk", unitDefId: "necropolis.dread_knights", side: "few" }
    ];
    const play = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === `specialty.vidomina.${level}`
    );
    expect(play, `Vidomina ${level} should be offered in the after-combat window`).toBeTruthy();
    const after = applyOk(state, play!.action);
    expect(after.players.p1.necromancyWindow).toBe(false); // window consumed
    return after;
  }

  it("I reinforces only a bronze or silver unit (half gold); the gold unit is excluded", () => {
    const labels = reinforceLabels(playReinforce(1));
    expect(labels.some((label) => /Skeletons/.test(label))).toBe(true); // bronze
    expect(labels.some((label) => /Vampires/.test(label))).toBe(true); // silver
    expect(labels.some((label) => /Dread Knights/.test(label))).toBe(false); // gold excluded
  });

  it("VI reinforces ANY unit (half gold) — the gold unit is offered, with no expert crown", () => {
    const labels = reinforceLabels(playReinforce(6));
    expect(labels.some((label) => /Dread Knights/.test(label))).toBe(true); // gold offered at VI
  });

  it("is Necropolis-gated to the after-combat window — never offered with the window closed", () => {
    const state = adventureState("vidomina-window", "vidomina", "necropolis");
    state.players.p1.hand = ["specialty.vidomina.1"];
    state.players.p1.necromancyWindow = false;
    const offered = getLegalActions(state, "p1").some(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "specialty.vidomina.1"
    );
    expect(offered).toBe(false);
  });
});
