#!/usr/bin/env node
/**
 * Record the scripted tutorial game (Necropolis player vs Castle computer).
 *
 *   node scripts/tutorial/record-tutorial.mjs search --seeds 1-20 [--difficulty normal] [--hero sandro] [--max-round 16]
 *   node scripts/tutorial/record-tutorial.mjs record --seed tutorial-7 [--difficulty normal] [--hero sandro] [--out ...]
 *   node scripts/tutorial/record-tutorial.mjs verify [--script src/data/tutorial/tutorial-script.json]
 *
 * The player seat stays a HUMAN seat throughout (no computer combat edges, no
 * guaranteed wins); its moves are picked by the shipped AI policy run on that
 * human seat (the self-play lab's policyLabDecisionOwner + chooseComputerAction
 * recipe) with its planning memory kept in a side-car, never in the game
 * state. The Castle seat is the real computer, driven by driveComputerPlayers
 * with a deterministic apply. Every step is applied through tutorial-core's
 * tutorialApply — the exact function the in-browser tutorial room uses — and
 * its fingerprint is stored so the live room can detect a rules drift.
 *
 * `verify` replays a script against the CURRENT engine and reports the first
 * divergence: run it after rule changes, and re-record if it fails.
 */
import { register } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

register("../lib/ts-resolver.mjs", import.meta.url);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const src = (relative) => pathToFileURL(path.join(ROOT, "src", relative)).href;
const DEFAULT_SCRIPT = path.join(ROOT, "src", "data", "tutorial", "tutorial-script.json");

const argv = process.argv.slice(2);
const command = argv[0];
const flag = (name, fallback) => {
  const index = argv.indexOf(`--${name}`);
  return index === -1 ? fallback : argv[index + 1];
};

const [core, engineIndex, runner, windowMod, policy, observation, memory, navigation, soak, version] = await Promise.all([
  import(src("lib/tutorial/tutorial-core.ts")),
  import(src("engine/index.ts")),
  import(src("server/computer-runner.ts")),
  import(src("engine/computer/window.ts")),
  import(src("engine/computer/policy.ts")),
  import(src("engine/computer/observation.ts")),
  import(src("engine/computer/memory.ts")),
  import(src("engine/computer/map-navigation.ts")),
  import(src("server/single-player-soak-helpers.ts")),
  import(src("engine/version.ts")),
]);
const hexMod = await import(src("engine/hex.ts"));

const P = core.TUTORIAL_PLAYER;
const C = core.TUTORIAL_COMPUTER;

function setupFor(seed) {
  return {
    seed,
    difficulty: flag("difficulty", "normal"),
    playerFaction: "necropolis",
    playerHero: flag("hero", "sandro"),
    computerFaction: "castle",
    computerHero: flag("enemy", "catherine"),
  };
}

/** The computer seat's next decision, computed on a copy carrying the AI memory side-car. */
function computerDecision(real, aiMemory) {
  const copy = { ...real, computerMemory: aiMemory };
  const run = runner.driveComputerPlayers(copy, (s, a, p) => core.tutorialApply(s, a, { kind: "computer", playerId: p }), { maxSteps: 1 });
  const decision = run.decisions[0];
  if (!decision) return { stalled: run.reason ?? "computer produced no decision" };
  return { action: decision.action, playerId: decision.playerId, memory: run.state.computerMemory ?? aiMemory };
}

/** The shipped policy's pick for the human seat (plus its tactical alternatives), on a memory copy. */
function humanPolicy(real, aiMemory) {
  let copy = { ...real, computerMemory: aiMemory };
  copy = memory.refreshComputerMemory(copy, P);
  const hero = Object.values(copy.heroes ?? {}).find((h) => h.controllerId === P && h.kind === "main");
  if (hero && !copy.combat) {
    const objective = navigation.primaryMapObjective(copy, hero, undefined, copy.computerMemory?.[P]?.stickyObjectiveSpaceId);
    copy = memory.setStickyObjective(copy, P, objective?.spaceId ?? null);
  }
  let tactical = [];
  let close = [];
  const decision = policy.chooseComputerAction(observation.observeForComputer(copy, P), {
    onTacticalCandidates: (list) => (tactical = [...list]),
    onClose: (list) => (close = [...list]),
  });
  return { copy, decision, tactical, close };
}

/** First candidate the engine accepts for the human seat (policy pick, then any legal move). */
function firstAccepted(real, candidates) {
  for (const candidate of candidates) {
    const result = core.tutorialApply(real, candidate.action, { kind: "human", clientId: core.TUTORIAL_RECORD_CLIENT_ID });
    if (!result.errors.length) return { ...candidate, result };
  }
  return null;
}

function legalFallbacks(real) {
  const list = [];
  const pick = soak.pickHumanAction(real, P);
  if (pick) list.push({ action: pick, source: "fallback" });
  const offers = engineIndex.getLegalActions(real, P);
  const pass = offers.find((offer) => offer.action.type === "PASS_REACTION");
  if (pass) list.push({ action: pass.action, source: "fallback.pass" });
  for (const offer of offers) {
    if (offer.action.type !== "GIVE_UP" && offer.action.type !== "GIVE_UP_COMBAT") list.push({ action: offer.action, source: "fallback.legal" });
  }
  return list;
}

/**
 * The table UI makes a player draw at the start of the turn before anything
 * else (its draw dialog covers the map), so the recorded player does too.
 */
function uiFirstAction(real) {
  if (real.combat) return null;
  const offers = engineIndex.getLegalActions(real, P);
  if (!offers.some((offer) => offer.action.type === "REFRESH_HAND")) return null;
  const pick = soak.pickHumanAction(real, P);
  return pick?.type === "REFRESH_HAND" ? { action: pick, source: "ui-order.refresh" } : null;
}

/** Plain (no search) human move. */
function humanDecisionPlain(real, aiMemory) {
  const { copy, decision: policyDecision } = humanPolicy(real, aiMemory);
  const forced = uiFirstAction(real);
  const decision = forced && policyDecision?.action.type !== "REFRESH_HAND" ? { action: forced.action, policy: forced.source } : policyDecision;
  const assault = assaultOverride(real, decision, aiMemory);
  const accepted = firstAccepted(real, [
    ...(assault ? [assault] : []),
    ...(decision ? [{ action: decision.action, source: decision.policy ?? "policy" }] : []),
    ...legalFallbacks(real),
  ]);
  if (!accepted) return { stalled: "no legal human move" };
  const noted = memory.noteComputerAction({ ...accepted.result.state, computerMemory: copy.computerMemory }, P, accepted.action, copy);
  return { action: accepted.action, result: accepted.result, source: accepted.source, memory: noted.computerMemory ?? copy.computerMemory };
}

function combatSides(combat) {
  return [combat.attackerPlayerId, combat.defenderPlayerId];
}

/** Score a finished (or abandoned) fight from the player's side: win first, then surviving health. */
function fightScore(state, combatId) {
  const combat = state.combat;
  if (!combat || combat.id !== combatId) return 0;
  let score = 0;
  if (combat.outcome) score += combat.outcome.winnerPlayerId === P ? 10000 : -10000;
  for (const unit of Object.values(combat.units ?? {})) {
    const left = Math.max(0, (unit.maxHealth ?? 0) - (unit.damage ?? 0));
    score += unit.controllerId === P ? left * 10 : -left * 6;
  }
  return score;
}

/** Deterministic rollout of the current fight with both sides on their normal policies. */
function rolloutFight(state, aiMemory, combatId, limit = 400) {
  let real = state;
  let mem = aiMemory;
  for (let index = 0; index < limit; index += 1) {
    if (!real.combat || real.combat.id !== combatId || real.combat.outcome) break;
    const owner = windowMod.policyLabDecisionOwner(real);
    if (owner === C) {
      const decision = computerDecision(real, mem);
      if (decision.stalled) break;
      const result = core.tutorialApply(real, decision.action, { kind: "computer", playerId: decision.playerId });
      if (result.errors.length) break;
      real = result.state;
      mem = decision.memory;
    } else {
      const decision = humanDecisionPlain(real, mem);
      if (decision.stalled) break;
      real = decision.result.state;
      mem = decision.memory;
    }
  }
  return fightScore(real, combatId);
}

const SEARCH_WIDTH = Number(flag("search-width", "6"));

const ASSAULT_ROUND = Number(flag("assault-round", "9"));
const HOLDING_LOCATIONS = new Set(["settlement"]);

/** Assault target: the enemy town, then its other holdings, then its hero. */
function assaultTarget(real) {
  const fields = Object.values(real.adventure?.fields ?? {});
  const town = fields.find((f) => f.flagOwnerId === C && navigation.ownTownSpaceId(real, C) === f.spaceId);
  if (town) return town.spaceId;
  const holding = fields.find((f) => f.flagOwnerId === C && HOLDING_LOCATIONS.has(f.location));
  if (holding) return holding.spaceId;
  const enemy = Object.values(real.heroes ?? {}).find((h) => h.controllerId === C && h.spaceId);
  return enemy?.spaceId ?? null;
}

/**
 * From ASSAULT_ROUND on, a map decision that would walk elsewhere or end the
 * turn is replaced by the legal single step that brings the main hero closest
 * to the assault target. Town, card and fight decisions stay with the policy.
 */
/**
 * Would stepping here start a fight with the Castle seat that the player
 * wins? Plays the move and the whole resulting battle out on the seeded
 * engine. Stepping somewhere peaceful is always fine.
 */
function engagementWins(real, action, aiMemory) {
  let state = core.tutorialApply(real, action, { kind: "human", clientId: core.TUTORIAL_RECORD_CLIENT_ID });
  if (state.errors.length) return false;
  state = state.state;
  let mem = aiMemory;
  for (let index = 0; index < 6 && !state.combat; index += 1) {
    if (windowMod.policyLabDecisionOwner(state) !== P) return true;
    const decision = humanDecisionPlain(state, mem);
    if (decision.stalled) return true;
    state = decision.result.state;
    mem = decision.memory;
  }
  const combat = state.combat;
  if (!combat || ![combat.attackerPlayerId, combat.defenderPlayerId].includes(C)) return true;
  return rolloutFight(state, mem, combat.id) > 0;
}

function assaultOverride(real, decision, aiMemory) {
  if (real.round < ASSAULT_ROUND || real.combat || real.pendingChoice || real.reactionWindow) return null;
  if (!decision || !["MOVE_HERO", "MOVE_HERO_PATH", "END_TURN", "REVISIT_FIELD", "DISCOVER_TILE"].includes(decision.action.type)) return null;
  const hero = Object.values(real.heroes ?? {}).find((h) => h.controllerId === P && h.kind === "main");
  const target = assaultTarget(real);
  if (!hero?.spaceId || !target) return null;
  const targetHex = hexMod.parseHexSpaceId(target);
  const straight = (spaceId) => {
    const coord = hexMod.parseHexSpaceId(spaceId);
    return coord && targetHex ? hexMod.hexDistance(coord, targetHex) : Infinity;
  };
  const offers = engineIndex.getLegalActions(real, P);
  const moves = offers.filter((offer) => offer.action.type === "MOVE_HERO" && offer.action.heroId === hero.id);
  const here = navigation.distanceFromHeroTo(real, hero, target, true);
  let best = null;
  if (here !== undefined) {
    // A known route: step along it.
    for (const offer of moves) {
      const to = offer.action.to;
      const distance = to === target ? 0 : navigation.distanceFromHeroTo(real, { ...hero, spaceId: to }, target, true);
      if (distance === undefined || distance >= here) continue;
      if (!best || distance < best.distance) best = { action: offer.action, distance };
    }
    if (best && best.distance <= 1 && !engagementWins(real, best.action, aiMemory)) return null;
    return best ? { action: best.action, source: "assault.route" } : null;
  }
  // No known route (face-down tiles in between): head straight for it, and
  // reveal the face-down tile that lies closest to the target when blocked.
  const now = straight(hero.spaceId);
  for (const offer of moves) {
    const distance = straight(offer.action.to);
    if (distance < now && (!best || distance < best.distance)) best = { action: offer.action, distance };
  }
  if (best) return { action: best.action, source: "assault.straight" };
  for (const offer of offers) {
    if (offer.action.type !== "DISCOVER_TILE") continue;
    // Face-down tiles have no fields yet; measure from the tile's centre.
    const tile = real.adventure?.tiles?.[offer.action.tileInstanceId];
    const distance = tile ? straight(`h:${tile.centerRow}:${tile.centerCol}`) : Infinity;
    if (distance < now && (!best || distance < best.distance)) best = { action: offer.action, distance };
  }
  return best ? { action: best.action, source: "assault.discover" } : null;
}

/** The human seat's move; inside the player's fights, the best of the policy's candidates by exact rollout. */
function humanDecision(real, aiMemory) {
  const combat = real.combat;
  if (!SEARCH_WIDTH || !combat || combat.outcome || !combatSides(combat).includes(P)) return humanDecisionPlain(real, aiMemory);
  const { copy, decision, tactical, close } = humanPolicy(real, aiMemory);
  const seen = new Set();
  const candidates = [];
  for (const action of [...(decision ? [decision.action] : []), ...tactical, ...close]) {
    const key = policy.canonicalActionKey(action);
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push(action);
    if (candidates.length >= SEARCH_WIDTH) break;
  }
  if (candidates.length < 2) return humanDecisionPlain(real, aiMemory);
  let best = null;
  for (const action of candidates) {
    const result = core.tutorialApply(real, action, { kind: "human", clientId: core.TUTORIAL_RECORD_CLIENT_ID });
    if (result.errors.length) continue;
    const noted = memory.noteComputerAction({ ...result.state, computerMemory: copy.computerMemory }, P, action, copy);
    const mem = noted.computerMemory ?? copy.computerMemory;
    const score = rolloutFight(result.state, mem, combat.id);
    if (!best || score > best.score) best = { action, result, memory: mem, score, source: "search" };
  }
  return best ?? humanDecisionPlain(real, aiMemory);
}

function describe(action) {
  const { type, playerId, ...rest } = action;
  const text = JSON.stringify(rest);
  return `${type} ${text.length > 110 ? `${text.slice(0, 110)}…` : text}`;
}

function playGame(setup, { maxRound, log, maxSteps = 20000 }) {
  const start = core.tutorialStartState(setup, { clientId: core.TUTORIAL_RECORD_CLIENT_ID, name: "Player" });
  if (start.errors.length) throw new Error(`setup failed: ${JSON.stringify(start.errors)}`);
  let real = start.state;
  let aiMemory = real.computerMemory ?? {};
  const steps = [];
  const stats = { fights: [], levelUps: 0, stalled: null };
  const seenCombats = new Set();
  for (let index = 0; index < maxSteps; index += 1) {
    if (real.adventure?.winnerPlayerId) break;
    if (real.phase === "game-over" && !real.combat) break;
    if (real.round > maxRound) break;
    const owner = windowMod.policyLabDecisionOwner(real);
    let by;
    let playerId;
    let action;
    let next;
    if (owner === C) {
      const decision = computerDecision(real, aiMemory);
      if (decision.stalled) {
        stats.stalled = `computer: ${decision.stalled}`;
        break;
      }
      const result = core.tutorialApply(real, decision.action, { kind: "computer", playerId: decision.playerId });
      if (result.errors.length) {
        stats.stalled = `computer action rejected on replay: ${JSON.stringify(result.errors)}`;
        break;
      }
      ({ action, playerId } = decision);
      by = "computer";
      next = result.state;
      aiMemory = decision.memory;
    } else {
      const decision = humanDecision(real, aiMemory);
      if (decision.stalled) {
        stats.stalled = `human: ${decision.stalled} (owner=${owner}, phase=${real.phase}, round=${real.round})`;
        break;
      }
      ({ action } = decision);
      playerId = P;
      by = "human";
      next = decision.result.state;
      aiMemory = decision.memory;
    }
    steps.push({ by, playerId, action, hash: core.tutorialFingerprint(next), round: next.round });
    if (log) log(`${String(steps.length).padStart(5)} R${next.round} ${by === "human" ? "YOU" : "CPU"} ${describe(action)}`);
    const combat = next.combat;
    if (combat?.outcome && !seenCombats.has(combat.id)) {
      seenCombats.add(combat.id);
      stats.fights.push({
        round: next.round,
        attacker: combat.attackerPlayerId,
        defender: combat.defenderPlayerId,
        winner: combat.outcome.winnerPlayerId ?? null,
      });
    }
    real = next;
  }
  return { steps, final: real, stats, startHash: core.tutorialFingerprint(start.state) };
}

function summarize(game) {
  const { final, stats } = game;
  const hero = (pid) => Object.values(final.heroes ?? {}).find((h) => h.controllerId === pid && h.kind === "main");
  const pvp = stats.fights.filter((f) => f.attacker !== "neutrals" && f.defender !== "neutrals");
  return {
    winner: final.adventure?.winnerPlayerId ?? null,
    round: final.round,
    steps: game.steps.length,
    humanSteps: game.steps.filter((s) => s.by === "human").length,
    heroLevels: { you: hero(P)?.level ?? null, cpu: hero(C)?.level ?? null },
    neutralFights: stats.fights.length - pvp.length,
    pvp: pvp.map((f) => `R${f.round} ${f.attacker}->${f.defender} won:${f.winner}`),
    eliminated: Object.entries(final.players).filter(([, p]) => p.eliminated).map(([id]) => id),
    stalled: stats.stalled,
  };
}

if (command === "search") {
  const [from, to] = flag("seeds", "1-10").split("-").map(Number);
  const maxRound = Number(flag("max-round", "16"));
  for (let n = from; n <= to; n += 1) {
    const seed = `tutorial-${n}`;
    const t0 = Date.now();
    try {
      const game = playGame(setupFor(seed), { maxRound });
      console.log(JSON.stringify({ seed, ms: Date.now() - t0, ...summarize(game) }));
    } catch (error) {
      console.log(JSON.stringify({ seed, error: String(error?.stack ?? error).slice(0, 400) }));
    }
  }
} else if (command === "record") {
  const seed = flag("seed", "tutorial-1");
  const out = flag("out", DEFAULT_SCRIPT);
  const setup = setupFor(seed);
  const lines = [];
  const game = playGame(setup, { maxRound: Number(flag("max-round", "16")), log: (line) => lines.push(line) });
  const summary = summarize(game);
  const script = {
    id: `necro-vs-castle-${seed}`,
    engineSignature: version.ENGINE_SIGNATURE,
    setup,
    startHash: game.startHash,
    steps: game.steps,
    summary: { rounds: game.final.round, winner: summary.winner },
  };
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(script)}\n`);
  fs.writeFileSync(out.replace(/\.json$/, ".log.txt"), `${lines.join("\n")}\n`);
  console.log(JSON.stringify(summary, null, 1));
  console.log(`wrote ${path.relative(ROOT, out)} (${(fs.statSync(out).size / 1024).toFixed(0)} KB, ${game.steps.length} steps)`);
} else if (command === "verify") {
  const file = flag("script", DEFAULT_SCRIPT);
  const script = JSON.parse(fs.readFileSync(file, "utf8"));
  // A different client id and name than the recording, like a real player.
  const start = core.tutorialStartState(script.setup, { clientId: "verify-client", name: "Verifier" });
  if (start.errors.length) throw new Error(`setup failed: ${JSON.stringify(start.errors)}`);
  let state = start.state;
  if (core.tutorialFingerprint(state) !== script.startHash) {
    console.log("DIVERGED at start (setup no longer produces the recorded opening)");
    process.exit(1);
  }
  for (const [index, step] of script.steps.entries()) {
    const actor = step.by === "computer" ? { kind: "computer", playerId: step.playerId } : { kind: "human", clientId: "verify-client" };
    const result = core.tutorialApply(state, step.action, actor);
    if (result.errors.length) {
      console.log(`REJECTED step ${index} (${step.action.type}): ${JSON.stringify(result.errors)}`);
      process.exit(1);
    }
    state = result.state;
    if (core.tutorialFingerprint(state) !== step.hash) {
      console.log(`DIVERGED after step ${index} (${step.action.type}, round ${step.round})`);
      process.exit(1);
    }
  }
  console.log(`OK: ${script.steps.length} steps replay identically; winner ${state.adventure?.winnerPlayerId ?? "none"} in round ${state.round}`);
} else {
  console.log("usage: record-tutorial.mjs search|record|verify (see header)");
}
