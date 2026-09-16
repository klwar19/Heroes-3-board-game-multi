import { register } from "node:module";
import assert from "node:assert/strict";
register("./lib/ts-resolver.mjs", import.meta.url);
const { createAdventureGameState } = await import("../src/engine/adventure-setup.ts");
const { applyAction } = await import("../src/engine/reducer.ts");
const { getLegalActions } = await import("../src/engine/legal-actions.ts");
const { observeForComputer } = await import("../src/engine/computer/observation.ts");
const { chooseComputerAction } = await import("../src/engine/computer/policy.ts");
const { policyLabDecisionOwner } = await import("../src/engine/computer/window.ts");
const { noteComputerAction } = await import("../src/engine/computer/memory.ts");
const { ATTACKER_FRONTLINE, ATTACKER_BACKLINE } = await import("../src/engine/adventure-reducer.ts");
function encounter(faction, guards, seed, necromancy = false) {
  const heroes = { castle: "catherine", stronghold: "crag_hack", necropolis: "vidomina" };
  let state = createAdventureGameState({ seed, difficulty: "impossible", events: false,
    rollFirstPlayer: false, sessionMode: "multiplayer", players: [
      { id: "p1", name: "Fighter", factionId: faction, heroDefId: heroes[faction] },
      { id: "p2", name: "Opponent", factionId: "castle", heroDefId: "catherine" }] });
  state.round = 4;
  state.activePlayerId = "p1";
  state.adventure.pendingTileChoice = null;
  state.adventure.pendingVisit = null;
  Object.assign(state.players.p1, { canMulligan: false, needsHandRefresh: false, canOpeningMulligan: false,
    hand: ["spell.magic_arrow", "stat.power", "stat.power", "stat.attack", "stat.knowledge"] });
  state.players.p1.army.forEach(u => u.side = "pack");
  if (necromancy) {
    state.players.p1.army.find(u => u.unitDefId === "necropolis.wraiths").side = "few";
    state.players.p1.hand = ["ability.necromancy", "stat.attack"];
    state.players.p1.resources.gold = 20;
  }
  const hero = state.heroes.hero_p1;
  hero.level = necromancy ? 1 : 3;
  state.players.p1.limits.expertUses = necromancy ? 0 : 1;
  hero.movementPoints = 3;
  state.adventure.houseRules = { ...state.adventure.houseRules, "polish-quick-combat": false };
  const move = getLegalActions(state, "p1").find(({action}) => action.type === "MOVE_HERO").action;
  Object.assign(state.adventure.fields[move.to], { location: necromancy ? "mine" : "settlement", difficulty: necromancy ? 1 : 3,
    flagOwnerId: null, blackCube: false, customGuardUnits: guards });
  let result = applyAction(state, move);
  assert.deepEqual(result.errors, []);
  state = result.state;
  const actions = [];
  const events = [];
  let deployed;
  for (let i = 0; i < 250 && (state.combat || necromancy &&
      (state.adventure.pendingNecromancy || state.pendingChoice || state.adventure.pendingVisit)); i++) {
    const owner = policyLabDecisionOwner(state);
    assert.ok(owner, "real combat must have an actionable owner");
    const id = typeof owner === "string" ? owner : owner.playerId;
    const decision = chooseComputerAction(observeForComputer(state, id), { learned: "none" });
    assert.ok(decision);
    actions.push(decision.action);
    const before = state;
    if (state.combat && Object.values(state.combat.units).filter(u => u.controllerId === "p1" && u.position >= 0).length >= 3 &&
        !deployed) deployed = structuredClone(state.combat);
    result = applyAction(state, decision.action, { entropy: `${seed}-${i}` });
    assert.deepEqual(result.errors, []);
    events.push(...result.events);
    state = noteComputerAction(result.state, id, decision.action, before);
  }
  assert.ok(!state.combat, "battle must resolve within the action budget");
  return { actions, events, state, deployed };
}
const retreat = encounter("castle", ["neutral.gorgons", "neutral.gorgons"], "two-armor");
assert.ok(retreat.actions.some(a => a.type === "RETREAT_FROM_COMBAT"));
assert.equal(retreat.actions.filter(a => ["PLAY_CARD", "CAST_SPELL", "PLAY_REACTION"].includes(a.type)).length, 0,
  "two armored guards must be left before any card spend");
const fight = encounter("castle", ["neutral.gorgons", "neutral.fire_elementals"], "armor-elemental");
const cast = fight.actions.find(a => a.type === "CAST_SPELL");
assert.equal(cast?.cardId, "spell.magic_arrow");
assert.match(cast.target.unitId, /gorgons/);
assert.ok(fight.events.some(e => e.type === "UNIT_REMOVED" && /gorgons/.test(e.unitId)));
const armoredDeath = fight.events.findIndex(e => e.type === "UNIT_REMOVED" && /gorgons/.test(e.unitId));
const firstStrike = fight.events.findIndex(e => e.type === "UNIT_ATTACK_DECLARED");
if (process.env.AI_DEBUG) console.log(JSON.stringify(fight.actions), JSON.stringify(fight.events.filter(e => ["UNIT_REMOVED", "UNIT_ATTACK_DECLARED", "SPELL_CAST_RESOLVED"].includes(e.type))));
assert.ok(firstStrike < 0 || armoredDeath < firstStrike, "powered Arrow must remove armor before the first physical strike");
assert.ok(fight.events.some(e => e.type === "COMBAT_ENDED" && e.winnerPlayerId === "p1"), "three Packs must win the mixed guard fight");
for (const faction of ["necropolis", "stronghold"]) {
  const run = encounter(faction, ["neutral.gorgons", "neutral.fire_elementals"], `mixed-${faction}`);
  assert.ok(run.events.some(e => e.type === "COMBAT_ENDED" && e.winnerPlayerId === "p1"), `${faction} must win mixed guards`);
  const id = faction === "necropolis" ? "necropolis.zombies" : "stronghold.orcs";
  const unit = Object.values(run.deployed.units).find(u => u.unitDefId === id);
  assert.ok(ATTACKER_FRONTLINE.includes(unit.position), `${id} must occupy the first row`);
}
const griffin = Object.values(fight.deployed.units).find(u => u.unitDefId === "castle.griffins");
assert.ok(ATTACKER_BACKLINE.includes(griffin.position), "Griffins must occupy the second row");
const earned = encounter("necropolis", ["neutral.sprites"], "home-necromancy", true);
assert.ok(earned.actions.some(a => a.type === "PLAY_CARD" && a.cardId === "ability.necromancy"));
assert.equal(earned.state.players.p1.army.find(u => u.unitDefId === "necropolis.wraiths").side, "pack",
  "the real opening victory must earn Wraith Pack through Necromancy");
console.log(JSON.stringify({ result: "PASS", retreatCards: 0, mixedFightWinner: "p1", actions: fight.actions.length }));
