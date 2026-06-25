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
import type { ActiveEffectModifier, CardOptionDefinition, GameAction, GameState, UnitId } from "./state";

/**
 * Bulwark heroes. The genuinely NEW engine code is Kriv's GAIN_RUNES specialty
 * effect, so it gets a behavioural test (banks Runes for a Bulwark caster; the
 * option is not even offered to anyone else). Dhuin/Creyle reuse the tested
 * unit-specialist factories and Glacius reuses Adelaide's Frost-Ring area
 * damage, so those are guarded at the wiring level.
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
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

/** Net total of a given active-effect modifier kind sitting on one unit. */
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
  it("banks 2 Runes for a Bulwark caster played in combat", () => {
    const state = krivCombat("kriv-banks", "bulwark");
    const play = findPlay(state, "specialty.kriv.1", 0);
    expect(play, "the Gain-2-Runes option should be offered to a Bulwark caster in combat").toBeTruthy();
    const after = applyOk(state, play!.action);
    expect(after.combat!.runes?.p1?.count).toBe(2);
  });

  it("offers the rune option ONLY to a Bulwark caster (control: castle)", () => {
    const state = krivCombat("kriv-control", "castle");
    expect(findPlay(state, "specialty.kriv.1", 0)).toBeFalsy();
    // And the rune count never moves for a non-Bulwark player.
    expect(state.combat!.runes?.p1).toBeUndefined();
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

  it("kriv.1 and kriv.4 carry a scaling starting-Rune empowerment (1 / 2), map-only; kriv.6 has none", () => {
    for (const [id, amount] of [
      ["specialty.kriv.1", 1],
      ["specialty.kriv.4", 2]
    ] as const) {
      const effect = adventureCards[id].effect as {
        options: { mapOnly?: boolean; effect: { type: string; amount?: number } }[];
      };
      const option = effect.options.find((entry) => entry.effect.type === "GAIN_STARTING_RUNES");
      expect(option, id).toBeTruthy();
      expect(option!.effect.amount).toBe(amount);
      expect(option!.mapOnly).toBe(true); // it sets up FUTURE combats, so it's a map play
    }
    // kriv.6 is a pure combat/reaction card (phaseLimit excludes the map window).
    const six = adventureCards["specialty.kriv.6"].effect as { options: { effect: { type: string } }[] };
    expect(six.options.some((entry) => entry.effect.type === "GAIN_STARTING_RUNES")).toBe(false);
  });

  it("a Bulwark Kriv becomes Rune-Empowered on the map: kriv.4 banks +2, and a second empowerment stacks", () => {
    let state = krivMap("kriv-empower", "bulwark", ["specialty.kriv.4"]);
    const play4 = findEmpowerPlay(state, "specialty.kriv.4");
    expect(play4, "a Bulwark Kriv should be offered the +2 starting-Rune empowerment on the map").toBeTruthy();
    state = applyOk(state, play4!.action);
    expect(state.players.p1.runeEmpoweredNextCombats).toBe(2);

    // A second empowerment (kriv.1, +1) STACKS onto the flag → 3.
    state.players.p1.hand = ["specialty.kriv.1"];
    const play1 = findEmpowerPlay(state, "specialty.kriv.1");
    expect(play1, "kriv.1 should also offer a +1 starting-Rune empowerment").toBeTruthy();
    state = applyOk(state, play1!.action);
    expect(state.players.p1.runeEmpoweredNextCombats).toBe(3);
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
    combat.players.p1.runeEmpoweredNextCombats = 2; // what kriv.4's empowerment grants
    combat.combat!.attackerPlayerId = "p1";
    combat.combat!.defenderPlayerId = "p2";
    seedRunesForCombat(combat);
    expect(getRuneSummary(combat, "p1").count).toBe(2); // opens at 2, not 0

    gainRunes(combat, "p1", 2); // +2 earned → 4 = Level 1 threshold
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
    // batch 2: Eikthurn (Chieftain/Might, Yetis) and Oidana (Elder/Magic, Diplomacy).
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
      for (const specialtyId of Object.values(hero.specialtyCardIds)) {
        const card = adventureCards[specialtyId];
        expect(card, specialtyId).toBeTruthy();
        expect(card.implementationStatus, specialtyId).toBe("implemented");
      }
    }
  });

  it("Dhuin doubles Snow Elves; Creyle doubles Mammoths", () => {
    const dhuin1 = adventureCards["specialty.dhuin.1"].effect as { options: { effect: unknown }[] };
    expect(dhuin1.options[0].effect).toMatchObject({ type: "ADD_COMBAT_STAT", doubleForUnitName: "Snow Elves" });
    expect(adventureCards["specialty.dhuin.6"].effect).toMatchObject({
      type: "CREATE_INITIATIVE_BUFF",
      doubleForUnitName: "Snow Elves"
    });
    const creyle1 = adventureCards["specialty.creyle.1"].effect as { options: { effect: unknown }[] };
    expect(creyle1.options[0].effect).toMatchObject({ type: "ADD_COMBAT_STAT", doubleForUnitName: "Mammoths" });
    expect(adventureCards["specialty.creyle.4"].effect).toMatchObject({
      type: "ADD_UNIT_MAX_HEALTH",
      doubleForUnitName: "Mammoths"
    });
  });

  it("Glacius is the Frost Ring caster — the ring spares the centre, and each tier costs 1 discard", () => {
    for (const [id, damage] of [
      ["specialty.glacius.1", 1],
      ["specialty.glacius.6", 2]
    ] as const) {
      const option = (
        adventureCards[id].effect as { options: { effect: unknown; cost?: { discardCards?: number } }[] }
      ).options[0];
      expect(option.effect).toMatchObject({
        type: "AREA_DAMAGE_PICK_ADJACENT",
        amount: damage,
        includeCenter: false
      });
      // Both the I-tier and VI-tier rings cost a SINGLE discard (VI used to cost
      // two — house-rule change).
      expect(option.cost?.discardCards).toBe(1);
    }
  });

  it("each of Kriv's three specialties carries a scaling GAIN_RUNES option", () => {
    for (const [id, amount] of [
      ["specialty.kriv.1", 2],
      ["specialty.kriv.4", 3],
      ["specialty.kriv.6", 4]
    ] as const) {
      const effect = adventureCards[id].effect as { options: { effect: { type: string; amount?: number } }[] };
      const runeOption = effect.options.find((option) => option.effect.type === "GAIN_RUNES");
      expect(runeOption, id).toBeTruthy();
      expect(runeOption!.effect.amount).toBe(amount);
    }
  });
});

describe("Bulwark hero — Eikthurn's Yetis specialty (Yetis doubled)", () => {
  it("IV adds +1 max HP, doubled (+2) on a Yetis unit", () => {
    const state = createInitialGameState("eik-iv-yeti");
    state.players.p1.hand = ["specialty.eikthurn.4"];
    const yeti = state.combat!.units.unit_p1_crusaders;
    yeti.name = "Yetis";
    const before = yeti.maxHealth;
    const play = findUnitPlay(state, "specialty.eikthurn.4", "unit_p1_crusaders");
    expect(play, "Eikthurn IV should target a friendly unit").toBeTruthy();
    expect(applyOk(state, play!.action).combat!.units.unit_p1_crusaders.maxHealth).toBe(before + 2);
  });

  it("IV adds only +1 max HP on a non-Yetis unit (control)", () => {
    const state = createInitialGameState("eik-iv-other");
    state.players.p1.hand = ["specialty.eikthurn.4"];
    const before = state.combat!.units.unit_p1_griffins.maxHealth;
    const play = findUnitPlay(state, "specialty.eikthurn.4", "unit_p1_griffins");
    expect(play, "Eikthurn IV should be playable").toBeTruthy();
    expect(applyOk(state, play!.action).combat!.units.unit_p1_griffins.maxHealth).toBe(before + 1);
  });

  it("VI's initiative buff is doubled (+2) on a Yetis unit", () => {
    const state = createInitialGameState("eik-vi");
    state.players.p1.hand = ["specialty.eikthurn.6"];
    state.combat!.units.unit_p1_crusaders.name = "Yetis";
    const play = findUnitPlay(state, "specialty.eikthurn.6", "unit_p1_crusaders");
    expect(play, "Eikthurn VI should be playable on a friendly unit").toBeTruthy();
    const next = applyOk(state, play!.action);
    expect(modifierTotalOn(next, "unit_p1_crusaders", "INITIATIVE_BONUS")).toBe(2);
  });

  it("wires all three levels to the Yetis signature unit", () => {
    const one = adventureCards["specialty.eikthurn.1"].effect as { options: { effect: unknown }[] };
    expect(one.options[0].effect).toMatchObject({ type: "ADD_COMBAT_STAT", doubleForUnitName: "Yetis" });
    expect(adventureCards["specialty.eikthurn.4"].effect).toMatchObject({
      type: "ADD_UNIT_MAX_HEALTH",
      doubleForUnitName: "Yetis"
    });
    expect(adventureCards["specialty.eikthurn.6"].effect).toMatchObject({
      type: "CREATE_INITIATIVE_BUFF",
      doubleForUnitName: "Yetis"
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

    // I: recruit from 1 drawn Neutral (maxDraws 1, full price).
    const i = optionWith("specialty.oidana.1", "DIPLOMACY_RECRUIT");
    expect(i.mapOnly).toBe(true);
    expect(i.effect.type === "DIPLOMACY_RECRUIT" && i.effect.maxDraws).toBe(1);
    expect(i.effect.type === "DIPLOMACY_RECRUIT" && (i.effect.goldReduction ?? 0)).toBe(0);

    // IV: recruit from up to 2 drawn Neutrals, 4 gold off.
    const iv = optionWith("specialty.oidana.4", "DIPLOMACY_RECRUIT");
    expect(iv.mapOnly).toBe(true);
    expect(iv.effect.type === "DIPLOMACY_RECRUIT" && iv.effect.maxDraws).toBe(2);
    expect(iv.effect.type === "DIPLOMACY_RECRUIT" && iv.effect.goldReduction).toBe(4);

    // VI: ongoing combat aura on the caster's neutral units — and NO recruit side.
    const vi = optionWith("specialty.oidana.6", "CREATE_VARIANT_ATTACK_BUFF");
    expect(vi.combatOnly).toBe(true);
    expect(vi.effect.type === "CREATE_VARIANT_ATTACK_BUFF" && vi.effect.variant).toBe("neutral");
    expect(vi.effect.type === "CREATE_VARIANT_ATTACK_BUFF" && vi.effect.amount).toBe(1);
    const vi6 = adventureCards["specialty.oidana.6"].effect;
    expect(vi6.type === "CHOOSE_ONE" && vi6.options.some((o) => o.effect.type === "DIPLOMACY_RECRUIT")).toBe(false);
  });

  it("the recruit side caps the Neutral draw at maxDraws (I=1, IV=2) however many Dwellings she owns", () => {
    // Three Dwelling tiers: Cyra's UNCAPPED Diplomacy draws one per Dwelling (3);
    // Oidana's caps that draw. (The cap is the only difference, so this CONTROL
    // is what proves maxDraws actually does the limiting.)
    const drawsFor = (cardId: string, optionIndex: number): number => {
      const state = oidanaMap(`cap-${cardId}`, cardId, ["bronze", "silver", "gold"]);
      const play = findPlay(state, cardId, optionIndex);
      expect(play, `${cardId} recruit option offered`).toBeTruthy();
      return neutralsDrawn(applyOk(state, play!.action));
    };
    expect(drawsFor("ability.diplomacy", 0), "uncapped control draws 3").toBe(3);
    expect(drawsFor("specialty.oidana.1", 1), "I caps at 1").toBe(1);
    expect(drawsFor("specialty.oidana.4", 1), "IV caps at 2").toBe(2);
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
