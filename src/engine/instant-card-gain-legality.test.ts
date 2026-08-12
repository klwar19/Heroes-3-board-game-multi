import { cardLibrary } from "@/data/cards/library";
import { describe, expect, it } from "vitest";
import {
  applyAction,
  createAdventureGameState,
  createInitialGameState,
  getLegalActions,
  getMainHero,
  getPlayerView
} from "./index";
import { chooseComputerAction } from "./computer/policy";
import { nextAfkDropAction } from "./afk-drop";
import type { CardId, CardOptionDefinition, GameAction, GameState } from "./state";

type GainFace = { cardId: string; optionIndex?: number; option?: CardOptionDefinition; type: "draw" | "recover" };

/** The shape mapState / the offer helpers need — the two face types share it. */
type AnyFace = { cardId: string; optionIndex?: number; option?: CardOptionDefinition };

function hasDrawRider(effect: CardOptionDefinition["effect"]): boolean {
  return (
    ((effect.type === "ADD_COMBAT_STAT" ||
      effect.type === "ADD_SPELL_POWER" ||
      effect.type === "HEAL_DAMAGE" ||
      effect.type === "HEAL_DAMAGE_AND_REMOVE_EFFECTS" ||
      effect.type === "GAIN_RUNES" ||
      effect.type === "GAIN_HERO_MOVEMENT") &&
      Boolean(effect.drawCards)) ||
    (effect.type === "GAIN_MORALE" && Boolean(effect.expertDrawCards))
  );
}

const gainFaces: GainFace[] = Object.entries(cardLibrary).flatMap(([cardId, card]) => {
  if (card.timing !== "instant" || card.implementationStatus !== "implemented") return [];
  if (card.effect.type === "DRAW_CARDS" || card.effect.type === "TAKE_FROM_DISCARD") {
    return [{ cardId, type: card.effect.type === "DRAW_CARDS" ? "draw" as const : "recover" as const }];
  }
  if (card.effect.type !== "CHOOSE_ONE") return [];
  return card.effect.options.flatMap((option, optionIndex) =>
    option.effect.type === "DRAW_CARDS" || option.effect.type === "TAKE_FROM_DISCARD"
      ? [{ cardId, optionIndex, option, type: option.effect.type === "DRAW_CARDS" ? "draw" as const : "recover" as const }]
      : []
  );
});

const riderFaces: GainFace[] = Object.entries(cardLibrary).flatMap(([cardId, card]) => {
  if (card.timing !== "instant" || card.implementationStatus !== "implemented") return [];
  if (card.effect.type !== "CHOOSE_ONE") {
    return hasDrawRider(card.effect) ? [{ cardId, type: "draw" as const }] : [];
  }
  return card.effect.options.flatMap((option, optionIndex) =>
    hasDrawRider(option.effect) ? [{ cardId, optionIndex, option, type: "draw" as const }] : []
  );
});

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function takeableDiscard(): string[] {
  return ["stat.attack", "ability.offense", "spell.magic_arrow", "specialty.rion.1"];
}

function mapState(face: AnyFace): GameState {
  let state = createAdventureGameState({ seed: `instant-map-${face.cardId}-${face.optionIndex ?? -1}`, rollFirstPlayer: false });
  if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
    state = applyOk(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
  }
  state.players.p1.hand = [face.cardId, "stat.defense", "stat.power", "ability.armorer", "spell.bless"];
  state.players.p1.discard = face.option?.requiresEmptyDiscard ? [] : takeableDiscard();
  const hero = getMainHero(state, "p1");
  if (hero?.spaceId && state.adventure?.fields[hero.spaceId]) {
    state.adventure.fields[hero.spaceId].terrain = "water";
  }
  return state;
}

function reactionState(face: GainFace): GameState {
  const state = createInitialGameState(`instant-reaction-${face.cardId}-${face.optionIndex ?? -1}`);
  state.players.p1.hand = ["spell.magic_arrow"];
  state.players.p2.hand = [face.cardId, "ability.resistance", "stat.defense", "stat.power", "spell.bless"];
  state.players.p2.discard = face.option?.requiresEmptyDiscard ? [] : takeableDiscard();
  state.players.p2.deck = ["stat.knowledge", "stat.attack", "spell.stone_skin"];
  return applyOk(state, {
    type: "CAST_SPELL",
    playerId: "p1",
    cardId: "spell.magic_arrow",
    target: { type: "unit", unitId: "unit_p2_vampires" }
  });
}

describe("all Instant draw/recovery faces", () => {
  it("inventory includes the reported Skull Helmet and representative draw cards", () => {
    const ids = gainFaces.map((face) => face.cardId);
    expect(ids).toContain("artifact.skull_helmet");
    expect(ids).toContain("artifact.breastplate_of_petrified_wood");
    expect(ids).toContain("ability.scholar");
  });

  it("offers every direct draw/recovery face on the adventure map", () => {
    for (const face of gainFaces) {
      const offered = getLegalActions(mapState(face), "p1").some(
        (legal) =>
          legal.action.type === "PLAY_CARD" &&
          legal.action.cardId === face.cardId &&
          legal.action.optionIndex === face.optionIndex
      );
      expect(offered, `${face.cardId} option ${face.optionIndex ?? "direct"} must work on the map`).toBe(true);
    }
  });

  it("offers every direct draw/recovery face inside an existing reaction window", () => {
    for (const face of gainFaces) {
      const reacts = getLegalActions(reactionState(face), "p2").some(
        (legal) =>
          legal.action.type === "PLAY_REACTION" &&
          legal.action.cardId === face.cardId &&
          legal.action.optionIndex === face.optionIndex
      );
      // A printed MAP-ONLY draw side (e.g. MGQ Ilias IV option 1, the pure-draw
      // twin of its combatAnytime immunity option) is an ABSOLUTE bar to a
      // combat window — the same rule riderFaces asserts below. Its map half is
      // pinned by the map sweep above.
      if (face.option?.mapOnly) {
        expect(reacts, `${face.cardId} option ${face.optionIndex ?? "direct"} mapOnly side must NOT react`).toBe(false);
        continue;
      }
      expect(reacts, `${face.cardId} option ${face.optionIndex ?? "direct"} must work as a reaction`).toBe(true);
    }
  });
});

describe("draw riders may be used without their primary effect", () => {
  it("offers every Instant draw-rider face on both the map and in a reaction window", () => {
    for (const face of riderFaces) {
      const mapOffer = getLegalActions(mapState(face), "p1").some(
        (legal) =>
          legal.action.type === "PLAY_CARD" &&
          legal.action.cardId === face.cardId &&
          legal.action.optionIndex === face.optionIndex
      );
      expect(mapOffer, `${face.cardId} option ${face.optionIndex ?? "direct"} draw rider must work on map`).toBe(true);

      // A printed MAP-ONLY side (Shield of Naval Glory's "On a Sea tile" face)
      // never joins a combat window: a utility join must not override a
      // printed zone restriction. Its map half is asserted above.
      if (face.option?.mapOnly) {
        const reactionOffer = getLegalActions(reactionState(face), "p2").some(
          (legal) =>
            legal.action.type === "PLAY_REACTION" &&
            legal.action.cardId === face.cardId &&
            legal.action.optionIndex === face.optionIndex
        );
        expect(reactionOffer, `${face.cardId} mapOnly side must NOT react`).toBe(false);
        continue;
      }

      const reactionOffer = getLegalActions(reactionState(face), "p2").some(
        (legal) =>
          legal.action.type === "PLAY_REACTION" &&
          legal.action.cardId === face.cardId &&
          legal.action.optionIndex === face.optionIndex
      );
      expect(reactionOffer, `${face.cardId} option ${face.optionIndex ?? "direct"} draw rider must react`).toBe(true);
    }
  });

  it("plays Offense during a spell window for its draw only", () => {
    let state = createInitialGameState("offense-reaction-draw-only");
    state.players.p1.hand = ["spell.magic_arrow", "ability.offense"];
    state.players.p1.deck = ["stat.knowledge"];
    state.players.p2.hand = ["ability.resistance"];
    state = applyOk(state, {
      type: "CAST_SPELL",
      playerId: "p1",
      cardId: "spell.magic_arrow",
      target: { type: "unit", unitId: "unit_p2_vampires" }
    });

    const offer = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === "ability.offense"
    );
    expect(offer?.action.type === "PLAY_REACTION" && offer.action.drawOnly).toBe(true);
    state = applyOk(state, offer!.action);
    expect(state.players.p1.hand).toContain("stat.knowledge");
    expect(state.players.p1.discard).toContain("ability.offense");
    expect(state.reactionWindow).toBeTruthy();
  });
});

// ===========================================================================
// THE FULL CARD-GAIN SWEEP (2026-08-10)
//
// Report: "Solmyr 4 can't be used in map => STILL VERY BUGGY, I ALREADY TOLD U
// TO MAKE ALL INSTANT CARDS LIKE THAT CAN BE USED IN MAP AND AS REACTION
// WINDOW, CHECK ALL."
//
// The sweeps above only ever walked `timing === "instant"` cards, and only the
// DRAW_CARDS / TAKE_FROM_DISCARD faces plus the "then draw N" riders. Two whole
// axes were therefore invisible to them:
//   * TIMING — `specialty.solmyr.4` ("Discard up to 3 cards from your Might and
//     Magic deck and return 1 of them to your hand") and `specialty.ingham.6`
//     ("… — OR — Draw 1 card") both shipped as `timing: "combat"`, which is the
//     exact gate addTurnCardActions (map) and allowTriggerlessUtility (reaction
//     window) key off. Neither could be played on the map or in a window at all.
//   * EFFECT KIND — the deck DIG / SEARCH families (DECK_DIG_KEEP_ONE,
//     DECK_DIG_KEEP_MATCHING, SEARCH_DECK_THEN_RESHUFFLE, DRAW_TOP_ARTIFACT,
//     CARD_DECK_SEARCH, EAGLE_EYE_DIG, REMOVE_HAND_CARD_THEN_SEARCH) had a map
//     play but no reaction-window join.
//
// This sweep is LIBRARY-DERIVED over BOTH axes, so a new card-gain face cannot
// ship without a map play and a window join — or a conscious, justified entry in
// DOCUMENTED_WINDOW_EXCLUSIONS below.
// ===========================================================================

/** Every effect kind that hands the player cards, from any zone. */
const CARD_GAIN_EFFECT_KINDS = new Set([
  "DRAW_CARDS",
  "TAKE_FROM_DISCARD",
  "RESHUFFLE_DISCARD_THEN_DRAW",
  "DECK_DIG_KEEP_ONE",
  "DECK_DIG_KEEP_MATCHING",
  "SEARCH_DECK_THEN_RESHUFFLE",
  "DRAW_TOP_ARTIFACT",
  "CARD_DECK_SEARCH",
  "EAGLE_EYE_DIG",
  "REMOVE_HAND_CARD_THEN_SEARCH"
]);

/**
 * Faces that must NOT be offered in an open window, each with the rule that
 * withholds it. No silent gaps: anything else the sweep finds is a bug.
 */
const DOCUMENTED_WINDOW_EXCLUSIONS: Record<string, string> = {
  // A printed `mapOnly` side is an ABSOLUTE bar — a utility join must never
  // override a printed zone restriction (the Shield-of-Naval-Glory rule).
  "wog.artifact.magic_wand#0":
    "printed mapOnly: 'Remove this card: Search (1) the Artifact deck' is a map side",
  // The shared trap-twin dedupe (`cardHasPrintedTriggerMatch`): when ANOTHER
  // side of the same card genuinely matches THIS window's printed trigger, the
  // card's remaining sides never join as trigger-free utility — the join would
  // be a strictly-worse twin of the real reaction. Kriv VI option 1 is a printed
  // "React to an enemy attack: gain 3 Runes".
  "specialty.kriv.6#2":
    "trap-twin dedupe: option 1 is a printed UNIT_ATTACK_DECLARED reaction on the same card",
  // MGQ Ilias IV / Granberia I: a printed `mapOnly` pure-draw twin of a real
  // combat face (Ilias' combatAnytime immunity-draw, Granberia's attack-window
  // reaction). A mapOnly side is an absolute window bar; the map play is pinned
  // by the map sweep above.
  "specialty.ilias.4#1": "printed mapOnly: pure-draw twin of the combatAnytime immunity option",
  "specialty.granberia.1#1": "printed mapOnly: pure-draw twin of the attack-window +1 Attack reaction"
};

type SweepFace = {
  cardId: CardId;
  optionIndex?: number;
  option?: CardOptionDefinition;
  kind: string;
  timing: string;
};

const cardGainFaces: SweepFace[] = Object.entries(cardLibrary).flatMap(([cardId, card]) => {
  if (card.implementationStatus !== "implemented") return [];
  // A printed MAP card is map-only by definition and a TOWN action is taken from
  // the town screen; neither is an instant the report is about.
  if (card.timing === "map" || card.timing === "town") return [];
  const out: SweepFace[] = [];
  if (CARD_GAIN_EFFECT_KINDS.has(card.effect.type)) {
    out.push({ cardId: cardId as CardId, kind: card.effect.type, timing: card.timing });
  }
  if (card.effect.type === "CHOOSE_ONE") {
    card.effect.options.forEach((option, optionIndex) => {
      if (CARD_GAIN_EFFECT_KINDS.has(option.effect.type)) {
        out.push({ cardId: cardId as CardId, optionIndex, option, kind: option.effect.type, timing: card.timing });
      }
    });
  }
  return out;
});

const faceKey = (face: SweepFace): string => `${face.cardId}#${face.optionIndex ?? "direct"}`;

/** Answer the open OPTION_CHOICE with `optionIndex`, carrying its live id. */
function chooseOptionOk(state: GameState, playerId: string, optionIndex: number): GameState {
  const choiceId = state.pendingChoice?.id;
  expect(choiceId, "an option choice must be open").toBeTruthy();
  return applyOk(state, { type: "CHOOSE_OPTION", playerId, choiceId: choiceId!, optionIndex });
}

/**
 * p1's Marksmen have DECLARED a melee attack on p2's Skeletons: an open
 * `UNIT_ATTACK_DECLARED` window, the exact "before the counter attack" moment
 * the 2026-08-08 ruling is about. p2 holds the face under test plus one card of
 * every removable kind, so the remove-then-Search gate has a candidate.
 */
function attackWindowState(face: SweepFace, options: { hand?: CardId[] } = {}): GameState {
  const state = createInitialGameState(`sweep-attack-${faceKey(face)}`);
  state.players.p1.hand = [];
  // One card of every removable kind so the remove-then-Search gate (which
  // needs a card OTHER than the one played) has a candidate whatever the
  // face's printed filter is.
  state.players.p2.hand = options.hand ?? [
    face.cardId,
    "ability.armorer",
    "artifact.speculum",
    "spell.bless",
    "stat.power"
  ];
  state.players.p2.discard = face.option?.requiresEmptyDiscard ? [] : takeableDiscard();
  state.players.p2.deck = ["stat.knowledge", "stat.attack", "spell.stone_skin"];

  const units = state.combat!.units;
  const attacker = units.unit_p1_marksmen;
  attacker.position = 14;
  attacker.type = "ground"; // a melee blow, so a Retaliation Attack follows
  attacker.attack = 3;
  attacker.defense = 0;
  attacker.maxHealth = 20;
  attacker.abilities = [];
  attacker.activatedThisRound = false;
  attacker.attackedThisActivation = false;
  const target = units.unit_p2_skeletons;
  target.position = 13;
  target.defense = 0; // scripted "+0" dice → the blow really lands for 3
  target.maxHealth = 30;
  target.abilities = [];

  state.activePlayerId = "p1";
  state.combat!.activeUnitId = attacker.id;
  state.combat!.dice.scriptedRolls = [0, 0, 0, 0, 0, 0];
  state.combat!.dice.rollCount = 0;
  return applyOk(state, {
    type: "ATTACK_UNIT",
    playerId: "p1",
    attackerId: "unit_p1_marksmen",
    defenderId: "unit_p2_skeletons"
  });
}

function mapOffer(face: SweepFace): boolean {
  return getLegalActions(mapState(face), "p1").some(
    (legal) =>
      legal.action.type === "PLAY_CARD" &&
      legal.action.cardId === face.cardId &&
      legal.action.optionIndex === face.optionIndex
  );
}

function windowOffer(face: SweepFace): boolean {
  return getLegalActions(attackWindowState(face), "p2").some(
    (legal) =>
      legal.action.type === "PLAY_REACTION" &&
      legal.action.cardId === face.cardId &&
      legal.action.optionIndex === face.optionIndex
  );
}

describe("EVERY implemented card-gain face works on the map AND in an attack window", () => {
  it("the inventory really spans both axes the old sweeps missed", () => {
    const keys = cardGainFaces.map(faceKey);
    // The reported card: a `timing: "combat"` face with a deck dig.
    expect(keys).toContain("specialty.solmyr.4#direct");
    // Its twin: a `timing: "combat"` CHOOSE_ONE with a plain draw side.
    expect(keys).toContain("specialty.ingham.6#1");
    // The dig / Search families the effect-kind axis adds.
    expect(keys).toContain("specialty.jeddite.1#0"); // DECK_DIG_KEEP_MATCHING
    expect(keys).toContain("specialty.adrienne.4#0"); // SEARCH_DECK_THEN_RESHUFFLE
    expect(keys).toContain("specialty.tazar.6#0"); // DRAW_TOP_ARTIFACT
    expect(keys).toContain("ability.eagle_eye#direct"); // EAGLE_EYE_DIG
    expect(keys).toContain("artifact.spellbinders_hat#0"); // REMOVE_HAND_CARD_THEN_SEARCH
    expect(cardGainFaces.length).toBeGreaterThan(90);
  });

  it("offers every one of them on the adventure map", () => {
    const missing = cardGainFaces.filter((face) => !mapOffer(face)).map(faceKey);
    expect(missing, "every card-gain face must be playable on the map").toEqual([]);
  });

  it("offers every one of them inside an OPEN attack window, except the documented bars", () => {
    const missing = cardGainFaces
      .filter((face) => !DOCUMENTED_WINDOW_EXCLUSIONS[faceKey(face)])
      .filter((face) => !windowOffer(face))
      .map(faceKey);
    expect(missing, "every card-gain face must join an open attack window").toEqual([]);
  });

  it("the documented exclusions are REAL (each is genuinely withheld, so no entry is dead)", () => {
    for (const key of Object.keys(DOCUMENTED_WINDOW_EXCLUSIONS)) {
      const face = cardGainFaces.find((candidate) => faceKey(candidate) === key);
      expect(face, `${key} is a stale exclusion — no such face in the library`).toBeTruthy();
      expect(windowOffer(face!), `${key} is offered after all; drop its exclusion`).toBe(false);
    }
  });
});

describe("Solmyr's Chain Lightning IV — the reported bug", () => {
  function solmyrMapState(): GameState {
    let state = createAdventureGameState({ seed: "solmyr-iv-map", rollFirstPlayer: false });
    if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
      state = applyOk(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
    }
    state.players.p1.hand = ["specialty.solmyr.4"];
    state.players.p1.deck = ["stat.attack", "stat.defense", "stat.power"]; // top = last
    state.players.p1.discard = [];
    return state;
  }

  it("is offered on the adventure map and really digs 3, keeping the picked card", () => {
    const state = solmyrMapState();
    const play = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "specialty.solmyr.4"
    );
    // Fails if `specialty.solmyr.4` goes back to `timing: "combat"` (the map card
    // pass only admits instant/ongoing/map) OR if the DECK_DIG_KEEP_ONE case is
    // dropped from isOptionEffectPlayable (isMapPlayableEffect then returns false).
    expect(play, "Chain Lightning IV must be playable on the map").toBeTruthy();

    let after = applyOk(state, play!.action);
    expect(after.pendingChoice?.type).toBe("OPTION_CHOICE");
    expect(after.players.p1.deck).toEqual([]);
    after = chooseOptionOk(after, "p1", 0);
    // Observable outcome: the picked card is in hand, the rest in the discard.
    expect(after.players.p1.hand).toContain("stat.power");
    expect(after.players.p1.discard).toEqual(expect.arrayContaining(["stat.attack", "stat.defense"]));
  });

  it("CONTROL: with the card absent from hand there is no such map play", () => {
    const state = solmyrMapState();
    state.players.p1.hand = ["stat.attack"];
    expect(
      getLegalActions(state, "p1").some(
        (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "specialty.solmyr.4"
      )
    ).toBe(false);
  });

  it("joins an OPEN attack window, digs there, and the parked attack still lands afterwards", () => {
    let state = attackWindowState({ cardId: "specialty.solmyr.4", kind: "DECK_DIG_KEEP_ONE", timing: "instant" });
    state.players.p2.deck = ["stat.attack", "stat.defense", "stat.power"];
    const damageBefore = state.combat!.units.unit_p2_skeletons.damage;

    const join = getLegalActions(state, "p2").find(
      (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === "specialty.solmyr.4"
    );
    // Fails if the DECK_DIG_KEEP_ONE entry is removed from either
    // isDeckGainReactionUtility or isEffectLegalForTrigger.
    expect(join, "Chain Lightning IV must join an open attack window").toBeTruthy();

    state = applyOk(state, join!.action);
    // The nested pick PAUSES the window — the blow must not resolve under it.
    expect(state.pendingChoice?.type).toBe("OPTION_CHOICE");
    expect(state.reactionWindow, "the window is parked, not closed").toBeTruthy();
    expect(state.combat!.units.unit_p2_skeletons.damage).toBe(damageBefore);

    state = chooseOptionOk(state, "p2", 0);
    // The dig really happened inside the window (fails if the reaction-path
    // resolveDeckDigKeepOne call is removed — the card would be spent for nothing).
    expect(state.players.p2.hand).toContain("stat.power");
    expect(state.players.p2.discard).toEqual(expect.arrayContaining(["stat.attack", "stat.defense"]));

    // …and the parked exchange still resolves once everyone passes.
    for (let guard = 0; guard < 6 && state.reactionWindow; guard += 1) {
      const priority = state.reactionWindow.priorityPlayerId;
      const pass = getLegalActions(state, priority).find((legal) => legal.action.type === "PASS_REACTION");
      if (!pass) break;
      state = applyOk(state, pass.action);
    }
    expect(state.reactionWindow, "the window must close after the passes").toBeFalsy();
    expect(
      state.combat!.units.unit_p2_skeletons.damage,
      "the parked blow lands after the window resolves"
    ).toBeGreaterThan(damageBefore);
  });
});

describe("Ingham's Zealots VI — the same timing bug on a plain draw side", () => {
  it("offers its printed 'Draw 1 card' side on the map and really draws", () => {
    let state = createAdventureGameState({ seed: "ingham-vi-map", rollFirstPlayer: false });
    if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
      state = applyOk(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
    }
    state.players.p1.hand = ["specialty.ingham.6"];
    state.players.p1.deck = ["stat.attack"];

    const play = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "PLAY_CARD" &&
        legal.action.cardId === "specialty.ingham.6" &&
        legal.action.optionIndex === 1
    );
    // Fails if ignoreDefenseOrDrawSpecialty goes back to `timing: "combat"`.
    expect(play, "the draw side must be playable on the map").toBeTruthy();
    const after = applyOk(state, play!.action);
    expect(after.players.p1.hand).toEqual(["stat.attack"]);
  });

  it("CONTROL: its combat-only ignore-Defense side is NOT a map play", () => {
    let state = createAdventureGameState({ seed: "ingham-vi-map-control", rollFirstPlayer: false });
    if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
      state = applyOk(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
    }
    state.players.p1.hand = ["specialty.ingham.6"];
    expect(
      getLegalActions(state, "p1").some(
        (legal) =>
          legal.action.type === "PLAY_CARD" &&
          legal.action.cardId === "specialty.ingham.6" &&
          legal.action.optionIndex === 0
      )
    ).toBe(false);
  });
});

describe("the deck DIG / SEARCH families really resolve inside an attack window", () => {
  it("Jeddite's Mysterious Warlock I digs and keeps its matches in the window (no choice)", () => {
    let state = attackWindowState({ cardId: "specialty.jeddite.1", optionIndex: 0, kind: "DECK_DIG_KEEP_MATCHING", timing: "instant" });
    state.players.p2.deck = ["stat.attack", "spell.stone_skin", "stat.defense"];
    const join = getLegalActions(state, "p2").find(
      (legal) =>
        legal.action.type === "PLAY_REACTION" &&
        legal.action.cardId === "specialty.jeddite.1" &&
        legal.action.optionIndex === 0
    );
    expect(join).toBeTruthy();
    state = applyOk(state, join!.action);
    // The dig ran: the Spell was kept, the two Statistics discarded.
    expect(state.players.p2.hand).toContain("spell.stone_skin");
    expect(state.players.p2.discard).toEqual(expect.arrayContaining(["stat.attack", "stat.defense"]));
  });

  it("Tazar's War Hero VI draws a real Artifact card in the window", () => {
    let state = attackWindowState({ cardId: "specialty.tazar.6", optionIndex: 0, kind: "DRAW_TOP_ARTIFACT", timing: "instant" });
    const handBefore = state.players.p2.hand.length;
    const join = getLegalActions(state, "p2").find(
      (legal) =>
        legal.action.type === "PLAY_REACTION" &&
        legal.action.cardId === "specialty.tazar.6" &&
        legal.action.optionIndex === 0
    );
    expect(join).toBeTruthy();
    // A cost-bearing join is a payable TEMPLATE, not a one-click play: the
    // engine offers it without `costCardIds` and the submit path attaches the
    // payment (the 2026-08-07 contract).
    const play = join!.action;
    expect(play.type).toBe("PLAY_REACTION");
    if (play.type !== "PLAY_REACTION") return;
    state = applyOk(state, { ...play, costCardIds: ["stat.power"] });
    // Either the artifact landed straight away (single deck) or a deck pick opened.
    const drewOrPicking =
      state.pendingChoice?.type === "OPTION_CHOICE" || state.players.p2.hand.length === handBefore;
    expect(drewOrPicking).toBe(true);
    if (state.pendingChoice?.type === "OPTION_CHOICE") {
      state = chooseOptionOk(state, "p2", 0);
    }
    const gained = state.players.p2.hand.filter((cardId) => cardLibrary[cardId]?.kind === "artifact");
    expect(gained.length, "an Artifact card really reached the hand").toBeGreaterThan(0);
  });

  it("a shared-deck Search instant PARKS the window and the blow lands only after it settles", () => {
    // The Search instant is the LAST card in hand on purpose — the shape that
    // discriminates the pause. Without it, advanceReactionWindowAfterPlay
    // re-derives an EMPTY offer list, closes the window "all-pass" and resolves
    // the parked blow while the Search is still unanswered (the Scholar
    // last-card-in-hand bug, 2026-08-06). With a full hand the other cards keep
    // the window open by themselves and the bug is invisible.
    let state = attackWindowState(
      { cardId: "artifact.breastplate_of_brimstone", optionIndex: 0, kind: "CARD_DECK_SEARCH", timing: "instant" },
      { hand: ["artifact.breastplate_of_brimstone"] }
    );
    const damageBefore = state.combat!.units.unit_p2_skeletons.damage;
    const join = getLegalActions(state, "p2").find(
      (legal) =>
        legal.action.type === "PLAY_REACTION" &&
        legal.action.cardId === "artifact.breastplate_of_brimstone" &&
        legal.action.optionIndex === 0
    );
    expect(join, "a Search instant must join an open attack window").toBeTruthy();
    state = applyOk(state, join!.action);

    // Fails if the DECK_SEARCH pause is removed from advanceReactionWindowAfterPlay.
    expect(state.pendingChoice?.type).toBe("DECK_SEARCH");
    expect(state.reactionWindow, "the window is parked while the Search is answered").toBeTruthy();
    expect(
      state.combat!.units.unit_p2_skeletons.damage,
      "the blow must NOT resolve under an unanswered Search"
    ).toBe(damageBefore);

    // Answering the Search resumes the window (the RESOLVE_DECK_SEARCH tail) and,
    // with nothing left to play, the parked blow finally lands.
    const resolve = getLegalActions(state, "p2").find(
      (legal) => legal.action.type === "RESOLVE_DECK_SEARCH"
    );
    expect(resolve, "the parked Search must be answerable").toBeTruthy();
    state = applyOk(state, resolve!.action);
    expect(state.pendingChoice, "the Search is answered").toBeFalsy();
    expect(state.reactionWindow, "the window closed once nothing was left to play").toBeFalsy();
    expect(
      state.combat!.units.unit_p2_skeletons.damage,
      "the parked blow lands only after the Search settles"
    ).toBeGreaterThan(damageBefore);
  });
});

describe("the new window joins never stall an automated seat", () => {
  /** A window whose ONLY offer besides passing is the card-gain join. */
  function loneJoinWindow(cardId: CardId): GameState {
    return attackWindowState(
      { cardId, kind: "DECK_DIG_KEEP_ONE", timing: "instant" },
      { hand: [cardId] }
    );
  }

  it("a computer seat PASSES rather than dumping a card-gain instant into the window", () => {
    const state = loneJoinWindow("specialty.solmyr.4");
    const priority = state.reactionWindow!.priorityPlayerId;
    const offers = getLegalActions(state, priority);
    expect(
      offers.some((legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === "specialty.solmyr.4"),
      "the join must be on this seat's menu for the score comparison to mean anything"
    ).toBe(true);
    // Documented limit, pinned so it can never silently become a stall: a
    // card-gain effect scores in the map-search band (610), below PASS_REACTION
    // (1_050), so the AI keeps the card. What matters is that it ALWAYS answers.
    const decision = chooseComputerAction({
      playerId: priority,
      state: getPlayerView(state, priority),
      legalActions: offers
    });
    expect(decision, "a computer seat must have an action").toBeTruthy();
    expect(decision!.action.type).toBe("PASS_REACTION");
  });

  it("the AFK / turn-timeout driver closes the same window", () => {
    const state = loneJoinWindow("specialty.solmyr.4");
    const priority = state.reactionWindow!.priorityPlayerId;
    expect(
      nextAfkDropAction(state, priority),
      "the forced-resolution driver must be able to close the window"
    ).toMatchObject({ type: "PASS_REACTION" });
  });
});

describe("discard recovery excludes cards still resolving", () => {
  it("Scholar cannot take the cast, a played draw instant, or itself from the current reaction stack", () => {
    let state = createInitialGameState("scholar-in-flight-exclusion");
    state.players.p1.hand = ["spell.magic_arrow", "artifact.armor_of_wonder", "ability.scholar"];
    state.players.p1.discard = ["stat.attack"];
    state.players.p1.deck = ["stat.knowledge"];
    state.players.p2.hand = ["ability.resistance"];
    state = applyOk(state, {
      type: "CAST_SPELL",
      playerId: "p1",
      cardId: "spell.magic_arrow",
      target: { type: "unit", unitId: "unit_p2_vampires" }
    });

    const armor = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "PLAY_REACTION" &&
        legal.action.cardId === "artifact.armor_of_wonder" &&
        legal.action.optionIndex === 0
    );
    expect(armor?.action.type === "PLAY_REACTION" && armor.action.drawOnly).toBe(true);
    state = applyOk(state, armor!.action);

    for (let guard = 0; guard < 4; guard += 1) {
      const scholar = getLegalActions(state, "p1").find(
        (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === "ability.scholar"
      );
      if (scholar) {
        state = applyOk(state, scholar.action);
        break;
      }
      const priority = state.reactionWindow?.priorityPlayerId;
      const pass = priority
        ? getLegalActions(state, priority).find((legal) => legal.action.type === "PASS_REACTION")
        : undefined;
      expect(pass, "reaction priority must be passable back to the Scholar player").toBeTruthy();
      state = applyOk(state, pass!.action);
    }

    expect(state.pendingChoice?.type).toBe("OPTION_CHOICE");
    if (state.pendingChoice?.type !== "OPTION_CHOICE") return;
    const candidates = state.pendingChoice.discardPick?.cardIds ?? [];
    expect(candidates).toContain("stat.attack");
    expect(candidates).not.toContain("spell.magic_arrow");
    expect(candidates).not.toContain("artifact.armor_of_wonder");
    expect(candidates).not.toContain("ability.scholar");
  });
});
