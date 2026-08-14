/**
 * The 2-die Treasure Symbol behind a guard — the whole post-combat chain,
 * through the REAL action pipeline (2026-08-14 report: "won the fight, rolled
 * the Treasure dice, faces showed exp + artifact search, received nothing").
 * The engine half was audited healthy; these pins keep it that way:
 *
 *  - acknowledging the won combat rolls the field's two Treasure dice and
 *    leaves the choose-one waiting in the pending visit, with BOTH options
 *    offered to the owner (the client hide was presentational — see
 *    src/app/page-combat-dice-map-prompt.test.tsx);
 *  - "Gain 1 experience" really moves the hero's experience;
 *  - "Search (2) the Artifact deck" really opens the search chain and ends
 *    with a new card in hand (split decks, level-up Ability Search queued
 *    ahead of it — the production shape: the win also leveled the hero).
 */
import { describe, expect, it } from "vitest";
import { ATTACK_DIE_FACES } from "./battlefield";
import { getMainHero } from "./adventure";
import { applyAction, createAdventureGameState, NEUTRAL_PLAYER_ID } from "./index";
import { getLegalActions } from "./legal-actions";
import type { CombatState, GameState, MapFieldState, MapTileState } from "./state";

function makeGame(seed: string): GameState {
  const state = createAdventureGameState({
    seed,
    difficulty: "normal",
    rollFirstPlayer: false,
    events: true,
    wog: { enabled: true, commanders: true },
    players: [
      { id: "p1", name: "Reaper", factionId: "castle" as const, heroDefId: "adelaide" },
      { id: "p2", name: "Absolution", factionId: "necropolis" as const, heroDefId: "sandro" }
    ]
  } as Parameters<typeof createAdventureGameState>[0]);
  for (const player of Object.values(state.players)) {
    player.needsHandRefresh = false;
    player.canMulligan = false;
  }
  return state;
}

function addTile(state: GameState, group: MapTileState["group"]): void {
  state.adventure!.tiles["repro-tile"] = {
    id: "repro-tile",
    tileDefId: "repro",
    centerRow: 0,
    centerCol: 0,
    rotation: 0,
    faceDown: false,
    group
  };
}

function addField(state: GameState, location: string, difficulty?: number): MapFieldState {
  const field: MapFieldState = {
    spaceId: "repro-field",
    tileInstanceId: "repro-tile",
    slot: 0,
    location,
    difficulty,
    blackCube: false,
    flagOwnerId: null,
    everFlagged: false,
    settlementResource: null
  };
  state.adventure!.fields[field.spaceId] = field;
  getMainHero(state, "p1")!.spaceId = field.spaceId;
  return field;
}

function stageWonNeutralCombat(state: GameState): void {
  const hero = getMainHero(state, "p1")!;
  state.phase = "combat";
  state.combat = {
    attackerPlayerId: "p1",
    defenderPlayerId: NEUTRAL_PLAYER_ID,
    units: {},
    setup: null,
    awaitingContinue: false,
    context: {
      kind: "neutral",
      heroId: hero.id,
      fieldId: hero.spaceId!,
      difficulty: 2,
      hasAzure: false
    },
    outcome: {
      winnerPlayerId: "p1",
      defeatedPlayerId: NEUTRAL_PLAYER_ID,
      reason: "all-enemy-units-defeated"
    },
    dice: { faces: [...ATTACK_DIE_FACES], seed: "s", rollCount: 0 }
  } as CombatState;
}

/**
 * Stage to the open choose-one: won combat on a 2-die Treasure field, hero one
 * experience short of level 2 (the win levels them up, queueing the level-up
 * Ability Search behind the visit — the production shape). Scans seeds until
 * the two dice show the reported pair (experience + artifact-search).
 */
function stageToChoice(): GameState {
  for (let i = 0; i < 200; i += 1) {
    const state = makeGame(`treasure-payout-${i}`);
    addTile(state, "far");
    const field = addField(state, "treasure_symbol", 2);
    field.treasureDice = 2;
    const hero = getMainHero(state, "p1")!;
    hero.experience = 1;
    hero.level = 1;
    stageWonNeutralCombat(state);
    const applied = applyAction(state, { type: "ACKNOWLEDGE_COMBAT_END", playerId: "p1" });
    expect(applied.errors).toEqual([]);
    const next = applied.state;
    const roll = [...next.eventLog].reverse().find(
      (event) => event.type === "ADVENTURE_DICE_ROLLED" && event.dice === "treasure"
    );
    const faces = roll?.type === "ADVENTURE_DICE_ROLLED" ? roll.treasureRolls ?? [] : [];
    if (faces.includes("experience") && faces.includes("artifact-search")) {
      return next;
    }
  }
  throw new Error("no seed rolled the experience + artifact-search pair");
}

describe("guarded 2-die Treasure Symbol: the full post-combat payout chain", () => {
  it("acking the win leaves the choose-one waiting with both options offered", () => {
    const state = stageToChoice();
    expect(state.combat).toBeNull();
    expect(state.adventure?.pendingVisit?.steps[0]?.type).toBe("CHOOSE_ONE");
    const labels = getLegalActions(state, "p1").map((legal) => legal.label);
    expect(labels).toContain("Gain 1 experience");
    expect(labels).toContain("Search (2) the Artifact deck");
  });

  it("'Gain 1 experience' really raises the hero's experience", () => {
    const state = stageToChoice();
    const offer = getLegalActions(state, "p1").find((legal) => legal.label === "Gain 1 experience");
    expect(offer).toBeTruthy();
    const before = getMainHero(state, "p1")!.experience;
    const applied = applyAction(state, offer!.action);
    expect(applied.errors).toEqual([]);
    expect(getMainHero(applied.state, "p1")!.experience).toBe(before + 1);
  });

  it("'Search (2) the Artifact deck' ends with a new card in hand", () => {
    let state = stageToChoice();
    const offer = getLegalActions(state, "p1").find(
      (legal) => legal.label === "Search (2) the Artifact deck"
    );
    expect(offer).toBeTruthy();
    const handBefore = [...state.players.p1.hand];
    const applied = applyAction(state, offer!.action);
    expect(applied.errors).toEqual([]);
    state = applied.state;
    // Drive every follow-up window (the queued level-up Ability Search first,
    // then the artifact search) by taking the first offer each time.
    for (let i = 0; i < 12; i += 1) {
      if (!state.pendingChoice && !state.adventure!.pendingVisit && state.adventure!.rewardQueue.length === 0) {
        break;
      }
      const offers = getLegalActions(state, "p1");
      expect(offers.length, "an owed window must always offer an action").toBeGreaterThan(0);
      const next = applyAction(state, offers[0].action);
      expect(next.errors).toEqual([]);
      state = next.state;
    }
    expect(state.players.p1.hand.length).toBeGreaterThan(handBefore.length);
    expect(state.players.p1.hand.some((cardId) => !handBefore.includes(cardId))).toBe(true);
  });
});
