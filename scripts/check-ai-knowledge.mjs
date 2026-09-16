import { register } from "node:module";
import assert from "node:assert/strict";
register("./lib/ts-resolver.mjs", import.meta.url);
const { createInitialGameState } = await import("../src/engine/setup.ts");
const { applyAction } = await import("../src/engine/reducer.ts");
const { observeForComputer } = await import("../src/engine/computer/observation.ts");
const { chooseComputerAction } = await import("../src/engine/computer/policy.ts");
function trial(expertAllowed) {
  let state = createInitialGameState("knowledge-combo");
  state.players.p1.hand = ["spell.magic_arrow", "spell.magic_arrow", "stat.power", "stat.power", "stat.knowledge"];
  state.players.p2.hand = [];
  // An existing extra slot is the old policy's crown-preservation case.
  // Useful expert Knowledge must still permit a third cast after recall.
  state.players.p1.combatStats.spellLimitBonusThisRound = 1;
  const apply = action => {
    const result = applyAction(state, action);
    assert.deepEqual(result.errors, []);
    state = result.state;
  };
  const target = state.combat.units.unit_p2_vampires;
  Object.assign(target, { abilities: [], variant: "neutral", unitDefId: "neutral.steel_golems", grade: "silver", maxHealth: 3, damage: 0, defense: 2, attack: 5 });
  const opening = chooseComputerAction(observeForComputer(state, "p1"), { learned: "none" });
  assert.equal(opening?.action.type, "CAST_SPELL", "AI must choose the spell over board actions");
  assert.equal(opening.action.target?.unitId, target.id, "AI must target the removable armored silver");
  apply(opening.action);
  const actions = [];
  for (let i = 0; state.reactionWindow; i++) {
    assert.ok(i < 30);
    const id = state.reactionWindow.priorityPlayerId;
    let decision;
    if (id === "p1") {
      const observation = observeForComputer(state, id);
      if (!expertAllowed) observation.legalActions = observation.legalActions.filter(({action}) =>
        !(action.type === "PLAY_REACTION" && action.cardId === "stat.knowledge" && action.mode === "expert"));
      decision = chooseComputerAction(observation, { learned: "none" });
    }
    const action = decision?.action ?? { type: "PASS_REACTION", playerId: id };
    actions.push(action);
    apply(action);
  }
  const stats = structuredClone(state.players.p1.combatStats);
  const defeated = state.combat.units[target.id];
  const extraCast = observeForComputer(state, "p1").legalActions.find(({action}) =>
    action.type === "CAST_SPELL" && action.cardId === "spell.magic_arrow" && action.target?.type === "unit" &&
    action.target.unitId !== target.id);
  let extraDamage = 0;
  if (extraCast) {
    const id = extraCast.action.target.unitId;
    const before = state.combat.units[id].damage;
    apply(extraCast.action);
    while (state.reactionWindow) apply({ type: "PASS_REACTION", playerId: state.reactionWindow.priorityPlayerId });
    extraDamage = state.combat.units[id].damage - before;
  }
  const third = observeForComputer(state, "p1").legalActions.find(({action}) =>
    action.type === "CAST_SPELL" && action.cardId === "spell.magic_arrow" && action.target?.type === "unit");
  if (third) {
    apply(third.action);
    while (state.reactionWindow) apply({ type: "PASS_REACTION", playerId: state.reactionWindow.priorityPlayerId });
  }
  return { actions, stats, target: defeated, castAvailable: Boolean(extraCast), extraDamage,
    thirdResolved: Boolean(third) && state.players.p1.combatStats.spellsCastThisRound === 3 };
}
const enabled = trial(true);
const control = trial(false);
assert.ok(enabled.actions.some(a => a.type === "PLAY_REACTION" && a.cardId === "stat.knowledge" && a.mode === "expert"));
assert.ok(enabled.actions.some(a => a.type === "PLAY_REACTION" && a.cardId === "stat.power"));
assert.ok(!enabled.target || enabled.target.damage >= enabled.target.maxHealth || enabled.target.position < 0,
  "Arrow and actual Power reactions must defeat the dangerous target");
assert.notDeepEqual(enabled.stats, control.stats, "expert Knowledge must change real spell capacity");
assert.equal(control.thirdResolved, false, "basic recall must not grant a third spell slot");
assert.equal(enabled.thirdResolved, true, "expert Knowledge must resolve the third spell");
assert.ok(enabled.extraDamage > 0, "expert Knowledge must enable a second real damaging Arrow");
console.log(JSON.stringify({ result: "PASS", expert: enabled.stats, basicControl: control.stats,
  extraCastOffered: enabled.castAvailable, actions: enabled.actions }));
