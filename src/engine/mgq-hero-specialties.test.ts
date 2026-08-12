import { describe, expect, it } from "vitest";
import { cardLibrary } from "@/data/cards/library";
import {
  applyAction,
  createAdventureGameState,
  createInitialGameState,
  getLegalActions,
  NEUTRAL_DECK_IDS
} from "./index";
import { activeSpellPowerBonus, specialtyImmunityActive } from "./active-effects";
import { getMainHero, makeCombatUnitFromArmy } from "./adventure";
import { applyMgqHeroCombatStart } from "./mgq-hero-specialties";
import { NEUTRAL_PLAYER_ID } from "./state";
import type { GameAction, GameEvent, GameState } from "./state";

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function settle(state: GameState): GameState {
  let current = state;
  for (let guard = 0; guard < 40 && current.reactionWindow; guard += 1) {
    current = applyOk(current, {
      type: "PASS_REACTION",
      playerId: current.reactionWindow.priorityPlayerId
    });
  }
  return current;
}

function attackBonus(state: GameState, attackerId: string): number | undefined {
  return [...state.eventLog]
    .reverse()
    .find(
      (event): event is Extract<GameEvent, { type: "ATTACK_ROLLED" }> =>
        event.type === "ATTACK_ROLLED" && event.attackerId === attackerId
    )?.attackBonus;
}

function duel(seed: string, cardId: string, unitDefId?: string): GameState {
  const state = createInitialGameState(seed);
  state.players.p1.hand = [cardId];
  state.players.p2.hand = [];
  state.combat!.dice.scriptedRolls = Array.from({ length: 20 }, () => 0);
  const attacker = unitDefId
    ? makeCombatUnitFromArmy({ id: "army_signature", unitDefId, side: "few" }, "p1", "signature", 9, state.ruleset)
    : state.combat!.units.unit_p1_marksmen;
  expect(attacker).toBeTruthy();
  attacker!.position = 9;
  attacker!.attack = 0;
  attacker!.defense = 0;
  // Isolate the specialty delta from MGQ's default Warrior Job (+1 on attacks).
  attacker!.abilities = [];
  attacker!.maxHealth = 40;
  attacker!.damage = 0;
  attacker!.activatedThisRound = false;
  attacker!.attackedThisActivation = false;
  const defender = state.combat!.units.unit_p2_skeletons;
  defender.position = 10;
  defender.attack = 0;
  defender.defense = 0;
  defender.maxHealth = 40;
  defender.damage = 0;
  state.combat!.units = { [attacker!.id]: attacker!, [defender.id]: defender };
  state.combat!.activeUnitId = attacker!.id;
  state.activePlayerId = "p1";
  return state;
}

function declare(state: GameState): GameState {
  const units = Object.values(state.combat!.units);
  const attacker = units.find((unit) => unit.controllerId === "p1")!;
  const defender = units.find((unit) => unit.controllerId === "p2")!;
  return applyOk(state, {
    type: "ATTACK_UNIT",
    playerId: "p1",
    attackerId: attacker.id,
    defenderId: defender.id
  });
}

function mapState(seed: string, heroDefId: string): GameState {
  const state = createAdventureGameState({
    seed,
    rollFirstPlayer: false,
    players: [
      { id: "p1", name: heroDefId, factionId: "mgq", heroDefId },
      { id: "p2", name: "Catherine", factionId: "castle", heroDefId: "catherine" }
    ]
  });
  for (const player of Object.values(state.players)) {
    player.canMulligan = false;
    player.needsHandRefresh = false;
  }
  state.activePlayerId = "p1";
  state.pendingChoice = null;
  state.players.p1.mgqGoldContracts = ["mgq.carmilla", "mgq.giga"];
  state.players.p1.mgqGoldContractSetupRequired = false;
  state.reactionWindow = null;
  return state;
}

describe("MGQ hero specialties — Luka", () => {
  it("I suppresses the retaliation for exactly the reacted-to strike", () => {
    let state = declare(duel("mgq-luka-i", "specialty.luka.1"));
    const reaction = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === "specialty.luka.1"
    );
    expect(reaction).toBeTruthy();
    state = settle(applyOk(state, reaction!.action));
    expect(
      state.eventLog.some(
        (event) => event.type === "UNIT_ATTACK_DECLARED" && event.isRetaliation
      )
    ).toBe(false);
  });

  it("IV doubles for Hild and the Four Spirits, but not a normal unit", () => {
    const run = (seed: string, unitDefId?: string) => {
      let state = declare(duel(seed, "specialty.luka.4", unitDefId));
      const reaction = getLegalActions(state, "p1").find(
        (legal) =>
          legal.action.type === "PLAY_REACTION" &&
          legal.action.cardId === "specialty.luka.4" &&
          legal.action.optionIndex === 0
      );
      state = settle(applyOk(state, reaction!.action));
      return attackBonus(state, unitDefId ? "signature" : "unit_p1_marksmen");
    };
    expect(run("mgq-luka-hild", "mgq.hild")).toBe(2);
    expect(run("mgq-luka-spirit", "mgq.spirit_sylph")).toBe(2);
    expect(run("mgq-luka-control")).toBe(1);
  });

  it("VI deals 2 to every unit in the selected five-cell line and spares the next column", () => {
    const state = createInitialGameState("mgq-luka-vi");
    state.players.p1.hand = ["specialty.luka.6"];
    state.players.p2.hand = [];
    const units = state.combat!.units;
    units.unit_p1_marksmen.position = 1;
    units.unit_p1_griffins.position = 5;
    units.unit_p2_skeletons.position = 13;
    units.unit_p2_vampires.position = 2;
    for (const unit of Object.values(units)) {
      unit.maxHealth = 20;
      unit.damage = 0;
    }
    const play = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "PLAY_CARD" &&
        legal.action.cardId === "specialty.luka.6" &&
        legal.action.target?.type === "space" &&
        legal.action.target.position === 1
    );
    const after = applyOk(state, play!.action);
    expect(after.combat!.units.unit_p1_marksmen.damage).toBe(2);
    expect(after.combat!.units.unit_p1_griffins.damage).toBe(2);
    expect(after.combat!.units.unit_p2_skeletons.damage).toBe(2);
    expect(after.combat!.units.unit_p2_vampires.damage).toBe(0);
  });
});

describe("MGQ hero specialties — Alice", () => {
  it("I deals 1 effect damage to the selected unit", () => {
    const state = createInitialGameState("mgq-alice-i");
    state.players.p1.hand = ["specialty.alice.1"];
    state.players.p2.hand = [];
    const play = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "specialty.alice.1" &&
        legal.action.target?.type === "unit" && legal.action.target.unitId === "unit_p2_skeletons"
    );
    const after = applyOk(state, play!.action);
    expect(after.combat!.units.unit_p2_skeletons.damage).toBe(1);
  });

  it("IV really Searches one card from the chosen shared deck", () => {
    let state = mapState("mgq-alice-iv", "alice");
    state.players.p1.hand = ["specialty.alice.4"];
    state.decks.abilities.drawPile = ["ability.offense", "ability.archery"];
    state.decks.abilities.discardPile = [];
    const play = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "PLAY_CARD" &&
        legal.action.cardId === "specialty.alice.4" &&
        legal.action.optionIndex === 0
    );
    state = applyOk(state, play!.action);
    expect(state.pendingChoice?.type).toBe("DECK_SEARCH");
    expect(state.pendingChoice?.type === "DECK_SEARCH" && state.pendingChoice.deckId).toBe("abilities");
    const take = getLegalActions(state, "p1").find((legal) => legal.action.type === "RESOLVE_DECK_SEARCH");
    state = applyOk(state, take!.action);
    expect(state.players.p1.hand.some((id) => id === "ability.offense" || id === "ability.archery")).toBe(true);
    const options = cardLibrary["specialty.alice.4"].effect;
    expect(options.type === "CHOOSE_ONE" ? options.options.length : 0).toBe(3);

    const combat = createInitialGameState("mgq-alice-iv-instant");
    combat.players.p1.hand = ["specialty.alice.4"];
    combat.activePlayerId = "p2";
    combat.combat!.activeUnitId = "unit_p2_skeletons";
    const instant = getLegalActions(combat, "p1").find(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "specialty.alice.4" && legal.action.optionIndex === 0
    );
    expect(instant).toBeTruthy();
  });

  it("VI gives one enemy -2 Attack for the whole Combat", () => {
    let state = createInitialGameState("mgq-alice-vi");
    state.players.p1.hand = ["specialty.alice.6"];
    const play = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "specialty.alice.6" &&
        legal.action.target?.type === "unit" && legal.action.target.unitId === "unit_p2_skeletons"
    );
    state = applyOk(state, play!.action);
    const effect = state.activeEffects.find((entry) => entry.target?.type === "unit" && entry.target.unitId === "unit_p2_skeletons");
    expect(effect?.duration).toEqual({ type: "combat" });
    expect(effect?.modifiers).toContainEqual({ type: "ATTACK_BONUS", amount: -2 });
  });
});

describe("MGQ hero specialties — Ilias, Granberia and Promestein", () => {
  it("Ilias scorches every neutral for 1 at combat start and her Cure clone heals and draws", () => {
    const state = createInitialGameState("mgq-ilias");
    state.players.p1.heroDefId = "ilias";
    state.heroes.hero_p1.heroDefId = "ilias";
    state.combat!.context = { kind: "neutral", heroId: "hero_p1", fieldId: "field_center", difficulty: 1, hasAzure: false };
    state.combat!.defenderPlayerId = NEUTRAL_PLAYER_ID;
    for (const unit of Object.values(state.combat!.units)) {
      unit.controllerId = unit.controllerId === "p2" ? NEUTRAL_PLAYER_ID : unit.controllerId;
      unit.maxHealth = 20;
      unit.damage = 0;
    }
    applyMgqHeroCombatStart(state);
    expect(Object.values(state.combat!.units).filter((unit) => unit.controllerId === NEUTRAL_PLAYER_ID).every((unit) => unit.damage === 1)).toBe(true);
    expect(Object.values(state.combat!.units).filter((unit) => unit.controllerId === "p1").every((unit) => unit.damage === 0)).toBe(true);

    const medic = createInitialGameState("mgq-ilias-cure");
    medic.players.p1.hand = ["specialty.ilias.1"];
    medic.players.p1.deck = ["stat.attack"];
    medic.combat!.units.unit_p1_griffins.damage = 2;
    const heal = getLegalActions(medic, "p1").find(
      (legal) =>
        legal.action.type === "PLAY_CARD" &&
        legal.action.cardId === "specialty.ilias.1" &&
        legal.action.target?.type === "unit" &&
        legal.action.target.unitId === "unit_p1_griffins"
    );
    const healed = applyOk(medic, heal!.action);
    expect(healed.combat!.units.unit_p1_griffins.damage).toBe(1);
    expect(healed.players.p1.hand).toContain("stat.attack");
  });

  it("Ilias IV draws, then blocks all Specialty effects on the selected unit", () => {
    let state = createInitialGameState("mgq-ilias-immunity");
    state.players.p1.hand = ["specialty.ilias.4"];
    state.players.p1.deck = ["stat.attack"];
    const ward = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "specialty.ilias.4" &&
        legal.action.optionIndex === 0 && legal.action.target?.type === "unit" &&
        legal.action.target.unitId === "unit_p1_griffins"
    );
    state = applyOk(state, ward!.action);
    expect(state.players.p1.hand).toContain("stat.attack");
    expect(specialtyImmunityActive(state, state.combat!.units.unit_p1_griffins)).toBe(true);

    state.players.p2.hand = ["specialty.alice.1"];
    state.activePlayerId = "p2";
    const fear = getLegalActions(state, "p2").find(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "specialty.alice.1" &&
        legal.action.target?.type === "unit" && legal.action.target.unitId === "unit_p1_griffins"
    );
    state = applyOk(state, fear!.action);
    expect(state.combat!.units.unit_p1_griffins.damage).toBe(0);
  });

  it("Granberia I adds +1 Attack and draws; VI grants +1 Attack for the Combat", () => {
    let family = declare(duel("mgq-granberia-family", "specialty.granberia.1", "mgq.giga"));
    family.players.p1.deck = ["stat.attack"];
    const familyPlay = getLegalActions(family, "p1").find(
      (legal) =>
        legal.action.type === "PLAY_REACTION" &&
        legal.action.cardId === "specialty.granberia.1" &&
        legal.action.optionIndex === 0
    );
    family = settle(applyOk(family, familyPlay!.action));
    expect(attackBonus(family, "signature")).toBe(1);
    expect(family.players.p1.hand).toContain("stat.attack");

    let first = duel("mgq-granberia-six", "specialty.granberia.6");
    const strike = getLegalActions(first, "p1").find(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "specialty.granberia.6" &&
        legal.action.target?.type === "unit" && legal.action.target.unitId === "unit_p1_marksmen"
    );
    expect(strike).toBeTruthy();
    first = applyOk(first, strike!.action);
    expect(first.activeEffects.some((entry) => entry.modifiers.some((modifier) => modifier.type === "ATTACK_BONUS" && modifier.amount === 1))).toBe(true);
  });

  it("Promestein removes the chosen bronze Few and permanently buffs the chosen silver", () => {
    let state = mapState("mgq-promestein", "promestein");
    state.players.p1.hand = ["specialty.promestein.4"];
    state.players.p1.army = [
      { id: "pochi", unitDefId: "mgq.pochi", side: "few" },
      { id: "hild", unitDefId: "mgq.hild", side: "few" }
    ];
    const play = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "specialty.promestein.4"
    );
    state = applyOk(state, play!.action);
    expect(state.pendingChoice?.type === "OPTION_CHOICE" && state.pendingChoice.context).toBe("mgq-mad-science");
    state = applyOk(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: state.pendingChoice!.id,
      optionIndex: 0
    });
    expect(state.players.p1.army.some((unit) => unit.id === "pochi")).toBe(false);
    expect(state.players.p1.army.find((unit) => unit.id === "hild")?.permanentAttackBonus).toBe(1);
    expect(cardLibrary["specialty.promestein.1"].effect).toEqual(cardLibrary["specialty.zydar.1"].effect);
    expect(cardLibrary["specialty.promestein.4"].effect).toEqual({ type: "MGQ_MAD_SCIENCE", attackBonus: 1 });
    expect(cardLibrary["specialty.promestein.6"].effect.type).toBe("CHOOSE_ONE");
    for (const level of [1, 4, 6] as const) {
      const card = cardLibrary[`specialty.promestein.${level}`];
      expect(card.tags).toContain("promestein");
      expect(card.tags).not.toContain("zydar");
    }
  });

  it("Granberia IV pays one discarded card and deals 2 damage", () => {
    let state = createInitialGameState("mgq-granberia-four");
    state.combat!.units.unit_p2_skeletons.maxHealth = 20;
    state.players.p1.hand = ["specialty.granberia.4", "stat.attack"];
    const play = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "specialty.granberia.4" &&
        legal.action.target?.type === "unit" && legal.action.target.unitId === "unit_p2_skeletons"
    );
    expect(play?.action.type).toBe("PLAY_CARD");
    if (!play || play.action.type !== "PLAY_CARD") throw new Error("Granberia IV play action was not generated");
    state = applyOk(state, { ...play.action, costCardIds: ["stat.attack"] });
    expect(state.players.p1.discard).toContain("stat.attack");
    expect(state.combat!.units.unit_p2_skeletons.damage).toBe(2);
  });

  it("Promestein VI destroys one enemy and grants +1 Power to every later spell", () => {
    let state = createInitialGameState("mgq-promestein-six");
    state.players.p1.hand = ["specialty.promestein.6"];
    const target = state.combat!.units.unit_p2_skeletons;
    const play = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "specialty.promestein.6" &&
        legal.action.optionIndex === 0 && legal.action.target?.type === "unit" &&
        legal.action.target.unitId === target.id
    );
    state = applyOk(state, play!.action);
    expect(state.combat!.units[target.id].damage).toBeGreaterThanOrEqual(state.combat!.units[target.id].maxHealth);
    expect(activeSpellPowerBonus(state, "p1")).toBe(1);
  });

  it("every revised draw option is also usable on the adventure map", () => {
    for (const [cardId, optionIndex, drawCount] of [
      ["specialty.granberia.1", 1, 1],
      ["specialty.ilias.4", 1, 1],
      ["specialty.promestein.6", 1, 2]
    ] as const) {
      let state = mapState(`mgq-map-draw-${cardId}`, cardId.split(".")[1]!);
      state.players.p1.hand = [cardId];
      state.players.p1.deck = ["stat.attack", "stat.defense"];
      const play = getLegalActions(state, "p1").find(
        (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === cardId && legal.action.optionIndex === optionIndex
      );
      expect(play, cardId).toBeTruthy();
      state = applyOk(state, play!.action);
      expect(state.players.p1.hand).toHaveLength(drawCount);
    }
  });
});
