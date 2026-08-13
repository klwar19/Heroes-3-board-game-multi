/**
 * PvP pre-battle prep is a SIMULTANEOUS shopping window — one side's open
 * exclusive interaction must not freeze the other side's shopping.
 *
 * USER REPORT (2026-08-13, repeat): "WHEN PLAYER GET ATTACKED BY ANOTHER
 * PLAYER: WHY CANT I BUY UNITS THEN UPGRADE, OR THEN BUY SPELLS, CAN'T DO BOTH
 * BUY UNITS AND SPELLS OR CAN ONLY BUY 1 UNITS, THEN CANT BUY ANOTHER OR
 * UPGRADE." The TOKEN half of this was fixed on 2026-08-08
 * (population-token-combat-prep.test.ts) — a lone shopper can spree freely.
 * THE SURVIVING BUG was the SIMULTANEITY: the moment the OTHER fighter's
 * purchase opened an exclusive interaction — the spell-buy's Search
 * pendingChoice, or a Legion play's troop-pick pendingVisit — the
 * pendingChoice branch of getLegalActionsCore (and the prep pendingVisit gate
 * in getAdventureLegalActions) collapsed this fighter's offers to NOTHING. In
 * a live two-human game where both sides shop at once, that reads exactly as
 * the report: "I bought one unit and now every buy/upgrade/spell button is
 * dead", seemingly at random (it depends on what the opponent is doing).
 *
 * THE FIX (two seams, one rule): a participant who is still `inCombatPrep`
 * keeps their TOWN-ACTION offers (addTownActions: recruit / reinforce / Stack
 * / build / spell buy) while another player's pendingChoice or pendingVisit is
 * open. Those purchases are handler-validated, touch only the actor's own
 * state, and anything they QUEUE (a Spell search of their own) waits in the
 * reward queue behind the open interaction — so they can never corrupt it.
 * DELIBERATELY STILL WITHHELD in that moment (the conservative scope): card
 * plays (a second Legion would collide with the open visit — the exclusive
 * interaction machinery is a singleton), ACCEPT_COMBAT and the escapes (they
 * move the combat machinery itself). All of those return the moment the open
 * interaction resolves.
 *
 * Also fixed here, the DEAD-OFFER twin of the same complaint: addTownActions
 * offered the Blacksmith and the Magic University during prep, but BOTH
 * handlers refuse ANY open combat ("Town actions cannot interrupt a combat."
 * — no prep exemption), so a Conflux player's "buy spells" button (the
 * University dig) was offered and then always rejected. The offers are now
 * gated on `!state.combat`, matching their handlers verbatim.
 */
import { describe, expect, it } from "vitest";
import { applyAction, createAdventureGameState, getLegalActions, getMainHero } from "./index";
import type { GameAction, GameState, PlayerId } from "./state";

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, `${action.type}: ` + result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

/**
 * A BINH 2-player game one step from a PvP battle: p1 (Castle, defender) has a
 * Bronze dwelling + Citadel + Mage Guild standing and Marksmen/Griffins cleared
 * out of the starting army so it can recruit AND reinforce; p2 (Rampart,
 * attacker) has a Mage Guild of its own so BOTH sides can open a spell Search.
 */
function pvpReady(seed: string, mutate: (state: GameState) => void = () => {}): { state: GameState; p1Field: string } {
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
    ...new Set([...state.towns.town_p1.buildings, "castle.dwelling_bronze", "castle.citadel", "castle.mage_guild"])
  ];
  state.towns.town_p2.buildings = [...new Set([...state.towns.town_p2.buildings, "rampart.mage_guild"])];
  state.players.p1.mageGuildBuiltRound = 0;
  state.players.p2.mageGuildBuiltRound = 0;
  state.players.p1.army = state.players.p1.army.filter(
    (unit) => unit.unitDefId !== "castle.marksmen" && unit.unitDefId !== "castle.griffins"
  );
  state.players.p1.resources.gold = 200;
  state.players.p2.resources.gold = 200;

  const p1Field = getMainHero(state, "p1")!.spaceId!;
  getMainHero(state, "p2")!.spaceId = "h:9:2";
  state.adventure!.lastVisitedField.hero_p1 = p1Field;
  state.adventure!.lastVisitedField.hero_p2 = "h:9:2";
  for (const hero of Object.values(state.heroes)) {
    hero.movementPoints = 5;
    hero.movementHaltedThisTurn = false;
  }
  state.activePlayerId = "p2";
  mutate(state);
  return { state, p1Field };
}

/** Opens the prep window: p2 (on the clock) walks onto p1's hero. */
function openPrep(seed: string, mutate: (state: GameState) => void = () => {}): GameState {
  const { state, p1Field } = pvpReady(seed, mutate);
  const attacked = apply(state, { type: "MOVE_HERO", playerId: "p2", heroId: "hero_p2", to: p1Field });
  expect(attacked.combat?.prep?.accepted, "the prep window is open").toEqual([]);
  return attacked;
}

/** p2 buys spells so p2's Search pendingChoice is the open foreign interaction. */
function openAttackerSearch(state: GameState): GameState {
  const spells = getLegalActions(state, "p2").find(
    (legal) => legal.action.type === "SPELL_BOOK_ACTION" && !legal.action.wisdom && !legal.action.takeCastCard
  );
  expect(spells, "the attacker's spell buy is offered in prep").toBeTruthy();
  const next = apply(state, spells!.action);
  expect(next.pendingChoice?.playerId, "the attacker's Search choice is open").toBe("p2");
  return next;
}

function resolveOwnSearch(state: GameState, playerId: PlayerId): GameState {
  let next = state;
  let guard = 0;
  while (next.pendingChoice?.playerId === playerId && guard++ < 8) {
    const resolve = getLegalActions(next, playerId).find(
      (legal) => legal.action.type === "RESOLVE_DECK_SEARCH" || legal.action.type === "CHOOSE_OPTION"
    );
    expect(resolve, `${playerId} can resolve their own open search`).toBeTruthy();
    next = apply(next, resolve!.action);
  }
  return next;
}

const recruitOffer = (state: GameState, playerId: PlayerId, unitDefId: string) =>
  getLegalActions(state, playerId).find(
    (legal) =>
      legal.action.type === "POPULATION_ACTION" &&
      legal.action.purchases.some((purchase) => purchase.kind === "recruit" && purchase.unitDefId === unitDefId)
  );

const reinforceOffer = (state: GameState, playerId: PlayerId, unitDefId: string) =>
  getLegalActions(state, playerId).find(
    (legal) =>
      legal.action.type === "POPULATION_ACTION" &&
      legal.action.purchases.some((purchase) => purchase.kind === "reinforce" && purchase.unitDefId === unitDefId)
  );

describe("PvP prep — the opponent's open interaction no longer freezes the shopper", () => {
  it("REPRO: while the ATTACKER's spell Search is open, the DEFENDER still buys, upgrades and queues spells", () => {
    let state = openPrep("prep-simul-repro");

    // The defender's first buy works (as before)…
    state = apply(state, recruitOffer(state, "p1", "castle.marksmen")!.action);
    // …then the attacker opens a Search — the moment that used to kill every
    // defender button.
    state = openAttackerSearch(state);
    const choiceId = state.pendingChoice!.id;

    // Buy #2, the upgrade, and a spell buy of the defender's own — all offered
    // AND applying cleanly, with the attacker's open choice untouched.
    const second = recruitOffer(state, "p1", "castle.griffins");
    expect(second, "a SECOND recruit is offered while the attacker shops").toBeTruthy();
    state = apply(state, second!.action);
    const upgrade = reinforceOffer(state, "p1", "castle.marksmen");
    expect(upgrade, "the upgrade is offered while the attacker shops").toBeTruthy();
    state = apply(state, upgrade!.action);
    expect(state.players.p1.army.find((unit) => unit.unitDefId === "castle.marksmen")?.side).toBe("pack");

    const ownSpells = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "SPELL_BOOK_ACTION" && !legal.action.wisdom && !legal.action.takeCastCard
    );
    expect(ownSpells, "the defender's spell buy is offered while the attacker shops").toBeTruthy();
    state = apply(state, ownSpells!.action);
    // The defender's Search waits in the queue BEHIND the attacker's open one.
    expect(state.pendingChoice?.id, "the attacker's open choice was never touched").toBe(choiceId);

    // The attacker resolves; the defender's queued Search opens next and
    // resolves; both sides then ready up and the window closes.
    state = resolveOwnSearch(state, "p2");
    expect(state.pendingChoice?.playerId, "the defender's queued Search opens after").toBe("p1");
    state = resolveOwnSearch(state, "p1");
    expect(state.pendingChoice ?? null).toBeNull();
    state = apply(state, { type: "ACCEPT_COMBAT", playerId: "p1" });
    state = apply(state, { type: "ACCEPT_COMBAT", playerId: "p2" });
    expect(state.combat?.prep ?? null, "prep closes into deployment").toBeNull();
  });

  it("the pendingVisit twin: a Legion troop pick freezes only its OWNER — the other fighter keeps shopping", () => {
    let state = openPrep("prep-simul-visit", (s) => {
      s.players.p2.hand = ["artifact.legs_of_legion"];
    });
    const legion = getLegalActions(state, "p2").find(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "artifact.legs_of_legion"
    );
    expect(legion, "the attacker can play Legion in prep").toBeTruthy();
    state = apply(state, legion!.action);
    expect(state.adventure?.pendingVisit?.playerId, "the Legion troop pick is open for p2").toBe("p2");

    // The visit OWNER is offered exactly its visit steps…
    const ownerOffers = getLegalActions(state, "p2");
    expect(ownerOffers.length).toBeGreaterThan(0);
    expect(ownerOffers.every((legal) => legal.action.type === "RESOLVE_VISIT_STEP")).toBe(true);

    // …while the DEFENDER keeps the shopping (the old reading offered []).
    const buy = recruitOffer(state, "p1", "castle.marksmen");
    expect(buy, "the defender still buys while the attacker picks a Legion troop").toBeTruthy();
    state = apply(state, buy!.action);
    expect(state.adventure?.pendingVisit?.playerId, "the open visit is untouched").toBe("p2");
    // Accept stays withheld for BOTH (the visit must resolve first — the
    // handler also rejects it, pinned in pvp-precombat.test.ts).
    expect(getLegalActions(state, "p1").some((legal) => legal.action.type === "ACCEPT_COMBAT")).toBe(false);

    // The visit resolves normally afterwards.
    const pick = getLegalActions(state, "p2")[0];
    state = apply(state, pick.action);
    expect(state.adventure?.pendingVisit ?? null).toBeNull();
  });

  it("CONTROL: the choice OWNER still gets ONLY their choice — no shopping beside an open Search of your own", () => {
    let state = openPrep("prep-simul-owner");
    state = openAttackerSearch(state);
    const ownerOffers = getLegalActions(state, "p2");
    expect(ownerOffers.length).toBeGreaterThan(0);
    expect(
      ownerOffers.every(
        (legal) => legal.action.type === "CHOOSE_OPTION" || legal.action.type === "RESOLVE_DECK_SEARCH"
      ),
      "the search owner resolves the search first; got: " + ownerOffers.map((legal) => legal.label).join(" | ")
    ).toBe(true);
  });

  it("CONTROL: Accept, card plays and the escapes stay WITHHELD while the foreign choice is open", () => {
    let state = openPrep("prep-simul-withheld", (s) => {
      // A genuinely prep-playable card, so the "no card plays" half is not vacuous.
      s.players.p1.hand = ["artifact.legs_of_legion"];
    });
    expect(
      getLegalActions(state, "p1").some(
        (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "artifact.legs_of_legion"
      ),
      "the card IS a real prep play while no choice is open (the control's control)"
    ).toBe(true);

    state = openAttackerSearch(state);
    const offers = getLegalActions(state, "p1");
    expect(offers.length, "the defender is NOT frozen").toBeGreaterThan(0);
    for (const legal of offers) {
      expect(
        ["POPULATION_ACTION", "SPELL_BOOK_ACTION", "BUILD_STRUCTURE"].includes(legal.action.type),
        `only town shopping is offered while the foreign choice is open; got ${legal.action.type}`
      ).toBe(true);
    }
  });

  it("CONTROL: a participant who already ACCEPTED gets nothing while the foreign choice is open", () => {
    let state = openPrep("prep-simul-accepted");
    state = apply(state, { type: "ACCEPT_COMBAT", playerId: "p1" });
    state = openAttackerSearch(state);
    expect(getLegalActions(state, "p1")).toEqual([]);
  });

  it("CONTROL: outside the prep window the bystander rule is unchanged (a foreign choice offers [])", () => {
    // An ordinary map turn: p1 buys spells; p2 (no combat, no prep) is a plain
    // bystander of the open Search and keeps the pre-fix empty offer list.
    const { state } = pvpReady("prep-simul-map-control");
    const withTurn = { ...state, activePlayerId: "p1" as PlayerId };
    const spells = getLegalActions(withTurn, "p1").find(
      (legal) => legal.action.type === "SPELL_BOOK_ACTION" && !legal.action.wisdom && !legal.action.takeCastCard
    );
    expect(spells, "the map-turn spell buy exists").toBeTruthy();
    const searching = apply(withTurn, spells!.action);
    expect(searching.pendingChoice?.playerId).toBe("p1");
    expect(getLegalActions(searching, "p2")).toEqual([]);
  });
});

describe("PvP prep — dead offers the handlers always rejected are withheld", () => {
  it("Blacksmith: offered on a normal turn, WITHHELD in prep (its handler refuses any combat)", () => {
    const { state, p1Field } = pvpReady("prep-dead-blacksmith", (s) => {
      s.towns.town_p1.buildings = [...new Set([...s.towns.town_p1.buildings, "castle.blacksmith"])];
    });
    // CONTROL: on a normal turn the search offer exists.
    const normal = { ...state, activePlayerId: "p1" as PlayerId };
    expect(
      getLegalActions(normal, "p1").some((legal) => legal.action.type === "BLACKSMITH_ACTION"),
      "normal-turn Blacksmith offer exists"
    ).toBe(true);

    // In prep it is withheld — before the gate it was offered and every click
    // was rejected with "Town actions cannot interrupt a combat."
    const prep = apply(state, { type: "MOVE_HERO", playerId: "p2", heroId: "hero_p2", to: p1Field });
    expect(prep.combat?.prep).toBeTruthy();
    expect(getLegalActions(prep, "p1").some((legal) => legal.action.type === "BLACKSMITH_ACTION")).toBe(false);
  });

  it("Magic University: offered on a normal turn, WITHHELD in prep (same dead-offer class)", () => {
    const state = createAdventureGameState({
      startingBuildings: [],
      seed: "prep-dead-university",
      ruleset: "binh",
      difficulty: "normal",
      rollFirstPlayer: false,
      events: false,
      players: [
        { id: "p1", name: "A", factionId: "conflux", heroDefId: "luna" },
        { id: "p2", name: "B", factionId: "rampart", heroDefId: "gelu" }
      ]
    });
    for (const player of Object.values(state.players)) {
      player.canMulligan = false;
      player.needsHandRefresh = false;
    }
    state.towns.town_p1.buildings = [...new Set([...state.towns.town_p1.buildings, "conflux.magic_university"])];
    const p1Field = getMainHero(state, "p1")!.spaceId!;
    getMainHero(state, "p2")!.spaceId = "h:9:2";
    state.adventure!.lastVisitedField.hero_p1 = p1Field;
    state.adventure!.lastVisitedField.hero_p2 = "h:9:2";
    for (const hero of Object.values(state.heroes)) {
      hero.movementPoints = 5;
      hero.movementHaltedThisTurn = false;
    }

    // CONTROL: on the conflux player's own turn the dig is offered.
    state.activePlayerId = "p1";
    expect(
      getLegalActions(state, "p1").some((legal) => legal.action.type === "MAGIC_UNIVERSITY_ACTION"),
      "normal-turn University offer exists"
    ).toBe(true);

    // In prep it is withheld (the handler throws on ANY combat).
    state.activePlayerId = "p2";
    const prep = apply(state, { type: "MOVE_HERO", playerId: "p2", heroId: "hero_p2", to: p1Field });
    expect(prep.combat?.prep).toBeTruthy();
    expect(getLegalActions(prep, "p1").some((legal) => legal.action.type === "MAGIC_UNIVERSITY_ACTION")).toBe(false);
  });

  it("INVARIANT: every town-family action offered in prep — foreign choice open or not — applies cleanly", () => {
    const townFamily = new Set([
      "POPULATION_ACTION",
      "SPELL_BOOK_ACTION",
      "BUILD_STRUCTURE",
      "BLACKSMITH_ACTION",
      "MAGIC_UNIVERSITY_ACTION",
      "THIEVES_GUILD_ACTION",
      "USE_TOWN_BUILDING",
      "HIRE_SECONDARY_HERO"
    ]);
    const sweep = (state: GameState, label: string) => {
      let checked = 0;
      for (const legal of getLegalActions(state, "p1")) {
        if (!townFamily.has(legal.action.type)) continue;
        const result = applyAction(state, legal.action);
        expect(
          result.errors,
          `${label}: "${legal.label}" must apply cleanly — ` + result.errors.map((error) => error.message).join("; ")
        ).toEqual([]);
        checked += 1;
      }
      return checked;
    };

    let state = openPrep("prep-dead-sweep", (s) => {
      s.towns.town_p1.buildings = [...new Set([...s.towns.town_p1.buildings, "castle.blacksmith"])];
    });
    expect(sweep(state, "plain prep"), "the plain prep window offers real shopping").toBeGreaterThan(3);
    state = openAttackerSearch(state);
    expect(sweep(state, "prep + foreign choice"), "the foreign-choice window offers real shopping").toBeGreaterThan(3);
  });
});
