import { describe, expect, it } from "vitest";
import { applyAction, createAdventureGameState, getLegalActions } from "./index";
import { getMainHero, placeCreatureBank } from "./adventure";
import {
  bankAutoCombatSafeUnit,
  maybeOpenMidFightBankAutoCombatChoice,
  startNeutralEncounter
} from "./adventure-reducer";
import { getOrthogonalNeighbors } from "./battlefield";
import { scoreChoiceAction } from "./computer/choice-policy";
import type { GameAction, GameState } from "./state";

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function startImpCache(seed: string, enabled = true): GameState {
  let state = createAdventureGameState({
    seed,
    difficulty: "easy",
    rollFirstPlayer: false,
    houseRules: { "polish-bank-auto-combat": enabled }
  });
  if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
    state = applyOk(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
  }
  state.players.p1.army = [
    { id: "gorgons", unitDefId: "fortress.gorgons", side: "few" }
  ];
  const hero = getMainHero(state, "p1")!;
  hero.spaceId = "bank-field";
  state.adventure!.fields["bank-field"] = {
    spaceId: "bank-field",
    tileInstanceId: "test-tile",
    slot: 0,
    location: "blocked_field",
    blackCube: false,
    flagOwnerId: null,
    everFlagged: false,
    settlementResource: null
  };
  placeCreatureBank(state, "bank-field", "imp_cache");
  startNeutralEncounter(state, hero, state.adventure!.fields["bank-field"]);
  const placement = getLegalActions(state, "p1").find(
    (legal) => legal.action.type === "PLACE_COMBAT_UNIT"
  );
  state = applyOk(state, placement!.action);
  return applyOk(state, { type: "FINISH_COMBAT_PLACEMENT", playerId: "p1" });
}

function findOpening(predicate: (state: GameState) => boolean, enabled = true): GameState {
  for (let index = 0; index < 32; index += 1) {
    const state = startImpCache(`bank-auto-${enabled}-${index}`, enabled);
    if (predicate(state)) return state;
  }
  throw new Error("Expected a deterministic Imp Cache opening in the sampled seeds.");
}

describe("Polish Banks auto combat", () => {
  it("offers only after Stack rolls when a deployed unit is mathematically immune", () => {
    const state = findOpening(
      (candidate) =>
        candidate.pendingChoice?.type === "OPTION_CHOICE" &&
        candidate.pendingChoice.context === "polish-bank-auto-combat"
    );
    const safe = bankAutoCombatSafeUnit(state);
    expect(safe?.unitDefId).toBe("fortress.gorgons");
    expect(safe?.defense).toBe(2);
    const guards = Object.values(state.combat!.units).filter((unit) => unit.controllerId === "neutrals");
    expect(guards).toHaveLength(4);
    expect(guards.some((guard) => guard.stackToken)).toBe(true);
    expect(Math.max(...guards.map((guard) => guard.attack + 1))).toBeLessThanOrEqual(2);
    expect(state.pendingChoice?.type === "OPTION_CHOICE" ? state.pendingChoice.options.map((o) => o.label) : [])
      .toEqual(["Use Auto Combat: win the bank", "Fight the bank normally"]);
  });

  it("withholds the proposal when a rolled +1 Attack Stack can hurt that unit", () => {
    const state = findOpening((candidate) => {
      const guards = Object.values(candidate.combat!.units).filter((unit) => unit.controllerId === "neutrals");
      return guards.some((guard) => guard.stackToken === "attack");
    });
    expect(bankAutoCombatSafeUnit(state)).toBeNull();
    expect(
      state.pendingChoice?.type === "OPTION_CHOICE" &&
      state.pendingChoice.context === "polish-bank-auto-combat"
    ).toBe(false);
  });

  it("accepting records a normal bank victory; declining starts the fight", () => {
    const offered = findOpening(
      (candidate) =>
        candidate.pendingChoice?.type === "OPTION_CHOICE" &&
        candidate.pendingChoice.context === "polish-bank-auto-combat"
    );
    const choice = offered.pendingChoice!;
    const won = applyOk(offered, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: choice.id,
      optionIndex: 0
    });
    expect(won.combat?.outcome).toMatchObject({
      winnerPlayerId: "p1",
      defeatedPlayerId: "neutrals",
      reason: "all-enemy-units-defeated"
    });
    expect(won.eventLog.some((event) => event.type === "COMBAT_ENDED")).toBe(true);

    const declinedOpening = findOpening(
      (candidate) =>
        candidate.pendingChoice?.type === "OPTION_CHOICE" &&
        candidate.pendingChoice.context === "polish-bank-auto-combat"
    );
    const declined = applyOk(declinedOpening, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: declinedOpening.pendingChoice!.id,
      optionIndex: 1
    });
    expect(declined.combat?.outcome ?? null).toBeNull();
    expect(declined.pendingChoice?.type === "OPTION_CHOICE" && declined.pendingChoice.context === "polish-bank-auto-combat")
      .toBe(false);
    expect(declined.phase).toBe("combat");
  });

  it("is completely inert when the house rule is off", () => {
    const state = findOpening(() => true, false);
    expect(bankAutoCombatSafeUnit(state)).toBeNull();
    expect(
      state.pendingChoice?.type === "OPTION_CHOICE" &&
      state.pendingChoice.context === "polish-bank-auto-combat"
    ).toBe(false);
  });
});

/**
 * USER RULE 2026-09-03 ("about AUTOCOMBAT: better solution will be to 'end the
 * combat' where there is no possible damage done by one side — so not only at
 * the beginning of the fight … e.g. 6 zombies, and only one was +1 attack. When
 * this zombie is killed the rest is just clicking").
 *
 * The Imp Cache seeds below reproduce the report exactly: four Familiars of
 * which ONE rolled the +1 Attack Stack Token (Attack 2 → ceiling 3, over the
 * Gorgons' 2 Defense) while the other three are Attack 1 (ceiling 2, harmless).
 * The post-Stack-roll proposal is therefore correctly WITHHELD and the fight
 * starts; the tokened Familiar's death is what makes the rest just clicking.
 */
describe("Polish Banks auto combat — mid-fight (USER RULE 2026-09-03)", () => {
  const GORGON = "unit_p1_gorgons";

  /**
   * A real Imp Cache fight, already in progress (no start-of-combat proposal),
   * whose ONLY dangerous guard is the one carrying the +1 Attack Stack Token —
   * and which stands on a corner the Gorgons can step next to this activation.
   */
  function startReportedFight(enabled = true): { state: GameState; dangerousId: string } {
    for (let index = 0; index < 64; index += 1) {
      const state = startImpCache(`bank-auto-mid-${index}`, enabled);
      if (state.phase !== "combat" || !state.combat) continue;
      const own = state.combat.units[GORGON];
      const guards = Object.values(state.combat.units).filter(
        (unit) => unit.controllerId === "neutrals"
      );
      const dangerous = guards.filter((guard) => guard.attack + 1 > (own?.defense ?? 0));
      if (!own || dangerous.length !== 1) continue;
      const target = dangerous[0]!;
      const reachable = getLegalActions(state, "p1").some(
        (legal) =>
          legal.action.type === "MOVE_UNIT" &&
          getOrthogonalNeighbors(target.position).includes(
            (legal.action as { destination: number }).destination
          )
      );
      if (!reachable) continue;
      return { state, dangerousId: target.id };
    }
    throw new Error("Expected an Imp Cache fight whose only threat is the Attack-token guard.");
  }

  /** Step the fight forward with p1's own offers until the proposal opens. */
  function drainUntilProposal(start: GameState, steps = 30): GameState {
    let state = start;
    for (let index = 0; index < steps; index += 1) {
      if (
        state.pendingChoice?.type === "OPTION_CHOICE" &&
        state.pendingChoice.context === "polish-bank-auto-combat"
      ) {
        return state;
      }
      if (!state.combat || state.combat.outcome) return state;
      const legal = getLegalActions(state, "p1");
      const pick = (type: string) => legal.find((entry) => entry.action.type === type);
      // Answer whatever the open fight asks of p1 — a parked attack window, the
      // pre-activation pause, the attacker's pick of a neutral's destination —
      // without ever choosing to attack again, so the ONLY thing that can end
      // this loop early is the auto-combat proposal itself.
      const next =
        pick("PASS_REACTION") ??
        pick("CONTINUE_NEUTRAL_STEP") ??
        pick("CHOOSE_OPTION") ??
        pick("CONTINUE_COMBAT") ??
        pick("END_ACTIVATION") ??
        pick("DEFEND_UNIT");
      if (!next) return state;
      state = applyOk(state, next.action);
    }
    return state;
  }

  /** Move next to `targetId` and kill it with one Gorgons attack. */
  function killGuard(start: GameState, targetId: string): GameState {
    const target = start.combat!.units[targetId]!;
    const neighbours = getOrthogonalNeighbors(target.position);
    const step = getLegalActions(start, "p1").find(
      (legal) =>
        legal.action.type === "MOVE_UNIT" &&
        neighbours.includes((legal.action as { destination: number }).destination)
    );
    let state = applyOk(start, step!.action);
    const attack = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "ATTACK_UNIT" &&
        (legal.action as { defenderId?: string }).defenderId === targetId
    );
    expect(attack, "the Gorgons should be able to attack the Attack-token guard").toBeDefined();
    state = applyOk(state, attack!.action);
    // The blow parks in an ATTACK window (instants may answer it); pass it out.
    for (let index = 0; index < 8 && (state.reactionWindow || state.stack.length > 0); index += 1) {
      const pass = getLegalActions(state, "p1").find(
        (legal) => legal.action.type === "PASS_REACTION"
      );
      if (!pass) break;
      state = applyOk(state, pass.action);
    }
    const after = state.combat!.units[targetId]!;
    expect(after.damage).toBeGreaterThanOrEqual(after.maxHealth);
    return state;
  }

  it("withholds the proposal while the +1 Attack guard lives, and offers it once that guard dies", () => {
    const { state: opening, dangerousId } = startReportedFight();
    // CONTROL — the tokened guard is alive, so a guard CAN still damage the
    // protected unit and the fight is a real fight.
    expect(bankAutoCombatSafeUnit(opening)).toBeNull();
    expect(opening.pendingChoice).toBeNull();

    const killed = killGuard(opening, dangerousId);
    const offered = drainUntilProposal(killed);
    expect(
      offered.pendingChoice?.type === "OPTION_CHOICE" &&
        offered.pendingChoice.context === "polish-bank-auto-combat"
    ).toBe(true);
    expect(offered.pendingChoice?.type === "OPTION_CHOICE" ? offered.pendingChoice.returnPhase : null)
      .toBe("combat");
    const safe = bankAutoCombatSafeUnit(offered);
    expect(safe?.id).toBe(GORGON);
    // Every surviving guard is now mathematically harmless.
    for (const guard of Object.values(offered.combat!.units)) {
      if (guard.controllerId !== "neutrals" || guard.damage >= guard.maxHealth) continue;
      expect(guard.attack + 1).toBeLessThanOrEqual(safe!.defense);
    }
  });

  it("is inert mid-fight when the house rule is off (CONTROL on the same board)", () => {
    const { state: opening, dangerousId } = startReportedFight(false);
    const killed = killGuard(opening, dangerousId);
    const drained = drainUntilProposal(killed);
    expect(bankAutoCombatSafeUnit(drained)).toBeNull();
    expect(
      drained.pendingChoice?.type === "OPTION_CHOICE" &&
        drained.pendingChoice.context === "polish-bank-auto-combat"
    ).toBe(false);
  });

  it("accepting mid-fight resolves as a normal Bank win and pays the normal reward", () => {
    const { state: opening, dangerousId } = startReportedFight();
    const offered = drainUntilProposal(killGuard(opening, dangerousId));
    const choice = offered.pendingChoice!;
    const goldBefore = offered.players.p1.resources.gold;

    const won = applyOk(offered, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: choice.id,
      optionIndex: 0
    });
    expect(won.combat?.outcome).toMatchObject({
      winnerPlayerId: "p1",
      defeatedPlayerId: "neutrals",
      reason: "all-enemy-units-defeated"
    });
    for (const guard of Object.values(won.combat!.units)) {
      if (guard.controllerId !== "neutrals") continue;
      expect(guard.damage).toBeGreaterThanOrEqual(guard.maxHealth);
    }

    let settled = applyOk(won, { type: "ACKNOWLEDGE_COMBAT_END", playerId: "p1" });
    for (let index = 0; index < 8 && settled.combat; index += 1) {
      const exit = getLegalActions(settled, "p1").find(
        (legal) => legal.action.type === "ACKNOWLEDGE_COMBAT_END"
      );
      if (!exit) break;
      settled = applyOk(settled, exit.action);
    }
    // Imp Cache pays "3 gold. Extra: +X gold" — the normal reward path really ran.
    expect(settled.combat).toBeNull();
    expect(settled.players.p1.resources.gold).toBeGreaterThanOrEqual(goldBefore + 3);
  });

  it("asks at most once per combat, so a decline is respected", () => {
    const { state: opening, dangerousId } = startReportedFight();
    const offered = drainUntilProposal(killGuard(opening, dangerousId));
    const declined = applyOk(offered, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: offered.pendingChoice!.id,
      optionIndex: 1
    });
    expect(declined.combat?.outcome ?? null).toBeNull();
    expect(declined.combat).not.toBeNull();
    expect(declined.combat?.bankAutoCombatAsked).toBe(true);
    // The board is unchanged and still "safe", but the proposal never re-opens.
    expect(bankAutoCombatSafeUnit(declined)).not.toBeNull();
    const later = drainUntilProposal(declined, 6);
    expect(
      later.pendingChoice?.type === "OPTION_CHOICE" &&
        later.pendingChoice.context === "polish-bank-auto-combat"
    ).toBe(false);
  });

  it("a STALEMATE is not a win: no offer when the attacker cannot damage a guard either", () => {
    const { state: opening, dangerousId } = startReportedFight();
    const offered = drainUntilProposal(killGuard(opening, dangerousId));
    const board = structuredClone(offered);
    board.pendingChoice = null;
    board.phase = "combat";
    board.combat!.bankAutoCombatAsked = false;

    // Guard Defense 1 vs an Attack-0 Gorgons: ceiling 1 is not > 1 — nobody can
    // ever hurt anybody, so the rule must NOT hand out a win.
    board.combat!.units[GORGON]!.attack = 0;
    for (const guard of Object.values(board.combat!.units)) {
      if (guard.controllerId === "neutrals" && guard.damage < guard.maxHealth) guard.defense = 1;
    }
    expect(bankAutoCombatSafeUnit(board)).toBeNull();
    maybeOpenMidFightBankAutoCombatChoice(board);
    expect(board.pendingChoice).toBeNull();

    // CONTROL — drop one guard's Defense to 0 and the Gorgons can kill it, so
    // the same board becomes a certain win and IS offered.
    const winnable = structuredClone(board);
    const living = Object.values(winnable.combat!.units).find(
      (unit) => unit.controllerId === "neutrals" && unit.damage < unit.maxHealth
    )!;
    living.defense = 0;
    expect(bankAutoCombatSafeUnit(winnable)).not.toBeNull();
    maybeOpenMidFightBankAutoCombatChoice(winnable);
    expect(
      winnable.pendingChoice?.type === "OPTION_CHOICE" &&
        winnable.pendingChoice.context === "polish-bank-auto-combat"
    ).toBe(true);
  });

  it("a guard whose damage bypasses Defense (Fire Shield) blocks the offer", () => {
    const { state: opening, dangerousId } = startReportedFight();
    const offered = drainUntilProposal(killGuard(opening, dangerousId));
    const board = structuredClone(offered);
    board.pendingChoice = null;
    board.phase = "combat";
    board.combat!.bankAutoCombatAsked = false;
    expect(bankAutoCombatSafeUnit(board)).not.toBeNull();

    const living = Object.values(board.combat!.units).find(
      (unit) => unit.controllerId === "neutrals" && unit.damage < unit.maxHealth
    )!;
    living.abilities = [...(living.abilities ?? []), "wog-fire-shield-1"];
    expect(bankAutoCombatSafeUnit(board)).toBeNull();
    maybeOpenMidFightBankAutoCombatChoice(board);
    expect(board.pendingChoice).toBeNull();
  });

  it("a computer seat takes the certain win rather than sitting on the proposal", () => {
    const { state: opening, dangerousId } = startReportedFight();
    const offered = drainUntilProposal(killGuard(opening, dangerousId));
    const observation = {
      state: offered as never,
      playerId: "p1" as const,
      legalActions: getLegalActions(offered, "p1")
    } as never;
    const accept = scoreChoiceAction(observation, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: offered.pendingChoice!.id,
      optionIndex: 0
    });
    const fight = scoreChoiceAction(observation, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: offered.pendingChoice!.id,
      optionIndex: 1
    });
    expect(accept?.policy).toBe("choice.polish-bank-auto-combat");
    // The dedicated branch scores the certain win 40 over the fight-on 10. The
    // generic OPTION_CHOICE fallback would leave them one point apart, which a
    // label heuristic could flip, so the MARGIN is what is pinned here.
    expect(accept!.score).toBeGreaterThanOrEqual(fight!.score + 20);
  });
});
