import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { cardLibrary } from "@/data/cards/library";
import {
  animeEquipmentCardIds,
  animeEquipmentMajorIds,
  animeEquipmentMinorIds,
  animeEquipmentRelicIds,
  equipmentCardArtPath
} from "@/data/anime/equipment-cards";
import { EQUIPMENT_GRADE_TO_ARTIFACT_TIER, EQUIPMENT_IDS, getEquipmentDefinition } from "@/data/anime/equipment";
import {
  applyAction,
  createAdventureGameState,
  getLegalActions,
  heroEquipmentOf,
  type GameAction,
  type GameState
} from "./index";

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((e) => e.message).join("; ")).toEqual([]);
  return result.state;
}

function adventure(seed: string, equipmentOn = true): GameState {
  return createAdventureGameState({
    seed,
    ruleset: "binh",
    anime: { enabled: true, equipment: equipmentOn, xianxiaArtifacts: false },
    rollFirstPlayer: false,
    players: [
      { id: "p1", name: "One", factionId: "castle" as never, heroDefId: "catherine" },
      { id: "p2", name: "Two", factionId: "necropolis" as never }
    ]
  });
}

function openMap(state: GameState): GameState {
  for (const player of Object.values(state.players)) {
    player.canMulligan = false;
    player.needsHandRefresh = false;
  }
  state.activePlayerId = "p1";
  state.players.p1.removed = [];
  return state;
}

describe("anime equipment CARDS — deck join + play", () => {
  it("every equipment id is a registered implemented artifact card with matching grade tier", () => {
    expect(animeEquipmentCardIds.length).toBe(45);
    for (const id of animeEquipmentCardIds) {
      const card = cardLibrary[id];
      const def = getEquipmentDefinition(id)!;
      expect(card, id).toBeTruthy();
      expect(card.kind).toBe("artifact");
      expect(card.implementationStatus).toBe("implemented");
      expect(card.artifactTier).toBe(EQUIPMENT_GRADE_TO_ARTIFACT_TIER[def.grade]);
      expect(card.tags).toContain("equipment");
      expect(card.assets?.cardImage).toBe(equipmentCardArtPath(id));
    }
    expect(animeEquipmentMinorIds.every((id) => getEquipmentDefinition(id)?.grade === "I")).toBe(true);
    expect(animeEquipmentMajorIds.every((id) => getEquipmentDefinition(id)?.grade === "II")).toBe(true);
    expect(animeEquipmentRelicIds.every((id) => getEquipmentDefinition(id)?.grade === "III")).toBe(true);
  });

  it("every equipment card face exists on disk under public/assets/anime/equipment/cards/", () => {
    for (const id of animeEquipmentCardIds) {
      const rel = equipmentCardArtPath(id);
      const onDisk = existsSync(fileURLToPath(new URL(`../../public${rel}`, import.meta.url)));
      expect(onDisk, `${id} missing face at ${rel}`).toBe(true);
    }
  });

  it("deck-joins only when anime.equipment is on (CONTROL: off = absent)", () => {
    const on = adventure("eq-deck-on", true);
    const off = adventure("eq-deck-off", false);
    const onIds = [
      ...(on.decks["artifacts-minor"]?.drawPile ?? []),
      ...(on.decks["artifacts-minor"]?.discardPile ?? []),
      ...(on.decks["artifacts-major"]?.drawPile ?? []),
      ...(on.decks["artifacts-major"]?.discardPile ?? []),
      ...(on.decks["artifacts-relic"]?.drawPile ?? []),
      ...(on.decks["artifacts-relic"]?.discardPile ?? [])
    ];
    const offIds = [
      ...(off.decks["artifacts-minor"]?.drawPile ?? []),
      ...(off.decks["artifacts-minor"]?.discardPile ?? []),
      ...(off.decks["artifacts-major"]?.drawPile ?? []),
      ...(off.decks["artifacts-major"]?.discardPile ?? []),
      ...(off.decks["artifacts-relic"]?.drawPile ?? []),
      ...(off.decks["artifacts-relic"]?.discardPile ?? [])
    ];
    for (const id of animeEquipmentMinorIds) {
      expect(onIds).toContain(id);
      expect(offIds).not.toContain(id);
    }
    for (const id of animeEquipmentMajorIds) {
      expect(onIds).toContain(id);
      expect(offIds).not.toContain(id);
    }
    for (const id of animeEquipmentRelicIds) {
      expect(onIds).toContain(id);
      expect(offIds).not.toContain(id);
    }
    // Invariant: each equipment card joins its matching tier deck EXACTLY ONCE
    // (grade partitions the ids, so no double-join across tiers) and NONE join
    // when off. onIds spans both piles of all three decks, so every present / 0
    // absent proves the count is conserved, not just membership.
    const equipSet = new Set(animeEquipmentCardIds);
    expect(onIds.filter((id) => equipSet.has(id))).toHaveLength(animeEquipmentCardIds.length);
    expect(offIds.filter((id) => equipSet.has(id))).toHaveLength(0);
  });

  it("playing an equipment card equips it, removes the card, and grants a same-grade REGULAR Artifact", () => {
    const state = openMap(adventure("eq-card-play"));
    const CARD = EQUIPMENT_IDS.ironBloodSword; // Grade I → minor
    const MINOR_REGULAR = "artifact.centaurs_axe";
    // Seed a known minor regular artifact on top of the minor draw pile.
    const minor = state.decks["artifacts-minor"]!;
    expect(cardLibrary[MINOR_REGULAR]?.artifactTier).toBe("minor");
    expect(animeEquipmentCardIds).not.toContain(MINOR_REGULAR);
    minor.drawPile = [...minor.drawPile.filter((id) => id !== MINOR_REGULAR), MINOR_REGULAR];
    state.players.p1.hand = [CARD];

    const play = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === CARD
    )?.action;
    expect(play, "equipment card play offered on map").toBeTruthy();

    const after = apply(state, play!);
    // Equipped permanently.
    expect(heroEquipmentOf(after, "p1").weapon).toBe(CARD);
    // Card removed from the game (not discard).
    expect(after.players.p1.removed).toContain(CARD);
    expect(after.players.p1.hand).not.toContain(CARD);
    expect(after.players.p1.discard).not.toContain(CARD);
    // Same-grade REGULAR artifact granted.
    expect(after.players.p1.hand).toContain(MINOR_REGULAR);
    expect(
      after.eventLog.some(
        (e) =>
          e.type === "EVENT_NOTE" &&
          /receives .* \(minor Artifact\) for using equipment/i.test((e as { message?: string }).message ?? "")
      )
    ).toBe(true);
  });

  it("the same-grade grant RESPECTS artifact uniqueness (skips one already held by another seat)", () => {
    const state = openMap(adventure("eq-grant-unique"));
    const CARD = EQUIPMENT_IDS.ironBloodSword; // Grade I → minor
    const minor = state.decks["artifacts-minor"]!;
    // Two REGULAR (core) minor artifacts already in the pile.
    const regularMinors = minor.drawPile.filter(
      (id) => id.startsWith("artifact.") && cardLibrary[id]?.artifactTier === "minor"
    );
    const HELD = regularMinors[0];
    const FREE = regularMinors[1];
    expect(HELD, "need two regular minor artifacts").toBeTruthy();
    expect(FREE).toBeTruthy();
    // Stack so HELD is drawn first (pop = last) then FREE. HELD is globally
    // unique and now held by p2, so the grant must skip it and take FREE.
    minor.drawPile = [...minor.drawPile.filter((id) => id !== HELD && id !== FREE), FREE, HELD];
    state.players.p2.hand = [...state.players.p2.hand, HELD];
    state.players.p1.hand = [CARD];

    const play = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === CARD
    )?.action;
    const after = apply(state, play!);
    expect(after.players.p1.hand).toContain(FREE);
    expect(after.players.p1.hand).not.toContain(HELD);
    // Skipped unique card is tucked back under the deck, never destroyed/duplicated.
    expect(after.decks["artifacts-minor"]!.drawPile).toContain(HELD);
  });

  it("grants NOTHING (feed note, no crash) when no acquirable regular Artifact of the grade remains", () => {
    const state = openMap(adventure("eq-grant-empty"));
    const CARD = EQUIPMENT_IDS.ironBloodSword; // Grade I → minor
    const minor = state.decks["artifacts-minor"]!;
    minor.drawPile = [];
    minor.discardPile = [];
    state.players.p1.hand = [CARD];

    const play = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === CARD
    )?.action;
    const after = apply(state, play!);
    // Still equipped + card removed, but the hand gains NO artifact (deck empty).
    expect(heroEquipmentOf(after, "p1").weapon).toBe(CARD);
    expect(after.players.p1.hand).toHaveLength(0);
    expect(
      after.eventLog.some(
        (e) =>
          e.type === "EVENT_NOTE" &&
          /finds no minor Artifact left to claim/i.test((e as { message?: string }).message ?? "")
      )
    ).toBe(true);
  });

  it("CONTROL: equipment card is NOT offered when the module is off", () => {
    const state = openMap(adventure("eq-card-off", false));
    state.players.p1.hand = [EQUIPMENT_IDS.ironBloodSword];
    const play = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === EQUIPMENT_IDS.ironBloodSword
    );
    expect(play).toBeUndefined();
  });
});
