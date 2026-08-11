import { describe, expect, it } from "vitest";
import { cardLibrary } from "@/data/cards/library";
import {
  applyAction,
  cardCanBoostPower,
  createAdventureGameState,
  createInitialGameState,
  getLegalActions,
  type GameAction,
  type GameState,
  type LegalAction
} from "./index";
import { CAST_A_SPELL_CARD_ID } from "./polish-spell-book";

/**
 * USER REPORT (2026-08-11), verbatim: "Expert Misticysm now - adds +1 SP to
 * magic arrow - but it shouldnt."
 *
 * Mysticism prints a RECALL, never a Power rider: "Basic: Play immediately
 * after casting a spell; take the Spell card back into your hand instead of
 * discarding it. Expert: also take back all other cards played together with
 * it." The +1 came from ONE line in the Polish Spell Book cast-window branch of
 * `applyReactionPlayCore` (b2d427bd), which is why it only ever fired on a
 * POLISH BOOK cast — and Magic Arrow is a Book Spell under that rule, so the
 * report's exact card is the one that shows it.
 *
 * Every assertion below is an OBSERVABLE outcome (the damage a Magic Arrow /
 * Lightning Bolt actually deals), never the `spellPowerBonus` field, so a test
 * fails if the number is wrong and not merely if the line is absent.
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function passAll(state: GameState): GameState {
  let current = state;
  let safety = 30;
  while (current.reactionWindow && safety-- > 0) {
    current = applyOk(current, {
      type: "PASS_REACTION",
      playerId: current.reactionWindow.priorityPlayerId
    });
  }
  return current;
}

/**
 * Drive a window to settlement whatever it opened: pass every reaction, and
 * answer any follow-up choice a join parks (Scholar's discard pick, a medic's
 * post-draw discard) with its first option. Used by the class sweep, where the
 * cards are not known ahead of time.
 */
function settle(state: GameState): GameState {
  let current = state;
  let safety = 60;
  while (safety-- > 0) {
    if (!current.reactionWindow && !current.pendingChoice) {
      break;
    }
    const next = ["p1", "p2"]
      .flatMap((playerId) => getLegalActions(current, playerId))
      .find((legal) => legal.action.type === "PASS_REACTION" || legal.action.type === "CHOOSE_OPTION");
    if (!next) {
      break;
    }
    current = applyOk(current, next.action);
  }
  return current;
}

/** A combat whose caster owns a Polish Spell Book (the reported configuration). */
function polishCombat(seed: string): GameState {
  const state = createInitialGameState(seed);
  const adventure = createAdventureGameState({
    startingBuildings: [],
    seed: `${seed}-rules`,
    ruleset: "binh",
    rollFirstPlayer: false,
    houseRules: { "polish-spell-book": true }
  });
  state.adventure = adventure.adventure;
  state.ruleset = "binh";
  state.activePlayerId = "p1";
  state.combat!.activeUnitId = "unit_p1_marksmen";
  state.players.p1.hand = [];
  state.players.p1.discard = [];
  state.players.p1.spellBook = [];
  state.players.p1.spellBookUsed = [];
  state.players.p2.hand = [];
  const target = state.combat!.units.unit_p2_skeletons;
  target.abilities = [];
  target.maxHealth = 50;
  target.damage = 0;
  return state;
}

/** The same combat WITHOUT the Polish Spell Book: spells are cast from hand. */
function plainCombat(seed: string): GameState {
  const state = createInitialGameState(seed);
  const adventure = createAdventureGameState({
    startingBuildings: [],
    seed: `${seed}-rules`,
    ruleset: "binh",
    rollFirstPlayer: false
  });
  state.adventure = adventure.adventure;
  state.ruleset = "binh";
  state.activePlayerId = "p1";
  state.combat!.activeUnitId = "unit_p1_marksmen";
  state.players.p1.hand = [];
  state.players.p1.discard = [];
  state.players.p2.hand = [];
  const target = state.combat!.units.unit_p2_skeletons;
  target.abilities = [];
  target.maxHealth = 50;
  target.damage = 0;
  return state;
}

function castFromBook(state: GameState, cardId: string): LegalAction {
  const legal = getLegalActions(state, "p1").find(
    (candidate) =>
      candidate.action.type === "CAST_SPELL" &&
      candidate.action.cardId === cardId &&
      candidate.action.fromSpellBook &&
      candidate.action.target.type === "unit" &&
      candidate.action.target.unitId === "unit_p2_skeletons"
  );
  expect(legal, `${cardId} should be castable from the Polish Book`).toBeTruthy();
  return legal!;
}

function castFromHand(state: GameState, cardId: string): LegalAction {
  const legal = getLegalActions(state, "p1").find(
    (candidate) =>
      candidate.action.type === "CAST_SPELL" &&
      candidate.action.cardId === cardId &&
      !candidate.action.fromSpellBook &&
      candidate.action.target.type === "unit" &&
      candidate.action.target.unitId === "unit_p2_skeletons"
  );
  expect(legal, `${cardId} should be castable from hand`).toBeTruthy();
  return legal!;
}

function reaction(state: GameState, cardId: string, mode?: "basic" | "expert"): LegalAction | undefined {
  return getLegalActions(state, "p1").find(
    (legal) =>
      legal.action.type === "PLAY_REACTION" &&
      legal.action.cardId === cardId &&
      (mode === undefined || legal.action.mode === mode) &&
      !legal.action.asPowerBoost
  );
}

/** Give the seat one crown so an expert side is payable. */
function withCrown(state: GameState): GameState {
  state.players.p1.limits.expertUses = 1;
  state.players.p1.combatStats.expertUsesSpentThisRound = 0;
  return state;
}

describe("Mysticism never changes the Power of the cast it answers", () => {
  it("REPRO: expert Mysticism on a Polish-Book Magic Arrow leaves it at Power 0 (1 damage)", () => {
    // Magic Arrow's printed ladder is 0 -> 1 damage, 1 -> 2, 2+ -> 3, so a
    // phantom +1 Spell Power is visible as 2 damage instead of 1. The card is a
    // Book Spell under this rule, exactly as reported.
    const state = withCrown(polishCombat("mysticism-arrow-expert"));
    state.players.p1.hand = [CAST_A_SPELL_CARD_ID, "ability.mysticism"];
    state.players.p1.spellBook = ["spell.magic_arrow"];

    const opened = applyOk(state, castFromBook(state, "spell.magic_arrow").action);
    const expert = reaction(opened, "ability.mysticism", "expert");
    expect(expert, "expert Mysticism should be offered with a crown available").toBeTruthy();
    const resolved = passAll(applyOk(opened, expert!.action));

    expect(resolved.combat!.units.unit_p2_skeletons.damage).toBe(1);
  });

  it("CONTROL: basic Mysticism on the same Magic Arrow also leaves it at 1 damage", () => {
    const state = polishCombat("mysticism-arrow-basic");
    state.players.p1.hand = [CAST_A_SPELL_CARD_ID, "ability.mysticism"];
    state.players.p1.spellBook = ["spell.magic_arrow"];

    const opened = applyOk(state, castFromBook(state, "spell.magic_arrow").action);
    const basic = reaction(opened, "ability.mysticism", "basic");
    expect(basic, "basic Mysticism should be offered").toBeTruthy();
    const resolved = passAll(applyOk(opened, basic!.action));

    expect(resolved.combat!.units.unit_p2_skeletons.damage).toBe(1);
  });

  it("CONTROL: a REAL power source still adds exactly 1 to that same cast", () => {
    // Proves the Power channel is untouched — the Magic Arrow really does climb
    // its ladder when something that prints "+1 Power" pays into the window.
    const state = polishCombat("mysticism-arrow-real-power");
    state.players.p1.hand = [CAST_A_SPELL_CARD_ID, "stat.power"];
    state.players.p1.spellBook = ["spell.magic_arrow"];

    const opened = applyOk(state, castFromBook(state, "spell.magic_arrow").action);
    const power = reaction(opened, "stat.power");
    expect(power, "the Power statistic should be offered into the cast window").toBeTruthy();
    const resolved = passAll(applyOk(opened, power!.action));

    expect(resolved.combat!.units.unit_p2_skeletons.damage).toBe(2);
  });

  it("expert Mysticism leaves a Lightning Bolt at its printed 2 damage", () => {
    // A second spell on a different rung of the ladder: the bug was not a Magic
    // Arrow quirk, it moved every Polish-Book cast.
    const state = withCrown(polishCombat("mysticism-bolt-expert"));
    state.players.p1.hand = [CAST_A_SPELL_CARD_ID, "ability.mysticism"];
    state.players.p1.spellBook = ["spell.lightning_bolt"];

    const opened = applyOk(state, castFromBook(state, "spell.lightning_bolt").action);
    const expert = reaction(opened, "ability.mysticism", "expert");
    expect(expert).toBeTruthy();
    const resolved = passAll(applyOk(opened, expert!.action));

    expect(resolved.combat!.units.unit_p2_skeletons.damage).toBe(2);
  });

  it("the RECALL behaviour is unchanged: expert Mysticism refreshes the Book Spell and hands the enabler back", () => {
    const state = withCrown(polishCombat("mysticism-recall-intact"));
    state.players.p1.hand = [CAST_A_SPELL_CARD_ID, "ability.mysticism"];
    state.players.p1.spellBook = ["spell.magic_arrow"];

    const opened = applyOk(state, castFromBook(state, "spell.magic_arrow").action);
    const resolved = passAll(applyOk(opened, reaction(opened, "ability.mysticism", "expert")!.action));

    expect(resolved.players.p1.spellBook).toContain("spell.magic_arrow");
    expect(resolved.players.p1.spellBookUsed).not.toContain("spell.magic_arrow");
    expect(resolved.players.p1.hand).toContain(CAST_A_SPELL_CARD_ID);
    expect(resolved.players.p1.discard).not.toContain(CAST_A_SPELL_CARD_ID);
    // The Mysticism card itself is spent.
    expect(resolved.players.p1.hand).not.toContain("ability.mysticism");
    expect(resolved.players.p1.discard).toContain("ability.mysticism");
  });

  it("expert Mysticism still sweeps back the support cards played into the cast — which keep their OWN Power", () => {
    // The printed expert rider. The Power statistic really lifted the Arrow to 2
    // damage (its own +1, not Mysticism's), and comes back to hand afterwards.
    const state = withCrown(polishCombat("mysticism-sweeps-supports"));
    state.players.p1.hand = [CAST_A_SPELL_CARD_ID, "ability.mysticism", "stat.power"];
    state.players.p1.spellBook = ["spell.magic_arrow"];

    const opened = applyOk(state, castFromBook(state, "spell.magic_arrow").action);
    const withPower = applyOk(opened, reaction(opened, "stat.power")!.action);
    const expert = reaction(withPower, "ability.mysticism", "expert");
    expect(expert, "expert Mysticism should still be offered after a support card").toBeTruthy();
    const resolved = passAll(applyOk(withPower, expert!.action));

    // 0 printed + 1 from the Power statistic = Power 1 = 2 damage. NOT 3.
    expect(resolved.combat!.units.unit_p2_skeletons.damage).toBe(2);
    expect(resolved.players.p1.hand).toContain("stat.power");
    expect(resolved.players.p1.spellBook).toContain("spell.magic_arrow");
  });

  it("CONTROL: a NON-Polish hand cast never had the bonus and still recalls to hand", () => {
    const state = withCrown(plainCombat("mysticism-plain-hand"));
    state.players.p1.hand = ["spell.magic_arrow", "ability.mysticism"];

    const opened = applyOk(state, castFromHand(state, "spell.magic_arrow").action);
    const expert = reaction(opened, "ability.mysticism", "expert");
    expect(expert).toBeTruthy();
    const resolved = passAll(applyOk(opened, expert!.action));

    expect(resolved.combat!.units.unit_p2_skeletons.damage).toBe(1);
    // Basic recall: the Spell comes back to hand instead of the discard pile.
    expect(resolved.players.p1.hand).toContain("spell.magic_arrow");
  });

  it("CLASS: no non-power reaction offered into a cast window moves that cast's Power", () => {
    // The invariant behind the bug: only a card that PRINTS Power may change a
    // pending cast's Power. Derived from the engine's own offers rather than a
    // hand-written list, so a future non-power in-window join joins the sweep.
    const hand = [
      CAST_A_SPELL_CARD_ID,
      "ability.mysticism",
      "stat.knowledge",
      "ability.scholar",
      "ability.leadership",
      "ability.offense",
      "ability.armorer"
    ];
    const build = (): GameState => {
      const state = withCrown(polishCombat("mysticism-class-sweep"));
      state.players.p1.hand = [...hand];
      state.players.p1.spellBook = ["spell.magic_arrow"];
      state.players.p1.discard = ["spell.bless"];
      return state;
    };

    const probe = build();
    const opened = applyOk(probe, castFromBook(probe, "spell.magic_arrow").action);
    const offers = getLegalActions(opened, "p1").filter((legal) => {
      if (legal.action.type !== "PLAY_REACTION") {
        return false;
      }
      if (legal.action.asPowerBoost) {
        return false;
      }
      // A card that prints Power is ALLOWED to move the cast (the control above).
      return !cardCanBoostPower(cardLibrary[legal.action.cardId]);
    });

    // Non-vacuity: the sweep must really exercise several distinct cards.
    const swept = new Set(
      offers.map((legal) => (legal.action.type === "PLAY_REACTION" ? legal.action.cardId : ""))
    );
    // Non-vacuity floor: today this is Mysticism, Knowledge, Scholar,
    // Leadership, Offense and Armorer (the last two as draw-only joins).
    expect(swept.size, `swept: ${[...swept].join(", ")}`).toBeGreaterThanOrEqual(6);
    expect(swept).toContain("ability.mysticism");

    for (const offer of offers) {
      if (offer.action.type !== "PLAY_REACTION") {
        continue;
      }
      const fresh = build();
      const freshOpened = applyOk(fresh, castFromBook(fresh, "spell.magic_arrow").action);
      const match = getLegalActions(freshOpened, "p1").find(
        (legal) =>
          legal.action.type === "PLAY_REACTION" &&
          offer.action.type === "PLAY_REACTION" &&
          legal.action.cardId === offer.action.cardId &&
          legal.action.mode === offer.action.mode &&
          legal.action.optionIndex === offer.action.optionIndex
      );
      expect(match, `offer for ${offer.action.cardId} should be reproducible`).toBeTruthy();
      const resolved = settle(applyOk(freshOpened, match!.action));
      expect(
        resolved.combat!.units.unit_p2_skeletons.damage,
        `${offer.action.cardId} (${offer.action.mode}) must leave Magic Arrow at Power 0`
      ).toBe(1);
    }
  });
});
