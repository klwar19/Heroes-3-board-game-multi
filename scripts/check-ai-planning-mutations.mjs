// Opt-in mutations stay inside child-process module loading, never live files.
import { register } from 'node:module';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
const cases = {
  phantom: ['policy', '!(phantomPlays.size > 0 && phantomPlays.has(canonicalActionKey(legal.action)))', 'true'],
  chain: ['card-policy', 'if (effect.type === "CHAIN_LIGHTNING" && target?.type === "unit")', 'if (false && effect.type === "CHAIN_LIGHTNING" && target?.type === "unit")'],
  deadline: ['development', 'const deadline = state.round <= 9 ? 9 : state.round + 2;', 'const deadline = state.round + 4;'],
  collector: ['secondary-plan', 'const second = jobs.some(next => next !== first &&', 'const second = jobs.length >= 2 || jobs.some(next => next !== first &&'],
  'forced-die': ['battlefield-conditions', 'if (forced !== null) return [forced];', 'if (false && forced !== null) return [forced];'],
  'retaliation-die': ['battlefield-conditions', '!retaliation && hasIgnoreOwnAttackDie(attacker)', 'hasIgnoreOwnAttackDie(attacker)'],
  'elemental-die': ['battlefield-conditions', 'houseRuleEnabled(state, "elemental-damage-zero-die")', 'houseRuleEnabled(state, "elemental-damage-no-die")'],
  route: ['map-navigation', 'for (const entry of ranked.slice(0, 4))', 'for (const entry of ranked.slice(0, 0))'],
};
const selected = process.argv[2];
if (selected) {
  const [file, needle, replacement] = cases[selected];
  register(`data:text/javascript,${encodeURIComponent(`
    import { readFile } from 'node:fs/promises';
    export async function load(url, context, next) {
      if (url.endsWith('/computer/${file}.ts')) {
        const source = await readFile(new URL(url), 'utf8');
        if (!source.includes(${JSON.stringify(needle)})) throw new Error('Mutation target missing');
        return { format: 'module-typescript', shortCircuit: true,
          source: source.replace(${JSON.stringify(needle)}, ${JSON.stringify(replacement)}) };
      }
      return next(url, context);
    }
  `)}`, import.meta.url);
  process.argv.push(`--case=${selected}`);
  await import('./check-ai-planning.mjs');
} else {
  for (const name of Object.keys(cases)) {
    const healthy = spawnSync(process.execPath, ['scripts/check-ai-planning.mjs', `--case=${name}`], { encoding: 'utf8' });
    assert.equal(healthy.status, 0, `${name} must pass before mutation: ${healthy.stderr}`);
    const broken = spawnSync(process.execPath, ['scripts/check-ai-planning-mutations.mjs', name], { encoding: 'utf8' });
    assert.notEqual(broken.status, 0, `${name} test must detect removed behavior`);
    assert.match(broken.stderr, /AssertionError/, `${name} must fail a behavior assertion, not loading`);
    console.log(`PASS mutation ${name}`);
  }
}
