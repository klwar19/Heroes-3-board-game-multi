/**
 * TWO reported bugs on ONE seam — the Population token inside the PvP pre-battle
 * preparation window. Both are pinned here, because the fix for the first caused
 * the second and the two pull in opposite directions.
 *
 * The BINH house rule (untouched off the battlefield): a purchase does NOT spend
 * the Population token. The window stays open for unlimited recruiting and
 * reinforcing all round and closes only when a hero MOVES after a purchase
 * (`commitPopulationOnMove`).
 *
 * BUG 1 (older): "I recruited dwarves right before the battle with an enemy hero,
 * and I still had an unspent population town token on my turn later." The move
 * lock is ORDER-SENSITIVE and can NEVER fire in the prep window: the ATTACKER
 * already walked onto the enemy BEFORE buying (the move saw no purchase yet) and
 * the DEFENDER is dragged into the fight on someone else's turn without moving at
 * all. So the round's Population action leaked PAST the battle.
 *
 * BUG 2 (this fix): "when player gets attacked, can't buy troops or reinforce
 * after buying once." Bug 1 had been fixed by committing the window on the FIRST
 * purchase made with a combat open — which closed the shopping window after a
 * single buy, while a normal map turn allows as many purchases as resources last.
 * The prep window is a SHOPPING window; cutting it to one buy is a rule the game
 * has nowhere else.
 *
 * FIX (the seam): `populationAction` no longer commits on the purchase. The prep
 * window is committed when the SHOPPING ENDS —
 *  - `acceptCombat` commits the accepting participant (`inCombatPrep` is false for
 *    them from then on, so no town action is offered any more), and
 *  - `finalizeAdventureCombat` commits BOTH participants as the backstop for a
 *    fight that ended straight out of prep (Retreat / Surrender / give-up / AFK
 *    drop), where nobody accepted.
 * Both call `commitPopulationAfterCombatPrep`, which — like the move lock — only
 * closes a window that actually bought something this round.
 *
 * Scope / limits pinned with CONTROLs that diverge:
 *  - a NORMAL map-turn recruit is untouched (unlimited until a hero moves);
 *  - the genuine once-per-round limits still bite: a spent window really refuses
 *    the next purchase, and a Secondary-Hero hire still eats the whole token;
 *  - the token still refreshes with the round;
 *  - a participant who bought NOTHING in prep keeps an open window afterwards.
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
 * A BINH 2-player game where p1 (Castle) can really recruit AND reinforce: Bronze
 * dwelling + Citadel standing, Marksmen + Griffins cleared out of the starting
 * army (each unit card exists once) and gold to spare. Both heroes stand on
 * adjacent plain fields so either side can walk onto the other for a real PvP
 * battle.
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
  state.towns.town_p1.buildings = [
    ...new Set([...state.towns.town_p1.buildings, "castle.dwelling_bronze", "castle.citadel"])
  ];
  state.players.p1.army = state.players.p1.army.filter(
    (unit) => unit.unitDefId !== "castle.marksmen" && unit.unitDefId !== "castle.griffins"
  );
  state.players.p1.resources.gold = 200;
  state.players.p2.resources.gold = 200;

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

/** The offered "Reinforce <name> to a pack" POPULATION_ACTION, if any. */
function reinforceOffer(state: GameState, playerId: PlayerId, unitDefId: string): GameAction | undefined {
  return getLegalActions(state, playerId).find(
    (legal) =>
      legal.action.type === "POPULATION_ACTION" &&
      legal.action.purchases.some(
        (purchase) => purchase.kind === "reinforce" && purchase.unitDefId === unitDefId
      )
  )?.action;
}

const forcedRecruit = (playerId: PlayerId, unitDefId: string): GameAction => ({
  type: "POPULATION_ACTION",
  playerId,
  purchases: [{ kind: "recruit", unitDefId }]
});

/** Play a settled combat out to the map (the notice may need several acks). */
function acknowledgeCombat(state: GameState, playerId: PlayerId): GameState {
  let next = state;
  for (let guard = 0; guard < 6 && next.combat; guard += 1) {
    const ack = getLegalActions(next, playerId).find(
      (legal) => legal.action.type === "ACKNOWLEDGE_COMBAT_END"
    );
    if (!ack) break;
    next = apply(next, ack.action);
  }
  return next;
}

describe("Population token in the PvP prep window: unlimited buys, committed when prep ENDS", () => {
  it("BUG 2 — an ATTACKED player may keep buying and reinforcing after the first purchase", () => {
    const ready = pvpReady("pop-prep-defender-multi");
    let { state } = ready;
    const { p1Field } = ready;
    // p2 is on the clock and attacks p1, so the defender p1 has moved nothing at
    // all this round — exactly the reporter's seat.
    state.activePlayerId = "p2";
    state = apply(state, { type: "MOVE_HERO", playerId: "p2", heroId: "hero_p2", to: p1Field });
    expect(state.combat?.prep?.accepted, "the pre-battle prep window is open").toEqual([]);

    // Buy #1: Marksmen.
    const first = recruitOffer(state, "p1", "castle.marksmen");
    expect(first, "the prep window offers the recruit").toBeTruthy();
    state = apply(state, first!);
    expect(state.players.p1.army.some((unit) => unit.unitDefId === "castle.marksmen")).toBe(true);
    expect(state.players.p1.populationPurchasedThisRound).toBe(true);

    // THE BUG: the window closed here, so buy #2 was neither offered nor legal.
    expect(
      state.players.p1.townTokens.population,
      "the shopping window stays open after the first prep purchase"
    ).toBe(true);
    const second = recruitOffer(state, "p1", "castle.griffins");
    expect(second, "a SECOND recruit is still offered inside the same prep window").toBeTruthy();
    state = apply(state, second!);
    expect(
      state.players.p1.army.some((unit) => unit.unitDefId === "castle.griffins"),
      "…and it really joins the army in time to be placed"
    ).toBe(true);

    // Reinforcing is the same token, so it was blocked too — and works now.
    const reinforce = reinforceOffer(state, "p1", "castle.marksmen");
    expect(reinforce, "reinforcing after a recruit is still offered").toBeTruthy();
    state = apply(state, reinforce!);
    expect(
      state.players.p1.army.find((unit) => unit.unitDefId === "castle.marksmen")?.side,
      "the Few really flips to a Pack"
    ).toBe("pack");
  });

  it("BUG 2 — the ATTACKER may keep buying in its own prep window too", () => {
    const ready = pvpReady("pop-prep-attacker-multi");
    let { state } = ready;
    const { p2Field } = ready;
    state = apply(state, { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to: p2Field });
    expect(state.combat?.context.kind, "walking onto the enemy hero opens a PvP battle").toBe("player");

    state = apply(state, recruitOffer(state, "p1", "castle.marksmen")!);
    expect(state.players.p1.townTokens.population).toBe(true);
    const second = recruitOffer(state, "p1", "castle.griffins");
    expect(second, "the attacker's second prep recruit is still offered").toBeTruthy();
    state = apply(state, second!);
    expect(state.players.p1.army.some((unit) => unit.unitDefId === "castle.griffins")).toBe(true);
  });

  it("BUG 1 — readying up ENDS the shopping: the window is committed, not leaked", () => {
    const ready = pvpReady("pop-prep-accept-commits");
    let { state } = ready;
    const { p1Field } = ready;
    state.activePlayerId = "p2";
    state = apply(state, { type: "MOVE_HERO", playerId: "p2", heroId: "hero_p2", to: p1Field });
    state = apply(state, recruitOffer(state, "p1", "castle.marksmen")!);
    expect(state.players.p1.townTokens.population, "still shopping").toBe(true);

    state = apply(state, { type: "ACCEPT_COMBAT", playerId: "p1" });
    expect(state.players.p1.townTokens.population, "ACCEPT_COMBAT closes the Population window").toBe(false);
    // Nothing more is offered, and a forged purchase is refused. (The message is
    // the combat guard's rather than the token's: an accepted participant is no
    // longer `inCombatPrep`, so town actions are shut out wholesale — the token
    // check behind it is what still bites once the fight is over, pinned below.)
    expect(recruitOffer(state, "p1", "castle.griffins")).toBeUndefined();
    const forced = applyAction(state, forcedRecruit("p1", "castle.griffins"));
    expect(forced.errors).toHaveLength(1);
    expect(
      forced.state.players.p1.army.some((unit) => unit.unitDefId === "castle.griffins"),
      "no extra Griffins after readying up"
    ).toBe(false);
  });

  it("BUG 1 — the ATTACKER's prep recruit does not leak past the battle (end to end)", () => {
    const ready = pvpReady("pop-prep-attacker");
    let { state } = ready;
    const { p2Field } = ready;

    // 1. The reporter's sequence: march onto the enemy hero (a REAL move — the one
    //    that can never close the window, nothing having been bought yet).
    state = apply(state, { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to: p2Field });
    expect(state.combat?.prep?.accepted).toEqual([]);
    expect(state.players.p1.townTokens.population, "the move bought nothing, so the token is intact").toBe(true);
    expect(state.players.p1.populationPurchasedThisRound).toBeFalsy();

    // 2. Recruit in the prep window, then ready up.
    state = apply(state, recruitOffer(state, "p1", "castle.marksmen")!);
    state = apply(state, { type: "ACCEPT_COMBAT", playerId: "p1" });

    // 3. Play the battle out (the defender bails), then land back on the map on
    //    the SAME round, still p1's turn — exactly where the reporter looked.
    state = apply(state, { type: "RETREAT_FROM_COMBAT", playerId: "p2" });
    expect(state.combat?.outcome).toMatchObject({ defeatedPlayerId: "p2" });
    state = acknowledgeCombat(state, "p1");
    expect(state.round, "still the same game round — the token has not refreshed").toBe(1);

    // The Population action is spent, and a second recruit is refused.
    expect(state.players.p1.townTokens.population, "still spent after the battle").toBe(false);
    expect(recruitOffer(state, "p1", "castle.griffins"), "no free extra recruit on the map").toBeUndefined();
    const afterBattle = applyAction(state, forcedRecruit("p1", "castle.griffins"));
    expect(afterBattle.errors).toHaveLength(1);
    expect(
      afterBattle.state.players.p1.army.some((unit) => unit.unitDefId === "castle.griffins"),
      "the free extra Griffins never join the army"
    ).toBe(false);
  });

  it("BUG 1 — a fight that ends straight out of prep (nobody accepted) still commits", () => {
    // The finalize backstop: p1 (defender) buys, then the attacker retreats before
    // either side pressed ACCEPT_COMBAT, so the accept-time commit never runs.
    const ready = pvpReady("pop-prep-escape-commits");
    let { state } = ready;
    const { p1Field } = ready;
    state.activePlayerId = "p2";
    state = apply(state, { type: "MOVE_HERO", playerId: "p2", heroId: "hero_p2", to: p1Field });
    state = apply(state, recruitOffer(state, "p1", "castle.marksmen")!);
    expect(state.combat?.prep?.accepted, "nobody has readied up").toEqual([]);

    state = apply(state, { type: "RETREAT_FROM_COMBAT", playerId: "p2" });
    state = acknowledgeCombat(state, "p2");
    expect(state.combat ?? null, "the fight is over").toBeNull();

    expect(
      state.players.p1.townTokens.population,
      "the defender's window is committed by the end of the fight"
    ).toBe(false);
    const forced = applyAction(state, forcedRecruit("p1", "castle.griffins"));
    expect(forced.errors).toHaveLength(1);
  });

  it("CONTROL: a participant who bought NOTHING in prep keeps an open window", () => {
    // The commit is gated on `populationPurchasedThisRound`, exactly like the move
    // lock — being dragged into a battle must not cost an unused Population action.
    const ready = pvpReady("pop-prep-no-purchase");
    let { state } = ready;
    const { p1Field } = ready;
    state.activePlayerId = "p2";
    state = apply(state, { type: "MOVE_HERO", playerId: "p2", heroId: "hero_p2", to: p1Field });
    state = apply(state, { type: "ACCEPT_COMBAT", playerId: "p1" });
    expect(state.players.p1.townTokens.population, "an unused token survives readying up").toBe(true);

    state = apply(state, { type: "RETREAT_FROM_COMBAT", playerId: "p2" });
    state = acknowledgeCombat(state, "p2");
    expect(state.players.p1.townTokens.population, "and survives the whole battle").toBe(true);
    state = apply(state, forcedRecruit("p1", "castle.marksmen"));
    expect(state.players.p1.army.some((unit) => unit.unitDefId === "castle.marksmen")).toBe(true);
  });

  it("CONTROL: a normal map-turn recruit still leaves the window open, and the move still closes it", () => {
    // The BINH house rule is untouched off the battlefield: unlimited recruiting
    // until a hero moves after a purchase. (If the prep commit leaked out of its
    // window, the second recruit here would be refused.)
    const ready = pvpReady("pop-prep-control");
    let { state } = ready;
    const { p2Field } = ready;
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
    expect(recruitOffer(state, "p1", "castle.pikemen"), "no offer once the window is closed").toBeUndefined();
  });

  it("CONTROL: the genuine once-per-round limits still bite on a normal turn", () => {
    // Hiring a Secondary Hero eats the WHOLE Population token (printed rule), so
    // no recruit or reinforce follows it — on a normal turn, with no combat in
    // sight. Proof that the fix relaxed the prep window only, not the token rule.
    let { state } = pvpReady("pop-prep-secondary-hero");
    const hire = getLegalActions(state, "p1").find((legal) => legal.action.type === "HIRE_SECONDARY_HERO");
    expect(hire, "hiring a Secondary Hero is a normal map-turn action").toBeTruthy();
    state = apply(state, hire!.action);
    expect(state.players.p1.townTokens.population, "the hire spends the Population token").toBe(false);

    expect(recruitOffer(state, "p1", "castle.marksmen"), "no recruit after the hire").toBeUndefined();
    const forced = applyAction(state, forcedRecruit("p1", "castle.marksmen"));
    expect(forced.errors).toHaveLength(1);
    expect(forced.errors[0].message).toMatch(/already used this round/i);
  });

  it("CONTROL: the token refreshes with the round after a prep recruit", () => {
    const ready = pvpReady("pop-prep-refresh");
    let { state } = ready;
    const { p2Field } = ready;
    state = apply(state, { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to: p2Field });
    state = apply(state, recruitOffer(state, "p1", "castle.marksmen")!);
    state = apply(state, { type: "ACCEPT_COMBAT", playerId: "p1" });
    expect(state.players.p1.townTokens.population).toBe(false);

    refreshRoundTokens(state);
    expect(state.players.p1.townTokens.population, "a new round reopens the window").toBe(true);
    expect(state.players.p1.populationPurchasedThisRound).toBe(false);
  });
});
