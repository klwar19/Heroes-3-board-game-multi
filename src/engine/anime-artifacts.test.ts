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
import { placeCreatureBank, startAdventureRound } from "./adventure";
import { startNeutralEncounter } from "./adventure-reducer";
import { artifactDeckAccess } from "./ruleset";
import { cardLibrary } from "@/data/cards/library";
import {
  animeXianxiaArtifactCardIds,
  animeXianxiaArtifactMajorIds,
  animeXianxiaArtifactMinorIds,
  animeXianxiaArtifactRelicIds
} from "@/data/anime/artifacts";
import { artifactDeckBinhRelic } from "@/data/cards/artifacts";

/**
 * Pháp Bảo xianxia Artifacts (`anime.xianxiaArtifacts`, plan §5.10). Every claim
 * fails if its wiring is removed. Each is either an income permanent
 * (`resourceRoundGain`, the second card CONDITIONAL on hero-in-town), a Boots
 * movement card, or a Sentinel's-Shield-family combat stat reaction — all pure
 * REUSE of already-wired arms.
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

const COSMIC_BAG = "anime.artifact.tui_can_khon";
const SPIRIT_BOARD = "anime.artifact.tu_linh_ban";
const WHEELS = "anime.artifact.phong_hoa_luan";
const MIRROR = "anime.artifact.bat_qua_kinh";
const HEAVEN_SWORD = "anime.artifact.tru_tien_kiem";

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

describe("Pháp Bảo deck join", () => {
  it("default (module OFF) table has ZERO anime artifact ids in any deck or discard", () => {
    const off = createAdventureGameState({ seed: "anime-art-off", difficulty: "normal", rollFirstPlayer: false });
    const ids = allDeckCardIds(off);
    for (const animeId of animeXianxiaArtifactCardIds) {
      expect(countOf(ids, animeId), `${animeId} must not join a default table`).toBe(0);
    }
  });

  it("CONTROL — master anime ON but xianxiaArtifacts OFF still joins nothing", () => {
    const moduleOff = createAdventureGameState({
      seed: "anime-art-module-off",
      difficulty: "normal",
      rollFirstPlayer: false,
      anime: { enabled: true, xianxiaArtifacts: false }
    });
    const ids = allDeckCardIds(moduleOff);
    for (const animeId of animeXianxiaArtifactCardIds) {
      expect(countOf(ids, animeId)).toBe(0);
    }
  });

  it("split decks (default BINH): each card joins its correct tier deck exactly once", () => {
    const on = createAdventureGameState({
      seed: "anime-art-split-on",
      difficulty: "normal",
      rollFirstPlayer: false,
      anime: { enabled: true, xianxiaArtifacts: true }
    });

    for (const id of animeXianxiaArtifactMinorIds) {
      expect(countOf(artifactDeckCardIds(on, "artifacts-minor"), id), `${id} in artifacts-minor`).toBe(1);
    }
    for (const id of animeXianxiaArtifactMajorIds) {
      expect(countOf(artifactDeckCardIds(on, "artifacts-major"), id), `${id} in artifacts-major`).toBe(1);
    }
    for (const id of animeXianxiaArtifactRelicIds) {
      expect(countOf(artifactDeckCardIds(on, "artifacts-relic"), id), `${id} in artifacts-relic`).toBe(1);
    }
    // And exactly once across the WHOLE table (no leakage into a second deck).
    const all = allDeckCardIds(on);
    for (const id of animeXianxiaArtifactCardIds) {
      expect(countOf(all, id), `${id} appears exactly once table-wide`).toBe(1);
    }
  });

  it("legacy single Artifact deck: all five cards join it exactly once", () => {
    const legacy = createAdventureGameState({
      seed: "anime-art-legacy-on",
      difficulty: "normal",
      rollFirstPlayer: false,
      houseRules: { "split-decks": false },
      anime: { enabled: true, xianxiaArtifacts: true }
    });
    // No split decks exist in legacy mode.
    expect(legacy.decks["artifacts-relic"]).toBeUndefined();
    const combined = artifactDeckCardIds(legacy, "artifacts");
    for (const id of animeXianxiaArtifactCardIds) {
      expect(countOf(combined, id), `${id} in the combined legacy deck`).toBe(1);
    }
  });

  it("every anime artifact id resolves in the card library (hidden-info / lookup path)", () => {
    for (const id of animeXianxiaArtifactCardIds) {
      expect(cardLibrary[id], `${id} must be registered`).toBeTruthy();
      expect(cardLibrary[id].kind).toBe("artifact");
    }
  });
});

// ===========================================================================
// Income permanents — Túi Càn Khôn (unconditional) & Tụ Linh Bàn (in-town)
// ===========================================================================

/** A map-turn adventure state with p1 active and a zeroed base economy. */
function mapState(seed: string): GameState {
  const state = createAdventureGameState({ seed, difficulty: "normal", rollFirstPlayer: false });
  for (const player of Object.values(state.players)) {
    player.canMulligan = false;
    player.needsHandRefresh = false;
  }
  state.activePlayerId = "p1";
  state.players.p1.production = { gold: 0, buildingMaterials: 0, valuables: 0 };
  state.players.p1.permanents = [];
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

describe("Túi Càn Khôn (Cosmic Bag) — building-materials income permanent", () => {
  it("enters play, then pays 1 building materials each Resources round (CONTROL: no card ⇒ no rise)", () => {
    const state = mapState("cosmic-bag-income");
    state.players.p1.hand = [COSMIC_BAG];
    const enter = findPlay(state, "p1", COSMIC_BAG, 0);
    expect(enter, "the enter-play option should be offered on the map").toBeTruthy();
    const played = applyOk(state, enter!);
    expect(played.players.p1.permanents).toEqual([COSMIC_BAG]);

    const before = played.players.p1.resources.buildingMaterials;
    played.round = 3; // odd round after the first = a Resources round
    startAdventureRound(played);
    expect(played.players.p1.resources.buildingMaterials).toBe(before + 1);

    // CONTROL — the identical Resources round with the card NOT in play pays nothing.
    const control = mapState("cosmic-bag-control");
    control.players.p1.permanents = [];
    const controlBefore = control.players.p1.resources.buildingMaterials;
    control.round = 3;
    startAdventureRound(control);
    expect(control.players.p1.resources.buildingMaterials).toBe(controlBefore);
  });

  it("the remove side pays 1 building materials + 1 valuables and leaves the game", () => {
    const state = mapState("cosmic-bag-remove");
    state.players.p1.hand = [COSMIC_BAG];
    const beforeMat = state.players.p1.resources.buildingMaterials;
    const beforeVal = state.players.p1.resources.valuables;

    const remove = findPlay(state, "p1", COSMIC_BAG, 1);
    expect(remove, "the remove option should be offered").toBeTruthy();
    const result = applyOk(state, remove!);

    expect(result.players.p1.resources.buildingMaterials).toBe(beforeMat + 1);
    expect(result.players.p1.resources.valuables).toBe(beforeVal + 1);
    expect(result.players.p1.removed).toContain(COSMIC_BAG);
    expect(result.players.p1.permanents ?? []).not.toContain(COSMIC_BAG);
    expect(result.players.p1.discard).not.toContain(COSMIC_BAG);
  });
});

describe("Tụ Linh Bàn (Spirit Gathering Board) — CONDITIONAL town-stationed income", () => {
  it("pays 2 gold at a Resources round WHILE the main hero stands in a Town of yours", () => {
    const state = mapState("spirit-in-town");
    state.players.p1.permanents = [SPIRIT_BOARD];
    // The default main hero starts on its own Town field — assert that premise.
    const hero = getMainHero(state, "p1")!;
    const ownTown = Object.values(state.towns).find((town) => town.controllerId === "p1");
    expect(hero.spaceId).toBe(ownTown?.fieldId);

    const before = state.players.p1.resources.gold;
    state.round = 3;
    startAdventureRound(state);
    expect(state.players.p1.resources.gold).toBe(before + 2);
  });

  it("pays NOTHING when the main hero is NOT in one of your Towns", () => {
    const state = mapState("spirit-out-of-town");
    state.players.p1.permanents = [SPIRIT_BOARD];
    getMainHero(state, "p1")!.spaceId = null; // marched off / no position

    const before = state.players.p1.resources.gold;
    state.round = 3;
    startAdventureRound(state);
    expect(state.players.p1.resources.gold).toBe(before);
  });

  it("CONTROL — an UNCONDITIONAL income permanent pays regardless of the hero's town position", () => {
    // The Cosmic Bag (no requiresHeroInTown) still pays with the hero OUT of town,
    // proving the gate is specific to Tụ Linh Bàn, not a global town requirement.
    const state = mapState("spirit-control-unconditional");
    state.players.p1.permanents = [COSMIC_BAG];
    getMainHero(state, "p1")!.spaceId = null;

    const before = state.players.p1.resources.buildingMaterials;
    state.round = 3;
    startAdventureRound(state);
    expect(state.players.p1.resources.buildingMaterials).toBe(before + 1);
  });

  it("the remove side pays 3 gold and leaves the game", () => {
    const state = mapState("spirit-remove");
    state.players.p1.hand = [SPIRIT_BOARD];
    const before = state.players.p1.resources.gold;
    const remove = findPlay(state, "p1", SPIRIT_BOARD, 1);
    expect(remove).toBeTruthy();
    const result = applyOk(state, remove!);
    expect(result.players.p1.resources.gold).toBe(before + 3);
    expect(result.players.p1.removed).toContain(SPIRIT_BOARD);
  });
});

// ===========================================================================
// Phong Hỏa Luân (Wind & Fire Wheels) — map movement + continue-window synergy
// ===========================================================================

describe("Phong Hỏa Luân (Wind & Fire Wheels) — movement", () => {
  it("the +2 side raises the hero's movement points by 2 (CONTROL: empty hand offers nothing)", () => {
    const state = mapState("wheels-map");
    state.players.p1.hand = [WHEELS];
    const hero = getMainHero(state, "p1")!;
    const before = hero.movementPoints;

    const play = findPlay(state, "p1", WHEELS, 0);
    expect(play, "the +2 movement side should be a legal map play").toBeTruthy();
    const after = applyOk(state, play!);
    expect(getMainHero(after, "p1")!.movementPoints).toBe(before + 2);

    // CONTROL — with the card gone from hand, no such play is offered.
    const control = mapState("wheels-control");
    control.players.p1.hand = [];
    expect(findPlay(control, "p1", WHEELS, 0)).toBeUndefined();
  });

  it("the remove side raises movement by 3 and leaves the game", () => {
    const state = mapState("wheels-remove");
    state.players.p1.hand = [WHEELS];
    const before = getMainHero(state, "p1")!.movementPoints;
    const play = findPlay(state, "p1", WHEELS, 1);
    expect(play).toBeTruthy();
    const after = applyOk(state, play!);
    expect(getMainHero(after, "p1")!.movementPoints).toBe(before + 3);
    expect(after.players.p1.removed).toContain(WHEELS);
  });

  it("is offered as a movement TOP-UP in a neutral combat's continue-or-retreat window", () => {
    let state = driveToAwaitingContinue("wheels-continue");
    expect(state.combat?.awaitingContinue).toBe(true);

    getMainHero(state, "p1")!.movementPoints = 0;
    state.players.p1.hand = [WHEELS];

    const actions = getLegalActions(state, "p1");
    // Out of movement: the plain continue is not offered.
    expect(actions.some((legal) => legal.action.type === "CONTINUE_NEUTRAL_COMBAT")).toBe(false);
    const topUp = actions.find(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === WHEELS
    );
    expect(topUp, "the map-only Wheels IS offered in the continue window (GAIN_HERO_MOVEMENT arm)").toBeTruthy();

    state = applyOk(state, topUp!.action);
    // The +2 (basic) side lands, the window stays open, and the hero can fight on.
    expect(getMainHero(state, "p1")!.movementPoints).toBe(2);
    expect(state.combat?.awaitingContinue).toBe(true);
    expect(getLegalActions(state, "p1").some((legal) => legal.action.type === "CONTINUE_NEUTRAL_COMBAT")).toBe(true);
  });
});

/**
 * Drives a Crypt Creature-Bank fight (a neutral combat) to the end of round 1,
 * where the neutral one-round time limit pauses on `awaitingContinue`. Adapted
 * from `neutral-combat-movement-extend.test.ts` — every unit's Attack is zeroed
 * and every roll is "-1", so the round runs out with all units alive.
 */
function driveToAwaitingContinue(seed: string): GameState {
  let state = createAdventureGameState({ seed, difficulty: "easy", rollFirstPlayer: false });
  state =
    state.players.p1.needsHandRefresh || state.players.p1.canMulligan
      ? applyOk(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] })
      : state;

  const hero = getMainHero(state, "p1")!;
  hero.level = 7;
  hero.spaceId = "bank-field";
  state.adventure!.fields["bank-field"] = {
    spaceId: "bank-field",
    tileInstanceId: "t",
    slot: 0,
    location: "blocked_field",
    blackCube: false,
    flagOwnerId: null,
    everFlagged: false,
    settlementResource: null
  };
  placeCreatureBank(state, "bank-field", "crypt");

  startNeutralEncounter(state, hero, state.adventure!.fields["bank-field"]);
  const place = getLegalActions(state, "p1").find((entry) => entry.action.type === "PLACE_COMBAT_UNIT");
  state = applyOk(state, place!.action);
  state = applyOk(state, { type: "FINISH_COMBAT_PLACEMENT", playerId: "p1" });

  state.combat!.dice.scriptedRolls = Array(60).fill(-1);
  for (const unit of Object.values(state.combat!.units)) {
    unit.attack = 0;
  }

  let safety = 100;
  while (state.combat && !state.combat.awaitingContinue && !state.combat.outcome && safety > 0) {
    safety -= 1;
    const actions = getLegalActions(state, "p1");
    const next =
      actions.find((legal) => legal.action.type === "DEFEND_UNIT") ??
      actions.find((legal) => legal.action.type === "PASS_REACTION") ??
      actions.find((legal) => legal.action.type === "CHOOSE_PENDING_ROLL") ??
      actions[0];
    if (!next) break;
    state = applyOk(state, next.action);
  }

  return state;
}

// ===========================================================================
// Combat stat reactions — Tru Tiên Kiếm (+attack) & Bát Quái Kính (+defense)
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

describe("Tru Tiên Kiếm (Heaven-Slaying Sword) — attacker +attack reaction", () => {
  it("CONTROL — with no sword the hit is 5 attack + 0 die − 1 defense = 4 damage", () => {
    const declared = declareAttack("heaven-sword-control", [], []);
    expect(skeletonDamage(settle(declared))).toBe(4);
  });

  it("the +2 side raises the resolved hit to 6 damage (7 attack − 1 defense)", () => {
    const declared = declareAttack("heaven-sword-plus2", [HEAVEN_SWORD], []);
    const react = findReaction(declared, "p1", HEAVEN_SWORD, 1);
    expect(react, "the +2 attack side should be offered to the attacker").toBeTruthy();
    const after = settle(applyOk(declared, react!));
    expect(skeletonDamage(after)).toBe(6);
    expect(after.players.p1.hand).not.toContain(HEAVEN_SWORD);
  });

  it("the discard-1 side raises the hit to 7 damage (8 attack − 1 defense)", () => {
    const declared = declareAttack("heaven-sword-discard", [HEAVEN_SWORD, "stat.defense"], []);
    const react = findReaction(declared, "p1", HEAVEN_SWORD, 0);
    expect(react, "the discard-for-+3 side should be offered").toBeTruthy();
    const after = settle(applyOk(declared, { ...react!, costCardIds: ["stat.defense"] }));
    expect(skeletonDamage(after)).toBe(7);
    // The paid card left the hand (to discard) alongside the spent sword.
    expect(after.players.p1.hand).not.toContain("stat.defense");
  });
});

describe("Bát Quái Kính (Bagua Mirror) — defender +defense reaction", () => {
  it("the +1 side lowers the hit to 3 damage (5 attack − 2 defense) vs the 4-damage CONTROL", () => {
    // Same control as above: 5 + 0 − 1 = 4.
    expect(skeletonDamage(settle(declareAttack("mirror-control", [], [])))).toBe(4);

    const declared = declareAttack("mirror-plus1", [], [MIRROR]);
    const react = findReaction(declared, "p2", MIRROR, 1);
    expect(react, "the +1 defense side should be offered to the defender").toBeTruthy();
    const after = settle(applyOk(declared, react!));
    expect(skeletonDamage(after)).toBe(3);
  });

  it("the discard-1 side lowers the hit to 2 damage (5 attack − 3 defense)", () => {
    const declared = declareAttack("mirror-discard", [], [MIRROR, "stat.attack"]);
    const react = findReaction(declared, "p2", MIRROR, 0);
    expect(react, "the discard-for-+2 side should be offered").toBeTruthy();
    const after = settle(applyOk(declared, { ...react!, costCardIds: ["stat.attack"] }));
    expect(skeletonDamage(after)).toBe(2);
  });
});

// ===========================================================================
// Tier gate — the anime relic shares the core relic deck's access gate
// ===========================================================================

describe("Pháp Bảo tier gate", () => {
  it("a low-level hero can reach neither the anime relic nor a core relic; a qualified hero reaches both", () => {
    const state = createAdventureGameState({
      seed: "anime-art-tier",
      difficulty: "normal",
      rollFirstPlayer: false,
      anime: { enabled: true, xianxiaArtifacts: true }
    });
    // The anime relic and a core relic sit in the SAME relic deck, so one gate
    // governs both.
    const relicDeck = artifactDeckCardIds(state, "artifacts-relic");
    expect(relicDeck).toContain(HEAVEN_SWORD);
    expect(artifactDeckBinhRelic).toContain("artifact.sword_of_judgement");

    const hero = getMainHero(state, "p1")!;
    hero.spaceId = null; // off any tile, so only level/source decide the gate

    // Low: level 1, no artifact source → the relic deck is closed.
    hero.level = 1;
    expect(artifactDeckAccess(state, "p1", hero, false).relic).toBe(false);

    // CONTROL — qualified: level 6 with an artifact source → the relic deck opens
    // for BOTH the anime relic and the core relic alike.
    hero.level = 6;
    expect(artifactDeckAccess(state, "p1", hero, true).relic).toBe(true);
  });
});
