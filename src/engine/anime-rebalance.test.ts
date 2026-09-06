import { describe, expect, it } from "vitest";
import { applyAction, createInitialGameState, getLegalActions } from "./index";
import {
  effectiveInitiative,
  getDisplayAttackBonus,
  expireEffectsForCombatRoundEnd,
} from "./active-effects";
import type { GameAction, GameState } from "./state";

const A = "unit_p1_griffins",
  D = "unit_p2_skeletons",
  F = "unit_p1_marksmen",
  E = "unit_p2_vampires";
function apply(s: GameState, a: GameAction) {
  const r = applyAction(s, a);
  expect(r.errors, JSON.stringify(r.errors)).toEqual([]);
  return r.state;
}
function board(card?: string) {
  const s = createInitialGameState("rebalance");
  s.players.p1.hand = card ? [card] : [];
  s.players.p2.hand = [];
  s.activePlayerId = "p1";
  for (const u of Object.values(s.combat!.units)) {
    u.abilities = [];
    u.damage = 0;
    u.maxHealth = 40;
    u.defense = 0;
    u.attack = 4;
    u.retaliatedThisRound = true;
    u.position = 19;
    u.activatedThisRound = false;
  }
  s.combat!.units[A].position = 8;
  s.combat!.units[A].type = "ground";
  s.combat!.units[D].position = 9;
  s.combat!.units[F].position = 4;
  s.combat!.units[E].position = 15;
  s.combat!.activeUnitId = A;
  s.combat!.dice.scriptedRolls = Array(30).fill(0);
  return s;
}
function settle(s: GameState) {
  for (let i = 0; i < 30 && s.reactionWindow; i++)
    s = apply(s, {
      type: "PASS_REACTION",
      playerId: s.reactionWindow.priorityPlayerId,
    });
  return s;
}
function play(s: GameState, id: string, target?: string, optionIndex?: number) {
  const a = getLegalActions(s, "p1").find(
    ({ action: a }) =>
      a.type === "PLAY_CARD" &&
      a.cardId === id &&
      (optionIndex === undefined || a.optionIndex === optionIndex) &&
      (!target || (a.target?.type === "unit" && a.target.unitId === target)),
  );
  expect(
    a,
    `offer ${id}: ${JSON.stringify(getLegalActions(s, "p1").map((x) => x.action))}`,
  ).toBeTruthy();
  return apply(s, a!.action);
}
function attack(s: GameState) {
  return apply(s, {
    type: "ATTACK_UNIT",
    playerId: "p1",
    attackerId: A,
    defenderId: D,
  });
}

describe("requested anime rebalance — actual outcomes", () => {
  it.each([1, 4])("Rin %s can draw during an enemy attack and must finish IV's discard", (level) => {
    let s = board();
    const id = `specialty.rin_natsume.${level}`;
    s.players.p2.hand = [id];
    s.players.p2.deck = ["spell.haste", "spell.bless", "spell.cure"];
    const unitCount = Object.keys(s.combat!.units).length;
    s = attack(s);
    const action = getLegalActions(s, "p2").find(({ action }) => action.type === "PLAY_REACTION" && action.cardId === id && action.drawOnly);
    expect(action).toBeTruthy();
    s = apply(s, action!.action);
    expect(s.players.p2.hand).toHaveLength(level === 1 ? 1 : 2);
    expect(Object.keys(s.combat!.units)).toHaveLength(unitCount);
    if (level === 4) {
      const discard = getLegalActions(s, "p2").find(({ action }) => action.type === "CHOOSE_OPTION");
      expect(discard).toBeTruthy();
      s = apply(s, discard!.action);
      expect(s.players.p2.hand).toHaveLength(1);
    }
    s = settle(s);
    expect(s.combat!.units[D].damage).toBe(4);
  });
  it.each(["rin_natsume", "yuiko_kurugaya"])("%s damage can resolve before the enemy's attack damage", (hero) => {
    let s = board();
    const id = `specialty.${hero}.${hero === "rin_natsume" ? 6 : 1}`;
    s.players.p2.hand = [id];
    s = attack(s);
    const action = getLegalActions(s, "p2").find(({ action }) => (action.type === "PLAY_REACTION" || action.type === "PLAY_CARD") && action.cardId === id && action.target?.type === "unit" && action.target.unitId === A);
    expect(action).toBeTruthy();
    s = apply(s, action!.action);
    expect(s.combat!.units[A].damage).toBe(hero === "rin_natsume" ? 3 : 1);
    const hitIndex = (id: string) => s.eventLog.findIndex((event) => event.type === "DAMAGE_ASSIGNED" && event.target.type === "unit" && event.target.unitId === id && event.amount > 0);
    expect(hitIndex(A)).toBeGreaterThanOrEqual(0);
    expect(hitIndex(D)).toBeGreaterThan(hitIndex(A));
    s = settle(s);
    expect(s.combat!.units[D].damage).toBe(4);
  });
  it.each([false, true])("Bismarck I reduces actual incoming damage, doubled for Prinz Eugen (%s)", (prinz) => {
    let s = board();
    s.players.p2.hand = ["specialty.bismarck.1"];
    if (prinz) {
      s.combat!.units[D].name = "Prinz Eugen";
      s.combat!.units[D].cardName = "Few Prinz Eugen";
    }
    s = attack(s);
    const action = getLegalActions(s, "p2").find(({ action }) => action.type === "PLAY_REACTION" && action.cardId === "specialty.bismarck.1" && action.optionIndex === 1);
    expect(action).toBeTruthy();
    s = settle(apply(s, action!.action));
    expect(s.combat!.units[D].damage).toBe(prinz ? 2 : 3);
  });
  it.each([1, 4])(
    "Riki %s updates on a real army loss and refreshes expiry through the next round",
    (level) => {
      const id = `specialty.riki_naoe.${level}`;
      let s = board(id);
      s = play(s, id, level === 1 ? A : undefined);
      const read = () =>
        level === 1
          ? getDisplayAttackBonus(s, s.combat!.units[A])
          : effectiveInitiative(s.combat!.units[A], s.activeEffects, s.combat) -
            s.combat!.units[A].initiative;
      expect(read()).toBe(level === 1 ? 1 : 3);
      expect(
        s.activeEffects.find((e) => e.fallenBond)?.expiresAtCombatRoundEnd,
      ).toBe(2);
      s.combat!.round = 2;
      s.activePlayerId = "p2";
      s.combat!.activeUnitId = D;
      s.combat!.units[D].position = 5;
      s.combat!.units[F].maxHealth = 1;
      s.combat!.units[F].variant = "few";
      s = settle(
        apply(s, {
          type: "ATTACK_UNIT",
          playerId: "p2",
          attackerId: D,
          defenderId: F,
        }),
      );
      expect(
        s.eventLog.some((e) => e.type === "UNIT_REMOVED" && e.unitId === F),
      ).toBe(true);
      expect(read()).toBe(level === 1 ? 2 : 4);
      expect(
        s.activeEffects.find((e) => e.fallenBond)?.expiresAtCombatRoundEnd,
      ).toBe(3);
      expireEffectsForCombatRoundEnd(s, 2);
      expect(read()).toBe(level === 1 ? 2 : 4);
      expireEffectsForCombatRoundEnd(s, 3);
      expect(read()).toBe(0);
    },
  );
  it("Komari heals at the shielded unit's next activation, not immediately", () => {
    let s = board("specialty.komari_kamikita.4");
    s.combat!.units[F].damage = 3;
    s.combat!.units[F].initiative = 100;
    s = play(s, "specialty.komari_kamikita.4", F);
    expect(s.combat!.units[F].damage).toBe(3);
    s = settle(apply(s, { type: "DEFEND_UNIT", playerId: "p1", unitId: A }));
    expect(s.combat!.activeUnitId).toBe(F);
    expect(s.combat!.units[F].damage).toBe(2);
  });
  it.each([1, 4])(
    "Rin %s summons exactly one cat and resolves the draw rider",
    (level) => {
      const id = `specialty.rin_natsume.${level}`;
      let s = board(id);
      s.players.p1.deck = ["spell.haste", "spell.bless"];
      const count = Object.keys(s.combat!.units).length;
      const a = getLegalActions(s, "p1").find(
        (x) =>
          x.action.type === "PLAY_CARD" &&
          x.action.cardId === id &&
          x.action.target?.type === "space",
      );
      expect(a).toBeTruthy();
      s = apply(s, a!.action);
      expect(Object.keys(s.combat!.units)).toHaveLength(count + 1);
      expect(s.players.p1.hand).toHaveLength(level === 1 ? 1 : 2);
      expect(Boolean(s.pendingChoice)).toBe(level === 4);
    },
  );
  it.each([
    ["rin_natsume", 6],
    ["yuiko_kurugaya", 1],
  ])("%s instant is usable before enemy activation", (hero, level) => {
    const id = `specialty.${hero}.${level}`;
    const s = board();
    s.players.p2.hand = [id];
    const offers = getLegalActions(s, "p2");
    expect(
      offers.some(
        (x) =>
          (x.action.type === "PLAY_CARD" ||
            x.action.type === "PLAY_REACTION") &&
          x.action.cardId === id,
      ),
    ).toBe(true);
  });
  it.each([
    ["Griffins", 1],
    ["Prinz Eugen", 2],
  ])("Bismarck I Attack doubles only for %s", (name, bonus) => {
    let s = board("specialty.bismarck.1");
    s.combat!.units[A].name = name;
    s.combat!.units[A].cardName = `Few ${name}`;
    s = attack(s);
    const a = getLegalActions(s, "p1").find(
      (x) =>
        x.action.type === "PLAY_REACTION" &&
        x.action.cardId === "specialty.bismarck.1" &&
        x.action.optionIndex === 0,
    );
    expect(a).toBeTruthy();
    s = settle(apply(s, a!.action));
    expect(s.combat!.units[D].damage).toBe(4 + bonus);
  });
  it("a successful Home Run prevents retaliation; a blocked push does not", () => {
    for (const blocked of [false, true]) {
      let s = board("specialty.sasami_sasasegawa.6");
      s.combat!.units[D].retaliatedThisRound = false;
      if (blocked) s.combat!.units[E].position = 10;
      s = attack(s);
      const a = getLegalActions(s, "p1").find(
        (x) =>
          x.action.type === "PLAY_REACTION" &&
          x.action.cardId === "specialty.sasami_sasasegawa.6",
      );
      expect(a).toBeTruthy();
      s = settle(apply(s, a!.action));
      expect(s.combat!.units[A].damage).toBe(blocked ? 4 : 0);
    }
  });
  it.each([1, 4])(
    "Rin %s can draw without summoning and IV requires its discard",
    (level) => {
      const id = `specialty.rin_natsume.${level}`;
      let s = board(id);
      s.players.p1.deck = ["spell.haste", "spell.bless", "spell.cure"];
      const count = Object.keys(s.combat!.units).length;
      const a = getLegalActions(s, "p1").find(
        (x) =>
          x.action.type === "PLAY_CARD" &&
          x.action.cardId === id &&
          x.action.drawOnly,
      );
      expect(a).toBeTruthy();
      s = apply(s, a!.action);
      expect(Object.keys(s.combat!.units)).toHaveLength(count);
      expect(s.players.p1.hand).toHaveLength(level === 1 ? 1 : 2);
      if (level === 4) {
        expect(s.pendingChoice).toBeTruthy();
        const discard = getLegalActions(s, "p1").find(
          (x) => x.action.type === "CHOOSE_OPTION",
        );
        expect(discard).toBeTruthy();
        s = apply(s, discard!.action);
        expect(s.players.p1.hand).toHaveLength(1);
      }
    },
  );
  it("Riki VI protects against a lethal spell and removes a lethally hit recipient", () => {
    let s = board("spell.magic_arrow");
    s.players.p2.hand = ["specialty.riki_naoe.6"];
    s.combat!.units[D].maxHealth = 1;
    s.combat!.units[F].maxHealth = 1;
    s.combat!.units[F].variant = "few";
    s = apply(s, {
      type: "CAST_SPELL",
      playerId: "p1",
      cardId: "spell.magic_arrow",
      target: { type: "unit", unitId: D },
    });
    while (s.reactionWindow && s.reactionWindow.priorityPlayerId !== "p2")
      s = apply(s, {
        type: "PASS_REACTION",
        playerId: s.reactionWindow.priorityPlayerId,
      });
    const a = getLegalActions(s, "p2").find(
      (x) =>
        x.action.type === "PLAY_REACTION" &&
        x.action.cardId === "specialty.riki_naoe.6" &&
        x.action.target?.type === "unit" &&
        x.action.target.unitId === F,
    );
    expect(a).toBeTruthy();
    s = settle(apply(s, a!.action));
    expect(s.combat!.units[D].damage).toBe(0);
    expect(
      s.eventLog.some((e) => e.type === "UNIT_REMOVED" && e.unitId === F),
    ).toBe(true);
  });
  it("prevented spell damage does not clear paralysis, but the redirected hit does", () => {
    let s = board("spell.magic_arrow");
    s.players.p2.hand = ["specialty.riki_naoe.6"];
    for (const id of [D, F])
      s.combat!.units[id].tokens = [
        {
          id: `paralysis-${id}`,
          kind: "paralysis",
          amount: 1,
          sourceName: "test",
        },
      ];
    s = apply(s, {
      type: "CAST_SPELL",
      playerId: "p1",
      cardId: "spell.magic_arrow",
      target: { type: "unit", unitId: D },
    });
    const a = getLegalActions(s, "p2").find(
      (x) =>
        x.action.type === "PLAY_REACTION" &&
        x.action.protectedUnitId === D &&
        x.action.target?.type === "unit" &&
        x.action.target.unitId === F,
    );
    expect(a).toBeTruthy();
    s = settle(apply(s, a!.action));
    expect(s.combat!.units[D].tokens?.some((t) => t.kind === "paralysis")).toBe(
      true,
    );
    expect(s.combat!.units[F].tokens?.some((t) => t.kind === "paralysis")).toBe(
      false,
    );
  });
  it("Riki VI cannot be wasted as a normal card play", () => {
    const s = board("specialty.riki_naoe.6");
    expect(
      getLegalActions(s, "p1").some(
        (x) =>
          x.action.type === "PLAY_CARD" &&
          x.action.cardId === "specialty.riki_naoe.6",
      ),
    ).toBe(false);
  });
  it("Riki VI can protect a secondary Chain Lightning target", () => {
    let s = board("spell.chain_lightning");
    s.players.p2.hand = ["specialty.riki_naoe.6"];
    s.combat!.units[E].position = 10;
    s.combat!.units[A].position = 8;
    s = apply(s, {
      type: "CAST_SPELL",
      playerId: "p1",
      cardId: "spell.chain_lightning",
      target: { type: "unit", unitId: D },
    });
    const a = getLegalActions(s, "p2").find(
      (x) =>
        x.action.type === "PLAY_REACTION" &&
        x.action.protectedUnitId === E &&
        x.action.target?.type === "unit" &&
        x.action.target.unitId === F,
    );
    expect(a).toBeTruthy();
    s = settle(apply(s, a!.action));
    expect(s.combat!.units[E].damage).toBe(0);
    expect(s.combat!.units[F].damage).toBe(1);
    expect(s.combat!.pendingCardDamageTransfers).toBeUndefined();
  });
  it("Riki VI retains protection through a later Frost Ring target choice", () => {
    let s = board("spell.frost_ring");
    s.players.p2.hand = ["specialty.riki_naoe.6"];
    s.combat!.units[A].position = 1;
    s.combat!.units[D].position = 9;
    s.combat!.units[E].position = 6;
    s.combat!.units[F].position = 19;
    s = apply(s, { type: "CAST_SPELL", playerId: "p1", cardId: "spell.frost_ring", target: { type: "space", position: 5 } });
    const reaction = getLegalActions(s, "p2").find(({ action }) => action.type === "PLAY_REACTION" && action.protectedUnitId === E && action.target?.type === "unit" && action.target.unitId === F);
    expect(reaction).toBeTruthy();
    s = settle(apply(s, reaction!.action));
    expect(s.pendingChoice?.type).toBe("ABILITY_TARGET_CHOICE");
    s = apply(s, { type: "CHOOSE_ABILITY_TARGET", playerId: "p1", choiceId: s.pendingChoice!.id, targetUnitId: E });
    expect(s.combat!.units[E].damage).toBe(0);
    expect(s.combat!.units[F].damage).toBe(1);
    if (s.pendingChoice) s = apply(s, { type: "CHOOSE_ABILITY_TARGET", playerId: "p1", choiceId: s.pendingChoice.id, targetUnitId: A });
    expect(s.combat!.pendingCardDamageTransfers).toBeUndefined();
  });
  it.each([false, true])(
    "Ayanami reduces only incoming retaliation damage (guard=%s)",
    (guard) => {
      let s = board();
      s.combat!.units[D].retaliatedThisRound = false;
      if (guard) s.combat!.units[A].abilities = ["ayanami-retaliation-guard"];
      s = settle(attack(s));
      expect(s.combat!.units[A].damage).toBe(guard ? 2 : 4);
      expect(s.combat!.units[D].damage).toBe(4);
    },
  );
  it.each([false, true])(
    "Akashi VI heals 2 and draws, or draws alone (%s)",
    (drawOnly) => {
      let s = board("specialty.akashi.6");
      s.players.p1.deck = ["spell.haste"];
      if (!drawOnly) s.combat!.units[A].damage = 3;
      s = play(s, "specialty.akashi.6", drawOnly ? undefined : A);
      expect(s.combat!.units[A].damage).toBe(drawOnly ? 0 : 1);
      expect(s.players.p1.hand).toEqual(["spell.haste"]);
    },
  );
  it.each([
    [1, 0, 5, 9],
    [1, 1, 6, 10],
    [6, -1, 5, 10],
  ])(
    "Sasami %s roll %s adds Attack and only pushes on the specified face",
    (level, roll, damage, position) => {
      const id = `specialty.sasami_sasasegawa.${level}`;
      let s = board(id);
      s.combat!.dice.scriptedRolls = Array(30).fill(roll);
      s = attack(s);
      const a = getLegalActions(s, "p1").find(
        (x) => x.action.type === "PLAY_REACTION" && x.action.cardId === id,
      );
      expect(a).toBeTruthy();
      s = settle(apply(s, a!.action));
      expect(s.combat!.units[D].damage).toBe(damage);
      expect(s.combat!.units[D].position).toBe(position);
    },
  );
  it("Sasami VI blocked push adds exactly 1 damage", () => {
    let s = board("specialty.sasami_sasasegawa.6");
    s.combat!.units[E].position = 10;
    s = attack(s);
    s = settle(
      apply(
        s,
        getLegalActions(s, "p1").find(
          (x) =>
            x.action.type === "PLAY_REACTION" &&
            x.action.cardId === "specialty.sasami_sasasegawa.6",
        )!.action,
      ),
    );
    expect(s.combat!.units[D].damage).toBe(7);
  });
  it("Sasami IV gives +1 maximum HP, doubled for Softball Club", () => {
    for (const [name, bonus] of [
      ["Griffins", 1],
      ["Softball Club", 2],
    ] as const) {
      let s = board("specialty.sasami_sasasegawa.4");
      s.combat!.units[A].name = name;
      s = play(s, "specialty.sasami_sasasegawa.4", A);
      expect(s.combat!.units[A].maxHealth).toBe(40 + bonus);
    }
  });
  it("Riki I can be played without losses and gives +1, or +2 with a fallen army unit", () => {
    for (const fallen of [false, true]) {
      let s = board("specialty.riki_naoe.1");
      if (fallen) s.combat!.units[F].damage = 40;
      s = play(s, "specialty.riki_naoe.1", A);
      s = settle(attack(s));
      expect(s.combat!.units[D].damage).toBe(fallen ? 6 : 5);
    }
  });
  it("Riki IV raises the whole team's initiative by 3 plus fallen army count", () => {
    let s = board("specialty.riki_naoe.4");
    s.combat!.units[F].damage = 40;
    const before = s.combat!.units[A].initiative;
    s = play(s, "specialty.riki_naoe.4");
    expect(
      effectiveInitiative(s.combat!.units[A], s.activeEffects, s.combat),
    ).toBe(before + 4);
  });
  it("Riki VI is offered after the attack roll, prevents lethal HP loss and redirects half rounded up", () => {
    let s = board();
    s.players.p2.hand = ["specialty.riki_naoe.6"];
    s.combat!.units[A].attack = 5;
    s.combat!.units[D].maxHealth = 2;
    s = attack(s);
    for (
      let i = 0;
      i < 8 && s.reactionWindow?.triggerEvent.type !== "ATTACK_DIE_SETTLED";
      i++
    )
      s = apply(s, {
        type: "PASS_REACTION",
        playerId: s.reactionWindow!.priorityPlayerId,
      });
    expect(s.reactionWindow?.triggerEvent.type).toBe("ATTACK_DIE_SETTLED");
    const a = getLegalActions(s, "p2").find(
      ({ action }) =>
        action.type === "PLAY_REACTION" &&
        action.cardId === "specialty.riki_naoe.6" &&
        action.target?.type === "unit" &&
        action.target.unitId === F,
    );
    expect(a).toBeTruthy();
    s = settle(apply(s, a!.action));
    expect(s.combat!.units[D].damage).toBe(0);
    expect(s.combat!.units[F].damage).toBe(3);
    expect(
      s.eventLog.some((e) => e.type === "UNIT_REMOVED" && e.unitId === D),
    ).toBe(false);
  });
  it.each([
    ["rin_natsume", 6, 3],
    ["yuiko_kurugaya", 1, 1],
  ])("%s %s deals its immediate damage", (hero, level, amount) => {
    const id = `specialty.${hero}.${level}`;
    let s = board(id);
    s = settle(play(s, id, D, 0));
    expect(s.combat!.units[D].damage).toBe(amount);
  });
  it("Yuiko IV grants morale and gold in combat", () => {
    let s = board("specialty.yuiko_kurugaya.4");
    const gold = s.players.p1.resources.gold,
      morale = s.players.p1.morale;
    s = play(s, "specialty.yuiko_kurugaya.4");
    expect(s.players.p1.resources.gold).toBe(gold + 2);
    expect(s.players.p1.morale).toBe(morale + 1);
  });
  it("Yuiko VI adds damage for enemies around the attacker, with no splash", () => {
    let s = board("specialty.yuiko_kurugaya.6");
    s.combat!.units[E].position = 12;
    s = play(s, "specialty.yuiko_kurugaya.6", A);
    s = settle(attack(s));
    expect(s.combat!.units[D].damage).toBe(6);
    expect(s.combat!.units[E].damage).toBe(0);
  });
  it.each([
    [1, 1],
    [4, 2],
    [6, 2],
  ])("Komari %s shields the next hit by %s and expires", (level, amount) => {
    const id = `specialty.komari_kamikita.${level}`;
    let s = board();
    s.players.p2.hand = [id];
    s.activePlayerId = "p2";
    s.combat!.activeUnitId = D;
    const a = getLegalActions(s, "p2").find(
      ({ action }) =>
        action.type === "PLAY_CARD" &&
        action.cardId === id &&
        action.target?.type === "unit" &&
        action.target.unitId === D,
    );
    expect(a).toBeTruthy();
    s = apply(s, a!.action);
    s.activePlayerId = "p1";
    s.combat!.activeUnitId = A;
    s = settle(attack(s));
    expect(s.combat!.units[D].damage).toBe(4 - amount);
    expect(
      s.activeEffects.some(
        (e) =>
          e.target?.type === "unit" &&
          e.target.unitId === D &&
          e.modifiers.some((m) => m.type === "DAMAGE_SHIELD"),
      ),
    ).toBe(false);
  });
});
