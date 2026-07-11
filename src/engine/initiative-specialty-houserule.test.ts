import { describe, expect, it } from "vitest";
import { adventureCards } from "@/data/cards/adventure";
import { applyAction, createInitialGameState, getLegalActions, getUnitMoveRange } from "./index";
import { effectiveInitiative } from "./active-effects";
import type { GameAction, GameState, UnitId } from "./state";

// ---------------------------------------------------------------------------
// House rule (BINH): every hero specialty whose ONLY effect was to BUFF a
// friendly unit's Initiative is now a CHOOSE_ONE:
//   • Option A — the initiative buff, which ALSO grants +1 Combat movement range
//     (the Initiative number still doubles for the signature unit; the +1 move is
//     a flat bonus, never doubled).
//   • Option B — draw 1 card instead.
// These are produced by the shared `unitInitiativeSpecialty` helper, plus Cyra's
// inline "Haste I". This file proves the EFFECT (movement actually grows, a card
// is actually drawn), not just the card shape.
// ---------------------------------------------------------------------------

// Every initiative-only-buff specialty the house rule touches.
const INITIATIVE_SPECIALTY_IDS = [
  "specialty.catherine.6",
  "specialty.tamika.6",
  "specialty.mutare.6",
  "specialty.gelu.6",
  "specialty.shiva.6",
  "specialty.yog.4",
  "specialty.bron.6",
  "specialty.wystan.6",
  "specialty.dracon.6",
  "specialty.erdamon.4",
  "specialty.monere.4",
  "specialty.pasis.1",
  "specialty.clancy.4",
  "specialty.dhuin.6",
  "specialty.creyle.6",
  // Eikthurn VI is NOT in this sweep: his level-6 trades the generic "draw a card"
  // alternative for a flat +2 Attack (initiative-buff OR +2 attack), so it is not
  // the buff-or-draw shape this file asserts. It is covered in bulwark-heroes.test.ts.
  "specialty.tarnum_rampart.4",
  "specialty.cassiopeia.4",
  "specialty.casmetra.4",
  "specialty.cyra.1"
] as const;

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

/** A PLAY_CARD legal action for a specific CHOOSE_ONE option (optionally at a unit). */
function findOption(state: GameState, cardId: string, optionIndex: number, unitId?: UnitId) {
  return getLegalActions(state, "p1").find(
    (legal) =>
      legal.action.type === "PLAY_CARD" &&
      legal.action.cardId === cardId &&
      legal.action.optionIndex === optionIndex &&
      (unitId === undefined ||
        (legal.action.target?.type === "unit" && legal.action.target.unitId === unitId))
  );
}

/** Normalise a unit to a plain ground unit (base Combat movement 3, no abilities). */
function ground(state: GameState, id: UnitId) {
  const unit = state.combat!.units[id];
  unit.type = "ground";
  unit.abilities = [];
  return unit;
}

describe("Initiative-only specialties are now CHOOSE_ONE buff-or-draw (structure sweep)", () => {
  it("every one is a CHOOSE_ONE: option A = initiative buff + movementBonus 1, option B = draw 1", () => {
    for (const id of INITIATIVE_SPECIALTY_IDS) {
      const card = adventureCards[id];
      expect(card, id).toBeTruthy();
      expect(card.effect.type, `${id} should be a CHOOSE_ONE`).toBe("CHOOSE_ONE");
      if (card.effect.type !== "CHOOSE_ONE") {
        continue;
      }
      const [buff, draw] = card.effect.options;
      expect(buff.effect.type, `${id} option A is the initiative buff`).toBe("CREATE_INITIATIVE_BUFF");
      if (buff.effect.type === "CREATE_INITIATIVE_BUFF") {
        // The house-rule rider: the buff also raises Combat movement by 1.
        expect(buff.effect.movementBonus, `${id} option A grants +1 movement`).toBe(1);
        expect(buff.effect.polarity, `${id} option A is a positive buff`).toBe("positive");
      }
      expect(draw.effect, `${id} option B draws 1 card`).toMatchObject({ type: "DRAW_CARDS", amount: 1 });
    }
  });
});

describe("Initiative specialty option A — buff lands AND raises movement", () => {
  it("Catherine VI on a non-signature unit: +1 initiative AND +1 movement (BINH only)", () => {
    const state = createInitialGameState("init-hr-a");
    state.players.p1.hand = ["specialty.catherine.6"];
    const griffin = ground(state, "unit_p1_griffins");
    const beforeInit = effectiveInitiative(griffin, state.activeEffects);
    expect(getUnitMoveRange(griffin, state), "base move 3 before the buff").toBe(3);

    const play = findOption(state, "specialty.catherine.6", 0, "unit_p1_griffins");
    expect(play, "option A targets a friendly unit").toBeTruthy();
    const after = applyOk(state, play!.action);

    const buffed = after.combat!.units.unit_p1_griffins;
    expect(effectiveInitiative(buffed, after.activeEffects), "+1 initiative").toBe(beforeInit + 1);
    expect(getUnitMoveRange(buffed, after), "+1 movement (3 → 4) under BINH").toBe(4);

    // Control: legacy ignores the movement house rule (the initiative still rises).
    const legacy = { ...after, ruleset: "legacy" as const };
    expect(getUnitMoveRange(legacy.combat!.units.unit_p1_griffins, legacy), "legacy keeps move at 3").toBe(3);
  });

  it("the Initiative doubles for the signature unit, but the +1 movement stays FLAT", () => {
    const state = createInitialGameState("init-hr-double");
    state.players.p1.hand = ["specialty.catherine.6"];
    const crusaders = ground(state, "unit_p1_crusaders");
    crusaders.name = "Crusaders"; // signature unit → initiative doubled
    const beforeInit = effectiveInitiative(crusaders, state.activeEffects);

    const play = findOption(state, "specialty.catherine.6", 0, "unit_p1_crusaders");
    const after = applyOk(state, play!.action);
    const buffed = after.combat!.units.unit_p1_crusaders;

    expect(effectiveInitiative(buffed, after.activeEffects), "initiative doubled (+2)").toBe(beforeInit + 2);
    // The movement bonus is NOT doubled — it is a flat +1 for everyone.
    expect(getUnitMoveRange(buffed, after), "movement is a flat +1 (3 → 4), never +2").toBe(4);
  });

  it("Cyra's Haste I option A: +3 initiative AND +1 movement", () => {
    const state = createInitialGameState("init-hr-cyra");
    state.players.p1.hand = ["specialty.cyra.1"];
    const griffin = ground(state, "unit_p1_griffins");
    const beforeInit = effectiveInitiative(griffin, state.activeEffects);

    const play = findOption(state, "specialty.cyra.1", 0, "unit_p1_griffins");
    expect(play, "Cyra I option A targets a friendly unit").toBeTruthy();
    const after = applyOk(state, play!.action);
    const buffed = after.combat!.units.unit_p1_griffins;

    expect(effectiveInitiative(buffed, after.activeEffects), "+3 initiative").toBe(beforeInit + 3);
    expect(getUnitMoveRange(buffed, after), "+1 movement (3 → 4)").toBe(4);
  });
});

describe("Initiative specialty option B — draw a card instead of buffing", () => {
  it("draws exactly one card (deck shrinks by 1, the top card lands in hand) and lands NO buff", () => {
    const state = createInitialGameState("init-hr-draw");
    state.players.p1.hand = ["specialty.catherine.6"];
    state.players.p1.deck = ["spell.haste"]; // a single, known top card
    ground(state, "unit_p1_griffins");
    const beforeMove = getUnitMoveRange(state.combat!.units.unit_p1_griffins, state);

    const draw = findOption(state, "specialty.catherine.6", 1);
    expect(draw, "option B (draw) is offered with no unit target").toBeTruthy();
    expect(draw!.action.type === "PLAY_CARD" && draw!.action.target?.type, "draw option needs no target").toBe(
      "none"
    );
    const after = applyOk(state, draw!.action);

    expect(after.players.p1.deck.length, "one card drawn off the deck").toBe(0);
    expect(after.players.p1.hand, "the drawn card is now in hand").toContain("spell.haste");
    // Control: choosing the draw lands no initiative/movement buff on any unit.
    expect(after.activeEffects.length, "no buff active effect was created").toBe(0);
    expect(getUnitMoveRange(after.combat!.units.unit_p1_griffins, after), "movement unchanged").toBe(beforeMove);
  });

  it("option A (the buff) does NOT touch the deck — only option B draws (control)", () => {
    const state = createInitialGameState("init-hr-draw-control");
    state.players.p1.hand = ["specialty.catherine.6"];
    state.players.p1.deck = ["spell.haste"];
    ground(state, "unit_p1_griffins");

    const play = findOption(state, "specialty.catherine.6", 0, "unit_p1_griffins");
    const after = applyOk(state, play!.action);
    expect(after.players.p1.deck.length, "the buff option draws nothing").toBe(1);
  });
});

describe("combat-move-initiative toggle — the +1 move is gated by the house rule, not the mode", () => {
  it("OFF in a BINH game: the buff still raises Initiative but no longer grants +1 movement", () => {
    const state = createInitialGameState("init-hr-toggle-off");
    state.players.p1.hand = ["specialty.catherine.6"];
    const griffin = ground(state, "unit_p1_griffins");
    const beforeInit = effectiveInitiative(griffin, state.activeEffects);

    const play = findOption(state, "specialty.catherine.6", 0, "unit_p1_griffins");
    const after = applyOk(state, play!.action);
    const buffed = after.combat!.units.unit_p1_griffins;

    // Default (rule ON in this BINH sandbox): +1 Initiative AND +1 movement.
    expect(effectiveInitiative(buffed, after.activeEffects), "+1 initiative").toBe(beforeInit + 1);
    expect(getUnitMoveRange(buffed, after), "+1 movement (3 → 4) with the rule on").toBe(4);
    expect(after.ruleset, "still a BINH game").toBe("binh");

    // Freeze the toggle OFF while STILL a BINH game (ruleset unchanged): the
    // Initiative buff persists, but the movement rider is gated away — proving it
    // is the toggle, not the mode, that controls it.
    const off = {
      ...after,
      adventure: { houseRules: { "combat-move-initiative": false } }
    } as unknown as GameState;
    expect(off.ruleset, "still BINH — only the toggle changed").toBe("binh");
    expect(
      effectiveInitiative(off.combat!.units.unit_p1_griffins, off.activeEffects),
      "initiative buff still applies"
    ).toBe(beforeInit + 1);
    expect(getUnitMoveRange(off.combat!.units.unit_p1_griffins, off), "movement back to base 3 (toggle off)").toBe(3);
  });
});

describe("Initiative specialty offers", () => {
  it("offers option A for each friendly unit and option B exactly once", () => {
    const state = createInitialGameState("init-hr-offers");
    state.players.p1.hand = ["specialty.catherine.6"];

    const optionAPlays = getLegalActions(state, "p1").filter(
      (legal) =>
        legal.action.type === "PLAY_CARD" &&
        legal.action.cardId === "specialty.catherine.6" &&
        legal.action.optionIndex === 0
    );
    const optionBPlays = getLegalActions(state, "p1").filter(
      (legal) =>
        legal.action.type === "PLAY_CARD" &&
        legal.action.cardId === "specialty.catherine.6" &&
        legal.action.optionIndex === 1
    );

    // p1 has three friendly units → option A is offered three times (one per unit).
    expect(optionAPlays.length, "option A offered per friendly unit").toBe(3);
    expect(optionBPlays.length, "option B offered exactly once (no target)").toBe(1);
  });
});
