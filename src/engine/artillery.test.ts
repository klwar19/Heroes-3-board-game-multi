import { describe, expect, it } from "vitest";
import { applyAction, createInitialGameState, getLegalActions } from "./index";
import { abilityDeckBinh, abilityDeckLegacy } from "@/data/cards/abilities-extra";
import { cardLibrary } from "@/data/cards/library";
import { cardShotFxPlans } from "@/data/fx";
import { polishBalanceCard } from "./polish-balance-spells";
import type { GameAction, GameEvent, GameState, PlayerId } from "./state";

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

/** END_COMBAT_ROUND with the active unit cleared, so the round may end here. */
function endRound(state: GameState, playerId: PlayerId): GameState {
  state.combat!.activeUnitId = null;
  state.activePlayerId = playerId;
  return applyOk(state, { type: "END_COMBAT_ROUND", playerId });
}

/** All current PLAY_CARD legal actions for the Artillery card (optionally one option). */
function artilleryPlays(state: GameState, optionIndex?: number) {
  return getLegalActions(state, "p1").filter(
    (legal) =>
      legal.action.type === "PLAY_CARD" &&
      legal.action.cardId === "ability.artillery" &&
      (optionIndex === undefined || legal.action.optionIndex === optionIndex)
  );
}

function warMachineHits(state: GameState): Extract<GameEvent, { type: "WAR_MACHINE_TRIGGERED" }>[] {
  return state.eventLog.filter(
    (event): event is Extract<GameEvent, { type: "WAR_MACHINE_TRIGGERED" }> => event.type === "WAR_MACHINE_TRIGGERED"
  );
}

// ===========================================================================
// Card definition — the truth about what runs (CLAUDE.md rule #2)
// ===========================================================================

describe("Artillery card definition", () => {
  it("is an implemented CHOOSE_ONE: basic lowest-initiative shot + expert Ballista volley", () => {
    const card = cardLibrary["ability.artillery"];
    expect(card.implementationStatus).toBe("implemented");
    expect(card.tags).not.toContain("needs-implementation");
    expect(card.effect.type).toBe("CHOOSE_ONE");
    if (card.effect.type !== "CHOOSE_ONE") {
      return;
    }
    expect(card.effect.options).toHaveLength(2);

    const basic = card.effect.options[0];
    expect(basic.effect.type).toBe("DAMAGE_LOWEST_INITIATIVE_ENEMY");
    if (basic.effect.type === "DAMAGE_LOWEST_INITIATIVE_ENEMY") {
      expect(basic.effect.amount).toBe(1);
    }

    const expert = card.effect.options[1];
    expect(expert.expertOnly).toBe(true);
    expect(expert.effect.type).toBe("ARTILLERY_BALLISTA_VOLLEY");
    if (expert.effect.type === "ARTILLERY_BALLISTA_VOLLEY") {
      expect(expert.effect.shots).toBe(3);
    }
  });

  it("is reachable in real games — included in the ability decks", () => {
    expect(abilityDeckLegacy).toContain("ability.artillery");
    expect(abilityDeckBinh).toContain("ability.artillery");
  });
});

// ===========================================================================
// Basic side — instant: "Deal 1 damage to an enemy unit with the lowest
// initiative." Works with no Ballista in play.
// ===========================================================================

describe("Artillery (basic)", () => {
  function basicSetup(): GameState {
    const state = createInitialGameState("artillery-basic");
    state.players.p1.hand = ["ability.artillery"];
    state.players.p2.hand = [];
    // No Ballista — the basic side functions on its own.
    state.players.p1.permanents = [];
    return state;
  }

  it("only offers the slowest enemy as a target, and deals it 1 effect damage", () => {
    const state = basicSetup();
    const enemies = state.combat!.units;
    enemies.unit_p2_skeletons.initiative = 9;
    enemies.unit_p2_vampires.initiative = 4; // uniquely slowest
    enemies.unit_p2_dread_knights.initiative = 7;

    const plays = artilleryPlays(state);
    expect(plays).toHaveLength(1);
    const target = plays[0].action.type === "PLAY_CARD" ? plays[0].action.target : null;
    expect(target).toEqual({ type: "unit", unitId: "unit_p2_vampires" });

    const after = applyOk(state, plays[0].action);
    expect(after.combat!.units.unit_p2_vampires.damage).toBe(1);
    // A non-slowest enemy is untouched.
    expect(after.combat!.units.unit_p2_dread_knights.damage).toBe(0);
    // The card is spent (played to discard); no crown on the basic side.
    expect(after.players.p1.hand).not.toContain("ability.artillery");
    expect(after.players.p1.discard).toContain("ability.artillery");
    expect(after.players.p1.combatStats.expertUsesSpentThisRound).toBe(0);
  });

  it("fires its damage from the card, so the FX layer can play the Ballista shot", () => {
    // The table plays the Artillery shot off cardShotFxPlans[source.cardId] on
    // the DAMAGE_ASSIGNED it logs. So the shot is only HEARD when (a) the damage
    // names the card as its source, and (b) a shot plan is keyed there. Assert
    // both — the link the user's "play proper sound" needs.
    const state = basicSetup();
    const enemies = state.combat!.units;
    enemies.unit_p2_skeletons.initiative = 9;
    enemies.unit_p2_vampires.initiative = 4; // uniquely slowest
    enemies.unit_p2_dread_knights.initiative = 7;

    const after = applyOk(state, artilleryPlays(state)[0].action);
    const hit = after.eventLog.find(
      (event): event is Extract<GameEvent, { type: "DAMAGE_ASSIGNED" }> =>
        event.type === "DAMAGE_ASSIGNED" &&
        event.source.type === "card" &&
        event.source.cardId === "ability.artillery"
    );
    expect(hit, "Artillery damage must name the card as its source").toBeTruthy();
    const plan = hit!.source.type === "card" ? cardShotFxPlans[hit!.source.cardId] : undefined;
    expect(plan, "cardShotFxPlans must answer the Artillery damage").toBeTruthy();
    expect(plan!.sound).toBe("units/ballista-shoot");
  });

  it("offers every tied-slowest enemy so the controller picks which is hit", () => {
    const state = basicSetup();
    const enemies = state.combat!.units;
    enemies.unit_p2_vampires.initiative = 3;
    enemies.unit_p2_skeletons.initiative = 3; // tied for slowest with vampires
    enemies.unit_p2_dread_knights.initiative = 8;

    const targetIds = artilleryPlays(state)
      .map((legal) => (legal.action.type === "PLAY_CARD" && legal.action.target?.type === "unit" ? legal.action.target.unitId : ""))
      .sort();
    expect(targetIds).toEqual(["unit_p2_skeletons", "unit_p2_vampires"]);

    const pickVampires = artilleryPlays(state).find(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.target?.type === "unit" && legal.action.target.unitId === "unit_p2_vampires"
    );
    const after = applyOk(state, pickVampires!.action);
    expect(after.combat!.units.unit_p2_vampires.damage).toBe(1);
    expect(after.combat!.units.unit_p2_skeletons.damage).toBe(0);
  });

  it("rejects aiming at a faster enemy than the slowest", () => {
    const state = basicSetup();
    const enemies = state.combat!.units;
    enemies.unit_p2_vampires.initiative = 3; // slowest
    enemies.unit_p2_skeletons.initiative = 9;
    enemies.unit_p2_dread_knights.initiative = 9;

    const result = applyAction(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "ability.artillery",
      optionIndex: 0,
      mode: "basic",
      target: { type: "unit", unitId: "unit_p2_skeletons" }
    });
    expect(result.errors.length).toBeGreaterThan(0);
    // Rolled back: card kept, no damage dealt.
    expect(result.state.players.p1.hand).toContain("ability.artillery");
    expect(result.state.combat!.units.unit_p2_skeletons.damage).toBe(0);
  });

  it("can finish combat by removing the last enemy", () => {
    const state = basicSetup();
    const units = state.combat!.units;
    // Leave a single enemy: the Dread Knights are a 'Few' (no lower side to flip
    // to), so a lethal hit removes them outright rather than weakening a Pack.
    delete units.unit_p2_skeletons;
    delete units.unit_p2_vampires;
    const last = units.unit_p2_dread_knights;
    last.initiative = 2;
    last.maxHealth = 1;
    last.damage = 0;

    const play = artilleryPlays(state)[0];
    expect(play, "Artillery should be playable against the last enemy").toBeTruthy();
    const after = applyOk(state, play.action);
    expect(after.combat?.outcome?.winnerPlayerId).toBe("p1");
  });

  it("does not offer the expert side as a hand play, and rejects forcing it", () => {
    const state = basicSetup();
    expect(artilleryPlays(state, 1)).toHaveLength(0);

    const forced = applyAction(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "ability.artillery",
      optionIndex: 1,
      mode: "expert",
      target: { type: "none" }
    });
    expect(forced.errors.length).toBeGreaterThan(0);
    expect(forced.state.players.p1.hand).toContain("ability.artillery");
  });
});

// ===========================================================================
// Expert side — with a Ballista in play: "resolve its effect against the same
// target 3 times" at the start of the combat round.
// ===========================================================================

describe("Artillery (expert) — the Ballista volley", () => {
  function volleySetup(opts: { crowns: number; artillery: boolean; polish?: boolean }): GameState {
    const state = createInitialGameState("artillery-volley");
    if (opts.polish) {
      state.adventure = {
        houseRules: { "polish-card-balance": true }
      } as GameState["adventure"];
    }
    state.players.p1.hand = opts.artillery ? ["ability.artillery"] : [];
    state.players.p2.hand = [];
    state.players.p1.permanents = ["war_machine.ballista"];
    state.players.p1.limits.expertUses = opts.crowns;
    return state;
  }

  /**
   * Makes `unitId` the uniquely slowest enemy and tanky enough to soak a volley.
   * The other enemies get DISTINCT high initiatives (below the attacker's
   * fastest unit) so neither side ends up tied for the first activation — this
   * keeps the war-machine round the only thing under test, with no
   * tied-activation order choice opening afterwards.
   */
  function singleSlowest(state: GameState, unitId: string): void {
    const units = state.combat!.units;
    let next = 8;
    for (const id of Object.keys(units)) {
      if (units[id].controllerId === "p2") {
        units[id].initiative = id === unitId ? 1 : next--;
      }
    }
    units[unitId].maxHealth = 12;
    units[unitId].damage = 0;
  }

  it("resolves the Ballista against the same target 3 times for a crown and the card", () => {
    const state = volleySetup({ crowns: 2, artillery: true });
    singleSlowest(state, "unit_p2_dread_knights");

    const offered = endRound(state, "p1");
    expect(offered.pendingChoice?.type).toBe("OPTION_CHOICE");
    const volley = getLegalActions(offered, "p1").find(
      (legal) => legal.label.includes("Artillery") && legal.label.includes("expert")
    );
    expect(volley, "the Artillery volley should be offered").toBeTruthy();

    const fired = applyOk(offered, volley!.action);
    // 3 × 1 damage, all on the one slowest target.
    expect(fired.combat!.units.unit_p2_dread_knights.damage).toBe(3);
    // Paid for once: a single crown and the Artillery card.
    expect(fired.players.p1.combatStats.expertUsesSpentThisRound).toBe(1);
    expect(fired.players.p1.hand).not.toContain("ability.artillery");
    expect(fired.players.p1.discard).toContain("ability.artillery");
    expect(fired.pendingChoice ?? null).toBeNull();

    // "Resolve its effect 3 times" — three distinct Ballista hits, same target.
    const hits = warMachineHits(fired);
    expect(hits).toHaveLength(3);
    expect(hits.every((hit) => hit.targetUnitId === "unit_p2_dread_knights")).toBe(true);
  });

  it("fires a single basic shot — no crown, card kept — when 'Fire once' is chosen", () => {
    const state = volleySetup({ crowns: 2, artillery: true });
    singleSlowest(state, "unit_p2_dread_knights");

    const offered = endRound(state, "p1");
    const fireOnce = getLegalActions(offered, "p1").find((legal) => legal.label === "Fire once");
    expect(fireOnce, "declining the volley should still fire once").toBeTruthy();

    const fired = applyOk(offered, fireOnce!.action);
    expect(fired.combat!.units.unit_p2_dread_knights.damage).toBe(1);
    expect(fired.players.p1.combatStats.expertUsesSpentThisRound).toBe(0);
    expect(fired.players.p1.hand).toContain("ability.artillery");
  });

  it("never offers the volley without the Artillery card, even with crowns free", () => {
    const state = volleySetup({ crowns: 2, artillery: false });
    singleSlowest(state, "unit_p2_dread_knights");

    const fired = endRound(state, "p1");
    // Just the single basic Ballista shot — no offer, no crown spent.
    expect(fired.pendingChoice ?? null).toBeNull();
    expect(fired.combat!.units.unit_p2_dread_knights.damage).toBe(1);
    expect(fired.players.p1.combatStats.expertUsesSpentThisRound).toBe(0);
  });

  it("never offers the volley with the card but no crown", () => {
    const state = volleySetup({ crowns: 0, artillery: true });
    singleSlowest(state, "unit_p2_dread_knights");

    const fired = endRound(state, "p1");
    expect(fired.pendingChoice ?? null).toBeNull();
    expect(fired.combat!.units.unit_p2_dread_knights.damage).toBe(1);
    // The card is untouched — the volley never happened.
    expect(fired.players.p1.hand).toContain("ability.artillery");
  });

  it("lands its whole volley on the one target the owner picks to break a tie", () => {
    const state = volleySetup({ crowns: 2, artillery: true });
    const units = state.combat!.units;
    // Two enemies tied for slowest (both tanky), one clearly faster.
    for (const id of ["unit_p2_vampires", "unit_p2_skeletons"]) {
      units[id].initiative = 2;
      units[id].maxHealth = 12;
      units[id].damage = 0;
    }
    units.unit_p2_dread_knights.initiative = 9;

    const offered = endRound(state, "p1");
    const volley = getLegalActions(offered, "p1").find(
      (legal) => legal.label.includes("Artillery") && legal.label.includes("expert")
    );
    const tie = applyOk(offered, volley!.action);
    // Cost paid up front; now the owner breaks the tie for the single target.
    expect(tie.pendingChoice?.type).toBe("ABILITY_TARGET_CHOICE");
    expect(tie.players.p1.combatStats.expertUsesSpentThisRound).toBe(1);
    expect(tie.players.p1.hand).not.toContain("ability.artillery");

    const resolved = applyOk(tie, {
      type: "CHOOSE_ABILITY_TARGET",
      playerId: "p1",
      choiceId: tie.pendingChoice!.id,
      targetUnitId: "unit_p2_vampires"
    });
    // All three shots hit the chosen unit; the other tied unit takes none.
    expect(resolved.combat!.units.unit_p2_vampires.damage).toBe(3);
    expect(resolved.combat!.units.unit_p2_skeletons.damage).toBe(0);
    expect(resolved.pendingChoice ?? null).toBeNull();
  });

  it("Polish Basic offers a crown-free 2-shot volley and free target choice", () => {
    const state = volleySetup({ crowns: 0, artillery: true, polish: true });
    singleSlowest(state, "unit_p2_dread_knights");

    const offered = endRound(state, "p1");
    const basic = getLegalActions(offered, "p1").find(
      (legal) => legal.label.includes("Artillery") && legal.label.includes("basic")
    );
    expect(basic).toBeTruthy();
    expect(getLegalActions(offered, "p1").some((legal) => legal.label.includes("expert"))).toBe(false);

    const aiming = applyOk(offered, basic!.action);
    expect(aiming.pendingChoice?.type).toBe("ABILITY_TARGET_CHOICE");
    const target = getLegalActions(aiming, "p1").find(
      (legal) => legal.action.type === "CHOOSE_ABILITY_TARGET" && legal.label.includes("Dread Knights")
    );
    const fired = applyOk(aiming, target!.action);
    expect(fired.combat!.units.unit_p2_dread_knights.damage).toBe(2);
    expect(fired.players.p1.combatStats.expertUsesSpentThisRound).toBe(0);
    expect(fired.players.p1.hand).not.toContain("ability.artillery");
    expect(fired.activeEffects.some((effect) =>
      effect.modifiers.some((modifier) => modifier.type === "BALLISTA_CHOOSE_TARGET")
    )).toBe(true);
  });

  it("Polish Expert remains a 3-shot alternative beside Basic", () => {
    const state = volleySetup({ crowns: 1, artillery: true, polish: true });
    singleSlowest(state, "unit_p2_dread_knights");
    const offered = endRound(state, "p1");
    const actions = getLegalActions(offered, "p1");
    expect(actions.some((legal) => legal.label.includes("basic"))).toBe(true);
    const expert = actions.find((legal) => legal.label.includes("Artillery") && legal.label.includes("expert"));
    expect(expert).toBeTruthy();
    const aiming = applyOk(offered, expert!.action);
    const target = getLegalActions(aiming, "p1").find(
      (legal) => legal.action.type === "CHOOSE_ABILITY_TARGET" && legal.label.includes("Dread Knights")
    );
    const fired = applyOk(aiming, target!.action);
    expect(fired.combat!.units.unit_p2_dread_knights.damage).toBe(3);
    expect(fired.players.p1.combatStats.expertUsesSpentThisRound).toBe(1);
  });

  it("the Polish reprint exposes Basic 2 shots and Expert 3 shots in its card definition", () => {
    const state = volleySetup({ crowns: 1, artillery: true, polish: true });
    const card = polishBalanceCard(state, "ability.artillery");
    expect(card?.effect.type).toBe("CHOOSE_ONE");
    if (card?.effect.type !== "CHOOSE_ONE") return;
    expect(card.effect.options.filter((option) => option.effect.type === "ARTILLERY_BALLISTA_VOLLEY"))
      .toMatchObject([
        { effect: { shots: 2 } },
        { expertOnly: true, effect: { shots: 3 } }
      ]);
  });
});
