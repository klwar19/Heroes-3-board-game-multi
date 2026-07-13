import { describe, expect, it } from "vitest";
import { applyAction, createInitialGameState, getLegalActions } from "./index";
import type { GameAction, GameState, PlayerId, UnitId } from "./state";

/**
 * Magic Mirror FROM THE SPELL BOOK — all three engine windows, end-to-end.
 *
 * The printed card is an instant reaction in three situations (see getMagicMirrorReactions):
 *   1. single-target enemy Spell on your unit (Magic Arrow, …)
 *   2. area Spell whose blast would damage your unit (Inferno / Fireball splash)
 *   3. enemy attack-instant debuff on your unit (Curse / Weakness)
 *
 * A prior bug left the dedicated Mirror pass reading only the hand, so a Mirror
 * stashed in the Book never opened a window and never redirected. Each test
 * below puts Magic Mirror ONLY in the Book (empty hand), requires
 * `fromSpellBook: true` on the legal offer, drives applyAction through redirect
 * target pick, and asserts an observable board outcome. Removing Book wiring
 * from getMagicMirrorReactions makes every test fail.
 *
 * CONTROLs: empty Book → no Mirror offer / no redirect event.
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function passUntilSettled(state: GameState): GameState {
  let current = state;
  let safety = 40;
  while (current.reactionWindow && safety > 0) {
    safety -= 1;
    current = applyOk(current, {
      type: "PASS_REACTION",
      playerId: current.reactionWindow.priorityPlayerId
    });
  }
  return current;
}

/** Book-only Magic Mirror offer (must carry fromSpellBook). */
function bookMirror(
  state: GameState,
  playerId: PlayerId,
  optionIndex = 0
): Extract<GameAction, { type: "PLAY_REACTION" }> | undefined {
  const legal = getLegalActions(state, playerId).find(
    (entry) =>
      entry.action.type === "PLAY_REACTION" &&
      entry.action.cardId === "spell.magic_mirror" &&
      entry.action.fromSpellBook === true &&
      entry.action.optionIndex === optionIndex &&
      !entry.action.asPowerBoost
  );
  return legal?.action.type === "PLAY_REACTION" ? legal.action : undefined;
}

function chooseRedirect(state: GameState, playerId: PlayerId, targetUnitId: UnitId): GameState {
  const choice = state.pendingChoice;
  if (!choice || choice.type !== "ABILITY_TARGET_CHOICE" || choice.kind !== "spell-redirect") {
    throw new Error(
      `expected spell-redirect choice, got ${choice ? `${choice.type}/${"kind" in choice ? choice.kind : "?"}` : "null"}`
    );
  }
  return applyOk(state, {
    type: "CHOOSE_ABILITY_TARGET",
    playerId,
    choiceId: choice.id,
    targetUnitId
  });
}

function assertBookCycled(state: GameState, playerId: PlayerId): void {
  expect(state.players[playerId].spellBook).not.toContain("spell.magic_mirror");
  expect(state.players[playerId].discard).toContain("spell.magic_mirror");
  expect(state.players[playerId].hand).not.toContain("spell.magic_mirror");
  expect(state.players[playerId].combatStats.spellsCastThisRound).toBe(1);
  expect(state.eventLog.some((event) => event.type === "SPELL_REDIRECTED")).toBe(true);
}

// ---------------------------------------------------------------------------
// (1) Single-target enemy Spell
// ---------------------------------------------------------------------------

describe("Spell Book Magic Mirror — single-target cast", () => {
  function castArrowAtGriffins(p1Book: string[]): GameState {
    const state = createInitialGameState("book-mm-arrow");
    state.players.p1.hand = [];
    state.players.p1.spellBook = [...p1Book];
    state.players.p2.hand = ["spell.magic_arrow"];
    state.players.p2.spellBook = [];
    state.activePlayerId = "p2";
    state.combat!.activeUnitId = "unit_p2_skeletons";
    state.combat!.units.unit_p2_skeletons.activatedThisRound = false;
    return applyOk(state, {
      type: "CAST_SPELL",
      playerId: "p2",
      cardId: "spell.magic_arrow",
      target: { type: "unit", unitId: "unit_p1_griffins" }
    });
  }

  it("opens a reaction window from Book-only Mirror and redirects damage off the original target", () => {
    let state = castArrowAtGriffins(["spell.magic_mirror"]);
    expect(state.reactionWindow, "window MUST open when only the Book holds Mirror").toBeTruthy();
    expect(state.reactionWindow!.priorityPlayerId).toBe("p1");

    const mirror = bookMirror(state, "p1", 0);
    expect(mirror, "Book Magic Mirror bronze must be legal").toBeTruthy();
    expect(mirror!.fromSpellBook).toBe(true);

    state = applyOk(state, mirror!);
    const choice = state.pendingChoice;
    expect(choice && choice.type === "ABILITY_TARGET_CHOICE").toBe(true);
    if (!choice || choice.type !== "ABILITY_TARGET_CHOICE") {
      throw new Error("expected redirect choice");
    }
    expect(choice.candidateUnitIds).toContain("unit_p2_skeletons");
    expect(choice.candidateUnitIds).not.toContain("unit_p1_griffins");

    state = chooseRedirect(state, "p1", "unit_p2_skeletons");
    state = passUntilSettled(state);

    // Observable: original target unhurt; redirect target took Magic Arrow damage.
    expect(state.combat!.units.unit_p1_griffins.damage).toBe(0);
    expect(state.combat!.units.unit_p2_skeletons.damage).toBe(1);
    assertBookCycled(state, "p1");
  });

  it("CONTROL: empty Book → no window offer / spell hits original target", () => {
    let state = castArrowAtGriffins([]);
    expect(bookMirror(state, "p1", 0)).toBeUndefined();
    state = passUntilSettled(state);
    expect(state.combat!.units.unit_p1_griffins.damage).toBe(1);
    expect(state.eventLog.some((event) => event.type === "SPELL_REDIRECTED")).toBe(false);
  });

  it("silver Book Mirror pays its Power cost with a Book Fly (not hand)", () => {
    const state = createInitialGameState("book-mm-silver");
    state.players.p1.hand = [];
    // Silver target unit so bronze free option still works, but we force silver
    // grade by using optionIndex 1 (pay 1 Power) for a silver-reachable bounce.
    state.combat!.units.unit_p1_griffins.grade = "silver";
    state.players.p1.spellBook = ["spell.magic_mirror", "spell.fly"];
    state.players.p2.hand = ["spell.magic_arrow"];
    state.activePlayerId = "p2";
    state.combat!.activeUnitId = "unit_p2_skeletons";
    state.combat!.units.unit_p2_skeletons.activatedThisRound = false;

    let opened = applyOk(state, {
      type: "CAST_SPELL",
      playerId: "p2",
      cardId: "spell.magic_arrow",
      target: { type: "unit", unitId: "unit_p1_griffins" }
    });

    const silver = bookMirror(opened, "p1", 1);
    expect(silver, "Book Mirror silver must be affordable with Book Fly as Power").toBeTruthy();

    opened = applyOk(opened, { ...silver!, costCardIds: ["spell.fly"] });
    expect(opened.players.p1.spellBook).not.toContain("spell.fly");
    expect(opened.players.p1.discard).toContain("spell.fly");
    expect(opened.players.p1.combatStats.spellBookPowerUsedThisTurn).toBe(true);

    opened = chooseRedirect(opened, "p1", "unit_p2_skeletons");
    opened = passUntilSettled(opened);
    expect(opened.combat!.units.unit_p1_griffins.damage).toBe(0);
    expect(opened.combat!.units.unit_p2_skeletons.damage).toBe(1);
    assertBookCycled(opened, "p1");
  });
});

// ---------------------------------------------------------------------------
// (2) Area damage (Inferno blast)
// ---------------------------------------------------------------------------

describe("Spell Book Magic Mirror — area blast", () => {
  function castInferno(p1Book: string[]): GameState {
    const state = createInitialGameState("book-mm-inferno");
    state.players.p1.hand = [];
    state.players.p1.spellBook = [...p1Book];
    state.players.p2.hand = ["spell.inferno"];
    state.activePlayerId = "p2";
    state.combat!.activeUnitId = "unit_p2_vampires";
    state.combat!.units.unit_p2_vampires.activatedThisRound = false;
    state.combat!.units.unit_p2_vampires.position = 9; // blast centre
    state.combat!.units.unit_p1_marksmen.position = 8; // adjacent → in blast
    state.combat!.units.unit_p1_marksmen.maxHealth = 20;
    state.combat!.units.unit_p2_skeletons.position = 16; // far bronze redirect
    state.combat!.units.unit_p1_griffins.position = 0;
    state.combat!.units.unit_p1_crusaders.position = 6;
    state.combat!.units.unit_p2_dread_knights.position = 18;
    state.combat!.dice.scriptedRolls = [1, 0, 0, 0];
    state.combat!.dice.rollCount = 0;
    return applyOk(state, {
      type: "CAST_SPELL",
      playerId: "p2",
      cardId: "spell.inferno",
      target: { type: "space", position: 9 }
    });
  }

  it("Book Mirror recenters Inferno off your unit in the blast", () => {
    let state = castInferno(["spell.magic_mirror"]);
    expect(state.reactionWindow, "AOE window opens for Book-only Mirror").toBeTruthy();

    const mirror = bookMirror(state, "p1", 0);
    expect(mirror, "Book Magic Mirror vs Inferno blast").toBeTruthy();
    expect(mirror!.fromSpellBook).toBe(true);

    state = applyOk(state, mirror!);
    state = chooseRedirect(state, "p1", "unit_p2_skeletons");
    state = passUntilSettled(state);

    expect(state.combat!.units.unit_p1_marksmen.damage).toBe(0);
    expect(state.combat!.units.unit_p2_skeletons.damage).toBe(1);
    assertBookCycled(state, "p1");
  });

  it("CONTROL: empty Book → marksmen take the blast", () => {
    const state = passUntilSettled(castInferno([]));
    expect(state.combat!.units.unit_p1_marksmen.damage).toBe(1);
    expect(state.eventLog.some((event) => event.type === "SPELL_REDIRECTED")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// (3) Attack-instant debuff (Curse)
// ---------------------------------------------------------------------------

describe("Spell Book Magic Mirror — attack-instant Curse", () => {
  function p2AttacksWithCurse(p1Book: string[]): GameState {
    const state = createInitialGameState("book-mm-curse");
    state.players.p1.hand = [];
    state.players.p1.spellBook = [...p1Book];
    state.players.p2.hand = ["spell.curse"];
    state.activePlayerId = "p2";
    state.combat!.activeUnitId = "unit_p2_skeletons";
    state.combat!.units.unit_p2_skeletons.activatedThisRound = false;
    state.combat!.units.unit_p2_skeletons.position = 13;
    state.combat!.units.unit_p2_skeletons.maxHealth = 40;
    state.combat!.units.unit_p1_griffins.position = 9;
    state.combat!.units.unit_p1_griffins.maxHealth = 40;
    state.combat!.dice.scriptedRolls = [0, 0, 0, 0, 0, 0];
    state.combat!.dice.rollCount = 0;
    return applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p2",
      attackerId: "unit_p2_skeletons",
      defenderId: "unit_p1_griffins"
    });
  }

  function lastMainAttackRoll(state: GameState, attackerId: UnitId) {
    return [...state.eventLog]
      .reverse()
      .find((event) => event.type === "ATTACK_ROLLED" && event.attackerId === attackerId && !event.isRetaliation);
  }

  function retaliationRoll(state: GameState, attackerId: UnitId) {
    return [...state.eventLog]
      .reverse()
      .find((event) => event.type === "ATTACK_ROLLED" && event.attackerId === attackerId && event.isRetaliation);
  }

  it("Book Mirror lifts Curse off the defender and lands it on the chosen unit for the retaliation", () => {
    let state = p2AttacksWithCurse(["spell.magic_mirror"]);

    // p2 plays Curse into the attack window.
    const curse = getLegalActions(state, "p2").find(
      (legal) =>
        legal.action.type === "PLAY_REACTION" &&
        legal.action.cardId === "spell.curse" &&
        !legal.action.asPowerBoost
    );
    expect(curse, "Curse should be playable").toBeTruthy();
    state = applyOk(state, curse!.action);

    const mirror = bookMirror(state, "p1", 0);
    expect(mirror, "Book Magic Mirror must answer Curse on your defender").toBeTruthy();
    expect(mirror!.fromSpellBook).toBe(true);

    state = applyOk(state, mirror!);
    state = chooseRedirect(state, "p1", "unit_p2_skeletons");
    state = passUntilSettled(state);

    // Griffins' Defense unharmed on the main attack; skeletons take −1 Defense on retaliation.
    const roll = lastMainAttackRoll(state, "unit_p2_skeletons");
    expect(roll && roll.type === "ATTACK_ROLLED" ? roll.defenseBonus : null).toBe(0);
    const counter = retaliationRoll(state, "unit_p1_griffins");
    expect(counter && counter.type === "ATTACK_ROLLED" ? counter.defenderId : null).toBe("unit_p2_skeletons");
    expect(counter && counter.type === "ATTACK_ROLLED" ? counter.defenseBonus : null).toBe(-1);
    assertBookCycled(state, "p1");
  });

  it("CONTROL: empty Book → Curse sticks (−1 Defense on the main attack)", () => {
    let state = p2AttacksWithCurse([]);
    const curse = getLegalActions(state, "p2").find(
      (legal) =>
        legal.action.type === "PLAY_REACTION" &&
        legal.action.cardId === "spell.curse" &&
        !legal.action.asPowerBoost
    );
    state = applyOk(state, curse!.action);
    expect(bookMirror(state, "p1", 0)).toBeUndefined();
    state = passUntilSettled(state);
    const roll = lastMainAttackRoll(state, "unit_p2_skeletons");
    expect(roll && roll.type === "ATTACK_ROLLED" ? roll.defenseBonus : null).toBe(-1);
    expect(state.eventLog.some((event) => event.type === "SPELL_REDIRECTED")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Mutation guard: fromSpellBook flag is what the reducer needs
// ---------------------------------------------------------------------------

describe("Spell Book Magic Mirror — forged hand play is rejected", () => {
  it("rejects PLAY_REACTION without fromSpellBook when the Mirror is only in the Book", () => {
    const state = createInitialGameState("book-mm-forge");
    state.players.p1.hand = [];
    state.players.p1.spellBook = ["spell.magic_mirror"];
    state.players.p2.hand = ["spell.magic_arrow"];
    state.activePlayerId = "p2";
    state.combat!.activeUnitId = "unit_p2_skeletons";
    state.combat!.units.unit_p2_skeletons.activatedThisRound = false;

    const opened = applyOk(state, {
      type: "CAST_SPELL",
      playerId: "p2",
      cardId: "spell.magic_arrow",
      target: { type: "unit", unitId: "unit_p1_griffins" }
    });

    // Forge a hand-style play (no fromSpellBook) — must be rejected; the card is not in hand.
    const forged = applyAction(opened, {
      type: "PLAY_REACTION",
      playerId: "p1",
      cardId: "spell.magic_mirror",
      mode: "basic",
      optionIndex: 0
    });
    expect(forged.errors.length, "forged hand play of a Book-only Mirror must fail").toBeGreaterThan(0);
    expect(forged.state.players.p1.spellBook).toContain("spell.magic_mirror");
  });
});
