/**
 * Single-player smoothing #2: at NON-PvP combat start a computer attacker
 * draws ONE temporary Attack + ONE temporary Defense statistic card, both
 * Empowered (crown-free Expert) for that fight, and BOTH are removed from the
 * game at combat end — never kept. Every claim below fails if the wiring in
 * `combat-boost.ts` / `finalizeCombatStart` / `finalizeAdventureCombat` is
 * removed, and every scope limit has a CONTROL:
 * - human seats, multiplayer sessions and PvP/sandbox contexts get nothing;
 * - a guaranteed-win fight (already decided) injects nothing;
 * - a real pre-owned twin card and a pre-existing Empower mark both survive
 *   the cleanup (only the injected copy / temporary mark is stripped).
 */
import { describe, expect, it } from "vitest";
import {
  applyAction,
  createAdventureGameState,
  standardComputerController,
  type CombatState,
  type GameAction,
  type GameState,
} from "../index";
import { getMainHero } from "../adventure";
import { startNeutralEncounter } from "../adventure-reducer";
import { driveComputerPlayers } from "@/server/computer-runner";
import {
  COMPUTER_COMBAT_BOOST_CARDS,
  COMPUTER_PHANTOM_COMBAT_CARDS,
  applyComputerCombatBoost,
  applyComputerPhantomCards,
  combatQualifiesForComputerBoost,
  removeComputerCombatBoost,
  removeComputerPhantomCards,
} from "./combat-boost";
import { toPhantomCardId } from "../phantom-cards";

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(
    result.errors,
    result.errors.map((error) => error.message).join("; "),
  ).toHaveLength(0);
  return result.state;
}

type SetupOptions = {
  computer?: boolean;
  singlePlayer?: boolean;
  /** Consume the guaranteed-win slots so the fight is REAL (default true). */
  consumeGuaranteedWins?: boolean;
};

function setup(options: SetupOptions = {}): GameState {
  const state = createAdventureGameState({
    seed: "combat-boost-e2e",
    difficulty: "normal",
    rollFirstPlayer: false,
    ...(options.singlePlayer === false
      ? {}
      : { sessionMode: "single-player" as const }),
    ...(options.computer === false
      ? {}
      : { controllers: { p1: standardComputerController() } }),
  });
  if (options.consumeGuaranteedWins !== false) {
    state.computerGuaranteedWins = { p1: 2 };
  }
  const hero = getMainHero(state, "p1")!;
  hero.level = 1;
  // Determinism: Diplomacy would open a skip choice at an even fight, Tactics
  // a pre-round swap window — neither is what these tests pin.
  state.players.p1.hand = state.players.p1.hand.filter(
    (id) => id !== "ability.diplomacy" && id !== "ability.tactics",
  );
  return state;
}

function beginGuardFight(state: GameState, difficulty = 1): GameState {
  const hero = getMainHero(state, "p1")!;
  state.adventure!.fields["guard-field"] = {
    spaceId: "guard-field",
    tileInstanceId: "t",
    slot: 0,
    location: "treasure_symbol",
    difficulty,
    blackCube: false,
    flagOwnerId: null,
    everFlagged: false,
    settlementResource: null,
  };
  hero.spaceId = "guard-field";
  startNeutralEncounter(state, hero, state.adventure!.fields["guard-field"]);
  return state;
}

function deployAndReveal(state: GameState): GameState {
  expect(state.phase).toBe("combat-setup");
  const armyUnit = state.players.p1.army[0];
  state = applyOk(state, {
    type: "PLACE_COMBAT_UNIT",
    playerId: "p1",
    armyUnitId: armyUnit.id,
    position: 13,
  });
  return applyOk(state, { type: "FINISH_COMBAT_PLACEMENT", playerId: "p1" });
}

function countIn(pile: readonly string[], cardId: string): number {
  return pile.filter((id) => id === cardId).length;
}

function totalCopies(state: GameState, cardId: string): number {
  const player = state.players.p1;
  return (
    countIn(player.hand, cardId) +
    countIn(player.discard, cardId) +
    countIn(player.deck, cardId) +
    countIn(player.removed, cardId)
  );
}

describe("computer combat boost (temp Empowered Attack/Defense cards)", () => {
  it("injects both cards, Empowered, at real NON-PvP combat start", () => {
    let state = setup();
    const before = Object.fromEntries(
      COMPUTER_COMBAT_BOOST_CARDS.map((id) => [id, totalCopies(setup(), id)]),
    );
    state = beginGuardFight(state);
    state = deployAndReveal(state);

    expect(state.combat?.outcome).toBeNull(); // a REAL fight, not a free win
    expect(state.combat?.computerBoost).toMatchObject({ playerId: "p1" });
    const baseBefore = {
      "stat.attack": totalCopies(setup(), "stat.attack"),
      "stat.defense": totalCopies(setup(), "stat.defense"),
    };
    for (const cardId of COMPUTER_COMBAT_BOOST_CARDS) {
      expect(countIn(state.players.p1.hand, cardId)).toBeGreaterThanOrEqual(1);
      expect(totalCopies(state, cardId)).toBe(before[cardId] + 1);
      // The boost hands the game's OWN distinct Empowered cards, so no
      // by-card-id Empower mark is added (it would wrongly empower the seat's
      // real Attack/Defense copies too).
      expect(state.players.p1.empoweredAbilities ?? []).not.toContain(cardId);
    }
    expect(state.players.p1.empoweredAbilities ?? []).toEqual([]);
    // CONTROL: the seat's REAL plain statistics are untouched by the boost.
    expect(totalCopies(state, "stat.attack")).toBe(baseBefore["stat.attack"]);
    expect(totalCopies(state, "stat.defense")).toBe(baseBefore["stat.defense"]);
  });

  it("the AI ABUSES them: plays an injected card at crown-free Expert, and the cleanup removes both from the game", () => {
    let state = setup();
    const baseline = Object.fromEntries(
      COMPUTER_COMBAT_BOOST_CARDS.map((id) => [id, totalCopies(setup(), id)]),
    );
    // Zero crowns: an Expert reaction can ONLY come from the Empower mark.
    state.players.p1.limits.expertUses = 0;
    state = beginGuardFight(state);
    state = deployAndReveal(state);

    const run = driveComputerPlayers(state);
    expect(run.stalled).toBe(false);
    state = run.state;

    // The fight resolved and the AI played at least one injected statistic
    // card as an EXPERT reaction despite holding zero crowns.
    const boostPlays = run.decisions.filter(
      (decision) =>
        decision.action.type === "PLAY_REACTION" &&
        COMPUTER_COMBAT_BOOST_CARDS.includes(
          (decision.action as { cardId: string }).cardId,
        ),
    );
    expect(boostPlays.length).toBeGreaterThan(0);
    // The Empowered statistics have a SINGLE printed side already worth the
    // plain card's EXPERT value (+2), so they are played with no "expert"
    // mode and no crown — that is exactly the crown-free expert-grade abuse.
    expect(
      boostPlays.every(
        (decision) => (decision.action as { mode?: string }).mode !== "expert",
      ),
    ).toBe(true);
    // CONTROL: with zero crowns the seat could not play ANY expert reaction,
    // so the value really came from the Empowered cards.
    expect(
      run.decisions.filter(
        (decision) =>
          decision.action.type === "PLAY_REACTION" &&
          (decision.action as { mode?: string }).mode === "expert",
      ),
    ).toEqual([]);

    // Never kept: after the fight both injected copies are gone from EVERY
    // pile (hand, discard, deck, removed) and the temp Empower marks with them.
    expect(state.combat).toBeNull();
    for (const cardId of COMPUTER_COMBAT_BOOST_CARDS) {
      expect(totalCopies(state, cardId)).toBe(baseline[cardId]);
      expect(state.players.p1.empoweredAbilities ?? []).not.toContain(cardId);
    }
  });

  it("cleanup spares a real twin card and a pre-existing Empower mark", () => {
    // (The finalize wiring itself is mutation-checked by the fought-out test
    // above — here the module-level cleanup semantics are pinned.)
    let state = setup();
    // A genuinely owned EMPOWERED twin in the discard (same id the boost
    // injects), a plain statistic, and a legitimate Empower mark (e.g. a
    // Creature-Bank reward) must ALL survive the cleanup.
    state.players.p1.discard.push("stat.attack.empowered");
    state.players.p1.discard.push("stat.attack");
    state.players.p1.empoweredAbilities = ["stat.defense"];
    const ownedAttack = totalCopies(state, "stat.attack.empowered");
    const ownedDefense = totalCopies(state, "stat.defense.empowered");
    const ownedPlainAttack = totalCopies(state, "stat.attack");
    state = beginGuardFight(state);
    state = deployAndReveal(state);
    expect(state.combat?.computerBoost).toBeTruthy();
    // Both injected copies present on top of the owned ones.
    expect(totalCopies(state, "stat.attack.empowered")).toBe(ownedAttack + 1);
    expect(totalCopies(state, "stat.defense.empowered")).toBe(ownedDefense + 1);
    // The plain statistic is never touched by the boost.
    expect(totalCopies(state, "stat.attack")).toBe(ownedPlainAttack);

    removeComputerCombatBoost(state);
    expect(state.combat?.computerBoost).toBeNull();
    expect(totalCopies(state, "stat.attack.empowered")).toBe(ownedAttack);
    expect(totalCopies(state, "stat.defense.empowered")).toBe(ownedDefense);
    expect(totalCopies(state, "stat.attack")).toBe(ownedPlainAttack);
    expect(state.players.p1.empoweredAbilities).toEqual(["stat.defense"]);
  });

  it("CONTROL: a guaranteed-win fight injects nothing (already decided)", () => {
    let state = setup({ consumeGuaranteedWins: false });
    const before = totalCopies(state, "stat.attack");
    state = beginGuardFight(state);
    state = deployAndReveal(state);
    expect(state.combat?.outcome?.winnerPlayerId).toBe("p1");
    expect(state.combat?.computerBoost).toBeUndefined();
    expect(totalCopies(state, "stat.attack")).toBe(before);
  });

  it("CONTROL: a HUMAN seat and a MULTIPLAYER session get no cards", () => {
    for (const options of [
      { computer: false as const },
      { singlePlayer: false as const },
    ]) {
      let state = setup(options);
      const before = totalCopies(state, "stat.attack");
      state = beginGuardFight(state);
      state = deployAndReveal(state);
      expect(state.combat?.computerBoost).toBeUndefined();
      expect(totalCopies(state, "stat.attack")).toBe(before);
    }
  });

  it("CONTROL: a PvP / sandbox context never qualifies (the user rule: never in PvP)", () => {
    const state = setup();
    state.computerGuaranteedWins = { p1: 2 };
    const neutral = {
      context: { kind: "neutral" },
      outcome: null,
      attackerPlayerId: "p1",
    } as unknown as CombatState;
    expect(combatQualifiesForComputerBoost(state, neutral)).toBe(true);
    const pvp = {
      context: { kind: "player" },
      outcome: null,
      attackerPlayerId: "p1",
    } as unknown as CombatState;
    expect(combatQualifiesForComputerBoost(state, pvp)).toBe(false);
    const sandbox = {
      context: { kind: "sandbox" },
      outcome: null,
      attackerPlayerId: "p1",
    } as unknown as CombatState;
    expect(combatQualifiesForComputerBoost(state, sandbox)).toBe(false);
  });
});

describe("computer phantom combat cards (always-on Power + Magic Arrow)", () => {
  it("injects DISTINCT phantom Power + Magic Arrow (real cards untouched) and removes every copy after", () => {
    let state = setup();
    const before = Object.fromEntries(
      COMPUTER_PHANTOM_COMBAT_CARDS.map((id) => [id, totalCopies(setup(), id)]),
    );
    state = beginGuardFight(state);
    state = deployAndReveal(state);
    expect(state.combat?.computerPhantomCards).toBeTruthy();
    for (const baseId of COMPUTER_PHANTOM_COMBAT_CARDS) {
      const phantomId = toPhantomCardId(baseId);
      // The DISTINCT phantom copy is in hand; the REAL base card count is
      // UNTOUCHED (the phantom no longer shares the real id).
      expect(countIn(state.players.p1.hand, phantomId)).toBeGreaterThanOrEqual(1);
      expect(totalCopies(state, baseId)).toBe(before[baseId]);
      // Phantom cards are NEVER Empowered (Power stat + a plain spell).
      expect(state.players.p1.empoweredAbilities ?? []).not.toContain(phantomId);
    }
    // Fought out — every phantom copy is gone from the game, real cards remain.
    state = driveComputerPlayers(state).state;
    expect(state.combat).toBeNull();
    for (const baseId of COMPUTER_PHANTOM_COMBAT_CARDS) {
      expect(totalCopies(state, baseId)).toBe(before[baseId]);
      expect(totalCopies(state, toPhantomCardId(baseId))).toBe(0);
    }
  });

  it("grants phantom cards even in PvP — where the Attack/Defense boost is withheld", () => {
    const state = setup();
    state.combat = {
      context: { kind: "player" },
      outcome: null,
      attackerPlayerId: "p1",
      defenderPlayerId: "p2",
    } as unknown as CombatState;
    // CONTROL: the Attack/Defense smoothing boost never enters a PvP fight.
    expect(combatQualifiesForComputerBoost(state, state.combat!)).toBe(false);
    applyComputerCombatBoost(state);
    expect(state.combat!.computerBoost ?? null).toBeNull();

    // The phantom Power + Magic Arrow ARE granted to the computer seat in PvP.
    const before = Object.fromEntries(
      COMPUTER_PHANTOM_COMBAT_CARDS.map((id) => [id, countIn(state.players.p1.hand, id)]),
    );
    applyComputerPhantomCards(state);
    for (const baseId of COMPUTER_PHANTOM_COMBAT_CARDS) {
      const phantomId = toPhantomCardId(baseId);
      expect(countIn(state.players.p1.hand, phantomId)).toBe(1);
      // Real base card count untouched by the phantom grant.
      expect(countIn(state.players.p1.hand, baseId)).toBe(before[baseId]);
      expect(state.players.p1.empoweredAbilities ?? []).not.toContain(phantomId);
    }
    removeComputerPhantomCards(state);
    for (const baseId of COMPUTER_PHANTOM_COMBAT_CARDS) {
      expect(countIn(state.players.p1.hand, toPhantomCardId(baseId))).toBe(0);
      expect(countIn(state.players.p1.hand, baseId)).toBe(before[baseId]);
    }
  });
});
