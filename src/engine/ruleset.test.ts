import { describe, expect, it } from "vitest";
import { coreUnitDefinitions } from "@/data/factions/units";
import { changeMorale } from "./adventure";
import {
  applyAction,
  applyUnitSideRules,
  artifactDeckAccess,
  canDrawExpertSpells,
  createAdventureGameState,
  createInitialGameState,
  estatesGold,
  findEvent,
  getLegalActions,
  getRuleset,
  wisdomGoldDiscount,
  wisdomSearchCount,
  NEUTRAL_PLAYER_ID,
  type GameAction,
  type GameEvent,
  type GameState
} from "./index";

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toHaveLength(0);
  return result.state;
}

function makeBinhGame(): GameState {
  return createAdventureGameState({ seed: "ruleset-seed", difficulty: "normal", ruleset: "binh", rotateStartTiles: false });
}

function makeLegacyGame(): GameState {
  return createAdventureGameState({ seed: "ruleset-seed", difficulty: "normal", ruleset: "legacy", rotateStartTiles: false });
}

describe("ruleset numbers", () => {
  it("keeps legacy at the printed values and applies the BINH tweaks", () => {
    expect(estatesGold("legacy", "basic")).toBe(3);
    expect(estatesGold("legacy", "expert")).toBe(6);
    expect(estatesGold("binh", "basic")).toBe(2);
    expect(estatesGold("binh", "expert")).toBe(4);

    expect(wisdomGoldDiscount("legacy", "basic")).toBe(2);
    expect(wisdomGoldDiscount("legacy", "expert")).toBe(2);
    expect(wisdomGoldDiscount("binh", "basic")).toBe(2);
    expect(wisdomGoldDiscount("binh", "expert")).toBe(3);
    expect(wisdomSearchCount("basic")).toBe(3);
    expect(wisdomSearchCount("expert")).toBe(4);
  });

  it("applies the BINH unit stat tweaks and leaves legacy printed", () => {
    const fewGriffins = coreUnitDefinitions["castle.griffins"].few!;
    const packGriffins = coreUnitDefinitions["castle.griffins"].pack!;
    const packMarksmen = coreUnitDefinitions["castle.marksmen"].pack!;
    const packCerberi = coreUnitDefinitions["inferno.cerberi"].pack!;

    expect(applyUnitSideRules("legacy", "castle.griffins", "few", fewGriffins).attack).toBe(2);
    expect(applyUnitSideRules("binh", "castle.griffins", "few", fewGriffins).attack).toBe(3);

    expect(applyUnitSideRules("legacy", "castle.griffins", "pack", packGriffins).defense).toBe(0);
    expect(applyUnitSideRules("binh", "castle.griffins", "pack", packGriffins).defense).toBe(1);

    expect(applyUnitSideRules("legacy", "castle.marksmen", "pack", packMarksmen).health).toBe(2);
    expect(applyUnitSideRules("binh", "castle.marksmen", "pack", packMarksmen).health).toBe(3);

    // Cerberi follow the printed card in BOTH modes (1 flat damage to one
    // adjacent enemy) — no BINH attack-all swap any more.
    expect(packCerberi.abilities).toContain("cerberi-second-head");
    expect(applyUnitSideRules("legacy", "inferno.cerberi", "pack", packCerberi).abilities).toContain(
      "cerberi-second-head"
    );
    const binhCerberi = applyUnitSideRules("binh", "inferno.cerberi", "pack", packCerberi);
    expect(binhCerberi.abilities).toContain("cerberi-second-head");
    expect(binhCerberi.abilities).not.toContain("cerberi-attack-all");
    expect(binhCerberi.abilities).toContain("ignores-retaliation");
  });
});

describe("split decks (BINH) vs single decks (legacy)", () => {
  it("builds Basic/Expert spell decks and three artifact decks in BINH mode", () => {
    const state = makeBinhGame();
    expect(getRuleset(state)).toBe("binh");
    expect(state.decks.spells).toBeDefined();
    expect(state.decks["spells-expert"]).toBeDefined();
    expect(state.decks["artifacts-minor"]).toBeDefined();
    expect(state.decks["artifacts-major"]).toBeDefined();
    expect(state.decks["artifacts-relic"]).toBeDefined();
    expect(state.decks.artifacts).toBeUndefined();
  });

  it("keeps single Spell and Artifact decks in legacy mode", () => {
    const state = makeLegacyGame();
    expect(getRuleset(state)).toBe("legacy");
    expect(state.decks.spells).toBeDefined();
    expect(state.decks.artifacts).toBeDefined();
    expect(state.decks["spells-expert"]).toBeUndefined();
    expect(state.decks["artifacts-minor"]).toBeUndefined();
  });

  it("gates the Expert spell deck by level 4+ OR a revealed IV–V tile, with a key-card bypass", () => {
    const state = makeBinhGame();
    const hero = state.heroes.hero_p1;
    state.players.p1.hand = [];
    state.players.p1.deck = [];
    state.players.p1.discard = [];

    // Below level 4, no deep tile revealed, no key card: only the Basic deck.
    hero.level = 1;
    expect(canDrawExpertSpells(state, "p1", hero)).toBe(false);

    // A key card (Eagle Eye / Wisdom / a Basic elemental Magic) unlocks the
    // Expert deck at any level / map state.
    state.players.p1.discard = ["ability.eagle_eye"];
    expect(canDrawExpertSpells(state, "p1", hero)).toBe(true);
    state.players.p1.discard = [];

    // Level 4 unlocks it on its own, even on a still-shallow map.
    hero.level = 4;
    expect(canDrawExpertSpells(state, "p1", hero)).toBe(true);

    // Back below level 4: a revealed IV–V tile is the OTHER half of the OR — it
    // unlocks the Expert deck even at level 1.
    hero.level = 1;
    expect(canDrawExpertSpells(state, "p1", hero)).toBe(false);
    const nearTile = Object.values(state.adventure!.tiles).find((tile) => tile.backLabel === "Ⅳ–Ⅴ");
    expect(nearTile).toBeDefined();
    nearTile!.faceDown = false;
    expect(canDrawExpertSpells(state, "p1", hero)).toBe(true);
  });

  it("unlocks Major/Relic artifact decks by hero position or level + Blacksmith", () => {
    const state = makeBinhGame();
    const hero = state.heroes.hero_p1;

    // On the starting tile with no artifact source: minor only.
    expect(artifactDeckAccess(state, "p1", hero, false)).toEqual({ minor: true, major: false, relic: false });

    // Level 4 with a Blacksmith: major opens; level 6: relic too.
    hero.level = 4;
    expect(artifactDeckAccess(state, "p1", hero, true)).toEqual({ minor: true, major: true, relic: false });
    hero.level = 6;
    expect(artifactDeckAccess(state, "p1", hero, true)).toEqual({ minor: true, major: true, relic: true });
  });
});

describe("morale by the book", () => {
  it("walks the printed morale table, resetting to neutral on a double negative", () => {
    const state = makeLegacyGame();
    const player = state.players.p1;

    // neutral + negative → negative
    changeMorale(state, "p1", -1);
    expect(player.morale).toBe(-1);
    expect(player.discardHandAtTurnEnd ?? false).toBe(false);

    // negative + negative → NEUTRAL, and the hand is discarded at turn end.
    changeMorale(state, "p1", -1);
    expect(player.morale).toBe(0);
    expect(player.discardHandAtTurnEnd).toBe(true);

    // negative + positive → neutral; positive caps at one token.
    player.discardHandAtTurnEnd = false;
    changeMorale(state, "p1", -1);
    changeMorale(state, "p1", 1);
    expect(player.morale).toBe(0);
    changeMorale(state, "p1", 1);
    changeMorale(state, "p1", 1);
    expect(player.morale).toBe(1);

    // Necropolis ignores morale entirely.
    const necro = state.players.p2;
    expect(necro.factionId).toBe("necropolis");
    changeMorale(state, "p2", -1);
    expect(necro.morale).toBe(0);
  });
});

// Exercises the SECOND_ATTACK_ALL_ADJACENT_TO_SELF engine mechanism directly
// (no boxed unit uses it now that Cerberi follow the printed card).
describe("attack-all-adjacent mechanism", () => {
  function cerberiState(): GameState {
    const state = createInitialGameState();
    const cerberi = state.combat!.units.unit_p1_griffins;
    cerberi.name = "Cerberi";
    cerberi.cardName = "Pack of Cerberi";
    cerberi.type = "ground";
    cerberi.abilities = ["ignores-retaliation", "cerberi-attack-all"];
    cerberi.attack = 3;
    cerberi.position = 9;

    // Two extra enemies adjacent to the Cerberi besides the main target.
    state.combat!.units.unit_p2_vampires.position = 5; // main target, adjacent
    state.combat!.units.unit_p2_skeletons.position = 10; // adjacent to cerberi
    state.combat!.units.unit_p2_dread_knights.position = 13; // adjacent to cerberi

    state.combat!.activeUnitId = cerberi.id;
    state.activePlayerId = "p1";
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    // Deterministic rolls for the original attack + two follow-ups.
    state.combat!.dice.scriptedRolls = [0, 0, 0, 0];
    return state;
  }

  it("queues a full separate attack at base attack 3 against every other adjacent enemy", () => {
    let state = cerberiState();
    state = apply(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_griffins",
      defenderId: "unit_p2_vampires"
    });

    // Reaction windows may open for each declared attack; pass them all.
    for (let guard = 0; guard < 20 && state.reactionWindow; guard += 1) {
      state = apply(state, {
        type: "PASS_REACTION",
        playerId: state.reactionWindow.priorityPlayerId
      });
    }

    const declared = state.eventLog.filter(
      (event): event is Extract<GameEvent, { type: "UNIT_ATTACK_DECLARED" }> =>
        event.type === "UNIT_ATTACK_DECLARED"
    );
    const followUps = declared.filter((event) => event.abilityAttack?.abilityId === "cerberi-attack-all");

    // One follow-up per other adjacent enemy, each at the printed attack 3.
    expect(followUps).toHaveLength(2);
    expect(new Set(followUps.map((event) => event.defenderId))).toEqual(
      new Set(["unit_p2_skeletons", "unit_p2_dread_knights"])
    );
    for (const followUp of followUps) {
      expect(followUp.abilityAttack?.baseAttack).toBe(3);
    }

    // Each follow-up dealt real attack damage (attack 3 + roll 0 vs printed
    // defense), not a flat 1.
    const rolled = state.eventLog.filter(
      (event): event is Extract<GameEvent, { type: "ATTACK_ROLLED" }> => event.type === "ATTACK_ROLLED"
    );
    expect(rolled.length).toBeGreaterThanOrEqual(3);
  });
});

describe("Wisdom at the Mage Guild", () => {
  it("reduces the purchase price and upgrades the search size", () => {
    const state = makeBinhGame();
    const player = state.players.p1;
    const town = Object.values(state.towns).find((candidate) => candidate.controllerId === "p1")!;

    town.buildings.push("castle.mage_guild");
    player.resources.gold = 10;
    player.townTokens.spellBook = true;
    player.hand = ["ability.wisdom"];
    player.limits.expertUses = 1;

    // Castle guild costs 6; expert Wisdom in BINH reduces it by 3.
    const bought = apply(state, {
      type: "SPELL_BOOK_ACTION",
      playerId: "p1",
      wisdom: { cardId: "ability.wisdom", mode: "expert" }
    });

    expect(bought.players.p1.resources.gold).toBe(7);
    expect(bought.players.p1.discard).toContain("ability.wisdom");
    expect(bought.players.p1.combatStats.expertUsesSpentThisRound).toBe(1);
    expect(findEvent(bought, "SPELLS_PURCHASED")).toMatchObject({ cost: { gold: 3 } });

    // Holding Wisdom also unlocks the Expert spell deck (BINH key card), so
    // the purchase first asks which spell deck to search.
    const deckPick = bought.pendingChoice;
    expect(deckPick?.type).toBe("OPTION_CHOICE");
    if (deckPick?.type !== "OPTION_CHOICE" || deckPick.context !== "deck-pick") {
      throw new Error("Expected the spell deck pick.");
    }
    expect(deckPick.deckPick?.deckIds).toEqual(["spells", "spells-expert"]);

    const searched = apply(bought, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: deckPick.id,
      optionIndex: 0
    });

    // The purchase search reveals 4 cards (Wisdom expert = Search 4).
    const choice = searched.pendingChoice;
    expect(choice?.type).toBe("DECK_SEARCH");
    if (choice?.type === "DECK_SEARCH") {
      expect(choice.revealedCardIds.length).toBe(4);
      expect(choice.deckId).toBe("spells");
    }
  });
});

describe("spell instants into attacks", () => {
  it("plays Bloodlust into your attack window, scaling with Power and counting the spell limit", () => {
    const state = createInitialGameState();
    const attacker = state.combat!.units.unit_p1_griffins;
    attacker.type = "ground";
    state.combat!.units.unit_p2_vampires.position = 5;
    attacker.position = 9;
    state.combat!.activeUnitId = attacker.id;
    state.activePlayerId = "p1";
    state.players.p1.hand = ["spell.bloodlust", "stat.power"];
    state.players.p2.hand = [];
    state.combat!.dice.scriptedRolls = [0, 0];

    let next = apply(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: attacker.id,
      defenderId: "unit_p2_vampires"
    });

    expect(next.reactionWindow).not.toBeNull();

    // Power + Bloodlust in one declaration: power 1 → +2 attack. With no
    // other instants in any hand the window closes and the attack resolves.
    next = apply(next, {
      type: "PLAY_REACTIONS",
      playerId: "p1",
      plays: [
        { cardId: "stat.power", mode: "basic" },
        { cardId: "spell.bloodlust", mode: "basic" }
      ]
    });

    expect(next.players.p1.combatStats.spellsCastThisRound).toBe(1);
    const rolled = next.eventLog.find(
      (event): event is Extract<GameEvent, { type: "ATTACK_ROLLED" }> => event.type === "ATTACK_ROLLED"
    );
    expect(rolled).toBeDefined();
    expect(rolled?.attackBonus).toBe(2);
  });
});

describe("neutral seat untouched", () => {
  it("keeps the neutral player id stable for the AI", () => {
    expect(NEUTRAL_PLAYER_ID).toBe("neutrals");
    const binh = makeBinhGame();
    expect(getLegalActions(binh, NEUTRAL_PLAYER_ID)).toEqual([]);
  });
});
