// Opt-in component comparison against the frozen baseline; no source edits.
import { register } from 'node:module';
const variant = process.argv[2];
const groups = {
  'baseline-map': ['map-navigation', 'map-policy', 'development', 'secondary-plan'],
  'baseline-combat': ['card-policy', 'choice-policy', 'decision-planning', 'planning-horizon', 'battlefield-conditions'],
  'no-fallback': [],
  'no-dice-reserve': [],
  'no-funding-route': [],
};
if (!groups[variant]) throw new Error('Unknown planning comparison');
process.argv.splice(2, 1);
register(`data:text/javascript,${encodeURIComponent(`
  import { readFile } from 'node:fs/promises';
  const names = ${JSON.stringify(groups[variant])};
  export async function load(url, context, next) {
    if (url.endsWith('/computer/map-navigation.ts') && ${JSON.stringify(variant)} === 'no-funding-route') {
      const source = await readFile(new URL(url), 'utf8');
      return { format: 'module-typescript', shortCircuit: true, source: source.replace('value += fundingBonus;', 'value += 0;') };
    }
    if (url.endsWith('/computer/decision-planning.ts') && ['no-fallback', 'no-dice-reserve'].includes(${JSON.stringify(variant)})) {
      let source = await readFile(new URL(url), 'utf8');
      source = ${JSON.stringify(variant)} === 'no-fallback'
        ? source.replace('if (budget.remaining < 0) {', 'if (budget.remaining < 0) { return;')
        : source.replace('usefulDamage(ally, enemy, from) > 0 ? Math.min(...strikeOutcomes(state, ally, enemy, from)) : 0', 'usefulDamage(ally, enemy, from)');
      return { format: 'module-typescript', shortCircuit: true, source };
    }
    if (names.some(name => url.endsWith('/computer/' + name + '.ts'))) {
      return { format: 'module-typescript', shortCircuit: true,
        source: await readFile(new URL(url.replace('/computer/', '/computer-baseline/')), 'utf8') };
    }
    return next(url, context);
  }
`)}`, import.meta.url);
await import('./validate-ai-gold-pvp.mjs');
