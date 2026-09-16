import { describe, expect, it } from "vitest";
import { applyAction, createAdventureGameState, createInitialGameState, getLegalActions } from "./index";
import {
  expireEffectsForCombatEnd,
  expireEffectsForCombatRoundEnd,
  getActiveAttackBonus
} from "./active-effects";
import { getTownOfPlayer, NEUTRAL_DECK_IDS } from "./adventure";
import { gainRunes, getRuneSummary, grantStartingRunes, seedRunesForCombat } from "./runes";
import { coreHeroDefinitions } from "@/data/factions/core";
import { coreUnitDefinitions } from "@/data/factions/units";
import { adventureCards } from "@/data/cards/adventure";
import { cardLibrary } from "@/data/cards/library";
import type { FactionId } from "@/data/factions/types";
import type { CardOptionDefinition, GameAction, GameState, PlayerId, UnitId } from "./state";

/**
 * Bulwark heroes. Kriv and Eikthurn exercise the combat Rune pool; Dhuin and
 * Eikthurn also have bespoke specialties rather than the generic unit-specialist
 * trio. Glacius reuses Adelaide's Frost-Ring area damage.
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

/** Pass priority (declining any reroll) until `playerId` holds it or the window closes. */
function passUntil(state: GameState, playerId: PlayerId): GameState {
  let current = state;
  let safety = 60;
  while (current.reactionWindow && current.reactionWindow.priorityPlayerId !== playerId && safety > 0) {
    safety -= 1;
    current = applyOk(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
  }
  return current;
}

/** Pass reactions / decline rerolls until the attack settles. */
function settleReactions(state: GameState): GameState {
  let current = state;
  let safety = 60;
  while (current.reactionWindow || current.pendingChoice?.type === "ATTACK_DIE_REROLL") {
    if (safety-- <= 0) {
      break;
    }
    if (current.reactionWindow) {
      current = applyOk(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
      continue;
    }
    const choice = current.pendingChoice;
    if (choice?.type === "ATTACK_DIE_REROLL") {
      current = applyOk(current, {
        type: "CHOOSE_PENDING_ROLL",
        playerId: choice.playerId,
        choiceId: choice.id,
        candidateIndex: choice.candidates.length - 1
      });
    }
  }
  return current;
}

function findPlay(state: GameState, cardId: string, optionIndex: number) {
  return getLegalActions(state, "p1").find(
    (legal) =>
      legal.action.type === "PLAY_CARD" &&
      legal.action.cardId === cardId &&
      legal.action.optionIndex === optionIndex
  );
}

/** A PLAY_CARD legal action for `cardId` targeting a specific unit. */
function findUnitPlay(state: GameState, cardId: string, unitId: UnitId) {
  return getLegalActions(state, "p1").find(
    (legal) =>
      legal.action.type === "PLAY_CARD" &&
      legal.action.cardId === cardId &&
      legal.action.target?.type === "unit" &&
      legal.action.target.unitId === unitId
  );
}

/** Combat sandbox with p1 holding Kriv's level-I specialty; faction varies. */
function krivCombat(seed: string, faction: FactionId): GameState {
  const state = createInitialGameState(seed);
  state.players.p1.factionId = faction;
  state.players.p1.hand = ["specialty.kriv.1"];
  state.players.p2.hand = [];
  state.activePlayerId = "p1";
  state.combat!.activeUnitId = "unit_p1_griffins";
  return state;
}

describe("Bulwark hero — Kriv's rune-synergy specialty", () => {
  it("kriv.1 banks 1 Rune AND draws 1 card for a Bulwark caster (the bundled level-I play)", () => {
    const state = krivCombat("kriv-banks", "bulwark");
    state.players.p1.deck = ["spell.magic_arrow", "spell.magic_arrow"];
    const deckBefore = state.players.p1.deck.length;
    const play = findPlay(state, "specialty.kriv.1", 0);
    expect(play, "the gain-Rune-and-draw option should be offered to a Bulwark caster in combat").toBeTruthy();
    const after = applyOk(state, play!.action);
    expect(after.combat!.runes?.p1?.count).toBe(1); // gained the Rune…
    expect(after.players.p1.deck.length).toBe(deckBefore - 1); // …AND drew the bundled card
  });

  it("offers the rune option ONLY to a Bulwark caster (control: castle)", () => {
    const state = krivCombat("kriv-control", "castle");
    expect(findPlay(state, "specialty.kriv.1", 0)).toBeFalsy();
    // And the rune count never moves for a non-Bulwark player.
    expect(state.combat!.runes?.p1).toBeUndefined();
  });

  it("kriv.6's draw-2 fallback moves 2 cards (deck → hand) in combat", () => {
    const state = createInitialGameState("kriv6-draw");
    state.players.p1.factionId = "bulwark";
    state.players.p1.hand = ["specialty.kriv.6"];
    state.players.p1.deck = ["spell.magic_arrow", "spell.magic_arrow", "spell.magic_arrow"];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_marksmen";
    const deckBefore = state.players.p1.deck.length;
    const effect = adventureCards["specialty.kriv.6"].effect as { options: { effect: { type: string } }[] };
    const drawIndex = effect.options.findIndex((option) => option.effect.type === "DRAW_CARDS");
    const play = findPlay(state, "specialty.kriv.6", drawIndex);
    expect(play, "kriv.6 draw-2 option should be playable as a combat instant").toBeTruthy();
    const after = applyOk(state, play!.action);
    expect(after.players.p1.deck.length).toBe(deckBefore - 2);
    expect(after.players.p1.hand.length).toBe(2);
  });
});

describe("Bulwark hero — Kriv reacts to an enemy attack (receives the buff earlier)", () => {
  /** The PLAY_REACTION legal action for Kriv `cardId` in the open reaction window. */
  function findReaction(state: GameState, cardId: string) {
    return getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === cardId
    );
  }

  /**
   * p1 (Bulwark, Altar built) defends an enemy melee strike while sitting one Rune
   * short of the Level-3 Defense threshold (10). When `react` is true, p1 answers
   * the declared attack with Kriv I — banking the 10th Rune mid-window so the
   * army-wide +1 Defense turns on BEFORE the strike resolves. Returns the damage
   * the defender takes (the observable: 6 − 2 = 4 without the buff, 6 − 3 = 3 with).
   */
  function defenderDamage(react: boolean): number {
    const state = createInitialGameState(`kriv-react-${react}`);
    state.players.p1.factionId = "bulwark";
    state.towns.town_p1.factionId = "bulwark";
    state.towns.town_p1.buildings.push("bulwark.sieidi", "bulwark.altar"); // cap 3 → Level 3 reachable
    state.players.p1.hand = ["specialty.kriv.1"];
    state.players.p1.deck = ["spell.magic_arrow", "spell.magic_arrow"]; // for the bundled draw
    state.players.p2.hand = [];

    const attacker = state.combat!.units.unit_p2_skeletons;
    const defender = state.combat!.units.unit_p1_crusaders;
    attacker.abilities = [];
    defender.abilities = [];
    attacker.attack = 6;
    attacker.position = 9;
    defender.position = 13; // adjacent → a melee strike
    defender.defense = 2;
    attacker.maxHealth = 40;
    defender.maxHealth = 40;
    defender.damage = 0;
    attacker.activatedThisRound = false;
    state.combat!.dice.scriptedRolls = [0, 0, 0, 0, 0, 0];
    state.combat!.dice.rollCount = 0;

    // Earn p1 up to 11 Runes (Level 2 with the Altar: +1 Attack, +3 Initiative — no
    // Defense yet, since Level 3 now sits at 12). The reaction banks the 12th BEFORE
    // the strike resolves, crossing into Level 3 (+1 Defense); the defender's
    // retaliation then banks a 13th afterwards.
    gainRunes(state, "p1", 11);
    expect(getRuneSummary(state, "p1")).toMatchObject({ count: 11, level: 2 });

    state.activePlayerId = "p2";
    state.combat!.activeUnitId = "unit_p2_skeletons";
    const declared = applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p2",
      attackerId: "unit_p2_skeletons",
      defenderId: "unit_p1_crusaders"
    });

    let current = passUntil(declared, "p1");
    if (react) {
      const play = findReaction(current, "specialty.kriv.1");
      expect(play, "Kriv I should be offered as a reaction to the enemy attack").toBeTruthy();
      current = applyOk(current, play!.action);
      // The buff is live the instant the reaction resolves — before the strike does.
      expect(getRuneSummary(current, "p1")).toMatchObject({ count: 13, level: 3 });
    }
    current = settleReactions(current);
    return current.combat!.units.unit_p1_crusaders.damage;
  }

  it("the threshold Rune banked in reaction softens the very attack that triggered it (4 → 3)", () => {
    expect(defenderDamage(false), "control: no reaction → 11 Runes → Level 2 → full 6 − 2 = 4").toBe(4);
    expect(defenderDamage(true), "react → 12 Runes at the strike → Level 3 +1 Defense → 6 − 3 = 3").toBe(3);
  });

  it("the rune-gain reaction is offered ONLY to a Bulwark reactor (control: castle defender)", () => {
    const state = createInitialGameState("kriv-react-control");
    state.players.p1.factionId = "castle"; // not Bulwark → no rune benefit, no offer
    state.players.p1.hand = ["specialty.kriv.1"];
    state.players.p2.hand = [];
    const attacker = state.combat!.units.unit_p2_skeletons;
    const defender = state.combat!.units.unit_p1_crusaders;
    attacker.abilities = [];
    defender.abilities = [];
    attacker.position = 9;
    defender.position = 13; // adjacent → a melee strike
    attacker.maxHealth = 40;
    defender.maxHealth = 40;
    attacker.activatedThisRound = false;
    state.combat!.dice.scriptedRolls = [0, 0, 0, 0, 0, 0];
    state.combat!.dice.rollCount = 0;
    state.activePlayerId = "p2";
    state.combat!.activeUnitId = "unit_p2_skeletons";
    const declared = applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p2",
      attackerId: "unit_p2_skeletons",
      defenderId: "unit_p1_crusaders"
    });
    const onP1 = passUntil(declared, "p1");
    // The printed RUNE reaction is Bulwark-only and stays withheld. Since the
    // 2026-08-08 ruling ("instant abilities … when attack and when defend, all
    // of them") the card's trigger-free "…and draw 1 card" rider does join the
    // window as a flagged DRAW-ONLY play — that join fizzles the rune half, so
    // the faction gate is intact; the assertion is refined, not dropped.
    const kriv = getLegalActions(onP1, "p1").filter(
      (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === "specialty.kriv.1"
    );
    expect(
      kriv.filter((legal) => legal.action.type === "PLAY_REACTION" && !legal.action.drawOnly),
      "a non-Bulwark holder is never offered the real rune reaction"
    ).toEqual([]);
  });
});

describe("Bulwark hero — Kriv's Rune-Empowered head-start (starting Runes)", () => {
  /** Adventure-map sandbox with p1 = `faction`, holding `hand`, on its own turn. */
  function krivMap(seed: string, faction: FactionId, hand: string[]): GameState {
    const state = createAdventureGameState({
      seed,
      rollFirstPlayer: false,
      players: [
        { id: "p1", name: "Kriv", factionId: "bulwark", heroDefId: "kriv" },
        { id: "p2", name: "Sandro", factionId: "necropolis", heroDefId: "sandro" }
      ]
    });
    for (const pl of Object.values(state.players)) {
      pl.canMulligan = false;
      pl.needsHandRefresh = false;
    }
    state.activePlayerId = "p1";
    state.players.p1.factionId = faction; // control flips this to a non-Bulwark faction
    state.players.p1.hand = hand;
    return state;
  }

  /** The PLAY_CARD legal action for `cardId`'s GAIN_STARTING_RUNES option (by its real index). */
  function findEmpowerPlay(state: GameState, cardId: string) {
    const effect = adventureCards[cardId].effect as { options: { effect: { type: string } }[] };
    const optionIndex = effect.options.findIndex((option) => option.effect.type === "GAIN_STARTING_RUNES");
    return getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "PLAY_CARD" &&
        legal.action.cardId === cardId &&
        legal.action.optionIndex === optionIndex
    );
  }

  it("only kriv.4 carries a starting-Rune empowerment (+1), map-only; kriv.1 and kriv.6 have none", () => {
    const effect = adventureCards["specialty.kriv.4"].effect as {
      options: { mapOnly?: boolean; effect: { type: string; amount?: number } }[];
    };
    const option = effect.options.find((entry) => entry.effect.type === "GAIN_STARTING_RUNES");
    expect(option, "kriv.4").toBeTruthy();
    expect(option!.effect.amount).toBe(1);
    expect(option!.mapOnly).toBe(true); // it sets up FUTURE combats, so it's a map play

    // After the nerf the other two levels are gain-Rune / card-draw only — no
    // starting-Rune empowerment on kriv.1 or kriv.6.
    for (const id of ["specialty.kriv.1", "specialty.kriv.6"] as const) {
      const opts = adventureCards[id].effect as { options: { effect: { type: string } }[] };
      expect(opts.options.some((entry) => entry.effect.type === "GAIN_STARTING_RUNES"), id).toBe(false);
    }
  });

  it("a Bulwark Kriv becomes Rune-Empowered on the map: kriv.4 banks +1 (and further grants stack)", () => {
    let state = krivMap("kriv-empower", "bulwark", ["specialty.kriv.4"]);
    const play4 = findEmpowerPlay(state, "specialty.kriv.4");
    expect(play4, "a Bulwark Kriv should be offered the +1 starting-Rune empowerment on the map").toBeTruthy();
    state = applyOk(state, play4!.action);
    expect(state.players.p1.runeEmpoweredNextCombats).toBe(1);

    // The empowerment flag is additive across separate grants (a later play, or a
    // City Hall combat-focus on top): a second +1 climbs to 2 (capped at RUNE_MAX).
    grantStartingRunes(state, "p1", 1);
    expect(state.players.p1.runeEmpoweredNextCombats).toBe(2);
  });

  it("offers the empowerment ONLY to a Bulwark caster (control: a non-Bulwark holder)", () => {
    const state = krivMap("kriv-empower-control", "castle", ["specialty.kriv.4"]);
    expect(findEmpowerPlay(state, "specialty.kriv.4")).toBeFalsy();
    expect(state.players.p1.runeEmpoweredNextCombats ?? 0).toBe(0);
  });

  it("the head-start opens the next combat charged: the flag seeds Runes and powers the Level 1 buff", () => {
    // End-to-end on the OUTCOME: feed the flag the specialty grants to the REAL
    // seedRunesForCombat. The army opens with those Runes (not 0), and earning the
    // rest turns on the army-wide +1 Attack — fails if the flag is ignored at seed
    // time or the runes are decorative.
    const combat = createInitialGameState("kriv-empower-seed");
    combat.players.p1.factionId = "bulwark";
    combat.towns.town_p1.factionId = "bulwark";
    combat.players.p1.runeEmpoweredNextCombats = 1; // what kriv.4's empowerment grants
    combat.combat!.attackerPlayerId = "p1";
    combat.combat!.defenderPlayerId = "p2";
    seedRunesForCombat(combat);
    expect(getRuneSummary(combat, "p1").count).toBe(1); // opens at 1, not 0

    gainRunes(combat, "p1", 3); // +3 earned → 4 = Level 1 threshold
    expect(getRuneSummary(combat, "p1").level).toBe(1);
    expect(
      getActiveAttackBonus(combat, {
        attacker: combat.combat!.units.unit_p1_marksmen,
        defender: combat.combat!.units.unit_p2_skeletons,
        attackKind: "ranged"
      })
    ).toBe(1);
  });

  it("grantStartingRunes is a no-op for a non-Bulwark player", () => {
    const combat = createInitialGameState("kriv-empower-noop");
    combat.players.p1.factionId = "castle";
    expect(grantStartingRunes(combat, "p1", 2)).toBe(0);
    expect(combat.players.p1.runeEmpoweredNextCombats ?? 0).toBe(0);
  });
});

describe("Bulwark heroes — roster & specialty wiring", () => {
  const heroIds = ["dhuin", "creyle", "glacius", "kriv", "eikthurn", "oidana"] as const;

  it("registers six Bulwark heroes (three Chieftains, three Elders)", () => {
    for (const id of heroIds) {
      expect(coreHeroDefinitions[id]?.faction, id).toBe("bulwark");
    }
    const byClass = heroIds.reduce<Record<string, number>>((acc, id) => {
      const klass = coreHeroDefinitions[id].class;
      acc[klass] = (acc[klass] ?? 0) + 1;
      return acc;
    }, {});
    expect(byClass).toEqual({ Chieftain: 3, Elder: 3 });
    expect(coreHeroDefinitions.dhuin.class).toBe("Chieftain");
    expect(coreHeroDefinitions.dhuin.type).toBe("might");
    expect(coreHeroDefinitions.creyle.class).toBe("Chieftain");
    expect(coreHeroDefinitions.glacius.class).toBe("Elder");
    expect(coreHeroDefinitions.glacius.type).toBe("magic");
    expect(coreHeroDefinitions.kriv.class).toBe("Elder");
    // batch 2: Eikthurn (Chieftain/Might, Mountain Rams) and Oidana (Elder/Magic, Diplomacy).
    expect(coreHeroDefinitions.eikthurn.class).toBe("Chieftain");
    expect(coreHeroDefinitions.eikthurn.type).toBe("might");
    expect(coreHeroDefinitions.oidana.class).toBe("Elder");
    expect(coreHeroDefinitions.oidana.type).toBe("magic");
  });

  it("each hero's starting ability and three specialties are real, implemented cards", () => {
    for (const id of heroIds) {
      const hero = coreHeroDefinitions[id];
      // cardLibrary is the runtime registry the engine/UI use; it includes the
      // extra ability cards (e.g. ability.diplomacy) that adventureCards omits.
      expect(cardLibrary[hero.startingAbilityCardId]?.kind, `${id} ability`).toBe("ability");
      for (const specialtyId of Object.values(hero.specialtyCardIds!)) {
        const card = adventureCards[specialtyId];
        expect(card, specialtyId).toBeTruthy();
        expect(card.implementationStatus, specialtyId).toBe("implemented");
      }
    }
  });

  it("each Chieftain's starting ability is its intended secondary skill", () => {
    // The three might Chieftains: Dhuin = Archery, Creyle = Armorer,
    // Eikthurn = Logistics — each a real, implemented ability card.
    const expected: Record<string, string> = {
      dhuin: "ability.archery",
      creyle: "ability.armorer",
      eikthurn: "ability.logistics"
    };
    for (const [id, abilityId] of Object.entries(expected)) {
      expect(coreHeroDefinitions[id].startingAbilityCardId, id).toBe(abilityId);
      expect(cardLibrary[abilityId]?.kind, abilityId).toBe("ability");
      expect(cardLibrary[abilityId]?.implementationStatus, abilityId).toBe("implemented");
    }
  });

  it("Dhuin I attacks and draws; IV gives +1 Health (doubled on Snow Elves); VI doubles its ongoing Attack on Snow Elves", () => {
    expect(adventureCards["specialty.dhuin.1"].effect).toMatchObject({
      type: "ADD_COMBAT_STAT",
      stat: "attack",
      amount: 1,
      drawCards: 1
    });
    expect(adventureCards["specialty.dhuin.4"].effect).toMatchObject({
      type: "ADD_UNIT_MAX_HEALTH",
      amount: 1,
      doubleForUnitName: "Snow Elves"
    });
    expect(adventureCards["specialty.dhuin.6"].effect).toMatchObject({
      type: "CREATE_ATTACK_BUFF",
      amount: 1,
      doubleForUnitName: "Snow Elves",
      duration: { type: "combat" }
    });
    const creyle1 = adventureCards["specialty.creyle.1"].effect as { options: { effect: unknown }[] };
    expect(creyle1.options[0].effect).toMatchObject({ type: "ADD_COMBAT_STAT", doubleForUnitName: "Mammoths" });
    expect(adventureCards["specialty.creyle.4"].effect).toMatchObject({
      type: "ADD_UNIT_MAX_HEALTH",
      doubleForUnitName: "Mammoths"
    });
  });

  it("Glacius is the Frost Ring caster — spares the centre, hits UP TO 2 adjacent, costs 1 discard", () => {
    for (const [id, damage] of [
      ["specialty.glacius.1", 1],
      ["specialty.glacius.6", 2]
    ] as const) {
      const option = (
        adventureCards[id].effect as {
          options: { effect: { adjacentPicks?: number }; cost?: { discardCards?: number } }[];
        }
      ).options[0];
      expect(option.effect).toMatchObject({
        type: "AREA_DAMAGE_PICK_ADJACENT",
        amount: damage,
        includeCenter: false,
        // Matches the Frost Ring SPELL: the ring hits at most 2 adjacent units (the
        // caster picks when more are adjacent). Was 4 (= "every adjacent unit").
        adjacentPicks: 2
      });
      // Both the I-tier and VI-tier rings cost a SINGLE discard (VI used to cost
      // two — house-rule change).
      expect(option.cost?.discardCards).toBe(1);
    }
  });

  it("each of Kriv's three specialties carries a scaling GAIN_RUNES option (nerfed 1 / 2 / 3)", () => {
    for (const [id, amount, bundledDraw] of [
      ["specialty.kriv.1", 1, 1],
      ["specialty.kriv.4", 2, 1],
      ["specialty.kriv.6", 3, 0]
    ] as const) {
      const effect = adventureCards[id].effect as {
        options: {
          trigger?: { event: string; controller: string };
          effect: { type: string; amount?: number; drawCards?: number };
        }[];
      };
      const runeOptions = effect.options.filter((option) => option.effect.type === "GAIN_RUNES");
      // Every level has BOTH a normal-play and an enemy-attack-reaction rune-gain,
      // at the nerfed amount; levels I/IV also bundle the card draw.
      expect(runeOptions.length, `${id} rune options`).toBe(2);
      for (const runeOption of runeOptions) {
        expect(runeOption.effect.amount, id).toBe(amount);
        expect(runeOption.effect.drawCards ?? 0, `${id} bundled draw`).toBe(bundledDraw);
      }
      // "all rune buff instant should be able to react to enemy attack": exactly one
      // of the two carries the UNIT_ATTACK_DECLARED / "opponent" reaction trigger.
      const reaction = runeOptions.find((option) => option.trigger);
      expect(reaction, `${id} should have a rune-gain reaction option`).toBeTruthy();
      expect(reaction!.trigger).toMatchObject({ event: "UNIT_ATTACK_DECLARED", controller: "opponent" });
    }
  });
});

describe("Bulwark hero — Glacius's Frost Ring (space + choose up to 2 adjacent, discard first)", () => {
  it("hits at most 2 adjacent units — with 3 in the ring, the caster PICKS which two", () => {
    const state = createInitialGameState("glacius-picks-2");
    state.players.p1.hand = ["specialty.glacius.1", "stat.attack"];
    state.players.p2.hand = [];
    // Centre space 9 (row 2, col 1): orthogonal neighbours are 5, 13, 8, 10.
    // Put THREE units in the ring so a pick is forced, plus one far away.
    for (const id of ["unit_p1_griffins", "unit_p2_skeletons", "unit_p2_vampires", "unit_p1_crusaders"] as const) {
      state.combat!.units[id].maxHealth = 20;
      state.combat!.units[id].damage = 0;
    }
    state.combat!.units.unit_p1_griffins.position = 5; // in the ring
    state.combat!.units.unit_p2_skeletons.position = 13; // in the ring
    state.combat!.units.unit_p2_vampires.position = 8; // in the ring
    state.combat!.units.unit_p1_crusaders.position = 0; // out of the ring

    // Discard is paid as part of the play (the card + costCardIds); the option
    // then rings the chosen space.
    const blast = applyOk(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "specialty.glacius.1",
      mode: "basic",
      optionIndex: 0,
      target: { type: "space", position: 9 },
      costCardIds: ["stat.attack"]
    });
    expect(blast.players.p1.discard, "the discard cost is paid").toContain("stat.attack");

    const choice = blast.pendingChoice;
    expect(choice?.type, "3 adjacent → an area-pick choice opens (was: all 3 hit at once)").toBe(
      "ABILITY_TARGET_CHOICE"
    );
    if (choice?.type !== "ABILITY_TARGET_CHOICE") {
      return;
    }
    expect(choice.picksRemaining, "at most two are hit").toBe(2);
    expect(new Set(choice.candidateUnitIds)).toEqual(
      new Set(["unit_p1_griffins", "unit_p2_skeletons", "unit_p2_vampires"])
    );

    // Pick the two enemies; the third adjacent unit (griffins) is spared.
    let picked = applyOk(blast, {
      type: "CHOOSE_ABILITY_TARGET",
      playerId: "p1",
      choiceId: choice.id,
      targetUnitId: "unit_p2_skeletons"
    });
    const second = picked.pendingChoice;
    expect(second?.type).toBe("ABILITY_TARGET_CHOICE");
    if (second?.type !== "ABILITY_TARGET_CHOICE") {
      return;
    }
    expect(second.picksRemaining).toBe(1);
    picked = applyOk(picked, {
      type: "CHOOSE_ABILITY_TARGET",
      playerId: "p1",
      choiceId: second.id,
      targetUnitId: "unit_p2_vampires"
    });

    expect(picked.combat!.units.unit_p2_skeletons.damage).toBe(1);
    expect(picked.combat!.units.unit_p2_vampires.damage).toBe(1);
    expect(picked.combat!.units.unit_p1_griffins.damage, "the un-picked third adjacent unit is spared").toBe(0);
    expect(picked.combat!.units.unit_p1_crusaders.damage, "the centre-out unit is untouched").toBe(0);
  });

  it("IV recalls a Spell/Specialty from the discard pile DURING combat (allowInCombat, was map-only)", () => {
    const state = createInitialGameState("glacius-iv-combat");
    state.players.p1.hand = ["specialty.glacius.4"];
    state.players.p2.hand = [];
    // A Spell and a Statistic in discard: only the Spell is an eligible recall.
    state.players.p1.discard = ["spell.magic_arrow", "stat.attack"];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";

    const play = findPlay(state, "specialty.glacius.4", 0);
    expect(play, "Glacius IV's discard recall should be OFFERED in combat").toBeTruthy();
    let after = applyOk(state, play!.action);

    const choice = after.pendingChoice;
    expect(choice?.type === "OPTION_CHOICE" && choice.context, "the discard-pick opens mid-combat").toBe(
      "discard-pick"
    );
    const labels = choice?.type === "OPTION_CHOICE" ? choice.options.map((option) => option.label) : [];
    expect(labels.some((label) => label.includes("Magic Arrow"))).toBe(true);
    expect(labels.some((label) => label.includes("Attack")), "the Statistic is not an eligible recall").toBe(false);

    after = applyOk(after, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: (choice as { id: string }).id,
      optionIndex: labels.findIndex((label) => label.includes("Magic Arrow"))
    });
    expect(after.players.p1.hand).toContain("spell.magic_arrow");
    expect(after.players.p1.discard).not.toContain("spell.magic_arrow");
  });
});

describe("Bulwark hero — Eikthurn's Mountain Rams specialty (the bronze lv2 unit, doubled)", () => {
  it("I adds +1 max HP, doubled (+2) on a Mountain Rams unit", () => {
    const state = createInitialGameState("eik-i-ram");
    state.players.p1.hand = ["specialty.eikthurn.1"];
    const ram = state.combat!.units.unit_p1_crusaders;
    ram.name = "Mountain Rams";
    const before = ram.maxHealth;
    const play = findUnitPlay(state, "specialty.eikthurn.1", "unit_p1_crusaders");
    expect(play, "Eikthurn I should target a friendly unit").toBeTruthy();
    expect(applyOk(state, play!.action).combat!.units.unit_p1_crusaders.maxHealth).toBe(before + 2);
  });

  it("I adds only +1 max HP on a non-Mountain-Rams unit (control)", () => {
    const state = createInitialGameState("eik-i-other");
    state.players.p1.hand = ["specialty.eikthurn.1"];
    const before = state.combat!.units.unit_p1_griffins.maxHealth;
    const play = findUnitPlay(state, "specialty.eikthurn.1", "unit_p1_griffins");
    expect(play, "Eikthurn I should be playable").toBeTruthy();
    expect(applyOk(state, play!.action).combat!.units.unit_p1_griffins.maxHealth).toBe(before + 1);
  });

  it("wires IV to Attack + Rune gain and VI to a Rune-priced Defense reaction", () => {
    expect(adventureCards["specialty.eikthurn.1"].effect).toMatchObject({
      type: "ADD_UNIT_MAX_HEALTH",
      doubleForUnitName: "Mountain Rams"
    });
    expect(adventureCards["specialty.eikthurn.4"].effect).toMatchObject({
      type: "ADD_COMBAT_STAT",
      stat: "attack",
      amount: 1,
      gainRunes: 2,
      doubleForUnitName: "Mountain Rams"
    });
    expect(adventureCards["specialty.eikthurn.6"].effect).toMatchObject({
      type: "ADD_COMBAT_STAT",
      stat: "defense",
      amount: 3,
      runeCost: 1,
      doubleForUnitName: "Mountain Rams"
    });
  });
});

/** The CHOOSE_ONE option of `cardId` whose effect is `effectType`. */
function optionWith(cardId: string, effectType: string): CardOptionDefinition {
  const effect = adventureCards[cardId].effect;
  if (effect.type !== "CHOOSE_ONE") {
    throw new Error(`${cardId} is not a CHOOSE_ONE`);
  }
  const option = effect.options.find((opt) => opt.effect.type === effectType);
  if (!option) {
    throw new Error(`${cardId} has no ${effectType} option`);
  }
  return option;
}

/**
 * A map turn with p1 (Castle) active, fully resourced, holding `cardId`, and
 * controlling exactly the given Dwelling tiers — so the Neutral draw count is
 * the number of Dwellings, capped by Oidana's specialty.
 */
function oidanaMap(seed: string, cardId: string, dwellings: ("bronze" | "silver" | "gold")[]): GameState {
  const state = createAdventureGameState({ seed, difficulty: "normal", rollFirstPlayer: false });
  for (const player of Object.values(state.players)) {
    player.canMulligan = false;
    player.needsHandRefresh = false;
  }
  state.activePlayerId = "p1";
  const p1 = state.players.p1;
  p1.morale = 0;
  p1.resources.gold = 50;
  p1.resources.buildingMaterials = 50;
  p1.resources.valuables = 50;
  p1.hand = [cardId];
  getTownOfPlayer(state, "p1")!.buildings = dwellings.map((tier) => `castle.dwelling_${tier}`);
  return state;
}

/** How many Neutral Unit cards a recruit play drew (its DIPLOMACY_NEUTRALS_DRAWN event). */
function neutralsDrawn(state: GameState): number {
  const drawn = state.eventLog.find((event) => event.type === "DIPLOMACY_NEUTRALS_DRAWN");
  return drawn?.type === "DIPLOMACY_NEUTRALS_DRAWN" ? drawn.unitDefIds.length : 0;
}

describe("Bulwark hero — Oidana the diplomat (Diplomacy + card draw)", () => {
  it("draws scale 1 / 2 / 2; I & IV are capped Diplomacy recruits, VI is the neutral-army Attack aura", () => {
    for (const [id, amount] of [
      ["specialty.oidana.1", 1],
      ["specialty.oidana.4", 2],
      ["specialty.oidana.6", 2]
    ] as const) {
      const draw = optionWith(id, "DRAW_CARDS");
      expect(draw.effect.type === "DRAW_CARDS" && draw.effect.amount, `${id} draw amount`).toBe(amount);
    }

    // I: full Dwelling-derived Diplomacy choice, full price.
    const i = optionWith("specialty.oidana.1", "DIPLOMACY_RECRUIT");
    expect(i.mapOnly).toBe(true);
    expect(i.effect.type === "DIPLOMACY_RECRUIT" && i.effect.maxDraws).toBeUndefined();
    expect(i.effect.type === "DIPLOMACY_RECRUIT" && (i.effect.goldReduction ?? 0)).toBe(0);

    // IV: full Dwelling-derived Diplomacy choice, 4 gold off.
    const iv = optionWith("specialty.oidana.4", "DIPLOMACY_RECRUIT");
    expect(iv.mapOnly).toBe(true);
    expect(iv.effect.type === "DIPLOMACY_RECRUIT" && iv.effect.maxDraws).toBeUndefined();
    expect(iv.effect.type === "DIPLOMACY_RECRUIT" && iv.effect.goldReduction).toBe(4);

    // VI: ongoing combat aura on the caster's neutral units — and NO recruit side.
    const vi = optionWith("specialty.oidana.6", "CREATE_VARIANT_ATTACK_BUFF");
    expect(vi.combatOnly).toBe(true);
    expect(vi.effect.type === "CREATE_VARIANT_ATTACK_BUFF" && vi.effect.variant).toBe("neutral");
    expect(vi.effect.type === "CREATE_VARIANT_ATTACK_BUFF" && vi.effect.amount).toBe(1);
    const vi6 = adventureCards["specialty.oidana.6"].effect;
    expect(vi6.type === "CHOOSE_ONE" && vi6.options.some((o) => o.effect.type === "DIPLOMACY_RECRUIT")).toBe(false);
  });

  it("the recruit side reveals every Dwelling choice, including Gold and Azure", () => {
    const drawsFor = (cardId: string, optionIndex: number): GameState => {
      const state = oidanaMap(`cap-${cardId}`, cardId, ["bronze", "silver", "gold"]);
      const play = findPlay(state, cardId, optionIndex);
      expect(play, `${cardId} recruit option offered`).toBeTruthy();
      return applyOk(state, play!.action);
    };
    for (const [cardId, optionIndex] of [
      ["ability.diplomacy", 0],
      ["specialty.oidana.1", 1],
      ["specialty.oidana.4", 1]
    ] as const) {
      const state = drawsFor(cardId, optionIndex);
      expect(neutralsDrawn(state), `${cardId} draws bronze, silver, gold and azure`).toBe(4);
      expect(state.pendingChoice?.type === "OPTION_CHOICE" && state.pendingChoice.diplomacyRecruit?.draws.map((draw) => draw.tier)).toEqual([
        "bronze", "silver", "gold", "azure"
      ]);
    }
  });

  it("Oidana IV recruits for 4 gold less than the printed cost; I (and Cyra) pay full price", () => {
    const recruitGoldPaid = (cardId: string, optionIndex: number): number => {
      const state = oidanaMap(`gold-${cardId}`, cardId, ["bronze"]);
      // Stack a known gold-costed Neutral on top so the draw is deterministic.
      state.decks[NEUTRAL_DECK_IDS.bronze]!.drawPile = ["neutral.cerberi"]; // cost { gold: 10 }
      state.decks[NEUTRAL_DECK_IDS.bronze]!.discardPile = [];
      expect(coreUnitDefinitions["neutral.cerberi"]?.neutral?.cost?.gold).toBe(10); // guard the fixture
      const goldBefore = state.players.p1.resources.gold;
      const play = findPlay(state, cardId, optionIndex);
      expect(play, `${cardId} recruit option offered`).toBeTruthy();
      let after = applyOk(state, play!.action);
      expect(
        after.pendingChoice?.type === "OPTION_CHOICE" && after.pendingChoice.context === "diplomacy-recruit"
      ).toBe(true);
      after = applyOk(after, {
        type: "CHOOSE_OPTION",
        playerId: "p1",
        choiceId: (after.pendingChoice as { id: string }).id,
        optionIndex: 0 // recruit the (only) drawn Cerberi
      });
      expect(after.players.p1.army.at(-1)!.unitDefId).toBe("neutral.cerberi");
      expect(after.players.p1.army.at(-1)!.side).toBe("neutral");
      return goldBefore - after.players.p1.resources.gold;
    };
    expect(recruitGoldPaid("specialty.oidana.4", 1), "IV: 10 − 4 discount").toBe(6);
    expect(recruitGoldPaid("specialty.oidana.1", 1), "I: full 10").toBe(10);
    expect(recruitGoldPaid("ability.diplomacy", 0), "Cyra: full 10").toBe(10);
  });

  it("VI's ongoing aura gives +1 Attack to the caster's NEUTRAL units only, for the whole battle", () => {
    const state = createInitialGameState("oidana-aura");
    // p1 fields one neutral-recruited unit and one faction unit, told apart purely
    // by `variant` — exactly how addArmyUnit(..., "neutral") tags a Diplomacy recruit.
    state.combat!.units.unit_p1_marksmen.variant = "neutral";
    state.combat!.units.unit_p1_griffins.variant = "pack";
    state.players.p1.hand = ["specialty.oidana.6"];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";

    const attackBonus = (s: GameState, unitId: UnitId): number =>
      getActiveAttackBonus(s, {
        attacker: s.combat!.units[unitId],
        defender: s.combat!.units.unit_p2_skeletons,
        attackKind: "melee"
      });

    expect(attackBonus(state, "unit_p1_marksmen"), "no aura before the play").toBe(0);

    const play = findPlay(state, "specialty.oidana.6", 1); // option 1 = the ongoing aura
    expect(play, "VI's ongoing aura should be playable in combat").toBeTruthy();
    const after = applyOk(state, play!.action);

    expect(attackBonus(after, "unit_p1_marksmen"), "neutral unit gains +1").toBe(1);
    expect(attackBonus(after, "unit_p1_griffins"), "faction unit untouched (variant gate)").toBe(0);
    expect(attackBonus(after, "unit_p2_skeletons"), "enemy untouched").toBe(0);

    // "All rounds": survives end-of-combat-round expiry, clears only at battle end.
    expireEffectsForCombatRoundEnd(after, after.combat!.round);
    expireEffectsForCombatRoundEnd(after, after.combat!.round + 1);
    expect(attackBonus(after, "unit_p1_marksmen"), "aura persists across rounds").toBe(1);
    expireEffectsForCombatEnd(after);
    expect(attackBonus(after, "unit_p1_marksmen"), "aura ends with the battle").toBe(0);
  });

  it("the card-draw option actually moves cards from deck to hand (IV draws 2)", () => {
    const state = createInitialGameState("oidana-draw");
    state.players.p1.hand = ["specialty.oidana.4"];
    state.players.p1.deck = ["spell.magic_arrow", "spell.magic_arrow", "spell.magic_arrow"];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_marksmen";
    const play = findPlay(state, "specialty.oidana.4", 0); // option 0 = Draw 2 cards
    expect(play, "Oidana IV's draw option should be playable as an instant").toBeTruthy();
    const after = applyOk(state, play!.action);
    // Two cards drawn deck -> hand; the played specialty leaves the hand.
    expect(after.players.p1.deck).toHaveLength(1);
    expect(after.players.p1.hand).toHaveLength(2);
  });

  it("her starting ability is the real, implemented Diplomacy ability", () => {
    expect(coreHeroDefinitions.oidana.startingAbilityCardId).toBe("ability.diplomacy");
    expect(cardLibrary["ability.diplomacy"]?.implementationStatus).toBe("implemented");
  });
});

describe("Bulwark heroes — PvP / multiplayer", () => {
  it("Oidana's card draw goes only to the casting player, never the opponent", () => {
    const state = createInitialGameState("oidana-pvp");
    state.players.p1.factionId = "bulwark";
    state.players.p2.factionId = "bulwark";
    state.players.p1.hand = ["specialty.oidana.6"];
    state.players.p1.deck = ["spell.magic_arrow", "spell.magic_arrow", "spell.magic_arrow", "spell.magic_arrow"];
    state.players.p2.hand = [];
    state.players.p2.deck = ["spell.magic_arrow", "spell.magic_arrow"];
    const p2HandBefore = state.players.p2.hand.length;
    const p2DeckBefore = state.players.p2.deck.length;
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_marksmen";
    const play = findPlay(state, "specialty.oidana.6", 0); // option 0 = Draw 2 cards
    expect(play, "Oidana VI's draw option should be playable").toBeTruthy();
    const after = applyOk(state, play!.action);
    // p1 drew 2 (the played specialty left hand); p2 is completely untouched.
    expect(after.players.p1.hand).toHaveLength(2);
    expect(after.players.p2.hand).toHaveLength(p2HandBefore);
    expect(after.players.p2.deck).toHaveLength(p2DeckBefore);
  });

  it("VI's neutral-army aura is owner-scoped: it never buffs the OPPONENT's neutral units", () => {
    // A PvP fight where BOTH heroes field a Diplomacy-recruited (neutral) unit.
    const state = createInitialGameState("oidana-pvp-aura");
    state.players.p1.factionId = "bulwark";
    state.players.p2.factionId = "bulwark";
    state.combat!.units.unit_p1_marksmen.variant = "neutral"; // p1's neutral
    state.combat!.units.unit_p2_skeletons.variant = "neutral"; // p2's neutral
    state.players.p1.hand = ["specialty.oidana.6"];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_marksmen";

    const attackBonus = (s: GameState, unitId: UnitId): number =>
      getActiveAttackBonus(s, {
        attacker: s.combat!.units[unitId],
        defender: s.combat!.units.unit_p1_griffins,
        attackKind: "melee"
      });

    const play = findPlay(state, "specialty.oidana.6", 1); // the ongoing aura
    expect(play, "VI's aura should be playable in a PvP combat").toBeTruthy();
    const after = applyOk(state, play!.action);

    expect(attackBonus(after, "unit_p1_marksmen"), "caster's neutral gains +1").toBe(1);
    expect(attackBonus(after, "unit_p2_skeletons"), "opponent's neutral is NOT buffed").toBe(0);
  });
});
