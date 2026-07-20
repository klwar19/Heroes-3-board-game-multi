import { describe, expect, it } from "vitest";
import { cardLibrary } from "@/data/cards/library";
import { STARTING_ONLY_SPELLS } from "@/data/cards/spells";
import { moraleCardPolarity } from "@/data/cards/morale";
import { animeXianxiaArtifactCardIds } from "@/data/anime/artifacts";
import { animeNeverDeckedCardIds } from "@/data/anime/hero-grades";
import { wogArtifactCardIds } from "@/data/wog/artifacts";
import { wogCommanderArtifactCardIds } from "@/data/wog/commander-artifacts";
import { animeEquipmentCardIds } from "@/data/anime/equipment-cards";
import { WAR_MACHINE_CARD_IDS } from "@/data/cards/permanents";
import { applyAction, createInitialGameState, getLegalActions, getRuleset, SHARED_DECK_IDS } from "./index";
import type { SharedDeckId } from "./index";
import type { GameState } from "./state";

function applyOk(state: GameState, action: Parameters<typeof applyAction>[1]): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

/**
 * The combat sandbox is the "combat test mode": it runs the BINH house rules and
 * must let a tester reach EVERY card to exercise every mechanic. These tests pin
 * both halves down so neither can quietly regress:
 *  - the sandbox is BINH (split decks + BINH unit stats), and
 *  - every implemented Spell, Ability and Artifact sits in a searchable well.
 */

const DECK_KINDS = ["spell", "ability", "artifact"] as const;

// Starting-only spells (Magic Arrow) are gifted at setup and never shuffled into
// a well, so they are not expected to be searchable in the sandbox. Morale cards
// (kind "ability") live in their own positive/negative morale decks behind the
// optional Morale Cards rule, not the shared ability well, so they are excluded
// too. Optional-module artifacts (Pháp Bảo `anime.xianxiaArtifacts`, and Wake
// of Gods `wog.artifacts`) join the shared Artifact wells only when their module
// is on — the fixed sandbox is a modules-OFF table, so they are excluded here
// (still addable via SANDBOX_ADD_CARD, which reads cardLibrary directly).
// The Hero Grades Training Manual (`anime.heroGrades`) NEVER joins a deck/well —
// it is bought at a guild shop, so it is excluded here too (still addable via
// SANDBOX_ADD_CARD, which reads cardLibrary directly). See `animeNeverDeckedCardIds`.
const startingOnly = new Set(STARTING_ONLY_SPELLS);
const moduleGated = new Set<string>([
  ...animeXianxiaArtifactCardIds,
  ...animeEquipmentCardIds,
  ...wogArtifactCardIds,
  ...wogCommanderArtifactCardIds,
  ...animeNeverDeckedCardIds
]);

function implementedIdsOfKind(kind: (typeof DECK_KINDS)[number]): string[] {
  return Object.values(cardLibrary)
    .filter(
      (card) =>
        card.implementationStatus === "implemented" &&
        card.kind === kind &&
        !startingOnly.has(card.id) &&
        !moduleGated.has(card.id) &&
        moraleCardPolarity(card.id) === null
    )
    .map((card) => card.id)
    .sort();
}

/** Every card sitting in any shared well (draw pile or discard). */
function cardsInAllWells(state: ReturnType<typeof createInitialGameState>): Set<string> {
  const cards = new Set<string>();
  for (const deckId of SHARED_DECK_IDS) {
    const deck = state.decks[deckId];
    if (!deck) {
      continue;
    }
    for (const cardId of [...deck.drawPile, ...deck.discardPile]) {
      cards.add(cardId);
    }
  }
  return cards;
}

describe("combat sandbox is BINH house-rule mode", () => {
  it("runs the BINH ruleset", () => {
    expect(getRuleset(createInitialGameState())).toBe("binh");
  });

  it("uses the BINH split-deck well layout (no single legacy Artifact/Spell deck)", () => {
    const { decks } = createInitialGameState();
    // BINH: Basic + Expert spells, Minor/Major/Relic artifacts, Abilities.
    for (const deckId of ["spells", "spells-expert", "abilities", "artifacts-minor", "artifacts-major", "artifacts-relic"] as SharedDeckId[]) {
      expect(decks[deckId], `${deckId} well exists`).toBeDefined();
    }
    // The legacy single Artifact well must NOT exist in BINH mode.
    expect(decks.artifacts).toBeUndefined();
  });

  it("fights with BINH unit statistics (Pack Griffins defense 1, Pack Marksmen 3 HP)", () => {
    const combat = createInitialGameState().combat!;
    // Legacy values would be defense 0 / maxHealth 2.
    expect(combat.units.unit_p1_griffins.defense).toBe(1);
    expect(combat.units.unit_p1_marksmen.maxHealth).toBe(3);
  });
});

describe("combat sandbox card access (test all mechanics)", () => {
  it("stocks every implemented Spell, Ability and Artifact in a shared well", () => {
    const wellCards = cardsInAllWells(createInitialGameState());
    for (const kind of DECK_KINDS) {
      const missing = implementedIdsOfKind(kind).filter((id) => !wellCards.has(id));
      expect(missing, `implemented ${kind} cards missing from the sandbox wells`).toEqual([]);
    }
  });

  it("makes the formerly-missing expansion spells reachable at their BINH tier", () => {
    // These five used to be absent from the BINH lists; the synced lists now
    // place them by their spellLevel — Forgetfulness is basic, the rest expert.
    const { decks } = createInitialGameState();
    const inWell = (deckId: string, id: string) => {
      const deck = decks[deckId];
      return Boolean(deck && [...deck.drawPile, ...deck.discardPile].includes(id));
    };
    expect(inWell("spells", "spell.forgetfulness"), "Forgetfulness in the Basic well").toBe(true);
    for (const id of ["spell.inferno", "spell.slayer", "spell.sorrow", "spell.mirth"]) {
      expect(inWell("spells-expert", id), `${id} in the Expert well`).toBe(true);
    }
  });

  it("never stocks a not-implemented (inert) card in a well", () => {
    const wellCards = cardsInAllWells(createInitialGameState());
    const inert = [...wellCards]
      .filter((id) => cardLibrary[id] && cardLibrary[id].implementationStatus !== "implemented")
      .sort();
    expect(inert).toEqual([]);
  });

  it("lets the active player Search every populated well (cards are actually accessible)", () => {
    const state = createInitialGameState();
    const searchable = new Set(
      getLegalActions(state, state.activePlayerId)
        .filter((legal) => legal.action.type === "SEARCH_DECK")
        .map((legal) => (legal.action as { deckId: string }).deckId)
    );
    for (const deckId of SHARED_DECK_IDS) {
      const deck = state.decks[deckId];
      if (!deck || deck.drawPile.length + deck.discardPile.length === 0) {
        continue;
      }
      expect(searchable.has(deckId), `${deckId} well is searchable`).toBe(true);
    }
  });
});

describe("combat sandbox — add any card straight to hand (test mode)", () => {
  it("drops the chosen card into the player's hand and logs it", () => {
    const state = createInitialGameState();
    const before = state.players.p1.hand.length;

    const result = applyAction(state, { type: "SANDBOX_ADD_CARD", playerId: "p1", cardId: "spell.magic_arrow" });

    expect(result.errors).toEqual([]);
    expect(result.state.players.p1.hand.length).toBe(before + 1);
    expect(result.state.players.p1.hand).toContain("spell.magic_arrow");
    expect(result.state.eventLog.some((event) => event.type === "SANDBOX_CARD_ADDED")).toBe(true);
  });

  it("can add an artifact and an ability too (not just spells)", () => {
    let state = createInitialGameState();
    state = applyAction(state, { type: "SANDBOX_ADD_CARD", playerId: "p2", cardId: "artifact.centaurs_axe" }).state;
    state = applyAction(state, { type: "SANDBOX_ADD_CARD", playerId: "p2", cardId: "ability.offense" }).state;
    expect(state.players.p2.hand).toEqual(expect.arrayContaining(["artifact.centaurs_axe", "ability.offense"]));
  });

  it("rejects an unknown card and never touches the hand", () => {
    const state = createInitialGameState();
    const before = [...state.players.p1.hand];

    const result = applyAction(state, { type: "SANDBOX_ADD_CARD", playerId: "p1", cardId: "spell.not_a_real_card" });

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.state.players.p1.hand).toEqual(before);
  });

  it("is rejected outside the combat sandbox", () => {
    const state = createInitialGameState();
    state.combat = null; // no sandbox combat in progress

    const result = applyAction(state, { type: "SANDBOX_ADD_CARD", playerId: "p1", cardId: "spell.magic_arrow" });

    expect(result.errors.length).toBeGreaterThan(0);
  });
});

// ===========================================================================
// War machines in the sandbox — the only place they can be obtained without a
// market (Factory / Trading Post). They were unreachable in combat test mode
// because the Add-card picker excluded the "war-machine" kind; these pin them
// in so First Aid Tent, Ammo Cart, Ballista, Catapult and Cannon are testable.
// ===========================================================================

describe("combat sandbox — war machines are addable and actually fire", () => {
  it("can add EVERY implemented war machine straight to hand", () => {
    for (const cardId of WAR_MACHINE_CARD_IDS) {
      expect(cardLibrary[cardId]?.implementationStatus, `${cardId} is implemented`).toBe("implemented");
      const state = createInitialGameState(`sandbox-wm-${cardId}`);
      const result = applyAction(state, { type: "SANDBOX_ADD_CARD", playerId: "p1", cardId });
      expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
      expect(result.state.players.p1.hand).toContain(cardId);
    }
  });

  it("First Aid Tent and Cannon — the two the report flagged — are addable", () => {
    for (const cardId of ["war_machine.first_aid_tent", "war_machine.cannon"] as const) {
      const state = createInitialGameState(`sandbox-flagged-${cardId}`);
      expect(applyOk(state, { type: "SANDBOX_ADD_CARD", playerId: "p1", cardId }).players.p1.hand).toContain(cardId);
    }
  });

  it("a sandbox-added Ballista can be put into play and then fires at the slowest enemy", () => {
    let state = createInitialGameState("sandbox-ballista-flow");

    // Make one enemy the uniquely slowest, tanky enough to read the hit.
    const units = state.combat!.units;
    let next = 8;
    for (const id of Object.keys(units)) {
      if (units[id].controllerId === "p2") {
        units[id].initiative = id === "unit_p2_dread_knights" ? 1 : next--;
      }
    }
    units.unit_p2_dread_knights.maxHealth = 12;
    units.unit_p2_dread_knights.damage = 0;

    // Add it from the picker (the fix), then it must be a legal play this turn.
    state = applyOk(state, { type: "SANDBOX_ADD_CARD", playerId: "p1", cardId: "war_machine.ballista" });
    expect(state.players.p1.hand).toContain("war_machine.ballista");

    const putInPlay = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "PLAY_CARD" &&
        legal.action.cardId === "war_machine.ballista"
    );
    expect(putInPlay, "the added Ballista should be playable into play this activation").toBeTruthy();
    state = applyOk(state, putInPlay!.action);
    expect(state.players.p1.permanents).toContain("war_machine.ballista");

    // End the combat round: the Ballista's round-start shot lands on the slowest.
    state.combat!.activeUnitId = null;
    state.activePlayerId = "p1";
    state = applyOk(state, { type: "END_COMBAT_ROUND", playerId: "p1" });
    expect(state.combat!.units.unit_p2_dread_knights.damage).toBe(1);
  });
});
