/**
 * The PvE ENEMY FORCE hand — data + PURE planning, no mutation.
 *
 * USER RULE (2026-08-21, replacing the deleted BOSS_SPELL_ROTATION): "i want
 * enemy FORCE that behave like single player, have cards random 5 ones and can
 * use them like spell or artifact or statistic". So in a raid-boss lair fight
 * and in a Dungeon-floor fight the monster side HOLDS CARDS like an opponent
 * seat does and spends at most one per combat round — at its boss unit's own
 * activation start, which is the "on its turn" moment a player would use, and
 * deliberately NOT at round start (the round-start chant is exactly what the
 * user rejected).
 *
 * ==== LEAD WITH THE LIMITS =================================================
 *
 *  1. **No reaction window is ever opened against an enemy-force play.** The
 *     whole play resolves inline (feed event + effect), like the removed monster
 *     rotation and like a `damage-pulse` combat script: the fighter cannot
 *     answer it with an instant, and pre-hit heals do not fire. That is the
 *     anti-stall guarantee — no window means no AI/AFK seat can ever be waiting
 *     on the monster side, and `computerDecisionOwner` needs no lockstep change.
 *  2. **Wave assaults get NOTHING.** `context.waveAssault` returns hand size 0.
 *     Calamity Waves already carry their own escalation (battle events, Stack
 *     Tokens, veteran ranks, a mini-boss); handing them a card hand too would
 *     stack two independent difficulty systems on the one encounter every seat
 *     is FORCED to fight. Deliberate, CONTROL-pinned.
 *  3. **The pool is CURATED and read at a FIXED POWER**, stated per entry. The
 *     monster side has no hero, no Power statistic and no cast window, so a
 *     Power-scaled card cannot resolve "at the caster's Power" — every entry
 *     declares the one Power breakpoint it is read at, and the number it
 *     produces is the printed card's number at that breakpoint. A printed card
 *     that cannot be executed faithfully with ZERO windows and no player-owned
 *     choice is simply NOT in the pool (that rules out every grade-gated denial
 *     spell, every area pick, Inferno's dice, and all the map/economy halves).
 *  4. **Two entry classes are a documented WIDENING, not a literal reading** —
 *     the per-attack `ADD_COMBAT_STAT` statistic/artifact faces. See
 *     `SELF_BUFF_WIDENING` below; it is stated on each affected entry.
 *  5. The cards are SYNTHETIC copies: no shared deck is touched, no card enters
 *     any player zone, no economy moves, and the hand dies with the combat
 *     state. Legacy snapshots (no `combat.enemyForce`) no-op everywhere.
 *  6. The pool does NOT read the Polish / Community balance reprints. It quotes
 *     the BASE printed numbers, so a balance pack cannot silently re-tune a
 *     boss fight. (The player still sees the reprinted FACE, which is the
 *     ordinary face-resolution behaviour.)
 *
 * Resolution lives in `reducer.ts` (`resolveEnemyForceCardPlay`), because a
 * monster bolt must take exactly the gates a Faerie Bolt does and
 * `reducedSpellDamage` is module-private there. Nothing in this file imports
 * reducer/adventure — no cycles.
 */

import { cardLibrary } from "@/data/cards/library";
import { pveFloorBand } from "@/data/anime/pve-combat-scripts";
import { createSeededRandom } from "./random";
import { effectiveInitiative } from "./active-effects";
import type {
  ActiveEffectState,
  CardId,
  CombatState,
  CombatUnitState,
  EffectDurationDefinition
} from "./state";

// ---------------------------------------------------------------------------
// The declared executions
// ---------------------------------------------------------------------------

/**
 * The FOUR execution shapes the engine implements for an enemy-force card. Each
 * is resolved once, in reducer.ts, for every pool entry that declares it — so a
 * new entry can never introduce a new code path (and therefore can never
 * introduce a new stall surface).
 */
export type EnemyForceExecution =
  | {
      /**
       * SPELL damage through the same gate order a Faerie Bolt takes:
       * damage-ward immunity → artifact school immunity → printed all-school
       * immunity → damage reduction/cap → `damageKind: "spell"`.
       *
       * `pick: "toughest"` = the living enemy with the highest REMAINING health
       * (`maxHealth − damage`), ties on the lowest board position.
       */
      k: "spell-damage";
      amount: number;
      pick: "toughest";
    }
  | {
      /**
       * A negative ActiveEffect on ONE living enemy. `pick: "fastest"` = the
       * highest effective Initiative, ties on the lowest board position.
       */
      k: "enemy-debuff";
      stat: "attack" | "initiative" | "defense";
      amount: number;
      pick: "fastest" | "toughest";
      duration: EffectDurationDefinition;
    }
  | {
      /** A positive ActiveEffect on the PLAYING unit itself. */
      k: "self-buff";
      stat: "attack" | "initiative" | "defense";
      amount: number;
      duration: EffectDurationDefinition;
    }
  | {
      /**
       * Heals the PLAYING unit's own damage. `cleanse` additionally removes its
       * negative ongoing effects and its Paralysis token (the printed Cure
       * rider). A shed boss health BAR is NEVER restored — `armyStacks` is
       * deliberately untouched, exactly as the removed rotation's heal was.
       */
      k: "self-heal";
      amount: number;
      cleanse: boolean;
    };

/**
 * THE DOCUMENTED WIDENING (limit 4 above). Four pool entries are printed as
 * per-ATTACK modifiers: they carry `trigger: UNIT_ATTACK_DECLARED` +
 * `ADD_COMBAT_STAT`, i.e. a player times them inside one attack's reaction
 * window. The enemy force has NO reaction window by design (limit 1), so there
 * is no attack for it to hang a one-attack modifier on.
 *
 * The reading: the card is played at the unit's own activation start and lasts
 * `current-combat-round`. That covers the attack it is obviously being played
 * for, and — the widening — any retaliation the unit makes in the same round.
 * The alternative readings were both worse: `current-activation` would miss the
 * retaliations a defender-side boss exists to make, and a genuine one-attack
 * modifier would need the window the anti-stall rule forbids.
 *
 * It is stated on each affected entry so no reader has to find it here.
 */
const SELF_BUFF_WIDENING =
  "WIDENING: printed as a one-attack modifier; the enemy force plays it at its own " +
  "activation start and it lasts the combat ROUND, so it also covers that round's retaliations.";

export type EnemyForcePoolEntry = {
  /** A REAL card-library id. The player sees this card's printed face. */
  cardId: CardId;
  /**
   * The Power breakpoint the printed card is read at. `null` = the card prints
   * no Power table (a flat statistic/artifact side), so nothing is being
   * chosen. Documented per entry in `powerReading`.
   */
  power: number | null;
  /** Why this execution IS the printed card at `power`. Reviewer-facing. */
  powerReading: string;
  /** Exactly what runs. The machine truth. */
  execution: EnemyForceExecution;
  /** The `spellFxPlans` key whose sprite + sound this play reuses. */
  fxKey: string;
};

/**
 * THE POOL. Ten curated entries across the three classes the user named —
 * SPELLS, ARTIFACTS and STATISTIC cards.
 *
 * Every entry's `powerReading` is the audit trail: the printed table, the
 * breakpoint, and the number that comes out. `enemy-force.test.ts` re-derives
 * each amount from `cardLibrary` itself, so an entry that drifts from its card
 * fails CI rather than quietly re-tuning a boss.
 */
export const ENEMY_FORCE_CARD_POOL: readonly EnemyForcePoolEntry[] = [
  // ---- SPELLS: single-target damage ---------------------------------------
  {
    cardId: "spell.magic_arrow",
    power: 0,
    powerReading:
      "Magic Arrow prints DEAL_DAMAGE amountByPower {0:1, 1:2, 2:3}; read at Power 0 → 1 spell " +
      "damage to one enemy unit. (`STARTING_ONLY_SPELLS` flags Magic Arrow for DECK JOINING only — " +
      "the synthetic enemy hand joins no deck, so the flag does not apply here.)",
    execution: { k: "spell-damage", amount: 1, pick: "toughest" },
    fxKey: "spell.magic_arrow"
  },
  {
    cardId: "spell.lightning_bolt",
    power: 0,
    powerReading:
      "Lightning Bolt prints DEAL_DAMAGE amountByPower {0:2, 1:3, 2:4}; read at Power 0 → 2 spell " +
      "damage to one enemy unit. The pool's hardest single hit.",
    execution: { k: "spell-damage", amount: 2, pick: "toughest" },
    fxKey: "spell.lightning_bolt"
  },
  {
    cardId: "spell.implosion",
    power: 1,
    powerReading:
      "Implosion prints DEAL_DAMAGE amountByPower {0:0, 1:2, 3:4, 5:6} — the printed card 'needs at " +
      "least Power 1'. Read at that minimum, Power 1 → 2 spell damage to one enemy unit.",
    execution: { k: "spell-damage", amount: 2, pick: "toughest" },
    fxKey: "spell.implosion"
  },
  // ---- SPELLS: one-stat enemy debuff --------------------------------------
  {
    cardId: "spell.slow",
    power: 0,
    powerReading:
      "Slow prints CREATE_INITIATIVE_BUFF amountByPower {0:-1, 1:-2, 2:-3} with duration " +
      "{type:'combat'}; read at Power 0 → −1 Initiative on one enemy unit until the end of the " +
      "combat. EXACT: the amount, the polarity and the printed duration are all the card's own. " +
      "Aimed at the FASTEST enemy, which is what the card is for.",
    execution: {
      k: "enemy-debuff",
      stat: "initiative",
      amount: -1,
      pick: "fastest",
      duration: { type: "combat" }
    },
    fxKey: "spell.slow"
  },
  // ---- STATISTIC cards ----------------------------------------------------
  {
    cardId: "stat.attack",
    power: null,
    powerReading:
      "The Attack statistic's BASIC side prints ADD_COMBAT_STAT attack +1 (its expert side, +2, is " +
      "crown-gated and the monster side holds no crowns, so the basic side is the honest read). " +
      SELF_BUFF_WIDENING,
    execution: {
      k: "self-buff",
      stat: "attack",
      amount: 1,
      duration: { type: "current-combat-round" }
    },
    fxKey: "spell.bloodlust"
  },
  {
    cardId: "stat.defense",
    power: null,
    powerReading:
      "The Defense statistic's BASIC side prints ADD_COMBAT_STAT defense +1 (expert +2 is " +
      "crown-gated; see stat.attack). " + SELF_BUFF_WIDENING,
    execution: {
      k: "self-buff",
      stat: "defense",
      amount: 1,
      duration: { type: "current-combat-round" }
    },
    fxKey: "spell.stone_skin"
  },
  // ---- ARTIFACTS ----------------------------------------------------------
  {
    cardId: "artifact.dragon_scale_shield",
    power: null,
    powerReading:
      "Dragon Scale Shield prints '+2 attack. — OR — +2 defense.'; the enemy force takes the FIRST " +
      "option (ADD_COMBAT_STAT attack +2) — a monster with a hand plays the aggressive half. " +
      SELF_BUFF_WIDENING,
    execution: {
      k: "self-buff",
      stat: "attack",
      amount: 2,
      duration: { type: "current-combat-round" }
    },
    fxKey: "spell.bloodlust"
  },
  {
    cardId: "artifact.cape_of_velocity",
    power: null,
    powerReading:
      "Cape of Velocity prints 'Until the end of the Combat, this unit gains +2 initiative. — OR — " +
      "Gain 2 gold.'; the enemy force takes the first option. EXACT: the printed effect literally " +
      "IS CREATE_INITIATIVE_BUFF amount 2, duration {type:'combat'}, positive, on a friendly unit " +
      "— here the playing unit itself. (The gold half is meaningless to a monster.)",
    execution: {
      k: "self-buff",
      stat: "initiative",
      amount: 2,
      duration: { type: "combat" }
    },
    fxKey: "spell.haste"
  },
  {
    cardId: "artifact.vial_of_lifeblood",
    power: null,
    powerReading:
      "Vial of Lifeblood prints 'Remove up to 3 damage from one of your units. — OR — +1 HP for " +
      "this combat.'; the enemy force takes the first option. EXACT: HEAL_DAMAGE amount 3 on a " +
      "friendly unit — here itself. A shed health BAR is never restored (see the self-heal note).",
    execution: { k: "self-heal", amount: 3, cleanse: false },
    fxKey: "spell.cure"
  },
  {
    cardId: "spell.cure",
    power: 0,
    powerReading:
      "Cure prints HEAL_DAMAGE_AND_REMOVE_EFFECTS amountByPower {0:1, 1:2, 2:3} with " +
      "removePolarity 'negative' + removeParalysis, on a friendly unit; read at Power 0 → remove 1 " +
      "damage from itself AND clear its negative ongoing effects and Paralysis. EXACT at that " +
      "breakpoint, rider included — the cleanse is what makes it worth playing at 1.",
    execution: { k: "self-heal", amount: 1, cleanse: true },
    fxKey: "spell.cure"
  }
];

/** Pool lookup by card id (the resolution side reads the execution from here). */
export function enemyForcePoolEntry(cardId: CardId): EnemyForcePoolEntry | null {
  return ENEMY_FORCE_CARD_POOL.find((entry) => entry.cardId === cardId) ?? null;
}

/** The printed card NAME the feed and the cue banner show. */
export function enemyForceCardName(cardId: CardId): string {
  return cardLibrary[cardId]?.name ?? cardId;
}

// ---------------------------------------------------------------------------
// Hand size
// ---------------------------------------------------------------------------

/** A raid-boss lair and a Dungeon WARDEN floor both field the user's five. */
export const ENEMY_FORCE_BOSS_HAND_SIZE = 5;

/**
 * How many cards the enemy force holds in THIS fight.
 *
 *  - raid-boss lair (`raidBossId`): 5 — the user's number.
 *  - Dungeon WARDEN floors (5 / 10): 5 — a warden is a boss.
 *  - ordinary Dungeon floors: the floor BAND (`pveFloorBand`) — shallow 2, deep
 *    3, abyss 4. The enemy force GROWS as you descend, which is the Dungeon's
 *    whole shape, and it never reaches a lair's five outside a warden fight.
 *  - wave assaults: 0 (limit 2 at the top of this file).
 *  - anything else (an ordinary guard field, a bank, PvP, the sandbox): 0.
 *
 * `wardenFloor` is passed in rather than derived, so this stays a leaf: the
 * caller already knows whether the floor it is staging carries a warden
 * (`dungeonBossId`).
 */
export function enemyForceHandSize(
  context: { waveAssault?: unknown; raidBossId?: string; dungeonFloor?: number },
  options: { wardenFloor?: boolean } = {}
): number {
  if (context.waveAssault) {
    return 0;
  }
  if (context.raidBossId !== undefined) {
    return ENEMY_FORCE_BOSS_HAND_SIZE;
  }
  if (context.dungeonFloor !== undefined) {
    if (options.wardenFloor) {
      return ENEMY_FORCE_BOSS_HAND_SIZE;
    }
    const band = pveFloorBand(context.dungeonFloor);
    return band === "shallow" ? 2 : band === "deep" ? 3 : 4;
  }
  return 0;
}

/** The one-line pre-fight warning both PvE prompts append. Empty when there is no hand. */
export function enemyForceHandNotice(count: number): string {
  return count > 0
    ? ` The enemy force holds ${count} card${count === 1 ? "" : "s"} and may spend one each combat round.`
    : "";
}

// ---------------------------------------------------------------------------
// The draw
// ---------------------------------------------------------------------------

/**
 * The seeded hand for a fight. Deterministic in (game seed, combat id, size) —
 * the `{ salt: false }` construction `rollRandomBankRewardStackTokens` uses, so
 * every client and the worker draw the SAME hand, it cannot be rerolled by
 * reconnecting, and a fresh fight (a new combat id) draws a fresh hand.
 *
 * WITHOUT REPLACEMENT: a hand never holds two copies of one card. That is not
 * only flavour — the view masking keys "is this card spent?" on the id, so a
 * duplicate would unmask its own twin.
 */
export function drawEnemyForceHand(seed: string, combatId: string, size: number): CardId[] {
  if (size <= 0) {
    return [];
  }
  const random = createSeededRandom(`${seed}#enemy-force#${combatId}`, { salt: false });
  const bag = ENEMY_FORCE_CARD_POOL.map((entry) => entry.cardId);
  const hand: CardId[] = [];
  const count = Math.min(size, bag.length);
  for (let index = 0; index < count; index += 1) {
    const pick = random.nextInt(0, bag.length - 1);
    hand.push(bag.splice(pick, 1)[0]!);
  }
  return hand;
}

/**
 * Write the hand onto a combat, IDEMPOTENTLY. The guard lives here rather than
 * at the (unexported) reducer call site so it is directly testable: the
 * combat-start package it runs in is re-entered whenever a pre-combat window
 * (commander sort, Bounty-Hunter mark, Disciplinary Committee) resolves back
 * into it, and a re-deal would both reroll the hand and resurrect spent cards.
 *
 * Returns true when this call actually dealt the hand.
 */
export function seedEnemyForceHandOnCombat(
  combat: CombatState,
  seed: string,
  size: number
): boolean {
  if (combat.enemyForce || size <= 0) {
    return false;
  }
  const cardIds = drawEnemyForceHand(seed, combat.id, size);
  if (cardIds.length === 0) {
    return false;
  }
  combat.enemyForce = { cardIds, playedCardIds: [], fired: [] };
  return true;
}

// ---------------------------------------------------------------------------
// Target pickers (deterministic total orders — no RNG at play time)
// ---------------------------------------------------------------------------

function isAlive(unit: CombatUnitState): boolean {
  return unit.damage < unit.maxHealth;
}

/** Living units on the OTHER side from `unit`, ascending by board position. */
export function enemyForceEnemies(combat: CombatState, unit: CombatUnitState): CombatUnitState[] {
  return Object.values(combat.units)
    .filter((candidate) => isAlive(candidate) && candidate.controllerId !== unit.controllerId)
    .sort((left, right) => left.position - right.position);
}

/**
 * The single enemy an execution singles out, or null when there is none alive.
 * Both pickers walk the position-ascending list with a strict `>`, so a tie
 * always keeps the LOWEST position — a total order, identical on every client.
 */
export function enemyForceTarget(
  combat: CombatState,
  unit: CombatUnitState,
  pick: "toughest" | "fastest",
  activeEffects: ActiveEffectState[] = []
): CombatUnitState | null {
  let best: CombatUnitState | null = null;
  let bestScore = -Infinity;
  for (const enemy of enemyForceEnemies(combat, unit)) {
    const score =
      pick === "toughest"
        ? enemy.maxHealth - enemy.damage
        : effectiveInitiative(enemy, activeEffects, combat);
    if (score > bestScore) {
      best = enemy;
      bestScore = score;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// The play policy
// ---------------------------------------------------------------------------

/**
 * WHICH unit spends the hand: the living BOSS body (`bossUnit`), lowest position
 * first if a fight somehow fields two. A layered boss IS the enemy force's
 * hand-holder; when it is dead or devoured, nothing is played (its escort never
 * inherits the cards).
 */
export function enemyForceHandHolder(combat: CombatState): CombatUnitState | null {
  return (
    Object.values(combat.units)
      .filter((unit) => unit.bossUnit && isAlive(unit))
      .sort((left, right) => left.position - right.position)[0] ?? null
  );
}

/** One scored candidate: the entry, its points, and why (feed/debug readable). */
export type EnemyForceCandidate = {
  entry: EnemyForcePoolEntry;
  score: number;
  /** The unit the execution singled out, when it has one. */
  target: CombatUnitState | null;
};

/**
 * THE SCORING. It exists so the enemy force reads like an opponent making
 * decisions rather than a metronome, and so it can decide to play NOTHING.
 *
 * Rules, in the order they matter:
 *
 *  - **A heal is only worth it when the boss is meaningfully wounded.** Below
 *    `HEAL_MIN_DAMAGE` (2) damage a heal scores 0 and is therefore never played
 *    — this is the single biggest reason a full-health boss holds its cards. The
 *    score is the damage it would ACTUALLY restore (`min(amount, damage)`), so a
 *    3-heal on a 1-damage boss is worth less than on a 3-damage one.
 *  - **Damage is scored on what it would actually deal, and a KILL is worth a
 *    lot.** `KILL_BONUS` (60) is larger than any buff can score, so a boss that
 *    can finish a wounded unit does that instead of buffing itself. (The score
 *    uses REMAINING health, not the post-mitigation number — the policy is a
 *    plan, and mitigation is applied by the resolution.)
 *  - **Buffs and debuffs have DIMINISHING value**: each card already spent this
 *    fight lowers every buff/debuff score by `STACK_DECAY` (10), so the boss
 *    does not spend its whole hand stacking +1 Attacks. Damage and heals are
 *    deliberately exempt — a kill is a kill however many cards came before.
 *  - **A buff scores 0 with no living enemy left**: buffing into an empty board
 *    is the definition of a wasted card (and the fight is over anyway).
 *  - **A small seeded jitter breaks ties** (`VARIETY_JITTER`, 0–7 points), keyed
 *    on (seed, combat id, round). It is smaller than the gap between the classes
 *    above, so it never overturns "kill instead of buff" — it only decides
 *    between comparable cards, which is what stops every fight against the same
 *    boss looking identical.
 *
 * Returns the candidates sorted best-first, INCLUDING zero-scored ones (the
 * caller plays the top one only when its score is > 0). Pure: no mutation.
 */
export const HEAL_MIN_DAMAGE = 2;
export const KILL_BONUS = 60;
export const STACK_DECAY = 10;
export const VARIETY_JITTER = 8;

export function scoreEnemyForcePlays(
  combat: CombatState,
  holder: CombatUnitState,
  seed: string,
  activeEffects: ActiveEffectState[] = []
): EnemyForceCandidate[] {
  const force = combat.enemyForce;
  if (!force) {
    return [];
  }
  const unplayed = force.cardIds.filter((cardId) => !force.playedCardIds.includes(cardId));
  const enemies = enemyForceEnemies(combat, holder);
  const decay = STACK_DECAY * force.playedCardIds.length;
  // One jitter stream per (fight, round): the same round always scores the same
  // way, so a replay/reconnect reproduces the play exactly.
  const random = createSeededRandom(`${seed}#enemy-force-play#${combat.id}#${combat.round}`, {
    salt: false
  });

  const candidates: EnemyForceCandidate[] = [];
  for (const cardId of unplayed) {
    const entry = enemyForcePoolEntry(cardId);
    if (!entry) {
      continue;
    }
    const jitter = random.nextInt(0, VARIETY_JITTER - 1);
    const execution = entry.execution;
    let score = 0;
    let target: CombatUnitState | null = null;

    if (execution.k === "self-heal") {
      const restorable = Math.min(execution.amount, holder.damage);
      // The cleanse rider makes Cure worth playing at exactly the heal floor
      // even when a stronger raw heal is also in hand.
      score =
        holder.damage >= HEAL_MIN_DAMAGE ? restorable * 30 + (execution.cleanse ? 10 : 0) + jitter : 0;
    } else if (execution.k === "spell-damage") {
      target = enemyForceTarget(combat, holder, execution.pick, activeEffects);
      if (target) {
        const remaining = target.maxHealth - target.damage;
        score = execution.amount * 25 + (remaining <= execution.amount ? KILL_BONUS : 0) + jitter;
      }
    } else if (execution.k === "self-buff") {
      if (enemies.length > 0) {
        const weight = execution.stat === "attack" ? 20 : execution.stat === "defense" ? 15 : 12;
        // The jitter is added ONLY to a still-positive raw value. Clamping first
        // and then adding it would leave a fully decayed buff scoring 1–7 and
        // therefore still playable — the decay would never actually stop the
        // stacking it exists to stop.
        const raw = execution.amount * weight - decay;
        score = raw > 0 ? raw + jitter : 0;
      }
    } else {
      target = enemyForceTarget(combat, holder, execution.pick, activeEffects);
      if (target) {
        const raw = Math.abs(execution.amount) * 15 - decay;
        score = raw > 0 ? raw + jitter : 0;
      }
    }

    candidates.push({ entry, score, target });
  }
  // Best first; ties fall back to the pool's own order so the sort is total.
  return candidates.sort(
    (left, right) =>
      right.score - left.score ||
      ENEMY_FORCE_CARD_POOL.indexOf(left.entry) - ENEMY_FORCE_CARD_POOL.indexOf(right.entry)
  );
}

/**
 * The card the enemy force plays at `holder`'s activation start this round, or
 * null for "it holds". Null whenever the hand is empty/spent, the holder is
 * gone, this `unitId#round` already fired, or nothing scored above zero.
 */
export function chooseEnemyForcePlay(
  combat: CombatState,
  holder: CombatUnitState,
  seed: string,
  activeEffects: ActiveEffectState[] = []
): EnemyForceCandidate | null {
  const best = scoreEnemyForcePlays(combat, holder, seed, activeEffects)[0];
  return best && best.score > 0 ? best : null;
}

/** The `unitId#round` idempotence key a play records in `enemyForce.fired`. */
export function enemyForceFiredKey(unitId: string, round: number): string {
  return `${unitId}#${round}`;
}
