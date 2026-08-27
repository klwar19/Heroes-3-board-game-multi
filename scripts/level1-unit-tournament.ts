/**
 * LEVEL-1 UNIT TOURNAMENT — a standalone, seeded round-robin simulation.
 *
 *   npx tsx scripts/level1-unit-tournament.ts [--side few|pack|both] [--seeds N]
 *
 * NOT a vitest test. It runs REAL `applyAction` / `getLegalActions` fights, one
 * unit per side, and reports who wins the most.
 *
 * Staging is copied (not imported) from the harness pattern in
 * `src/engine/pve-boss-balance.test.ts` — the combat state is built directly, so
 * `finalizeCombatStart` never runs and no hero card, specialty, commander,
 * equipment, computer boost or PvE enemy-force hand can enter the fight.
 *
 * ==== WHAT THIS DOES NOT MEASURE ====================================
 * 1. No hero, no cards, no spells, no morale, no war machines, no commanders.
 *    A unit whose printed value is a card/spell interaction scores as ~0 here.
 * 2. The attacking side is a GREEDY BOT (`pickAction`: attack > close > defend),
 *    the defending side is the engine's own Neutral AI. Those are not the same
 *    driver — which is exactly why every pairing is played in BOTH roles and the
 *    two halves are summed.
 * 3. `unlimitedRounds` is on, so a pair that cannot kill each other DRAWS at the
 *    step cap. Draws are reported, never hidden and never counted as wins.
 * 4. The attacker takes the round-1 opening activation (a bootstrap requirement:
 *    nothing pumps a neutral opening slot in a directly-staged combat). Constant
 *    across every fight, and cancelled by the role swap.
 */

import { writeFileSync } from "node:fs";
import { applyAction, createAdventureGameState, getLegalActions } from "../src/engine/index";
import { makeCombatUnitFromArmy } from "../src/engine/adventure";
import { NEUTRAL_PLAYER_ID } from "../src/engine/state";
import type { CombatState, GameAction, GameState, LegalAction, PlayerId } from "../src/engine/state";
import { coreUnitDefinitions } from "../src/data/factions/units";

// ---------------------------------------------------------------------------
// The roster
// ---------------------------------------------------------------------------

/**
 * There is no `level` field in the data — a unit carries a TIER
 * (bronze/silver/gold/azure). A faction's "level-1 unit" is therefore read as
 * the FIRST BRONZE unit in its declared roster order in `units.ts`, i.e. the
 * unit its level-1 dwelling recruits. Summon-only bodies are skipped (they are
 * not recruitable), and the pseudo-faction `neutral` is skipped (it is the
 * shared Neutral decks, not a town).
 */
const SKIP_FACTIONS = new Set(["neutral"]);

type Entry = { unitDefId: string; name: string; faction: string; tier: string; type: string };

/**
 * The level-N unit = the N-th NON-summonOnly unit in the faction's declared
 * roster order in `units.ts` (that order IS the dwelling ladder). Tier is
 * REPORTED, never filtered — a level-N slot may be silver.
 */
function levelRoster(level: number): Entry[] {
  const counts = new Map<string, number>();
  const out: Entry[] = [];
  for (const [id, def] of Object.entries(coreUnitDefinitions)) {
    if (SKIP_FACTIONS.has(def.faction)) continue;
    if ((def as { summonOnly?: boolean }).summonOnly) continue;
    const n = (counts.get(def.faction) ?? 0) + 1;
    counts.set(def.faction, n);
    if (n !== level) continue;
    out.push({ unitDefId: id, name: def.name, faction: def.faction, tier: def.tier, type: def.type });
  }
  return out;
}

/**
 * CHALLENGER-vs-FIELD mode (--challengers <ids> --field-levels 4,5).
 *
 * WHY: `levelRoster` reads "level N" as the N-th roster entry, which is the
 * dwelling ladder for the 18 standard towns but NOT for MGQ — MGQ has a large
 * FLAT roster (8 bronze / 13 silver / 8 gold recruitables, no 7-slot ladder), so
 * levels 4-7 picked arbitrary BRONZE bodies and scored ~0%. This mode instead
 * fights named units against the union of the given level fields, with MGQ
 * itself excluded from the field so no MGQ-vs-MGQ fight pollutes the win rate.
 */
function unitEntry(unitDefId: string): Entry {
  const def = (coreUnitDefinitions as Record<string, any>)[unitDefId];
  if (!def) throw new Error(`Unknown unitDefId ${unitDefId}`);
  return { unitDefId, name: def.name, faction: def.faction, tier: def.tier, type: def.type };
}

function fieldRoster(levels: number[], excludeFactions: Set<string>): Entry[] {
  const out: Entry[] = [];
  for (const level of levels) {
    for (const entry of levelRoster(level)) {
      if (excludeFactions.has(entry.faction)) continue;
      out.push(entry);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Fight construction
// ---------------------------------------------------------------------------

/**
 * STAGING GEOMETRY. The battlefield is 20 cells, 4 columns x 5 rows
 * (`adventure-reducer.ts`): DEFENDER_BACKLINE 0-3, DEFENDER_FRONTLINE 4-7,
 * middle row 8-11, ATTACKER_FRONTLINE 12-15, ATTACKER_BACKLINE 16-19.
 *
 * The old level-1 staging put the attacker on 5 and the defender on 13 — each
 * unit standing in the OTHER side's frontline, 2 rows apart, i.e. essentially at
 * melee contact on turn 1. That silently taxed every ranged / high-Initiative
 * unit, which is the fairness bug this flag fixes.
 *
 * --start-apart (DEFAULT ON; --no-start-apart restores the legacy staging) uses
 * the two BACKLINE centre cells:
 *   attacker 17 (ATTACKER_BACKLINE, row 4 col 1)
 *   defender  1 (DEFENDER_BACKLINE, row 0 col 1)
 * Same column, 4 rows apart, each exactly 2 rows from the middle row (8-11) —
 * symmetric by construction.
 */
const APART_ATTACKER_CELL = 17;
const APART_DEFENDER_CELL = 1;
const CLOSE_ATTACKER_CELL = 5;
const CLOSE_DEFENDER_CELL = 13;
let ATTACKER_CELL = APART_ATTACKER_CELL;
let DEFENDER_CELL = APART_DEFENDER_CELL;
const STEP_CAP = 600;

function baseState(seed: string): GameState {
  const state = createAdventureGameState({
    seed,
    difficulty: "normal",
    rollFirstPlayer: false
  } as never);
  for (const player of Object.values(state.players)) {
    player.canMulligan = false;
    player.needsHandRefresh = false;
    player.hand = []; // cards are out of scope
  }
  state.adventure!.rewardQueue = [];
  state.adventure!.pendingVisit = null;
  state.pendingChoice = null;
  return state;
}

function stageDuel(
  seed: string,
  attacker: Entry,
  defender: Entry,
  side: "few" | "pack"
): GameState {
  const state = baseState(seed);
  const units: CombatState["units"] = {};

  const own = makeCombatUnitFromArmy(
    { id: "own_0", unitDefId: attacker.unitDefId, side },
    "p1",
    "u_own_0",
    ATTACKER_CELL,
    "binh"
  );
  if (!own) throw new Error(`Unknown unit ${attacker.unitDefId}#${side}`);
  units[own.id] = own;

  const foe = makeCombatUnitFromArmy(
    { id: "foe_0", unitDefId: defender.unitDefId, side },
    NEUTRAL_PLAYER_ID,
    "u_foe_0",
    DEFENDER_CELL,
    "binh"
  );
  if (!foe) throw new Error(`Unknown unit ${defender.unitDefId}#${side}`);
  units[foe.id] = foe;

  const hero = state.heroes.hero_p1;
  state.combat = {
    id: `duel_${attacker.unitDefId}_${defender.unitDefId}_${seed}`,
    round: 1,
    attackerPlayerId: "p1",
    defenderPlayerId: NEUTRAL_PLAYER_ID,
    activeUnitId: own.id,
    setup: null,
    awaitingContinue: false,
    outcome: null,
    units,
    dice: { faces: [-1, 0, 0, 1, 1, 1], seed: `${seed}-die`, rollCount: 0 },
    context: {
      kind: "neutral",
      heroId: hero.id,
      fieldId: hero.spaceId ?? "field",
      difficulty: 0,
      hasAzure: false,
      unlimitedRounds: true
    }
  } as unknown as CombatState;
  state.phase = "combat";
  state.activePlayerId = "p1";
  state.priorityPlayerId = null;
  return state;
}

// ---------------------------------------------------------------------------
// The greedy driver (same policy in both roles — see limit 2 in the header)
// ---------------------------------------------------------------------------

const FORBIDDEN = new Set([
  "RETREAT_COMBAT",
  "SURRENDER_COMBAT",
  "GIVE_UP_COMBAT",
  "QUICK_COMBAT",
  "CONTINUE_NEUTRAL_COMBAT",
  "WAIT_UNIT"
]);

const PREFERENCE = [
  "PASS_REACTION",
  "CONTINUE_NEUTRAL_STEP",
  "ACKNOWLEDGE_COMBAT_END",
  "ATTACK_UNIT",
  "MOVE_UNIT",
  "DEFEND_UNIT"
];

function boardDistance(left: number, right: number): number {
  const columns = 4;
  return (
    Math.abs(Math.floor(left / columns) - Math.floor(right / columns)) +
    Math.abs((left % columns) - (right % columns))
  );
}

/**
 * --shooters-hold: a RANGED active unit that can no longer attack this
 * activation ends it instead of walking toward the foe. Without this the greedy
 * bot shoots and then closes to melee, throwing away the very range advantage
 * the opposite-backline staging exists to measure.
 */
let SHOOTERS_HOLD = false;

function pickAction(state: GameState, legal: LegalAction[]): GameAction | null {
  const usable = legal.filter((entry) => !FORBIDDEN.has(entry.action.type));
  if (usable.length === 0) return null;
  if (SHOOTERS_HOLD) {
    const active = Object.values(state.combat?.units ?? {}).find(
      (unit) => unit.id === state.combat?.activeUnitId
    );
    const isRanged = (active as { type?: string } | undefined)?.type === "ranged";
    const canAttack = usable.some((entry) => entry.action.type === "ATTACK_UNIT");
    if (isRanged && !canAttack) {
      const end = usable.find((entry) => entry.action.type === "END_ACTIVATION");
      if (end) return end.action;
    }
  }
  const foePosition = Object.values(state.combat?.units ?? {}).find(
    (unit) => unit.controllerId === NEUTRAL_PLAYER_ID && unit.damage < unit.maxHealth
  )?.position;

  for (const type of PREFERENCE) {
    const matches = usable.filter((entry) => entry.action.type === type);
    if (matches.length === 0) continue;
    if (type === "MOVE_UNIT" && foePosition !== undefined) {
      const sorted = [...matches].sort(
        (left, right) =>
          boardDistance((left.action as { destination: number }).destination, foePosition) -
          boardDistance((right.action as { destination: number }).destination, foePosition)
      );
      return sorted[0].action;
    }
    return matches[0].action;
  }
  return usable[0].action;
}

type FightRow = {
  side: "few" | "pack";
  attacker: string;
  defender: string;
  outcome: string;
  rounds: number;
};

type FightOutcome = "attacker" | "defender" | "draw" | "error";
type FightResult = { outcome: FightOutcome; rounds: number; steps: number; note?: string };

function runFight(initial: GameState): FightResult {
  let state = initial;
  let steps = 0;
  try {
    while (steps < STEP_CAP) {
      if (state.combat?.outcome) break;
      steps += 1;
      const seats: PlayerId[] = [];
      if (state.priorityPlayerId && state.priorityPlayerId !== NEUTRAL_PLAYER_ID) {
        seats.push(state.priorityPlayerId);
      }
      if (!seats.includes("p1")) seats.push("p1");
      let chosen: GameAction | null = null;
      for (const seat of seats) {
        chosen = pickAction(state, getLegalActions(state, seat));
        if (chosen) break;
      }
      if (!chosen) {
        return {
          outcome: "draw",
          rounds: state.combat?.round ?? 0,
          steps,
          note: `no legal action at step ${steps} (round ${state.combat?.round}, choice ${state.pendingChoice?.type ?? "none"})`
        };
      }
      const result = applyAction(state, chosen);
      if (result.errors.length > 0) {
        return {
          outcome: "error",
          rounds: state.combat?.round ?? 0,
          steps,
          note: `${chosen.type} rejected: ${result.errors.map((e) => e.message).join("; ")}`
        };
      }
      state = result.state;
    }
  } catch (error) {
    return {
      outcome: "error",
      rounds: state.combat?.round ?? 0,
      steps,
      note: `threw: ${(error as Error).message}`
    };
  }
  const combat = state.combat;
  if (!combat) return { outcome: "error", rounds: 0, steps, note: "combat disappeared" };
  if (!combat.outcome) {
    return { outcome: "draw", rounds: combat.round, steps, note: `hit the ${STEP_CAP}-step cap` };
  }
  return {
    outcome: combat.outcome.winnerPlayerId === "p1" ? "attacker" : "defender",
    rounds: combat.round,
    steps
  };
}

// ---------------------------------------------------------------------------
// The tournament
// ---------------------------------------------------------------------------

type Record_ = {
  entry: Entry;
  wins: number;
  losses: number;
  draws: number;
  errors: number;
  rounds: number;
  fights: number;
};

function argValue(flag: string, fallback: string): string {
  const index = process.argv.indexOf(flag);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1]! : fallback;
}

function runTournament(roster: Entry[], side: "few" | "pack", seedCount: number) {
  const seeds = Array.from({ length: seedCount }, (_, index) => `t${index + 1}`);
  const records = new Map<string, Record_>();
  for (const entry of roster) {
    records.set(entry.unitDefId, {
      entry,
      wins: 0,
      losses: 0,
      draws: 0,
      errors: 0,
      rounds: 0,
      fights: 0
    });
  }
  const anomalies: string[] = [];
  const head2head = new Map<string, { wins: number; total: number }>();
  const rows: FightRow[] = [];

  for (let a = 0; a < roster.length; a += 1) {
    for (let b = a + 1; b < roster.length; b += 1) {
      const left = roster[a]!;
      const right = roster[b]!;
      const pairKey = `${left.unitDefId}|${right.unitDefId}`;
      head2head.set(pairKey, { wins: 0, total: 0 });
      for (const seed of seeds) {
        // Both role assignments, so attacker advantage cancels out.
        for (const [attacker, defender] of [
          [left, right],
          [right, left]
        ] as const) {
          const seedKey = `${side}-${seed}-${attacker.unitDefId}-vs-${defender.unitDefId}`;
          const result = runFight(stageDuel(seedKey, attacker, defender, side));
          rows.push({
            side,
            attacker: attacker.unitDefId,
            defender: defender.unitDefId,
            outcome: result.outcome,
            rounds: result.rounds
          });
          const attackerRecord = records.get(attacker.unitDefId)!;
          const defenderRecord = records.get(defender.unitDefId)!;
          attackerRecord.fights += 1;
          defenderRecord.fights += 1;
          attackerRecord.rounds += result.rounds;
          defenderRecord.rounds += result.rounds;
          const h2h = head2head.get(pairKey)!;
          h2h.total += 1;
          if (result.outcome === "attacker") {
            attackerRecord.wins += 1;
            defenderRecord.losses += 1;
            if (attacker.unitDefId === left.unitDefId) h2h.wins += 1;
          } else if (result.outcome === "defender") {
            defenderRecord.wins += 1;
            attackerRecord.losses += 1;
            if (defender.unitDefId === left.unitDefId) h2h.wins += 1;
          } else if (result.outcome === "draw") {
            attackerRecord.draws += 1;
            defenderRecord.draws += 1;
            anomalies.push(
              `DRAW  ${side}  ${attacker.name} (att) vs ${defender.name} — ${result.note ?? ""} [${seedKey}]`
            );
          } else {
            attackerRecord.errors += 1;
            defenderRecord.errors += 1;
            anomalies.push(
              `ERROR ${side}  ${attacker.name} (att) vs ${defender.name} — ${result.note ?? ""} [${seedKey}]`
            );
          }
        }
      }
    }
  }
  return { records: [...records.values()], anomalies, head2head, seeds, rows };
}

type ChallengerRecord = {
  entry: Entry;
  perField: Map<string, { wins: number; losses: number; draws: number; errors: number; fights: number }>;
  sweeps: string[];
  swept: string[];
};

function runChallengerTournament(
  challengers: Entry[],
  fields: { label: string; roster: Entry[] }[],
  side: "few" | "pack",
  seedCount: number
) {
  const seeds = Array.from({ length: seedCount }, (_, index) => `t${index + 1}`);
  const records = new Map<string, ChallengerRecord>();
  for (const entry of challengers) {
    records.set(entry.unitDefId, { entry, perField: new Map(), sweeps: [], swept: [] });
  }
  const anomalies: string[] = [];

  for (const challenger of challengers) {
    const record = records.get(challenger.unitDefId)!;
    for (const field of fields) {
      const bucket = { wins: 0, losses: 0, draws: 0, errors: 0, fights: 0 };
      record.perField.set(field.label, bucket);
      for (const opponent of field.roster) {
        let pairWins = 0;
        let pairTotal = 0;
        for (const seed of seeds) {
          for (const [attacker, defender] of [
            [challenger, opponent],
            [opponent, challenger]
          ] as const) {
            const seedKey = `${side}-${seed}-${attacker.unitDefId}-vs-${defender.unitDefId}`;
            const result = runFight(stageDuel(seedKey, attacker, defender, side));
            bucket.fights += 1;
            pairTotal += 1;
            const challengerIsAttacker = attacker.unitDefId === challenger.unitDefId;
            if (result.outcome === "attacker" || result.outcome === "defender") {
              const challengerWon =
                (result.outcome === "attacker") === challengerIsAttacker;
              if (challengerWon) {
                bucket.wins += 1;
                pairWins += 1;
              } else {
                bucket.losses += 1;
              }
            } else if (result.outcome === "draw") {
              bucket.draws += 1;
              anomalies.push(
                `DRAW  ${side}  ${attacker.name} (att) vs ${defender.name} — ${result.note ?? ""}`
              );
            } else {
              bucket.errors += 1;
              anomalies.push(
                `ERROR ${side}  ${attacker.name} (att) vs ${defender.name} — ${result.note ?? ""}`
              );
            }
          }
        }
        if (pairTotal > 0 && pairWins === pairTotal) {
          record.sweeps.push(`${opponent.name} (${opponent.faction} ${field.label})`);
        } else if (pairTotal > 0 && pairWins === 0) {
          record.swept.push(`${opponent.name} (${opponent.faction} ${field.label})`);
        }
      }
    }
  }
  return { records: [...records.values()], anomalies };
}

function printChallengerTable(
  side: string,
  records: ChallengerRecord[],
  fieldLabels: string[]
): void {
  const rate = (r: ChallengerRecord) => {
    let w = 0;
    let f = 0;
    for (const bucket of r.perField.values()) {
      w += bucket.wins;
      f += bucket.fights;
    }
    return f === 0 ? 0 : w / f;
  };
  const sorted = [...records].sort((l, r) => rate(r) - rate(l));
  console.log(`\n=== CHALLENGER TABLE — ${side.toUpperCase()} side ===`);
  console.log(
    `rank  unit                  tier    type     overall   ${fieldLabels.map((l) => l.padEnd(20)).join("")}`
  );
  sorted.forEach((record, index) => {
    const cells = fieldLabels.map((label) => {
      const bucket = record.perField.get(label);
      if (!bucket) return "-".padEnd(20);
      const pct = ((bucket.wins / Math.max(1, bucket.fights)) * 100).toFixed(1);
      return `${pct}% (${bucket.wins}-${bucket.losses}-${bucket.draws})`.padEnd(20);
    });
    console.log(
      `${String(index + 1).padStart(4)}  ${record.entry.name.padEnd(21)} ${record.entry.tier.padEnd(7)} ${record.entry.type.padEnd(8)} ${`${(rate(record) * 100).toFixed(1)}%`.padStart(7)}   ${cells.join("")}`
    );
  });
  console.log("\n--- clean pairing results (all seeds, both roles, this side) ---");
  for (const record of sorted) {
    if (record.sweeps.length) {
      console.log(`  ${record.entry.name} SWEEPS: ${record.sweeps.join(", ")}`);
    }
    if (record.swept.length) {
      console.log(`  ${record.entry.name} SWEPT BY: ${record.swept.join(", ")}`);
    }
  }
}

function printTable(side: string, records: Record_[]): void {
  const sorted = [...records].sort((left, right) => {
    const lr = left.wins / Math.max(1, left.fights);
    const rr = right.wins / Math.max(1, right.fights);
    return rr - lr || right.wins - left.wins;
  });
  console.log(`\n=== RANKED TABLE — ${side.toUpperCase()} side ===`);
  console.log(
    "rank  unit                     faction          W-L-D   fights  win%    avgRounds"
  );
  sorted.forEach((record, index) => {
    const rate = ((record.wins / Math.max(1, record.fights)) * 100).toFixed(1);
    const avg = (record.rounds / Math.max(1, record.fights)).toFixed(2);
    console.log(
      `${String(index + 1).padStart(4)}  ${record.entry.name.padEnd(24)} ${record.entry.faction.padEnd(16)} ${`${record.wins}-${record.losses}-${record.draws}`.padEnd(8)}${String(record.fights).padEnd(8)}${rate.padStart(5)}%  ${avg.padStart(6)}`
    );
  });
}

function main(): void {
  const sideArg = argValue("--side", "both");
  const seedCount = Number(argValue("--seeds", "6"));
  const level = Number(argValue("--level", "1"));
  const apart = !process.argv.includes("--no-start-apart");
  ATTACKER_CELL = apart ? APART_ATTACKER_CELL : CLOSE_ATTACKER_CELL;
  DEFENDER_CELL = apart ? APART_DEFENDER_CELL : CLOSE_DEFENDER_CELL;
  SHOOTERS_HOLD = process.argv.includes("--shooters-hold");
  const onlyArg = argValue("--only", "");
  const only = onlyArg ? new Set(onlyArg.split(",")) : null;

  const challengersArg = argValue("--challengers", "");
  if (challengersArg) {
    const challengers = challengersArg.split(",").map((id) => unitEntry(id.trim()));
    const levels = argValue("--field-levels", "4,5")
      .split(",")
      .map((n) => Number(n.trim()));
    const exclude = new Set(
      argValue("--field-exclude", challengers[0]!.faction).split(",").filter(Boolean)
    );
    const fields = levels.map((level) => ({
      label: `L${level}`,
      roster: fieldRoster([level], exclude)
    }));
    const sidesC: ("few" | "pack")[] =
      sideArg === "both" ? ["few", "pack"] : [sideArg as "few" | "pack"];
    console.log(
      `CHALLENGER-vs-FIELD — ${challengers.length} challengers vs ${fields
        .map((f) => `${f.label} (${f.roster.length})`)
        .join(" + ")}, ${seedCount} seeds, both roles, sides: ${sidesC.join("+")}`
    );
    console.log(
      `staging: attacker cell ${ATTACKER_CELL}, defender cell ${DEFENDER_CELL}; shooters-hold=${SHOOTERS_HOLD}; excluded from field: ${[...exclude].join(",")}`
    );
    for (const c of challengers)
      console.log(`  challenger  ${c.tier.padEnd(7)} ${c.type.padEnd(8)} ${c.unitDefId} — ${c.name}`);
    for (const side of sidesC) {
      const started = Date.now();
      const { records, anomalies } = runChallengerTournament(challengers, fields, side, seedCount);
      printChallengerTable(side, records, fields.map((f) => f.label));
      const total = records.reduce(
        (sum, r) => sum + [...r.perField.values()].reduce((s, b) => s + b.fights, 0),
        0
      );
      console.log(`(${total} fights, ${((Date.now() - started) / 1000).toFixed(1)}s)`);
      console.log(`\n--- ${side} anomalies (draws / step-cap / errors): ${anomalies.length} ---`);
      const seen = new Map<string, number>();
      for (const line of anomalies) seen.set(line, (seen.get(line) ?? 0) + 1);
      for (const [line, count] of [...seen].sort((l, r) => r[1] - l[1]).slice(0, 40))
        console.log(`  x${count}  ${line}`);
      if (seen.size > 40) console.log(`  … ${seen.size - 40} more distinct`);
    }
    return;
  }
  let roster = levelRoster(level);
  if (only) roster = roster.filter((entry) => only.has(entry.faction));
  const sides: ("few" | "pack")[] =
    sideArg === "both" ? ["few", "pack"] : [sideArg as "few" | "pack"];

  console.log(`LEVEL-${level} UNIT TOURNAMENT — ${roster.length} units, ${seedCount} seeds/pairing, both roles`);
  console.log(
    `staging: attacker cell ${ATTACKER_CELL}, defender cell ${DEFENDER_CELL} (${apart ? "OPPOSITE BACKLINES, 4 rows apart" : "legacy near-contact"})`
  );
  console.log(`roster (unit #${level} of each town faction, in units.ts roster order):`);
  for (const entry of roster)
    console.log(
      `  ${entry.faction.padEnd(16)} ${entry.tier.padEnd(7)} ${entry.type.padEnd(7)} ${entry.unitDefId} — ${entry.name}`
    );

  const jsonPath = argValue("--json", "");
  const allRows: FightRow[] = [];

  for (const side of sides) {
    const started = Date.now();
    const { records, anomalies, head2head, rows } = runTournament(roster, side, seedCount);
    allRows.push(...rows);
    printTable(side, records);
    const fights = records.reduce((sum, record) => sum + record.fights, 0) / 2;
    console.log(`(${fights} fights, ${((Date.now() - started) / 1000).toFixed(1)}s)`);

    // Head-to-head extremes.
    const sweeps: string[] = [];
    for (const [key, value] of head2head) {
      const [leftId, rightId] = key.split("|");
      const leftName = roster.find((entry) => entry.unitDefId === leftId)!.name;
      const rightName = roster.find((entry) => entry.unitDefId === rightId)!.name;
      if (value.total > 0 && value.wins === value.total) {
        sweeps.push(`  ${leftName} sweeps ${rightName} ${value.wins}/${value.total}`);
      } else if (value.total > 0 && value.wins === 0) {
        sweeps.push(`  ${rightName} sweeps ${leftName} ${value.total}/${value.total}`);
      }
    }
    const undefeated = records.filter((r) => r.losses === 0 && r.fights > 0);
    const winless = records.filter((r) => r.wins === 0 && r.fights > 0);
    console.log(`\n--- ${side} notes ---`);
    console.log(`undefeated: ${undefeated.map((r) => r.entry.name).join(", ") || "none"}`);
    console.log(`winless:    ${winless.map((r) => r.entry.name).join(", ") || "none"}`);
    console.log(`clean pairing sweeps: ${sweeps.length} of ${head2head.size} pairings`);
    for (const line of sweeps.slice(0, 40)) console.log(line);
    if (sweeps.length > 40) console.log(`  … ${sweeps.length - 40} more`);

    console.log(`\n--- ${side} anomalies (draws / step-cap / errors): ${anomalies.length} ---`);
    const seenNote = new Map<string, number>();
    for (const line of anomalies) {
      const short = line.replace(/\[.*\]$/, "").trim();
      seenNote.set(short, (seenNote.get(short) ?? 0) + 1);
    }
    for (const [line, count] of [...seenNote].sort((l, r) => r[1] - l[1]).slice(0, 60)) {
      console.log(`  x${count}  ${line}`);
    }
    if (seenNote.size > 60) console.log(`  … ${seenNote.size - 60} more distinct`);
  }

  if (jsonPath) {
    writeFileSync(jsonPath, JSON.stringify({ level, apart, seedCount, roster, rows: allRows }, null, 0));
    console.log(`\nwrote ${allRows.length} fight rows to ${jsonPath}`);
  }
}

main();
