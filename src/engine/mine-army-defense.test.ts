/**
 * Global house rule `mine-army-defense` (default OFF in BOTH modes).
 *
 * When ON, an enemy Hero walking onto YOUR already-flagged Mine no longer
 * re-flags it for free — YOU (the owner) get the settlement-style defense
 * window: pay 3 gold and defend with your UNITS **and your CARDS** (only your
 * Hero is missing), or let it fall (the flag hands over exactly like today's
 * walk-in). Winning the defense keeps the Mine; declining or losing flags it for
 * the attacker.
 *
 * The cards half is ONE flag — `CombatContext.garrisonCardsAllowed`, derived in
 * `startPlayerCombat` from `garrisonDefenseKeepsCards` and read at the single
 * hand-lock seam `isHandLockedInCombat` (which every legal-action offer AND
 * every reducer backstop consults). Pinned twice below: the WIRING (a real
 * walk-in stamps the flag and unlocks the owner's hand) and the EFFECT (a
 * heroless Mine defender really plays a Deck card in the fight and it changes
 * the outcome), each with a CONTROL that diverges.
 *
 * Deliberate limits pinned here: a Mine with a LIVE neutral guard still fights
 * the guard first (the guard fight takes precedence in resolveHeroArrival); a
 * broke owner (< 3 gold) is never asked; a self-owned / neutral-flagged Mine
 * opens nothing; NON-mine holdings (Settlement) keep their own 8-gold cost AND
 * their units-only hand lock (the cards waiver never bleeds). A View Earth
 * remote capture is NOT intercepted (a separate code path). HERO-scoped effects
 * stay off for every heroless defense (no Tactics, no Retreat/Surrender, no
 * commander / equipment / hero grades) — the hero really is away.
 *
 * Every ON claim carries a rule-OFF or wrong-owner CONTROL that diverges, so
 * each fails if the wiring (`garrisonDefenderFor` mine arm / `garrisonDefenseCost`
 * mine=3 / `garrisonDefenseKeepsCards`) is removed. The win/loss flag OUTCOMES
 * ride the SAME generic `finalizeAdventureCombat` + `beginFieldVisit` seam a
 * town/settlement garrison uses (see pvp-siege-victory.test.ts for the generic
 * siege mechanics); here we pin the mine-specific flag transfer through that seam.
 */
import { describe, expect, it } from "vitest";
import {
  applyAction,
  createAdventureGameState,
  createInitialGameState,
  getMainHero,
  hexNeighbors,
  hexSpaceId,
  parseHexSpaceId
} from "./index";
import { finalizeAdventureCombat, giveUpCombat, isHerolessMineDefender } from "./adventure-reducer";
import { isHandLockedInCombat } from "./legal-actions";
import { ATTACK_DIE_FACES } from "./battlefield";
import { NEUTRAL_PLAYER_ID } from "./state";
import type {
  CombatState,
  CombatUnitState,
  GameAction,
  GameState,
  HouseRuleId,
  LegalAction,
  MapFieldState,
  PlayerId
} from "./state";

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

/** A BINH adventure with the given house-rule overrides frozen in, p1's turn ready. */
function game(houseRules: Partial<Record<HouseRuleId, boolean>>, seed = "mine-defense", withThirdPlayer = false): GameState {
  const state = createAdventureGameState({
    seed,
    ruleset: "binh",
    difficulty: "normal",
    rollFirstPlayer: false,
    events: false,
    houseRules,
    players: [
      { id: "p1", name: "A", factionId: "castle", heroDefId: "catherine" },
      { id: "p2", name: "B", factionId: "rampart", heroDefId: "gelu" },
      ...(withThirdPlayer ? [{ id: "p3", name: "C", factionId: "dungeon" as const, heroDefId: "alamar" }] : []),
    ]
  });
  for (const player of Object.values(state.players)) {
    player.canMulligan = false;
    player.needsHandRefresh = false;
  }
  state.activePlayerId = "p1";
  state.pendingChoice = null;
  state.reactionWindow = null;
  const hero = getMainHero(state, "p1")!;
  hero.movementPoints = 6;
  hero.movementHaltedThisTurn = false;
  return state;
}

/**
 * Rewrite an EXISTING adjacent field of hero_p1 into the given location, ready
 * to be walked onto. Returns its space id. Different neighbours per call.
 */
const used = new WeakMap<GameState, Set<string>>();
function paintNextTo(
  state: GameState,
  location: string,
  extra: Partial<MapFieldState> = {}
): string {
  const hero = getMainHero(state, "p1")!;
  const coord = parseHexSpaceId(hero.spaceId ?? "");
  if (!coord) throw new Error("hero_p1 is not on the map");
  const seen = used.get(state) ?? new Set<string>();
  used.set(state, seen);
  const field = hexNeighbors(coord)
    .map((neighbor) => state.adventure!.fields[hexSpaceId(neighbor)])
    .find((candidate) => candidate && candidate.location !== "town" && !seen.has(candidate.spaceId));
  if (!field) throw new Error("no free adjacent field for hero_p1");
  seen.add(field.spaceId);
  field.location = location;
  field.difficulty = undefined;
  field.flagOwnerId = null;
  field.blackCube = false;
  field.everFlagged = false;
  field.settlementResource = null;
  delete field.bankId;
  Object.assign(field, extra);
  return field.spaceId;
}

function moveOnto(state: GameState, to: string): GameState {
  return apply(state, { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to });
}

// ===========================================================================
// Walk-in interception (real MOVE_HERO end to end)
// ===========================================================================

describe("mine-army-defense — walk-in interception", () => {
  it("OFF: an enemy walk-in re-flags the Mine for FREE with NO prompt (CONTROL — byte-identical)", () => {
    const state = game({ "mine-army-defense": false });
    state.players.p2.resources.gold = 20; // p2 could pay if asked — proving it is the rule, not gold
    const mine = paintNextTo(state, "mine", { resource: "gold", amount: 2, flagOwnerId: "p2", everFlagged: true });

    const next = moveOnto(state, mine);

    expect(next.pendingChoice, "no defense prompt with the rule off").toBeNull();
    expect(next.adventure!.fields[mine].flagOwnerId, "the walk-in re-flagged it for free").toBe("p1");
  });

  it("ON: an enemy walk-in opens the 3-gold ARMY-AND-CARDS defense prompt for the OWNER", () => {
    const state = game({ "mine-army-defense": true });
    state.players.p2.resources.gold = 5;
    const mine = paintNextTo(state, "mine", { resource: "gold", amount: 2, flagOwnerId: "p2", everFlagged: true });

    const next = moveOnto(state, mine);

    const choice = next.pendingChoice;
    if (choice?.type !== "OPTION_CHOICE") throw new Error("expected the mine defense OPTION_CHOICE");
    expect(choice.context).toBe("garrison");
    expect(choice.playerId, "the MINE OWNER decides").toBe("p2");
    expect(choice.prompt).toMatch(/mine/i);
    expect(choice.prompt).toMatch(/3 gold/);
    // The prompt promises the cards (same predicate the combat context is
    // stamped from), and never the old "no cards".
    expect(choice.prompt).toMatch(/units and your cards/i);
    expect(choice.prompt).not.toMatch(/no cards/i);
    expect(next.adventure!.pendingGarrison?.goldCost, "a mine is a 3-gold holding, not 8").toBe(3);
    expect(next.adventure!.pendingGarrison?.defenderPlayerId).toBe("p2");
    // The Mine has NOT changed hands yet — it awaits the decision.
    expect(next.adventure!.fields[mine].flagOwnerId).toBe("p2");
  });

  it('ON + decline ("Let it fall"): the flag hands to the attacker exactly like the rule-off walk-in', () => {
    let state = game({ "mine-army-defense": true }, "mine-decline");
    state.players.p2.resources.gold = 5;
    const p2GoldBefore = state.players.p2.resources.gold;
    const mine = paintNextTo(state, "mine", { resource: "gold", amount: 2, flagOwnerId: "p2", everFlagged: true });

    state = moveOnto(state, mine);
    state = apply(state, {
      type: "CHOOSE_OPTION",
      playerId: "p2",
      choiceId: state.pendingChoice!.id,
      optionIndex: 1
    });

    expect(state.adventure!.fields[mine].flagOwnerId, "declining hands the flag to the attacker").toBe("p1");
    expect(state.players.p2.resources.gold, "declining costs the owner NOTHING").toBe(p2GoldBefore);
    expect(state.combat, "no combat on a decline").toBeNull();
  });

  it("ON + pay: EXACTLY 3 gold is spent and a HEROLESS defense combat opens that KEEPS the owner's cards", () => {
    let state = game({ "mine-army-defense": true }, "mine-pay");
    state.players.p2.resources.gold = 10;
    const mine = paintNextTo(state, "mine", { resource: "gold", amount: 2, flagOwnerId: "p2", everFlagged: true });

    state = moveOnto(state, mine);
    const goldBefore = state.players.p2.resources.gold;
    state = apply(state, {
      type: "CHOOSE_OPTION",
      playerId: "p2",
      choiceId: state.pendingChoice!.id,
      optionIndex: 0
    });

    expect(state.players.p2.resources.gold, "paying spends exactly 3 gold").toBe(goldBefore - 3);
    expect(state.combat?.context.kind).toBe("player");
    // Heroless defense — the owner's hero really is away (so no Tactics, no
    // Retreat/Surrender, no commander/equipment/hero-grade effects)…
    expect(state.combat?.context.kind === "player" && state.combat.context.defenderHeroId).toBeNull();
    expect(state.combat?.context.kind === "player" && state.combat.context.fieldId).toBe(mine);
    // …but the Mine defense KEEPS the owner's cards: the context flag is stamped
    // and the single hand-lock seam every card gate reads is OPEN for them.
    expect(state.combat?.context.kind === "player" && state.combat.context.garrisonCardsAllowed).toBe(true);
    expect(isHandLockedInCombat(state, "p2"), "the Mine owner may play cards").toBe(false);
    expect(isHandLockedInCombat(state, "p1"), "the attacking main hero is unlocked as always").toBe(false);
  });

  it("ON: a flagged SETTLEMENT defense stays UNITS-ONLY — the cards waiver never bleeds (CONTROL)", () => {
    let state = game({ "mine-army-defense": true }, "mine-settlement-cards");
    state.players.p2.resources.gold = 12;
    const settlement = paintNextTo(state, "settlement", {
      flagOwnerId: "p2",
      everFlagged: true,
      settlementResource: "gold"
    });

    state = moveOnto(state, settlement);
    expect(state.pendingChoice?.type === "OPTION_CHOICE" ? state.pendingChoice.prompt : "").toMatch(/no cards/i);
    state = apply(state, {
      type: "CHOOSE_OPTION",
      playerId: "p2",
      choiceId: state.pendingChoice!.id,
      optionIndex: 0
    });

    expect(state.combat?.context.kind === "player" && state.combat.context.defenderHeroId).toBeNull();
    expect(
      state.combat?.context.kind === "player" && state.combat.context.garrisonCardsAllowed,
      "no cards waiver on a settlement garrison"
    ).toBeUndefined();
    expect(isHandLockedInCombat(state, "p2"), "a settlement garrison still cannot use its Deck").toBe(true);
  });

  it("ON but BROKE owner (< 3 gold): the Mine falls undefended with NO prompt (CONTROL)", () => {
    const state = game({ "mine-army-defense": true }, "mine-broke");
    state.players.p2.resources.gold = 2;
    const mine = paintNextTo(state, "mine", { resource: "gold", amount: 2, flagOwnerId: "p2", everFlagged: true });

    const next = moveOnto(state, mine);

    expect(next.pendingChoice, "a broke owner is never asked").toBeNull();
    expect(next.adventure!.fields[mine].flagOwnerId, "the mine falls to the attacker").toBe("p1");
  });

  it("ON: a Mine flagged by the WALKER themselves opens nothing (no self-defense)", () => {
    const state = game({ "mine-army-defense": true }, "mine-self");
    const mine = paintNextTo(state, "mine", { resource: "gold", amount: 2, flagOwnerId: "p1", everFlagged: true });
    const flagsBefore = state.eventLog.filter((event) => event.type === "FIELD_FLAGGED").length;

    const next = moveOnto(state, mine);

    expect(next.pendingChoice, "walking your OWN mine opens nothing").toBeNull();
    expect(next.adventure!.fields[mine].flagOwnerId).toBe("p1");
    expect(
      next.eventLog.filter((event) => event.type === "FIELD_FLAGGED").length,
      "no re-flag spam on your own mine"
    ).toBe(flagsBefore);
  });

  it("ON: a NEUTRAL-flagged Mine is ordinary expansion — no prompt, free flag (CONTROL)", () => {
    const state = game({ "mine-army-defense": true }, "mine-neutral");
    const mine = paintNextTo(state, "mine", { resource: "gold", amount: 2, flagOwnerId: NEUTRAL_PLAYER_ID, everFlagged: true });

    const next = moveOnto(state, mine);

    expect(next.pendingChoice, "a neutral-held mine is not defended").toBeNull();
    expect(next.adventure!.fields[mine].flagOwnerId).toBe("p1");
  });

  it("ON: a Mine with a LIVE neutral GUARD fights the guard first (the rule never reaches an unflagged, guarded mine) (CONTROL)", () => {
    const state = game({ "mine-army-defense": true }, "mine-guarded");
    // A re-guarded / unflagged mine: difficulty set, everFlagged false, no owner.
    const mine = paintNextTo(state, "mine", { resource: "gold", amount: 2, difficulty: 2 });
    getMainHero(state, "p1")!.level = 1; // below the field → a real fight, not Quick Combat

    const next = moveOnto(state, mine);

    // The guard fight opens (neutral combat), NOT the owner defense prompt.
    expect(next.combat?.context.kind, "a live guard fights").toBe("neutral");
    expect(next.pendingChoice?.type === "OPTION_CHOICE" ? next.pendingChoice.context : null).not.toBe("garrison");
  });

  it("ON: a NON-mine holding (flagged Settlement) keeps its own 8-gold cost — the mine rule does not bleed (CONTROL)", () => {
    const state = game({ "mine-army-defense": true }, "mine-settlement");
    state.players.p2.resources.gold = 12;
    const settlement = paintNextTo(state, "settlement", {
      flagOwnerId: "p2",
      everFlagged: true,
      settlementResource: "gold"
    });

    const next = moveOnto(state, settlement);

    expect(next.pendingChoice?.type === "OPTION_CHOICE" ? next.pendingChoice.context : null).toBe("garrison");
    expect(next.adventure!.pendingGarrison?.goldCost, "a settlement is still 8 gold").toBe(8);
  });

  it("ON: assaulting a flagged Mine STOPS parallel turns (PvP interaction)", () => {
    const state = createAdventureGameState({
      seed: "mine-parallel",
      ruleset: "binh",
      difficulty: "normal",
      rollFirstPlayer: false,
      events: false,
      parallelTurns: 3,
      houseRules: { "mine-army-defense": true },
      players: [
        { id: "p1", name: "A", factionId: "castle", heroDefId: "catherine" },
        { id: "p2", name: "B", factionId: "rampart", heroDefId: "gelu" }
      ]
    });
    for (const player of Object.values(state.players)) {
      player.canMulligan = false;
      player.needsHandRefresh = false;
    }
    state.activePlayerId = "p1";
    const hero = getMainHero(state, "p1")!;
    hero.movementPoints = 6;
    hero.movementHaltedThisTurn = false;
    state.players.p2.resources.gold = 5;
    expect(state.turn.mode).toBe("parallel");
    const mine = paintNextTo(state, "mine", { resource: "gold", amount: 2, flagOwnerId: "p2", everFlagged: true });

    const next = moveOnto(state, mine);

    // The mode collapses (assaulting a live player's holding is PvP), and the
    // owner's defense prompt is still opened on top of that.
    expect(next.turn.mode).toBe("ordered");
    expect(next.turn.parallelStopped?.reason).toBe("pvp-battle");
    expect(next.pendingChoice?.type === "OPTION_CHOICE" ? next.pendingChoice.context : null).toBe("garrison");
  });
});

// ===========================================================================
// Defense OUTCOME — win keeps the Mine, loss/repel flags it (finalize seam)
// ===========================================================================

/** A basic combat unit fixture (mirrors pvp-siege-victory.test.ts). */
function unit(over: Partial<CombatUnitState> & { id: string; controllerId: PlayerId }): CombatUnitState {
  return {
    name: "Pikemen",
    cardName: "Few Pikemen",
    variant: "few",
    grade: "bronze",
    type: "ground",
    attack: 1,
    defense: 1,
    maxHealth: 2,
    damage: 0,
    initiative: 1,
    position: 0,
    activatedThisRound: false,
    movedThisActivation: false,
    retaliatedThisRound: false,
    defenseToken: false,
    abilities: [],
    unitDefId: "castle.pikemen",
    armyUnitId: over.id,
    assets: { cardImage: "", imageAlt: "" },
    ...over
  } as CombatUnitState;
}

/**
 * Stage a FINISHED mine defense: p1 (attacker) has assaulted p2's flagged Mine
 * (heroless army-only defense), with the given winner. Returns [state, mineId].
 * Mirrors pvp-siege-victory.test.ts — a hand-built combat driven through the
 * real `finalizeAdventureCombat` so the flag OUTCOME rides the production seam.
 */
function stageMineDefense(attackerWins: boolean, seed: string): [GameState, string] {
  // Exercise the post-battle field visit without ending Conquest on this win.
  const state = game({ "mine-army-defense": true }, seed, true);
  const attacker = getMainHero(state, "p1")!;
  const mineId = "40,40";
  const mine: MapFieldState = {
    spaceId: mineId,
    tileInstanceId: "t",
    slot: 0,
    location: "mine",
    difficulty: undefined,
    blackCube: false,
    flagOwnerId: "p2",
    everFlagged: true,
    settlementResource: null,
    resource: "gold",
    amount: 2
  } as MapFieldState;
  state.adventure!.fields[mineId] = mine;
  attacker.spaceId = mineId;
  // Reflect the mine income the owner currently earns, so the transfer shows.
  state.players.p1.production.gold = 0;
  state.players.p2.production.gold = 2;
  state.players.p1.army = [{ id: "a1", unitDefId: "castle.pikemen", side: "few" }];
  state.players.p2.army = [{ id: "b1", unitDefId: "castle.pikemen", side: "few" }];

  const winnerId: PlayerId = attackerWins ? "p1" : "p2";
  const loserId: PlayerId = attackerWins ? "p2" : "p1";
  state.combat = {
    id: "mine-defense",
    round: 1,
    attackerPlayerId: "p1",
    defenderPlayerId: "p2",
    activeUnitId: null,
    context: {
      kind: "player",
      attackerHeroId: attacker.id,
      defenderHeroId: null, // heroless army-only defense
      fieldId: mineId
    },
    setup: null,
    awaitingContinue: false,
    outcome: { winnerPlayerId: winnerId, defeatedPlayerId: loserId, reason: "all-enemy-units-defeated" },
    dice: { faces: [...ATTACK_DIE_FACES], seed: "s", rollCount: 0 },
    units: {
      a1: unit({ id: "a1", controllerId: "p1", ...(attackerWins ? {} : { damage: 2, maxHealth: 2 }) }),
      b1: unit({ id: "b1", controllerId: "p2", ...(attackerWins ? { damage: 2, maxHealth: 2 } : {}) })
    }
  } as CombatState;
  return [state, mineId];
}

describe("mine-army-defense — defense outcome (finalizeAdventureCombat seam)", () => {
  it("defender WIN (attacker repelled): the Mine STAYS with the owner + income unchanged", () => {
    const [state, mineId] = stageMineDefense(false, "mine-repel");

    finalizeAdventureCombat(state);

    expect(state.adventure!.fields[mineId].flagOwnerId, "the owner keeps the mine").toBe("p2");
    expect(state.players.p2.production.gold, "income unchanged").toBe(2);
    expect(state.players.p1.production.gold, "attacker gained no income").toBe(0);
    // The beaten attacker is sent home (not left standing on the mine).
    expect(state.heroes.hero_p1.spaceId).not.toBe(mineId);
  });

  it("attacker WIN: the Mine is flagged for the attacker + income transfers (via beginFieldVisit's mine branch)", () => {
    const [state, mineId] = stageMineDefense(true, "mine-taken");

    finalizeAdventureCombat(state);

    expect(state.adventure!.fields[mineId].flagOwnerId, "the attacker takes the mine").toBe("p1");
    expect(state.players.p2.production.gold, "former owner loses the income").toBe(0);
    expect(state.players.p1.production.gold, "attacker gains the income").toBe(2);
  });
});

// ===========================================================================
// The CARDS half — a heroless Mine defender really PLAYS a Deck card
// ===========================================================================

/**
 * A guaranteed-lethal p1 attack on p2's Skeletons inside a HEROLESS p2 defense
 * (`defenderHeroId: null`, p2 = the Mine owner), with the Resurrection spell in
 * p2's hand. `cardsAllowed` sets the Mine-defense context flag; leaving it off is
 * the CONTROL (every other garrison defense — town / settlement / Utopia / Grail
 * / designer Garrison — and the pre-feature behaviour of a Mine defense).
 *
 * Mirrors the harness in lethal-save-sources.test.ts: the Resurrection SPELL is a
 * Deck card, so it is offered only when the hand is unlocked. The observable
 * outcome is the unit SURVIVING the killing blow, not merely an offer appearing.
 */
function lethalHitOnHerolessDefender(cardsAllowed: boolean): GameState {
  const state = createInitialGameState(`mine-cards-${cardsAllowed}`);
  state.players.p1.hand = [];
  state.players.p2.hand = ["spell.resurrection"];
  state.combat!.context = {
    kind: "player",
    attackerHeroId: "hero_p1",
    defenderHeroId: null, // the Mine owner's hero is away
    fieldId: "40,40",
    ...(cardsAllowed ? { garrisonCardsAllowed: true as const } : {})
  };

  const defender = state.combat!.units.unit_p2_skeletons;
  defender.grade = "bronze"; // a Power-0 Resurrection reaches bronze
  defender.position = 9;
  defender.defense = 0;
  defender.damage = defender.maxHealth - 1; // one hit from death

  const attacker = state.combat!.units.unit_p1_griffins;
  attacker.abilities = [];
  attacker.attack = 5; // clearly lethal
  attacker.position = 13; // adjacent below the defender
  state.combat!.dice.scriptedRolls = [0];
  state.combat!.dice.rollCount = 0;
  state.activePlayerId = "p1";
  state.combat!.activeUnitId = "unit_p1_griffins";

  return apply(state, {
    type: "ATTACK_UNIT",
    playerId: "p1",
    attackerId: "unit_p1_griffins",
    defenderId: "unit_p2_skeletons"
  });
}

const p2Saves = (state: GameState): LegalAction[] => state.reactionWindow?.legalReactions.p2 ?? [];

describe("mine-army-defense — the CARDS half (isHandLockedInCombat seam)", () => {
  it("a heroless Mine defender is OFFERED a Deck card and it really saves the unit", () => {
    const declared = lethalHitOnHerolessDefender(true);
    expect(declared.reactionWindow?.triggerEvent.type).toBe("UNIT_LETHAL_HIT");

    const save = p2Saves(declared).find(
      (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === "spell.resurrection"
    );
    expect(save, "the Mine owner's Resurrection must be offered").toBeTruthy();

    const saved = apply(declared, save!.action);
    const skeletons = saved.combat!.units.unit_p2_skeletons;
    // The OBSERVABLE outcome: the killing blow was cancelled — the Pack is still
    // standing on its own side, still one hit from death, never flipped to Few.
    expect(skeletons.variant, "the Pack never took the killing blow").toBe("pack");
    expect(skeletons.damage, "the lethal hit was undone").toBe(skeletons.maxHealth - 1);
    expect(saved.players.p2.hand, "the card was spent").not.toContain("spell.resurrection");
  });

  it("the SAME heroless defense WITHOUT the Mine flag offers no Deck card and the unit falls (CONTROL)", () => {
    const declared = lethalHitOnHerolessDefender(false);

    expect(
      p2Saves(declared).some((legal) => legal.action.type === "PLAY_REACTION"),
      "a units-only garrison defense cannot use its Deck"
    ).toBe(false);
    // With no save available the engine does not even pause — the blow lands and
    // the Pack flips to its Few side (the exact divergence the flag buys).
    expect(declared.combat!.units.unit_p2_skeletons.variant, "the Pack took the killing blow").toBe("few");
  });
});

// ===========================================================================
// Retreat (concede) — the heroless Mine defender may end the fight early
// ===========================================================================

describe("mine-army-defense — Retreat from a heroless Mine defense", () => {
  it("the Mine owner IS the heroless-mine defender; nobody else is", () => {
    const declared = lethalHitOnHerolessDefender(true);
    expect(isHerolessMineDefender(declared, "p2"), "the Mine owner").toBe(true);
    expect(isHerolessMineDefender(declared, "p1"), "the attacker has a hero").toBe(false);
    // CONTROL: the SAME heroless defense without the Mine flag — a plain
    // units-only garrison, which may NOT concede.
    expect(isHerolessMineDefender(lethalHitOnHerolessDefender(false), "p2")).toBe(false);
  });

  it("conceding ends the fight as the owner's loss — fallen so far lost, survivors kept, NO hero moved", () => {
    const state = lethalHitOnHerolessDefender(true);
    state.reactionWindow = null;
    // A second p2 unit that has taken NO damage — it must survive the concede.
    expect(state.combat!.units.unit_p2_vampires.damage).toBe(0);
    const heroWas = state.heroes.hero_p2.spaceId;

    giveUpCombat(state, { type: "GIVE_UP_COMBAT", playerId: "p2" });

    expect(state.combat?.outcome?.reason).toBe("give-up");
    expect(state.combat?.outcome?.defeatedPlayerId, "the Mine owner loses").toBe("p2");
    expect(state.combat?.outcome?.winnerPlayerId, "the attacker takes the field").toBe("p1");
    // Only the casualties taken so far are lost — an undamaged unit is NOT forfeited.
    expect(state.combat!.units.unit_p2_vampires.damage).toBe(0);
    // No hero is in this fight, so none is sent home.
    expect(state.heroes.hero_p2.spaceId, "the owner's hero never moves").toBe(heroWas);
  });

  it("CONTROL: the SAME heroless defense without the Mine flag cannot concede at all", () => {
    const state = lethalHitOnHerolessDefender(false);
    state.reactionWindow = null;

    expect(() => giveUpCombat(state, { type: "GIVE_UP_COMBAT", playerId: "p2" })).toThrow(
      /hero must be present/i
    );
    expect(state.combat?.outcome, "the fight is still on").toBeFalsy();
  });
});
