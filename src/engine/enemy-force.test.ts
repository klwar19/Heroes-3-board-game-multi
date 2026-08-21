import { describe, expect, it } from "vitest";

import { cardLibrary } from "@/data/cards/library";
import { RAID_BOSSES } from "@/data/anime/bosses";
import { applyAction, createInitialGameState, getLegalActions } from "./index";
import { getPlayerView } from "./player-view";
import { makeRaidBossCombatUnit } from "./raid-bosses";
import { getActivationOrder } from "./legal-actions";
import {
  chooseEnemyForcePlay,
  drawEnemyForceHand,
  ENEMY_FORCE_BOSS_HAND_SIZE,
  ENEMY_FORCE_CARD_POOL,
  enemyForceHandNotice,
  enemyForceHandSize,
  enemyForcePoolEntry,
  enemyForceTarget,
  seedEnemyForceHandOnCombat
} from "./enemy-force";
import { HIDDEN_CARD_ID } from "./state";
import type { CardId, CombatUnitState, GameAction, GameState } from "./state";

/**
 * The PvE ENEMY FORCE hand — the BOSS_SPELL_ROTATION replacement (2026-08-21).
 *
 * Every claim is pinned by an OBSERVABLE game outcome (damage that moved, an
 * activation order that changed, an attack that hit harder) with a
 * feature-removed CONTROL on the same setup, per CLAUDE.md §1a.
 *
 * WHAT THIS FILE DOES NOT PROVE: nothing here is a pixel (jsdom cannot compute
 * CSS — the cue's look is a real-browser concern), and the BALANCE of the hand
 * lives in `pve-boss-balance.test.ts`, which simulates real fights.
 */

// ---------------------------------------------------------------------------
// Fight harness (the boss-abilities.test.ts sandbox)
// ---------------------------------------------------------------------------

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

/**
 * A sandbox fight with a raid boss on p2's side, fast enough that the FIRST
 * activation handed over is the boss's. `hand` is planted directly on
 * `combat.enemyForce`, which is exactly what `seedEnemyForceHand` writes — so
 * these tests exercise the real resolution given a known hand, and the DRAW is
 * pinned separately below.
 *
 * `hand: null` is the CONTROL: byte-identical setup with no enemy-force field,
 * i.e. the feature removed.
 */
function stage(
  seed: string,
  hand: CardId[] | null,
  bossOverrides: Partial<CombatUnitState> = {}
): { state: GameState; bossId: string; openerId: string } {
  const state = createInitialGameState(seed);
  state.players.p1.hand = [];
  state.players.p2.hand = [];
  const combat = state.combat!;
  // Scripted 0s: an Attack die never modifies damage, so every number below is
  // attributable to the enemy-force play.
  combat.dice.scriptedRolls = Array.from({ length: 80 }, () => 0);
  combat.dice.rollCount = 0;

  const boss = makeRaidBossCombatUnit(RAID_BOSSES.goblin_king, 3, "u_boss", 13);
  boss.controllerId = "p2";
  // Highest Initiative on the board, so the activation after the opener's is the
  // boss's — that is the moment the enemy force plays.
  boss.initiative = 20;
  // Drop the printed kit: this file measures the CARD, not `ignores-retaliation`
  // or Enrage (those are `boss-abilities.test.ts`).
  boss.abilities = [];
  Object.assign(boss, bossOverrides);
  combat.units[boss.id] = boss;

  if (hand) {
    combat.enemyForce = { cardIds: [...hand], playedCardIds: [], fired: [] };
  }
  return { state, bossId: boss.id, openerId: combat.activeUnitId! };
}

/**
 * A wounded boss with real HEADROOM. `goblin_king` prints health 3 per layer, so
 * a bare `damage: 3` would put the unit AT its bar limit and read as dead (the
 * hand holder must be alive) — which is exactly the trap the first draft of this
 * file fell into. `maxHealth: 10` keeps the wound a wound.
 */
const WOUNDED_BOSS = { damage: 3, maxHealth: 10 } as const;

/** Hand the turn over so the boss activates (and therefore plays). */
function handOverToBoss(state: GameState, openerId: string): GameState {
  const opener = state.combat!.units[openerId];
  return applyOk(state, { type: "DEFEND_UNIT", playerId: opener.controllerId, unitId: openerId });
}

/**
 * Drive the fight with REAL legal actions (everybody Defends, every reaction
 * passes) until the combat reaches `targetRound`. Used where the claim can only
 * be measured in a later round.
 */
function runRoundsWithDefends(initial: GameState, targetRound: number): GameState {
  let state = initial;
  for (let step = 0; step < 200 && (state.combat?.round ?? 99) < targetRound; step += 1) {
    if (state.combat?.outcome) {
      break;
    }
    const seat = state.priorityPlayerId ?? state.activePlayerId!;
    const legal = getLegalActions(state, seat);
    const chosen =
      legal.find((entry) => entry.action.type === "PASS_REACTION") ??
      legal.find((entry) => entry.action.type === "DEFEND_UNIT") ??
      legal[0];
    if (!chosen) {
      break;
    }
    state = applyOk(state, chosen.action);
  }
  return state;
}

// ---------------------------------------------------------------------------
// 1. The pool is HONEST — every entry re-derived from its own printed card
// ---------------------------------------------------------------------------

/** The reducer's `getAmountByPower` rule: highest key ≤ power, else the lowest. */
function amountByPower(table: Record<string, number>, power: number): number {
  const keys = Object.keys(table)
    .map(Number)
    .sort((left, right) => left - right);
  let chosen = keys[0]!;
  for (const key of keys) {
    if (key <= power) {
      chosen = key;
    }
  }
  return table[String(chosen)]!;
}

type LooseEffect = {
  type: string;
  amount?: number;
  amountByPower?: Record<string, number>;
  stat?: string;
  duration?: { type: string };
  removeParalysis?: boolean;
  options?: { effect: LooseEffect }[];
};

/**
 * The printed effect an entry is read from: a CHOOSE_ONE artifact unwraps to its
 * FIRST option, which is the option every artifact entry declares it takes.
 */
function printedEffect(cardId: CardId): LooseEffect {
  const effect = cardLibrary[cardId]?.effect as unknown as LooseEffect;
  return effect.type === "CHOOSE_ONE" ? effect.options![0]!.effect : effect;
}

describe("enemy force — the pool is a faithful reading of real cards", () => {
  it("every pool card exists in the library, is a spell / artifact / statistic, and is implemented", () => {
    expect(ENEMY_FORCE_CARD_POOL.length).toBeGreaterThanOrEqual(8);
    for (const entry of ENEMY_FORCE_CARD_POOL) {
      const card = cardLibrary[entry.cardId];
      expect(card, `pool card ${entry.cardId} is not in the library`).toBeDefined();
      expect(["spell", "artifact", "statistic"], `${entry.cardId} kind`).toContain(card!.kind);
      expect(card!.implementationStatus, `${entry.cardId} status`).toBe("implemented");
      // The player must be able to SEE the card, so it needs a printed face.
      expect(card!.assets?.cardImage, `${entry.cardId} has no card face`).toBeTruthy();
    }
    // All three classes the user asked for are actually represented.
    const kinds = new Set(ENEMY_FORCE_CARD_POOL.map((entry) => cardLibrary[entry.cardId]!.kind));
    expect(kinds).toEqual(new Set(["spell", "artifact", "statistic"]));
  });

  it("no duplicate pool entries", () => {
    const ids = ENEMY_FORCE_CARD_POOL.map((entry) => entry.cardId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  /**
   * THE FAITHFULNESS CHECK. Every declared amount is re-derived from the card's
   * OWN definition at the entry's declared Power — so retuning a pool entry
   * without retuning (or re-reading) its printed card fails CI. This is the test
   * that makes `powerReading` more than a comment.
   */
  it("every declared amount IS the printed card's number at the declared Power", () => {
    for (const entry of ENEMY_FORCE_CARD_POOL) {
      const effect = printedEffect(entry.cardId);
      const printed =
        effect.amountByPower !== undefined
          ? amountByPower(effect.amountByPower, entry.power ?? 0)
          : effect.amount;
      expect(printed, `${entry.cardId}: no printed amount to read`).toBeDefined();
      const declared =
        entry.execution.k === "spell-damage" || entry.execution.k === "self-heal"
          ? entry.execution.amount
          : entry.execution.amount;
      expect(declared, `${entry.cardId} declares ${declared}, the card prints ${printed}`).toBe(
        printed
      );
      // A card that prints a Power TABLE must declare which breakpoint it is
      // read at; a flat printed side must not pretend to have one.
      expect(
        entry.power !== null,
        `${entry.cardId}: power/table mismatch (power ${entry.power}, table ${JSON.stringify(effect.amountByPower)})`
      ).toBe(effect.amountByPower !== undefined);
    }
  });

  it("the stat and the duration match the printed effect — or the entry declares its WIDENING", () => {
    for (const entry of ENEMY_FORCE_CARD_POOL) {
      const execution = entry.execution;
      if (execution.k === "spell-damage" || execution.k === "self-heal") {
        continue;
      }
      const effect = printedEffect(entry.cardId);
      if (effect.type === "ADD_COMBAT_STAT") {
        // A per-ATTACK printed modifier: the stat must still match exactly, and
        // the entry MUST state the widening and use the combat-round duration.
        expect(execution.stat, `${entry.cardId} stat`).toBe(effect.stat);
        expect(execution.duration.type, `${entry.cardId} widened duration`).toBe(
          "current-combat-round"
        );
        expect(entry.powerReading, `${entry.cardId} must declare its WIDENING`).toContain("WIDENING");
        continue;
      }
      // An ONGOING printed effect: stat and duration are taken verbatim, and the
      // entry must NOT be claiming a widening it does not need.
      expect(effect.type, `${entry.cardId} printed effect`).toBe("CREATE_INITIATIVE_BUFF");
      expect(execution.stat, `${entry.cardId} stat`).toBe("initiative");
      expect(execution.duration, `${entry.cardId} duration`).toEqual(effect.duration);
      expect(entry.powerReading).not.toContain("WIDENING");
    }
  });

  it("the cleanse rider is declared only where the printed card prints one", () => {
    for (const entry of ENEMY_FORCE_CARD_POOL) {
      if (entry.execution.k !== "self-heal") {
        continue;
      }
      expect(entry.execution.cleanse, `${entry.cardId} cleanse`).toBe(
        printedEffect(entry.cardId).removeParalysis === true
      );
    }
  });

  it("every entry carries a reviewer-facing Power reading", () => {
    for (const entry of ENEMY_FORCE_CARD_POOL) {
      expect(entry.powerReading.length, `${entry.cardId}`).toBeGreaterThan(40);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Hand size — including the wave EXCLUSION
// ---------------------------------------------------------------------------

describe("enemy force — hand size", () => {
  it("a raid-boss lair and a Dungeon WARDEN floor both hold five", () => {
    expect(enemyForceHandSize({ raidBossId: "lich_archon" })).toBe(ENEMY_FORCE_BOSS_HAND_SIZE);
    expect(enemyForceHandSize({ raidBossId: "lich_archon" })).toBe(5);
    expect(enemyForceHandSize({ dungeonFloor: 5 }, { wardenFloor: true })).toBe(5);
    expect(enemyForceHandSize({ dungeonFloor: 10 }, { wardenFloor: true })).toBe(5);
  });

  it("an ordinary Dungeon floor scales with the floor band — the force grows as you descend", () => {
    expect([1, 2, 3].map((floor) => enemyForceHandSize({ dungeonFloor: floor }))).toEqual([2, 2, 2]);
    expect([4, 5, 6, 7].map((floor) => enemyForceHandSize({ dungeonFloor: floor }))).toEqual([
      3, 3, 3, 3
    ]);
    expect([8, 9, 10].map((floor) => enemyForceHandSize({ dungeonFloor: floor }))).toEqual([4, 4, 4]);
  });

  it("CONTROL: a WAVE assault gets no hand at all, and neither does any other fight", () => {
    // The deliberate exclusion: waves already carry events / Stack Tokens /
    // veteran ranks / a mini-boss, and every seat is FORCED to fight them.
    expect(enemyForceHandSize({ waveAssault: { wave: 4 } })).toBe(0);
    // A wave mark WINS even if a boss/floor mark is somehow also present.
    expect(enemyForceHandSize({ waveAssault: { wave: 4 }, raidBossId: "lich_archon" })).toBe(0);
    expect(enemyForceHandSize({ waveAssault: { wave: 4 }, dungeonFloor: 9 })).toBe(0);
    // An ordinary guard field / bank / PvP fight carries none of the marks.
    expect(enemyForceHandSize({})).toBe(0);
  });

  it("the pre-fight notice names the count, and says nothing when there is no hand", () => {
    expect(enemyForceHandNotice(5)).toContain("5 cards");
    expect(enemyForceHandNotice(1)).toContain("1 card");
    expect(enemyForceHandNotice(1)).not.toContain("1 cards");
    expect(enemyForceHandNotice(0)).toBe("");
  });
});

// ---------------------------------------------------------------------------
// 3. The draw
// ---------------------------------------------------------------------------

describe("enemy force — the seeded draw", () => {
  it("is deterministic in (game seed, combat id) and never repeats a card", () => {
    const first = drawEnemyForceHand("seed-a", "combat_1", 5);
    expect(first).toHaveLength(5);
    expect(new Set(first).size).toBe(5);
    // Same inputs ⇒ same hand, on every client and after any reconnect.
    expect(drawEnemyForceHand("seed-a", "combat_1", 5)).toEqual(first);
    // Every drawn id is a real pool entry.
    for (const cardId of first) {
      expect(enemyForcePoolEntry(cardId)).not.toBeNull();
    }
  });

  it("a different fight draws a different hand (variety across fights)", () => {
    const hands = ["c1", "c2", "c3", "c4", "c5", "c6"].map((id) =>
      drawEnemyForceHand("seed-a", id, 5).join(",")
    );
    expect(new Set(hands).size).toBeGreaterThan(1);
  });

  it("dealing the hand moves NO card between zones — the copies are synthetic", () => {
    // The real "zero economy impact" invariant. (It cannot be phrased as "no
    // pool id appears in a hand": the pool is made of real library cards, and
    // `stat.attack` is a normal starting card, so ids legitimately coincide.)
    const { state } = stage("no-economy", null);
    const zoneFingerprint = (snapshot: GameState): string =>
      JSON.stringify([
        Object.entries(snapshot.decks)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([id, deck]) => [id, deck.drawPile.length, deck.discardPile.length]),
        Object.entries(snapshot.players)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([id, player]) => [id, player.hand, player.deck.length, player.discard.length])
      ]);
    const before = zoneFingerprint(state);
    expect(seedEnemyForceHandOnCombat(state.combat!, state.seed, 5)).toBe(true);
    expect(state.combat!.enemyForce!.cardIds).toHaveLength(5);
    expect(zoneFingerprint(state)).toBe(before);
  });

  it("a size of zero (or a bigger size than the pool) is handled", () => {
    expect(drawEnemyForceHand("seed-a", "combat_1", 0)).toEqual([]);
    expect(drawEnemyForceHand("seed-a", "combat_1", 99)).toHaveLength(ENEMY_FORCE_CARD_POOL.length);
  });
});

// ---------------------------------------------------------------------------
// 4. Target selection is a deterministic total order
// ---------------------------------------------------------------------------

describe("enemy force — target selection", () => {
  it("'toughest' takes the highest REMAINING health and 'fastest' the highest Initiative", () => {
    const { state, bossId } = stage("targets", ["spell.lightning_bolt"]);
    const combat = state.combat!;
    const boss = combat.units[bossId];
    const own = Object.values(combat.units).filter((unit) => unit.controllerId === "p1");
    // Make one unit unambiguously the toughest and a DIFFERENT one the fastest,
    // so the two pickers cannot be confused for each other.
    own[0].maxHealth = 30;
    own[0].damage = 0;
    own[0].initiative = 1;
    own[1].maxHealth = 4;
    own[1].damage = 0;
    own[1].initiative = 19;
    for (const unit of own.slice(2)) {
      unit.maxHealth = 5;
      unit.damage = 0;
      unit.initiative = 2;
    }
    expect(enemyForceTarget(combat, boss, "toughest")?.id).toBe(own[0].id);
    expect(enemyForceTarget(combat, boss, "fastest", state.activeEffects)?.id).toBe(own[1].id);
  });

  it("returns null when no enemy is alive", () => {
    const { state, bossId } = stage("no-targets", ["spell.lightning_bolt"]);
    const combat = state.combat!;
    for (const unit of Object.values(combat.units)) {
      if (unit.controllerId === "p1") {
        unit.damage = unit.maxHealth;
      }
    }
    expect(enemyForceTarget(combat, combat.units[bossId], "toughest")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 5. The EFFECTS — observable outcomes, each with a feature-removed CONTROL
// ---------------------------------------------------------------------------

function toughestOwnUnitId(state: GameState): string {
  const own = Object.values(state.combat!.units)
    .filter((unit) => unit.controllerId === "p1" && unit.damage < unit.maxHealth)
    .sort((left, right) => right.maxHealth - right.damage - (left.maxHealth - left.damage));
  return own[0]!.id;
}

describe("enemy force — a damage card really deals Spell damage", () => {
  it("Lightning Bolt costs the toughest defender 2 health, and the CONTROL costs it nothing", () => {
    const play = stage("bolt", ["spell.lightning_bolt"]);
    const victimId = toughestOwnUnitId(play.state);
    const before = play.state.combat!.units[victimId].damage;
    const after = handOverToBoss(play.state, play.openerId);
    // 2, not 3: the pool reads Lightning Bolt at POWER 0 (the monster side has
    // no hero and no Power statistic), which is both the faithful read and the
    // balance-pass retune recorded in pve-boss-balance.test.ts.
    expect(after.combat!.units[victimId].damage - before).toBe(2);
    // It is SPELL damage, through the ordinary damage channel.
    const assigned = after.eventLog.filter(
      (event) => event.type === "DAMAGE_ASSIGNED" && event.damageKind === "spell"
    );
    expect(assigned.length).toBeGreaterThan(0);
    // The card is spent and public; the round is marked fired.
    expect(after.combat!.enemyForce!.playedCardIds).toEqual(["spell.lightning_bolt"]);
    expect(after.combat!.enemyForce!.fired).toEqual([`${play.bossId}#1`]);
    // The feed names the card AND the number.
    const feed = after.eventLog.find((event) => event.type === "ENEMY_FORCE_CARD_PLAYED");
    expect(feed).toBeDefined();
    expect((feed as { message: string }).message).toContain("Lightning Bolt");
    expect((feed as { message: string }).message).toContain("2 Spell damage");

    // CONTROL: the identical fight with the feature removed (no enemyForce).
    const control = stage("bolt", null);
    const controlVictim = toughestOwnUnitId(control.state);
    const controlBefore = control.state.combat!.units[controlVictim].damage;
    const controlAfter = handOverToBoss(control.state, control.openerId);
    expect(controlAfter.combat!.units[controlVictim].damage - controlBefore).toBe(0);
    expect(
      controlAfter.eventLog.some((event) => event.type === "ENEMY_FORCE_CARD_PLAYED")
    ).toBe(false);
  });

  it("a damage-immune target turns the bolt aside whole", () => {
    const play = stage("immune", ["spell.lightning_bolt"]);
    const victimId = toughestOwnUnitId(play.state);
    play.state.combat!.units[victimId].invulnerableUntilActivation = true;
    const before = play.state.combat!.units[victimId].damage;
    const after = handOverToBoss(play.state, play.openerId);
    expect(after.combat!.units[victimId].damage - before).toBe(0);
    const feed = after.eventLog.find((event) => event.type === "ENEMY_FORCE_CARD_PLAYED");
    expect((feed as { message: string }).message).toContain("invulnerable");
    // The card is still SPENT — the enemy force does not get it back.
    expect(after.combat!.enemyForce!.playedCardIds).toEqual(["spell.lightning_bolt"]);
  });
});

describe("enemy force — a heal card really heals the boss", () => {
  it("Vial of Lifeblood removes 3 damage but never restores a shed health BAR", () => {
    const play = stage("heal", ["artifact.vial_of_lifeblood"], WOUNDED_BOSS);
    const stacksBefore = play.state.combat!.units[play.bossId].armyStacks;
    const after = handOverToBoss(play.state, play.openerId);
    expect(after.combat!.units[play.bossId].damage).toBe(0);
    // The shed-bar invariant: healing never gives a layer back.
    expect(after.combat!.units[play.bossId].armyStacks).toBe(stacksBefore);

    // CONTROL: same wounded boss, feature removed ⇒ the damage stays.
    const control = stage("heal", null, WOUNDED_BOSS);
    const controlAfter = handOverToBoss(control.state, control.openerId);
    expect(controlAfter.combat!.units[control.bossId].damage).toBe(3);
  });

  it("an UNWOUNDED boss holds the heal — nothing is spent", () => {
    // The scoring floor: a heal is worthless at full health, so the policy plays
    // nothing rather than burning a card. This is what makes it read like an
    // opponent instead of a metronome.
    const play = stage("heal-full", ["artifact.vial_of_lifeblood"], { damage: 0, maxHealth: 10 });
    const after = handOverToBoss(play.state, play.openerId);
    expect(after.combat!.enemyForce!.playedCardIds).toEqual([]);
    expect(after.combat!.enemyForce!.fired).toEqual([]);
  });

  it("Cure heals 1 (its declared breakpoint) and clears the boss's negative effects", () => {
    const play = stage("cure", ["spell.cure"], WOUNDED_BOSS);
    // A negative ongoing effect on the boss, which the printed Cure rider clears.
    play.state.activeEffects.push({
      id: "eff_slowed",
      name: "Test Slow",
      scope: "unit",
      controllerId: "p1",
      duration: { type: "combat" },
      polarity: "negative",
      removable: true,
      modifiers: [{ type: "INITIATIVE_BONUS", amount: -3 }],
      source: { type: "unit", unitId: play.openerId, controllerId: "p1" },
      target: { type: "unit", unitId: play.bossId }
    } as never);
    const after = handOverToBoss(play.state, play.openerId);
    // Printed Cure at Power 0 heals 1 (NOT the Vial's flat 3) — the declared
    // breakpoint. Cure earns its slot on the CLEANSE, not the heal size.
    expect(after.combat!.units[play.bossId].damage).toBe(2);
    expect(after.activeEffects.some((effect) => effect.id === "eff_slowed")).toBe(false);
  });

  it("LIMIT: a PARALYSED boss plays nothing — its whole activation is skipped first", () => {
    // Documented interaction, not a bug: `setActiveUnit` consumes a Paralysis
    // token and advances BEFORE the enemy-force seam is reached, so Paralysis
    // costs the enemy force its card for that round as well as its turn.
    const play = stage("paralysed", ["spell.lightning_bolt"], WOUNDED_BOSS);
    play.state.combat!.units[play.bossId].tokens = [{ kind: "paralysis", count: 1 }] as never;
    const after = handOverToBoss(play.state, play.openerId);
    expect(after.eventLog.some((event) => event.type === "ENEMY_FORCE_CARD_PLAYED")).toBe(false);
    expect(after.combat!.enemyForce!.playedCardIds).toEqual([]);
  });
});

describe("enemy force — a self-buff card really makes the boss hit harder", () => {
  it("Dragon Scale Shield's +2 Attack raises the damage the boss's own attack deals", () => {
    // The observable outcome, not a field read: the SAME boss attacking the SAME
    // defender deals 2 more damage with the card than without it.
    const measure = (hand: CardId[] | null): number => {
      const staged = stage("buff", hand, { attack: 4, position: 9 });
      let state = handOverToBoss(staged.state, staged.openerId);
      // Park a soft, adjacent victim with no retaliation-relevant kit.
      const victimId = Object.values(state.combat!.units).find(
        (unit) => unit.controllerId === "p1"
      )!.id;
      const victim = state.combat!.units[victimId];
      victim.position = 13;
      victim.defense = 0;
      victim.maxHealth = 40;
      victim.damage = 0;
      victim.abilities = [];
      const before = victim.damage;
      state = applyOk(state, {
        type: "ATTACK_UNIT",
        playerId: "p2",
        attackerId: staged.bossId,
        defenderId: victimId
      });
      let safety = 20;
      while (state.reactionWindow && safety > 0) {
        safety -= 1;
        state = applyOk(state, {
          type: "PASS_REACTION",
          playerId: state.reactionWindow.priorityPlayerId
        });
      }
      return state.combat!.units[victimId].damage - before;
    };
    const withCard = measure(["artifact.dragon_scale_shield"]);
    const control = measure(null);
    expect(withCard - control).toBe(2);
  });

  it("Cape of Velocity's +2 Initiative really moves the boss up a LATER round's activation order", () => {
    // Pinned by ORDER, not by an initiative field read (CLAUDE.md §1a). It must
    // be a LATER round: the buff lands while the boss is the active unit, and
    // `getActivationOrder` puts an already-acted unit at the back of the CURRENT
    // round however fast it is — so measuring round 1 would prove nothing.
    // Cape's printed duration is `combat`, so it is still live in round 2.
    const measure = (hand: CardId[] | null): { boss: number; rival: number } => {
      const staged = stage("cape", hand, { initiative: 20 });
      // Rival Initiative 21 sits exactly between the boss's base 20 and its
      // buffed 22, so the card is the only thing that can reorder them.
      const rival = Object.values(staged.state.combat!.units).find(
        (unit) => unit.controllerId === "p1" && unit.id !== staged.openerId
      )!;
      rival.initiative = 21;
      for (const unit of Object.values(staged.state.combat!.units)) {
        unit.maxHealth = 60;
        unit.damage = 0;
        unit.abilities = [];
      }
      let state = runRoundsWithDefends(handOverToBoss(staged.state, staged.openerId), 2);
      const order = getActivationOrder(state.combat!, state.activeEffects).map((unit) => unit.id);
      return { boss: order.indexOf(staged.bossId), rival: order.indexOf(rival.id) };
    };
    const withCard = measure(["artifact.cape_of_velocity"]);
    expect(withCard.boss, "the buffed boss must outrun the 21-Initiative rival").toBeLessThan(
      withCard.rival
    );
    // CONTROL: without the card the rival's 21 beats the boss's 20.
    const control = measure(null);
    expect(control.boss).toBeGreaterThan(control.rival);
  });
});

describe("enemy force — a debuff card really slows the fastest defender", () => {
  it("Slow drops the fastest enemy below a rival it used to outrun", () => {
    const staged = stage("slow", ["spell.slow"]);
    const own = Object.values(staged.state.combat!.units).filter(
      (unit) => unit.controllerId === "p1"
    );
    // `fast` (8) currently leads `mid` (7); −2 must put it behind.
    const fast = own.find((unit) => unit.id !== staged.openerId)!;
    const mid = own.find((unit) => unit.id !== staged.openerId && unit.id !== fast.id)!;
    fast.initiative = 8;
    mid.initiative = 7;
    for (const unit of own.filter((entry) => entry.id !== fast.id && entry.id !== mid.id)) {
      unit.initiative = 1;
    }
    const after = handOverToBoss(staged.state, staged.openerId);
    const order = getActivationOrder(after.combat!, after.activeEffects).map((unit) => unit.id);
    expect(order.indexOf(fast.id), "the slowed unit must now trail the 7-Initiative rival").
      toBeGreaterThan(order.indexOf(mid.id));

    // CONTROL: without the card the 8 still leads the 7.
    const control = stage("slow", null);
    const controlOwn = Object.values(control.state.combat!.units).filter(
      (unit) => unit.controllerId === "p1"
    );
    const controlFast = controlOwn.find((unit) => unit.id !== control.openerId)!;
    const controlMid = controlOwn.find(
      (unit) => unit.id !== control.openerId && unit.id !== controlFast.id
    )!;
    controlFast.initiative = 8;
    controlMid.initiative = 7;
    for (const unit of controlOwn.filter(
      (entry) => entry.id !== controlFast.id && entry.id !== controlMid.id
    )) {
      unit.initiative = 1;
    }
    const controlAfter = handOverToBoss(control.state, control.openerId);
    const controlOrder = getActivationOrder(
      controlAfter.combat!,
      controlAfter.activeEffects
    ).map((unit) => unit.id);
    expect(controlOrder.indexOf(controlFast.id)).toBeLessThan(
      controlOrder.indexOf(controlMid.id)
    );
  });
});

// ---------------------------------------------------------------------------
// 6. The play POLICY invariants — one per round, no windows, no double-fire
// ---------------------------------------------------------------------------

describe("enemy force — the play policy", () => {
  it("spends AT MOST one card per combat round across a real multi-round fight", () => {
    // Driven by REAL legal actions (everybody Defends), so the activation order,
    // the round wraps and the re-entries are the engine's own — the only shape
    // that can actually catch a per-round double-fire.
    const staged = stage("one-per-round", [
      "spell.lightning_bolt",
      "spell.magic_arrow",
      "spell.implosion",
      "artifact.cape_of_velocity"
    ]);
    // Give both sides enough health that nothing dies and the fight keeps
    // wrapping rounds while we count.
    for (const unit of Object.values(staged.state.combat!.units)) {
      unit.maxHealth = 60;
      unit.damage = 0;
      unit.abilities = [];
    }
    const state = runRoundsWithDefends(staged.state, 5);
    const force = state.combat!.enemyForce!;
    // The ENGINE's own ledger is the invariant: one `unitId#round` key per play.
    // (Asserting against a round counter kept by the test mis-attributes a play
    // that lands in the same action as a round wrap — which is exactly how the
    // first draft of this test produced a false "2 plays in round 1".)
    expect(new Set(force.fired).size, `duplicate fired keys: ${force.fired.join(", ")}`).toBe(
      force.fired.length
    );
    // Every spent card corresponds to exactly one fired round…
    expect(force.playedCardIds).toHaveLength(force.fired.length);
    // …the feed agrees…
    expect(
      state.eventLog.filter((event) => event.type === "ENEMY_FORCE_CARD_PLAYED")
    ).toHaveLength(force.playedCardIds.length);
    // …it really did play (otherwise this proves nothing)…
    expect(force.playedCardIds.length, "the enemy force never played").toBeGreaterThan(0);
    // …it kept playing across rounds (the cap is per round, not per fight)…
    expect(force.playedCardIds.length).toBeGreaterThan(1);
    // …and never more than once per round of the four it had.
    const rounds = force.fired.map((key) => key.split("#")[1]);
    expect(new Set(rounds).size).toBe(rounds.length);
    expect(force.playedCardIds.length).toBeLessThanOrEqual(4);
  });

  it("a play NEVER opens a reaction window or a pendingChoice — the anti-stall guarantee", () => {
    for (const cardId of ENEMY_FORCE_CARD_POOL.map((entry) => entry.cardId)) {
      const staged = stage(`no-window-${cardId}`, [cardId], WOUNDED_BOSS);
      const after = handOverToBoss(staged.state, staged.openerId);
      expect(after.reactionWindow, `${cardId} opened a reaction window`).toBeFalsy();
      expect(after.pendingChoice, `${cardId} opened a pendingChoice`).toBeFalsy();
    }
  });

  it("EVERY pool card resolves to a real play from the boss side", () => {
    // The sweep behind "no entry is decorative": each card, played on its own
    // from a wounded boss with live enemies, must be SPENT and must emit its
    // feed line. A pool entry the resolution cannot execute fails here.
    for (const cardId of ENEMY_FORCE_CARD_POOL.map((entry) => entry.cardId)) {
      const staged = stage(`resolves-${cardId}`, [cardId], WOUNDED_BOSS);
      const after = handOverToBoss(staged.state, staged.openerId);
      expect(after.combat!.enemyForce!.playedCardIds, `${cardId} was not spent`).toEqual([cardId]);
      const feed = after.eventLog.filter((event) => event.type === "ENEMY_FORCE_CARD_PLAYED");
      expect(feed, `${cardId} emitted no feed line`).toHaveLength(1);
      expect((feed[0] as { cardId: string }).cardId).toBe(cardId);
    }
  });

  it("a DEAD boss plays nothing, and its escort never inherits the hand", () => {
    const staged = stage("dead-boss", ["spell.lightning_bolt"]);
    const boss = staged.state.combat!.units[staged.bossId];
    boss.damage = boss.maxHealth;
    boss.armyStacks = 0;
    const after = handOverToBoss(staged.state, staged.openerId);
    expect(after.eventLog.some((event) => event.type === "ENEMY_FORCE_CARD_PLAYED")).toBe(false);
  });

  it("a fight that is ALREADY decided plays nothing — the Quick-Combat guarantee", () => {
    // Quick Combat (and the level auto-win) resolve a fight with NO unit ever
    // activating, and the enemy-force seam is read only at an activation start —
    // so a skipped fight can never spend a card. This pins the engine half of
    // that: with an outcome already on the combat, the seam is inert. (Lair and
    // Dungeon-floor fights are additionally never offered Quick Combat at all;
    // they open through their own visit steps, not the guarded-field path that
    // hosts `quickCombatAllowedAtDifficulty`.)
    const staged = stage("decided", ["spell.lightning_bolt"], WOUNDED_BOSS);
    staged.state.combat!.outcome = { winnerPlayerId: "p1", reason: "quick-combat" } as never;
    const after = handOverToBoss(staged.state, staged.openerId);
    expect(after.eventLog.some((event) => event.type === "ENEMY_FORCE_CARD_PLAYED")).toBe(false);
    expect(after.combat!.enemyForce!.playedCardIds).toEqual([]);
  });

  it("a spent hand plays nothing more", () => {
    const staged = stage("spent", ["spell.lightning_bolt"]);
    staged.state.combat!.enemyForce = {
      cardIds: ["spell.lightning_bolt"],
      playedCardIds: ["spell.lightning_bolt"],
      fired: []
    };
    const after = handOverToBoss(staged.state, staged.openerId);
    expect(after.eventLog.some((event) => event.type === "ENEMY_FORCE_CARD_PLAYED")).toBe(false);
  });

  it("prefers a KILL over a buff — the scoring is conditional, not a fixed order", () => {
    const staged = stage("kill-first", [
      "artifact.dragon_scale_shield",
      "spell.magic_arrow"
    ]);
    const combat = staged.state.combat!;
    // One enemy is one bolt from death and is also the toughest, so the damage
    // card both reaches it and scores the kill bonus.
    // Every enemy is exactly one Magic Arrow (1 damage at Power 0) from death,
    // so the damage card both reaches the toughest of them and scores the kill
    // bonus — which must outrank the +2 Attack buff.
    for (const unit of Object.values(combat.units).filter(
      (unit) => unit.controllerId === "p1"
    )) {
      unit.maxHealth = 1;
      unit.damage = 0;
      unit.armyStacks = 0;
    }
    const chosen = chooseEnemyForcePlay(combat, combat.units[staged.bossId], staged.state.seed);
    expect(chosen?.entry.cardId).toBe("spell.magic_arrow");
  });

  it("buff value DIMINISHES as the hand is spent (no endless self-buff stacking)", () => {
    const staged = stage("decay", ["stat.attack", "stat.defense"]);
    const combat = staged.state.combat!;
    const boss = combat.units[staged.bossId];
    const fresh = chooseEnemyForcePlay(combat, boss, staged.state.seed)!;
    // Pretend four cards have already been spent this fight.
    combat.enemyForce!.playedCardIds = ["a", "b", "c", "d"];
    const later = chooseEnemyForcePlay(combat, boss, staged.state.seed);
    expect(fresh.score).toBeGreaterThan(0);
    // Four decays (10 each) sink a +1 buff (weight 20 / 15) to nothing, so the
    // enemy force stops buffing and holds instead.
    expect(later).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 7. Masking — the boss's hand is secret, its spent cards are public
// ---------------------------------------------------------------------------

describe("enemy force — the player view masks the unplayed hand", () => {
  it("unplayed ids become HIDDEN_CARD_ID for every viewer; the count and the spent cards stay public", () => {
    const staged = stage("masking", ["spell.lightning_bolt", "spell.slow", "stat.attack"]);
    staged.state.combat!.enemyForce!.playedCardIds = ["spell.slow"];
    for (const viewer of ["p1", "p2"] as const) {
      const view = getPlayerView(staged.state, viewer);
      const force = view.combat!.enemyForce!;
      // The COUNT is public (the pre-fight prompt already announced it).
      expect(force.cardIds).toHaveLength(3);
      // The spent card keeps its real id; the two unplayed ones are masked.
      expect(force.cardIds.filter((cardId) => cardId === HIDDEN_CARD_ID)).toHaveLength(2);
      expect(force.cardIds).toContain("spell.slow");
      expect(force.cardIds).not.toContain("spell.lightning_bolt");
      expect(force.cardIds).not.toContain("stat.attack");
      expect(force.playedCardIds).toEqual(["spell.slow"]);
    }
    // The RAW state is untouched — masking is a view concern only.
    expect(staged.state.combat!.enemyForce!.cardIds).toEqual([
      "spell.lightning_bolt",
      "spell.slow",
      "stat.attack"
    ]);
  });

  it("CONTROL: a fight with no enemy force has no field to mask", () => {
    const staged = stage("masking-control", null);
    expect(getPlayerView(staged.state, "p1").combat!.enemyForce).toBeUndefined();
  });
});
