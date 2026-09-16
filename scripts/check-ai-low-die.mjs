import { register } from "node:module";
import assert from "node:assert/strict";
register("./lib/ts-resolver.mjs", import.meta.url);
const { createInitialGameState } = await import("../src/engine/setup.ts");
const { applyAction } = await import("../src/engine/reducer.ts");
const { observeForComputer } = await import("../src/engine/computer/observation.ts");
const { chooseComputerAction } = await import("../src/engine/computer/policy.ts");
function trial(usePolicy, entropy) {
  let state = createInitialGameState("attack-low-die");
  state.players.p1.hand = ["stat.attack"];
  state.players.p2.hand = [];
  const attacker = state.combat.units.unit_p1_griffins;
  const defender = state.combat.units.unit_p2_vampires;
  Object.assign(attacker, { attack: 6, abilities: [], position: 5 });
  Object.assign(defender, { defense: 2, maxHealth: 8, damage: 0, position: 9,
    abilities: ["nix-damage-cap"], variant: "neutral" });
  const events = [];
  const apply = action => {
    const result = applyAction(state, action, { entropy });
    assert.deepEqual(result.errors, []);
    events.push(...result.events);
    state = result.state;
  };
  apply({ type: "ATTACK_UNIT", playerId: "p1", attackerId: attacker.id, defenderId: defender.id });
  const actions = [];
  for (let i = 0; state.reactionWindow; i++) {
    assert.ok(i < 30);
    const id = state.reactionWindow.priorityPlayerId;
    const action = usePolicy && id === "p1"
      ? chooseComputerAction(observeForComputer(state, id), { learned: "none" })?.action
      : { type: "PASS_REACTION", playerId: id };
    assert.ok(action);
    actions.push(action);
    apply(action);
  }
  return { damage: state.combat.units[defender.id].damage, actions, events };
}
let control;
let entropy;
for (let i = 0; i < 30; i++) {
  entropy = `negative-die-${i}`;
  control = trial(false, entropy);
  if (control.damage === 3) break;
}
assert.equal(control.damage, 3, "find a real -1 attack die under the damage cap");
const improved = trial(true, entropy);
for (const result of [control, improved]) assert.equal(result.events.find(e =>
  e.type === "ATTACK_ROLLED" && e.attackerId === "unit_p1_griffins")?.roll, -1);
assert.ok(improved.actions.some(a => a.type === "PLAY_REACTION" && a.cardId === "stat.attack"));
assert.equal(improved.damage, 4, "Attack must protect capped damage against the actual -1 roll");
console.log("PASS: same -1 die deals 3 without Attack, 4 with the AI's Attack reaction.");
