// User-requested focused engine check: policy target -> cast -> real damage.
import { register } from "node:module";
import assert from "node:assert/strict";
register("./lib/ts-resolver.mjs", import.meta.url);
const { createInitialGameState } = await import("../src/engine/setup.ts");
const { applyAction } = await import("../src/engine/reducer.ts");
const { observeForComputer } = await import("../src/engine/computer/observation.ts");
const { chooseComputerAction } = await import("../src/engine/computer/policy.ts");
function trial(ward, mutation = false) {
  let state = createInitialGameState("ai-ward-control");
  state.players.p1.hand = ["spell.magic_arrow"];
  state.players.p2.hand = [];
  const protectedId = "unit_p2_vampires";
  const openId = "unit_p2_skeletons";
  Object.assign(state.combat.units[protectedId], { abilities: ward ? ["reduce-spell-and-specialty-damage-2"] : [],
    defense: 10, attack: 10, maxHealth: 1, damage: 0 });
  Object.assign(state.combat.units[openId], { abilities: [], defense: 0, attack: 1, maxHealth: 2, damage: 0 });
  const observation = observeForComputer(state, "p1");
  observation.legalActions = observation.legalActions.filter(({ action }) => action.type === "CAST_SPELL" &&
    action.cardId === "spell.magic_arrow" && action.target?.type === "unit" && [protectedId, openId].includes(action.target.unitId));
  assert.equal(observation.legalActions.length, 2, "both targets must be real legal cast actions");
  if (mutation) observation.state.combat.units[protectedId].abilities = [];
  const decision = chooseComputerAction(observation, { learned: "none" });
  assert.ok(decision);
  const apply = action => {
    const result = applyAction(state, action);
    assert.deepEqual(result.errors, []);
    state = result.state;
  };
  apply(decision.action);
  for (let n = 0; state.reactionWindow; n++) {
    assert.ok(n < 20);
    apply({ type: "PASS_REACTION", playerId: state.reactionWindow.priorityPlayerId });
  }
  return { target: decision.action.target.unitId,
    damage: state.combat.units[openId].damage + state.combat.units[protectedId].damage };
}
assert.equal(trial(false).target, "unit_p2_vampires", "CONTROL: take the lethal hit without a ward");
assert.equal(trial(true).target, "unit_p2_skeletons", "warded target must not attract a wasted Arrow");
assert.ok(trial(true).damage > 0, "real spell must deal damage");
assert.throws(() => assert.ok(trial(true, true).damage > 0), { name: "AssertionError" },
  "ignoring the ward in policy must fail the real-damage assertion");
console.log("PASS: AI avoids a zero-damage Arrow; real damage, no-ward control, and ward-blind policy mutation discriminate.");
