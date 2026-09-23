/** Explicitly requested offline validation. Never invoked by npm test/build. */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const root = process.cwd();
const mode = process.argv[2];
const output = path.resolve(process.argv[3] ?? 'artifacts/ai-validation-2026-09-15');
if (mode === 'prepare') {
  if (fs.existsSync(path.join(output, 'snapshot'))) throw new Error('Snapshot already exists; use a new output directory.');
  const snapshot = path.join(output, 'snapshot');
  fs.mkdirSync(snapshot, { recursive: true });
  fs.cpSync(path.join(root, 'src'), path.join(snapshot, 'src'), { recursive: true,
    filter: p => !/\.(test|spec)\.[^.]+$/.test(p) });
  fs.mkdirSync(path.join(snapshot, 'scripts/lib'), { recursive: true });
  fs.copyFileSync(path.join(root, 'scripts/lib/ts-resolver.mjs'), path.join(snapshot, 'scripts/lib/ts-resolver.mjs'));
  fs.writeFileSync(path.join(snapshot, 'package.json'), '{"type":"module"}');
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const files = execFileSync('git', ['ls-tree', '-r', '--name-only', commit, 'src/engine/computer'], { encoding: 'utf8' }).trim().split('\n');
  const hashes = {};
  for (const file of files.filter(f => !f.includes('.test.'))) {
    const contents = execFileSync('git', ['show', `${commit}:${file}`], { maxBuffer: 20_000_000 });
    const dest = path.join(snapshot, file.replace('/computer/', '/computer-baseline/'));
    fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, contents);
    hashes[file] = createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex');
  }
  // Include new policy modules as well as files present in the baseline commit.
  for (const name of fs.readdirSync(path.join(snapshot, 'src/engine/computer'))) {
    if (!name.endsWith('.ts') || name.includes('.test.')) continue;
    const file = `src/engine/computer/${name}`;
    hashes[file] = createHash('sha256').update(fs.readFileSync(path.join(snapshot, file))).digest('hex');
  }
  let runner = fs.readFileSync(path.join(snapshot, 'src/server/computer-runner.ts'), 'utf8');
  for (const name of ['chooseComputerAction', 'collectMapObjectives', 'primaryMapObjective']) {
    runner = runner.replace(`  ${name},`, `  ${name} as current_${name},`);
  }
  for (const name of ['noteComputerAction', 'noteRecentStateHash', 'recentStateHashSeen', 'refreshComputerMemory', 'setStickyObjective']) {
    runner = runner.replace(`  ${name},`, `  ${name} as current_${name},`);
  }
  runner = runner.replace('import { reconsiderComputerPlan }', 'import { reconsiderComputerPlan as current_reconsiderComputerPlan }');
  runner += `\nimport * as baselinePolicy from '../engine/computer-baseline/policy';
import * as baselineNavigation from '../engine/computer-baseline/map-navigation';
import * as baselineMemory from '../engine/computer-baseline/memory';
import * as baselineReconsider from '../engine/computer-baseline/reconsider';
let baselineSeats = new Set<string>();
export function setBaselineSeats(ids: string[]) { baselineSeats = new Set(ids); }
function chooseComputerAction(o: any, options: any) { return (baselineSeats.has(o.playerId) ? baselinePolicy.chooseComputerAction : current_chooseComputerAction)(o, options); }
function collectMapObjectives(s: any, h: any) { return (baselineSeats.has(h.controllerId) ? baselineNavigation.collectMapObjectives : current_collectMapObjectives)(s, h); }
function primaryMapObjective(s: any, h: any, ...rest: any[]) { return (baselineSeats.has(h.controllerId) ? baselineNavigation.primaryMapObjective : current_primaryMapObjective)(s, h, ...rest); }
function reconsiderComputerPlan(s: any, id: string, ...rest: any[]) { return (baselineSeats.has(id) ? baselineReconsider.reconsiderComputerPlan : current_reconsiderComputerPlan)(s, id, ...rest); }
`;
  for (const name of ['noteComputerAction', 'noteRecentStateHash', 'recentStateHashSeen', 'refreshComputerMemory', 'setStickyObjective']) {
    runner += `\nfunction ${name}(s: any, id: string, ...rest: any[]) { return (baselineSeats.has(id) ? baselineMemory.${name} : current_${name})(s, id, ...rest); }\n`;
  }
  fs.writeFileSync(path.join(snapshot, 'src/server/validation-runner.ts'), runner);
  fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify({ commit, created: new Date().toISOString(), hashes,
    baseline: 'Committed AI decision modules on the same frozen current rules, legal actions, runner, and combat advantages.',
    scope: 'Gold timing: impossible adventure. PvP: equal-army mirror combat fixtures, policy seats swapped. No cutoff score counted as win.' }, null, 2));
  console.log(JSON.stringify({ prepared: output, commit }));
  process.exit(0);
}

const snapshot = path.join(output, 'snapshot');
register(pathToFileURL(path.join(snapshot, 'scripts/lib/ts-resolver.mjs')).href, import.meta.url);
const load = rel => import(pathToFileURL(path.join(snapshot, 'src', rel)).href);
const [setup, runner, reducer, factions, units, adventure, battles] = await Promise.all([
  load('engine/adventure-setup.ts'), load('server/validation-runner.ts'), load('engine/reducer.ts'),
  load('data/factions/core.ts'), load('data/factions/units.ts'), load('engine/adventure.ts'), load('engine/adventure-reducer.ts'),
]);
const jobs = JSON.parse(fs.readFileSync(process.argv[4], 'utf8'));
const resultFile = process.argv[5];
const tier = id => units.coreUnitDefinitions[id]?.tier;
const has = (s, id, t) => s.players[id].army.some(u => u.side !== 'bank' && t.includes(tier(u.unitDefId)));
const apply = (s, a, id) => reducer.applyAction(s, a, { computerActorPlayerId: id });
for (const job of jobs) {
  const begun = Date.now();
  const hero = factions.coreFactionDefinitions[job.faction].heroes[job.heroIndex ?? 0];
  const me = job.candidateSeat ?? 'p2';
  runner.setBaselineSeats(job.kind === 'pvp' ? [me === 'p1' ? 'p2' : 'p1'] :
    job.version === 'baseline' ? ['p1', 'p2'] : ['p1']);
  let state = setup.createAdventureGameState({ seed: job.seed, difficulty: job.difficulty ?? 'impossible', events: false,
    rollFirstPlayer: false, sessionMode: job.kind === 'pvp' ? 'multiplayer' : 'single-player',
    players: [{ id: 'p1', name: 'P1', factionId: job.kind === 'pvp' ? job.faction : 'castle',
      heroDefId: job.kind === 'pvp' ? hero : factions.coreFactionDefinitions.castle.heroes[0] },
      { id: 'p2', name: 'P2', factionId: job.faction, heroDefId: hero }],
    controllers: { p1: { kind: 'computer', difficulty: 'standard', policyVersion: 1 }, p2: { kind: 'computer', difficulty: 'standard', policyVersion: 1 } },
  });
  if (job.kind === 'pvp') {
    state.round = 9;
    const roster = factions.coreFactionDefinitions[job.faction].units;
    const bronze = roster.filter(id => tier(id) === 'bronze');
    const silver = roster.filter(id => tier(id) === 'silver');
    const gold = roster.filter(id => tier(id) === 'gold');
    const carry = job.faction === 'dungeon' ? 'dungeon.minotaurs' : job.faction === 'rampart' ? 'rampart.dendroids' : silver[0];
    for (const id of ['p1', 'p2']) {
      state.players[id].army = [];
      for (const [def, side] of [[bronze[2], 'pack'], [bronze[0], 'few'], [carry, 'few'], [gold.at(-1), 'few'], [gold[0], 'few']]) {
        // Factory's mutually exclusive Gold cards cannot coexist in a legal army.
        const legalDef = factions.factoryGoldUnitConflict(state.players[id].army, def)
          ? silver.find(unit => unit !== carry) : def;
        if (legalDef) adventure.addArmyUnit(state.players[id], legalDef, side);
      }
      state.players[id].hand = ['stat.attack', 'stat.defense', 'stat.power', 'stat.knowledge', 'spell.magic_arrow', 'ability.luck', 'ability.leadership'];
      state.players[id].resources = { gold: 25, buildingMaterials: 5, valuables: 3 };
      const h = Object.values(state.heroes).find(h => h.controllerId === id && h.kind === 'main'); h.level = 5;
    }
    const a = Object.values(state.heroes).find(h => h.controllerId === 'p1' && h.kind === 'main');
    const d = Object.values(state.heroes).find(h => h.controllerId === 'p2' && h.kind === 'main');
    battles.startPlayerCombat(state, a, d, a.spaceId, undefined, { arenaDuel: { duel: 1 } });
  }
  const topGold = factions.coreFactionDefinitions[job.faction].units.filter(id => tier(id) === 'gold').at(-1);
  const row = { ...job, hero, firstGold: null, firstTopGold: null, firstSilver: null, firstFar: null, secondFar: null,
    firstL3FarWin: null, secondL3FarWin: null, pvpWinner: null, actions: 0, termination: null, reason: null,
    neutralWins: 0, neutralLosses: 0, retreats: 0, cardPlays: 0, purchases: [], decisionMs: [],
    secondaryHired: null, pvpFights: 0, pvpWins: 0, unitsLost: 0, spellBuys: 0, mpWasted: 0 };
  const seen = new Set(), l3Tiles = new Set(), trail = [];
  try {
    for (let i = 0; i < (job.kind === 'pvp' ? 2500 : 6000); i++) {
      if (i > 0 && i % 100 === 0) console.log(JSON.stringify({ progress: true, faction: job.faction, seed: job.seed,
        version: job.version ?? me, step: i, round: state.round, ms: Date.now() - begun }));
      if (job.kind !== 'pvp' && state.round > 11) { row.termination = 'round-11-complete'; break; }
      if (state.combat?.outcome && !seen.has(state.combat.id)) {
        const c = state.combat; seen.add(c.id);
        if (c.context.kind === 'player') {
          row.pvpWinner = c.outcome.winnerPlayerId;
          if (c.attackerPlayerId === me || c.defenderPlayerId === me) { row.pvpFights++; if (c.outcome.winnerPlayerId === me) row.pvpWins++; }
          if (job.kind === 'pvp') { row.termination = 'pvp-outcome'; break; }
        } else if (c.attackerPlayerId === me) {
          if (c.outcome.winnerPlayerId === me) {
            row.neutralWins++;
            const f = state.adventure.fields[c.context.fieldId];
            if (f && f.difficulty >= 3 && state.adventure.tiles[f.tileInstanceId]?.group === 'far') {
              l3Tiles.add(f.tileInstanceId); row.firstL3FarWin ??= state.round;
              if (l3Tiles.size >= 2) row.secondL3FarWin ??= state.round;
            }
          } else if (c.outcome.reason === 'retreat') row.retreats++; else row.neutralLosses++;
        }
      }
      if (state.phase === 'game-over' && !state.combat) { row.termination = 'engine-game-over'; break; }
      const decisionStarted = performance.now();
      const run = runner.driveComputerPlayers(state, apply, { maxSteps: 1 });
      row.decisionMs.push(performance.now() - decisionStarted);
      if (!run.decisions.length) { row.termination = 'stalled'; row.reason = run.reason ?? 'No computer decision'; break; }
      for (const d of run.decisions) {
        if (job.trace && d.playerId === me) {
          if (state.combat && d.policy === 'combat.retreat-hopeless') fs.writeFileSync(`${resultFile}.retreat-${state.round}.json`, JSON.stringify(state));
          if (!state.combat && job.captureRound === state.round) fs.writeFileSync(`${resultFile}.state.json`, JSON.stringify(state));
          const h = Object.values(state.heroes).find(h => h.controllerId === me && h.kind === 'main');
          fs.appendFileSync(`${resultFile}.trace.jsonl`, JSON.stringify({ seed: job.seed, faction: job.faction,
            round: state.round, action: d.action, policy: d.policy, resources: state.players[me].resources,
            production: state.players[me].production,
            buildings: Object.values(state.towns).filter(town => town.controllerId === me).map(town => town.buildings),
            army: state.players[me].army.map(u => `${u.unitDefId}:${u.side}`),
            hero: h && {level:h.level, spaceId:h.spaceId, movementPoints:h.movementPoints},
            hand: state.players[me].hand, combat: Boolean(state.combat) }) + '\n');
        }
        trail.push({ round: state.round, action: d.action, policy: d.policy });
        if (trail.length > 60) trail.shift();
        if (d.playerId === me && ['CAST_SPELL', 'PLAY_CARD', 'PLAY_REACTION'].includes(d.action.type)) row.cardPlays++;
        if (d.playerId === me && d.action.type === 'POPULATION_ACTION') row.purchases.push({ round: state.round, purchases: d.action.purchases });
        if (d.playerId === me && d.action.type === 'HIRE_SECONDARY_HERO') row.secondaryHired ??= state.round;
        if (d.playerId === me && d.action.type === 'SPELL_BOOK_ACTION') row.spellBuys++;
        if (d.playerId === me && d.action.type === 'END_TURN' && !state.combat) row.mpWasted += Object.values(state.heroes)
          .filter(h => h.controllerId === me && h.kind === 'main').reduce((n, h) => n + (h.movementPoints ?? 0), 0);
      }
      const before = state.players[me].army.filter(u => u.side !== 'bank').length;
      state = run.state; row.actions++;
      const after = state.players[me].army.filter(u => u.side !== 'bank').length;
      if (after < before && !run.decisions.some(d => d.playerId === me && d.action.type === 'POPULATION_ACTION')) row.unitsLost += before - after;
      if (has(state, me, ['gold', 'azure'])) row.firstGold ??= state.round;
      if (state.players[me].army.some(u => u.side !== 'bank' && u.unitDefId === topGold)) row.firstTopGold ??= state.round;
      if (has(state, me, ['silver'])) row.firstSilver ??= state.round;
      const far = new Set(Object.values(state.adventure?.fields ?? {}).filter(f => f.flagOwnerId === me &&
        ['settlement', 'mine'].includes(f.location) && state.adventure.tiles[f.tileInstanceId]?.group === 'far').map(f => f.tileInstanceId));
      if (far.size) row.firstFar ??= state.round;
      if (far.size >= 2) row.secondFar ??= state.round;
    }
    row.termination ??= 'step-limit';
  } catch (error) { row.termination = 'error'; row.reason = error.stack; }
  row.finalRound = state.round; row.ms = Date.now() - begun;
  row.decisionMs.sort((a, b) => a - b);
  row.decisionP50Ms = row.decisionMs[Math.floor(row.decisionMs.length * 0.5)] ?? 0;
  row.decisionP95Ms = row.decisionMs[Math.floor(row.decisionMs.length * 0.95)] ?? 0;
  row.decisionMaxMs = row.decisionMs.at(-1) ?? 0;
  delete row.decisionMs;
  row.resources = state.players[me].resources;
  row.army = state.players[me].army.map(u => `${u.unitDefId}:${u.side}`);
  row.farOpened = state.adventure?.farTilesOpenedByPlayer?.[me] ?? 0;
  if (['stalled', 'error', 'step-limit'].includes(row.termination) || (job.kind !== 'pvp' && row.firstGold === null)) {
    const key = `${job.kind}-${job.faction}-${job.seed}-${job.version ?? me}`;
    fs.writeFileSync(path.join(output, `${key}-failure.json`), JSON.stringify({ row, trail, state }));
  }
  fs.appendFileSync(resultFile, JSON.stringify(row) + '\n');
  console.log(JSON.stringify(row));
}
