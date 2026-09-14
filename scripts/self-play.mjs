/**
 * Offline computer self-play lab. Never runs from a build, a deploy or a live
 * table; every game is a headless engine run on this machine.
 *
 *   node scripts/self-play.mjs play  --games 20 --batch night1 [--explore 0.15] [--workers 4] [--pairing mirror|mixed]
 *   node scripts/self-play.mjs train --batch night1[,night2] [--min-matches 6] [--output ...]
 *   node scripts/self-play.mjs eval  --games 10 --batch eval1 [--candidate all --baseline ranked]
 *   node scripts/self-play.mjs report --batch night1
 *
 * play   : AI vs AI games under bounded exploration; writes sanitized replays
 *          (same format as ranked captures) plus a per-game record.
 * train  : outcome-labelled decisions of the computer seats → bounded model
 *          (src/engine/computer/self-play-policy.json). Review + commit it.
 * eval   : mirrored-seat A/B — candidate model selection vs baseline on the
 *          same seeds with seats swapped, so a seat/faction edge cancels out.
 *          A round-capped game is decided by the development race: first Gold
 *          pack, then Gold bodies, PvP and neutral fight results (no VP rule).
 * report : what the records say (win rates, gold timing, fights, stalls).
 */
import { register } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { gzipSync, gunzipSync } from "node:zlib";
import { fileURLToPath, pathToFileURL } from "node:url";

register("./lib/ts-resolver.mjs", import.meta.url);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = (relative) => pathToFileURL(path.join(ROOT, "src", relative)).href;

const CLASSIC_FACTIONS = ["castle", "rampart", "tower", "inferno", "necropolis", "dungeon", "stronghold", "fortress", "conflux"];

/** Rule-variant presets a batch cycles through (learned keys carry them). */
const VARIANTS = {
  default: {},
  xp: { unitExperience: true },
  commanders: { unitExperience: true, wog: { enabled: true, commanders: true } },
  guards: { manualGuardControl: true },
};

// ---------------------------------------------------------------- CLI ----
const argv = process.argv.slice(2);
const command = argv[0];
function flag(name, fallback) {
  const index = argv.indexOf(`--${name}`);
  return index === -1 ? fallback : argv[index + 1];
}
function has(name) { return argv.includes(`--${name}`); }
function num(name, fallback) { return Number(flag(name, fallback)); }

function batchDir(name) {
  return path.join(ROOT, "artifacts", "self-play", name);
}

/** Deterministic small PRNG (mulberry32) so a batch is reproducible from its seeds. */
function rng(seedText) {
  let h = 1779033703 ^ seedText.length;
  for (let i = 0; i < seedText.length; i += 1) {
    h = Math.imul(h ^ seedText.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------- engine I/O ----
let engine;
async function loadEngine() {
  if (engine) return engine;
  const [setup, runner, replay, adventure, factions, soak, reducer, facts, model, policyModule] = await Promise.all([
    import(src("engine/adventure-setup.ts")),
    import(src("server/computer-runner.ts")),
    import(src("server/ranked-replay.ts")),
    import(src("engine/adventure.ts")),
    import(src("data/factions/core.ts")),
    import(src("server/single-player-soak-helpers.ts")),
    import(src("engine/reducer.ts")),
    import(src("engine/computer/replay-context.ts")),
    import(src("engine/computer/replay-model.ts")),
    import(src("engine/computer/policy.ts")),
  ]);
  engine = {
    createAdventureGameState: setup.createAdventureGameState,
    driveComputerPlayers: runner.driveComputerPlayers,
    createRankedReplay: replay.createRankedReplay,
    appendRankedReplayEntry: replay.appendRankedReplayEntry,
    finishRankedReplay: replay.finishRankedReplay,
    getUnitDefinition: adventure.getUnitDefinition,
    factionDefinitions: factions.coreFactionDefinitions,
    pickHumanAction: soak.pickHumanAction,
    applyAction: reducer.applyAction,
    replayDecisionFacts: facts.replayDecisionFacts,
    describeReplayAction: model.describeReplayAction,
    canonicalActionKey: policyModule.canonicalActionKey,
  };
  return engine;
}

/** One job = one game. Seat policies come from the caller (play vs eval). */
function jobsFor({ games, prefix, factions, difficulties, seats, extraOptions, pairing, variants }) {
  const jobs = [];
  for (let index = 0; index < games; index += 1) {
    const seed = `${prefix}-${index + 1}`;
    const random = rng(seed);
    const difficulty = difficulties[index % difficulties.length];
    const variant = variants[index % variants.length];
    if (!(variant in VARIANTS)) throw new Error(`unknown variant ${variant}; known: ${Object.keys(VARIANTS).join(", ")}`);
    const pool = [...factions];
    const first = pool.splice(Math.floor(random() * pool.length), 1)[0];
    // Towns have different flows: a "mirror" pairing (same town, different
    // heroes) keeps the development race a comparison of decisions, not towns.
    const second = pairing === "mixed" && pool.length ? pool[Math.floor(random() * pool.length)] : first;
    jobs.push({ seed, factions: [first, second], heroIndex: Math.floor(random() * 7), difficulty, variant, seats,
      extraOptions: { ...VARIANTS[variant], ...(extraOptions ?? {}) } });
  }
  return jobs;
}

function summarizeSeat(state, playerId, api) {
  const player = state.players[playerId];
  const hero = Object.values(state.heroes ?? {}).find((h) => h.controllerId === playerId && h.kind === "main");
  const fields = Object.values(state.adventure?.fields ?? {});
  const far = fields.filter((f) => f.flagOwnerId === playerId && f.tileInstanceId &&
    state.adventure?.tiles[f.tileInstanceId]?.group === "far" && ["mine", "settlement"].includes(f.location));
  return {
    factionId: player?.factionId,
    heroLevel: hero?.level ?? 0,
    gold: player?.resources?.gold ?? 0,
    goldProduction: player?.production?.gold ?? 0,
    army: (player?.army ?? []).map((u) => `${u.unitDefId}:${u.side}`),
    goldBodies: (player?.army ?? []).filter((u) => api.getUnitDefinition(u.unitDefId)?.tier === "gold").length,
    goldPacks: (player?.army ?? []).filter((u) => u.side === "pack" && api.getUnitDefinition(u.unitDefId)?.tier === "gold").length,
    farCaptures: far.length,
    ownedFields: fields.filter((f) => f.flagOwnerId === playerId).length,
    buildings: Object.values(state.towns ?? {}).filter((t) => t.controllerId === playerId).flatMap((t) => t.buildings).length,
  };
}

async function playGame(job, settings) {
  const api = await loadEngine();
  const definitions = api.factionDefinitions;
  const players = job.factions.map((factionId, index) => {
    const heroes = definitions[factionId]?.heroes ?? [];
    return {
      id: `p${index + 1}`,
      name: `AI ${index + 1}`,
      factionId,
      ...(heroes.length ? { heroDefId: heroes[(job.heroIndex + index) % heroes.length] } : {}),
    };
  });
  const initial = api.createAdventureGameState({
    seed: job.seed,
    difficulty: job.difficulty,
    events: false,
    rollFirstPlayer: false,
    sessionMode: "single-player",
    controllers: Object.fromEntries(players.map((p) => [p.id, { kind: "computer", difficulty: "standard", policyVersion: 1 }])),
    players,
    ...(job.extraOptions ?? {}),
  });
  const seatOptions = {};
  const rolloutOptions = {};
  const lastClose = {};
  for (const player of players) {
    const seat = job.seats[player.id] ?? {};
    const random = rng(`${job.seed}|${player.id}|explore`);
    rolloutOptions[player.id] = { learned: seat.learned ?? "all" };
    seatOptions[player.id] = {
      ...rolloutOptions[player.id],
      ...(seat.explore > 0 ? { explore: { rate: seat.explore, random } } : {}),
      onClose: (close) => { lastClose[player.id] = close; },
    };
  }
  const policy = (playerId) => seatOptions[playerId];
  const rolloutPolicy = (playerId) => rolloutOptions[playerId];
  const cfRandom = rng(`${job.seed}|counterfactual`);
  const counterfactuals = [];
  let counterfactualMs = 0;
  const started = Date.now();
  let now = started;
  let replay = api.createRankedReplay(initial, now, "adventure-start");
  let state = initial;
  let decisions = 0;
  let explored = 0;
  let stalled = null;
  const firstGoldRound = {};
  const firstGoldPackRound = {};
  const firstFarRound = {};
  const fights = { neutral: {}, pvp: {} };
  const seenCombats = new Set();
  const note = () => {
    for (const player of players) {
      const seat = summarizeSeat(state, player.id, api);
      if (firstGoldRound[player.id] == null && seat.goldBodies > 0) firstGoldRound[player.id] = state.round;
      if (firstGoldPackRound[player.id] == null && seat.goldPacks > 0) firstGoldPackRound[player.id] = state.round;
      if (firstFarRound[player.id] == null && seat.farCaptures > 0) firstFarRound[player.id] = state.round;
    }
    const combat = state.combat;
    if (combat?.outcome && !seenCombats.has(combat.id)) {
      seenCombats.add(combat.id);
      const pvp = combat.attackerPlayerId !== "neutrals" && combat.defenderPlayerId !== "neutrals";
      const bucket = pvp ? fights.pvp : fights.neutral;
      for (const id of [combat.attackerPlayerId, combat.defenderPlayerId]) {
        if (!(id in state.players)) continue;
        bucket[id] ??= { won: 0, lost: 0 };
        if (combat.outcome.winnerPlayerId === id) bucket[id].won += 1; else bucket[id].lost += 1;
      }
    }
  };
  for (let step = 0; step < settings.maxSteps; step += 1) {
    if (state.phase === "game-over" && !state.combat) break;
    if (state.round > settings.maxRound) break;
    now += 1000;
    const calls = [];
    const apply = (s, action, playerId) => {
      const result = api.applyAction(s, action, { computerActorPlayerId: playerId });
      calls.push(result);
      return result;
    };
    const before = state;
    for (const player of players) lastClose[player.id] = null;
    const run = api.driveComputerPlayers(before, apply, { maxSteps: 1, policy });
    if (run.decisions.length === 1) {
      const decision = run.decisions[0];
      // Counterfactual fight rollout: at a combat decision with close
      // alternatives, play each alternative to the end of THIS fight with the
      // real engine and label the better/worse one. This is the discriminating
      // evidence a plain win/loss label cannot give when every fight is won.
      const close = lastClose[decision.playerId];
      if (before.combat && !before.combat.outcome && close && close.length > 1 &&
          counterfactuals.length < settings.counterfactualMax && cfRandom() < settings.counterfactual) {
        const t0 = Date.now();
        counterfactuals.push(...counterfactualSamples(api, before, decision, close.slice(0, settings.counterfactualWidth), rolloutPolicy, settings, job.seed, decisions));
        counterfactualMs += Date.now() - t0;
      }
      const accepted = calls.filter((r) => r.errors.length === 0).at(-1);
      replay = api.appendRankedReplayEntry(replay, before, decision.action, { state: run.state, events: accepted?.events ?? [] }, { now });
      state = run.state;
      decisions += 1;
      if (decision.policy.startsWith("explore:") || decision.policy.includes(":explore:")) explored += 1;
    } else if (run.stalled) {
      stalled = run.reason ?? "stalled";
      break;
    } else {
      // Both seats are computers; a non-computer owner is a lobby/system gate.
      const action = api.pickHumanAction(state, state.activePlayerId ?? "p1");
      if (!action) { stalled = `no decision owner in ${state.phase} R${state.round}`; break; }
      const result = api.applyAction(state, action);
      if (result.errors.length) { stalled = `fallback action rejected: ${result.errors.join("; ")}`; break; }
      replay = api.appendRankedReplayEntry(replay, state, action, result, { now });
      state = result.state;
    }
    note();
  }
  const winner = state.adventure?.winnerPlayerId ?? null;
  const seatsSummary = Object.fromEntries(players.map((p) => [p.id, {
    ...summarizeSeat(state, p.id, api),
    firstGoldRound: firstGoldRound[p.id] ?? null,
    firstGoldPackRound: firstGoldPackRound[p.id] ?? null,
    firstFarRound: firstFarRound[p.id] ?? null,
    neutralFights: fights.neutral[p.id] ?? { won: 0, lost: 0 },
    pvpFights: fights.pvp[p.id] ?? { won: 0, lost: 0 },
  }]));
  const race = winner ? null : developmentRaceWinner(seatsSummary);
  // The engine winner is the match label. A round-capped game is labelled by
  // the development race (first Gold pack, then fights) — the user's chosen
  // criterion, recorded as such on the replay so a trainer can tell it apart.
  replay = api.finishRankedReplay(replay, now, winner ?? race?.winner ?? undefined);
  if (!winner && race) replay = { ...replay, winnerBasis: `development-race:${race.reason}` };
  const record = {
    seed: job.seed,
    difficulty: job.difficulty,
    variant: job.variant ?? "default",
    heroes: Object.fromEntries(players.map((p) => [p.id, p.heroDefId ?? null])),
    seats: job.seats,
    winner,
    winReason: winner ? (state.eventLog ?? []).findLast?.((e) => e.type === "GAME_WON")?.reason ?? null : null,
    developmentWinner: race?.winner ?? null,
    developmentReason: race?.reason ?? null,
    rounds: state.round,
    phase: state.phase,
    stalled,
    decisions,
    explored,
    replayEntries: replay.entries.length,
    counterfactuals: counterfactuals.length,
    counterfactualMs,
    replayTruncated: replay.truncated,
    ms: Date.now() - started,
    players: seatsSummary,
  };
  return { record, replay, counterfactuals };
}

/** Own-minus-enemy remaining health fraction, plus ±1 for a decided fight. */
function fightScore(startCombat, endState, playerId) {
  const combat = endState.combat;
  const ids = Object.values(startCombat.units).filter((u) => u.position >= 0 && u.damage < u.maxHealth);
  const fraction = (mine) => {
    const group = ids.filter((u) => (u.controllerId === playerId) === mine);
    const total = group.reduce((sum, u) => sum + u.maxHealth, 0);
    if (!total) return 0;
    const left = group.reduce((sum, u) => {
      const end = combat?.units[u.id];
      return sum + (end && end.position >= 0 ? Math.max(0, end.maxHealth - end.damage) : 0);
    }, 0);
    return left / total;
  };
  const decided = combat?.outcome ? (combat.outcome.winnerPlayerId === playerId ? 1 : -1) : 0;
  return fraction(true) - fraction(false) + decided;
}

/** Apply one alternative, then let the deterministic policy finish the fight. */
function rolloutFight(api, start, playerId, action, policy, maxSteps, entropy) {
  const combatId = start.combat.id;
  // A distinct entropy stream per sample: dice differ between samples, so a
  // label needs the alternative to hold up across rolls, not on one lucky die.
  let rolls = 0;
  const apply = (s, a, p) => api.applyAction(s, a, {
    computerActorPlayerId: p,
    ...(entropy ? { entropy: `${entropy}|${rolls++}` } : {}),
  });
  const opened = apply(start, action, playerId);
  if (opened.errors.length) return null;
  let state = opened.state;
  let last = state;
  for (let step = 0; step < maxSteps; step += 1) {
    if (!state.combat || state.combat.id !== combatId) break;
    last = state;
    if (state.combat.outcome) break;
    const run = api.driveComputerPlayers(state, apply, { maxSteps: 1, policy });
    if (run.decisions.length === 1) { state = run.state; continue; }
    if (run.stalled) return null;
    const fallback = api.pickHumanAction(state, state.activePlayerId ?? "p1");
    if (!fallback) return null;
    const result = api.applyAction(state, fallback);
    if (result.errors.length) return null;
    state = result.state;
  }
  if (!last.combat || last.combat.id !== combatId) return null;
  return fightScore(start.combat, last, playerId);
}

/** Mean fight score over `samples` entropy streams; null if any rollout failed. */
function rolloutFightMean(api, start, playerId, action, policy, settings, seed, sequence, index) {
  const scores = [];
  for (let k = 0; k < settings.counterfactualSamples; k += 1) {
    const entropy = settings.counterfactualSamples > 1 ? `${seed}|cf${sequence}|alt${index}|k${k}` : undefined;
    const score = rolloutFight(api, start, playerId, action, policy, settings.rolloutSteps, entropy);
    if (score === null) return null;
    scores.push(score);
  }
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

function counterfactualSamples(api, before, decision, close, policy, settings, seed, sequence) {
  const playerId = decision.playerId;
  const scored = close.map((action, index) => ({ action, score: rolloutFightMean(api, before, playerId, action, policy, settings, seed, sequence, index) }))
    .filter((row) => row.score !== null);
  if (scored.length < 2) return [];
  const best = Math.max(...scored.map((row) => row.score));
  const worst = Math.min(...scored.map((row) => row.score));
  if (best - worst < settings.counterfactualMargin) return [];
  const fight = before.combat;
  const neutral = fight.attackerPlayerId === "neutrals" || fight.defenderPlayerId === "neutrals";
  const living = Object.values(fight.units).filter((u) => u.position >= 0 && u.damage < u.maxHealth);
  const health = (mine) => living.filter((u) => (u.controllerId === playerId) === mine).reduce((n, u) => n + u.maxHealth - u.damage, 0);
  const samples = [];
  for (const row of scored) {
    const outcome = row.score === best ? "win" : row.score === worst ? "loss" : null;
    if (!outcome) continue;
    const facts = api.replayDecisionFacts(before, playerId, row.action);
    samples.push({
      matchId: `${seed}#cf${sequence}`,
      basis: "counterfactual-fight",
      sequence,
      score: row.score,
      action: api.describeReplayAction(facts.action, before.pendingChoice?.type === "DECK_SEARCH" ? before.pendingChoice.revealedCardIds : undefined),
      outcome,
      context: {
        conditions: facts.conditions,
        situation: facts.situation,
        stage: before.round <= 3 ? "opening" : before.round >= 8 ? "late-game" : "midgame",
        faction: before.players[playerId]?.factionId ?? "unknown",
        combat: neutral ? "neutral" : "pvp",
        pressure: health(true) < health(false),
      },
    });
  }
  return samples;
}

/** Round-capped games: who developed better. Ties yield no label. */
export function developmentRaceWinner(seats) {
  const ids = Object.keys(seats);
  if (ids.length !== 2) return null;
  const [a, b] = ids;
  const earlier = (pick) => {
    const x = pick(seats[a]) ?? Infinity, y = pick(seats[b]) ?? Infinity;
    return x === y ? null : x < y ? a : b;
  };
  const more = (pick) => {
    const x = pick(seats[a]), y = pick(seats[b]);
    return x === y ? null : x > y ? a : b;
  };
  // User ruling: PvP results and the FINAL Gold packs rank above the first
  // Gold pack; the first Gold pack still decides before bodies and neutrals.
  const rules = [
    ["pvp-fights", () => more((s) => s.pvpFights.won - s.pvpFights.lost)],
    ["gold-packs", () => more((s) => s.goldPacks)],
    ["first-gold-pack", () => earlier((s) => s.firstGoldPackRound)],
    ["gold-bodies", () => more((s) => s.goldBodies)],
    ["first-gold-body", () => earlier((s) => s.firstGoldRound)],
    ["neutral-fights", () => more((s) => s.neutralFights.won - 2 * s.neutralFights.lost)],
  ];
  for (const [reason, rule] of rules) {
    const winner = rule();
    if (winner) return { winner, reason };
  }
  return null;
}

const decidedWinner = (record) => record.winner ?? record.developmentWinner ?? null;

async function runJobs(jobs, settings, dir) {
  fs.mkdirSync(path.join(dir, "replays"), { recursive: true });
  const records = [];
  for (const job of jobs) {
    const { record, replay, counterfactuals } = await playGame(job, settings);
    if (settings.keepReplays) {
      fs.writeFileSync(path.join(dir, "replays", `${job.seed}.json.gz`), gzipSync(JSON.stringify(replay)));
      if (counterfactuals.length) {
        fs.mkdirSync(path.join(dir, "counterfactuals"), { recursive: true });
        fs.writeFileSync(path.join(dir, "counterfactuals", `${job.seed}.json.gz`), gzipSync(JSON.stringify(counterfactuals)));
      }
    }
    records.push(record);
    console.log(JSON.stringify({ seed: record.seed, winner: record.winner, developmentWinner: record.developmentWinner, rounds: record.rounds, ms: record.ms, decisions: record.decisions, explored: record.explored, counterfactuals: record.counterfactuals, counterfactualMs: record.counterfactualMs, stalled: record.stalled }));
  }
  return records;
}

/** Fan the job list over child processes; each child writes its own record file. */
async function runParallel(jobs, settings, dir, workers) {
  if (workers <= 1 || jobs.length <= 1) return runJobs(jobs, settings, dir);
  fs.mkdirSync(path.join(dir, "jobs"), { recursive: true });
  const chunks = Array.from({ length: Math.min(workers, jobs.length) }, () => []);
  jobs.forEach((job, index) => chunks[index % chunks.length].push(job));
  await Promise.all(chunks.map((chunk, index) => new Promise((resolveChunk, reject) => {
    const jobFile = path.join(dir, "jobs", `worker-${index + 1}.json`);
    fs.writeFileSync(jobFile, JSON.stringify({ jobs: chunk, settings, dir }));
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url), "worker", "--job-file", jobFile], { stdio: "inherit", cwd: ROOT });
    child.on("exit", (code) => code === 0 ? resolveChunk() : reject(new Error(`worker ${index + 1} exited ${code}`)));
    child.on("error", reject);
  })));
  return chunks.flatMap((_, index) =>
    JSON.parse(fs.readFileSync(path.join(dir, "jobs", `worker-${index + 1}.out.json`), "utf8")));
}

function settingsFromFlags() {
  return {
    maxRound: num("rounds", 16),
    maxSteps: num("max-steps", 6000),
    keepReplays: !has("no-replays"),
    /** Share of close combat decisions that get a counterfactual rollout. */
    counterfactual: num("counterfactual", 0.2),
    counterfactualMax: num("cf-max", 60),
    counterfactualWidth: num("cf-width", 3),
    counterfactualMargin: num("cf-margin", 0.1),
    /** Entropy streams per alternative (dice vary between them). */
    counterfactualSamples: num("cf-samples", 2),
    rolloutSteps: num("rollout-steps", 400),
  };
}

function listFlag(name, fallback) {
  return flag(name, fallback).split(",").map((s) => s.trim()).filter(Boolean);
}

function factionsFromFlags() {
  const list = flag("factions", CLASSIC_FACTIONS.join(",")).split(",").map((s) => s.trim()).filter(Boolean);
  return list;
}

function extraOptionsFromFlags() {
  const raw = flag("options", null);
  return raw ? JSON.parse(raw) : undefined;
}

function writeRecords(dir, records, meta) {
  const file = path.join(dir, "games.json");
  const previous = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : { games: [] };
  const merged = [...previous.games.filter((g) => !records.some((r) => r.seed === g.seed && JSON.stringify(r.seats) === JSON.stringify(g.seats))), ...records];
  fs.writeFileSync(file, JSON.stringify({ ...previous, ...meta, games: merged }, null, 2) + "\n");
  return file;
}

// ------------------------------------------------------------ commands ----
async function commandPlay() {
  const batch = flag("batch", `batch-${new Date().toISOString().slice(0, 10)}`);
  const dir = batchDir(batch);
  const explore = num("explore", 0.15);
  const learned = flag("learned", "all");
  const jobs = jobsFor({
    games: num("games", 4),
    prefix: flag("seed-prefix", `selfplay-${batch}`),
    factions: factionsFromFlags(),
    difficulties: listFlag("difficulty", "normal"),
    variants: listFlag("variants", "default"),
    seats: { p1: { learned, explore }, p2: { learned, explore } },
    extraOptions: extraOptionsFromFlags(),
    pairing: flag("pairing", "mirror"),
  });
  const settings = settingsFromFlags();
  const records = await runParallel(jobs, settings, dir, num("workers", 1));
  const file = writeRecords(dir, records, { batch, mode: "play", explore, learned, settings });
  console.log(`wrote ${records.length} games → ${file}`);
  printReport(records);
}

async function commandWorker() {
  const { jobs, settings, dir } = JSON.parse(fs.readFileSync(flag("job-file"), "utf8"));
  const records = await runJobs(jobs, settings, dir);
  fs.writeFileSync(flag("job-file").replace(/\.json$/, ".out.json"), JSON.stringify(records));
}

async function commandTrain() {
  const [{ trainReplayPolicy }, { buildReplaySamples, trainingReport }] = await Promise.all([
    import(src("engine/computer/replay-model.ts")),
    import(pathToFileURL(path.join(ROOT, "scripts", "lib", "replay-samples.mjs")).href),
  ]);
  const batches = flag("batch", "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!batches.length) throw new Error("train needs --batch <name>[,<name>]");
  const samples = [];
  let replays = 0;
  for (const batch of batches) {
    const replayDir = path.join(batchDir(batch), "replays");
    for (const file of fs.readdirSync(replayDir).filter((f) => f.endsWith(".json.gz")).sort()) {
      const payload = JSON.parse(gunzipSync(fs.readFileSync(path.join(replayDir, file))).toString("utf8"));
      if (payload.entries.length < 100) continue;
      replays += 1;
      samples.push(...buildReplaySamples(payload, { sources: ["computer"], battleLabelsWithoutWinner: true }));
    }
  }
  let counterfactualSampleCount = 0;
  for (const batch of batches) {
    const cfDir = path.join(batchDir(batch), "counterfactuals");
    if (!fs.existsSync(cfDir)) continue;
    for (const file of fs.readdirSync(cfDir).filter((f) => f.endsWith(".json.gz")).sort()) {
      const rows = JSON.parse(gunzipSync(fs.readFileSync(path.join(cfDir, file))).toString("utf8"));
      counterfactualSampleCount += rows.length;
      samples.push(...rows);
    }
  }
  const minimumMatches = num("min-matches", 6);
  const model = trainReplayPolicy(samples, minimumMatches);
  const report = { replays, counterfactualSamples: counterfactualSampleCount, minimumMatches, ...trainingReport(model, samples), strongest: strongestWeights(model, 25) };
  if (model.samples === 0) {
    console.log("Self-play training: no usable samples; model untouched.");
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  const output = flag("output", path.join(ROOT, "src", "engine", "computer", "self-play-policy.json"));
  fs.writeFileSync(output + ".tmp", JSON.stringify(model, null, 2) + "\n");
  fs.renameSync(output + ".tmp", output);
  const reportPath = flag("report", path.join(batchDir(batches[0]), "train-report.json"));
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ ...report, strongest: undefined }));
  console.log("strongest learned patterns (bias, wins-losses over independent games):");
  for (const row of report.strongest) console.log(`  ${row.bias.toFixed(2).padStart(6)}  ${row.wins}-${row.losses}  ${row.key}`);
  console.log(`model → ${output}`);
}

function strongestWeights(model, limit) {
  return Object.entries(model.weights)
    .map(([key, w]) => ({ key, bias: w.bias, wins: w.wins, losses: w.losses, matches: w.matches }))
    .sort((a, b) => Math.abs(b.bias) - Math.abs(a.bias) || b.matches - a.matches)
    .slice(0, limit);
}

async function commandEval() {
  const batch = flag("batch", `eval-${new Date().toISOString().slice(0, 10)}`);
  const dir = batchDir(batch);
  const candidate = flag("candidate", "all");
  const baseline = flag("baseline", "ranked");
  const base = jobsFor({
    games: num("games", 4),
    prefix: flag("seed-prefix", `selfplay-${batch}`),
    factions: factionsFromFlags(),
    difficulties: listFlag("difficulty", "normal"),
    variants: listFlag("variants", "default"),
    seats: {},
    extraOptions: extraOptionsFromFlags(),
    pairing: flag("pairing", "mirror"),
  });
  // Mirrored pairs: the same seed/factions/heroes with the model sides swapped.
  const jobs = base.flatMap((job) => [
    { ...job, seats: { p1: { learned: candidate }, p2: { learned: baseline } } },
    { ...job, seats: { p1: { learned: baseline }, p2: { learned: candidate } } },
  ]);
  const settings = { ...settingsFromFlags(), keepReplays: has("keep-replays") };
  const records = await runParallel(jobs, settings, dir, num("workers", 1));
  const tally = { candidate: { mode: candidate, wins: 0 }, baseline: { mode: baseline, wins: 0 }, draws: 0, stalled: 0 };
  const metrics = { candidate: [], baseline: [] };
  for (const record of records) {
    if (record.stalled) tally.stalled += 1;
    for (const [playerId, seat] of Object.entries(record.players)) {
      const side = record.seats[playerId].learned === candidate ? "candidate" : "baseline";
      metrics[side].push(seat);
    }
    const decided = decidedWinner(record);
    if (!decided) { tally.draws += 1; continue; }
    const side = record.seats[decided].learned === candidate ? "candidate" : "baseline";
    tally[side].wins += 1;
    if (record.winner) tally.byEngineWin = (tally.byEngineWin ?? 0) + 1; else tally.byDevelopmentRace = (tally.byDevelopmentRace ?? 0) + 1;
  }
  const mean = (rows, pick) => rows.length ? rows.reduce((sum, r) => sum + (pick(r) ?? 0), 0) / rows.length : 0;
  const summary = (rows) => ({
    seats: rows.length,
    meanHeroLevel: mean(rows, (r) => r.heroLevel),
    meanGoldBodies: mean(rows, (r) => r.goldBodies),
    meanGoldPacks: mean(rows, (r) => r.goldPacks),
    goldPackShare: rows.length ? rows.filter((r) => r.firstGoldPackRound != null).length / rows.length : 0,
    meanFirstGoldPackRound: mean(rows.filter((r) => r.firstGoldPackRound != null), (r) => r.firstGoldPackRound),
    goldByRoundShare: rows.length ? rows.filter((r) => r.firstGoldRound != null).length / rows.length : 0,
    meanFirstGoldRound: mean(rows.filter((r) => r.firstGoldRound != null), (r) => r.firstGoldRound),
    meanFarCaptures: mean(rows, (r) => r.farCaptures),
    meanGoldProduction: mean(rows, (r) => r.goldProduction),
    pvpWins: rows.reduce((n, r) => n + r.pvpFights.won, 0),
    neutralLosses: rows.reduce((n, r) => n + r.neutralFights.lost, 0),
  });
  const result = { batch, candidate, baseline, games: records.length, tally,
    candidateMetrics: summary(metrics.candidate), baselineMetrics: summary(metrics.baseline) };
  writeRecords(dir, records, { batch, mode: "eval", candidate, baseline, settings, result });
  console.log(JSON.stringify(result, null, 2));
  console.log("A round-capped game counts for the seat that reached a Gold pack first (then Gold bodies, PvP, neutral results). Mirrored pairs cancel seat/faction edges. A candidate is only better when its wins exceed the baseline's beyond what a coin flip explains (for N decisive games, need roughly N/2 + sqrt(N)).");
}

function printReport(records) {
  const byFaction = {};
  const bySeat = { p1: 0, p2: 0 };
  let decidedCount = 0;
  let engineWins = 0;
  for (const record of records) {
    for (const [playerId, seat] of Object.entries(record.players)) {
      const row = byFaction[seat.factionId] ??= { games: 0, wins: 0, goldRounds: [], levels: [], far: [], pvpWon: 0, pvpLost: 0, neutralLost: 0 };
      row.games += 1;
      if (decidedWinner(record) === playerId) row.wins += 1;
      if (seat.firstGoldRound != null) row.goldRounds.push(seat.firstGoldRound);
      row.levels.push(seat.heroLevel);
      row.far.push(seat.farCaptures);
      row.pvpWon += seat.pvpFights.won; row.pvpLost += seat.pvpFights.lost; row.neutralLost += seat.neutralFights.lost;
    }
    const decided = decidedWinner(record);
    if (decided) { decidedCount += 1; bySeat[decided] += 1; if (record.winner) engineWins += 1; }
  }
  const avg = (xs) => xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1) : "-";
  console.log(`games ${records.length}, decided ${decidedCount} (${engineWins} by the engine, ${decidedCount - engineWins} by the development race; p1 ${bySeat.p1} / p2 ${bySeat.p2}), stalled ${records.filter((r) => r.stalled).length}, avg rounds ${avg(records.map((r) => r.rounds))}, avg ms ${avg(records.map((r) => r.ms))}`);
  const winners = records.filter((r) => decidedWinner(r)).map((r) => r.players[decidedWinner(r)]);
  const losers = records.filter((r) => decidedWinner(r)).flatMap((r) => Object.entries(r.players).filter(([id]) => id !== decidedWinner(r)).map(([, s]) => s));
  const gold = (rows) => avg(rows.filter((r) => r.firstGoldPackRound != null).map((r) => r.firstGoldPackRound));
  console.log(`winners: first gold pack R${gold(winners)}, level ${avg(winners.map((s) => s.heroLevel))}, far ${avg(winners.map((s) => s.farCaptures))} | losers: first gold pack R${gold(losers)}, level ${avg(losers.map((s) => s.heroLevel))}, far ${avg(losers.map((s) => s.farCaptures))}`);
  console.log("faction        games wins  goldR  level  far  pvp W-L  neutral L");
  for (const [faction, row] of Object.entries(byFaction).sort()) {
    console.log(`${faction.padEnd(14)} ${String(row.games).padStart(5)} ${String(row.wins).padStart(4)}  ${avg(row.goldRounds).padStart(5)}  ${avg(row.levels).padStart(5)}  ${avg(row.far).padStart(3)}  ${String(row.pvpWon).padStart(3)}-${String(row.pvpLost).padEnd(3)}  ${row.neutralLost}`);
  }
}

async function commandReport() {
  const batches = flag("batch", "").split(",").map((s) => s.trim()).filter(Boolean);
  const records = batches.flatMap((batch) => JSON.parse(fs.readFileSync(path.join(batchDir(batch), "games.json"), "utf8")).games);
  printReport(records);
  printBreakdown(records);
  if (has("deep")) await printDeepReport(batches, records);
}

/** Win share by difficulty, variant and hero — the race is judged within a game, so these are fair. */
function printBreakdown(records) {
  const groups = { difficulty: {}, variant: {}, hero: {} };
  for (const record of records) {
    const decided = decidedWinner(record);
    const bump = (map, key, playerId) => {
      const row = map[key] ??= { games: 0, wins: 0 };
      row.games += 1;
      if (decided === playerId) row.wins += 1;
    };
    for (const playerId of Object.keys(record.players)) {
      bump(groups.difficulty, record.difficulty ?? "normal", playerId);
      bump(groups.variant, record.variant ?? "default", playerId);
      bump(groups.hero, `${record.players[playerId].factionId}/${record.heroes?.[playerId] ?? "?"}`, playerId);
    }
  }
  for (const [name, map] of Object.entries(groups)) {
    const rows = Object.entries(map).sort();
    if (rows.length <= 1 && name !== "hero") continue;
    console.log(`by ${name}: ` + rows.map(([key, row]) => `${key} ${row.wins}/${row.games}`).join("  "));
  }
}

/** Scan the replays: which guards cost fights and units, and which cards were in won fights. */
async function printDeepReport(batches, records) {
  const api = await loadEngine();
  const guards = {};
  const cards = {};
  const retreatsByRound = {};
  for (const batch of batches) {
    const replayDir = path.join(batchDir(batch), "replays");
    if (!fs.existsSync(replayDir)) continue;
    for (const file of fs.readdirSync(replayDir).filter((f) => f.endsWith(".json.gz")).sort()) {
      const p = JSON.parse(gunzipSync(fs.readFileSync(path.join(replayDir, file))).toString("utf8"));
      const open = new Map(); // combat id → { guardKey, actor, cards:Set, lost:0 }
      let current = null;
      for (const e of p.entries) {
        for (const ev of e.events) {
          if (ev.type === "NEUTRAL_COMBAT_STARTED" || ev.type === "CREATURE_BANK_COMBAT_STARTED") {
            current = { guardKey: `${ev.type === "CREATURE_BANK_COMBAT_STARTED" ? "bank" : "guards"} (d${ev.difficulty ?? "?"})`, actor: ev.playerId, cards: new Set(), lost: 0, round: e.round };
          }
          // The guard identity arrives with the reveal, after the start event.
          if (ev.type === "NEUTRAL_ARMY_REVEALED" && current && ev.unitDefIds?.length) {
            current.guardUnits = [...new Set(ev.unitDefIds.map((id) => id.replace(/^neutral\./, "")))];
            current.difficulty = ev.difficulty ?? current.guardKey.match(/d(\d+)/)?.[1];
          }
          if (ev.type === "PLAYER_COMBAT_STARTED") current = { guardKey: "pvp", actor: ev.attackerPlayerId ?? e.actorPlayerId, cards: new Set(), lost: 0, round: e.round };
          if (!current) continue;
          if ((ev.type === "CARD_PLAYED" || ev.type === "SPELL_CAST_STARTED") && ev.playerId === current.actor) current.cards.add(ev.cardId ?? ev.spellCardId);
          if (ev.type === "UNIT_REMOVED" && ev.playerId === current.actor) current.lost += 1;
          if (ev.type === "COMBAT_ENDED") {
            const won = ev.winnerPlayerId === current.actor;
            // One row per guard UNIT (a fight with three guard kinds counts for
            // each) plus the difficulty band, so a monster's cost shows across
            // the many distinct guard combinations.
            const keys = current.guardUnits?.length
              ? current.guardUnits.map((unit) => `${unit} (d${current.difficulty ?? "?"})`)
              : [current.guardKey];
            for (const key of keys) {
              const row = guards[key] ??= { fights: 0, won: 0, retreats: 0, unitsLost: 0 };
              row.fights += 1; if (won) row.won += 1; if (ev.reason === "retreat") row.retreats += 1; row.unitsLost += current.lost;
            }
            if (ev.reason === "retreat") retreatsByRound[current.round] = (retreatsByRound[current.round] ?? 0) + 1;
            for (const card of current.cards) {
              const c = cards[card] ??= { fights: 0, won: 0, unitsLost: 0 };
              c.fights += 1; if (won) c.won += 1; c.unitsLost += current.lost;
            }
            current = null;
          }
        }
      }
    }
  }
  const pct = (a, b) => b ? Math.round(100 * a / b) + "%" : "-";
  console.log("\nguards (own units lost per fight is the setback measure; a win with losses still costs tempo):");
  for (const [key, row] of Object.entries(guards).sort((a, b) => (b[1].fights - b[1].won) - (a[1].fights - a[1].won) || b[1].unitsLost - a[1].unitsLost).slice(0, 25)) {
    console.log(`  ${key.padEnd(46)} fights ${String(row.fights).padStart(3)}  won ${pct(row.won, row.fights).padStart(4)}  retreats ${row.retreats}  units lost/fight ${(row.unitsLost / row.fights).toFixed(2)}`);
  }
  console.log("\ncards played in fights (win share of the fight they were played in; a card seen only in easy fights looks good — read with the guard table):");
  for (const [key, row] of Object.entries(cards).sort((a, b) => b[1].fights - a[1].fights).slice(0, 30)) {
    console.log(`  ${key.padEnd(40)} fights ${String(row.fights).padStart(3)}  won ${pct(row.won, row.fights).padStart(4)}  units lost/fight ${(row.unitsLost / row.fights).toFixed(2)}`);
  }
  console.log("retreats by round: " + Object.entries(retreatsByRound).sort((a, b) => a[0] - b[0]).map(([r, n]) => `R${r}:${n}`).join(" "));
}

const commands = { play: commandPlay, worker: commandWorker, train: commandTrain, eval: commandEval, report: commandReport };
if (!commands[command]) {
  console.error("usage: node scripts/self-play.mjs <play|train|eval|report> [flags]");
  process.exit(2);
}
await commands[command]();
