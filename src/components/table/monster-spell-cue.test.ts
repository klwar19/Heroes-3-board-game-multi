import { describe, expect, it } from "vitest";

import { MONSTER_SPELLS } from "@/data/anime/monster-spells";
import { spellFxPlans } from "@/data/fx";
import { createInitialGameState } from "@/engine";
import { resolveMonsterSpellRoundStart } from "@/engine/reducer";
import { unitZoomContent } from "./zoom";
import type { CombatUnitState, GameEvent, GameState, PlayerId } from "@/engine/state";
import {
  buildMonsterSpellCue,
  buildMonsterSpellCues,
  isMonsterSpellCastEvent
} from "./monster-spell-cue";

/**
 * Presentation contract for a PvE monster caster's automatic spell. The events
 * here are REAL — produced by the engine's own `resolveMonsterSpellRoundStart`
 * — so a change to the cast's message, its ability id or its `monsterSpellId`
 * handle fails these, not just a hand-built fixture.
 */

function sandbox(seed: string): GameState {
  const state = createInitialGameState(seed);
  state.players.p1.hand = [];
  state.players.p2.hand = [];
  state.combat!.dice.scriptedRolls = Array(40).fill(0);
  state.combat!.dice.rollCount = 0;
  return state;
}

function unit(
  id: string,
  controller: PlayerId,
  position: number,
  abilities: string[] = [],
  extra: Partial<CombatUnitState> = {}
): CombatUnitState {
  return {
    id,
    controllerId: controller,
    name: id,
    cardName: id,
    variant: "few",
    grade: "bronze",
    type: "ground",
    attack: 0,
    defense: 0,
    maxHealth: 30,
    damage: 0,
    initiative: 5,
    position,
    activatedThisRound: false,
    movedThisActivation: false,
    retaliatedThisRound: false,
    defenseToken: false,
    abilities,
    ...extra
  };
}

/** A sandbox whose neutral side fields the "Necrotic Litany" caster. */
function litanyFight(seed = "cue"): GameState {
  const state = sandbox(seed);
  const boss = unit("Bone Tyrant", "p2", 4, ["boss-spell-necrotic"]);
  const victim = unit("Pikemen", "p1", 13);
  state.combat!.units = { [boss.id]: boss, [victim.id]: victim };
  state.combat!.obstacles = [];
  return state;
}

function abilityEvents(state: GameState): Extract<GameEvent, { type: "UNIT_ABILITY_TRIGGERED" }>[] {
  return state.eventLog.filter(
    (event): event is Extract<GameEvent, { type: "UNIT_ABILITY_TRIGGERED" }> =>
      event.type === "UNIT_ABILITY_TRIGGERED"
  );
}

describe("monster spell cue (presentation)", () => {
  it("the engine's cast event carries the spell handle and is recognised", () => {
    const state = litanyFight();
    state.combat!.round = 1;
    resolveMonsterSpellRoundStart(state);
    const events = abilityEvents(state);
    expect(events).toHaveLength(1);
    // Round 1 of the Necrotic Litany rotation is Shadow Bolt.
    expect(events[0].abilityId).toBe("boss-spell-necrotic");
    expect(events[0].monsterSpellId).toBe("shadow_bolt");
    expect(isMonsterSpellCastEvent(events[0])).toBe(true);
  });

  it("builds a cue naming the spell, what it just did and what it always does", () => {
    const state = litanyFight();
    state.combat!.round = 1;
    resolveMonsterSpellRoundStart(state);
    const cue = buildMonsterSpellCue(abilityEvents(state)[0], state);
    expect(cue).toBeTruthy();
    expect(cue!.spellId).toBe("shadow_bolt");
    expect(cue!.spellName).toBe("Shadow Bolt");
    expect(cue!.casterName).toBe("Bone Tyrant");
    expect(cue!.casterUnitId).toBe("Bone Tyrant");
    expect(cue!.targetUnitId).toBe("Pikemen");
    expect(cue!.headline).toBe("Bone Tyrant casts Shadow Bolt");
    // The explanation is the engine's OWN message — it already says what happened.
    expect(cue!.detail).toContain("Spell damage to Pikemen");
    // ...and the printed rotation text says what the spell always does.
    expect(cue!.rulesText).toBe(MONSTER_SPELLS.shadow_bolt.text);
    // The sound is the reused H3 spell's, so the cue and the board FX agree.
    expect(cue!.soundKey).toBe(spellFxPlans["spell.magic_arrow"].sound);
  });

  it("follows the rotation across rounds (a different cue each round)", () => {
    const state = litanyFight("rotation");
    state.combat!.round = 1;
    resolveMonsterSpellRoundStart(state);
    state.combat!.round = 2;
    resolveMonsterSpellRoundStart(state);
    const cues = buildMonsterSpellCues(state.eventLog, state);
    expect(cues.map((cue) => cue.spellId)).toEqual(["shadow_bolt", "siphon_thought"]);
    expect(cues[1].headline).toBe("Bone Tyrant casts Siphon Thought");
    // Distinct event ids, so the page's seen-set never collapses two casts.
    expect(new Set(cues.map((cue) => cue.id)).size).toBe(2);
  });

  it("a self-targeted cast (Mend Flesh) still cues, anchored on the caster", () => {
    const state = litanyFight("heal");
    const boss = state.combat!.units["Bone Tyrant"];
    boss.damage = 5;
    state.combat!.round = 3; // third entry of the rotation
    resolveMonsterSpellRoundStart(state);
    const cue = buildMonsterSpellCue(abilityEvents(state)[0], state);
    expect(cue!.spellId).toBe("mend_flesh");
    expect(cue!.casterUnitId).toBe("Bone Tyrant");
    expect(cue!.targetUnitId).toBe("Bone Tyrant");
    expect(cue!.detail).toContain("heals");
  });

  it("CONTROL: an ordinary UNIT_ABILITY_TRIGGERED is NOT a monster cast", () => {
    const state = litanyFight("control");
    state.combat!.round = 1;
    resolveMonsterSpellRoundStart(state);
    const real = abilityEvents(state)[0];
    // Same event shape, an ordinary ability id and no spell handle.
    const ordinary = { ...real, abilityId: "death-stare", monsterSpellId: undefined };
    expect(isMonsterSpellCastEvent(ordinary)).toBe(false);
    expect(buildMonsterSpellCue(ordinary as GameEvent, state)).toBeNull();
    // The rotation ability WITHOUT the handle is refused too (both halves gate).
    expect(isMonsterSpellCastEvent({ ...real, monsterSpellId: undefined } as GameEvent)).toBe(false);
    // ...and the handle without a rotation ability is refused as well.
    expect(isMonsterSpellCastEvent({ ...real, abilityId: "death-stare" } as GameEvent)).toBe(false);
    // A non-ability event never qualifies.
    expect(isMonsterSpellCastEvent({ type: "DAMAGE_ASSIGNED" })).toBe(false);
    expect(buildMonsterSpellCues([{ type: "DAMAGE_ASSIGNED" } as GameEvent], state)).toEqual([]);
  });

  it("the boss card ALREADY reads out its whole rotation when inspected", () => {
    // §3 of the brief: verify, do not duplicate. The zoom builds its lines from
    // getUnitAbilityDefinitions, and the rotation ability's printed text is
    // generated from the spell table — so every spell is named on the card.
    const state = litanyFight("zoom");
    const lines = unitZoomContent(state.combat!.units["Bone Tyrant"]).lines.join(" ");
    expect(lines).toContain("Necrotic Litany");
    expect(lines).toContain("Shadow Bolt");
    expect(lines).toContain("Siphon Thought");
    expect(lines).toContain("Mend Flesh");
    expect(lines).toContain(MONSTER_SPELLS.shadow_bolt.text);
  });
});
