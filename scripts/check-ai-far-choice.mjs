// Explicit, focused real-engine check. Never invoked by build or live rooms.
import { register } from "node:module";
import assert from "node:assert/strict";
register("./lib/ts-resolver.mjs", import.meta.url);
const { createAdventureGameState } = await import("../src/engine/adventure-setup.ts");
const { applyAction } = await import("../src/engine/reducer.ts");
const { observeForComputer } = await import("../src/engine/computer/observation.ts");
const { chooseComputerAction } = await import("../src/engine/computer/policy.ts");
const apply = (state, action) => {
  const result = applyAction(state, action);
  assert.deepEqual(result.errors, []);
  return result.state;
};
// A one-tile pool cannot offer a reroll. Set the pending candidate through a
// real two-tile draw with controlled entropy, then let the policy resolve it.
function trial(rerolls, mutation = false) {
  let state = createAdventureGameState({ seed: "ai-far-choice", difficulty: "normal", events: false,
    rollFirstPlayer: false, houseRules: { "far-tile-rerolls": rerolls } });
  state = apply(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
  state.heroes.hero_p1.spaceId = "h:7:2";
  state.heroes.hero_p1.movementPoints = 5;
  state.adventure.farTilePool = ["#F4", "F4"];
  const base = state;
  for (let i = 0; i < 20; i++) {
    const result = applyAction(base, { type: "PLACE_TILE", playerId: "p1", heroId: "hero_p1",
      supplyIndex: 0, centerRow: 6, centerCol: 4 }, { entropy: `ore-${i}` });
    assert.deepEqual(result.errors, []);
    const flip = result.state.adventure.pendingFarTileFlip;
    const pending = result.state.adventure.pendingTileChoice;
    const id = flip?.candidate ?? result.state.adventure.tiles[pending?.tileInstanceId]?.tileDefId;
    if (id === "#F4") { state = result.state; break; }
  }
  assert.notEqual(state, base, "must actually draw ore");
  let steps = 0;
  while (state.pendingChoice?.context === "far-tile-flip") {
    assert.ok(++steps < 5);
    const observation = observeForComputer(state, "p1");
    if (mutation) {
      // Remove the new policy's structured input: the old label policy keeps
      // the current ore at the final pick. The outcome assertion must fail.
      observation.state.adventure.pendingFarTileFlip = null;
    }
    const decision = chooseComputerAction(observation, { learned: "none" });
    assert.ok(decision);
    state = apply(state, decision.action);
  }
  const tileId = state.adventure.pendingTileChoice.tileInstanceId;
  const rotate = observeForComputer(state, "p1").legalActions.find(a => a.action.type === "SET_TILE_ROTATION");
  assert.ok(rotate);
  state = apply(state, rotate.action);
  return Object.values(state.adventure.fields).some(f => f.tileInstanceId === tileId && f.location === "mine" && f.resource === "gold");
}
assert.equal(trial(false), false, "rule-off CONTROL keeps the ore tile");
assert.equal(trial(true), true, "AI must place a real Gold mine after the legal ore redraw");
assert.throws(() => assert.equal(trial(true, true), true), { name: "AssertionError" }, "removing the policy must break the Gold mine outcome");
console.log("PASS: real tile placement, legal ore redraw, Gold mine materialization; rule-off control and policy mutation discriminate.");
