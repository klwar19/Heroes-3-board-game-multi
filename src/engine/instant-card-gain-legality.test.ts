import { cardLibrary } from "@/data/cards/library";
import { describe, expect, it } from "vitest";
import { applyAction, createAdventureGameState, createInitialGameState, getLegalActions, getMainHero } from "./index";
import type { CardOptionDefinition, GameAction, GameState } from "./state";

type GainFace = { cardId: string; optionIndex?: number; option?: CardOptionDefinition; type: "draw" | "recover" };

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

function mapState(face: GainFace): GameState {
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
