import { describe, expect, it } from "vitest";
import {
  applyAction,
  canPlaceTransformOn,
  createAdventureGameState,
  findEvent,
  getLegalActions,
  getMainHero,
  insertUnitTransform,
  makeCombatUnitFromArmy,
  makeUnitTransformState,
  markUnitRemovedIfNeeded,
  specialtyTransformHealth,
  type CombatUnitState,
  type GameAction,
  type GameState,
  type UnitTransformState
} from "./index";
import { finalizeAdventureCombat, pumpAdventureQueues } from "./adventure-reducer";
import type { CombatState, MapFieldState } from "./state";
import { cardLibrary } from "@/data/cards/library";

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toHaveLength(0);
  return result.state;
}

const HORDE = makeTransformEffect("specialty.sandro.1");
const HORDE_ZOMBIES = makeTransformEffect("specialty.sandro.4");
const LEGION = makeTransformEffect("specialty.sandro.6");

function makeTransformEffect(cardId: string) {
  const effect = cardLibrary[cardId]?.effect;
  if (effect?.type !== "TRANSFORM_UNIT") {
    throw new Error(`${cardId} is not a TRANSFORM_UNIT card`);
  }
  return effect;
}

describe("Sandro's Cloak — BINH skeleton HP house rule", () => {
  it("gives the Horde and Legion of Skeletons 3 HP in BINH, printed 2 in legacy; Zombies keep 3", () => {
    expect(specialtyTransformHealth("binh", "specialty.sandro.1", 2)).toBe(3);
    expect(specialtyTransformHealth("binh", "specialty.sandro.6", 2)).toBe(3);
    expect(specialtyTransformHealth("binh", "specialty.sandro.4", 3)).toBe(3);
    expect(specialtyTransformHealth("legacy", "specialty.sandro.1", 2)).toBe(2);
    expect(specialtyTransformHealth("legacy", "specialty.sandro.6", 2)).toBe(2);
  });

  it("the level I card text and the Necromancy card are implemented", () => {
    expect(cardLibrary["specialty.sandro.4"].implementationStatus).toBe("implemented");
    expect(cardLibrary["specialty.sandro.6"].implementationStatus).toBe("implemented");
    expect(cardLibrary["ability.necromancy"].implementationStatus).toBe("implemented");
    expect(cardLibrary["ability.necromancy"].effect.type).toBe("NECROMANCY_REINFORCE");
  });
});

describe("Sandro's Cloak — stacking rules (wiki FAQ)", () => {
  it("level I/IV go on a bare pack; the Legion goes on Few, Pack, or even a Horde and stays on top", () => {
    // Level I needs a Pack of Skeletons.
    expect(canPlaceTransformOn("Skeletons", "few", undefined, HORDE)).toBe(false);
    expect(canPlaceTransformOn("Skeletons", "pack", undefined, HORDE)).toBe(true);
    // Wrong unit name is rejected.
    expect(canPlaceTransformOn("Zombies", "pack", undefined, HORDE)).toBe(false);
    expect(canPlaceTransformOn("Zombies", "pack", undefined, HORDE_ZOMBIES)).toBe(true);

    // Level VI Legion goes on a Few or a Pack.
    expect(canPlaceTransformOn("Skeletons", "few", undefined, LEGION)).toBe(true);
    expect(canPlaceTransformOn("Skeletons", "pack", undefined, LEGION)).toBe(true);

    // "even a Horde": a Legion may be added over an existing Horde.
    const horde = [makeUnitTransformState(HORDE, "specialty.sandro.1", "binh")];
    expect(canPlaceTransformOn("Skeletons", "pack", horde, LEGION)).toBe(true);
    // But not a second Legion.
    const legion = [makeUnitTransformState(LEGION, "specialty.sandro.6", "binh")];
    expect(canPlaceTransformOn("Skeletons", "pack", legion, LEGION)).toBe(false);
    // And the Horde cannot go on while a Horde is already there.
    expect(canPlaceTransformOn("Skeletons", "pack", horde, HORDE)).toBe(false);
  });

  it("keeps the alwaysOnTop Legion above a later Horde", () => {
    const legion = makeUnitTransformState(LEGION, "specialty.sandro.6", "binh");
    const horde = makeUnitTransformState(HORDE, "specialty.sandro.1", "binh");
    const stack = insertUnitTransform([legion], horde);
    expect(stack.at(-1)?.cardId).toBe("specialty.sandro.6"); // Legion still on top
    expect(stack[0]?.cardId).toBe("specialty.sandro.1"); // Horde tucked underneath
  });
});

describe("Sandro's Cloak — defeat cascade", () => {
  function makeSkeletonCombatState(transforms: UnitTransformState[]): { state: GameState; unit: CombatUnitState } {
    const unit = makeCombatUnitFromArmy(
      { id: "army_skel", unitDefId: "necropolis.skeletons", side: "pack", transforms },
      "p1",
      "unit_skel",
      1,
      "binh"
    );
    if (!unit) {
      throw new Error("Expected a skeleton combat unit.");
    }
    const state = {
      ruleset: "binh",
      players: {
        p1: { id: "p1", discard: [], army: [{ id: "army_skel", unitDefId: "necropolis.skeletons", side: "pack", transforms: transforms.map((entry) => ({ ...entry })) }] }
      },
      combat: { units: { unit_skel: unit } },
      eventLog: [],
      eventCounter: 0
    } as unknown as GameState;
    return { state, unit };
  }

  it("discards a defeated Cloak and reveals the Pack underneath with the excess damage", () => {
    const horde = makeUnitTransformState(HORDE, "specialty.sandro.1", "binh");
    const { state, unit } = makeSkeletonCombatState([horde]);
    // BINH Horde HP is 3; the Pack of Skeletons underneath has its printed HP.
    expect(unit.maxHealth).toBe(3);
    expect(unit.cardName).toBe("Horde of Skeletons");

    unit.damage = 4; // lethal to the Horde (3 HP), 1 carries over
    markUnitRemovedIfNeeded(state, unit);

    expect(state.players.p1.discard).toContain("specialty.sandro.1");
    expect(unit.transforms ?? []).toHaveLength(0);
    expect(unit.cardName).toBe("Pack of Skeletons");
    expect(unit.damage).toBe(1);
    expect(findEvent(state, "SPECIALTY_CARD_DEFEATED")).toMatchObject({
      cardId: "specialty.sandro.1",
      revealedName: "Pack of Skeletons"
    });
  });
});

describe("Necromancy ability — after-combat window", () => {
  function startSandroGame(): GameState {
    {
      const _g = createAdventureGameState({
      seed: "necro-seed",
      ruleset: "binh",
      difficulty: "normal",
      players: [
        { id: "p1", name: "Sandro", factionId: "necropolis", heroDefId: "sandro" },
        { id: "p2", name: "Catherine", factionId: "castle", heroDefId: "catherine" }
      ],
      rollFirstPlayer: false
    });
      for (const _pl of Object.values(_g.players)) { _pl.canMulligan = false; _pl.needsHandRefresh = false; }
      return _g;
    }
  }

  it("only offers Necromancy while the after-combat window is open", () => {
    const state = startSandroGame();
    state.players.p1.hand = ["ability.necromancy"];

    const before = getLegalActions(state, "p1").filter(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "ability.necromancy"
    );
    expect(before).toHaveLength(0);

    // The window is the now-or-never gate opened right after a non-Quick win.
    state.players.p1.necromancyWindow = true;
    state.adventure!.pendingNecromancy = { playerId: "p1" };
    const during = getLegalActions(state, "p1").filter(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "ability.necromancy"
    );
    expect(during.length).toBeGreaterThan(0);
  });

  it("cannot be played when it was drawn from the Ability deck on level-up", () => {
    const state = startSandroGame();
    state.players.p1.hand = ["ability.necromancy"];
    state.players.p1.necromancyWindow = true;
    state.adventure!.pendingNecromancy = { playerId: "p1" };
    // Same Necropolis hero, same open window — but this copy came out of the
    // level-up Ability-deck search, so it is kept yet unplayable.
    state.players.p1.deckDrawnAbilityCardIds = ["ability.necromancy"];

    const plays = getLegalActions(state, "p1").filter(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "ability.necromancy"
    );
    expect(plays).toHaveLength(0);
  });

  it("is Necropolis-only — a Castle hero who holds it can never play it", () => {
    const state = startSandroGame();
    state.players.p2.hand = ["ability.necromancy"];
    state.players.p2.necromancyWindow = true;
    state.adventure!.pendingNecromancy = { playerId: "p2" };
    state.activePlayerId = "p2";

    const plays = getLegalActions(state, "p2").filter(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "ability.necromancy"
    );
    expect(plays).toHaveLength(0);
  });

  it("playing Necromancy queues a half-gold (rounded down) reinforce choice and closes the window — but does NOT discard the card yet", () => {
    const state = startSandroGame();
    state.players.p1.hand = ["ability.necromancy"];
    state.players.p1.necromancyWindow = true;
    state.adventure!.pendingNecromancy = { playerId: "p1" };
    // Give Sandro a Few skeleton to reinforce and the gold to do it.
    state.players.p1.army = [{ id: "army_skel", unitDefId: "necropolis.skeletons", side: "few" }];
    state.players.p1.resources.gold = 20;

    const play = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "PLAY_CARD" &&
        legal.action.cardId === "ability.necromancy" &&
        (legal.action.mode ?? "basic") === "basic"
    );
    expect(play).toBeDefined();

    const next = apply(state, play!.action);
    expect(next.players.p1.necromancyWindow).toBe(false);
    expect(next.adventure?.pendingNecromancy ?? null).toBeNull();
    // The card is consumed ONLY on a successful upgrade — until the reinforce is
    // resolved it stays in hand, never the discard.
    expect(next.players.p1.discard).not.toContain("ability.necromancy");
    expect(next.players.p1.hand).toContain("ability.necromancy");
    // A reinforce prompt is now waiting for the player.
    const hasReinforcePrompt =
      Boolean(next.adventure?.pendingVisit) || (next.adventure?.rewardQueue.length ?? 0) > 0;
    expect(hasReinforcePrompt).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // The reported bug: Necromancy was discarded the instant it was played, so a
  // play with no eligible target — or a declined reinforce — LOST the card for
  // nothing. House rule (owner): you lose Necromancy ONLY when it actually
  // upgrades a unit; skipping or reinforcing nothing keeps the card in hand.
  // Each case below fails if the deferred-discard logic is removed.
  // ---------------------------------------------------------------------------
  function reinforceActions(state: GameState) {
    return getLegalActions(state, "p1").filter(
      (legal) => legal.action.type === "RESOLVE_VISIT_STEP"
    );
  }

  it("discards Necromancy ONLY after a successful reinforce (card leaves hand on the upgrade, not the play)", () => {
    const state = startSandroGame();
    state.players.p1.hand = ["ability.necromancy"];
    state.players.p1.necromancyWindow = true;
    state.adventure!.pendingNecromancy = { playerId: "p1" };
    state.players.p1.army = [{ id: "army_skel", unitDefId: "necropolis.skeletons", side: "few" }];
    state.players.p1.resources.gold = 20;

    const play = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "ability.necromancy"
    );
    let next = apply(state, play!.action);
    // Still in hand right after the play (the reinforce is pending).
    expect(next.players.p1.hand).toContain("ability.necromancy");

    const reinforce = getLegalActions(next, "p1").find((legal) => /Skeletons/.test(legal.label));
    expect(reinforce, "the affordable Skeleton reinforce should be offered").toBeTruthy();
    next = apply(next, reinforce!.action);

    // The unit upgraded Few → Pack, and NOW the card is spent.
    expect(next.players.p1.army.find((u) => u.id === "army_skel")?.side).toBe("pack");
    expect(next.players.p1.discard).toContain("ability.necromancy");
    expect(next.players.p1.hand).not.toContain("ability.necromancy");
  });

  it("keeps Necromancy when the player plays it but chooses Skip in the reinforce prompt", () => {
    const state = startSandroGame();
    state.players.p1.hand = ["ability.necromancy"];
    state.players.p1.necromancyWindow = true;
    state.adventure!.pendingNecromancy = { playerId: "p1" };
    state.players.p1.army = [{ id: "army_skel", unitDefId: "necropolis.skeletons", side: "few" }];
    state.players.p1.resources.gold = 20;

    const play = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "ability.necromancy"
    );
    let next = apply(state, play!.action);

    const skip = reinforceActions(next).find((legal) => /Skip/.test(legal.label));
    expect(skip, "the reinforce prompt should offer a Skip").toBeTruthy();
    next = apply(next, skip!.action);

    // Nothing upgraded; the card survives in hand for a later combat.
    expect(next.players.p1.army.find((u) => u.id === "army_skel")?.side).toBe("few");
    expect(next.players.p1.hand).toContain("ability.necromancy");
    expect(next.players.p1.discard).not.toContain("ability.necromancy");
  });

  it("keeps Necromancy when it is played with NO eligible/affordable target", () => {
    const state = startSandroGame();
    state.players.p1.hand = ["ability.necromancy"];
    state.players.p1.necromancyWindow = true;
    state.adventure!.pendingNecromancy = { playerId: "p1" };
    // A Few skeleton exists, but 0 gold means no reinforce is affordable.
    state.players.p1.army = [{ id: "army_skel", unitDefId: "necropolis.skeletons", side: "few" }];
    state.players.p1.resources.gold = 0;

    const play = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "ability.necromancy"
    );
    let next = apply(state, play!.action);

    // No reinforce option — only an acknowledgement prompt — and the card is kept.
    const reinforce = reinforceActions(next).filter((legal) => /Reinforce/.test(legal.label));
    expect(reinforce).toHaveLength(0);
    const ack = reinforceActions(next).find((legal) => /OK/.test(legal.label));
    if (ack) {
      next = apply(next, ack.action);
    }
    expect(next.players.p1.army.find((u) => u.id === "army_skel")?.side).toBe("few");
    expect(next.players.p1.hand).toContain("ability.necromancy");
    expect(next.players.p1.discard).not.toContain("ability.necromancy");
  });
});

describe("Necromancy ability — now-or-never timing (BINH house rule)", () => {
  function startSandroGame(): GameState {
    {
      const _g = createAdventureGameState({
      seed: "necro-timing",
      ruleset: "binh",
      difficulty: "normal",
      players: [
        { id: "p1", name: "Sandro", factionId: "necropolis", heroDefId: "sandro" },
        { id: "p2", name: "Catherine", factionId: "castle", heroDefId: "catherine" }
      ],
      rollFirstPlayer: false
    });
      for (const _pl of Object.values(_g.players)) { _pl.canMulligan = false; _pl.needsHandRefresh = false; }
      return _g;
    }
  }

  /**
   * Stages a just-finished neutral combat won by p1 standing on a Water Wheel
   * (a visit that pays out 3 gold). finalizeAdventureCombat then runs the real
   * after-combat flow: the win, the (deferred) field visit, and the window.
   */
  function stageNeutralWinOnGoldField(state: GameState): { fieldId: string; heroId: string } {
    const hero = getMainHero(state, "p1")!;
    const fieldId = "99,1";
    const field: MapFieldState = {
      spaceId: fieldId,
      tileInstanceId: "test-tile",
      slot: 0,
      location: "water_wheel", // pays 3 gold when visited
      difficulty: 1,
      blackCube: false,
      flagOwnerId: null,
      everFlagged: false,
      settlementResource: null
    };
    state.adventure!.fields[fieldId] = field;
    hero.spaceId = fieldId;
    state.activePlayerId = "p1";
    state.combat = {
      context: { kind: "neutral", heroId: hero.id, fieldId, difficulty: 1, hasAzure: false },
      outcome: { winnerPlayerId: "p1", defeatedPlayerId: "neutral", reason: "all-enemy-units-defeated" },
      units: {}
    } as unknown as CombatState;
    return { fieldId, heroId: hero.id };
  }

  /** Every reinforce-choice label currently waiting (prompt + reward queue). */
  function reinforceLabels(state: GameState): string[] {
    const labels: string[] = [];
    for (const step of state.adventure?.pendingVisit?.steps ?? []) {
      if (step.type === "CHOOSE_ONE") {
        labels.push(...step.options.map((option) => option.label));
      }
    }
    for (const reward of state.adventure?.rewardQueue ?? []) {
      if (reward.kind === "visit-steps") {
        for (const step of reward.steps) {
          if (step.type === "CHOOSE_ONE") {
            labels.push(...step.options.map((option) => option.label));
          }
        }
      }
    }
    return labels;
  }

  it("withholds the just-won field's reward, and allows nothing but Necromancy or Skip", () => {
    const state = startSandroGame();
    state.players.p1.hand = ["ability.necromancy"];
    state.players.p1.army = [{ id: "army_skel", unitDefId: "necropolis.skeletons", side: "few" }];
    state.players.p1.resources.gold = 0;
    const { fieldId } = stageNeutralWinOnGoldField(state);

    finalizeAdventureCombat(state);

    // The window is open and the 3-gold Water Wheel is NOT paid out yet.
    expect(state.adventure?.pendingNecromancy?.playerId).toBe("p1");
    expect(state.players.p1.resources.gold).toBe(0);
    expect(state.adventure?.fields[fieldId].blackCube).toBe(false);

    // The only legal moves are play-Necromancy or skip — no movement, no end turn.
    const legal = getLegalActions(state, "p1");
    expect(
      legal.some((l) => l.action.type === "PLAY_CARD" && l.action.cardId === "ability.necromancy")
    ).toBe(true);
    expect(legal.some((l) => l.action.type === "SKIP_NECROMANCY")).toBe(true);
    expect(legal.some((l) => l.action.type === "MOVE_HERO" || l.action.type === "END_TURN")).toBe(false);
  });

  it("skipping releases the withheld field reward and closes the window for good", () => {
    const state = startSandroGame();
    state.players.p1.hand = ["ability.necromancy"];
    state.players.p1.army = [{ id: "army_skel", unitDefId: "necropolis.skeletons", side: "few" }];
    state.players.p1.resources.gold = 0;
    const { fieldId } = stageNeutralWinOnGoldField(state);
    finalizeAdventureCombat(state);

    const next = apply(state, { type: "SKIP_NECROMANCY", playerId: "p1" });

    expect(next.players.p1.resources.gold).toBe(3); // Water Wheel paid out, but only now
    expect(next.adventure?.fields[fieldId].blackCube).toBe(true);
    expect(next.adventure?.pendingNecromancy ?? null).toBeNull();
    expect(next.players.p1.necromancyWindow).toBe(false);
    // Skipping never costs the card — it stays in hand for a later combat.
    expect(next.players.p1.hand).toContain("ability.necromancy");
    expect(next.players.p1.discard).not.toContain("ability.necromancy");
    // It never reopens on its own — Necromancy is no longer offered.
    expect(
      getLegalActions(next, "p1").some(
        (l) => l.action.type === "PLAY_CARD" && l.action.cardId === "ability.necromancy"
      )
    ).toBe(false);
  });

  it("prices the reinforce on the gold held BEFORE the field reward (no 'collect then reinforce')", () => {
    const state = startSandroGame();
    state.players.p1.hand = ["ability.necromancy"];
    // A Few Skeleton reinforces for 1 gold (half the 3-gold Pack). The player
    // holds 0; ONLY the withheld 3-gold Water Wheel would make it affordable —
    // and that reward must be out of reach while deciding.
    state.players.p1.army = [{ id: "army_skel", unitDefId: "necropolis.skeletons", side: "few" }];
    state.players.p1.resources.gold = 0;
    stageNeutralWinOnGoldField(state);
    finalizeAdventureCombat(state);

    const play = getLegalActions(state, "p1").find(
      (l) => l.action.type === "PLAY_CARD" && l.action.cardId === "ability.necromancy"
    );
    const afterPlay = apply(state, play!.action);

    // Options were built on 0 gold: the Skeleton reinforce is NOT offered. If the
    // field reward had landed first (the bug this rule prevents) it would be.
    expect(reinforceLabels(afterPlay).some((label) => /Skeletons/.test(label))).toBe(false);
    expect(afterPlay.players.p1.resources.gold).toBe(0);
  });

  it("after a paid reinforce, the field reward lands — and only then", () => {
    const state = startSandroGame();
    state.players.p1.hand = ["ability.necromancy"];
    state.players.p1.army = [{ id: "army_skel", unitDefId: "necropolis.skeletons", side: "few" }];
    state.players.p1.resources.gold = 2; // covers the 1-gold Skeleton reinforce
    stageNeutralWinOnGoldField(state);
    finalizeAdventureCombat(state);

    const play = getLegalActions(state, "p1").find(
      (l) => l.action.type === "PLAY_CARD" && l.action.cardId === "ability.necromancy"
    );
    let next = apply(state, play!.action);

    const reinforce = getLegalActions(next, "p1").find((l) => /Skeletons/.test(l.label));
    expect(reinforce, "the 1-gold Skeleton reinforce should be affordable on the 2 gold held").toBeTruthy();
    next = apply(next, reinforce!.action);

    // Paid 1 for the reinforce (2 -> 1), THEN the withheld Water Wheel added 3.
    expect(next.players.p1.resources.gold).toBe(4);
    expect(next.players.p1.army.find((u) => u.id === "army_skel")?.side).toBe("pack");
    expect(next.adventure?.pendingNecromancy ?? null).toBeNull();
  });

  it("resolves a free Skeleton reinforce first, yet still withholds the field reward behind the window", () => {
    const state = startSandroGame();
    state.players.p1.hand = ["ability.necromancy"];
    state.players.p1.army = [{ id: "army_skel", unitDefId: "necropolis.skeletons", side: "few" }];
    state.players.p1.resources.gold = 0;
    const { fieldId } = stageNeutralWinOnGoldField(state);
    // The last guard killed was a Skeleton — a Necropolis hero earns a free bronze
    // reinforce. It must resolve independently of the now-or-never Necromancy
    // window, and neither may let the field gold land early.
    state.combat!.skeletonGuardDefeated = true;

    finalizeAdventureCombat(state);
    pumpAdventureQueues(state);

    // The free Skeleton reinforce prompt is up and resolvable right now...
    expect(state.adventure?.pendingVisit).toBeTruthy();
    expect(getLegalActions(state, "p1").some((l) => /Skeleton/i.test(l.label))).toBe(true);
    // ...while the Necromancy window stays pending and the field reward withheld.
    expect(state.adventure?.pendingNecromancy?.playerId).toBe("p1");
    expect(state.players.p1.resources.gold).toBe(0);
    expect(state.adventure?.fields[fieldId].blackCube).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Legion artifact voucher × Necromancy reinforce — the full multiplayer flow
// through applyAction/getLegalActions ONLY (no internals), proving discounts do
// not stack: the Legion voucher and Necromancy's half are rival sources, each
// figured from the ORIGINAL printed price, and the cost path takes the cheaper.
// The voucher is banked by actually PLAYING the Legion piece and picking the
// unit, then spent by the real now-or-never Necromancy reinforce.
// ---------------------------------------------------------------------------
describe("Legion voucher × Necromancy reinforce (real end-to-end, non-stacking)", () => {
  function startSandroGame(): GameState {
    {
      const _g = createAdventureGameState({
      seed: "legion-necro",
      ruleset: "binh",
      difficulty: "normal",
      players: [
        { id: "p1", name: "Sandro", factionId: "necropolis", heroDefId: "sandro" },
        { id: "p2", name: "Catherine", factionId: "castle", heroDefId: "catherine" }
      ],
      rollFirstPlayer: false
    });
      for (const _pl of Object.values(_g.players)) { _pl.canMulligan = false; _pl.needsHandRefresh = false; }
      return _g;
    }
  }

  /** Stages a just-won neutral combat for p1 on an already-collected field (no
   *  payout), so the gold change isolates the Necromancy reinforce cost. */
  function stageNeutralWin(state: GameState): void {
    const hero = getMainHero(state, "p1")!;
    const fieldId = "99,1";
    state.adventure!.fields[fieldId] = {
      spaceId: fieldId,
      tileInstanceId: "test-tile",
      slot: 0,
      location: "water_wheel",
      difficulty: 1,
      blackCube: true,
      flagOwnerId: null,
      everFlagged: false,
      settlementResource: null
    } as MapFieldState;
    hero.spaceId = fieldId;
    state.activePlayerId = "p1";
    state.combat = {
      context: { kind: "neutral", heroId: hero.id, fieldId, difficulty: 1, hasAzure: false },
      outcome: { winnerPlayerId: "p1", defeatedPlayerId: "neutral", reason: "all-enemy-units-defeated" },
      units: {}
    } as unknown as CombatState;
  }

  /** Plays a Legion piece on the map and picks `unitName`'s reinforce in the prompt. */
  function bankLegionOnReinforceViaPlay(state: GameState, cardId: string, unitName: string): GameState {
    state.activePlayerId = "p1";
    let next = (state.players.p1.needsHandRefresh || state.players.p1.canMulligan)
      ? apply(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] })
      : state;
    next.players.p1.hand = [cardId];

    const play = getLegalActions(next, "p1").find(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === cardId && legal.action.optionIndex === 0
    );
    expect(play, `${cardId} discount side should be playable`).toBeTruthy();
    next = apply(next, play!.action);

    const pick = getLegalActions(next, "p1").find(
      (legal) =>
        legal.action.type === "RESOLVE_VISIT_STEP" && legal.label.startsWith("Reinforce") && legal.label.includes(unitName)
    );
    expect(pick, `the prompt should offer a reinforce of ${unitName} (no Citadel needed)`).toBeTruthy();
    return apply(next, pick!.action);
  }

  /** The Necromancy reinforce option label for `unitName` (or undefined). */
  function necromancyReinforceLabel(state: GameState, unitName: string): string | undefined {
    return getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "RESOLVE_VISIT_STEP" && legal.label.startsWith("Reinforce") && legal.label.includes(unitName)
    )?.label;
  }

  it("Necromancy's half wins on an expensive unit, figured from the ORIGINAL price (never stacked), and still spends the voucher", () => {
    // Vampires Pack = 12 gold. Necromancy half = 6. A Legs voucher (−4 → pay 8)
    // is the SMALLER discount, so Necromancy's 6 wins. The 6 must come off the
    // original 12 (NOT floor((12−4)/2) = 4, which would be illegal stacking).
    let state = startSandroGame();
    state.players.p1.army = [{ id: "army_vamp", unitDefId: "necropolis.vampires", side: "few" }];
    state.players.p1.resources.gold = 20;

    state = bankLegionOnReinforceViaPlay(state, "artifact.legs_of_legion", "Vampires");
    expect(state.players.p1.recruitDiscounts).toEqual([
      { cardId: "artifact.legs_of_legion", amount: 4, target: { kind: "reinforce", armyUnitId: "army_vamp" } }
    ]);

    // Hold Necromancy for the after-combat window, then stage + finalize the win.
    state.players.p1.hand = ["ability.necromancy"];
    stageNeutralWin(state);
    finalizeAdventureCombat(state);

    const playAction = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "PLAY_CARD" && legal.action.cardId === "ability.necromancy" && (legal.action.mode ?? "basic") === "basic"
    );
    expect(playAction, "Necromancy should be playable in the open window").toBeTruthy();
    state = apply(state, playAction!.action);

    // The Necromancy prompt prices the Vampires at the original half (6 gold).
    expect(necromancyReinforceLabel(state, "Vampires")).toContain("6 gold");

    const reinforce = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "RESOLVE_VISIT_STEP" && legal.label.includes("Vampires")
    );
    state = apply(state, reinforce!.action);

    // Paid 6 (original half), NOT 8 (Legion) and NOT 4 (stacked): 20 → 14.
    expect(state.players.p1.resources.gold).toBe(14);
    expect(state.players.p1.army.find((unit) => unit.id === "army_vamp")?.side).toBe("pack");
    // The voucher is single-use: spent on this unit even though Necromancy won.
    expect(state.players.p1.recruitDiscounts ?? []).toHaveLength(0);
  });

  it("the Legion voucher wins on a cheap unit (beats Necromancy's half) through the same real flow", () => {
    // Wraiths Pack = 6 gold. Necromancy half = 3. A Legs voucher (−4 → pay 2) is
    // the bigger discount, so the reinforce costs 2, not 3.
    let state = startSandroGame();
    state.players.p1.army = [{ id: "army_wraith", unitDefId: "necropolis.wraiths", side: "few" }];
    state.players.p1.resources.gold = 20;

    state = bankLegionOnReinforceViaPlay(state, "artifact.legs_of_legion", "Wraiths");
    state.players.p1.hand = ["ability.necromancy"];
    stageNeutralWin(state);
    finalizeAdventureCombat(state);

    const playAction = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "PLAY_CARD" && legal.action.cardId === "ability.necromancy" && (legal.action.mode ?? "basic") === "basic"
    );
    expect(playAction, "Necromancy should be playable in the open window").toBeTruthy();
    state = apply(state, playAction!.action);

    expect(necromancyReinforceLabel(state, "Wraiths")).toContain("2 gold");
    const reinforce = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "RESOLVE_VISIT_STEP" && legal.label.includes("Wraiths")
    );
    state = apply(state, reinforce!.action);

    // Paid 2 (6 − 4 Legion), beating Necromancy's 3: 20 → 18.
    expect(state.players.p1.resources.gold).toBe(18);
    expect(state.players.p1.recruitDiscounts ?? []).toHaveLength(0);
  });
});
