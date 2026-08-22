/**
 * REGRESSION PIN — "Pack Griffins have 0 Defense again on a BINH table".
 *
 * `griffin-buff` (BINH `default: true`) gives the Pack of Griffins 1 Defense
 * (printed 0) and the Few +1 Attack. The rule has now been reported broken
 * TWICE, both times as a DISPLAY drift on a surface that read the printed scan
 * instead of the rules-applied side (`d95a9d71` fixed the in-play roster row;
 * the card-face zoom beside it re-introduced it — see
 * `town-recruit-shortcut.test.tsx`). The old engine coverage in
 * `house-rules.test.ts` could not tell the two apart: it only ever asserted the
 * minted `unit.defense` FIELD, and only with an EXPLICIT flag, so neither a
 * broken consumer nor a flipped BINH default would have failed it.
 *
 * Everything here therefore asserts the OBSERVABLE outcome — how much damage a
 * scripted Attack-4 blow actually lands on the Pack — through the real
 * `ATTACK_UNIT` pipeline, on a BINH table with NO explicit house-rule flag set
 * (the shipped default), with a rule-off CONTROL that diverges.
 */
import { describe, expect, it } from "vitest";
import {
  applyAction,
  createAdventureGameState,
  createInitialGameState,
  makeCombatUnitFromArmy,
  type GameAction,
  type GameState,
  type HouseRuleId,
  type PlayerId
} from "./index";
import { unitSideRuleOverrides } from "./ruleset";
import { applyUnitCurrentSide } from "./unit-transforms";

const ATTACKER = "unit_p1_marksmen";
const DEFENDER = "unit_p2_skeletons";

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function settle(state: GameState): GameState {
  let current = state;
  let safety = 80;
  while (safety > 0 && (current.reactionWindow || current.pendingChoice?.type === "ATTACK_DIE_REROLL")) {
    safety -= 1;
    if (current.reactionWindow) {
      current = applyOk(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
      continue;
    }
    const choice = current.pendingChoice;
    if (choice?.type === "ATTACK_DIE_REROLL") {
      current = applyOk(current, {
        type: "CHOOSE_PENDING_ROLL",
        playerId: choice.playerId,
        choiceId: choice.id,
        candidateIndex: 0
      });
    }
  }
  return current;
}

/** A table with the given explicit toggles; `{}` = the shipped mode defaults. */
function tableWith(
  ruleset: "binh" | "legacy",
  houseRules: Partial<Record<HouseRuleId, boolean>>,
  seed = "griffin-pack"
): GameState {
  return createAdventureGameState({
    seed,
    ruleset,
    rollFirstPlayer: false,
    houseRules,
    players: [
      { id: "p1", name: "Catherine", factionId: "castle", heroDefId: "catherine" },
      { id: "p2", name: "Gelu", factionId: "rampart", heroDefId: "gelu" }
    ]
  });
}

/** The Pack of Griffins the ENGINE would field on that table. */
function mintPackGriffin(table: GameState) {
  return makeCombatUnitFromArmy(
    { id: "griffins", unitDefId: "castle.griffins", side: "pack" },
    "p2",
    DEFENDER,
    10,
    table.ruleset ?? "legacy",
    unitSideRuleOverrides(table)
  )!;
}

/**
 * Damage a scripted Attack-4 blow (die "0") really lands on that table's Pack of
 * Griffins. Defense 1 ⇒ 3 damage; the printed Defense 0 ⇒ 4.
 */
function damageOnPackGriffin(table: GameState, seed: string): number {
  const state = createInitialGameState(seed);
  state.players.p1.hand = [];
  state.players.p2.hand = [];
  state.combat!.dice.scriptedRolls = Array.from({ length: 40 }, () => 0);
  state.combat!.dice.rollCount = 0;
  for (const unit of Object.values(state.combat!.units)) {
    Object.assign(unit, { abilities: [], attack: 0, defense: 0, maxHealth: 60, damage: 0, position: 0 });
  }
  Object.assign(state.combat!.units[ATTACKER], {
    position: 9,
    controllerId: "p1",
    abilities: [],
    attack: 4,
    defense: 0,
    maxHealth: 60,
    damage: 0,
    type: "ground"
  });
  // The REAL minted card fights: its stats, abilities and type come straight
  // from makeCombatUnitFromArmy on the table under test.
  Object.assign(state.combat!.units[DEFENDER], mintPackGriffin(table), {
    id: DEFENDER,
    controllerId: "p2",
    position: 10,
    maxHealth: 60,
    damage: 0
  });

  state.activePlayerId = "p1" as PlayerId;
  state.combat!.activeUnitId = ATTACKER;
  const settled = settle(
    applyOk(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId: ATTACKER, defenderId: DEFENDER })
  );
  return settled.combat!.units[DEFENDER].damage;
}

describe("griffin-buff: a BINH Pack of Griffins really fights at 1 Defense", () => {
  it("BINH DEFAULT (no explicit flag) soaks one more damage than the printed card [MUTATION-CHECK]", () => {
    // The shipped BINH table — exactly what a player gets without touching a
    // single toggle. Attack 4 − Defense 1 = 3.
    expect(damageOnPackGriffin(tableWith("binh", {}), "binh-default")).toBe(3);
    // CONTROL: the same blow on the same board with the rule switched OFF.
    expect(damageOnPackGriffin(tableWith("binh", { "griffin-buff": false }), "binh-off")).toBe(4);
    // CONTROL: the BASE GAME plays the printed card (no legacyDefault).
    expect(damageOnPackGriffin(tableWith("legacy", {}), "legacy-default")).toBe(4);
    // Delete the `griffin-buff` PACK arm in applyUnitSideRules — or stop
    // threading `unitSideRuleOverrides` into the mint — and line 1 reads 4.
  });

  it("the Community Balance pack delivers the same 1 Defense with griffin-buff OFF", () => {
    // The sheet's Units tab gives BOTH Griffin sides 1 Defense, independent of
    // the older toggle (composition is deliberate — see applyUnitSideRules).
    const community = tableWith("binh", { "griffin-buff": false, "community-card-balance": true });
    expect(damageOnPackGriffin(community, "community-on")).toBe(3);
  });

  it("survives a mid-combat printed-side RECOMPUTE (the consumer, not just the mint)", () => {
    // applyUnitCurrentSide re-derives the printed side after a Stack-Token
    // absorb / cover removal. It must re-apply the house rule, or a Pack that
    // took a lethal-blow absorb would silently drop back to Defense 0.
    const table = tableWith("binh", {});
    const unit = mintPackGriffin(table);
    expect(unit.defense).toBe(1);
    applyUnitCurrentSide(unit, table.ruleset ?? "legacy", unitSideRuleOverrides(table));
    expect(unit.defense).toBe(1);

    const off = tableWith("binh", { "griffin-buff": false });
    const bare = mintPackGriffin(off);
    applyUnitCurrentSide(bare, off.ruleset ?? "legacy", unitSideRuleOverrides(off));
    expect(bare.defense, "CONTROL: rule off recomputes to the printed 0").toBe(0);
  });
});
