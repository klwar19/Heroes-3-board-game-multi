// Opt-in real-engine checks for the planning changes. Never run on game startup.
import { register } from 'node:module';
import assert from 'node:assert/strict';
register('./lib/ts-resolver.mjs', import.meta.url);
const { createInitialGameState } = await import('../src/engine/setup.ts');
const { createAdventureGameState } = await import('../src/engine/adventure-setup.ts');
const { applyAction } = await import('../src/engine/reducer.ts');
const { observeForComputer } = await import('../src/engine/computer/observation.ts');
const { chooseComputerAction } = await import('../src/engine/computer/policy.ts');
const { secondaryHeroOpportunity } = await import('../src/engine/computer/secondary-plan.ts');
const { firstGoldMilestoneCost, goldMilestoneShortfall, rankedGoldUnits } = await import('../src/engine/computer/development.ts');
const { toPhantomCardId } = await import('../src/engine/phantom-cards.ts');
const { getLegalActions } = await import('../src/engine/legal-actions.ts');
const { addArmyUnit } = await import('../src/engine/adventure.ts');
const { strikeOutcomes } = await import('../src/engine/computer/planning-horizon.ts');
const { plannedAttackFaces } = await import('../src/engine/computer/battlefield-conditions.ts');
const { primaryMapObjective } = await import('../src/engine/computer/map-navigation.ts');

const selected = process.argv.find(arg => arg.startsWith('--case='))?.split('=')[1];
function check(name, fn) { if (!selected || selected === name) { fn(); console.log(`PASS ${name}`); } }
function apply(state, action, entropy = 'planning-check') {
  const result = applyAction(state, action, { entropy });
  assert.deepEqual(result.errors, [], JSON.stringify(action));
  return result.state;
}
function settle(state, policy = true) {
  for (let count = 0; state.reactionWindow; count++) {
    assert.ok(count < 30, 'reaction sequence must terminate');
    const id = state.reactionWindow.priorityPlayerId;
    const action = policy && id === 'p1'
      ? chooseComputerAction(observeForComputer(state, id), { learned: 'none' })?.action
      : { type: 'PASS_REACTION', playerId: id };
    assert.ok(action);
    state = apply(state, action);
  }
  return state;
}

check('phantom', () => {
  const run = (copies, counter) => {
    let state = createInitialGameState('phantom-preservation');
    state.eventCounter = counter;
    state.players.p1.hand = ['spell.magic_arrow', 'stat.power', ...copies];
    state.players.p2.hand = [];
    const target = state.combat.units.unit_p2_vampires;
    Object.assign(target, { abilities: [], variant: 'neutral', grade: 'gold', maxHealth: 3, damage: 0, defense: 2, attack: 9 });
    const observed = observeForComputer(state, 'p1');
    // Isolate equivalent casts; all offers still come from authoritative legality.
    observed.legalActions = observed.legalActions.filter(({ action }) => action.type === 'CAST_SPELL' && action.target?.unitId === target.id);
    const decision = chooseComputerAction(observed, { learned: 'none' });
    assert.ok(decision);
    state = settle(apply(state, decision.action));
    assert.ok(state.combat.units[target.id].damage >= state.combat.units[target.id].maxHealth, 'the actual powered spell must remove the target');
    return state;
  };
  const control = run([], 0);
  assert.ok(!control.players.p1.hand.includes('spell.magic_arrow'));
  for (let counter = 0; counter < 16; counter++) {
    const improved = run([toPhantomCardId('spell.magic_arrow'), toPhantomCardId('stat.power')], counter);
    assert.ok(improved.players.p1.hand.includes('spell.magic_arrow'), 'save the real Arrow while dealing the same lethal damage');
    assert.ok(improved.players.p1.hand.includes('stat.power'), 'save real Power after the phantom buys the kill');
  }
});

check('chain', () => {
  let state = createInitialGameState('chain-friendly-fire');
  const template = structuredClone(Object.values(state.combat.units)[0]);
  const unit = (id, owner, position, grade = 'bronze') => ({ ...structuredClone(template), id, controllerId: owner,
    unitDefId: undefined, variant: 'neutral', grade, type: 'ground', position, attack: 3, defense: 0,
    maxHealth: 8, damage: 0, abilities: [], activatedThisRound: false, movedThisActivation: false });
  state.combat.units = Object.fromEntries([
    unit('own1', 'p1', 0, 'gold'), unit('own2', 'p1', 1, 'gold'),
    unit('bait', 'p2', 4, 'gold'), unit('enemy1', 'p2', 14), unit('enemy2', 'p2', 18), unit('enemy3', 'p2', 19),
  ].map(u => [u.id, u]));
  state.combat.activeUnitId = 'own1';
  state.players.p1.hand = [toPhantomCardId('spell.chain_lightning')];
  state.players.p2.hand = [];
  const obs = observeForComputer(state, 'p1');
  obs.legalActions = obs.legalActions.filter(({ action }) => action.type === 'CAST_SPELL');
  const bad = obs.legalActions.find(({ action }) => action.target?.unitId === 'bait');
  assert.ok(bad, 'friendly-fire control is a legal cast');
  const finish = action => {
    let s = settle(apply(structuredClone(state), action), false);
    for (let i = 0; s.pendingChoice; i++) {
      assert.ok(i < 8);
      const decision = chooseComputerAction(observeForComputer(s, 'p1'), { learned: 'none' });
      assert.ok(decision);
      s = apply(s, decision.action);
    }
    return s;
  };
  const control = finish(bad.action);
  const friendlyDamage = s => ['own1', 'own2'].reduce((sum, id) => sum + s.combat.units[id].damage, 0);
  assert.ok(friendlyDamage(control) > 0, 'control must really hit our gold units');
  for (let counter = 0; counter < 16; counter++) {
    obs.state.eventCounter = counter;
    const chosen = chooseComputerAction(obs, { learned: 'none' });
    assert.ok(chosen?.action.type === 'CAST_SPELL');
    const improved = finish(chosen.action);
    assert.equal(friendlyDamage(improved), 0, 'choose a chain that spares our gold units');
    assert.ok(['enemy1', 'enemy2', 'enemy3'].every(id => improved.combat.units[id].damage > 0), 'all three enemy bolts must resolve');
  }
});

check('deadline', () => {
  const state = createAdventureGameState({ seed: 'deadline', difficulty: 'impossible', events: false, rollFirstPlayer: false });
  const id = 'p2';
  state.round = 7;
  const cost = firstGoldMilestoneCost(state, id);
  assert.ok(cost && cost.gold > 0);
  state.players[id].resources = { ...cost, gold: cost.gold - 10 };
  state.players[id].production = { gold: 10, buildingMaterials: 0, valuables: 0 };
  assert.equal(goldMilestoneShortfall(state, id).gold, 0);
  assert.equal(goldMilestoneShortfall(state, id, { gold: 1 }).gold, 1, 'an optional purchase must expose the actual R9 funding gap');
  state.round = 9;
  assert.equal(goldMilestoneShortfall(state, id).gold, 10, 'R11 income cannot fund a R9 deadline');
  addArmyUnit(state.players[id], rankedGoldUnits(state, id)[0], 'few');
  assert.equal(goldMilestoneShortfall(state, id).gold, 0, 'owned level-7 closes the milestone');
});

check('forced-die', () => {
  let state = createInitialGameState('forced-die-planning');
  state.players.p1.hand = []; state.players.p2.hand = [];
  const attacker = state.combat.units.unit_p1_griffins;
  const defender = state.combat.units.unit_p2_vampires;
  Object.assign(attacker, { attack: 6, abilities: [], position: 5 });
  Object.assign(defender, { defense: 2, maxHealth: 30, damage: 0, position: 9,
    variant: 'neutral', abilities: ['mummy-force-attacker-die'] });
  const forecast = strikeOutcomes(state, attacker, defender, attacker.position);
  const control = strikeOutcomes(state, attacker, { ...defender, abilities: [] }, attacker.position);
  assert.ok(Math.max(...control) > Math.min(...control), 'ordinary die must retain multiple outcomes');
  state = settle(apply(state, { type: 'ATTACK_UNIT', playerId: 'p1', attackerId: attacker.id, defenderId: defender.id }), false);
  const actualDamage = state.combat.units[defender.id].damage;
  assert.equal(actualDamage, 3, 'authoritative Mummy defense forces -1');
  assert.deepEqual([...new Set(forecast)], [actualDamage], 'planner must not expect a lucky roll against a forced die');
});

check('retaliation-die', () => {
  const actual = new Set();
  for (let roll = 0; roll < 12; roll++) {
    let state = createInitialGameState(`mummy-counter-planning-${roll}`);
    state.players.p1.hand = []; state.players.p2.hand = [];
    const attacker = state.combat.units.unit_p1_griffins;
    const defender = state.combat.units.unit_p2_vampires;
    Object.assign(attacker, { attack: 6, defense: 2, maxHealth: 30, damage: 0, abilities: [], position: 5 });
    Object.assign(defender, { attack: 6, defense: 2, maxHealth: 30, damage: 0, position: 9,
      variant: 'neutral', abilities: ['mummy-ignore-own-die'] });
    const mainFaces = plannedAttackFaces(state, defender, attacker);
    const counterFaces = plannedAttackFaces(state, defender, attacker, defender.position, true);
    assert.deepEqual(mainFaces, [0]);
    state = settle(apply(state, { type: 'ATTACK_UNIT', playerId: 'p1', attackerId: attacker.id, defenderId: defender.id }, `counter-${roll}`), false);
    const counterDamage = state.combat.units[attacker.id].damage;
    actual.add(counterDamage);
    assert.ok(counterFaces.some(face => 4 + face === counterDamage), 'forecast must include the actual retaliation die outcome');
  }
  assert.ok(actual.size > 1, 'engine control must demonstrate that Mummy retaliation really rolls');
});

check('elemental-die', () => {
  for (const zeroDie of [false, true]) {
    const damages = new Set();
    for (let roll = 0; roll < 12; roll++) {
      let state = createInitialGameState(`elemental-roll-${roll}`);
      state.adventure = createAdventureGameState({ seed: 'elemental-board', events: false }).adventure;
      state.adventure.houseRules['elemental-damage-no-die'] = true;
      state.adventure.houseRules['elemental-damage-zero-die'] = zeroDie;
      state.players.p1.hand = []; state.players.p2.hand = [];
      const attacker = state.combat.units.unit_p1_griffins;
      const defender = state.combat.units.unit_p2_vampires;
      Object.assign(attacker, { attack: 6, abilities: ['elemental-damage'], position: 5 });
      Object.assign(defender, { defense: 2, maxHealth: 30, damage: 0, position: 9, variant: 'neutral', abilities: [] });
      const forecast = strikeOutcomes(state, attacker, defender, attacker.position);
      state = settle(apply(state, { type: 'ATTACK_UNIT', playerId: 'p1', attackerId: attacker.id, defenderId: defender.id }), false);
      const damage = state.combat.units[defender.id].damage;
      damages.add(damage);
      assert.ok(forecast.includes(damage), 'elemental forecast must use the same independent die toggle as resolution');
    }
    if (zeroDie) assert.deepEqual([...damages], [6]);
    else assert.ok(damages.size > 1, 'blocking attack buffs must not disable the actual die');
  }
});

check('collector', () => {
  let state = createAdventureGameState({ seed: 'collector', difficulty: 'impossible', events: false, rollFirstPlayer: false });
  const player = state.players.p2;
  state.activePlayerId = 'p2';
  state.phase = 'adventure';
  state.adventure.pendingTileChoice = null;
  state.adventure.pendingVisit = null;
  player.needsHandRefresh = false; player.canMulligan = false; player.canOpeningMulligan = false;
  player.resources = { gold: 100, buildingMaterials: 20, valuables: 20 };
  player.army.forEach(u => u.side = 'pack');
  addArmyUnit(player, rankedGoldUnits(state, 'p2')[0], 'pack');
  const main = Object.values(state.heroes).find(h => h.controllerId === 'p2' && h.kind === 'main');
  main.spaceId = 'h:20:20';
  Object.values(state.heroes).filter(h => h.controllerId !== 'p2').forEach(h => h.spaceId = null);
  const town = Object.values(state.towns).find(t => t.controllerId === 'p2');
  const base = structuredClone(Object.values(state.adventure.fields)[0]);
  const field = (spaceId, location) => ({ ...base, spaceId, tileInstanceId: undefined, location, difficulty: 0,
    blackCube: false, flagOwnerId: null, customGuardUnits: undefined });
  town.fieldId = 'h:0:0';
  state.adventure.fields = Object.fromEntries(['h:0:0','h:1:0','h:2:0','h:3:0','h:-1:0','h:-2:0','h:-3:0']
    .map(id => [id, field(id, id === 'h:0:0' ? 'town' : id === 'h:3:0' || id === 'h:-3:0' ? 'treasure_symbol' : 'empty')]));
  state.adventure.fields['h:0:0'].flagOwnerId = 'p2';
  assert.equal(secondaryHeroOpportunity(state, 'p2', town.fieldId).worthwhile, false, 'opposite three-step jobs do not form a two-turn itinerary');
  state.adventure.fields['h:2:0'].location = 'treasure_symbol';
  const opportunity = secondaryHeroOpportunity(state, 'p2', town.fieldId);
  assert.ok(opportunity.worthwhile, 'two connected leftovers justify a collector');
  const legal = getLegalActions(state, 'p2');
  const hire = legal.find(({ action }) => action.type === 'HIRE_SECONDARY_HERO' && action.fieldId === town.fieldId);
  assert.ok(hire, 'engine must offer the hire');
  const obs = observeForComputer(state, 'p2');
  obs.legalActions = [hire, ...legal.filter(({ action }) => action.type === 'END_TURN')];
  const decision = chooseComputerAction(obs, { learned: 'none' });
  assert.equal(decision?.action.type, 'HIRE_SECONDARY_HERO');
  state = apply(state, decision.action);
  assert.ok(Object.values(state.heroes).some(h => h.controllerId === 'p2' && h.kind === 'secondary'));
  assert.equal(state.players.p2.resources.gold, 90, 'real hiring spends 10 gold');
  assert.equal(state.players.p2.townTokens.population, false, 'real hiring consumes Population');
});

check('route', () => {
  let state = createAdventureGameState({ seed: 'connected-payoffs', difficulty: 'impossible', events: false, rollFirstPlayer: false });
  state.round = 10; state.activePlayerId = 'p2'; state.phase = 'adventure';
  state.adventure.pendingTileChoice = null; state.adventure.pendingVisit = null;
  const player = state.players.p2;
  player.needsHandRefresh = false; player.canMulligan = false; player.canOpeningMulligan = false;
  player.army.forEach(unit => unit.side = 'pack');
  addArmyUnit(player, rankedGoldUnits(state, 'p2')[0], 'few');
  Object.values(state.heroes).forEach(hero => hero.spaceId = null);
  const hero = Object.values(state.heroes).find(hero => hero.controllerId === 'p2' && hero.kind === 'main');
  hero.spaceId = 'h:0:0'; hero.movementPoints = 3;
  const base = structuredClone(Object.values(state.adventure.fields)[0]);
  state.adventure.fields = {};
  for (let q = 0; q <= 3; q++) for (let r = 0; r <= 3; r++) {
    const spaceId = `h:${q}:${r}`;
    state.adventure.fields[spaceId] = { ...base, spaceId, tileInstanceId: undefined,
      location: ['h:2:0', 'h:3:0', 'h:0:2'].includes(spaceId) ? 'treasure_symbol' : 'empty',
      difficulty: 0, blackCube: false, flagOwnerId: null, customGuardUnits: undefined };
  }
  const objective = primaryMapObjective(state, hero);
  assert.equal(objective?.spaceId, 'h:2:0', 'prefer the equal-distance reward that leaves another collectible stop');
  const obs = observeForComputer(state, 'p2');
  obs.legalActions = obs.legalActions.filter(({ action }) => action.type === 'MOVE_HERO');
  const action = chooseComputerAction(obs, { learned: 'none' })?.action;
  assert.equal(action?.type, 'MOVE_HERO');
  assert.equal(action.to, 'h:1:0', 'first real step must follow the productive route');
  state = apply(state, action);
  assert.equal(state.heroes[hero.id].spaceId, 'h:1:0');
});
