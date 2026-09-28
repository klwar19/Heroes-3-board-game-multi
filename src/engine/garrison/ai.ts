/**
 * Garrison Wars computer opponents (versus vs. the computer). Each AI reads
 * the shared simulation state and returns commands for its own side; the
 * simulation validates them exactly like a human's. Heuristic, not searching:
 * cheap enough to run every few ticks in the browser.
 */

import { CARDS, DEFENDERS, ENEMIES, GW_TPS, sec, type CardId, type DefDef, type EnemyKind } from "./content";
import {
  checkCast, checkMuster, checkPlace, defenderAt, isStructure, isWall, tentAt,
  type Defender, type Enemy, type GarrisonState, type SidedCommand
} from "./sim";

export type GarrisonAi = (s: GarrisonState) => SidedCommand[];

function makeRng(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Rough damage per second a defender puts into its lane. */
function defenderDps(def: DefDef): number {
  let dps = 0;
  if (def.shot) dps += (def.shot.dmg * (1 + (def.shot.volley ?? 0)) * GW_TPS) / def.shot.every + (def.shot.splash ?? 0) / 3;
  if (def.melee) dps += (def.melee.dmg * GW_TPS) / def.melee.every * 0.6;
  if (def.lightning) dps += (def.lightning.dmg * GW_TPS) / def.lightning.every;
  if (def.gaze) dps += 25;
  if (def.stoneShot) dps += 15;
  if (def.ignite) dps += 12;
  return dps;
}

function laneFirepower(s: GarrisonState, lane: number): number {
  let total = 0;
  for (const d of s.defenders) {
    const def = DEFENDERS[d.kind]!;
    if (d.lane === lane) total += defenderDps(def);
    else if (def.shot?.lanes === 3 && Math.abs(d.lane - lane) === 1) total += defenderDps(def) / 3;
  }
  return total;
}

function laneThreat(s: GarrisonState, lane: number): { weight: number; nearest: number } {
  let weight = 0;
  let nearest = 99;
  for (const e of s.enemies) {
    if (e.lane !== lane || isStructure(e)) continue;
    weight += (Math.max(0, e.hp) + e.shield + e.armor) * (1 + (9 - Math.min(9, Math.max(0, e.x))) / 6);
    nearest = Math.min(nearest, e.x);
  }
  return { weight, nearest };
}

// ---------------------------------------------------------------------------
// Defender AI

export function createDefenderAi(seed: number): GarrisonAi {
  const rng = makeRng(seed ^ 0x51ed);
  let thinkAt = 0;
  return (s) => {
    const out: SidedCommand[] = [];
    for (const p of s.pickups) if (s.tick >= p.landAt) out.push({ t: "collect", id: p.id, by: "def" });
    if (s.tick < thinkAt || s.outcome) return out;
    thinkAt = s.tick + 6 + Math.floor(rng() * 6);
    const action = defenderDecision(s, rng);
    if (action) out.push(action);
    return out;
  };
}

function readyCards(s: GarrisonState): CardId[] {
  return s.def.cards.filter((c) => c.readyAt <= s.tick && CARDS[c.id]!.cost <= s.def.gold).map((c) => c.id);
}

function tryPlace(s: GarrisonState, card: CardId, lane: number, col: number): SidedCommand | null {
  const check = checkPlace(s, card, lane, col);
  return check.ok ? { t: "place", card, lane, col, by: "def" } : null;
}

function clusterAt(s: GarrisonState, lane: number, x: number, reach = 1.5): number {
  let hp = 0;
  for (const e of s.enemies) {
    // Underground foes (Earth Elementals, Gravediggers) are out of a blast's reach.
    if (isStructure(e) || e.x > 8.8 || e.state === "burrow" || Math.abs(e.lane - lane) > 1 || Math.abs(e.x - x) > reach) continue;
    hp += Math.max(0, e.hp) + e.shield + e.armor;
  }
  return hp;
}

function bestCluster(s: GarrisonState): { lane: number; col: number; hp: number } | null {
  let best: { lane: number; col: number; hp: number } | null = null;
  for (const lane of s.cfg.lanes) {
    for (let col = 0; col < 9; col += 1) {
      const hp = clusterAt(s, lane, col + 0.5);
      if (!best || hp > best.hp) best = { lane, col, hp };
    }
  }
  return best;
}

function defenderDecision(s: GarrisonState, rng: () => number): SidedCommand | null {
  const ready = readyCards(s);
  const [minCol, maxCol] = s.cfg.defCols;
  const lanes = s.cfg.lanes;
  const seconds = s.tick / GW_TPS;

  // 1. Emergencies close to the gate.
  const danger = s.enemies.filter((e) => !isStructure(e) && e.x < 2.2).sort((a, b) => a.x - b.x)[0];
  if (danger) {
    if (danger.hp <= 160 && checkCast(s, "def", "magic-arrow", danger.lane, danger.x).ok) {
      return { t: "cast", side: "def", spell: "magic-arrow", lane: danger.lane, x: danger.x, by: "def" };
    }
    if (ready.includes("fireball") && clusterAt(s, danger.lane, danger.x) >= 500) {
      const cmd = tryPlace(s, "fireball", danger.lane, Math.max(0, Math.min(8, Math.floor(danger.x))));
      if (cmd) return cmd;
    }
  }

  // 2. Big clusters: fireball, fire wall, frost ring, meteor.
  const cluster = bestCluster(s);
  if (cluster && cluster.hp >= 1600 && ready.includes("fireball")) {
    const cmd = tryPlace(s, "fireball", cluster.lane, cluster.col);
    if (cmd) return cmd;
  }
  if (ready.includes("fire-wall")) {
    const lane = lanes.map((l) => ({ l, t: laneThreat(s, l).weight })).sort((a, b) => b.t - a.t)[0];
    if (lane && lane.t >= 4000) {
      const cmd = tryPlace(s, "fire-wall", lane.l, 4);
      if (cmd) return cmd;
    }
  }
  if (cluster && cluster.hp >= 900) {
    for (const spell of ["meteor-shower", "frost-ring"] as const) {
      if (checkCast(s, "def", spell, cluster.lane, cluster.col + 0.5).ok) {
        return { t: "cast", side: "def", spell, lane: cluster.lane, x: cluster.col + 0.5, by: "def" };
      }
    }
  }
  if (s.enemies.filter((e) => !isStructure(e)).length >= 8 && checkCast(s, "def", "haste", 0, 0).ok) {
    return { t: "cast", side: "def", spell: "haste", lane: 0, x: 0, by: "def" };
  }

  // 3. An attacker walking down a lane with no firepower at all: answer it
  // before spending on the economy.
  const exposed = lanes.find((lane) => {
    const threat = laneThreat(s, lane);
    return threat.weight > 0 && threat.nearest < 7.5 && laneFirepower(s, lane) < 5;
  });
  if (exposed !== undefined) {
    const answers = ready
      .filter((id) => {
        const kind = CARDS[id]!.places;
        const def = kind ? DEFENDERS[kind] : undefined;
        return def && !def.produce && (def.shot || def.lightning || def.melee || def.gaze);
      })
      .sort((a, b) => CARDS[a]!.cost - CARDS[b]!.cost);
    for (const card of answers) {
      for (const col of [minCol + 1, minCol + 2, minCol, minCol + 3]) {
        if (col > maxCol) continue;
        const cmd = tryPlace(s, card, exposed, col);
        if (cmd) return cmd;
      }
    }
  }

  // 4. Economy.
  const econCards = ready.filter((id) => CARDS[id]!.places && DEFENDERS[CARDS[id]!.places!]?.produce);
  const econCount = s.defenders.filter((d) => DEFENDERS[d.kind]!.produce).length;
  const econTarget = seconds < 90 ? lanes.length : lanes.length + 2;
  if (econCards.length > 0 && econCount < econTarget) {
    const pressure = Math.max(...lanes.map((l) => laneThreat(s, l).weight));
    if (pressure < 3000 || econCount < 3) {
      for (const col of [minCol, minCol + 1]) {
        const lane = lanes.filter((l) => !defenderAt(s, l, col)).sort((a, b) => laneThreat(s, a).weight - laneThreat(s, b).weight)[0];
        if (lane === undefined) continue;
        const cmd = tryPlace(s, econCards[0]!, lane, col);
        if (cmd) return cmd;
      }
    }
  }

  // 4. Mines ahead of a lone attacker.
  if (ready.includes("land-mine")) {
    const walker = s.enemies.find((e) => !isStructure(e) && e.x > 4 && e.x < 8.5 && e.dir < 0);
    if (walker) {
      const col = Math.min(maxCol, Math.floor(walker.x) - 2);
      if (col > minCol + 1) {
        const cmd = tryPlace(s, "land-mine", walker.lane, col);
        if (cmd) return cmd;
      }
    }
  }

  // 5. Shore up the weakest lane.
  const ranked = lanes
    .map((lane) => {
      const threat = laneThreat(s, lane);
      const fire = laneFirepower(s, lane);
      return { lane, need: threat.weight / 60 - fire + (fire < 12 ? 30 : 0) + (threat.nearest < 4 ? 40 : 0), threat, fire };
    })
    .sort((a, b) => b.need - a.need);
  const shooters = ready.filter((id) => {
    const kind = CARDS[id]!.places;
    const def = kind ? DEFENDERS[kind] : undefined;
    return def && (def.shot || def.lightning || def.slowCast) && !def.produce;
  }).sort((a, b) => CARDS[b]!.cost - CARDS[a]!.cost);
  const blockers = ready.filter((id) => {
    const kind = CARDS[id]!.places;
    const def = kind ? DEFENDERS[kind] : undefined;
    return def && !def.shot && !def.produce && kind !== "mine" && (isWall(def) || def.melee || def.gaze);
  }).sort((a, b) => CARDS[b]!.cost - CARDS[a]!.cost);
  for (const row of ranked) {
    if (row.need <= 0 && seconds > 30) break;
    const frontGap = row.threat.nearest;
    const hasBlocker = s.defenders.some((d) => d.lane === row.lane && d.col >= minCol + 2 && !DEFENDERS[d.kind]!.shot);
    if (blockers.length > 0 && !hasBlocker && row.threat.weight > 1500) {
      for (let col = Math.min(maxCol, Math.max(minCol + 3, Math.floor(frontGap) - 2)); col >= minCol + 2; col -= 1) {
        const cmd = tryPlace(s, blockers[0]!, row.lane, col);
        if (cmd) return cmd;
      }
    }
    for (const card of shooters) {
      const def = DEFENDERS[CARDS[card]!.places!]!;
      const shortRange = def.shot && def.shot.range < 9;
      const cols = shortRange ? [minCol + 3, minCol + 2, minCol + 4] : [minCol + 1, minCol + 2, minCol + 3];
      for (const col of cols) {
        if (col > maxCol) continue;
        const cmd = tryPlace(s, card, row.lane, col);
        if (cmd) return cmd;
      }
    }
  }

  // 6. Upgrades with spare gold.
  if (s.def.gold >= 250) {
    const upgradable = s.defenders
      .filter((d) => DEFENDERS[d.kind]!.upgrade && DEFENDERS[d.kind]!.upgrade!.cost <= s.def.gold - 100)
      .sort((a, b) => defenderDps(DEFENDERS[b.kind]!) - defenderDps(DEFENDERS[a.kind]!));
    const target = upgradable[Math.floor(rng() * Math.min(2, upgradable.length))];
    if (target) return { t: "upgrade", id: target.id, by: "def" };
  }

  // 7. Stone skin on a battered front-liner.
  if (ready.includes("stone-skin")) {
    const hurt = s.defenders.filter((d: Defender) => d.shell === 0 && d.kind !== "mine" && d.hp < d.maxHp * 0.6 && d.maxHp >= 1000)[0];
    if (hurt) {
      const cmd = tryPlace(s, "stone-skin", hurt.lane, hurt.col);
      if (cmd) return cmd;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Attacker AI

export function createAttackerAi(seed: number): GarrisonAi {
  const rng = makeRng(seed ^ 0x2a7c);
  let thinkAt = sec(3);
  let saveUntil = 0;
  return (s) => {
    if (s.tick < thinkAt || s.outcome) return [];
    thinkAt = s.tick + 8 + Math.floor(rng() * 8);
    const cmd = attackerDecision(s, rng, () => saveUntil, (t) => { saveUntil = t; });
    return cmd ? [cmd] : [];
  };
}

function laneDefense(s: GarrisonState, lane: number): { fire: number; walls: number; pikes: boolean; tallFront: boolean; frontCol: number } {
  let walls = 0;
  let pikes = false;
  let frontCol = -1;
  let tallFront = false;
  for (const d of s.defenders) {
    if (d.lane !== lane || d.kind === "mine") continue;
    const def = DEFENDERS[d.kind]!;
    if (isWall(def) || (def.melee && d.maxHp >= 1500)) walls += d.hp + d.shell;
    if (def.melee?.antiCavalry) pikes = true;
    if (d.col > frontCol) {
      frontCol = d.col;
      tallFront = def.tall === true;
    }
  }
  return { fire: laneFirepower(s, lane), walls, pikes, tallFront, frontCol };
}

function unitScore(kind: EnemyKind, lane: ReturnType<typeof laneDefense>): number {
  const def = ENEMIES[kind]!;
  let score = (def.hp + (def.shield ?? 0) + (def.armor ?? 0)) / def.might;
  if (def.vault && !lane.tallFront && lane.frontCol >= 0) score *= 1.5;
  if ((def.burrow || def.dig) && lane.frontCol >= 0) score *= 1.5;
  if (def.teleport && lane.fire > 20) score *= 1.4;
  if (def.ranged && lane.walls > 3000) score *= def.ranged.skipWalls ? 1.8 : 1.3;
  if (def.smash && lane.walls > 3000) score *= 1.7;
  if (def.shield && lane.fire > 25) score *= 1.4;
  if (def.cavalry && lane.pikes) score *= 0.5;
  if (lane.fire < 10 && def.cost <= 2) score *= 1.4;
  return score;
}

function attackerDecision(
  s: GarrisonState,
  rng: () => number,
  saving: () => number,
  setSaving: (tick: number) => void
): SidedCommand | null {
  const lanes = s.cfg.lanes;
  const seconds = s.tick / GW_TPS;

  // Spells.
  const marching = s.enemies.filter((e) => !isStructure(e) && e.side === "atk");
  if (s.atk.mana >= 20 && s.defenders.length >= 6 && checkCast(s, "atk", "earthquake", 0, 0).ok) {
    return { t: "cast", side: "atk", spell: "earthquake", lane: 0, x: 0, by: "atk" };
  }
  if (marching.length >= 5 && checkCast(s, "atk", "war-cry", 0, 0).ok && rng() < 0.5) {
    return { t: "cast", side: "atk", spell: "war-cry", lane: 0, x: 0, by: "atk" };
  }
  if (s.atk.fallen.length >= 3 && checkCast(s, "atk", "resurrection", 0, 0).ok) {
    return { t: "cast", side: "atk", spell: "resurrection", lane: 0, x: 0, by: "atk" };
  }

  // Supply tents early, in the quietest lanes.
  const tents = s.enemies.filter((e: Enemy) => e.kind === "tent").length;
  const tentTarget = Math.min(4, 2 + Math.floor(seconds / 90));
  if (tents < tentTarget) {
    const byFire = [...lanes].sort((a, b) => laneFirepower(s, a) - laneFirepower(s, b));
    for (const lane of byFire) {
      for (const col of [8, 7]) {
        if (tentAt(s, lane, col)) continue;
        if (checkMuster(s, "tent", lane, col).ok) return { t: "tent", lane, col, by: "atk" };
      }
    }
  }

  if (s.tick < saving()) return null;
  const cards = s.atk.cards.filter((c) => c.id !== "tent" && c.readyAt <= s.tick).map((c) => c.id);
  if (cards.length === 0) return null;
  const affordable = cards.filter((id) => ENEMIES[id]!.might <= s.atk.might);
  const priciest = Math.max(...cards.map((id) => ENEMIES[id]!.might));
  if (seconds > 60 && s.atk.might < priciest && rng() < 0.2) {
    setSaving(s.tick + sec(8));
    return null;
  }
  if (affordable.length === 0) return null;

  // Push where the defence is thinnest, and keep feeding a push that is working.
  const pressure = (lane: number) => marching.filter((e) => e.lane === lane).reduce((sum, e) => sum + e.hp, 0);
  const ranked = lanes
    .map((lane) => {
      const d = laneDefense(s, lane);
      return { lane, d, score: d.fire * 30 + d.walls / 4 - pressure(lane) * 0.5 + rng() * 300 };
    })
    .sort((a, b) => a.score - b.score);
  const pick = ranked[0]!;
  const best = affordable
    .map((kind) => ({ kind, score: unitScore(kind, pick.d) * (0.85 + rng() * 0.3) }))
    .sort((a, b) => b.score - a.score)[0]!;
  return { t: "muster", kind: best.kind, lane: pick.lane, by: "atk" };
}