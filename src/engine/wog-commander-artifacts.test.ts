import { describe, expect, it } from "vitest";
import { commanderDefinitions, type CommanderSlug } from "@/data/commanders";
import {
  applyAction,
  createAdventureGameState,
  createInitialGameState,
  getLegalActions,
  makeCommanderCombatUnit,
  commanderUnitId,
  getNextUnitToActivate,
  DEFAULT_ANIME_OPTIONS
} from "./index";
import { finalizeCommandersAfterCombat } from "./commanders";
import { cardLibrary } from "@/data/cards/library";
import { EQUIPMENT_IDS } from "@/data/anime/equipment";
import {
  wogCommanderArtifactCardIds,
  wogCommanderArtifactMajorIds,
  wogCommanderArtifactMinorIds,
  wogCommanderArtifactRelicIds
} from "@/data/wog/commander-artifacts";
import {
  animeXianxiaArtifactMajorIds,
  animeXianxiaArtifactMinorIds,
  animeXianxiaArtifactRelicIds
} from "@/data/anime/artifacts";
import type { CommanderArtifactSlot, CommanderPlayerState, GameAction, GameState } from "./state";

/**
 * WOG Commander Artifacts (Task 2) — 8 authentic WoG commander items acquired
 * from the shared Artifact decks and bound PERMANENTLY into three slots
 * (weapon/armor/trinket). Every claim asserts the OBSERVABLE combat/economy
 * outcome (resolved damage, activation order, revive state, deck contents) with
 * a CONTROL, and fails if the wiring is removed.
 */

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function applyError(state: GameState, action: GameAction): string {
  const result = applyAction(state, action);
  expect(result.errors.length, "expected the action to be rejected").toBeGreaterThan(0);
  return result.errors.map((error) => error.message).join("; ");
}

/** Pass reactions / keep rolls until an attack settles. */
function settle(state: GameState): GameState {
  let current = state;
  let safety = 40;
  while (safety > 0 && (current.reactionWindow || current.pendingChoice?.type === "ATTACK_DIE_REROLL")) {
    safety -= 1;
    if (current.reactionWindow) {
      current = apply(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
      continue;
    }
    const choice = current.pendingChoice;
    if (choice?.type === "ATTACK_DIE_REROLL") {
      current = apply(current, {
        type: "CHOOSE_PENDING_ROLL",
        playerId: choice.playerId,
        choiceId: choice.id,
        candidateIndex: choice.candidates.length - 1
      });
    }
  }
  return current;
}

const WOG_ON = { enabled: true, commanders: true, newObjects: false, newCreatures: false, artifacts: true };

const AXE = "wog.artifact.axe_of_smashing"; // weapon, +2 Attack
const SWORD = "wog.artifact.sword_of_sharpness"; // weapon, +1 Might attack die
const SHIELD = "wog.artifact.hardened_shield"; // armor minor, +1 Defense
const MAIL = "wog.artifact.mithril_mail"; // armor major, +2 Health
const HELM = "wog.artifact.helm_of_immortality"; // armor relic, free revive
const BOOTS = "wog.artifact.boots_of_haste"; // trinket minor, +1 Initiative
const PENDANT = "wog.artifact.pendant_of_sorcery"; // trinket major, +1 cast Power
const RING = "wog.artifact.dragon_eye_ring"; // trinket relic, line attack behind

function freshCommander(
  slug: CommanderSlug,
  grades: Partial<CommanderPlayerState["grades"]> = {},
  artifacts?: Partial<Record<CommanderArtifactSlot, string>>
): CommanderPlayerState {
  return {
    slug,
    grades: { attack: 0, defense: 0, health: 0, damage: 0, magic: 0, speed: 0, ...grades },
    ...(artifacts ? { artifacts } : {})
  };
}

/** Combat sandbox with p1's commander on the battlefield, optional bound artifacts. */
function sandboxWithCommander(
  slug: CommanderSlug,
  grades: Partial<CommanderPlayerState["grades"]> = {},
  position = 9,
  artifacts?: Partial<Record<CommanderArtifactSlot, string>>
): GameState {
  const state = createInitialGameState();
  state.wog = { ...WOG_ON };
  state.players.p1.commander = freshCommander(slug, grades, artifacts);
  const unit = makeCommanderCombatUnit(state.players.p1, position);
  if (!unit) {
    throw new Error("expected a commander combat unit");
  }
  state.combat!.units[unit.id] = unit;
  state.players.p1.hand = [];
  state.players.p2.hand = [];
  return state;
}

// ===========================================================================
// Per-artifact effect in a REAL combat — each with a CONTROL.
// ===========================================================================

describe("WOG Commander Artifacts — combat stat effects", () => {
  /** The commander (paladin) melees the p2 skeletons; returns resolved damage. */
  function commanderMelee(
    artifacts: Partial<Record<CommanderArtifactSlot, string>> | undefined,
    scripted: number[] = [0, 0, 0, 0],
    grades: Partial<CommanderPlayerState["grades"]> = {}
  ): GameState {
    const state = sandboxWithCommander("paladin", grades, 9, artifacts);
    const commander = state.combat!.units[commanderUnitId("p1")];
    const defender = state.combat!.units.unit_p2_skeletons;
    defender.abilities = [];
    defender.position = 10; // adjacent to cell 9
    defender.defense = 0;
    defender.maxHealth = 20;
    defender.damage = 0;
    defender.retaliatedThisRound = true;
    state.combat!.activeUnitId = commander.id;
    state.activePlayerId = "p1";
    state.combat!.dice.scriptedRolls = scripted;
    state.combat!.dice.rollCount = 0;
    return settle(
      apply(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId: commander.id, defenderId: defender.id })
    );
  }

  it("Axe of Smashing (+2 Attack): the commander's hit lands 2 more damage", () => {
    // CONTROL: base Attack 2 + die 0 − defense 0 = 2 damage.
    expect(commanderMelee(undefined).combat!.units.unit_p2_skeletons.damage).toBe(2);
    // Axe bound: Attack 4 → 4 damage. The flat +2 folds into the unit's Attack.
    expect(commanderMelee({ weapon: AXE }).combat!.units.unit_p2_skeletons.damage).toBe(4);
  });

  it("Sword of Sharpness (+1 Might die): rolls an extra attack die even at Damage grade 0", () => {
    // CONTROL: no Might die is rolled — Attack 2, no mightRolls event field.
    const control = commanderMelee(undefined, [0]);
    expect(control.combat!.units.unit_p2_skeletons.damage).toBe(2);
    const controlMight = control.eventLog.flatMap((e) => (e.type === "ATTACK_ROLLED" && e.mightRolls ? [e.mightRolls] : []));
    expect(controlMight, "no Might dice without the sword").toEqual([]);

    // Sword bound: one extra Might die. Roll order = main die (0), then the die
    // — a "+1" raises the Attack: 2 + 1 = 3 damage, and the ATTACK_ROLLED event
    // carries the single Might roll.
    const withSword = commanderMelee({ weapon: SWORD }, [0, 1]);
    expect(withSword.combat!.units[commanderUnitId("p1")].abilities).toContain("commander-might-1");
    expect(withSword.combat!.units.unit_p2_skeletons.damage).toBe(3);
    const might = withSword.eventLog.flatMap((e) => (e.type === "ATTACK_ROLLED" && e.mightRolls ? [e.mightRolls] : []));
    expect(might).toEqual([[1]]);

    // A "−1" on the Might die instead LOWERS it: 2 − 1 = 1 (pins it is a real die).
    expect(commanderMelee({ weapon: SWORD }, [0, -1]).combat!.units.unit_p2_skeletons.damage).toBe(1);
  });

  it("Sword of Sharpness STACKS with a real Damage grade: grade 1 + sword rolls TWO Might dice", () => {
    // CONTROL: Damage grade 1 alone rolls ONE Might die — 2 + 1 = 3 damage.
    const gradeOnly = commanderMelee(undefined, [0, 1], { damage: 1 });
    expect(gradeOnly.combat!.units.unit_p2_skeletons.damage).toBe(3);
    const gradeMight = gradeOnly.eventLog.flatMap((e) => (e.type === "ATTACK_ROLLED" && e.mightRolls ? [e.mightRolls] : []));
    expect(gradeMight).toEqual([[1]]);

    // Grade 1 AND the sword: the grade's `commander-might-1` and the sword's
    // `commander-might-1` are BOTH on the unit (getUnitAbilityDefinitions maps
    // ids 1:1 — no dedupe), so getMightDiceCount sums them: TWO Might dice,
    // 2 + 1 + 1 = 4 damage. Guards the additive read against a future
    // Set/dedupe refactor silently eating the sword at exactly grade 1.
    const both = commanderMelee({ weapon: SWORD }, [0, 1, 1], { damage: 1 });
    const commander = both.combat!.units[commanderUnitId("p1")];
    expect(commander.abilities.filter((id) => id === "commander-might-1")).toHaveLength(2);
    expect(both.combat!.units.unit_p2_skeletons.damage).toBe(4);
    const bothMight = both.eventLog.flatMap((e) => (e.type === "ATTACK_ROLLED" && e.mightRolls ? [e.mightRolls] : []));
    expect(bothMight).toEqual([[1, 1]]);
  });

  it("Dragon Eye Ring (line attack): the unit directly behind the target is also struck", () => {
    function behindDamage(artifacts?: Partial<Record<CommanderArtifactSlot, string>>): number {
      const state = sandboxWithCommander("paladin", {}, 9, artifacts);
      state.combat!.obstacles = []; // clear the default obstacle on cell 11
      const commander = state.combat!.units[commanderUnitId("p1")];
      const target = state.combat!.units.unit_p2_skeletons;
      target.abilities = [];
      target.position = 10; // adjacent to the commander at 9
      target.defense = 0;
      target.maxHealth = 20;
      target.damage = 0;
      target.retaliatedThisRound = true;
      const behind = state.combat!.units.unit_p1_griffins;
      behind.abilities = [];
      behind.position = 11; // directly behind the target, in line from the commander
      behind.defense = 0;
      behind.maxHealth = 20;
      behind.damage = 0;
      behind.retaliatedThisRound = true;
      state.combat!.activeUnitId = commander.id;
      state.activePlayerId = "p1";
      state.combat!.dice.scriptedRolls = [0, 0, 0, 0];
      state.combat!.dice.rollCount = 0;
      const after = settle(
        apply(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId: commander.id, defenderId: target.id })
      );
      return after.combat!.units.unit_p1_griffins.damage;
    }
    // CONTROL: no ring → no follow-up, the unit behind is untouched.
    expect(behindDamage(undefined)).toBe(0);
    // Ring bound: the behind unit takes the attack-3 line hit (3 − defense 0 = 3).
    expect(behindDamage({ trinket: RING })).toBe(3);
  });
});

describe("WOG Commander Artifacts — defensive stat effects", () => {
  /** The p2 skeletons (attack 5) melee the commander; returns damage taken. */
  function commanderTakes(artifacts?: Partial<Record<CommanderArtifactSlot, string>>, attackerAttack = 5): number {
    const state = sandboxWithCommander("paladin", {}, 9, artifacts);
    const commander = state.combat!.units[commanderUnitId("p1")];
    commander.maxHealth = 40; // survive the hit so we can read the damage
    commander.retaliatedThisRound = true;
    const attacker = state.combat!.units.unit_p2_skeletons;
    attacker.abilities = [];
    attacker.attack = attackerAttack;
    attacker.position = 10;
    state.combat!.activeUnitId = attacker.id;
    state.activePlayerId = "p2";
    state.combat!.dice.scriptedRolls = [0, 0, 0, 0];
    state.combat!.dice.rollCount = 0;
    const after = settle(
      apply(state, { type: "ATTACK_UNIT", playerId: "p2", attackerId: attacker.id, defenderId: commander.id })
    );
    return after.combat!.units[commanderUnitId("p1")].damage;
  }

  it("Hardened Shield (+1 Defense): the incoming hit lands 1 less damage", () => {
    // CONTROL: base Defense 1 → 5 − 1 = 4 damage.
    expect(commanderTakes(undefined)).toBe(4);
    // Shield bound: Defense 2 → 5 − 2 = 3 damage.
    expect(commanderTakes({ armor: SHIELD })).toBe(3);
  });

  it("Mithril Mail (+2 Health): the commander survives a hit that kills the plain commander", () => {
    // A 5-damage hit (attack 6 − defense 1). Base Health is 4, so the CONTROL
    // commander dies; +2 Health = 6 survives.
    function diesTo(artifacts?: Partial<Record<CommanderArtifactSlot, string>>): boolean {
      const state = sandboxWithCommander("paladin", {}, 9, artifacts);
      const commander = state.combat!.units[commanderUnitId("p1")];
      commander.retaliatedThisRound = true;
      const attacker = state.combat!.units.unit_p2_skeletons;
      attacker.abilities = [];
      attacker.attack = 6;
      attacker.position = 10;
      state.combat!.activeUnitId = attacker.id;
      state.activePlayerId = "p2";
      state.combat!.dice.scriptedRolls = [0, 0, 0, 0];
      state.combat!.dice.rollCount = 0;
      const after = settle(
        apply(state, { type: "ATTACK_UNIT", playerId: "p2", attackerId: attacker.id, defenderId: commander.id })
      );
      const unit = after.combat!.units[commanderUnitId("p1")];
      return unit.damage >= unit.maxHealth;
    }
    expect(diesTo(undefined), "the base-Health commander dies to the 5-damage hit").toBe(true);
    expect(diesTo({ armor: MAIL }), "with Mithril Mail the commander survives").toBe(false);
  });
});

describe("WOG Commander Artifacts — Boots of Haste (+1 Initiative)", () => {
  it("flips the activation order against a same-speed enemy", () => {
    function firstToAct(artifacts?: Partial<Record<CommanderArtifactSlot, string>>): string | undefined {
      const state = sandboxWithCommander("paladin", {}, 9, artifacts);
      const commander = state.combat!.units[commanderUnitId("p1")];
      const enemy = state.combat!.units.unit_p2_skeletons;
      // Only the commander (p1, the attacker side) and one enemy still owe a turn;
      // every other unit is already done AND dropped below the contested tier so
      // it cannot skew the attacker-first tie-break at initiative 6.
      for (const unit of Object.values(state.combat!.units)) {
        if (unit.id === commander.id || unit.id === enemy.id) {
          continue;
        }
        unit.activatedThisRound = true;
        unit.initiative = 1;
      }
      enemy.activatedThisRound = false;
      enemy.initiative = 6; // one FASTER than the base commander (Speed grade 0 = 5)
      enemy.position = 15;
      state.combat!.attackerPlayerId = "p1";
      state.combat!.defenderPlayerId = "p2";
      return getNextUnitToActivate(state.combat!, state.activeEffects)?.id;
    }
    // CONTROL: Initiative 5 < enemy 6 → the enemy acts first.
    expect(firstToAct(undefined)).toBe("unit_p2_skeletons");
    // Boots bound: Initiative 6 ties the enemy, and the attacker (the commander)
    // wins the tie → the commander now acts first.
    expect(firstToAct({ trinket: BOOTS })).toBe(commanderUnitId("p1"));
  });
});

describe("WOG Commander Artifacts — Pendant of Sorcery (+1 cast Power)", () => {
  it("resolves the command cast one Power tier higher", () => {
    // Brute's Bloodlust ladder is +1/+1/+2 by Power tier (0/1/2). At Magic grade
    // 2 the commander is Power 1 (+1); the Pendant lifts it to Power 2 (+2).
    function castThenStrike(artifacts?: Partial<Record<CommanderArtifactSlot, string>>): number {
      let state = sandboxWithCommander("brute", { magic: 2 }, 9, artifacts);
      const crusaders = state.combat!.units.unit_p1_crusaders;
      crusaders.abilities = [];
      crusaders.attack = 2;
      crusaders.position = 6; // melee, adjacent to the skeletons at 10
      const skeletons = state.combat!.units.unit_p2_skeletons;
      skeletons.abilities = [];
      skeletons.position = 10;
      skeletons.defense = 0;
      skeletons.maxHealth = 20;
      skeletons.damage = 0;
      skeletons.retaliatedThisRound = true;
      const commander = state.combat!.units[commanderUnitId("p1")];
      state.combat!.activeUnitId = commander.id;
      state.activePlayerId = "p1";
      state.combat!.dice.scriptedRolls = [0, 0, 0, 0];
      state.combat!.dice.rollCount = 0;

      // Cast Bloodlust on the crusaders.
      const offer = getLegalActions(state, "p1").find(
        (legal) =>
          legal.action.type === "USE_UNIT_ABILITY" &&
          legal.action.abilityId === commanderDefinitions.brute.cast.abilityId
      );
      expect(offer, "Bloodlust cast offered").toBeTruthy();
      const opened = apply(state, offer!.action);
      const choice = opened.pendingChoice;
      if (choice?.type !== "ABILITY_TARGET_CHOICE") {
        throw new Error("expected the commander-cast target choice");
      }
      state = apply(opened, {
        type: "CHOOSE_ABILITY_TARGET",
        playerId: "p1",
        choiceId: choice.id,
        targetUnitId: "unit_p1_crusaders"
      });

      // Now the buffed crusaders strike.
      state.combat!.activeUnitId = "unit_p1_crusaders";
      state.activePlayerId = "p1";
      state.combat!.dice.scriptedRolls = [0, 0];
      state.combat!.dice.rollCount = 0;
      const after = settle(
        apply(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId: "unit_p1_crusaders", defenderId: "unit_p2_skeletons" })
      );
      return after.combat!.units.unit_p2_skeletons.damage;
    }
    // CONTROL: Power 1 Bloodlust → +1 → 2 + 1 = 3 damage.
    expect(castThenStrike(undefined)).toBe(3);
    // Pendant bound: Power 2 Bloodlust → +2 → 2 + 2 = 4 damage (one tier higher).
    expect(castThenStrike({ trinket: PENDANT })).toBe(4);
  });
});

describe("WOG Commander Artifacts — Helm of Immortality (free revive)", () => {
  it("a commander that dies in combat is NOT marked dead at combat end, and no gold is spent", () => {
    function finalizeDeath(artifacts?: Partial<Record<CommanderArtifactSlot, string>>) {
      const state = sandboxWithCommander("paladin", {}, 9, artifacts);
      const commander = state.combat!.units[commanderUnitId("p1")];
      commander.damage = commander.maxHealth; // struck down this combat
      const goldBefore = state.players.p1.resources.gold;
      finalizeCommandersAfterCombat(state);
      return {
        dead: Boolean(state.players.p1.commander?.dead),
        goldSpent: goldBefore - state.players.p1.resources.gold,
        events: state.eventLog.map((event) => event.type)
      };
    }
    // CONTROL: without the helm death persists (and a COMMANDER_DIED feed line).
    const control = finalizeDeath(undefined);
    expect(control.dead).toBe(true);
    expect(control.events).toContain("COMMANDER_DIED");
    expect(control.events).not.toContain("COMMANDER_ARTIFACT_SAVED");

    // Helm bound: the commander is revived FREE — not dead, no gold, a save line.
    const saved = finalizeDeath({ armor: HELM });
    expect(saved.dead).toBe(false);
    expect(saved.goldSpent).toBe(0);
    expect(saved.events).toContain("COMMANDER_ARTIFACT_SAVED");
    expect(saved.events).not.toContain("COMMANDER_DIED");
  });
});

// ===========================================================================
// Bind flow — the map play, its legality, and permanence across death/revive.
// ===========================================================================

function adventureWithArtifacts(seed: string, wogOverride: Partial<typeof WOG_ON> = {}): GameState {
  return createAdventureGameState({
    seed,
    ruleset: "binh",
    wog: { ...WOG_ON, ...wogOverride },
    rollFirstPlayer: false,
    players: [
      { id: "p1", name: "One", factionId: "castle" as never, heroDefId: "catherine" },
      { id: "p2", name: "Two", factionId: "necropolis" as never }
    ]
  });
}

function openMapTurn(state: GameState): GameState {
  for (const player of Object.values(state.players)) {
    player.canMulligan = false;
    player.needsHandRefresh = false;
  }
  state.activePlayerId = "p1";
  state.players.p1.removed = [];
  return state;
}

function findBindPlay(state: GameState, cardId: string): GameAction | undefined {
  return getLegalActions(state, "p1").find(
    (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === cardId
  )?.action;
}

describe("WOG Commander Artifacts — bind flow", () => {
  it("binds a card to its slot, removes it from the game (not the discard), and emits the event", () => {
    const state = openMapTurn(adventureWithArtifacts("bind-ok"));
    state.players.p1.hand = [AXE];
    const play = findBindPlay(state, AXE);
    expect(play, "the bind play should be offered on the map turn").toBeTruthy();

    const after = apply(state, play!);
    expect(after.players.p1.commander?.artifacts?.weapon).toBe(AXE);
    expect(after.players.p1.removed).toContain(AXE);
    expect(after.players.p1.discard).not.toContain(AXE);
    expect(after.players.p1.hand).not.toContain(AXE);
    expect(after.eventLog.some((event) => event.type === "COMMANDER_ARTIFACT_BOUND")).toBe(true);
  });

  it("binding removes the equipment card and auto-grants a REGULAR Artifact of the SAME grade", () => {
    const state = openMapTurn(adventureWithArtifacts("bind-same-grade-grant"));
    // AXE is major-tier commander equipment. Seed a known major regular artifact
    // on top of the major draw pile so the grant is deterministic.
    const MAJOR_REGULAR = "artifact.surcoat_of_counterpoise";
    const majorDeck = state.decks["artifacts-major"];
    expect(majorDeck, "BINH split major deck").toBeTruthy();
    expect(cardLibrary[MAJOR_REGULAR]?.artifactTier).toBe("major");
    // Ensure the seed card is acquirable and NOT a commander artifact.
    expect(wogCommanderArtifactCardIds).not.toContain(MAJOR_REGULAR);
    majorDeck!.drawPile = [...majorDeck!.drawPile.filter((id) => id !== MAJOR_REGULAR), MAJOR_REGULAR];
    state.players.p1.hand = [AXE];
    const handBefore = [...state.players.p1.hand];

    const after = apply(state, findBindPlay(state, AXE)!);
    // Card equipment is gone (removed, not discard).
    expect(after.players.p1.removed).toContain(AXE);
    expect(after.players.p1.hand).not.toContain(AXE);
    // Same-grade REGULAR artifact lands in hand.
    expect(after.players.p1.hand).toContain(MAJOR_REGULAR);
    expect(cardLibrary[MAJOR_REGULAR]?.artifactTier).toBe("major");
    expect(wogCommanderArtifactCardIds).not.toContain(MAJOR_REGULAR);
    // The bound slot still holds the commander equipment.
    expect(after.players.p1.commander?.artifacts?.weapon).toBe(AXE);
    // Feed note announces the grant.
    expect(
      after.eventLog.some(
        (e) =>
          e.type === "EVENT_NOTE" &&
          /receives .* \(major Artifact\) for using equipment/i.test((e as { message?: string }).message ?? "")
      )
    ).toBe(true);
    // CONTROL shape: net hand change is −1 commander card +1 regular (size can
    // vary if the seed was already held — here hand started as [AXE] only).
    expect(handBefore).toEqual([AXE]);
    expect(after.players.p1.hand).toContain(MAJOR_REGULAR);
  });

  it("CONTROL: the same-grade grant skips other commander-artifact cards", () => {
    const state = openMapTurn(adventureWithArtifacts("bind-skip-commander"));
    const majorDeck = state.decks["artifacts-major"]!;
    // drawPile.pop takes LAST. Stack [regular, commander] ⇒ commander drawn first
    // and must be skipped; regular taken next.
    const REGULAR = "artifact.surcoat_of_counterpoise";
    majorDeck.drawPile = majorDeck.drawPile.filter(
      (id) => id !== REGULAR && id !== SWORD && !wogCommanderArtifactCardIds.includes(id)
    );
    majorDeck.drawPile.push(REGULAR, SWORD);
    state.players.p1.hand = [AXE];

    const after = apply(state, findBindPlay(state, AXE)!);
    expect(after.players.p1.hand).toContain(REGULAR);
    expect(after.players.p1.hand).not.toContain(SWORD);
    // Skipped commander card is tucked under the deck (not destroyed).
    expect(after.decks["artifacts-major"]!.drawPile.includes(SWORD)).toBe(true);
  });

  it("an OCCUPIED slot is not offered and a forged play is rejected", () => {
    const state = openMapTurn(adventureWithArtifacts("bind-occupied"));
    state.players.p1.commander!.artifacts = { weapon: SWORD }; // weapon slot already filled
    state.players.p1.hand = [AXE];
    expect(findBindPlay(state, AXE), "no second weapon is offered").toBeUndefined();
    // The forged play is rejected (by the legal-action guard, backed by the
    // reducer's own occupied-slot check) and changes nothing.
    applyError(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: AXE,
      mode: "basic",
      optionIndex: 0,
      target: { type: "none" }
    });
    expect(state.players.p1.commander?.artifacts?.weapon).toBe(SWORD);
    expect(state.players.p1.hand).toContain(AXE);
  });

  it("with the Commanders module off (no commander) the play is not offered and a forged play is rejected", () => {
    const state = openMapTurn(adventureWithArtifacts("bind-no-cmd", { commanders: false }));
    expect(state.players.p1.commander, "no commander without the module").toBeUndefined();
    state.players.p1.hand = [AXE];
    expect(findBindPlay(state, AXE)).toBeUndefined();
    // The forged play is rejected and the card stays in hand (nothing bound).
    applyError(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: AXE,
      mode: "basic",
      optionIndex: 0,
      target: { type: "none" }
    });
    expect(state.players.p1.hand).toContain(AXE);
    expect(state.players.p1.commander).toBeUndefined();
  });

  it("the bound bonus PERSISTS through death and a paid revive", () => {
    const state = openMapTurn(adventureWithArtifacts("bind-persist"));
    state.players.p1.hand = [AXE];
    let current = apply(state, findBindPlay(state, AXE)!);
    expect(current.players.p1.commander?.artifacts?.weapon).toBe(AXE);
    // The next combat unit reads the +2 (base Attack 2 + Axe 2 = 4).
    expect(makeCommanderCombatUnit(current.players.p1, 9)?.attack).toBe(4);

    // Kill and pay to revive.
    current.players.p1.commander!.dead = true;
    current.players.p1.resources.gold = 50;
    current = apply(current, { type: "REVIVE_COMMANDER", playerId: "p1" });
    expect(current.players.p1.commander?.dead).toBeFalsy();
    // The artifact is still bound and the rebuilt unit still gets the +2.
    expect(current.players.p1.commander?.artifacts?.weapon).toBe(AXE);
    expect(makeCommanderCombatUnit(current.players.p1, 9)?.attack).toBe(4);
  });
});

// ===========================================================================
// Deck join — the THREE-way module gate (enabled && artifacts && commanders).
// ===========================================================================

function allDeckCardIds(state: GameState): string[] {
  return Object.values(state.decks).flatMap((deck) => [...deck.drawPile, ...deck.discardPile]);
}

function artifactDeckCardIds(state: GameState, deckId: string): string[] {
  const deck = state.decks[deckId];
  return deck ? [...deck.drawPile, ...deck.discardPile] : [];
}

function countOf(ids: string[], id: string): number {
  return ids.filter((candidate) => candidate === id).length;
}

describe("WOG Commander Artifacts — deck join (three-way gate)", () => {
  function deckState(wog: Partial<typeof WOG_ON>, anime?: { enabled: boolean; xianxiaArtifacts: boolean }): GameState {
    return createAdventureGameState({
      seed: "cmd-art-deck",
      difficulty: "normal",
      rollFirstPlayer: false,
      wog: { ...WOG_ON, ...wog },
      ...(anime ? { anime } : {})
    });
  }

  it("joins the split decks ONLY when enabled && artifacts && commanders are ALL on", () => {
    const on = deckState({});
    for (const id of wogCommanderArtifactMinorIds) {
      expect(countOf(artifactDeckCardIds(on, "artifacts-minor"), id), `${id} in minor`).toBe(1);
    }
    for (const id of wogCommanderArtifactMajorIds) {
      expect(countOf(artifactDeckCardIds(on, "artifacts-major"), id), `${id} in major`).toBe(1);
    }
    for (const id of wogCommanderArtifactRelicIds) {
      expect(countOf(artifactDeckCardIds(on, "artifacts-relic"), id), `${id} in relic`).toBe(1);
    }
    // Exactly once table-wide (no leakage into a second deck).
    for (const id of wogCommanderArtifactCardIds) {
      expect(countOf(allDeckCardIds(on), id), `${id} once table-wide`).toBe(1);
    }
  });

  it("CONTROL — each flag individually off joins ZERO commander-artifact ids", () => {
    for (const off of [
      { commanders: false }, // artifacts on, commanders off
      { artifacts: false }, // commanders on, artifacts off
      { enabled: false } // master off
    ] as const) {
      const ids = allDeckCardIds(deckState(off));
      for (const id of wogCommanderArtifactCardIds) {
        expect(countOf(ids, id), `${JSON.stringify(off)} → ${id}`).toBe(0);
      }
    }
  });

  it("legacy single Artifact deck: every commander-artifact id joins it once when all three are on", () => {
    const legacy = createAdventureGameState({
      seed: "cmd-art-legacy",
      difficulty: "normal",
      rollFirstPlayer: false,
      houseRules: { "split-decks": false },
      wog: { ...WOG_ON }
    });
    expect(legacy.decks["artifacts-relic"]).toBeUndefined();
    const combined = artifactDeckCardIds(legacy, "artifacts");
    for (const id of wogCommanderArtifactCardIds) {
      expect(countOf(combined, id), `${id} in the combined legacy deck`).toBe(1);
    }
  });

  it("coexists with the anime Pháp Bảo artifacts — both mods' ids join the SAME decks, side by side", () => {
    const both = deckState({}, { enabled: true, xianxiaArtifacts: true });
    const tiers = [
      { deckId: "artifacts-minor", anime: animeXianxiaArtifactMinorIds, wog: wogCommanderArtifactMinorIds },
      { deckId: "artifacts-major", anime: animeXianxiaArtifactMajorIds, wog: wogCommanderArtifactMajorIds },
      { deckId: "artifacts-relic", anime: animeXianxiaArtifactRelicIds, wog: wogCommanderArtifactRelicIds }
    ] as const;
    for (const { deckId, anime, wog } of tiers) {
      const ids = artifactDeckCardIds(both, deckId);
      for (const id of anime) {
        expect(countOf(ids, id), `${id} (anime) in ${deckId}`).toBe(1);
      }
      for (const id of wog) {
        expect(countOf(ids, id), `${id} (wog commander) in ${deckId}`).toBe(1);
      }
    }
  });

  it("divides commander equipment into 3 grades properly (every slot has minor+major+relic)", () => {
    const bySlot: Record<string, Set<string>> = { weapon: new Set(), armor: new Set(), trinket: new Set() };
    for (const id of wogCommanderArtifactCardIds) {
      const card = cardLibrary[id]!;
      const specTier = card.artifactTier!;
      // Parse slot from tags / effect
      const effect = card.effect;
      expect(effect.type).toBe("CHOOSE_ONE");
      if (effect.type !== "CHOOSE_ONE") return;
      const bind = effect.options[0]?.effect;
      expect(bind?.type).toBe("BIND_COMMANDER_ARTIFACT");
      if (bind?.type !== "BIND_COMMANDER_ARTIFACT") return;
      bySlot[bind.slot].add(specTier);
    }
    for (const slot of ["weapon", "armor", "trinket"] as const) {
      expect(bySlot[slot].has("minor"), `${slot} needs minor`).toBe(true);
      expect(bySlot[slot].has("major"), `${slot} needs major`).toBe(true);
      expect(bySlot[slot].has("relic"), `${slot} needs relic`).toBe(true);
    }
    // Grade-fill weapons
    expect(wogCommanderArtifactMinorIds).toContain("wog.artifact.iron_cudgel");
    expect(wogCommanderArtifactRelicIds).toContain("wog.artifact.doomsday_blade");
  });

  it("every commander-artifact id resolves in the card library (lookup path), even module-off", () => {
    for (const id of wogCommanderArtifactCardIds) {
      expect(cardLibrary[id], `${id} must be registered`).toBeTruthy();
      expect(cardLibrary[id].kind).toBe("artifact");
    }
  });
});

// ===========================================================================
// Cross-mod coexistence seam — the anime Equipment Iron-Blood Sword and the
// commander Axe both apply to the commander's first attack (they STACK).
// ===========================================================================

describe("WOG Commander Artifacts — anime Equipment coexistence", () => {
  it("the commander's first attack stacks the Axe (+2) AND the Iron-Blood Sword (+1)", () => {
    // The Iron-Blood Sword's first-attack +1 is keyed off the ATTACKER's
    // controller (a per-player charge), so the commander — a unit that player
    // controls — DOES count. It therefore stacks with the bound Axe on the
    // commander's first declared attack.
    function firstStrike(opts: { axe?: boolean; equip?: boolean }): number {
      const state = createInitialGameState();
      state.wog = { ...WOG_ON };
      if (opts.equip) {
        state.anime = { ...DEFAULT_ANIME_OPTIONS, enabled: true, equipment: true };
        state.heroes.hero_p1.equipment = { weapon: EQUIPMENT_IDS.ironBloodSword };
      }
      state.players.p1.commander = freshCommander("paladin", {}, opts.axe ? { weapon: AXE } : undefined);
      const unit = makeCommanderCombatUnit(state.players.p1, 9)!;
      state.combat!.units[unit.id] = unit;
      const target = state.combat!.units.unit_p2_skeletons;
      target.abilities = [];
      target.position = 10;
      target.defense = 0;
      target.maxHealth = 30;
      target.damage = 0;
      target.retaliatedThisRound = true;
      state.combat!.activeUnitId = unit.id;
      state.activePlayerId = "p1";
      state.combat!.dice.scriptedRolls = [0, 0, 0, 0];
      state.combat!.dice.rollCount = 0;
      return settle(
        apply(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId: unit.id, defenderId: target.id })
      ).combat!.units.unit_p2_skeletons.damage;
    }
    expect(firstStrike({}), "neither: base Attack 2").toBe(2);
    expect(firstStrike({ axe: true }), "Axe alone: 2 + 2").toBe(4);
    expect(firstStrike({ equip: true }), "Equipment sword alone: 2 + 1").toBe(3);
    expect(firstStrike({ axe: true, equip: true }), "both STACK: 2 + 2 + 1").toBe(5);
  });
});
