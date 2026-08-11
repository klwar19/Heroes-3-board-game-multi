import { describe, expect, it } from "vitest";
import { cardLibrary } from "@/data/cards/library";
import { artifactDeckBinhRelic, artifactDeckLegacy } from "@/data/cards/artifacts";
import { applyAction, createAdventureGameState, createInitialGameState, getLegalActions } from "./index";
import type { GameAction, GameState, UnitId } from "./state";

/**
 * Engine coverage for the four Conflux Tome relics (Tome of Air/Earth/Fire/
 * Water). Each test drives the real card through the engine and fails if the
 * wiring is removed — no decorative entries (CLAUDE.md rule #1).
 *
 *   • Option A (map) — find the first spell of the Tome's School in the Spell
 *     deck, take it or discard it, reshuffle (school-aware Eagle Eye dig).
 *   • Option B (combat) — "resolve its effect without paying the Power cost":
 *     a matching-School spell resolves at its MAXIMUM Power breakpoint for free
 *     (the new SET_SPELL_POWER_MAX mechanic), even for spells whose top tier
 *     needs Power 5 (Implosion), and never on a wrong-School spell.
 *   • Mysticism (expert) recalls the Tome together with the spell and every
 *     other power source played with it (statistic, spell-as-power).
 */

const TOME_AIR = "artifact.tome_of_air";
const TOME_EARTH = "artifact.tome_of_earth";
const TOME_FIRE = "artifact.tome_of_fire";
const TOME_WATER = "artifact.tome_of_water";

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function passAllReactions(state: GameState): GameState {
  let current = state;
  let safety = 40;
  while (current.reactionWindow && safety-- > 0) {
    current = applyOk(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
  }
  return current;
}

function findPlay(
  state: GameState,
  playerId: "p1" | "p2",
  cardId: string,
  optionIndex: number,
  mode: "basic" | "expert" = "basic"
) {
  return getLegalActions(state, playerId).find(
    (legal) =>
      legal.action.type === "PLAY_CARD" &&
      legal.action.cardId === cardId &&
      legal.action.optionIndex === optionIndex &&
      (legal.action.mode ?? "basic") === mode
  );
}

function findCast(state: GameState, playerId: "p1" | "p2", cardId: string, unitId: UnitId) {
  return getLegalActions(state, playerId).find(
    (legal) =>
      legal.action.type === "CAST_SPELL" &&
      legal.action.cardId === cardId &&
      legal.action.target?.type === "unit" &&
      legal.action.target.unitId === unitId
  );
}

function reactionAction(
  state: GameState,
  playerId: "p1" | "p2",
  cardId: string,
  optionIndex?: number,
  mode: "basic" | "expert" = "basic"
): Extract<GameAction, { type: "PLAY_REACTION" }> | undefined {
  const legal = getLegalActions(state, playerId).find(
    (entry) =>
      entry.action.type === "PLAY_REACTION" &&
      entry.action.cardId === cardId &&
      entry.action.optionIndex === optionIndex &&
      (entry.action.mode ?? "basic") === mode &&
      !entry.action.asPowerBoost
  );
  return legal?.action.type === "PLAY_REACTION" ? legal.action : undefined;
}

function powerBoostAction(
  state: GameState,
  playerId: "p1" | "p2",
  cardId: string
): Extract<GameAction, { type: "PLAY_REACTION" }> | undefined {
  const legal = getLegalActions(state, playerId).find(
    (entry) =>
      entry.action.type === "PLAY_REACTION" && entry.action.cardId === cardId && entry.action.asPowerBoost === true
  );
  return legal?.action.type === "PLAY_REACTION" ? legal.action : undefined;
}

/** A combat with p1's Marksmen active and the p2 Skeletons set up as a soft target. */
function combatWithTarget(seed: string): GameState {
  const state = createInitialGameState(seed);
  state.activePlayerId = "p1";
  state.combat!.activeUnitId = "unit_p1_marksmen";
  state.players.p2.hand = [];
  const target = state.combat!.units.unit_p2_skeletons;
  target.maxHealth = 30;
  target.damage = 0;
  target.abilities = [];
  return state;
}

// ===========================================================================
// Card definitions — the truth about what runs (CLAUDE.md rule #2)
// ===========================================================================

describe("Tome artifact definitions", () => {
  const cases: Array<[string, string]> = [
    [TOME_AIR, "air"],
    [TOME_EARTH, "earth"],
    [TOME_FIRE, "fire"],
    [TOME_WATER, "water"]
  ];

  it.each(cases)("%s is a relic with school-dig + force-max-power, in the relic decks", (cardId, school) => {
    const card = cardLibrary[cardId];
    expect(card.implementationStatus).toBe("implemented");
    expect(card.artifactTier).toBe("relic");
    expect(card.effect.type).toBe("CHOOSE_ONE");
    if (card.effect.type !== "CHOOSE_ONE") return;
    // The dig side carries NO mapOnly flag: a printed Instant, it plays on the
    // map AND mid-combat (instant-artifacts-combat.test.ts drives the combat
    // dig end-to-end).
    expect(card.effect.options[0].mapOnly).toBeUndefined();
    expect(card.effect.options[0].effect).toMatchObject({ type: "EAGLE_EYE_DIG", school });
    expect(card.effect.options[1].trigger).toMatchObject({ event: "SPELL_CAST_STARTED", controller: "self" });
    expect(card.effect.options[1].effect).toMatchObject({ type: "SET_SPELL_POWER_MAX", schoolOnly: school });
    expect(artifactDeckLegacy).toContain(cardId);
    expect(artifactDeckBinhRelic).toContain(cardId);
  });
});

// ===========================================================================
// Option A — the School-filtered Spell-deck dig
// ===========================================================================

describe("Tome option A: School Spell-deck dig", () => {
  // SHAPE CHANGED 2026-08-11 (user ruling "Tome of X-stupid, should work like 1
  // description, then allow to choose basic or expert deck after wards with 2
  // buttons"). This case used to assert TWO PLAY_CARD offers whose labels
  // differed only by a "(Basic/Expert Spell deck)" suffix. There is now ONE
  // play, and the deck is chosen afterwards in the `spell-deck-pick` two-button
  // choice — which is also where the crown is spent. The OUTCOME half of the old
  // case (basic ⇒ digs `spells`, expert ⇒ digs `spells-expert`) is unchanged and
  // still asserted below; the full surface is pinned in tome-deck-pick.test.ts.
  it("digs the deck chosen in the two-button pick when decks are split", () => {
    const makeState = (seed: string) => {
      let state = createAdventureGameState({
        seed,
        difficulty: "normal",
        rollFirstPlayer: false,
        houseRules: { "split-decks": true }
      });
      state = (state.players.p1.needsHandRefresh || state.players.p1.canMulligan)
        ? applyOk(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] })
        : state;
      state.activePlayerId = "p1";
      state.players.p1.hand = [TOME_EARTH];
      state.players.p1.limits.expertUses = 1;
      state.decks.spells.drawPile = ["spell.stone_skin"];
      state.decks.spells.discardPile = [];
      state.decks["spells-expert"]!.drawPile = ["spell.implosion"];
      state.decks["spells-expert"]!.discardPile = [];
      return state;
    };

    const answer = (state: GameState, optionIndex: number): GameAction => {
      const offer = getLegalActions(state, "p1").find(
        (legal) => legal.action.type === "CHOOSE_OPTION" && legal.action.optionIndex === optionIndex
      );
      expect(offer, `deck-pick option ${optionIndex}`).toBeTruthy();
      return offer!.action;
    };

    // ONE dig play, no expert twin, no deck-name suffix on the label.
    const basicState = makeState("tome-split-basic");
    expect(findPlay(basicState, "p1", TOME_EARTH, 0, "expert"), "no second, crown-paying play").toBeUndefined();
    const play = findPlay(basicState, "p1", TOME_EARTH, 0, "basic");
    expect(play?.label).not.toContain("Spell deck)");

    const opened = applyOk(basicState, play!.action);
    expect(opened.pendingChoice?.type === "OPTION_CHOICE" ? opened.pendingChoice.context : null).toBe(
      "spell-deck-pick"
    );

    const afterBasic = applyOk(opened, answer(opened, 0));
    expect(afterBasic.pendingChoice?.type === "OPTION_CHOICE" ? afterBasic.pendingChoice.eagleEye : null).toMatchObject({
      deckId: "spells",
      cardId: "spell.stone_skin"
    });

    const expertState = makeState("tome-split-expert");
    const expertOpened = applyOk(expertState, findPlay(expertState, "p1", TOME_EARTH, 0, "basic")!.action);
    const afterExpert = applyOk(expertOpened, answer(expertOpened, 1));
    expect(afterExpert.pendingChoice?.type === "OPTION_CHOICE" ? afterExpert.pendingChoice.eagleEye : null).toMatchObject({
      deckId: "spells-expert",
      cardId: "spell.implosion"
    });
  });

  it("Tome of Fire finds the first Fire spell, skipping a non-Fire one on top", () => {
    let state = createAdventureGameState({ seed: "tome-dig", difficulty: "normal", rollFirstPlayer: false });
    state = (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) ? applyOk(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] }) : state;
    state.activePlayerId = "p1";
    state.players.p1.hand = [TOME_FIRE];
    // Draw pile top is the LAST element: Haste (air) sits on top, Curse (fire)
    // beneath it. The dig must skip Haste and surface Curse.
    state.decks.spells.drawPile = ["spell.curse", "spell.haste"];
    state.decks.spells.discardPile = [];

    const play = findPlay(state, "p1", TOME_FIRE, 0);
    expect(play, "Tome of Fire's dig side should be offered on the map").toBeTruthy();
    state = applyOk(state, play!.action);

    const choice = state.pendingChoice;
    expect(choice?.type === "OPTION_CHOICE" && choice.context).toBe("eagle-eye");
    expect((choice as { eagleEye?: { cardId: string } }).eagleEye?.cardId).toBe("spell.curse");
    expect(choice?.type === "OPTION_CHOICE" ? choice.options.map((option) => option.label) : []).toEqual([
      expect.stringMatching(/^Take Curse/),
      "Discard Curse"
    ]);

    state = applyOk(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: (choice as { id: string }).id,
      optionIndex: 0
    });

    expect(state.players.p1.hand).toContain("spell.curse");
    expect(state.decks.spells.drawPile).not.toContain("spell.curse");
    // The skipped Air spell was reshuffled back into the deck, not taken.
    expect(state.decks.spells.drawPile).toContain("spell.haste");
  });

  it("may discard the found Spell into the shared Spell discard pile", () => {
    let state = createAdventureGameState({ seed: "tome-dig-discard", difficulty: "normal", rollFirstPlayer: false });
    state = (state.players.p1.needsHandRefresh || state.players.p1.canMulligan)
      ? applyOk(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] })
      : state;
    state.activePlayerId = "p1";
    state.players.p1.hand = [TOME_WATER];
    state.decks.spells.drawPile = ["spell.forgetfulness"];
    state.decks.spells.discardPile = [];

    state = applyOk(state, findPlay(state, "p1", TOME_WATER, 0)!.action);
    const choice = state.pendingChoice;
    expect(choice?.type === "OPTION_CHOICE" && choice.context).toBe("eagle-eye");
    state = applyOk(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: choice!.id,
      optionIndex: 1
    });

    expect(state.players.p1.hand).not.toContain("spell.forgetfulness");
    expect(state.players.p1.spellBook).not.toContain("spell.forgetfulness");
    expect(state.decks.spells.drawPile).not.toContain("spell.forgetfulness");
    expect(state.decks.spells.discardPile).toContain("spell.forgetfulness");
  });

  it("does nothing when the Spell deck holds no spell of that School", () => {
    let state = createAdventureGameState({ seed: "tome-dig-empty", difficulty: "normal", rollFirstPlayer: false });
    state = (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) ? applyOk(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] }) : state;
    state.activePlayerId = "p1";
    state.players.p1.hand = [TOME_WATER];
    // Only Air/Fire spells present — a Water dig finds nothing.
    state.decks.spells.drawPile = ["spell.haste", "spell.curse"];
    state.decks.spells.discardPile = [];

    const play = findPlay(state, "p1", TOME_WATER, 0);
    expect(play).toBeTruthy();
    state = applyOk(state, play!.action);

    // No spell was found, so no take/discard choice is raised.
    expect(state.pendingChoice).toBeNull();
    expect(state.players.p1.hand).not.toContain("spell.haste");
    expect(state.players.p1.hand).not.toContain("spell.curse");
  });
});

// ===========================================================================
// Option B — resolve a matching-School spell at maximum Power for free
// ===========================================================================

describe("Tome option B: force maximum Power", () => {
  it("keeps the School-dig side playable in combat and the max-Power side available while casting", () => {
    const idle = combatWithTarget("tome-both-combat-sides");
    idle.players.p1.hand = [TOME_AIR, "spell.lightning_bolt"];
    idle.decks.spells.drawPile = ["spell.haste"];
    idle.decks.spells.discardPile = [];
    expect(findPlay(idle, "p1", TOME_AIR, 0)).toBeTruthy();

    const cast = findCast(idle, "p1", "spell.lightning_bolt", "unit_p2_skeletons");
    const casting = applyOk(idle, cast!.action);
    expect(reactionAction(casting, "p1", TOME_AIR, 1)).toBeTruthy();
  });

  it("control: Lightning Bolt cast with no Power deals its Power-0 damage (2)", () => {
    const state = combatWithTarget("tome-bolt-control");
    state.players.p1.hand = ["spell.lightning_bolt"];

    const cast = findCast(state, "p1", "spell.lightning_bolt", "unit_p2_skeletons");
    const resolved = passAllReactions(applyOk(state, cast!.action));
    expect(resolved.combat!.units.unit_p2_skeletons.damage).toBe(2);
  });

  it("Tome of Air lifts an Air Lightning Bolt to its max tier (2 → 4) for free", () => {
    const state = combatWithTarget("tome-bolt-max");
    state.players.p1.hand = ["spell.lightning_bolt", TOME_AIR];

    const cast = findCast(state, "p1", "spell.lightning_bolt", "unit_p2_skeletons");
    const casted = applyOk(state, cast!.action);
    const tome = reactionAction(casted, "p1", TOME_AIR, 1);
    expect(tome, "Tome of Air's force-max side should be offered while casting an Air spell").toBeTruthy();
    const resolved = passAllReactions(applyOk(casted, tome!));
    // Lightning Bolt amountByPower {0:2,1:3,2:4}: forced to the top tier → 4.
    expect(resolved.combat!.units.unit_p2_skeletons.damage).toBe(4);
  });

  it("reaches a Power-5 top tier, not a Power-2 cap (Implosion 0 → 6)", () => {
    const state = combatWithTarget("tome-implosion-max");
    state.players.p1.hand = ["spell.implosion", TOME_EARTH];

    const cast = findCast(state, "p1", "spell.implosion", "unit_p2_skeletons");
    expect(cast, "Implosion should be castable").toBeTruthy();
    const casted = applyOk(state, cast!.action);
    const tome = reactionAction(casted, "p1", TOME_EARTH, 1);
    expect(tome, "Tome of Earth's force-max side should be offered while casting an Earth spell").toBeTruthy();
    const resolved = passAllReactions(applyOk(casted, tome!));
    // Implosion amountByPower {0:0,1:2,3:4,5:6}: forced to the Power-5 tier → 6.
    expect(resolved.combat!.units.unit_p2_skeletons.damage).toBe(6);
  });

  it("is offered only for a spell of the Tome's own School", () => {
    const state = combatWithTarget("tome-school-gate");
    state.players.p1.hand = ["spell.lightning_bolt", TOME_AIR, TOME_EARTH];

    const cast = findCast(state, "p1", "spell.lightning_bolt", "unit_p2_skeletons");
    const casted = applyOk(state, cast!.action);
    // Lightning Bolt is Air: the Air Tome's force-max side is offered, the Earth
    // Tome's is not.
    expect(reactionAction(casted, "p1", TOME_AIR, 1)).toBeTruthy();
    expect(reactionAction(casted, "p1", TOME_EARTH, 1)).toBeUndefined();
  });
});

// ===========================================================================
// Mysticism (expert) recall interaction
// ===========================================================================

describe("Mysticism expert recalls every power source played with the spell", () => {
  it("returns the spell, the Tome, the Power statistic and the spell-as-power to hand", () => {
    const state = combatWithTarget("tome-mysticism");
    state.players.p1.hand = [
      "spell.lightning_bolt",
      TOME_AIR,
      "ability.mysticism",
      "stat.power",
      "spell.haste"
    ];
    // One expert use for the expert Mysticism recall.
    state.players.p1.limits.expertUses = 1;

    let casted = applyOk(state, findCast(state, "p1", "spell.lightning_bolt", "unit_p2_skeletons")!.action);

    // A Power statistic (+1), a Spell discarded as a power source (+1), and the
    // Tome (force-max) all empower the same cast.
    casted = applyOk(casted, reactionAction(casted, "p1", "stat.power")!);
    casted = applyOk(casted, powerBoostAction(casted, "p1", "spell.haste")!);
    casted = applyOk(casted, reactionAction(casted, "p1", TOME_AIR, 1)!);

    // Expert Mysticism: take the Spell AND all other cards played with it back.
    const recall = reactionAction(casted, "p1", "ability.mysticism", undefined, "expert");
    expect(recall, "expert Mysticism should be playable on the cast").toBeTruthy();
    const resolved = passAllReactions(applyOk(casted, recall!));

    const hand = resolved.players.p1.hand;
    expect(hand).toContain("spell.lightning_bolt"); // the spell itself recalled
    expect(hand).toContain(TOME_AIR); // the Tome ("this") recalled
    expect(hand).toContain("stat.power"); // the statistic recalled
    expect(hand).toContain("spell.haste"); // the spell-as-power recalled
    // The spell still resolved at maximum Power before being recalled.
    expect(resolved.combat!.units.unit_p2_skeletons.damage).toBe(4);
  });

  it("control: basic Mysticism recalls only the spell, leaving the power sources discarded", () => {
    const state = combatWithTarget("tome-mysticism-basic");
    state.players.p1.hand = ["spell.lightning_bolt", "ability.mysticism", "stat.power"];
    state.players.p1.limits.expertUses = 0;

    let casted = applyOk(state, findCast(state, "p1", "spell.lightning_bolt", "unit_p2_skeletons")!.action);
    casted = applyOk(casted, reactionAction(casted, "p1", "stat.power")!);

    const recall = reactionAction(casted, "p1", "ability.mysticism", undefined, "basic");
    expect(recall).toBeTruthy();
    const resolved = passAllReactions(applyOk(casted, recall!));

    // The spell comes back; the statistic stays in the discard (basic recall
    // does not return other played cards).
    expect(resolved.players.p1.hand).toContain("spell.lightning_bolt");
    expect(resolved.players.p1.hand).not.toContain("stat.power");
    expect(resolved.players.p1.discard).toContain("stat.power");
  });
});
