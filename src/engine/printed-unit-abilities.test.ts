import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { coreUnitDefinitions } from "@/data/factions/units";
import { applyAction, createInitialGameState, tokenDefenseDelta } from "./index";
import type { GameAction, GameEvent, GameState, PlayerId } from "./state";

/**
 * Coverage for the printed unit abilities wired in this batch: paralysis
 * immunity, the "Hatred" attack bonus, attack-die-conditioned defense/attack
 * bonuses, Manticore defense-ignore, Wyvern sting, Rust Dragon acid and Gorgon
 * death stare. Each test drives a single ranged attack (Marksmen at a
 * non-adjacent target → no Retaliation Attack) so the resolved damage is
 * deterministic.
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function passAllReactions(state: GameState): GameState {
  let current = state;
  let safety = 30;
  while (current.reactionWindow && safety > 0) {
    safety -= 1;
    current = applyOk(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
  }
  return current;
}

/** Pass instant windows and keep the original attack roll (decline rerolls). */
function settle(state: GameState): GameState {
  let current = state;
  let safety = 40;
  while (safety > 0 && (current.reactionWindow || current.pendingChoice?.type === "ATTACK_DIE_REROLL")) {
    safety -= 1;
    if (current.reactionWindow) {
      current = passAllReactions(current);
      continue;
    }
    const choice = current.pendingChoice;
    if (choice?.type === "ATTACK_DIE_REROLL") {
      current = applyOk(current, {
        type: "CHOOSE_PENDING_ROLL",
        playerId: choice.playerId,
        choiceId: choice.id,
        candidateIndex: choice.candidates.length - 1
      });
    }
  }
  return current;
}

function setActive(state: GameState, playerId: PlayerId, unitId: string): void {
  state.activePlayerId = playerId;
  state.combat!.activeUnitId = unitId;
}

function script(state: GameState, rolls: number[]): void {
  state.combat!.dice.scriptedRolls = rolls;
  state.combat!.dice.rollCount = 0;
}

/**
 * A clean ranged duel: the p1 Marksmen (attack 3) shoot the p2 Skeletons from a
 * non-adjacent space. The caller tweaks abilities/stats on either unit, scripts
 * the dice and reads the result. Hands are emptied so no instants interfere.
 */
function rangedDuel(options: {
  attackerAbilities?: string[];
  attackerAttack?: number;
  defenderAbilities?: string[];
  defenderDefense?: number;
  defenderDefenseToken?: boolean;
  defenderName?: string;
  defenderMaxHealth?: number;
  defenderVariant?: "few" | "pack";
  rolls: number[];
}): GameState {
  const state = createInitialGameState();
  const attacker = state.combat!.units.unit_p1_marksmen;
  attacker.abilities = options.attackerAbilities ?? [];
  attacker.attack = options.attackerAttack ?? 3;
  attacker.position = 1;

  const defender = state.combat!.units.unit_p2_skeletons;
  defender.abilities = options.defenderAbilities ?? [];
  defender.position = 13; // non-adjacent → ranged shot, no retaliation
  defender.defense = options.defenderDefense ?? 0;
  defender.defenseToken = options.defenderDefenseToken ?? false;
  defender.maxHealth = options.defenderMaxHealth ?? 20;
  defender.damage = 0;
  if (options.defenderName) {
    defender.name = options.defenderName;
  }
  if (options.defenderVariant) {
    defender.variant = options.defenderVariant;
  }

  state.players.p1.hand = [];
  state.players.p2.hand = [];
  script(state, options.rolls);
  setActive(state, "p1", "unit_p1_marksmen");

  return settle(
    applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_marksmen",
      defenderId: "unit_p2_skeletons"
    })
  );
}

function defenderDamage(state: GameState): number {
  return state.combat!.units.unit_p2_skeletons?.damage ?? -1;
}

function defenderTokens(state: GameState, kind: string): number[] {
  return (state.combat!.units.unit_p2_skeletons?.tokens ?? [])
    .filter((token) => token.kind === kind)
    .map((token) => token.amount);
}

function hasParalysis(state: GameState): boolean {
  return (state.combat?.units.unit_p2_skeletons?.tokens ?? []).some((token) => token.kind === "paralysis");
}

function abilityMessages(state: GameState): string[] {
  return state.eventLog
    .filter((event): event is Extract<GameEvent, { type: "UNIT_ABILITY_TRIGGERED" }> => event.type === "UNIT_ABILITY_TRIGGERED")
    .map((event) => event.message);
}

function removedUnitIds(state: GameState): string[] {
  return state.eventLog
    .filter((event): event is Extract<GameEvent, { type: "UNIT_REMOVED" }> => event.type === "UNIT_REMOVED")
    .map((event) => event.unitId);
}

function abilityEventIds(state: GameState): string[] {
  return state.eventLog
    .filter((event): event is Extract<GameEvent, { type: "UNIT_ABILITY_TRIGGERED" }> => event.type === "UNIT_ABILITY_TRIGGERED")
    .map((event) => event.abilityId);
}

describe("Neutral Halfling — twin Attack dice", () => {
  it("carries both the advantage-roll and ignore-penalty abilities", () => {
    const abilities = coreUnitDefinitions["neutral.halflings"].neutral?.abilities ?? [];
    expect(abilities).toContain("attack-roll-advantage");
    expect(abilities).toContain("ignore-all-combat-penalties");
  });

  it("rolls two Attack dice and resolves the higher one", () => {
    // rolls -1 then +1: the advantage roll keeps +1 → attack 3 + 1 = 4 damage.
    const resolved = rangedDuel({
      attackerAbilities: coreUnitDefinitions["neutral.halflings"].neutral?.abilities ?? [],
      rolls: [-1, 1]
    });
    expect(defenderDamage(resolved)).toBe(4);
    expect(
      resolved.eventLog.find(
        (event): event is Extract<GameEvent, { type: "UNIT_ATTACK_DECLARED" }> => event.type === "UNIT_ATTACK_DECLARED"
      )?.rollMode
    ).toBe("advantage");
  });
});

describe("Neutral roster card art", () => {
  const neutralUnits = Object.values(coreUnitDefinitions).filter((def) => def.neutral);
  const assetPath = (src: string) => fileURLToPath(new URL(`../../public${src}`, import.meta.url));

  it("wires a card image for every neutral unit", () => {
    const missing = neutralUnits.filter((def) => !def.neutral?.cardImage).map((def) => def.id);
    expect(missing).toEqual([]);
  });

  it("every referenced neutral card image exists on disk", () => {
    const broken = neutralUnits
      .map((def) => def.neutral!.cardImage as string)
      .filter((src) => !existsSync(assetPath(src)));
    expect(broken).toEqual([]);
  });
});

describe("Neutral Gargoyle — art and skill", () => {
  it("has a card image wired (no missing art)", () => {
    expect(coreUnitDefinitions["neutral.gargoyles"].neutral?.cardImage).toBeTruthy();
  });

  it("keeps its paralysis-immunity skill (per the fan wiki)", () => {
    expect(coreUnitDefinitions["neutral.gargoyles"].neutral?.abilities ?? []).toContain("ignore-paralysis");
  });
});

describe("Paralysis immunity (Troglodytes / Gargoyles)", () => {
  it("blocks an Azure Dragon's paralysis on a '-1' roll", () => {
    const next = rangedDuel({
      attackerAbilities: ["azure-dragon-paralysis"],
      defenderAbilities: ["ignore-paralysis"],
      rolls: [-1, 0, 0]
    });
    expect(hasParalysis(next)).toBe(false);
    expect(abilityMessages(next).some((message) => message.includes("immune to Paralysis"))).toBe(true);
  });

  it("still paralyses a unit without the immunity (control)", () => {
    const next = rangedDuel({
      attackerAbilities: ["azure-dragon-paralysis"],
      defenderAbilities: [],
      rolls: [-1, 0, 0]
    });
    expect(hasParalysis(next)).toBe(true);
  });
});

describe("Hatred attack bonus", () => {
  it("Genies gain +1 Attack against Efreet", () => {
    const next = rangedDuel({
      attackerAbilities: ["genie-hate-efreet"],
      defenderName: "Efreet",
      rolls: [0]
    });
    // attack 3 + 0 roll + 1 hatred − 0 defense
    expect(defenderDamage(next)).toBe(4);
  });

  it("does not apply against a different creature (control)", () => {
    const next = rangedDuel({
      attackerAbilities: ["genie-hate-efreet"],
      defenderName: "Skeletons",
      rolls: [0]
    });
    expect(defenderDamage(next)).toBe(3);
  });

  it("Archangels gain +2 Attack against Arch Devils", () => {
    const next = rangedDuel({
      attackerAbilities: ["archangel-hate-devils"],
      defenderName: "Arch Devils",
      rolls: [0]
    });
    expect(defenderDamage(next)).toBe(5);
  });
});

describe("Defense bonus on the attacker's die (Zombies / Manticores)", () => {
  it("Zombies gain +1 Defense on a '0' or '+1' roll", () => {
    // roll 0: attack 4? no — attack 3 + 0 = 3, defense 0 + 1 = 1 → 2 damage
    expect(defenderDamage(rangedDuel({ defenderAbilities: ["zombie-resilience"], rolls: [0] }))).toBe(2);
    // roll +1: attack 4, defense 1 → 3 damage
    expect(defenderDamage(rangedDuel({ defenderAbilities: ["zombie-resilience"], rolls: [1] }))).toBe(3);
  });

  it("Zombies gain no Defense on a '-1' roll", () => {
    // roll -1: attack 2, defense 0 (bonus does not apply) → 2 damage
    expect(defenderDamage(rangedDuel({ defenderAbilities: ["zombie-resilience"], rolls: [-1] }))).toBe(2);
  });

  it("the Few Zombie variant only triggers on '+1'", () => {
    // +1: attack 4, defense 1 → 3 damage
    expect(defenderDamage(rangedDuel({ defenderAbilities: ["zombie-resilience-weak"], rolls: [1] }))).toBe(3);
    // 0: bonus does NOT apply → attack 3, defense 0 → 3 damage
    expect(defenderDamage(rangedDuel({ defenderAbilities: ["zombie-resilience-weak"], rolls: [0] }))).toBe(3);
  });
});

describe("Attack bonus on the unit's own die (Dread Knights Pack)", () => {
  it("adds +1 to the total attack on a '0' or '+1'", () => {
    // roll 0: attack 3 + 0 + 1 = 4 → 4 damage
    expect(defenderDamage(rangedDuel({ attackerAbilities: ["dread-knight-death-blow"], rolls: [0] }))).toBe(4);
  });

  it("does not add on a '-1'", () => {
    // roll -1: attack 3 - 1 = 2 (no bonus) → 2 damage
    expect(defenderDamage(rangedDuel({ attackerAbilities: ["dread-knight-death-blow"], rolls: [-1] }))).toBe(2);
  });
});

describe("Manticore Pack ignores the target's card Defense", () => {
  it("zeroes the printed Defense for the attack", () => {
    // defense 3 ignored → attack 3, defense 0 → 3 damage
    expect(
      defenderDamage(rangedDuel({ attackerAbilities: ["manticore-ignore-defense"], defenderDefense: 3, rolls: [0] }))
    ).toBe(3);
  });

  it("leaves a winning Defend roll intact", () => {
    // Printed defense 3 ignored, but the Defend roll's +1 shield still applies
    // when it comes up "+1": attack die 0, defend die +1 → attack 3, defense 1 → 2 damage
    expect(
      defenderDamage(
        rangedDuel({
          attackerAbilities: ["manticore-ignore-defense"],
          defenderDefense: 3,
          defenderDefenseToken: true,
          rolls: [0, 1]
        })
      )
    ).toBe(2);
  });

  it("a losing Defend roll grants no shield (printed defense already ignored)", () => {
    // attack die 0, defend die 0 → no +1 shield, printed defense ignored → 3 damage
    expect(
      defenderDamage(
        rangedDuel({
          attackerAbilities: ["manticore-ignore-defense"],
          defenderDefense: 3,
          defenderDefenseToken: true,
          rolls: [0, 0]
        })
      )
    ).toBe(3);
  });

  it("control: without the ability the printed Defense applies", () => {
    expect(defenderDamage(rangedDuel({ attackerAbilities: [], defenderDefense: 3, rolls: [0] }))).toBe(0);
  });
});

describe("Defend roll (per-attack +1 shield)", () => {
  // The defender (Skeletons) takes the Defend action; the attacker (Marksmen,
  // attack 3) shoots it. The attack die is rolls[0], the Defend die rolls[1].
  it("grants +1 Defense only on a '+1' Defend roll", () => {
    // attack die 0, defend die +1 → defense 1 → 3 - 1 = 2 damage
    expect(defenderDamage(rangedDuel({ defenderDefenseToken: true, rolls: [0, 1] }))).toBe(2);
  });

  it("grants no bonus on a '0' Defend roll", () => {
    // attack die 0, defend die 0 → defense 0 → 3 damage
    expect(defenderDamage(rangedDuel({ defenderDefenseToken: true, rolls: [0, 0] }))).toBe(3);
  });

  it("grants no bonus on a '-1' Defend roll (never reduces Defense)", () => {
    // attack die 0, defend die -1 → defense 0 (not -1) → 3 damage
    expect(defenderDamage(rangedDuel({ defenderDefenseToken: true, rolls: [0, -1] }))).toBe(3);
  });

  it("is a separate die from the attack die", () => {
    // attack die +1 → attack 4, defend die +1 → defense 1 → 4 - 1 = 3 damage
    const resolved = rangedDuel({ defenderDefenseToken: true, rolls: [1, 1] });
    expect(defenderDamage(resolved)).toBe(3);
    const rolled = resolved.eventLog.find(
      (event): event is Extract<GameEvent, { type: "ATTACK_ROLLED" }> => event.type === "ATTACK_ROLLED"
    );
    expect(rolled?.defendRoll).toBe(1);
    expect(rolled?.defenseValue).toBe(1);
  });

  it("does not roll a Defend die for an undefended target", () => {
    const resolved = rangedDuel({ rolls: [0] });
    const rolled = resolved.eventLog.find(
      (event): event is Extract<GameEvent, { type: "ATTACK_ROLLED" }> => event.type === "ATTACK_ROLLED"
    );
    expect(rolled?.defendRoll).toBeUndefined();
  });

  it("Guarded reports Gigi-style Defense 1 + a winning die as total 2, not base 2 plus another +1", () => {
    const resolved = rangedDuel({
      defenderAbilities: ["commander-defense-token"],
      defenderDefense: 1,
      rolls: [0, 1]
    });
    const rolled = resolved.eventLog.find(
      (event): event is Extract<GameEvent, { type: "ATTACK_ROLLED" }> => event.type === "ATTACK_ROLLED"
    );
    expect(rolled).toMatchObject({ defendRoll: 1, defenseBonus: 1, defenseValue: 2 });
  });

  it("Guarded gives no automatic +1 when its Defend die is 0", () => {
    const resolved = rangedDuel({
      defenderAbilities: ["commander-defense-token"],
      defenderDefense: 1,
      rolls: [0, 0]
    });
    const rolled = resolved.eventLog.find(
      (event): event is Extract<GameEvent, { type: "ATTACK_ROLLED" }> => event.type === "ATTACK_ROLLED"
    );
    expect(rolled).toMatchObject({ defendRoll: 0, defenseBonus: 0, defenseValue: 1 });
  });
});

describe("Wyvern sting (extra die, only on '0')", () => {
  it("deals +1 damage when the sting die shows '0'", () => {
    // attack die +1 → 4 damage, sting die 0 → +1 → 5 total
    expect(defenderDamage(rangedDuel({ attackerAbilities: ["wyvern-sting"], rolls: [1, 0] }))).toBe(5);
  });

  it("does nothing on a '+1' sting die (unlike Thunderbirds)", () => {
    expect(defenderDamage(rangedDuel({ attackerAbilities: ["wyvern-sting"], rolls: [1, 1] }))).toBe(4);
  });

  it("does nothing on a '-1' sting die", () => {
    expect(defenderDamage(rangedDuel({ attackerAbilities: ["wyvern-sting"], rolls: [1, -1] }))).toBe(4);
  });
});

describe("Thunderbirds lightning strike (extra die, on '0' OR '+1')", () => {
  // The Thunderbirds share the extra-die follow-up code with the Wyvern, but
  // their window is WIDER (minRoll 0, no maxRoll) so they also trigger on '+1'.
  // The Wyvern tests only reach the '0' branch; these pin the Thunderbirds'
  // own '+1' branch, which would otherwise drop silently if the lightning
  // follow-up regressed.
  it("deals +1 damage when the lightning die shows '0'", () => {
    // attack die +1 → 4 damage, lightning die 0 → +1 → 5 total
    expect(defenderDamage(rangedDuel({ attackerAbilities: ["thunderbirds-lightning"], rolls: [1, 0] }))).toBe(5);
  });

  it("ALSO deals +1 damage on a '+1' lightning die (unlike the Wyvern)", () => {
    // attack die +1 → 4 damage, lightning die +1 → +1 → 5 total
    expect(defenderDamage(rangedDuel({ attackerAbilities: ["thunderbirds-lightning"], rolls: [1, 1] }))).toBe(5);
  });

  it("does nothing on a '-1' lightning die", () => {
    expect(defenderDamage(rangedDuel({ attackerAbilities: ["thunderbirds-lightning"], rolls: [1, -1] }))).toBe(4);
  });

  it("announces the strike on the target (drives the lightning FX cue)", () => {
    const next = rangedDuel({ attackerAbilities: ["thunderbirds-lightning"], rolls: [1, 1] });
    const fired = next.eventLog.find(
      (event): event is Extract<GameEvent, { type: "UNIT_ABILITY_TRIGGERED" }> =>
        event.type === "UNIT_ABILITY_TRIGGERED" && event.abilityId === "thunderbirds-lightning"
    );
    expect(fired, "Thunderbirds must emit their lightning ability event").toBeDefined();
    expect(fired?.targetUnitId).toBe("unit_p2_skeletons");
  });
});

describe("Behemoths crushing blow & corrosion", () => {
  it("Crushing Blow (few) lowers the target's defense by 1 for the attack", () => {
    // marksmen attack 3 vs defense 2: a plain hit deals 1; the −1 crush deals 2.
    expect(defenderDamage(rangedDuel({ defenderDefense: 2, rolls: [0] }))).toBe(1);
    expect(
      defenderDamage(
        rangedDuel({ attackerAbilities: ["behemoth-defense-crush-few"], defenderDefense: 2, rolls: [0] })
      )
    ).toBe(2);
  });

  it("Corrosion drops a Defense-reducing token on the target on ANY attack roll", () => {
    // Unlike the Rust Dragon's acid (only on a '-1' roll), the Behemoth's
    // Corrosion is an unconditional on-attack token — here it lands on a '0'.
    const next = rangedDuel({ attackerAbilities: ["behemoth-corrosion"], defenderDefense: 3, rolls: [0] });
    const defender = next.combat!.units.unit_p2_skeletons;
    expect(defender.tokens?.some((token) => token.kind === "corrosion")).toBe(true);
    // The token must actually SHAVE defense (corrosion never raises it): 3 → 2.
    expect(tokenDefenseDelta(defender)).toBe(-1);
  });
});

describe("Rust Dragon acid breath", () => {
  it("reduces Defense by 2 for a '-1' attack only, without placing a token", () => {
    const next = rangedDuel({
      attackerAbilities: ["rust-dragon-acid"],
      attackerAttack: 7,
      defenderDefense: 3,
      rolls: [-1]
    });
    // Rust Dragon Attack 7 + die -1 = 6; temporary Defense 3 - 2 = 1 => 5 damage.
    expect(defenderDamage(next)).toBe(5);
    expect(next.combat!.units.unit_p2_skeletons.defense).toBe(3);
    expect(defenderTokens(next, "corrosion")).toEqual([]);
    expect(
      abilityMessages(next).some(
        (message) =>
          message.includes("uses Acid Breath:") &&
          message.includes("−2 Defense for this attack only"),
      ),
    ).toBe(true);
  });

  it("does not reduce Defense on any other roll", () => {
    const next = rangedDuel({ attackerAbilities: ["rust-dragon-acid"], defenderDefense: 3, rolls: [0] });
    expect(defenderDamage(next)).toBe(0);
    expect(defenderTokens(next, "corrosion")).toEqual([]);
    expect(abilityEventIds(next)).not.toContain("rust-dragon-acid");
  });

  it("floors the temporary Defense reduction at zero", () => {
    const next = rangedDuel({ attackerAbilities: ["rust-dragon-acid"], defenderDefense: 1, rolls: [-1] });
    // Attack 2 against Defense 0 deals 2; Acid Breath cannot push Defense below 0.
    expect(defenderDamage(next)).toBe(2);
    expect(defenderTokens(next, "corrosion")).toEqual([]);
  });
});

describe("Gorgon death stare", () => {
  it("reduces the target to 0 Health on two '-1' results", () => {
    // attack die +1 (4 damage, not lethal vs 8 HP), then the stare dice -1/-1
    const next = rangedDuel({
      attackerAbilities: ["gorgon-death-stare"],
      defenderMaxHealth: 8,
      defenderVariant: "few",
      rolls: [1, -1, -1]
    });
    expect(abilityMessages(next).some((message) => message.includes("to 0 Health"))).toBe(true);
    expect(removedUnitIds(next)).toContain("unit_p2_skeletons");
  });

  it("does nothing when the stare dice are not both '-1'", () => {
    const next = rangedDuel({
      attackerAbilities: ["gorgon-death-stare"],
      defenderMaxHealth: 8,
      defenderVariant: "few",
      rolls: [1, -1, 1]
    });
    expect(abilityMessages(next).some((message) => message.includes("to 0 Health"))).toBe(false);
    expect(removedUnitIds(next)).not.toContain("unit_p2_skeletons");
    expect(defenderDamage(next)).toBe(4);
  });

  it("only fires the death-stare FX id on a PROC, not on a failed stare (Nightmare 'when proc')", () => {
    // The table keys the death-stare animation + sound off abilityFxPlans, which
    // maps ONLY the base id (the proc). A failed stare fires a distinct announce
    // id ("…-roll", deliberately unmapped) so the die still reads out in the log
    // but no death stare flashes — the user's "play death stare when proc".
    const proc = rangedDuel({
      attackerAbilities: ["gorgon-death-stare"],
      defenderMaxHealth: 8,
      defenderVariant: "few",
      rolls: [1, -1, -1]
    });
    expect(abilityEventIds(proc)).toContain("gorgon-death-stare");
    expect(abilityEventIds(proc)).not.toContain("gorgon-death-stare-roll");

    const miss = rangedDuel({
      attackerAbilities: ["gorgon-death-stare"],
      defenderMaxHealth: 8,
      defenderVariant: "few",
      rolls: [1, -1, 1]
    });
    // The announce still logs the roll...
    expect(abilityEventIds(miss)).toContain("gorgon-death-stare-roll");
    // ...but the FX-driving id is absent, so no stare animation/sound plays.
    expect(abilityEventIds(miss)).not.toContain("gorgon-death-stare");
  });
});

describe("Fortress Basilisk — Stone Gaze on the main die '-1'", () => {
  it("paralyses the target on a '-1' attack roll", () => {
    const next = rangedDuel({ attackerAbilities: ["fortress-basilisk-paralysis"], rolls: [-1, 0, 0] });
    expect(hasParalysis(next)).toBe(true);
  });

  it("does not paralyse on any other roll (control)", () => {
    const next = rangedDuel({ attackerAbilities: ["fortress-basilisk-paralysis"], rolls: [0, 0, 0] });
    expect(hasParalysis(next)).toBe(false);
  });
});

describe("Fortress Gorgon — Death Stare on a double '0'", () => {
  it("reduces the target to 0 Health on two '0' results", () => {
    // attack die +1 (4 damage vs 8 HP, not lethal), then the stare dice 0/0.
    const next = rangedDuel({
      attackerAbilities: ["fortress-gorgon-death-stare"],
      defenderMaxHealth: 8,
      defenderVariant: "few",
      rolls: [1, 0, 0]
    });
    expect(abilityMessages(next).some((message) => message.includes("to 0 Health"))).toBe(true);
    expect(removedUnitIds(next)).toContain("unit_p2_skeletons");
  });

  it("does nothing when the stare dice are not both '0'", () => {
    const next = rangedDuel({
      attackerAbilities: ["fortress-gorgon-death-stare"],
      defenderMaxHealth: 8,
      defenderVariant: "few",
      rolls: [1, 0, -1]
    });
    expect(removedUnitIds(next)).not.toContain("unit_p2_skeletons");
    expect(defenderDamage(next)).toBe(4);
  });
});
