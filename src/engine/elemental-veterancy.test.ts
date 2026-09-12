import { describe, expect, it } from "vitest";
import {
  applyAction,
  createInitialGameState,
  markUnitRemovedIfNeeded,
  makeActiveEffect,
  getLegalActions,
} from "./index";
import { maybeOpenPlayerActivationChoice } from "./reducer";
import { cardLibrary } from "@/data/cards/library";
import { rankScheduleFor } from "@/data/units/experience";
import { appendEvent } from "./events";
import {
  elementalActivation,
  elementalAfterAttack,
  elementalMovement,
  openElementalChoice,
  queueElementalChoice,
  resolveElementalChoice,
  noteElementalSpellCast,
  type ElementalHooks,
} from "./elemental-veterancy";
import { getActivationStep, getLegalMoveDestinations } from "./legal-actions";
import { finishCombatIfNeeded } from "./combat-units";
import { unitRankStatBonusesFor } from "./unit-experience";
import type { GameState, GameAction, CombatUnitState } from "./state";

const A = "unit_p1_griffins",
  D = "unit_p2_skeletons";
function fixture(): GameState {
  const s = createInitialGameState("elemental-veterancy");
  for (const u of Object.values(s.combat!.units)) {
    u.abilities = [];
    u.damage = 0;
    u.maxHealth = 30;
    u.attack = 3;
    u.defense = 0;
    u.activatedThisRound = false;
    u.movedThisActivation = false;
    u.defenseToken = false;
  }
  Object.assign(s.combat!.units[A], {
    position: 9,
    type: "ground",
    initiative: 10,
  });
  Object.assign(s.combat!.units[D], {
    position: 13,
    type: "ground",
    initiative: 5,
  });
  s.combat!.units.unit_p1_marksmen.position = 0;
  s.combat!.units.unit_p1_crusaders.position = 3;
  s.combat!.units.unit_p2_vampires.position = 19;
  s.combat!.units.unit_p2_dread_knights.position = 16;
  s.combat!.activeUnitId = A;
  s.combat!.obstacles = [];
  s.combat!.dice.scriptedRolls = Array(50).fill(0);
  s.combat!.dice.rollCount = 0;
  s.players.p1.hand = [];
  s.players.p2.hand = [];
  s.activePlayerId = "p1";
  s.phase = "combat";
  s.pendingChoice = null;
  s.reactionWindow = null;
  return s;
}
function ok(s: GameState, a: GameAction) {
  const result = applyAction(s, a);
  expect(result.errors, JSON.stringify(result.errors)).toEqual([]);
  return result.state;
}
function settle(s: GameState): GameState {
  for (let i = 0; i < 50; i++) {
    if (s.reactionWindow) {
      s = ok(s, {
        type: "PASS_REACTION",
        playerId: s.reactionWindow.priorityPlayerId,
      });
      continue;
    }
    if (s.pendingChoice?.type === "ATTACK_DIE_REROLL") {
      s = ok(s, {
        type: "CHOOSE_PENDING_ROLL",
        playerId: s.pendingChoice.playerId,
        choiceId: s.pendingChoice.id,
        candidateIndex: 0,
      });
      continue;
    }
    break;
  }
  return s;
}
function attack(s: GameState) {
  return settle(
    ok(s, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: A,
      defenderId: D,
    }),
  );
}
function cast(s: GameState, cardId: string, targetId = D) {
  s.players.p1.hand = [cardId];
  return settle(
    ok(s, {
      type: "CAST_SPELL",
      playerId: "p1",
      cardId,
      target: { type: "unit", unitId: targetId },
    }),
  );
}
function abilityTarget(s: GameState, targetId = D) {
  const action = getLegalActions(s, s.pendingChoice!.playerId)
    .map((x) => x.action)
    .find(
      (a) =>
        a.type === "CHOOSE_ABILITY_TARGET" &&
        JSON.stringify(a).includes(targetId),
    );
  expect(action).toBeTruthy();
  return ok(s, action!);
}
function damage(s: GameState) {
  return s.eventLog
    .filter((e) => e.type === "ATTACK_ROLLED" && !e.isRetaliation)
    .at(-1);
}
function hit(s: GameState, u: CombatUnitState, amount: number) {
  u.damage += amount;
  appendEvent(s, {
    type: "DAMAGE_ASSIGNED",
    target: { type: "unit", unitId: u.id },
    source: { type: "system" },
    amount,
    damageKind: "effect",
  });
  markUnitRemovedIfNeeded(s, u);
}
const hooks: ElementalHooks = {
  chooser: (_s, _c, u) => u.controllerId,
  damage: (s, _u, id, _a, _n, amount) => hit(s, s.combat!.units[id], amount),
  targets: () => [],
  copy: () => {
    throw new Error("Unexpected copy");
  },
  copyBolt: () => {
    throw new Error("Unexpected bolt");
  },
  dispelAttack: () => {
    throw new Error("Unexpected attack");
  },
};
function choose(s: GameState, index = 0) {
  expect(openElementalChoice(s, hooks)).toBe(true);
  const p = s.pendingChoice!;
  resolveElementalChoice(
    s,
    {
      type: "CHOOSE_OPTION",
      playerId: p.playerId,
      choiceId: p.id,
      optionIndex: index,
    },
    hooks,
  );
}

describe("Elemental experience combat outcomes", () => {
  it.each([
    ["neutral.sprites", 2, "veteran-sprite-spell-block"],
    ["neutral.sprites", 3, "veteran-sprite-landing"],
    ["neutral.ice_elementals", 1, "veteran-ice-bolt"],
    ["neutral.ice_elementals", 4, "veteran-frozen-guard"],
    ["neutral.storm_elementals", 1, "ignore-all-combat-penalties"],
    ["neutral.storm_elementals", 3, "veteran-distant-storm"],
    ["neutral.storm_elementals", 4, "veteran-storm-guard"],
    ["neutral.energy_elementals", 3, "veteran-energy-drain"],
    ["neutral.energy_elementals", 4, "teleport-move"],
    ["neutral.magma_elementals", 3, "veteran-magma-hunter"],
    ["neutral.magma_elementals", 4, "veteran-magma-guard"],
    ["neutral.magic_elementals", 1, "veteran-magic-splash"],
    ["neutral.magic_elementals", 4, "veteran-arcane-echo"],
    ["neutral.phoenixes", 1, "veteran-phoenix-breath"],
    ["neutral.phoenixes", 4, "veteran-renewed-rebirth"],
    ["conflux.ice_elementals", 1, "veteran-ice-bolt"],
    ["conflux.ice_elementals", 4, "veteran-water-damper"],
    ["conflux.sprites", 3, "veteran-sprite-obstacle"],
    ["conflux.sprites", 4, "veteran-sprite-landing"],
    ["conflux.storm_elementals", 3, "veteran-storm-speed"],
    ["conflux.storm_elementals", 4, "veteran-storm-link-2"],
    ["conflux.energy_elementals", 1, "veteran-energy-delay"],
    ["conflux.energy_elementals", 3, "veteran-energy-fire-heal"],
    ["conflux.magma_elementals", 1, "veteran-magma-solidify"],
    ["conflux.magma_elementals", 4, "veteran-earth-shield"],
    ["conflux.magic_elementals", 1, "veteran-magic-dispel"],
    ["conflux.magic_elementals", 4, "veteran-magic-copy"],
    ["conflux.phoenixes", 2, "veteran-phoenix-activation"],
    ["conflux.phoenixes", 4, "veteran-phoenix-nest"],
  ] as const)("routes %s rank %i to %s", (id, rank, ability) => {
    const step = rankScheduleFor(id)[rank];
    expect(step.kind !== "stats" && step.choices).toEqual([ability]);
  });
  it("Ice Bolt activation deals one spell damage, leaves normal actions available and respects Water immunity", () => {
    const s = fixture();
    s.combat!.units[A].abilities = ["veteran-ice-bolt"];
    maybeOpenPlayerActivationChoice(s);
    const r = abilityTarget(s);
    expect(r.combat!.units[D].damage).toBe(1);
    expect(r.combat!.units[A].activatedThisRound).toBe(false);
    expect(
      r.eventLog.some(
        (e) =>
          e.type === "DAMAGE_ASSIGNED" &&
          e.damageKind === "spell" &&
          e.amount === 1,
      ),
    ).toBe(true);
    const blocked = fixture();
    blocked.combat!.units[A].abilities = ["veteran-ice-bolt"];
    blocked.combat!.units[D].abilities = ["water-elemental-immunity"];
    maybeOpenPlayerActivationChoice(blocked);
    expect(abilityTarget(blocked).combat!.units[D].damage).toBe(0);
  });
  it.each([-1, 0, 1])(
    "Sprite blocks targeted spells on −1/0, roll %s",
    (roll) => {
      const s = fixture();
      s.combat!.units[D].abilities = ["veteran-sprite-spell-block"];
      s.combat!.dice.scriptedRolls = Array(30).fill(roll);
      const r = cast(s, "spell.magic_arrow");
      expect(r.combat!.units[D].damage).toBe(roll <= 0 ? 0 : 1);
      expect(
        r.eventLog.some(
          (e) =>
            e.type === "UNIT_ABILITY_TRIGGERED" &&
            e.abilityId.startsWith("veteran-sprite-spell-block") &&
            e.dice?.success === roll <= 0,
        ),
      ).toBe(true);
    },
  );
  it("Frozen Guard prevents two spell damage while defending", () => {
    const s = fixture();
    s.combat!.units[D].abilities = ["veteran-frozen-guard"];
    s.combat!.units[D].defenseToken = true;
    expect(cast(s, "spell.magic_arrow").combat!.units[D].damage).toBe(0);
    s.combat!.units[D].defenseToken = false;
    expect(cast(s, "spell.magic_arrow").combat!.units[D].damage).toBe(1);
  });
  it("guard intercepts repeated attacks on adjacent allies without retaliation", () => {
    const s = fixture(),
      guard = s.combat!.units.unit_p2_vampires;
    guard.position = 14;
    guard.defenseToken = true;
    guard.activatedThisRound = true;
    guard.abilities = ["veteran-magma-guard"];
    let r = attack(s);
    expect(r.combat!.units[D].damage).toBe(0);
    expect(r.combat!.units[guard.id].damage).toBe(3);
    expect(
      r.eventLog.filter((e) => e.type === "ATTACK_ROLLED" && e.isRetaliation),
    ).toHaveLength(0);
    r.combat!.units[A].activatedThisRound = false;
    r.combat!.units[A].attackedThisActivation = false;
    r.combat!.activeUnitId = A;
    r.pendingChoice = null;
    r.reactionWindow = null;
    r = attack(r);
    expect(r.combat!.units[D].damage).toBe(0);
    expect(r.combat!.units[guard.id].damage).toBe(6);
  });
  it("Dispelling Strike is optional, removes an ongoing effect and loses two attack", () => {
    let s = fixture();
    s.combat!.units[A].abilities = ["veteran-magic-dispel"];
    s.activeEffects.push(
      makeActiveEffect(
        s,
        {
          name: "Ward",
          scope: "unit",
          duration: { type: "combat" },
          modifiers: [{ type: "DEFENSE_BONUS", amount: 1 }],
        },
        { type: "system" },
        "p2",
        { type: "unit", unitId: D },
      ),
    );
    s = attack(s);
    expect(s.pendingChoice?.type).toBe("OPTION_CHOICE");
    s = settle(
      ok(s, {
        type: "CHOOSE_OPTION",
        playerId: "p1",
        choiceId: s.pendingChoice!.id,
        optionIndex: 0,
      }),
    );
    expect(s.activeEffects.some((e) => e.name === "Ward")).toBe(false);
    expect(damage(s)).toMatchObject({ damage: 1 });
    expect(s.combat!.units[A].elementalVeterancy?.dispelUsed).toBe(true);
  });
  it("Spell Echo copies the enemy spell without consuming a card or spell limit", () => {
    let s = fixture();
    s.combat!.units[D].abilities = ["veteran-magic-copy"];
    s = cast(s, "spell.magic_arrow");
    expect(s.pendingChoice?.type).toBe("OPTION_CHOICE");
    const before = structuredClone(s.players.p2.combatStats);
    s = settle(
      ok(s, {
        type: "CHOOSE_OPTION",
        playerId: "p2",
        choiceId: s.pendingChoice!.id,
        optionIndex: 0,
      }),
    );
    expect(
      Object.values(s.combat!.units)
        .filter((u) => u.controllerId === "p1")
        .reduce((n, u) => n + u.damage, 0),
    ).toBe(1);
    expect(s.players.p2.combatStats.spellsCastThisRound).toBe(
      before.spellsCastThisRound,
    );
    expect(s.players.p2.hand).toEqual([]);
    expect(s.pendingChoice).toBeNull();
  });
  it("Magma debt is paid at round end without Solidify or Earth Shield reducing it", () => {
    let s = fixture();
    const d = s.combat!.units[D];
    d.abilities = ["veteran-earth-shield"];
    d.damage = 4;
    d.elementalVeterancy = {
      delayUsedRound: s.combat!.round,
      deferredDamage: 2,
      deferredRound: s.combat!.round,
      solidifyUntilRound: s.combat!.round + 1,
    };
    for (const u of Object.values(s.combat!.units)) u.activatedThisRound = true;
    s.combat!.activeUnitId = null;
    s = ok(s, { type: "END_COMBAT_ROUND", playerId: "p1" });
    expect(s.combat!.units[D].damage).toBe(6);
    expect(s.combat!.units[D].elementalVeterancy?.deferredDamage).toBe(0);
  });
  it("Water Dampening lowers enemy Cure's healing by one and ignores friendly auras", () => {
    const s = fixture();
    s.combat!.units[A].damage = 6;
    s.activeEffects.push(
      makeActiveEffect(
        s,
        {
          name: "Power",
          scope: "player",
          duration: { type: "combat" },
          modifiers: [{ type: "SPELL_POWER_BONUS", amount: 2 }],
        },
        { type: "system" },
        "p1",
      ),
    );
    expect(cast(s, "spell.cure", A).combat!.units[A].damage).toBe(3);
    s.combat!.units[D].abilities = ["veteran-water-damper"];
    expect(cast(s, "spell.cure", A).combat!.units[A].damage).toBe(4);
    s.combat!.units[D].abilitiesSuppressed = true;
    expect(cast(s, "spell.cure", A).combat!.units[A].damage).toBe(3);
  });
  it("Phoenix breath damages the unit directly behind a target without harming unrelated units", () => {
    const s = fixture();
    s.combat!.units[A].abilities = [
      "veteran-phoenix-breath",
      "ignores-retaliation",
    ];
    s.combat!.units.unit_p2_vampires.position = 17;
    const r = attack(s);
    expect(r.combat!.units.unit_p2_vampires.damage).toBe(2);
    expect(r.combat!.units.unit_p2_dread_knights.damage).toBe(0);
  });
  it("Magic Elemental splash damages surrounding enemies and spares allies", () => {
    const s = fixture();
    s.combat!.units[A].abilities = [
      "veteran-magic-splash",
      "ignores-retaliation",
    ];
    s.combat!.units.unit_p2_vampires.position = 10;
    s.combat!.units.unit_p1_marksmen.position = 8;
    const r = attack(s);
    expect(r.combat!.units[D].damage).toBe(4);
    expect(r.combat!.units.unit_p2_vampires.damage).toBe(1);
    expect(r.combat!.units.unit_p1_marksmen.damage).toBe(0);
  });
  it("a real move resolves Landing Sting before the unit can attack", () => {
    let s = fixture();
    s.combat!.units[A].abilities = [
      "veteran-sprite-landing",
      "ignores-retaliation",
    ];
    s.combat!.units[A].position = 5;
    expect(
      getLegalMoveDestinations(s.combat!, s.combat!.units[A], s),
    ).toContain(9);
    s = ok(s, { type: "MOVE_UNIT", playerId: "p1", unitId: A, destination: 9 });
    expect(s.pendingChoice?.type).toBe("OPTION_CHOICE");
    expect(damage(s)).toBeUndefined();
    s = settle(
      ok(s, {
        type: "CHOOSE_OPTION",
        playerId: "p1",
        choiceId: s.pendingChoice!.id,
        optionIndex: 0,
      }),
    );
    expect(s.combat!.units[D].damage).toBe(1);
    s = attack(s);
    expect(s.combat!.units[D].damage).toBe(4);
    expect(damage(s)).toMatchObject({ defenderId: D, damage: 3 });
  });
  it("a real Defend offers Solidify and permits movement after next round's attack", () => {
    let s = fixture();
    const a = s.combat!.units[A];
    a.abilities = ["veteran-magma-solidify", "ignores-retaliation"];
    s = ok(s, { type: "DEFEND_UNIT", playerId: "p1", unitId: A });
    expect(s.pendingChoice?.type).toBe("OPTION_CHOICE");
    s = ok(s, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: s.pendingChoice!.id,
      optionIndex: 0,
    });
    s.pendingChoice = null;
    s.reactionWindow = null;
    s.combat!.activeUnitId = A;
    s.combat!.round++;
    s.combat!.units[A].activatedThisRound = false;
    s.combat!.units[A].attackedThisActivation = false;
    expect(getLegalMoveDestinations(s.combat!, s.combat!.units[A], s)).toEqual(
      [],
    );
    s = attack(s);
    expect(s.combat!.activeUnitId).toBe(A);
    expect(s.combat!.units[A].activatedThisRound).toBe(false);
    expect(
      getLegalMoveDestinations(s.combat!, s.combat!.units[A], s).length,
    ).toBeGreaterThan(0);
  });
  it("Magic Elementals can copy an activation Ice Bolt", () => {
    let s = fixture();
    s.combat!.units[A].abilities = ["veteran-ice-bolt"];
    s.combat!.units[D].abilities = ["veteran-magic-copy"];
    maybeOpenPlayerActivationChoice(s);
    s = abilityTarget(s);
    expect(s.pendingChoice?.type).toBe("OPTION_CHOICE");
    s = ok(s, {
      type: "CHOOSE_OPTION",
      playerId: "p2",
      choiceId: s.pendingChoice!.id,
      optionIndex: 0,
    });
    expect(
      Object.values(s.combat!.units)
        .filter((u) => u.controllerId === "p1")
        .reduce((sum, u) => sum + u.damage, 0),
    ).toBe(1);
  });
  it("saved Bloodlust Echo is offered at its normal attack timing and stays at Power 0", () => {
    let s = fixture();
    s.combat!.units[A].abilities = [
      "veteran-magic-copy",
      "ignores-retaliation",
    ];
    noteElementalSpellCast(s, "p2", "spell.bloodlust");
    s.combat!.units[D].abilities = ["veteran-magic-copy"];
    expect(s.combat!.units[A].elementalVeterancy?.echoSpells).toEqual([
      "spell.bloodlust",
    ]);
    expect(s.combat!.elementalChoices ?? []).toEqual([]);
    s.players.p1.combatStats.spellsCastThisRound = 1;
    s.activeEffects.push(
      makeActiveEffect(
        s,
        {
          name: "Power",
          scope: "player",
          duration: { type: "combat" },
          modifiers: [{ type: "SPELL_POWER_BONUS", amount: 3 }],
        },
        { type: "system" },
        "p1",
      ),
    );
    s = ok(s, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: A,
      defenderId: D,
    });
    const echo = getLegalActions(s, "p1")
      .map((x) => x.action)
      .find((a) => a.type === "PLAY_REACTION" && a.elementalEchoUnitId === A);
    expect(echo).toBeTruthy();
    s = settle(ok(s, echo!));
    expect(damage(s)).toMatchObject({ damage: 4 });
    expect(s.players.p1.combatStats.spellsCastThisRound).toBe(1);
    expect(s.players.p1.hand).toEqual([]);
    expect(s.players.p1.discard).not.toContain("spell.bloodlust");
    expect(s.combat!.units[A].elementalVeterancy?.echoSpells).toEqual([]);
    expect(s.combat!.units[D].elementalVeterancy?.echoSpells ?? []).toEqual([]);
  });
  it("copies Prayer's initiative option as a real Power-zero effect", () => {
    let s = fixture();
    s.combat!.units[D].abilities = ["veteran-magic-copy"];
    s.players.p1.hand = ["spell.prayer"];
    const prayer = getLegalActions(s, "p1")
      .map((a) => a.action)
      .find(
        (a) =>
          a.type === "CAST_SPELL" &&
          a.cardId === "spell.prayer" &&
          a.optionIndex === 2,
      );
    expect(prayer, JSON.stringify(getLegalActions(s, "p1"))).toBeTruthy();
    s = settle(ok(s, prayer!));
    expect(s.pendingChoice?.type).toBe("OPTION_CHOICE");
    s = settle(
      ok(s, {
        type: "CHOOSE_OPTION",
        playerId: "p2",
        choiceId: s.pendingChoice!.id,
        optionIndex: 0,
      }),
    );
    const copied = s.activeEffects.filter(
      (e) =>
        e.controllerId === "p2" &&
        e.modifiers.some(
          (m) => m.type === "INITIATIVE_BONUS" && m.amount === 1,
        ),
    );
    expect(copied).toHaveLength(1);
    expect(s.players.p2.combatStats.spellsCastThisRound).toBe(0);
  });
  it("Spell Echo cannot buy a higher Magic Mirror tier with standing Power", () => {
    let s = fixture();
    s.combat!.units[D].abilities = ["veteran-magic-copy"];
    s.combat!.units[D].elementalVeterancy = {
      echoSpells: ["spell.magic_mirror"],
    };
    s.players.p1.hand = ["spell.magic_arrow"];
    s.activeEffects.push(
      makeActiveEffect(
        s,
        {
          name: "Power",
          scope: "player",
          duration: { type: "combat" },
          modifiers: [{ type: "SPELL_POWER_BONUS", amount: 3 }],
        },
        { type: "system" },
        "p2",
      ),
    );
    s = ok(s, {
      type: "CAST_SPELL",
      playerId: "p1",
      cardId: "spell.magic_arrow",
      target: { type: "unit", unitId: D },
    });
    while (s.reactionWindow && s.reactionWindow.priorityPlayerId !== "p2")
      s = ok(s, {
        type: "PASS_REACTION",
        playerId: s.reactionWindow.priorityPlayerId,
      });
    const echoes = getLegalActions(s, "p2")
      .map((a) => a.action)
      .filter((a) => a.type === "PLAY_REACTION" && a.elementalEchoUnitId === D);
    expect(echoes.length).toBeGreaterThan(0);
    expect(
      echoes.every((a) => a.type === "PLAY_REACTION" && a.optionIndex === 0),
    ).toBe(true);
  });
  it("Landing Sting ends combat when it defeats the last enemy", () => {
    let s = fixture();
    for (const u of Object.values(s.combat!.units))
      if (u.controllerId === "p2" && u.id !== D) u.damage = u.maxHealth;
    s.combat!.units[D].variant = "neutral";
    s.combat!.units[D].maxHealth = 1;
    queueElementalChoice(s, {
      kind: "damage",
      unitId: A,
      abilityId: "veteran-sprite-landing",
      amount: 1,
    });
    // A harmless action opens the real reducer choice; selection uses the production damage hook.
    s = ok(s, { type: "DEFEND_UNIT", playerId: "p1", unitId: A });
    expect(s.pendingChoice?.type).toBe("OPTION_CHOICE");
    s = ok(s, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: s.pendingChoice!.id,
      optionIndex: 0,
    });
    expect(s.combat?.outcome).toBeTruthy();
  });
  it("deferral keeps a one-HP Energy Elemental alive against two damage", () => {
    const s = fixture();
    s.combat!.units[A].attack = 2;
    s.combat!.units[D].abilities = ["veteran-energy-delay"];
    s.combat!.units[D].maxHealth = 1;
    s.combat!.units[D].variant = "neutral";
    const r = attack(s);
    expect(r.combat!.units[D].damage).toBe(0);
    expect(r.combat!.units[D].elementalVeterancy?.deferredDamage).toBe(2);
  });
  it("grants Neutral Sprite health/initiative and Energy teleport initiative", () => {
    expect(
      unitRankStatBonusesFor("neutral.sprites", "bronze", 1),
    ).toMatchObject({ health: 1, initiative: 3 });
    expect(
      unitRankStatBonusesFor("neutral.energy_elementals", "silver", 4)
        .initiative,
    ).toBeGreaterThanOrEqual(5);
    expect(
      unitRankStatBonusesFor("neutral.magma_elementals", "silver", 1).health,
    ).toBe(1);
    expect(
      unitRankStatBonusesFor("neutral.phoenixes", "gold", 4).health -
        unitRankStatBonusesFor("neutral.phoenixes", "gold", 3).health,
    ).toBe(1);
    expect(
      unitRankStatBonusesFor("conflux.storm_elementals", "silver", 3)
        .initiative -
        unitRankStatBonusesFor("conflux.storm_elementals", "silver", 2)
          .initiative,
    ).toBe(3);
    const s = fixture();
    const unit = s.combat!.units[A];
    unit.abilities = ["teleport-move"];
    expect(getLegalMoveDestinations(s.combat!, unit, s)).toContain(18);
  });
  it("Phoenix activation burns one adjacent enemy and leaves the unit free to move", () => {
    let s = fixture();
    s.combat!.units[A].abilities = ["veteran-phoenix-activation"];
    s.combat!.activeUnitId = "unit_p1_marksmen";
    s = ok(s, {
      type: "DEFEND_UNIT",
      playerId: "p1",
      unitId: "unit_p1_marksmen",
    });
    expect(s.pendingChoice?.type).toBe("OPTION_CHOICE");
    s = ok(s, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: s.pendingChoice!.id,
      optionIndex: 0,
    });
    expect(s.combat!.units[D].damage).toBe(1);
    expect(s.combat!.activeUnitId).toBe(A);
    expect(
      getLegalActions(s, "p1").some(
        (a) => a.action.type === "MOVE_UNIT" && a.action.unitId === A,
      ),
    ).toBe(true);
  });
  it.each([false, true])(
    "only grants distant attack when non-adjacent: %s",
    (distant) => {
      const s = fixture();
      const a = s.combat!.units[A];
      a.abilities = ["veteran-distant-storm"];
      a.type = "ranged";
      if (distant) s.combat!.units[D].position = 17;
      expect(damage(attack(s))).toMatchObject({ damage: distant ? 4 : 3 });
    },
  );
  it.each([4, 10, 12])(
    "Magma gains attack only against higher initiative: %s",
    (initiative) => {
      const s = fixture();
      s.combat!.units[A].abilities = ["veteran-magma-hunter"];
      s.combat!.units[D].initiative = initiative;
      expect(damage(attack(s))).toMatchObject({
        damage: initiative > 10 ? 4 : 3,
      });
    },
  );
  it("Energy heals 2 after attacking, never above max health", () => {
    const s = fixture();
    s.combat!.units[A].abilities = [
      "veteran-energy-drain",
      "ignores-retaliation",
    ];
    s.combat!.units[A].damage = 3;
    expect(attack(s).combat!.units[A].damage).toBe(1);
  });
  it("Frozen Guard always supplies one defense even on a zero die", () => {
    const s = fixture();
    s.combat!.units[D].abilities = ["veteran-frozen-guard"];
    s.combat!.units[D].defenseToken = true;
    expect(damage(attack(s))).toMatchObject({ damage: 2 });
  });
  it("Storm Guard distinguishes ranged and melee hits", () => {
    const s = fixture();
    s.combat!.units[D].abilities = ["veteran-storm-guard"];
    expect(damage(attack(s))).toMatchObject({ damage: 3 });
    s.combat!.units[A].type = "ranged";
    s.combat!.units[D].position = 17;
    expect(damage(attack(s))).toMatchObject({ damage: 2 });
  });
  it("Swift Lightning adds damage only against strictly slower targets", () => {
    const s = fixture();
    s.combat!.units[A].abilities = ["veteran-storm-speed"];
    expect(damage(attack(s))).toMatchObject({ damage: 4 });
    s.combat!.units[D].initiative = 10;
    expect(damage(attack(s))).toMatchObject({ damage: 3 });
  });
  it("Earth Shield caps accumulated damage across separate sources and reopens after healing", () => {
    const s = fixture(),
      u = s.combat!.units[D];
    u.abilities = ["veteran-earth-shield"];
    hit(s, u, 3);
    hit(s, u, 9);
    expect(u.damage).toBe(4);
    hit(s, u, 9);
    expect(u.damage).toBe(4);
    u.damage -= 2;
    hit(s, u, 1);
    expect(u.damage).toBe(3);
    u.abilitiesSuppressed = true;
    hit(s, u, 3);
    expect(u.damage).toBe(6);
  });
  it("Earth Shield prevents a lethal attack before rebirth is consumed", () => {
    const s = fixture();
    const u = s.combat!.units[D];
    u.maxHealth = 8;
    u.abilities = ["veteran-earth-shield", "phoenix-rebirth"];
    s.combat!.units[A].attack = 30;
    const result = attack(s).combat!.units[D];
    expect(result.damage).toBe(4);
    expect(result.usedRebirthThisCombat).not.toBe(true);
  });
  it("Rebirth heals five additional HP once", () => {
    const s = fixture(),
      u = s.combat!.units[D];
    u.maxHealth = 10;
    u.variant = "neutral";
    u.abilities = ["phoenix-rebirth", "veteran-renewed-rebirth"];
    hit(s, u, 20);
    expect(u.damage).toBe(4);
    expect(u.usedRebirthThisCombat).toBe(true);
    hit(s, u, 20);
    expect(u.damage).toBeGreaterThanOrEqual(10);
  });
  it("enemy Fire and Magic Arrow heal Energy but friendly and Water spells do not", () => {
    const s = fixture(),
      u = s.combat!.units[A];
    u.abilities = ["veteran-energy-fire-heal"];
    u.damage = 8;
    const cast = (playerId: string, spellCardId: string) =>
      noteElementalSpellCast(s, playerId, spellCardId);
    cast("p2", "spell.magic_arrow");
    expect(u.damage).toBe(6);
    cast("p1", "spell.magic_arrow");
    expect(u.damage).toBe(6);
    cast("p2", "spell.cure");
    expect(u.damage).toBe(6);
  });
  it("delays two damage from an enemy attack once per combat round", () => {
    const s = fixture();
    s.combat!.units[D].abilities = ["veteran-energy-delay"];
    const r = attack(s);
    expect(r.combat!.units[D].damage).toBe(1);
    expect(r.combat!.units[D].elementalVeterancy).toMatchObject({
      delayUsedRound: r.combat!.round,
      deferredDamage: 2,
      deferredRound: r.combat!.round,
    });
  });
  it("Delayed Impact stays spent for the rest of its round and re-arms next round", () => {
    const spent = fixture();
    spent.combat!.units[D].abilities = ["veteran-energy-delay"];
    spent.combat!.units[D].elementalVeterancy = { delayUsedRound: spent.combat!.round };
    const same = attack(spent);
    expect(same.combat!.units[D].damage).toBe(3);
    expect(same.combat!.units[D].elementalVeterancy?.deferredDamage ?? 0).toBe(0);
    const rearmed = fixture();
    rearmed.combat!.units[D].abilities = ["veteran-energy-delay"];
    rearmed.combat!.round = 2;
    rearmed.combat!.units[D].elementalVeterancy = { delayUsedRound: 1 };
    const next = attack(rearmed);
    expect(next.combat!.units[D].damage).toBe(1);
    expect(next.combat!.units[D].elementalVeterancy).toMatchObject({
      delayUsedRound: 2,
      deferredDamage: 2,
      deferredRound: 2,
    });
  });
  it("Twilight Ward reduces Spell damage by 2 in round 1 and by 1 from round 2", () => {
    const plain = fixture();
    expect(cast(plain, "spell.lightning_bolt").combat!.units[D].damage).toBe(2);
    const first = fixture();
    first.combat!.units[D].abilities = ["veteran-vampire-ward"];
    expect(cast(first, "spell.lightning_bolt").combat!.units[D].damage).toBe(0);
    const later = fixture();
    later.combat!.units[D].abilities = ["veteran-vampire-ward"];
    later.combat!.round = 2;
    const r = cast(later, "spell.lightning_bolt");
    expect(r.combat!.units[D].damage).toBe(1);
    expect(
      r.eventLog.some(
        (e) =>
          e.type === "UNIT_ABILITY_TRIGGERED" &&
          e.abilityId === "veteran-vampire-ward" &&
          e.message?.includes("up to 1 Spell damage"),
      ),
    ).toBe(true);
  });
  it("landing sting offers adjacent enemies and applies exactly one damage", () => {
    const s = fixture(),
      a = s.combat!.units[A];
    a.abilities = ["veteran-sprite-landing"];
    elementalMovement(s, a, hooks);
    choose(s);
    expect(s.combat!.units[D].damage).toBe(1);
    expect(s.combat!.units.unit_p2_vampires.damage).toBe(0);
  });
  it("obstacle relocation preserves the count and excludes occupied cells", () => {
    const s = fixture(),
      a = s.combat!.units[A];
    a.abilities = ["veteran-sprite-obstacle"];
    s.combat!.obstacles = [5];
    elementalActivation(s, a);
    choose(s);
    expect(s.combat!.obstacles).toHaveLength(1);
    expect(s.combat!.obstacles).not.toContain(5);
    expect(
      Object.values(s.combat!.units).some((u) =>
        s.combat!.obstacles!.includes(u.position),
      ),
    ).toBe(false);
  });
  it("activated-target echo does not trigger on an unactivated target", () => {
    const s = fixture(),
      a = s.combat!.units[A],
      d = s.combat!.units[D];
    a.abilities = ["veteran-arcane-echo"];
    elementalAfterAttack(s, a, d, 2);
    expect(openElementalChoice(s, hooks)).toBe(false);
    d.activatedThisRound = true;
    elementalAfterAttack(s, a, d, 2);
    choose(s);
    expect(d.damage).toBe(2);
  });
  it("Lightning Link breaks only for a voluntarily separating mover, once", () => {
    const s = fixture(),
      a = s.combat!.units[A],
      d = s.combat!.units[D],
      other = s.combat!.units.unit_p2_vampires;
    a.abilities = ["veteran-storm-link"];
    d.position = 17;
    other.position = 18;
    elementalAfterAttack(s, a, d, 3);
    choose(s);
    expect(s.combat!.elementalLinks).toHaveLength(1);
    d.position = 14;
    elementalMovement(s, d, hooks);
    expect(d.damage).toBe(0);
    d.position = 10;
    elementalMovement(s, d, hooks);
    expect(d.damage).toBe(1);
    expect(s.combat!.elementalLinks).toHaveLength(0);
    elementalMovement(s, d, hooks);
    expect(d.damage).toBe(1);
  });
  it("Conflux Storm Elemental's R4 Lightning Link breaks for 2 damage", () => {
    const s = fixture(),
      a = s.combat!.units[A],
      d = s.combat!.units[D],
      other = s.combat!.units.unit_p2_vampires;
    a.abilities = ["veteran-storm-link-2"];
    d.position = 17;
    other.position = 18;
    elementalAfterAttack(s, a, d, 3);
    choose(s);
    expect(s.combat!.elementalLinks).toHaveLength(1);
    d.position = 10;
    elementalMovement(s, d, hooks);
    expect(d.damage).toBe(2);
    expect(s.combat!.elementalLinks).toHaveLength(0);
  });
  it("Conflux Storm & Energy Elementals gain +1 HP at rank 1", () => {
    expect(
      unitRankStatBonusesFor("conflux.storm_elementals", "bronze", 1).health,
    ).toBe(1);
    expect(
      unitRankStatBonusesFor("conflux.energy_elementals", "silver", 1).health,
    ).toBe(1);
  });
  it("Solidify locks next-round movement and is released by an attack", () => {
    const s = fixture(),
      a = s.combat!.units[A];
    a.abilities = ["veteran-magma-solidify"];
    queueElementalChoice(s, {
      kind: "solidify",
      unitId: A,
      abilityId: "veteran-magma-solidify",
    });
    choose(s);
    s.combat!.round++;
    expect(getLegalMoveDestinations(s.combat!, a, s)).toEqual([]);
    hit(s, a, 3);
    expect(a.damage).toBe(2);
    elementalAfterAttack(s, a, s.combat!.units[D], 3);
    expect(getLegalMoveDestinations(s.combat!, a, s).length).toBeGreaterThan(0);
  });
  it("Nest is targetable, has one HP, never activates and returns its Phoenix next round", () => {
    const s = fixture(),
      a = s.combat!.units[A];
    a.abilities = ["veteran-phoenix-nest"];
    a.damage = 3;
    elementalActivation(s, a);
    choose(s);
    const nest = Object.values(s.combat!.units).find(
      (u) => u.elementalVeterancy?.nestOwnerId === A,
    )!;
    expect(nest.maxHealth).toBe(1);
    nest.activatedThisRound = false;
    expect(getActivationStep(s.combat!)?.candidates).not.toContain(nest);
    const position = nest.position;
    s.combat!.round++;
    elementalActivation(s, a);
    expect(a.position).toBe(position);
    expect(a.damage).toBe(2);
    expect(nest.damage).toBe(1);
  });
  it("destroyed Nests do not teleport or heal, and cannot keep a defeated side in combat", () => {
    const s = fixture(),
      a = s.combat!.units[A];
    a.abilities = ["veteran-phoenix-nest"];
    a.damage = 3;
    elementalActivation(s, a);
    choose(s);
    const nest = Object.values(s.combat!.units).find(
      (u) => u.elementalVeterancy?.nestOwnerId === A,
    )!;
    hit(s, nest, 1);
    s.combat!.round++;
    elementalActivation(s, a);
    expect(a.position).toBe(9);
    expect(a.damage).toBe(3);
    nest.damage = 0;
    for (const u of Object.values(s.combat!.units))
      if (u.controllerId === "p1" && u.id !== nest.id) u.damage = u.maxHealth;
    expect(finishCombatIfNeeded(s)).toBe(true);
  });
});
