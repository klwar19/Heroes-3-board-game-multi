import { describe, expect, it } from "vitest";
import { applyAction, createAdventureGameState, createInitialGameState, effectiveInitiative, getLegalActions, getPlayerView } from "./index";
import { activeSchoolFetches } from "./ruleset";
import { activeWarMachineCardId, countBallistas, warMachinesForSale } from "./permanents";
import { maybeOpenFactoryCommanderTrapChoice, maybeOpenFactoryWarMachineChoice } from "./adventure-reducer";
import type { GameAction, GameState, PlayerId } from "./state";

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors).toEqual([]);
  return result.state;
}

function setActiveUnit(state: GameState, playerId: PlayerId, unitId: string): void {
  if (!state.combat) {
    throw new Error("Expected combat setup.");
  }
  state.activePlayerId = playerId;
  state.combat.activeUnitId = unitId;
}

function passAllReactions(state: GameState): GameState {
  let current = state;
  while (current.reactionWindow) {
    const playerId = current.reactionWindow.priorityPlayerId;
    current = applyOk(current, { type: "PASS_REACTION", playerId });
  }
  return current;
}

/** END_COMBAT_ROUND with the active unit cleared (round may end any time here). */
function endRound(state: GameState, playerId: PlayerId): GameState {
  state.combat!.activeUnitId = null;
  state.activePlayerId = playerId;
  return applyOk(state, { type: "END_COMBAT_ROUND", playerId });
}

describe("permanent cards", () => {
  it("Factory Tinkerer keeps two machines and charges only switches after the first", () => {
    const state = createInitialGameState("tinkerer-switch");
    state.players.p1.commander = {
      slug: "factory",
      grades: { attack: 0, defense: 0, health: 0, damage: 0, speed: 0, magic: 0 },
    };
    state.players.p1.permanents = ["war_machine.ballista"];
    state.players.p1.hand = ["war_machine.cannon"];
    const played = applyOk(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "war_machine.cannon",
      target: { type: "none" },
    });
    expect(played.players.p1.permanents).toEqual(["war_machine.ballista", "war_machine.cannon"]);
    played.phase = "combat";
    played.combat!.setup = null;
    played.combat!.awaitingContinue = false;
    played.combat!.outcome = null;
    played.players.p1.resources.gold = 2;
    setActiveUnit(played, "p1", "unit_p1_crusaders");
    const offer = getLegalActions(played, "p1").find(
      (entry) => entry.action.type === "SWITCH_ACTIVE_WAR_MACHINE" && entry.action.cardId === "war_machine.cannon",
    );
    expect(offer, "the switch control is offered only with two machines").toBeTruthy();
    const switched = applyOk(played, offer!.action);
    expect(activeWarMachineCardId(switched, "p1")).toBe("war_machine.cannon");
    expect(switched.players.p1.resources.gold).toBe(2);
    expect(switched.players.p1.permanents).toEqual(["war_machine.ballista", "war_machine.cannon"]);

    const paidOffer = getLegalActions(switched, "p1").find(
      (entry) => entry.action.type === "SWITCH_ACTIVE_WAR_MACHINE" && entry.action.cardId === "war_machine.ballista",
    );
    expect(paidOffer?.label).toContain("pay 1 gold");
    const paid = applyOk(switched, paidOffer!.action);
    expect(activeWarMachineCardId(paid, "p1")).toBe("war_machine.ballista");
    expect(paid.players.p1.resources.gold).toBe(1);

    const paidAgain = getLegalActions(paid, "p1").find(
      (entry) => entry.action.type === "SWITCH_ACTIVE_WAR_MACHINE" && entry.action.cardId === "war_machine.cannon",
    );
    const empty = applyOk(paid, paidAgain!.action);
    expect(empty.players.p1.resources.gold).toBe(0);
    expect(getLegalActions(empty, "p1").some((entry) => entry.action.type === "SWITCH_ACTIVE_WAR_MACHINE")).toBe(false);
  });

  it("Factory commander discounts every war machine by 5 gold, never below zero", () => {
    const state = createAdventureGameState({ seed: "factory-five-gold-discount", rollFirstPlayer: false });
    state.adventure!.warMachineSupply = ["war_machine.first_aid_tent", "war_machine.cannon"];
    const control = warMachinesForSale(state, "factory", "p1");
    expect(control.map((offer) => offer.cost.gold)).toEqual([3, 10]);

    state.players.p1.commander = {
      slug: "factory",
      grades: { attack: 0, defense: 0, health: 0, damage: 0, speed: 0, magic: 0 },
    };
    const discounted = warMachinesForSale(state, "factory", "p1");
    expect(discounted.map((offer) => offer.cost.gold)).toEqual([0, 5]);
  });

  it.each([
    [0, 1],
    [2, 2],
    [3, 3],
  ] as const)("Factory Mechanical Traps scale from Magic grade %i to %i placement(s)", (magic, expected) => {
    let state = createInitialGameState(`factory-traps-power-${magic}`);
    state.players.p1.commander = {
      slug: "factory",
      grades: { attack: 0, defense: 0, health: 0, damage: 0, speed: 0, magic },
    };
    const commander = state.combat!.units.unit_p1_crusaders;
    commander.commanderSlug = "factory";
    commander.cardName = "Artificer";
    state.phase = "combat";
    state.combat!.setup = null;
    state.combat!.round = 1;

    expect(maybeOpenFactoryCommanderTrapChoice(state)).toBe(true);
    for (let placed = 0; placed < expected; placed += 1) {
      const choice = state.pendingChoice;
      expect(choice?.type).toBe("OPTION_CHOICE");
      if (choice?.type !== "OPTION_CHOICE") throw new Error("Expected trap placement choice.");
      state = applyOk(state, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: choice.id, optionIndex: 0 });
    }
    const traps = state.combat!.battlefieldTokens?.filter((token) => token.kind === "factory_trap") ?? [];
    expect(traps).toHaveLength(expected);
    expect(traps.every((token) => token.damage === 2 && token.armed === true)).toBe(true);
    if (magic === 0) {
      expect(getPlayerView(state, "p1").combat!.battlefieldTokens?.filter((token) => token.kind === "factory_trap")).toHaveLength(1);
      const enemyView = getPlayerView(state, "p2");
      expect(enemyView.combat!.battlefieldTokens?.some((token) => token.kind === "factory_trap")).toBe(false);
      expect(enemyView.eventLog.some((event) =>
        event.type === "BATTLEFIELD_TOKEN_PLACED" && event.kind === "factory_trap"
      )).toBe(false);
      expect(enemyView.eventLog.some((event) =>
        event.type === "UNIT_ABILITY_TRIGGERED" && event.abilityId === "commander-factory-mechanical-trap"
      )).toBe(false);
    }
  });

  it("Mechanical Trap deals 2 damage on an actual move and is spent once", () => {
    const base = createInitialGameState("factory-trap-movement");
    base.players.p1.commander = {
      slug: "factory",
      grades: { attack: 0, defense: 0, health: 0, damage: 0, speed: 0, magic: 0 },
    };
    const commander = base.combat!.units.unit_p1_crusaders;
    commander.commanderSlug = "factory";
    commander.cardName = "Artificer";
    base.phase = "combat";
    base.combat!.setup = null;
    base.combat!.round = 1;
    setActiveUnit(base, "p2", "unit_p2_vampires");
    const move = getLegalActions(base, "p2").find(
      (entry): entry is typeof entry & { action: Extract<GameAction, { type: "MOVE_UNIT" }> } => entry.action.type === "MOVE_UNIT",
    );
    expect(move).toBeDefined();
    const beforeDamage = base.combat!.units.unit_p2_vampires.damage;

    const control = applyOk(structuredClone(base), move!.action);
    expect(control.combat!.units.unit_p2_vampires.damage).toBe(beforeDamage);

    let trapped = structuredClone(base);
    expect(maybeOpenFactoryCommanderTrapChoice(trapped)).toBe(true);
    const choice = trapped.pendingChoice;
    expect(choice?.type).toBe("OPTION_CHOICE");
    if (choice?.type !== "OPTION_CHOICE" || !choice.factoryCommanderTraps) throw new Error("Expected trap placement choice.");
    const optionIndex = choice.factoryCommanderTraps.positions.indexOf(move!.action.destination);
    expect(optionIndex).toBeGreaterThanOrEqual(0);
    trapped = applyOk(trapped, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: choice.id, optionIndex });
    setActiveUnit(trapped, "p2", "unit_p2_vampires");
    const stepOnTrap = getLegalActions(trapped, "p2").find(
      (entry) => entry.action.type === "MOVE_UNIT" && entry.action.destination === move!.action.destination,
    );
    expect(stepOnTrap).toBeDefined();
    const sprung = applyOk(trapped, stepOnTrap!.action);
    expect(sprung.combat!.units.unit_p2_vampires.damage).toBe(beforeDamage + 2);
    expect(sprung.combat!.battlefieldTokens?.some((token) => token.kind === "factory_trap")).toBe(false);
    expect(sprung.eventLog).toContainEqual(expect.objectContaining({
      type: "BATTLEFIELD_TOKEN_TRIGGERED",
      kind: "factory_trap",
      unitId: "unit_p2_vampires",
      outcome: "damage",
      amount: 2,
      sourceAbilityId: "commander-factory-mechanical-trap",
    }));
  });

  it("asks the Tinkerer to choose the active machine at combat start", () => {
    const state = createInitialGameState("tinkerer-start-choice");
    state.players.p1.commander = {
      slug: "factory",
      grades: { attack: 0, defense: 0, health: 0, damage: 0, speed: 0, magic: 0 },
    };
    state.players.p1.permanents = ["war_machine.ballista", "war_machine.cannon"];
    state.players.p1.activeWarMachineCardId = "war_machine.cannon";
    state.phase = "combat";
    state.combat!.setup = null;
    state.combat!.round = 1;
    expect(maybeOpenFactoryWarMachineChoice(state)).toBe(true);
    const choice = state.pendingChoice;
    expect(choice?.type).toBe("OPTION_CHOICE");
    if (choice?.type !== "OPTION_CHOICE") return;
    expect(choice.context).toBe("factory-war-machine-select");
    expect(choice.options).toHaveLength(2);
    const picked = applyOk(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: choice.id,
      optionIndex: 0,
    });
    expect(activeWarMachineCardId(picked, "p1")).toBe("war_machine.ballista");
    expect(picked.pendingChoice).toBeNull();
  });

  it("Factory Tinkerer playing a non-machine discards both machine permanents", () => {
    const state = createInitialGameState("tinkerer-replace-both");
    state.players.p1.commander = {
      slug: "factory",
      grades: { attack: 0, defense: 0, health: 0, damage: 0, speed: 0, magic: 0 },
    };
    state.players.p1.permanents = ["war_machine.ballista", "war_machine.cannon"];
    state.players.p1.hand = ["ability.fire_magic"];
    const next = applyOk(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "ability.fire_magic",
      target: { type: "none" },
    });
    expect(next.players.p1.permanents).toEqual(["ability.fire_magic"]);
    expect(next.players.p1.discard.filter((id) => id === "war_machine.ballista")).toHaveLength(1);
    expect(next.players.p1.discard.filter((id) => id === "war_machine.cannon")).toHaveLength(1);
  });

  it("allows multiple physical Ballistas to share one permanent slot", () => {
    let state = createInitialGameState("multi-ballista-slot");
    state.players.p1.hand = ["war_machine.ballista", "war_machine.ballista"];
    state = applyOk(state, {
      type: "PLAY_CARD", playerId: "p1", cardId: "war_machine.ballista", target: { type: "none" }
    });
    state = applyOk(state, {
      type: "PLAY_CARD", playerId: "p1", cardId: "war_machine.ballista", target: { type: "none" }
    });
    expect(state.players.p1.permanents).toEqual([
      "war_machine.ballista",
      "war_machine.ballista",
    ]);
    expect(countBallistas(state, "p1")).toBe(2);
  });

  it("replaces the whole shared Ballista slot when a different permanent is played", () => {
    let state = createInitialGameState("replace-multi-ballista-slot");
    state.players.p1.permanents = ["war_machine.ballista", "war_machine.ballista"];
    state.players.p1.hand = ["war_machine.first_aid_tent"];

    state = applyOk(state, {
      type: "PLAY_CARD", playerId: "p1", cardId: "war_machine.first_aid_tent", target: { type: "none" }
    });

    expect(state.players.p1.permanents).toEqual(["war_machine.first_aid_tent"]);
    expect(state.players.p1.discard.filter((cardId) => cardId === "war_machine.ballista")).toHaveLength(2);
  });

  it("replaces the previous permanent, which goes to the discard pile", () => {
    const state = createInitialGameState();
    state.players.p1.hand = ["war_machine.first_aid_tent", "ability.fire_magic"];

    const first = applyOk(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "war_machine.first_aid_tent",
      target: { type: "none" }
    });
    expect(first.players.p1.permanents).toEqual(["war_machine.first_aid_tent"]);

    const second = applyOk(first, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "ability.fire_magic",
      target: { type: "none" }
    });
    expect(second.players.p1.permanents).toEqual(["ability.fire_magic"]);
    expect(second.players.p1.discard).toContain("war_machine.first_aid_tent");
    expect(second.players.p1.hand).toHaveLength(0);
    // The replaced tent's combat effect leaves with it.
    expect(second.activeEffects.some((effect) => effect.name === "First Aid Tent")).toBe(false);
  });

  it("treats a Basic School of Magic as a permanent — one slot with war machines", () => {
    // The bug: a Basic Fire/Earth/Water/Air Magic ability created a floating
    // active effect instead of occupying the single permanent slot, so a player
    // could hold it AND a war machine / income artifact at once. It now enters
    // play as a permanent like every other, subject to the one-permanent limit.
    const state = createInitialGameState();
    state.players.p1.hand = ["ability.basic_fire_magic", "war_machine.first_aid_tent"];

    // Play the Basic Fire Magic as its "Permanent" side (option 0 = ENTER_PLAY).
    const first = applyOk(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "ability.basic_fire_magic",
      optionIndex: 0,
      target: { type: "none" }
    });
    expect(first.players.p1.permanents).toEqual(["ability.basic_fire_magic"]);
    // While it is in the slot, the owner fetches Fire spells instead of searching.
    expect(activeSchoolFetches(first, "p1")).toEqual(["fire"]);

    // Playing ANY other permanent replaces it — the one-permanent limit — and
    // the fetch stops the instant the card leaves the slot (tied to the slot,
    // not a lingering active effect).
    const second = applyOk(first, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "war_machine.first_aid_tent",
      target: { type: "none" }
    });
    expect(second.players.p1.permanents).toEqual(["war_machine.first_aid_tent"]);
    expect(second.players.p1.discard).toContain("ability.basic_fire_magic");
    expect(activeSchoolFetches(second, "p1")).toEqual([]);
  });

  it("replaces a Basic School of Magic with an income artifact (one slot)", () => {
    // The user's other example: a magic ability + an income artifact must not
    // coexist. Playing the income artifact's enter-play side discards the ability.
    const state = createInitialGameState();
    state.players.p1.hand = ["ability.basic_water_magic", "artifact.eversmoking_ring_of_sulfur"];

    const first = applyOk(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "ability.basic_water_magic",
      optionIndex: 0,
      target: { type: "none" }
    });
    expect(first.players.p1.permanents).toEqual(["ability.basic_water_magic"]);

    const second = applyOk(first, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "artifact.eversmoking_ring_of_sulfur",
      optionIndex: 0, // the ENTER_PLAY (income) side, not the crack-open side
      target: { type: "none" }
    });
    expect(second.players.p1.permanents).toEqual(["artifact.eversmoking_ring_of_sulfur"]);
    expect(second.players.p1.discard).toContain("ability.basic_water_magic");
    expect(activeSchoolFetches(second, "p1")).toEqual([]);
  });

  it("gives matching spells +1 power while a School of Magic is in play", () => {
    const state = createInitialGameState();
    state.players.p1.hand = ["spell.magic_arrow"];
    state.players.p1.permanents = ["ability.fire_magic"];
    state.players.p2.hand = [];

    const cast = applyOk(state, {
      type: "CAST_SPELL",
      playerId: "p1",
      cardId: "spell.magic_arrow",
      target: { type: "unit", unitId: "unit_p2_vampires" }
    });
    const resolved = passAllReactions(cast);

    // Magic Arrow at printed power 0 deals 1; the school bonus lifts it to
    // power 1 -> 2 damage.
    expect(resolved.combat?.units.unit_p2_vampires.damage).toBe(2);
    // The permanent stays in play after using its basic effect.
    expect(resolved.players.p1.permanents).toEqual(["ability.fire_magic"]);
  });

  it("offers School expert in the Spell Power window and replaces automatic +1 with +3", () => {
    const state = createInitialGameState();
    state.players.p1.hand = ["spell.magic_arrow"];
    state.players.p1.permanents = ["ability.earth_magic"];
    state.players.p2.hand = ["stat.defense"];

    const castAction = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "CAST_SPELL" &&
        legal.action.cardId === "spell.magic_arrow" &&
        legal.action.target?.type === "unit" &&
        legal.action.target.unitId === "unit_p2_vampires"
    );
    expect(castAction).toBeDefined();
    let cast = applyOk(state, castAction!.action);
    const expert = getLegalActions(cast, "p1").find(
      (legal) =>
        legal.action.type === "USE_SCHOOL_PERMANENT_EXPERT" &&
        legal.action.cardId === "ability.earth_magic"
    );
    expect(expert, "School expert should be offered in the open Spell Power window").toBeDefined();

    cast = applyOk(cast, expert!.action);
    expect(cast.players.p1.permanents).toEqual([]);
    expect(cast.players.p1.discard).toContain("ability.earth_magic");
    expect(cast.players.p1.combatStats.expertUsesSpentThisRound).toBe(1);

    const resolved = passAllReactions(cast);
    // Expert replaces the School's +1 with +3; it is not +1 +3.
    expect(resolved.combat?.units.unit_p2_vampires.damage).toBe(3);
  });

  it("never exposes or accepts School expert as a separate CAST_SPELL mode", () => {
    const state = createInitialGameState();
    state.players.p1.hand = ["spell.magic_arrow"];
    state.players.p1.permanents = ["ability.earth_magic"];
    state.players.p1.limits.expertUses = 1;
    const casts = getLegalActions(state, "p1").filter(
      (legal) => legal.action.type === "CAST_SPELL" && legal.action.cardId === "spell.magic_arrow"
    );
    expect(casts.length).toBeGreaterThan(0);
    expect(casts.every((legal) =>
      legal.action.type === "CAST_SPELL" &&
      !legal.action.useSchoolExpert &&
      !legal.action.useSchoolFetchExpert
    )).toBe(true);

    const forged = applyAction(state, {
      type: "CAST_SPELL",
      playerId: "p1",
      cardId: "spell.magic_arrow",
      target: { type: "unit", unitId: "unit_p2_vampires" },
      useSchoolExpert: true
    });
    expect(forged.errors[0]?.message).toMatch(/not legal|instant Power window/i);
    expect(forged.state.players.p1.hand).toContain("spell.magic_arrow");
  });

  it("offers expert after casting, while passing keeps the automatic +1", () => {
    const state = createInitialGameState();
    state.players.p1.hand = ["spell.magic_arrow"];
    state.players.p1.permanents = ["ability.earth_magic"];
    state.players.p2.hand = []; // no opponent reactions

    const cast = applyOk(state, {
      type: "CAST_SPELL",
      playerId: "p1",
      cardId: "spell.magic_arrow",
      target: { type: "unit", unitId: "unit_p2_vampires" }
    });

    expect(cast.reactionWindow).toBeTruthy();
    expect(getLegalActions(cast, "p1").some(
      (legal) => legal.action.type === "USE_SCHOOL_PERMANENT_EXPERT"
    )).toBe(true);
    const resolved = passAllReactions(cast);
    expect(resolved.players.p1.permanents).toEqual(["ability.earth_magic"]);
    expect(resolved.players.p1.combatStats.expertUsesSpentThisRound).toBe(0);
    expect(resolved.combat?.units.unit_p2_vampires.damage).toBe(2);
  });

  /**
   * The School of Magic permanent's expert REPLACES that permanent's own basic
   * contribution (+1 → +3), so it must ADD the delta to whatever Power the cast
   * already holds — never ASSIGN. It used to assign, which CLOBBERED a Basic X
   * Magic +3 committed first in the very same window: two crowns and two cards
   * spent for LESS damage than the fetch alone (Implosion 4 instead of 6).
   */
  function twoSourceImplosionCast(seed: string): GameState {
    const state = createInitialGameState(seed);
    state.players.p1.hand = ["spell.implosion"];
    state.players.p2.hand = [];
    // A real School-of-Magic permanent (+1 standing, +3 expert) AND the Basic
    // Earth Magic fetch permanent (no standing Power, a +3 expert of its own).
    state.players.p1.permanents = ["ability.earth_magic", "ability.basic_earth_magic"];
    state.players.p1.limits.expertUses = 2;
    state.players.p1.combatStats.expertUsesSpentThisRound = 0;
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_marksmen";
    const target = state.combat!.units.unit_p2_skeletons;
    target.abilities = [];
    target.maxHealth = 30;
    target.damage = 0;
    const cast = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "CAST_SPELL" &&
        legal.action.cardId === "spell.implosion" &&
        legal.action.target?.type === "unit" &&
        legal.action.target.unitId === "unit_p2_skeletons"
    );
    expect(cast, "the Implosion cast should be legal").toBeTruthy();
    return applyOk(state, cast!.action);
  }

  function findAction(state: GameState, type: GameAction["type"]) {
    return getLegalActions(state, "p1").find((legal) => legal.action.type === type);
  }

  it("stacks the Basic X Magic +3 with the School permanent's expert (Implosion 6, either order)", () => {
    // Fetch FIRST — the order the old assignment broke.
    let s = twoSourceImplosionCast("school-expert-after-fetch");
    s = applyOk(s, findAction(s, "USE_SCHOOL_FETCH_EXPERT")!.action);
    const permanentExpert = findAction(s, "USE_SCHOOL_PERMANENT_EXPERT");
    expect(permanentExpert, "the School permanent's expert is still offered").toBeTruthy();
    s = passAllReactions(applyOk(s, permanentExpert!.action));
    // Power = 1 standing + 3 (fetch) + 2 (expert 3 − basic 1) = 6.
    // Implosion {0:0, 1:2, 3:4, 5:6}: 6 damage. Pre-fix it was 4 — LESS than the
    // fetch alone would have dealt, for a second crown and a second card.
    expect(s.combat!.units.unit_p2_skeletons.damage).toBe(6);
    expect(s.players.p1.combatStats.expertUsesSpentThisRound).toBe(2);
    expect(s.players.p1.permanents).toEqual([]);

    // Permanent FIRST — the same total, so the two orders cannot disagree.
    let r = twoSourceImplosionCast("fetch-after-school-expert");
    r = applyOk(r, findAction(r, "USE_SCHOOL_PERMANENT_EXPERT")!.action);
    r = passAllReactions(applyOk(r, findAction(r, "USE_SCHOOL_FETCH_EXPERT")!.action));
    expect(r.combat!.units.unit_p2_skeletons.damage).toBe(6);
  });

  it("commits at most ONE School permanent per cast (a second copy is never re-offered)", () => {
    // Magic Arrow is "any"-school, so BOTH School permanents match it. Expert
    // replaces one permanent's basic +1; a second commit adds nothing the
    // printed ladder can use, so offering it only burned a card and a crown.
    const state = createInitialGameState("school-expert-two-permanents");
    state.players.p1.hand = ["spell.magic_arrow"];
    state.players.p2.hand = [];
    state.players.p1.permanents = ["ability.earth_magic", "ability.fire_magic"];
    state.players.p1.limits.expertUses = 2;
    state.players.p1.combatStats.expertUsesSpentThisRound = 0;
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_marksmen";
    state.combat!.units.unit_p2_skeletons.abilities = [];
    state.combat!.units.unit_p2_skeletons.maxHealth = 30;
    const cast = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "CAST_SPELL" &&
        legal.action.cardId === "spell.magic_arrow" &&
        legal.action.target?.type === "unit" &&
        legal.action.target.unitId === "unit_p2_skeletons"
    );
    const opened = applyOk(state, cast!.action);
    const first = getLegalActions(opened, "p1").find(
      (legal) => legal.action.type === "USE_SCHOOL_PERMANENT_EXPERT"
    );
    expect(first, "the first School permanent's expert is offered").toBeTruthy();
    const committedCardId =
      first!.action.type === "USE_SCHOOL_PERMANENT_EXPERT" ? first!.action.cardId : "";
    const committed = applyOk(opened, first!.action);

    // No second offer, and the other permanent is untouched — the whole point.
    expect(
      getLegalActions(committed, "p1").filter(
        (legal) => legal.action.type === "USE_SCHOOL_PERMANENT_EXPERT"
      ),
      "a second School permanent must not be offered on the same cast"
    ).toHaveLength(0);
    const survivor = ["ability.earth_magic", "ability.fire_magic"].find(
      (cardId) => cardId !== committedCardId
    )!;
    expect(committed.players.p1.permanents).toEqual([survivor]);
    expect(committed.players.p1.combatStats.expertUsesSpentThisRound).toBe(1);

    // A forged second commit fails cleanly, spending nothing.
    const forged = applyAction(committed, {
      type: "USE_SCHOOL_PERMANENT_EXPERT",
      playerId: "p1",
      cardId: survivor
    });
    expect(forged.errors.length).toBeGreaterThan(0);
    expect(forged.state.players.p1.permanents).toEqual([survivor]);
    expect(forged.state.players.p1.combatStats.expertUsesSpentThisRound).toBe(1);

    const resolved = passAllReactions(committed);
    // Power = 1 standing + 2 (expert − basic) = 3 → Magic Arrow's top rung (2) = 3.
    expect(resolved.combat!.units.unit_p2_skeletons.damage).toBe(3);
  });

  it("fires the Ballista at the slowest enemy at the start of each combat round", () => {
    const state = createInitialGameState();
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    state.players.p1.permanents = ["war_machine.ballista"];
    // The Ballista always fires a single basic shot at the slowest enemy. (The
    // 3× same-target volley is the Artillery ability's expert side, not the
    // Ballista's — so crowns alone never change this.)
    state.players.p1.limits.expertUses = 0;

    const units = state.combat!.units;
    const enemies = Object.values(units).filter((unit) => unit.controllerId === "p2");
    const lowest = Math.min(...enemies.map((unit) => unit.initiative));
    // Keep a single slowest enemy so the shot resolves without a choice.
    const slowest = enemies.filter((unit) => unit.initiative === lowest);
    for (const unit of slowest.slice(1)) {
      unit.initiative += 1;
    }

    const next = endRound(state, "p1");
    expect(next.combat?.units[slowest[0].id].damage).toBe(1);
    expect(next.pendingChoice).toBeNull();
  });

  it("lets the owner choose among every enemy tied for lowest initiative", () => {
    const state = createInitialGameState();
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    state.players.p1.permanents = ["war_machine.ballista"];
    state.players.p1.limits.expertUses = 0;
    const enemies = Object.values(state.combat!.units).filter((unit) => unit.controllerId === "p2");
    for (const enemy of enemies) enemy.initiative = 4;

    const aiming = endRound(state, "p1");
    expect(aiming.pendingChoice).toMatchObject({
      type: "ABILITY_TARGET_CHOICE",
      kind: "war-machine",
      candidateUnitIds: expect.arrayContaining(enemies.map((unit) => unit.id))
    });
    const clickableTargets = getLegalActions(aiming, "p1")
      .map((legal) => legal.action)
      .filter((action): action is Extract<GameAction, { type: "CHOOSE_ABILITY_TARGET" }> =>
        action.type === "CHOOSE_ABILITY_TARGET"
      )
      .map((action) => action.targetUnitId);
    expect(clickableTargets.sort()).toEqual(enemies.map((unit) => unit.id).sort());
    const target = enemies[1]!;
    const shot = applyOk(aiming, {
      type: "CHOOSE_ABILITY_TARGET",
      playerId: "p1",
      choiceId: aiming.pendingChoice!.id,
      targetUnitId: target.id
    });
    expect(shot.combat!.units[target.id].damage).toBe(1);
    expect(shot.pendingChoice).toBeNull();
  });

  it("uses the BINH Ballista house-rule price of 3 / 6 gold", () => {
    const state = createAdventureGameState({ seed: "binh-ballista-price", rollFirstPlayer: false });
    state.adventure!.warMachineSupply = ["war_machine.ballista"];
    state.ruleset = "binh";
    const houseRules = (state.adventure!.houseRules ??= {} as NonNullable<typeof state.adventure>["houseRules"]);
    houseRules!["binh-ballista-cost-3-6"] = true;
    expect(warMachinesForSale(state, "factory", "p1")[0]?.cost).toEqual({ gold: 3 });
    expect(warMachinesForSale(state, "trading-post", "p1")[0]?.cost).toEqual({ gold: 6 });

    houseRules!["binh-ballista-cost-3-6"] = false;
    expect(warMachinesForSale(state, "factory", "p1")[0]?.cost).toEqual({ gold: 7 });
    expect(warMachinesForSale(state, "trading-post", "p1")[0]?.cost).toEqual({ gold: 10 });
  });

  it("offers the Cannon shot for an expert use and applies 2 damage to the chosen enemy", () => {
    const state = createInitialGameState();
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    state.players.p1.permanents = ["war_machine.cannon"];

    const offered = endRound(state, "p1");
    expect(offered.pendingChoice?.type).toBe("OPTION_CHOICE");

    const fire = getLegalActions(offered, "p1").find((legal) => legal.label.includes("Fire the Cannon"));
    expect(fire).toBeDefined();
    const aiming = applyOk(offered, fire!.action);
    expect(aiming.players.p1.combatStats.expertUsesSpentThisRound).toBe(1);
    expect(aiming.pendingChoice?.type).toBe("ABILITY_TARGET_CHOICE");

    const shot = applyOk(aiming, {
      type: "CHOOSE_ABILITY_TARGET",
      playerId: "p1",
      choiceId: aiming.pendingChoice!.id,
      targetUnitId: "unit_p2_vampires"
    });
    expect(shot.combat?.units.unit_p2_vampires.damage).toBe(2);
    expect(shot.combat?.warMachineRound ?? null).toBeNull();
  });

  it("lets the Cannon be skipped without spending anything", () => {
    const state = createInitialGameState();
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    state.players.p1.permanents = ["war_machine.cannon"];

    const offered = endRound(state, "p1");
    const skip = getLegalActions(offered, "p1").find((legal) => legal.label === "Skip");
    expect(skip).toBeDefined();
    const skipped = applyOk(offered, skip!.action);
    expect(skipped.players.p1.combatStats.expertUsesSpentThisRound).toBe(0);
    expect(skipped.pendingChoice).toBeNull();
    expect(Object.values(skipped.combat!.units).every((unit) => unit.damage === 0)).toBe(true);
  });

  it("fires the Catapult at two adjacent targets for 1 building material", () => {
    const state = createInitialGameState();
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    state.players.p1.permanents = ["war_machine.catapult"];
    state.players.p1.resources.buildingMaterials = 2;

    // Positions 13 (vampires) and 14 (skeletons)... place two enemies side by side.
    const units = state.combat!.units;
    units.unit_p2_skeletons.position = 13;
    units.unit_p2_vampires.position = 14;

    const offered = endRound(state, "p1");
    const fire = getLegalActions(offered, "p1").find((legal) => legal.label.includes("Fire the Catapult"));
    expect(fire).toBeDefined();

    const aiming = applyOk(offered, fire!.action);
    expect(aiming.players.p1.resources.buildingMaterials).toBe(1);
    expect(aiming.pendingChoice?.type).toBe("ABILITY_TARGET_CHOICE");

    const firstShot = applyOk(aiming, {
      type: "CHOOSE_ABILITY_TARGET",
      playerId: "p1",
      choiceId: aiming.pendingChoice!.id,
      targetUnitId: "unit_p2_skeletons"
    });
    expect(firstShot.combat?.units.unit_p2_skeletons.damage).toBe(1);

    // The second target must be adjacent to the first.
    if (firstShot.pendingChoice) {
      expect(firstShot.pendingChoice.type).toBe("ABILITY_TARGET_CHOICE");
      const candidates =
        firstShot.pendingChoice.type === "ABILITY_TARGET_CHOICE" ? firstShot.pendingChoice.candidateUnitIds : [];
      expect(candidates).toContain("unit_p2_vampires");
      const second = applyOk(firstShot, {
        type: "CHOOSE_ABILITY_TARGET",
        playerId: "p1",
        choiceId: firstShot.pendingChoice.id,
        targetUnitId: "unit_p2_vampires"
      });
      expect(second.combat?.units.unit_p2_vampires.damage).toBe(1);
    } else {
      // Only one neighbor existed: the splash resolved on its own.
      expect(firstShot.combat?.units.unit_p2_vampires.damage).toBe(1);
    }
  });

  it("keeps the printed one-permanent limit unless Pandora's Box raises it to 3", () => {
    const state = createInitialGameState();
    state.players.p1.hand = [
      "pandora.permanent_slots",
      "war_machine.first_aid_tent",
      "ability.fire_magic",
      "war_machine.ballista"
    ];

    // Pandora's "up to 3 permanents, including this one" enters play first.
    let current = applyOk(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "pandora.permanent_slots",
      target: { type: "none" }
    });
    current = applyOk(current, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "war_machine.first_aid_tent",
      target: { type: "none" }
    });
    current = applyOk(current, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "ability.fire_magic",
      target: { type: "none" }
    });
    expect(current.players.p1.permanents).toEqual([
      "pandora.permanent_slots",
      "war_machine.first_aid_tent",
      "ability.fire_magic"
    ]);

    // A fourth permanent is over the raised limit: the oldest one leaves — and
    // the oldest IS the Pandora limit card, so the printed one-permanent rule
    // is back the moment it leaves play. The remaining extras follow it out
    // (oldest first) instead of lingering as three permanents under a limit of
    // one (the audited "limit survives its card" bug).
    current = applyOk(current, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "war_machine.ballista",
      target: { type: "none" }
    });
    expect(current.players.p1.permanents).toEqual(["war_machine.ballista"]);
    // The Pandora limit card is ONE-TIME use: it leaves the GAME (removed pile),
    // never the discard pile that would reshuffle it back into the deck. The
    // ordinary permanents it dragged out still go to the discard pile.
    expect(current.players.p1.removed).toContain("pandora.permanent_slots");
    expect(current.players.p1.discard).not.toContain("pandora.permanent_slots");
    expect(current.players.p1.discard).toEqual(
      expect.arrayContaining(["war_machine.first_aid_tent", "ability.fire_magic"])
    );
  });

  it("keeps all three permanents when the replaced (oldest) card is NOT the limit card", () => {
    // CONTROL for the re-enforcement above: replacing an ordinary permanent
    // while Pandora's "up to 3" stays in play must NOT discard anything extra.
    const state = createInitialGameState();
    state.players.p1.permanents = [
      "war_machine.first_aid_tent",
      "pandora.permanent_slots",
      "ability.fire_magic"
    ];
    state.players.p1.hand = ["war_machine.ballista"];

    const next = applyOk(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "war_machine.ballista",
      target: { type: "none" }
    });
    expect(next.players.p1.permanents).toEqual([
      "pandora.permanent_slots",
      "ability.fire_magic",
      "war_machine.ballista"
    ]);
    expect(next.players.p1.discard).toEqual(["war_machine.first_aid_tent"]);
  });

  it("voluntarily discards a permanent and re-enforces the limit when Pandora leaves", () => {
    const state = createInitialGameState();
    state.players.p1.permanents = ["pandora.permanent_slots", "war_machine.first_aid_tent", "ability.fire_magic"];
    state.players.p1.hand = [];

    const discard = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "DISCARD_PERMANENT" && legal.action.cardId === "pandora.permanent_slots"
    );
    expect(discard).toBeDefined();

    const next = applyOk(state, discard!.action);
    // Pandora's limit card left play, so the limit is 1 again: the oldest
    // extra permanent goes to the discard pile too. The Pandora card itself is
    // one-time use — it leaves the GAME (removed pile), not the discard pile.
    expect(next.players.p1.permanents).toEqual(["ability.fire_magic"]);
    expect(next.players.p1.removed).toContain("pandora.permanent_slots");
    expect(next.players.p1.discard).not.toContain("pandora.permanent_slots");
    expect(next.players.p1.discard).toEqual(expect.arrayContaining(["war_machine.first_aid_tent"]));
  });

  it("raises the hand limit while Pandora's hand-size permanent is in play", async () => {
    const { effectiveHandLimit } = await import("./adventure");
    const state = createInitialGameState();
    expect(effectiveHandLimit(state, "p1")).toBe(state.players.p1.limits.hand);
    state.players.p1.permanents = ["pandora.hand_size"];
    expect(effectiveHandLimit(state, "p1")).toBe(state.players.p1.limits.hand + 1);
  });

  it("lets Ammo Cart ranged units shoot adjacent targets without disadvantage and adds initiative", () => {
    const state = createInitialGameState();
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    state.players.p1.permanents = ["war_machine.ammo_cart"];

    const combat = state.combat!;
    const marksmen = combat.units.unit_p1_marksmen;
    const baseInitiative = marksmen.initiative;

    // Entering a combat round applies the cart (initiative) and waives the
    // adjacent-shot penalty. The +2 is a live RANGED_INITIATIVE_BONUS modifier,
    // not a write into the printed `unit.initiative` cache (which
    // applyUnitCurrentSide rebuilds mid-combat) — so read it the way the
    // activation order and the initiative rail do. Order coverage lives in
    // ammo-cart-initiative-order.test.ts.
    const next = endRound(state, "p1");
    const nextMarksmen = next.combat!.units.unit_p1_marksmen;
    expect(effectiveInitiative(nextMarksmen, next.activeEffects, next.combat)).toBe(baseInitiative + 2);

    // Put an enemy right next to the marksmen: the shot stays a normal roll.
    next.combat!.units.unit_p2_skeletons.position = nextMarksmen.position + 1;
    setActiveUnit(next, "p1", "unit_p1_marksmen");
    const attacked = applyOk(next, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_marksmen",
      defenderId: "unit_p2_skeletons"
    });
    const declared = [...attacked.eventLog].reverse().find((event) => event.type === "UNIT_ATTACK_DECLARED");
    expect(declared && declared.type === "UNIT_ATTACK_DECLARED" ? declared.rollMode : null).toBe("normal");
  });
});
