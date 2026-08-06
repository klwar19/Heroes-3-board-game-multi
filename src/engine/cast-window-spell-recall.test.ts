import { describe, expect, it } from "vitest";
import { applyAction, createAdventureGameState, createInitialGameState, getLegalActions } from "./index";
import { CAST_A_SPELL_CARD_ID } from "./polish-spell-book";
import type { GameAction, GameState, PlayerId, UnitId } from "./state";

/**
 * Knowledge / Mysticism recall of a SPELL played as a reaction INTO an enemy's
 * spell cast — the class the user reported as "I was not asked to use knowledge
 * when casting magic mirror".
 *
 * Two cast-window reaction Spells exist (the only spell cards whose printed
 * trigger is SPELL_CAST_STARTED / opponent):
 *   - spell.magic_mirror        → REDIRECT_SPELL (re-points the pending cast)
 *   - spell.protection_from_*   → CANCEL_SPELL   (ends the pending cast)
 * Both close their own reaction window on play, so before this fix there was no
 * window left to play Knowledge/Mysticism into and the card was simply lost to
 * the discard — even though Mysticism prints "Play immediately after casting a
 * spell; take the Spell card back into your hand instead of discarding it".
 *
 * The attack-window twin (Magic Mirror reflecting a Curse, Stone Skin, …) has
 * always worked; it is the CONTROL in `knowledge-recall-instants.test.ts`.
 *
 * Sandbox grades (createInitialGameState): p1 marksmen/griffins bronze,
 * crusaders silver; p2 skeletons bronze, vampires silver, dread_knights gold.
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

/** p2 (defender) casts Magic Arrow at one of p1's units; p1 holds `p1Hand`. */
function castAtP1(p1Hand: string[], targetUnitId: UnitId = "unit_p1_griffins"): GameState {
  const state = createInitialGameState("cast-window-recall");
  state.players.p1.hand = [...p1Hand];
  state.players.p2.hand = ["spell.magic_arrow"];
  state.activePlayerId = "p2";
  state.combat!.activeUnitId = "unit_p2_skeletons";
  state.combat!.units.unit_p2_skeletons.activatedThisRound = false;
  return applyOk(state, {
    type: "CAST_SPELL",
    playerId: "p2",
    cardId: "spell.magic_arrow",
    target: { type: "unit", unitId: targetUnitId }
  });
}

function reactionOffers(state: GameState, playerId: PlayerId, cardId: string) {
  return getLegalActions(state, playerId)
    .filter(
      (legal) =>
        legal.action.type === "PLAY_REACTION" && legal.action.cardId === cardId && !legal.action.asPowerBoost
    )
    .map((legal) => legal.action as Extract<GameAction, { type: "PLAY_REACTION" }>);
}

function chooseRedirect(state: GameState, playerId: PlayerId, targetUnitId: UnitId): GameState {
  const choice = state.pendingChoice;
  if (!choice || choice.type !== "ABILITY_TARGET_CHOICE" || choice.kind !== "spell-redirect") {
    throw new Error("expected an open spell-redirect choice");
  }
  return applyOk(state, { type: "CHOOSE_ABILITY_TARGET", playerId, choiceId: choice.id, targetUnitId });
}

function passUntilSettled(state: GameState): GameState {
  let current = state;
  let safety = 40;
  while (current.reactionWindow && safety > 0) {
    safety -= 1;
    current = applyOk(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
  }
  return current;
}

/** Plays the bronze (free) Magic Mirror redirect and bounces the spell onto the skeletons. */
function mirrorOntoSkeletons(state: GameState): GameState {
  const mirror = reactionOffers(state, "p1", "spell.magic_mirror").find((action) => action.optionIndex === 0);
  expect(mirror, "bronze Magic Mirror redirect should be offered").toBeTruthy();
  return chooseRedirect(applyOk(state, mirror!), "p1", "unit_p2_skeletons");
}

describe("Magic Mirror — Knowledge / Mysticism recall of the Mirror itself", () => {
  it("offers the recall after the new target is picked, and returns Magic Mirror to hand while the bounced spell still lands", () => {
    let state = mirrorOntoSkeletons(castAtP1(["spell.magic_mirror", "stat.knowledge"]));

    // A recall-only cast window re-opened for the Mirror's caster BEFORE the
    // bounced spell resolves (the cast is still parked on the stack).
    expect(state.reactionWindow, "a recall window should re-open after the redirect").toBeTruthy();
    expect(state.reactionWindow!.priorityPlayerId).toBe("p1");
    expect(state.stack).toHaveLength(1);
    expect(state.combat!.units.unit_p2_skeletons.damage).toBe(0);

    const knowledge = reactionOffers(state, "p1", "stat.knowledge");
    expect(knowledge.length, "Knowledge must be offered on the Mirror you just cast").toBeGreaterThan(0);

    state = applyOk(state, knowledge.find((action) => action.mode === "basic")!);

    // OBSERVABLE: the Mirror is back in hand (not the discard) AND the redirect
    // still happened — the Magic Arrow hit the chosen new target, not the griffins.
    expect(state.players.p1.hand).toContain("spell.magic_mirror");
    expect(state.players.p1.discard).not.toContain("spell.magic_mirror");
    expect(state.combat!.units.unit_p2_skeletons.damage).toBe(1);
    expect(state.combat!.units.unit_p1_griffins.damage).toBe(0);
    expect(state.stack).toHaveLength(0);
    expect(state.reactionWindow).toBeNull();
    expect(state.pendingChoice).toBeNull();
    expect(state.phase).toBe("combat");
  });

  it("declining the recall resolves the bounced spell exactly as before (the Mirror stays discarded)", () => {
    const state = passUntilSettled(mirrorOntoSkeletons(castAtP1(["spell.magic_mirror", "stat.knowledge"])));

    expect(state.players.p1.discard).toContain("spell.magic_mirror");
    expect(state.players.p1.hand).not.toContain("spell.magic_mirror");
    expect(state.combat!.units.unit_p2_skeletons.damage).toBe(1);
    expect(state.combat!.units.unit_p1_griffins.damage).toBe(0);
    expect(state.stack).toHaveLength(0);
    expect(state.phase).toBe("combat");
  });

  it("CONTROL: with no recall card in hand nothing is held open — the bounced spell resolves at once", () => {
    const state = mirrorOntoSkeletons(castAtP1(["spell.magic_mirror"]));

    expect(state.reactionWindow).toBeNull();
    expect(state.stack).toHaveLength(0);
    expect(state.combat!.units.unit_p2_skeletons.damage).toBe(1);
    expect(state.players.p1.discard).toContain("spell.magic_mirror");
  });

  it("offers ONLY the recall in that window — never a second Magic Mirror on the already-redirected spell", () => {
    const state = mirrorOntoSkeletons(
      castAtP1(["spell.magic_mirror", "spell.magic_mirror", "stat.knowledge"])
    );

    expect(state.reactionWindow!.allowedPlayerIds).toEqual(["p1"]);
    expect(reactionOffers(state, "p1", "spell.magic_mirror")).toEqual([]);
    expect(reactionOffers(state, "p1", "stat.knowledge").length).toBeGreaterThan(0);
    // The caster of the bounced spell gets no new look either.
    expect(getLegalActions(state, "p2").filter((legal) => legal.action.type === "PLAY_REACTION")).toEqual([]);
  });

  it("expert Mysticism also takes back the Power source paid for a silver-grade Mirror", () => {
    let state = castAtP1(["spell.magic_mirror", "stat.power", "ability.mysticism"]);
    state = applyOk(state, {
      type: "PLAY_REACTION",
      playerId: "p1",
      cardId: "spell.magic_mirror",
      mode: "basic",
      optionIndex: 1,
      costCardIds: ["stat.power"]
    });
    state = chooseRedirect(state, "p1", "unit_p2_vampires");
    expect(state.players.p1.discard).toEqual(
      expect.arrayContaining(["stat.power", "spell.magic_mirror"])
    );

    const mysticism = reactionOffers(state, "p1", "ability.mysticism").find(
      (action) => action.mode === "expert"
    );
    expect(mysticism, "expert Mysticism should be offered").toBeTruthy();
    state = applyOk(state, mysticism!);

    // Both the Spell and the card played with it are back in hand; the silver
    // redirect still landed on the silver vampires.
    expect(state.players.p1.hand).toContain("spell.magic_mirror");
    expect(state.players.p1.hand).toContain("stat.power");
    expect(state.players.p1.discard).not.toContain("stat.power");
    expect(state.combat!.units.unit_p2_vampires.damage).toBe(1);
    expect(state.combat!.units.unit_p1_griffins.damage).toBe(0);
  });
});

describe("Protection from X — Knowledge / Mysticism recall of the counter itself", () => {
  it("holds the cast window open for the recall: the spell is still cancelled and the Spell comes back to hand", () => {
    let state = castAtP1(["spell.protection_from_air", "stat.knowledge"]);
    state = applyOk(state, {
      type: "PLAY_REACTION",
      playerId: "p1",
      cardId: "spell.protection_from_air",
      mode: "basic"
    });

    expect(state.reactionWindow, "the cast window is held open for the recall").toBeTruthy();
    expect(state.reactionWindow!.allowedPlayerIds).toEqual(["p1"]);

    const knowledge = reactionOffers(state, "p1", "stat.knowledge");
    expect(knowledge.length).toBeGreaterThan(0);
    state = applyOk(state, knowledge.find((action) => action.mode === "basic")!);

    // OBSERVABLE: the Magic Arrow never dealt its damage (cancelled) AND the
    // Protection card is back in hand instead of the discard.
    expect(state.combat!.units.unit_p1_griffins.damage).toBe(0);
    expect(state.eventLog.some((event) => event.type === "SPELL_CAST_CANCELLED")).toBe(true);
    expect(state.players.p1.hand).toContain("spell.protection_from_air");
    expect(state.players.p1.discard).not.toContain("spell.protection_from_air");
    expect(state.stack).toHaveLength(0);
    expect(state.reactionWindow).toBeNull();
    expect(state.phase).toBe("combat");
  });

  it("CONTROL: holding no recall card closes the window on the cancel exactly as before", () => {
    const state = applyOk(castAtP1(["spell.protection_from_air"]), {
      type: "PLAY_REACTION",
      playerId: "p1",
      cardId: "spell.protection_from_air",
      mode: "basic"
    });

    expect(state.reactionWindow).toBeNull();
    expect(state.stack).toHaveLength(0);
    expect(state.phase).toBe("combat");
    expect(state.combat!.units.unit_p1_griffins.damage).toBe(0);
    expect(state.players.p1.discard).toContain("spell.protection_from_air");
  });

  it("CONTROL: Resistance is an ABILITY, not a Spell — no recall window, the card stays discarded", () => {
    const state = applyOk(castAtP1(["ability.resistance", "stat.knowledge"]), {
      type: "PLAY_REACTION",
      playerId: "p1",
      cardId: "ability.resistance",
      mode: "basic"
    });

    expect(state.reactionWindow).toBeNull();
    expect(state.players.p1.discard).toContain("ability.resistance");
    expect(state.players.p1.hand).not.toContain("ability.resistance");
    expect(state.combat!.units.unit_p1_griffins.damage).toBe(0);
  });
});

/**
 * Polish Spell Book: an owned Spell lives in the Book and is cast by spending a
 * "Cast a Spell" enabler from hand, so the recall reading is the attack-window
 * one — Knowledge hands the ENABLER back and leaves the Spell used; Mysticism
 * additionally refreshes the used Book Spell.
 */
describe("Magic Mirror from the POLISH Spell Book — the recall follows the Book reading", () => {
  function polishMirrorCast(recallCardId: string): GameState {
    const state = createInitialGameState("polish-cast-window-recall");
    const adventure = createAdventureGameState({
      startingBuildings: [],
      seed: "polish-cast-window-recall-rules",
      ruleset: "binh",
      rollFirstPlayer: false,
      houseRules: { "polish-spell-book": true }
    });
    state.adventure = adventure.adventure;
    state.ruleset = "binh";
    state.players.p1.hand = [CAST_A_SPELL_CARD_ID, recallCardId];
    state.players.p1.discard = [];
    state.players.p1.spellBook = ["spell.magic_mirror"];
    state.players.p1.spellBookUsed = [];
    // Under Polish rules an owned Spell is only castable from the Book with an
    // enabler — that goes for the enemy's Magic Arrow too.
    state.players.p2.hand = [CAST_A_SPELL_CARD_ID];
    state.players.p2.discard = [];
    state.players.p2.spellBook = ["spell.magic_arrow"];
    state.players.p2.spellBookUsed = [];
    state.activePlayerId = "p2";
    state.combat!.activeUnitId = "unit_p2_skeletons";
    state.combat!.units.unit_p2_skeletons.activatedThisRound = false;
    const cast = applyOk(state, {
      type: "CAST_SPELL",
      playerId: "p2",
      cardId: "spell.magic_arrow",
      target: { type: "unit", unitId: "unit_p1_griffins" },
      fromSpellBook: true,
      castEnablerCardId: CAST_A_SPELL_CARD_ID
    });

    const mirror = reactionOffers(cast, "p1", "spell.magic_mirror").find(
      (action) => action.optionIndex === 0 && action.fromSpellBook === true
    );
    expect(mirror, "the Book Magic Mirror should be offered with its Cast a Spell enabler").toBeTruthy();
    expect(mirror!.castEnablerCardId).toBe(CAST_A_SPELL_CARD_ID);
    return chooseRedirect(applyOk(cast, mirror!), "p1", "unit_p2_skeletons");
  }

  it("Knowledge returns the Cast a Spell enabler and leaves the Book Spell used", () => {
    let state = polishMirrorCast("stat.knowledge");
    expect(state.players.p1.spellBookUsed).toContain("spell.magic_mirror");

    const knowledge = reactionOffers(state, "p1", "stat.knowledge").find((action) => action.mode === "basic");
    expect(knowledge, "Knowledge must be offered on a Book-cast Magic Mirror too").toBeTruthy();
    state = applyOk(state, knowledge!);

    expect(state.players.p1.hand).toContain(CAST_A_SPELL_CARD_ID);
    expect(state.players.p1.spellBookUsed).toContain("spell.magic_mirror");
    expect(state.players.p1.spellBook).not.toContain("spell.magic_mirror");
    // The redirect still landed.
    expect(state.combat!.units.unit_p2_skeletons.damage).toBe(1);
    expect(state.combat!.units.unit_p1_griffins.damage).toBe(0);
  });

  it("Mysticism refreshes the used Book Spell as well as returning the enabler", () => {
    let state = polishMirrorCast("ability.mysticism");
    const mysticism = reactionOffers(state, "p1", "ability.mysticism").find((action) => action.mode === "basic");
    expect(mysticism).toBeTruthy();
    state = applyOk(state, mysticism!);

    expect(state.players.p1.spellBook).toContain("spell.magic_mirror");
    expect(state.players.p1.spellBookUsed).not.toContain("spell.magic_mirror");
    expect(state.players.p1.hand).toContain(CAST_A_SPELL_CARD_ID);
    expect(state.combat!.units.unit_p2_skeletons.damage).toBe(1);
  });
});

describe("CONTROL — the ordinary own-cast recall is unchanged", () => {
  it("still offers Knowledge on your own plain damage cast, and takes that spell back", () => {
    const state = createInitialGameState("cast-window-recall-control");
    state.players.p1.hand = ["spell.magic_arrow", "stat.knowledge"];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_marksmen";
    state.combat!.units.unit_p1_marksmen.activatedThisRound = false;
    let current = applyOk(state, {
      type: "CAST_SPELL",
      playerId: "p1",
      cardId: "spell.magic_arrow",
      target: { type: "unit", unitId: "unit_p2_skeletons" }
    });

    const knowledge = reactionOffers(current, "p1", "stat.knowledge");
    expect(knowledge.length).toBeGreaterThan(0);
    current = passUntilSettled(applyOk(current, knowledge.find((action) => action.mode === "basic")!));

    expect(current.combat!.units.unit_p2_skeletons.damage).toBe(1);
    expect(current.players.p1.hand).toContain("spell.magic_arrow");
    expect(current.players.p1.discard).not.toContain("spell.magic_arrow");
  });
});
