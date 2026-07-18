import { describe, expect, it } from "vitest";
import {
  applyAction,
  createAdventureGameState,
  createInitialGameState,
  getLegalActions,
  getMainHero,
  type GameAction,
  type GameState,
  type PlayerId
} from "./index";
import { cardLibrary } from "@/data/cards/library";
import {
  wogArtifactCardIds,
  wogArtifactMajorIds,
  wogArtifactMinorIds,
  wogArtifactRelicIds
} from "@/data/wog/artifacts";
import {
  animeXianxiaArtifactCardIds,
  animeXianxiaArtifactMajorIds,
  animeXianxiaArtifactMinorIds,
  animeXianxiaArtifactRelicIds
} from "@/data/anime/artifacts";
import {
  artifactDeckBinhMajor,
  artifactDeckBinhMinor,
  artifactDeckBinhRelic,
  artifactDeckLegacy
} from "@/data/cards/artifacts";

/**
 * Wake of Gods hero Artifacts (`wog.artifacts`). Every claim fails if its wiring
 * is removed. Each card is a pure REUSE of an already-wired arm — a Boots
 * movement card, an Artifact-deck Search, or a Sentinel's-Shield-family combat
 * stat reaction — so the tests assert the OBSERVABLE outcome (resolved damage,
 * movement points, removed-zone, open search), never just the card data.
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

const MAGIC_WAND = "wog.artifact.magic_wand";
const GATE_KEY = "wog.artifact.gate_key";
const CRIMSON_SHIELD = "wog.artifact.crimson_shield";
const WARLORDS_BANNER = "wog.artifact.warlords_banner";
const DRAGONHEART = "wog.artifact.dragonheart";

// ===========================================================================
// Deck join — the module gate (default OFF ⇒ byte-identical decks)
// ===========================================================================

function allDeckCardIds(state: GameState): string[] {
  return Object.values(state.decks).flatMap((deck) => [...deck.drawPile, ...deck.discardPile]);
}

function artifactDeckCardIds(state: GameState, deckId: string): string[] {
  const deck = state.decks[deckId];
  return deck ? [...deck.drawPile, ...deck.discardPile] : [];
}

function countOf(ids: string[], id: string): number {
  return ids.filter((candidate) => candidate === id).length;
}

/** The full artifact-deck contents (draw + discard) across every split/legacy deck, for byte-identical comparison. */
function artifactDeckSnapshot(state: GameState): Record<string, string[]> {
  const snap: Record<string, string[]> = {};
  for (const deckId of ["artifacts", "artifacts-minor", "artifacts-major", "artifacts-relic"]) {
    const deck = state.decks[deckId];
    if (deck) {
      snap[deckId] = [...deck.drawPile, ...deck.discardPile];
    }
  }
  return snap;
}

describe("Wake of Gods artifact deck join", () => {
  it("default (module OFF) table has ZERO WOG artifact ids in any deck or discard", () => {
    const off = createAdventureGameState({ seed: "wog-art-off", difficulty: "normal", rollFirstPlayer: false });
    const ids = allDeckCardIds(off);
    for (const wogId of wogArtifactCardIds) {
      expect(countOf(ids, wogId), `${wogId} must not join a default table`).toBe(0);
    }
  });

  it("CONTROL — WOG master ON but artifacts OFF joins nothing", () => {
    const moduleOff = createAdventureGameState({
      seed: "wog-art-module-off",
      difficulty: "normal",
      rollFirstPlayer: false,
      wog: { enabled: true, artifacts: false }
    });
    const ids = allDeckCardIds(moduleOff);
    for (const wogId of wogArtifactCardIds) {
      expect(countOf(ids, wogId)).toBe(0);
    }
  });

  it("CONTROL — artifacts flag ON but WOG master OFF joins nothing (gate is enabled && artifacts)", () => {
    const masterOff = createAdventureGameState({
      seed: "wog-art-master-off",
      difficulty: "normal",
      rollFirstPlayer: false,
      wog: { enabled: false, artifacts: true }
    });
    const ids = allDeckCardIds(masterOff);
    for (const wogId of wogArtifactCardIds) {
      expect(countOf(ids, wogId)).toBe(0);
    }
  });

  it("byte-identical: every OFF config leaves the artifact decks exactly as a plain game (same seed)", () => {
    const seed = "wog-art-byte-identical";
    const plain = createAdventureGameState({ seed, difficulty: "normal", rollFirstPlayer: false });
    const base = artifactDeckSnapshot(plain);

    for (const wog of [undefined, { enabled: true, artifacts: false }, { enabled: false, artifacts: true }] as const) {
      const other = createAdventureGameState({ seed, difficulty: "normal", rollFirstPlayer: false, wog });
      expect(artifactDeckSnapshot(other), `wog=${JSON.stringify(wog)} must match a plain game`).toEqual(base);
    }
  });

  it("split decks (default BINH): each card joins its correct tier deck exactly once", () => {
    const on = createAdventureGameState({
      seed: "wog-art-split-on",
      difficulty: "normal",
      rollFirstPlayer: false,
      wog: { enabled: true, artifacts: true }
    });

    for (const id of wogArtifactMinorIds) {
      expect(countOf(artifactDeckCardIds(on, "artifacts-minor"), id), `${id} in artifacts-minor`).toBe(1);
    }
    for (const id of wogArtifactMajorIds) {
      expect(countOf(artifactDeckCardIds(on, "artifacts-major"), id), `${id} in artifacts-major`).toBe(1);
    }
    for (const id of wogArtifactRelicIds) {
      expect(countOf(artifactDeckCardIds(on, "artifacts-relic"), id), `${id} in artifacts-relic`).toBe(1);
    }
    // And exactly once across the WHOLE table (no leakage into a second deck).
    const all = allDeckCardIds(on);
    for (const id of wogArtifactCardIds) {
      expect(countOf(all, id), `${id} appears exactly once table-wide`).toBe(1);
    }
  });

  it("legacy single Artifact deck: all five cards join it exactly once", () => {
    const legacy = createAdventureGameState({
      seed: "wog-art-legacy-on",
      difficulty: "normal",
      rollFirstPlayer: false,
      houseRules: { "split-decks": false },
      wog: { enabled: true, artifacts: true }
    });
    // No split decks exist in legacy mode.
    expect(legacy.decks["artifacts-relic"]).toBeUndefined();
    const combined = artifactDeckCardIds(legacy, "artifacts");
    for (const id of wogArtifactCardIds) {
      expect(countOf(combined, id), `${id} in the combined legacy deck`).toBe(1);
    }
  });

  it("every WOG artifact id resolves in the card library even when the module is off (lookup path)", () => {
    for (const id of wogArtifactCardIds) {
      expect(cardLibrary[id], `${id} must be registered`).toBeTruthy();
      expect(cardLibrary[id].kind).toBe("artifact");
    }
  });
});

// ===========================================================================
// Cross-mod coexistence (§3.8) — WOG artifacts join the SAME shared decks as
// the anime Pháp Bảo artifacts, side by side, neither displacing the other.
// ===========================================================================

describe("WOG × Anime artifact coexistence", () => {
  const bothOn = () =>
    createAdventureGameState({
      seed: "wog-anime-coexist",
      difficulty: "normal",
      rollFirstPlayer: false,
      wog: { enabled: true, artifacts: true },
      anime: { enabled: true, xianxiaArtifacts: true }
    });

  it("each split tier deck holds BOTH its WOG ids AND its anime ids, on top of every core id", () => {
    const state = bothOn();

    const tiers = [
      {
        deckId: "artifacts-minor",
        core: artifactDeckBinhMinor,
        anime: animeXianxiaArtifactMinorIds,
        wog: wogArtifactMinorIds
      },
      {
        deckId: "artifacts-major",
        core: artifactDeckBinhMajor,
        anime: animeXianxiaArtifactMajorIds,
        wog: wogArtifactMajorIds
      },
      {
        deckId: "artifacts-relic",
        core: artifactDeckBinhRelic,
        anime: animeXianxiaArtifactRelicIds,
        wog: wogArtifactRelicIds
      }
    ] as const;

    for (const { deckId, core, anime, wog } of tiers) {
      const ids = artifactDeckCardIds(state, deckId);
      // Both mods' ids present exactly once.
      for (const id of anime) {
        expect(countOf(ids, id), `${id} (anime) in ${deckId}`).toBe(1);
      }
      for (const id of wog) {
        expect(countOf(ids, id), `${id} (wog) in ${deckId}`).toBe(1);
      }
      // Every core artifact of the tier is still present (neither join displaced it).
      for (const id of core) {
        expect(countOf(ids, id), `core ${id} still in ${deckId}`).toBe(1);
      }
      // Total = core + anime + wog: the two joins ADD, never overwrite.
      expect(ids.length, `${deckId} total = core + anime + wog`).toBe(core.length + anime.length + wog.length);
    }
  });

  it("legacy single Artifact deck holds every core, anime and WOG id side by side", () => {
    const legacy = createAdventureGameState({
      seed: "wog-anime-coexist-legacy",
      difficulty: "normal",
      rollFirstPlayer: false,
      houseRules: { "split-decks": false },
      wog: { enabled: true, artifacts: true },
      anime: { enabled: true, xianxiaArtifacts: true }
    });
    expect(legacy.decks["artifacts-relic"]).toBeUndefined();
    const combined = artifactDeckCardIds(legacy, "artifacts");
    for (const id of animeXianxiaArtifactCardIds) {
      expect(countOf(combined, id), `${id} (anime) in legacy deck`).toBe(1);
    }
    for (const id of wogArtifactCardIds) {
      expect(countOf(combined, id), `${id} (wog) in legacy deck`).toBe(1);
    }
    expect(combined.length, "legacy total = core + anime + wog").toBe(
      artifactDeckLegacy.length + animeXianxiaArtifactCardIds.length + wogArtifactCardIds.length
    );
  });
});

// ===========================================================================
// Map plays — Gate Key (movement) & Magic Wand (Artifact-deck Search)
// ===========================================================================

/** A map-turn adventure state with p1 active and no pending hand steps. */
function mapState(seed: string): GameState {
  const state = createAdventureGameState({ seed, difficulty: "normal", rollFirstPlayer: false });
  for (const player of Object.values(state.players)) {
    player.canMulligan = false;
    player.needsHandRefresh = false;
  }
  state.activePlayerId = "p1";
  state.players.p1.removed = [];
  return state;
}

function findPlay(
  state: GameState,
  playerId: PlayerId,
  cardId: string,
  optionIndex: number
): Extract<GameAction, { type: "PLAY_CARD" }> | undefined {
  for (const entry of getLegalActions(state, playerId)) {
    const action = entry.action;
    if (action.type === "PLAY_CARD" && action.cardId === cardId && action.optionIndex === optionIndex) {
      return action;
    }
  }
  return undefined;
}

describe("Gate Key — small map movement card", () => {
  it("the +1 side raises the hero's movement points by 1 (CONTROL: empty hand offers nothing)", () => {
    const state = mapState("gate-key-map");
    state.players.p1.hand = [GATE_KEY];
    const before = getMainHero(state, "p1")!.movementPoints;

    const play = findPlay(state, "p1", GATE_KEY, 0);
    expect(play, "the +1 movement side should be a legal map play").toBeTruthy();
    const after = applyOk(state, play!);
    expect(getMainHero(after, "p1")!.movementPoints).toBe(before + 1);

    // CONTROL — with the card gone from hand, no such play is offered.
    const control = mapState("gate-key-control");
    control.players.p1.hand = [];
    expect(findPlay(control, "p1", GATE_KEY, 0)).toBeUndefined();
  });

  it("the remove side raises movement by 2 and the card leaves the game (not the discard)", () => {
    const state = mapState("gate-key-remove");
    state.players.p1.hand = [GATE_KEY];
    const before = getMainHero(state, "p1")!.movementPoints;
    const play = findPlay(state, "p1", GATE_KEY, 1);
    expect(play).toBeTruthy();
    const after = applyOk(state, play!);
    expect(getMainHero(after, "p1")!.movementPoints).toBe(before + 2);
    expect(after.players.p1.removed).toContain(GATE_KEY);
    expect(after.players.p1.discard).not.toContain(GATE_KEY);
    expect(after.players.p1.hand).not.toContain(GATE_KEY);
  });
});

describe("Magic Wand — Artifact-deck Search", () => {
  it("removing the Wand opens/queues a Search of the Artifact deck and the card leaves the game", () => {
    const state = mapState("magic-wand-search");
    state.players.p1.hand = [MAGIC_WAND];
    // Clear the first-round face-up artifact discards so the Search opens straight
    // onto its reveal instead of the incidental "take the top discard?" prompt
    // (either way the assertion below covers it).
    for (const deckId of ["artifacts", "artifacts-minor", "artifacts-major", "artifacts-relic"]) {
      if (state.decks[deckId]) {
        state.decks[deckId].discardPile = [];
      }
    }

    const play = findPlay(state, "p1", MAGIC_WAND, 0);
    expect(play, "the Wand's remove-and-Search side should be a legal map play").toBeTruthy();
    const after = applyOk(state, play!);

    // The Wand left the game (a removeSelf play), never touching the discard pile.
    expect(after.players.p1.removed).toContain(MAGIC_WAND);
    expect(after.players.p1.discard).not.toContain(MAGIC_WAND);
    expect(after.players.p1.hand).not.toContain(MAGIC_WAND);

    // An Artifact-deck Search is either open as a choice or queued as a reward.
    const choice = after.pendingChoice;
    const searchingArtifacts =
      Boolean(
        after.adventure?.rewardQueue.some(
          (reward) => reward.kind === "shared-deck-search" && String(reward.deckId).startsWith("artifacts")
        )
      ) ||
      choice?.type === "DECK_SEARCH" ||
      Boolean(choice && "deckPick" in choice && choice.deckPick);
    expect(searchingArtifacts, "a Search of the Artifact deck should be open or queued").toBe(true);
  });
});

// ===========================================================================
// Combat stat reactions — Crimson Shield (+def), Warlord's Banner / Dragonheart (+atk)
// ===========================================================================

/** p1's Griffins (attack 5) melee p2's Skeletons (defense 1); returns declared state. */
function declareAttack(seed: string, p1Hand: string[], p2Hand: string[]): GameState {
  const state = createInitialGameState(seed);
  const attacker = state.combat!.units.unit_p1_griffins;
  attacker.type = "ground";
  attacker.position = 9;
  attacker.attack = 5;
  attacker.abilities = [];
  const defender = state.combat!.units.unit_p2_skeletons;
  defender.position = 13; // adjacent to 9
  defender.defense = 1;
  defender.maxHealth = 40;
  defender.damage = 0;
  defender.abilities = [];
  state.players.p1.hand = p1Hand;
  state.players.p2.hand = p2Hand;
  state.combat!.dice.scriptedRolls = [0, 0, 0];
  state.combat!.dice.rollCount = 0;
  state.activePlayerId = "p1";
  state.combat!.activeUnitId = "unit_p1_griffins";
  return applyOk(state, {
    type: "ATTACK_UNIT",
    playerId: "p1",
    attackerId: "unit_p1_griffins",
    defenderId: "unit_p2_skeletons"
  });
}

function findReaction(
  state: GameState,
  playerId: PlayerId,
  cardId: string,
  optionIndex: number
): Extract<GameAction, { type: "PLAY_REACTION" }> | undefined {
  for (const legal of state.reactionWindow?.legalReactions[playerId] ?? []) {
    const action = legal.action;
    if (action.type === "PLAY_REACTION" && action.cardId === cardId && action.optionIndex === optionIndex) {
      return action;
    }
  }
  return undefined;
}

function settle(state: GameState): GameState {
  let current = state;
  let safety = 40;
  while (safety-- > 0 && (current.reactionWindow || current.pendingChoice?.type === "ATTACK_DIE_REROLL")) {
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

const skeletonDamage = (state: GameState): number => state.combat!.units.unit_p2_skeletons.damage;

describe("Warlord's Banner — attacker +attack reaction", () => {
  it("CONTROL — with no banner the hit is 5 attack + 0 die − 1 defense = 4 damage", () => {
    const declared = declareAttack("banner-control", [], []);
    expect(skeletonDamage(settle(declared))).toBe(4);
  });

  it("the +2 side raises the resolved hit to 6 damage (7 attack − 1 defense)", () => {
    const declared = declareAttack("banner-plus2", [WARLORDS_BANNER], []);
    const react = findReaction(declared, "p1", WARLORDS_BANNER, 0);
    expect(react, "the +2 attack side should be offered to the attacker").toBeTruthy();
    const after = settle(applyOk(declared, react!));
    expect(skeletonDamage(after)).toBe(6);
    // The +2 side is NOT the remove side — the banner goes to discard, not removed.
    expect(after.players.p1.hand).not.toContain(WARLORDS_BANNER);
    expect(after.players.p1.removed).not.toContain(WARLORDS_BANNER);
  });

  it("the remove side raises the hit to 7 damage (8 attack − 1 defense) and leaves the game", () => {
    const declared = declareAttack("banner-remove", [WARLORDS_BANNER], []);
    const react = findReaction(declared, "p1", WARLORDS_BANNER, 1);
    expect(react, "the remove-for-+3 side should be offered").toBeTruthy();
    const after = settle(applyOk(declared, react!));
    expect(skeletonDamage(after)).toBe(7);
    expect(after.players.p1.removed).toContain(WARLORDS_BANNER);
    expect(after.players.p1.discard).not.toContain(WARLORDS_BANNER);
  });
});

describe("Dragonheart — relic attacker +attack reaction", () => {
  it("the +3 side raises the resolved hit to 7 damage (8 attack − 1 defense)", () => {
    const declared = declareAttack("dragonheart-plus3", [DRAGONHEART], []);
    const react = findReaction(declared, "p1", DRAGONHEART, 0);
    expect(react, "the +3 attack side should be offered to the attacker").toBeTruthy();
    const after = settle(applyOk(declared, react!));
    expect(skeletonDamage(after)).toBe(7);
  });

  it("the remove side raises the hit to 9 damage (10 attack − 1 defense) AND the card is removed from the game", () => {
    const declared = declareAttack("dragonheart-remove", [DRAGONHEART], []);
    const react = findReaction(declared, "p1", DRAGONHEART, 1);
    expect(react, "the remove-for-+5 side should be offered").toBeTruthy();
    const after = settle(applyOk(declared, react!));
    expect(skeletonDamage(after)).toBe(9);
    // The relic left the game — NOT in the discard pile (assert the zone).
    expect(after.players.p1.removed).toContain(DRAGONHEART);
    expect(after.players.p1.discard).not.toContain(DRAGONHEART);
    expect(after.players.p1.hand).not.toContain(DRAGONHEART);
  });
});

describe("Crimson Shield — defender +defense reaction", () => {
  it("the +2 side lowers the hit to 2 damage (5 attack − 3 defense) vs the 4-damage CONTROL", () => {
    // Control: 5 + 0 − 1 = 4.
    expect(skeletonDamage(settle(declareAttack("shield-control", [], [])))).toBe(4);

    const declared = declareAttack("shield-plus2", [], [CRIMSON_SHIELD]);
    const react = findReaction(declared, "p2", CRIMSON_SHIELD, 0);
    expect(react, "the +2 defense side should be offered to the defender").toBeTruthy();
    const after = settle(applyOk(declared, react!));
    expect(skeletonDamage(after)).toBe(2);
    expect(after.players.p2.removed).not.toContain(CRIMSON_SHIELD);
  });

  it("the remove side lowers the hit to 1 damage (5 attack − 4 defense) and leaves the game", () => {
    const declared = declareAttack("shield-remove", [], [CRIMSON_SHIELD]);
    const react = findReaction(declared, "p2", CRIMSON_SHIELD, 1);
    expect(react, "the remove-for-+3 side should be offered").toBeTruthy();
    const after = settle(applyOk(declared, react!));
    expect(skeletonDamage(after)).toBe(1);
    expect(after.players.p2.removed).toContain(CRIMSON_SHIELD);
    expect(after.players.p2.discard).not.toContain(CRIMSON_SHIELD);
  });
});
