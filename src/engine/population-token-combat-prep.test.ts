/**
 * REPORTED BUG (live play): "I recruited dwarves right before the battle with an
 * enemy hero, and I still had an unspent population town token on my turn later
 * (it should have been spent already)."
 *
 * Root cause. The BINH house rule deliberately does NOT spend the Population
 * token on a purchase: the window stays open for unlimited recruiting and only
 * closes when a hero MOVES after a purchase (`commitPopulationOnMove`). That
 * move-lock is ORDER-SENSITIVE, and the PvP pre-battle preparation window is the
 * one place a purchase can land on the wrong side of it:
 *
 *  - the ATTACKER already moved onto the enemy BEFORE buying, so
 *    `commitPopulationOnMove` has been and gone (it saw no purchase yet);
 *  - the DEFENDER is dragged into the fight on someone else's turn and never
 *    moved at all.
 *
 * Either way the round's Population action leaked PAST the battle and stayed
 * spendable — a free second recruit for the rest of the round.
 *
 * FIX (adventure-reducer.ts `populationAction`): a purchase made while a combat
 * is open — which `populationAction` already restricts to the prep window of a
 * participant — commits the Population window at once. Combat is the definitive
 * end of shopping: the hero is in a battle, not at home in its town.
 *
 * Scope / limits pinned below with CONTROLs that diverge:
 *  - a NORMAL map-turn recruit is untouched — the token stays open, a second
 *    recruit still goes through, and the move-lock still closes it (the BINH
 *    house rule, pinned in adventure.test.ts, is NOT changed);
 *  - the token still refreshes with the round.
 */
import { describe, expect, it } from "vitest";
import { applyAction, createAdventureGameState, getLegalActions, getMainHero } from "./index";
import { refreshRoundTokens } from "./adventure";
import type { GameAction, GameState, PlayerId } from "./state";

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

/**
 * A BINH 2-player game where p1 (Castle) can really recruit: Bronze dwelling
 * standing, Marksmen + Griffins cleared out of the starting army (each unit card
 * exists once) and gold to spare. Both heroes stand on adjacent plain fields so
 * either side can walk onto the other for a real PvP battle.
 */
function pvpReady(seed: string): { state: GameState; p1Field: string; p2Field: string } {
  const state = createAdventureGameState({
    startingBuildings: [],
    seed,
    ruleset: "binh",
    difficulty: "normal",
    rollFirstPlayer: false,
    events: false,
    players: [
      { id: "p1", name: "A", factionId: "castle", heroDefId: "catherine" },
      { id: "p2", name: "B", factionId: "rampart", heroDefId: "gelu" }
    ]
  });
  for (const player of Object.values(state.players)) {
    player.canMulligan = false;
    player.needsHandRefresh = false;
  }
  state.towns.town_p1.buildings = [...new Set([...state.towns.town_p1.buildings, "castle.dwelling_bronze"])];
  state.players.p1.army = state.players.p1.army.filter(
    (unit) => unit.unitDefId !== "castle.marksmen" && unit.unitDefId !== "castle.griffins"
  );
  state.players.p1.resources.gold = 80;
  state.players.p2.resources.gold = 80;

  // p1's hero stays on its own Town field (its start); p2's hero is STAGED on
  // the adjacent plain field (staging, not a move — neither hero has "moved this
  // round" yet), so either side can walk onto the other.
  const p1Field = getMainHero(state, "p1")!.spaceId!;
  const p2Field = "h:9:2";
  expect(state.adventure!.fields[p1Field]?.location, "p1 starts on its Town").toBe("town");
  expect(state.adventure!.fields[p2Field]?.location, `${p2Field} is a plain field`).toBe("empty_field");
  getMainHero(state, "p2")!.spaceId = p2Field;
  state.adventure!.lastVisitedField.hero_p1 = p1Field;
  state.adventure!.lastVisitedField.hero_p2 = p2Field;
  for (const hero of Object.values(state.heroes)) {
    hero.movementPoints = 5;
    hero.movementHaltedThisTurn = false;
  }
  state.activePlayerId = "p1";
  return { state, p1Field, p2Field };
}

/** The offered "Recruit few <name>" POPULATION_ACTION for this player, if any. */
function recruitOffer(
  state: GameState,
  playerId: PlayerId,
  unitDefId: string
): GameAction | undefined {
  return getLegalActions(state, playerId).find(
    (legal) =>
      legal.action.type === "POPULATION_ACTION" &&
      legal.action.purchases.some(
        (purchase) => purchase.kind === "recruit" && purchase.unitDefId === unitDefId
      )
  )?.action;
}

const forcedRecruit = (playerId: PlayerId, unitDefId: string): GameAction => ({
  type: "POPULATION_ACTION",
  playerId,
  purchases: [{ kind: "recruit", unitDefId }]
});

describe("Population token: a recruit in the PvP pre-battle window is SPENT (reported bug)", () => {
  it("the ATTACKER's prep recruit closes the window — no free second recruit after the battle", () => {
    let { state, p2Field } = pvpReady("pop-prep-attacker");

    // 1. The reporter's sequence: march onto the enemy hero (a REAL move — this
    //    is the move that can never close the window, because nothing has been
    //    bought yet) and the PvP prep window opens.
    state = apply(state, { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to: p2Field });
    expect(state.combat?.context.kind, "walking onto the enemy hero opens a PvP battle").toBe("player");
    expect(state.combat?.prep?.accepted, "the pre-battle prep window is open").toEqual([]);
    expect(state.players.p1.townTokens.population, "the move bought nothing, so the token is intact").toBe(true);
    expect(state.players.p1.populationPurchasedThisRound).toBeFalsy();

    // 2. Recruit in the prep window (the offer the client shows).
    const recruit = recruitOffer(state, "p1", "castle.marksmen");
    expect(recruit, "the prep window offers the recruit").toBeTruthy();
    state = apply(state, recruit!);
    expect(state.players.p1.army.some((unit) => unit.unitDefId === "castle.marksmen")).toBe(true);
    expect(state.players.p1.populationPurchasedThisRound).toBe(true);

    // 3. THE BUG: the Population token stayed unspent, so the round's Population
    //    action leaked past the battle.
    expect(state.players.p1.townTokens.population, "the prep purchase SPENDS the Population token").toBe(false);
    expect(
      recruitOffer(state, "p1", "castle.griffins"),
      "no second recruit is offered inside the same prep window"
    ).toBeUndefined();
    const secondInPrep = applyAction(state, forcedRecruit("p1", "castle.griffins"));
    expect(secondInPrep.errors).toHaveLength(1);
    expect(secondInPrep.errors[0].message).toMatch(/already used this round/i);

    // 4. Play the battle out (the defender bails), then land back on the map on
    //    the SAME round, still p1's turn — exactly where the reporter looked.
    state = apply(state, { type: "RETREAT_FROM_COMBAT", playerId: "p2" });
    expect(state.combat?.outcome).toMatchObject({ defeatedPlayerId: "p2" });
    for (let guard = 0; guard < 6 && state.combat; guard += 1) {
      const ack = getLegalActions(state, "p1").find(
        (legal) => legal.action.type === "ACKNOWLEDGE_COMBAT_END"
      );
      if (!ack) break;
      state = apply(state, ack.action);
    }
    expect(state.round, "still the same game round — the token has not refreshed").toBe(1);

    // The Population action is still spent, and a second recruit is refused.
    expect(state.players.p1.townTokens.population, "still spent after the battle").toBe(false);
    expect(recruitOffer(state, "p1", "castle.griffins"), "no free extra recruit on the map").toBeUndefined();
    const afterBattle = applyAction(state, forcedRecruit("p1", "castle.griffins"));
    expect(afterBattle.errors).toHaveLength(1);
    expect(
      afterBattle.state.players.p1.army.some((unit) => unit.unitDefId === "castle.griffins"),
      "the free extra Griffins never join the army"
    ).toBe(false);
  });

  it("the DEFENDER's prep recruit closes the window too — the leak crossed a turn boundary", () => {
    let { state, p1Field } = pvpReady("pop-prep-defender");
    // p2 is on the clock and attacks p1, so p1 (the defender) has moved nothing
    // at all this round — the move-lock has nothing to fire on.
    state.activePlayerId = "p2";

    state = apply(state, { type: "MOVE_HERO", playerId: "p2", heroId: "hero_p2", to: p1Field });
    expect(state.combat?.prep?.accepted).toEqual([]);

    const recruit = recruitOffer(state, "p1", "castle.marksmen");
    expect(recruit, "the defender may recruit in the prep window").toBeTruthy();
    state = apply(state, recruit!);

    expect(state.players.p1.army.some((unit) => unit.unitDefId === "castle.marksmen")).toBe(true);
    expect(state.players.p1.townTokens.population, "the defender's prep purchase SPENDS the token").toBe(false);
    const second = applyAction(state, forcedRecruit("p1", "castle.griffins"));
    expect(second.errors).toHaveLength(1);
  });

  it("CONTROL: a normal map-turn recruit still leaves the window open, and the move still closes it", () => {
    // The BINH house rule is untouched off the battlefield: unlimited recruiting
    // until a hero moves after a purchase. (If the fix leaked out of the prep
    // window, the second recruit here would be refused.)
    let { state, p2Field } = pvpReady("pop-prep-control");
    expect(state.combat ?? null, "no combat: an ordinary map turn").toBeNull();

    state = apply(state, forcedRecruit("p1", "castle.marksmen"));
    expect(state.players.p1.townTokens.population, "a plain recruit does NOT spend the token").toBe(true);
    expect(state.players.p1.populationPurchasedThisRound).toBe(true);

    state = apply(state, forcedRecruit("p1", "castle.griffins"));
    expect(state.players.p1.army.some((unit) => unit.unitDefId === "castle.griffins")).toBe(true);
    expect(state.players.p1.townTokens.population).toBe(true);

    // Moving after a purchase is what closes it (h:7:2 is a plain neighbour of
    // the hero's staged field, away from the enemy hero).
    expect(state.adventure!.fields["h:7:2"].location).toBe("empty_field");
    expect(p2Field, "the enemy stands elsewhere — this move is not an attack").toBe("h:9:2");
    state = apply(state, { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to: "h:7:2" });
    expect(state.players.p1.townTokens.population, "the move after a purchase commits it").toBe(false);
  });

  it("CONTROL: the token refreshes with the round after a prep recruit", () => {
    let { state, p2Field } = pvpReady("pop-prep-refresh");
    state = apply(state, { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to: p2Field });
    state = apply(state, recruitOffer(state, "p1", "castle.marksmen")!);
    expect(state.players.p1.townTokens.population).toBe(false);

    refreshRoundTokens(state);
    expect(state.players.p1.townTokens.population, "a new round reopens the window").toBe(true);
    expect(state.players.p1.populationPurchasedThisRound).toBe(false);
  });
});
