import { describe, expect, it } from "vitest";
import soundManifest from "../../public/sounds/manifest.json";
import { spellFxPlans } from "@/data/fx";
import { neutralUnitIdsByTier } from "@/data/factions/core";
import { coreUnitDefinitions } from "@/data/factions/units";
import { unitSoundKey } from "@/data/unit-sounds";
import {
  applyAction,
  createInitialGameState,
  getLegalActions,
  makeActiveEffect,
  NEUTRAL_PLAYER_ID,
  pickNeutralTarget,
  unitDealsElementalDamage
} from "./index";
import type { ActiveEffectModifier, GameAction, GameEvent, GameState } from "./state";

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function passAllReactions(state: GameState): GameState {
  let current = state;
  let safety = 40;
  while (current.reactionWindow && safety > 0) {
    safety -= 1;
    current = applyOk(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
  }
  return current;
}

function settle(state: GameState): GameState {
  let current = state;
  let safety = 60;
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
        candidateIndex: 0
      });
    }
  }
  return current;
}

function firstAttackValue(state: GameState): number {
  const rolled = state.eventLog.find(
    (event): event is Extract<GameEvent, { type: "ATTACK_ROLLED" }> =>
      event.type === "ATTACK_ROLLED" && !event.isRetaliation
  );
  if (!rolled) {
    throw new Error("no attack was rolled");
  }
  return rolled.attackValue;
}

function attackBonus(state: GameState, unitId: string, amount: number): void {
  const buff = makeActiveEffect(
    state,
    {
      name: "Offense",
      scope: "unit",
      duration: { type: "combat" },
      modifiers: [{ type: "ATTACK_BONUS", amount } satisfies ActiveEffectModifier]
    },
    { type: "system" },
    "p1",
    { type: "unit", unitId }
  );
  state.activeEffects.push(buff);
}

/**
 * A clean melee duel where p1's attacker (attack 3, no die swing) strikes an
 * undefended foe, so the reported `attackValue` is exactly attack + bonuses.
 */
function duel(configure: (state: GameState) => void): GameState {
  const state = createInitialGameState("elemental-seed");
  const attacker = state.combat!.units.unit_p1_griffins;
  const defender = state.combat!.units.unit_p2_skeletons;
  attacker.type = "ground";
  attacker.position = 9;
  attacker.attack = 3;
  attacker.defense = 1;
  attacker.maxHealth = 50;
  attacker.damage = 0;
  attacker.abilities = [];
  defender.type = "ground";
  defender.position = 13;
  defender.attack = 1;
  defender.defense = 0;
  defender.maxHealth = 50;
  defender.damage = 0;
  defender.abilities = [];
  state.combat!.units.unit_p1_marksmen.position = 0;
  state.combat!.units.unit_p1_crusaders.position = 3;
  state.combat!.units.unit_p2_vampires.position = 19;
  state.combat!.units.unit_p2_dread_knights.position = 16;
  state.players.p1.hand = [];
  state.players.p2.hand = [];
  state.activePlayerId = "p1";
  state.combat!.activeUnitId = "unit_p1_griffins";
  state.combat!.dice.scriptedRolls = [0, 0, 0, 0];
  state.combat!.dice.rollCount = 0;
  configure(state);
  return state;
}

function firstAttack(state: GameState): Extract<GameEvent, { type: "ATTACK_ROLLED" }> {
  const rolled = state.eventLog.find(
    (event): event is Extract<GameEvent, { type: "ATTACK_ROLLED" }> =>
      event.type === "ATTACK_ROLLED" && !event.isRetaliation
  );
  if (!rolled) {
    throw new Error("no attack was rolled");
  }
  return rolled;
}

function attack(state: GameState): GameState {
  return settle(
    applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_griffins",
      defenderId: "unit_p2_skeletons"
    })
  );
}

describe("elemental damage — attack maths", () => {
  it("a normal unit's attack IS raised by an attack card", () => {
    const state = duel((draft) => attackBonus(draft, "unit_p1_griffins", 4));
    expect(firstAttackValue(attack(state))).toBe(7); // 3 + 4
  });

  it("an elemental unit's attack is NOT raised by an attack card", () => {
    const state = duel((draft) => {
      draft.combat!.units.unit_p1_griffins.abilities = ["elemental-damage"];
      attackBonus(draft, "unit_p1_griffins", 4);
    });
    expect(firstAttackValue(attack(state))).toBe(3); // buff ignored
  });

  it("an elemental unit's attack is NOT raised by an Attack token (Ogres)", () => {
    const state = duel((draft) => {
      draft.combat!.units.unit_p1_griffins.abilities = ["elemental-damage"];
      draft.combat!.units.unit_p1_griffins.tokens = [
        { id: "tk", kind: "attack", amount: 2, sourceName: "Ogres" }
      ];
    });
    expect(firstAttackValue(attack(state))).toBe(3); // token ignored
  });

  it("an elemental unit's attack IS lowered by a Sorceress' Weakness token", () => {
    const state = duel((draft) => {
      draft.combat!.units.unit_p1_griffins.abilities = ["elemental-damage"];
      draft.combat!.units.unit_p1_griffins.tokens = [
        { id: "tk", kind: "weakness", amount: -2, sourceName: "Sorceresses" }
      ];
    });
    expect(firstAttackValue(attack(state))).toBe(1); // 3 - 2
  });

  it("blocks the buff but keeps the debuff when both are present", () => {
    const state = duel((draft) => {
      draft.combat!.units.unit_p1_griffins.abilities = ["elemental-damage"];
      attackBonus(draft, "unit_p1_griffins", 5);
      draft.combat!.units.unit_p1_griffins.tokens = [
        { id: "tk", kind: "weakness", amount: -2, sourceName: "Sorceresses" }
      ];
    });
    expect(firstAttackValue(attack(state))).toBe(1); // 3 + 0(buff) - 2(weakness)
  });

  it("a normal unit's damage is reduced by the defender's Defense", () => {
    const state = duel((draft) => {
      draft.combat!.units.unit_p2_skeletons.defense = 2;
    });
    const event = firstAttack(attack(state));
    expect(event.defenseValue).toBe(2);
    expect(event.damage).toBe(1); // 3 attack - 2 defense - 0 die
  });

  it("an elemental unit ignores the defender's Defense entirely", () => {
    const state = duel((draft) => {
      draft.combat!.units.unit_p1_griffins.abilities = ["elemental-damage"];
      draft.combat!.units.unit_p2_skeletons.defense = 2;
      draft.combat!.units.unit_p2_skeletons.defenseToken = true;
    });
    const resolved = attack(state);
    const event = firstAttack(resolved);
    expect(event.defenseValue).toBe(0); // printed Defense + token both ignored
    expect(event.damage).toBe(3); // the full Attack value lands
    expect(resolved.combat!.units.unit_p2_skeletons.damage).toBe(3);
  });

  it("an elemental unit never rolls the Attack die — damage is just its Attack", () => {
    const state = duel((draft) => {
      draft.combat!.units.unit_p1_griffins.abilities = ["elemental-damage"];
      // A +1 face is queued; a normal unit would add it, an elemental ignores it.
      draft.combat!.dice.scriptedRolls = [1, 1, 1, 1];
    });
    const event = firstAttack(attack(state));
    expect(event.noDie).toBe(true);
    expect(event.roll).toBe(0); // the die was skipped, not the scripted +1
    expect(event.attackValue).toBe(3); // attack only, no die swing
    expect(event.damage).toBe(3);
  });

  it("the printed neutral Air Elemental deals elemental damage", () => {
    const state = createInitialGameState("neutral-elemental");
    const unit = state.combat!.units.unit_p1_griffins;
    unit.abilities = ["elemental-damage"];
    expect(unitDealsElementalDamage(state, unit)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Summon Elemental spell
// ---------------------------------------------------------------------------

/** Plays the summon spell on the first legal empty space, boosting `power`. */
function castSummon(spellId: string, power: number): { state: GameState; position: number } {
  let state = createInitialGameState("summon-seed");
  const powerCards = Array.from({ length: power }, () => "stat.power");
  state.players.p1.hand = [spellId, ...powerCards];
  state.players.p2.hand = [];
  state.activePlayerId = "p1";
  state.combat!.activeUnitId = "unit_p1_griffins";
  state.combat!.units.unit_p1_griffins.activatedThisRound = false;

  const cast = getLegalActions(state, "p1").find(
    (legal) => legal.action.type === "CAST_SPELL" && legal.action.cardId === spellId
  );
  if (!cast || cast.action.type !== "CAST_SPELL" || cast.action.target.type !== "space") {
    throw new Error("no summon cast offered");
  }
  const position = cast.action.target.position;
  state = applyOk(state, cast.action);

  // Boost the cast with basic Power statistics until the window auto-resolves.
  for (let i = 0; i < power; i += 1) {
    const boost = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === "stat.power"
    );
    if (!boost) {
      break;
    }
    state = applyOk(state, boost.action);
  }
  state = passAllReactions(state);
  return { state, position };
}

function unitAt(state: GameState, position: number) {
  return Object.values(state.combat!.units).find(
    (unit) => unit.position === position && unit.damage < unit.maxHealth
  );
}

describe("Summon Elemental spell", () => {
  it("Power 2 summons a Few onto the chosen empty space", () => {
    const { state, position } = castSummon("spell.summon_air_elemental", 2);
    const summoned = unitAt(state, position);
    expect(summoned?.unitDefId).toBe("neutral.air_elementals");
    expect(summoned?.variant).toBe("few");
    expect(summoned?.controllerId).toBe("p1");
    expect(summoned?.abilities).toContain("elemental-damage");
  });

  it("Power 4 summons a Pack and it joins the caster's army", () => {
    const { state, position } = castSummon("spell.summon_fire_elemental", 4);
    const summoned = unitAt(state, position);
    expect(summoned?.unitDefId).toBe("neutral.fire_elementals");
    expect(summoned?.variant).toBe("pack");
    // It acts on its own initiative this round (not pre-activated)…
    expect(summoned?.activatedThisRound).toBe(false);
    // …and persists in the army afterwards, like the Pit Lords' Demons.
    expect(state.players.p1.army.some((entry) => entry.unitDefId === "neutral.fire_elementals")).toBe(true);
  });

  it("Power 0 summons nothing (no effect)", () => {
    const before = Object.keys(createInitialGameState("summon-seed").combat!.units).length;
    const { state } = castSummon("spell.summon_water_elemental", 0);
    const summoned = Object.values(state.combat!.units).filter(
      (unit) => unit.unitDefId === "neutral.water_elementals"
    );
    expect(summoned).toHaveLength(0);
    expect(Object.keys(state.combat!.units).length).toBe(before);
  });

  it("a summoned elemental cannot have its attack raised by an attack card", () => {
    const { state, position } = castSummon("spell.summon_earth_elemental", 2);
    const summoned = unitAt(state, position);
    expect(summoned && unitDealsElementalDamage(state, summoned)).toBe(true);
  });
});

describe("Neutral AI vs summoned (gradeless) units", () => {
  // A neutral guard attacks every real, graded enemy before it turns on a
  // summoned unit — the same-tier rule never applies to a gradeless summon.
  function setup(): GameState {
    const state = createInitialGameState("summon-ai-seed");
    const combat = state.combat!;
    const attacker = combat.units.unit_p1_griffins;
    const real = combat.units.unit_p2_skeletons;
    const summoned = combat.units.unit_p2_vampires;

    attacker.controllerId = NEUTRAL_PLAYER_ID;
    attacker.type = "ground";
    attacker.grade = "bronze";
    attacker.position = 0;

    // The real target shares the attacker's tier but sits farther away…
    real.controllerId = "p2";
    real.grade = "bronze";
    real.position = 2;
    real.summoned = false;

    // …while the summoned unit is the same tier AND closer — yet still skipped.
    summoned.controllerId = "p2";
    summoned.grade = "bronze";
    summoned.position = 1;
    summoned.summoned = true;

    combat.units = { [attacker.id]: attacker, [real.id]: real, [summoned.id]: summoned };
    return state;
  }

  it("targets a farther graded unit over a closer summoned one", () => {
    const state = setup();
    const combat = state.combat!;
    const target = pickNeutralTarget(combat, combat.units.unit_p1_griffins);
    expect(target?.id).toBe("unit_p2_skeletons");
  });

  it("falls back to a summoned unit only when no graded enemy remains", () => {
    const state = setup();
    const combat = state.combat!;
    delete combat.units.unit_p2_skeletons;
    const target = pickNeutralTarget(combat, combat.units.unit_p1_griffins);
    expect(target?.id).toBe("unit_p2_vampires");
  });

  it("the Summon Elemental spell flags its conjured unit as summoned", () => {
    const { state, position } = castSummon("spell.summon_air_elemental", 2);
    const summoned = unitAt(state, position);
    expect(summoned?.summoned).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Moandor — the Liches specialist
// ---------------------------------------------------------------------------

function moandorCombat(): GameState {
  const state = createInitialGameState("moandor-seed");
  const lich = state.combat!.units.unit_p1_griffins;
  lich.name = "Liches";
  lich.type = "ground";
  lich.position = 9;
  lich.attack = 3;
  lich.defense = 1;
  lich.maxHealth = 50;
  lich.damage = 0;
  lich.abilities = [];
  lich.activatedThisRound = false;
  // A non-Lich friendly unit to prove the elemental option won't target it.
  state.combat!.units.unit_p1_marksmen.name = "Marksmen";
  state.combat!.units.unit_p1_marksmen.position = 1;
  state.players.p1.hand = ["specialty.moandor.6"];
  state.players.p2.hand = [];
  state.activePlayerId = "p1";
  state.combat!.activeUnitId = "unit_p1_griffins";
  return state;
}

function moandorOption(state: GameState, optionIndex: number) {
  return getLegalActions(state, "p1").filter(
    (legal) =>
      legal.action.type === "PLAY_CARD" &&
      legal.action.cardId === "specialty.moandor.6" &&
      legal.action.optionIndex === optionIndex
  );
}

describe("summon elemental sound coverage", () => {
  const sounds = soundManifest as Record<string, { src?: string }>;
  const summonSpells = [
    "spell.summon_air_elemental",
    "spell.summon_earth_elemental",
    "spell.summon_fire_elemental",
    "spell.summon_water_elemental"
  ];

  it("every summon spell has a cast sound present in the manifest", () => {
    for (const id of summonSpells) {
      const key = spellFxPlans[id]?.sound;
      expect(key, `${id} cast sound`).toBeTruthy();
      expect(sounds[key!]?.src, `${id} -> ${key}`).toBeTruthy();
    }
  });

  it("the summoned Earth & Water Elementals speak with their own H3 voices", () => {
    expect(unitSoundKey("neutral.earth_elementals", "attack")).toBe("units/earth-elemental-attack");
    expect(unitSoundKey("neutral.water_elementals", "move")).toBe("units/water-elemental-move");
    expect(unitSoundKey("neutral.air_elementals", "attack")).toBe("units/air-elemental-attack");
    expect(unitSoundKey("neutral.fire_elementals", "attack")).toBe("units/fire-elemental-attack");
  });
});

describe("neutral guard elementals are distinct from the summon", () => {
  const guardPool = [
    ...neutralUnitIdsByTier.bronze,
    ...neutralUnitIdsByTier.silver,
    ...neutralUnitIdsByTier.gold,
    ...neutralUnitIdsByTier.azure
  ];

  it("pools the wiki's neutral guard elementals at their printed tiers", () => {
    expect(neutralUnitIdsByTier.bronze).toEqual(
      expect.arrayContaining(["neutral.air_elementals", "neutral.ice_elementals", "neutral.storm_elementals"])
    );
    expect(neutralUnitIdsByTier.silver).toEqual(
      expect.arrayContaining([
        "neutral.fire_elementals",
        "neutral.energy_elementals",
        "neutral.magma_elementals",
        "neutral.water_elementals"
      ])
    );
    expect(neutralUnitIdsByTier.gold).toEqual(
      expect.arrayContaining(["neutral.magic_elementals", "neutral.earth_elementals"])
    );
  });

  it("Earth & Water Elementals are BOTH summon units (Few/Pack) and neutral guards", () => {
    // The fan wiki lists a Neutral guard card for each, with stats distinct from
    // the summon Few/Pack — Earth is gold tier, Water is silver tier.
    expect(neutralUnitIdsByTier.gold).toContain("neutral.earth_elementals");
    expect(neutralUnitIdsByTier.silver).toContain("neutral.water_elementals");

    const earth = coreUnitDefinitions["neutral.earth_elementals"];
    const water = coreUnitDefinitions["neutral.water_elementals"];
    // Guard side present AND distinct from the summon Few side.
    expect(earth.neutral).toMatchObject({ attack: 3, defense: 2, health: 5, initiative: 4 });
    expect(earth.few).toMatchObject({ attack: 2, defense: 2, health: 2, initiative: 5 });
    expect(water.neutral).toMatchObject({ attack: 2, defense: 1, health: 4, initiative: 5 });
    expect(water.pack).toMatchObject({ attack: 3, defense: 0, health: 5, initiative: 6 });
  });

  it("the neutral guard side differs from the summon Few side (Air)", () => {
    const air = coreUnitDefinitions["neutral.air_elementals"];
    expect(air.neutral).toMatchObject({ attack: 2, defense: 0, health: 3, initiative: 7 }); // guard
    expect(air.few).toMatchObject({ attack: 2, defense: 0, health: 4, initiative: 8 }); // summon
  });

  it("every neutral guard elemental deals elemental damage", () => {
    for (const id of guardPool) {
      const def = coreUnitDefinitions[id];
      if (def.name.includes("Elemental")) {
        expect(def.neutral?.abilities, id).toContain("elemental-damage");
      }
    }
  });
});

describe("Moandor's Liches VI specialty", () => {
  it("offers the elemental-damage option only on a Liches unit", () => {
    const state = moandorCombat();
    const elementalPlays = moandorOption(state, 0);
    expect(elementalPlays.length).toBe(1);
    const action = elementalPlays[0].action;
    expect(action.type === "PLAY_CARD" && action.target?.type === "unit" && action.target.unitId).toBe(
      "unit_p1_griffins"
    );
  });

  it("grants the Liches elemental damage for the combat", () => {
    let state = moandorCombat();
    const action = moandorOption(state, 0)[0].action;
    state = passAllReactions(applyOk(state, action));

    const lich = state.combat!.units.unit_p1_griffins;
    expect(unitDealsElementalDamage(state, lich)).toBe(true);
    expect(state.activeEffects.some((effect) => effect.modifiers.some((m) => m.type === "ELEMENTAL_DAMAGE"))).toBe(true);
  });

  it("once elemental, the Liches' attack can no longer be buffed", () => {
    let state = moandorCombat();
    const action = moandorOption(state, 0)[0].action;
    state = passAllReactions(applyOk(state, action));

    // Tee up a clean attack with a +4 attack buff that should be ignored.
    const defender = state.combat!.units.unit_p2_skeletons;
    defender.position = 13;
    defender.defense = 0;
    defender.maxHealth = 50;
    defender.abilities = [];
    state.combat!.units.unit_p1_marksmen.position = 0;
    state.combat!.units.unit_p1_crusaders.position = 3;
    state.combat!.units.unit_p2_vampires.position = 19;
    state.combat!.units.unit_p2_dread_knights.position = 16;
    state.combat!.dice.scriptedRolls = [0, 0, 0, 0];
    state.combat!.dice.rollCount = 0;
    attackBonus(state, "unit_p1_griffins", 4);

    const resolved = attack(state);
    expect(firstAttackValue(resolved)).toBe(3); // 3 printed, +4 buff ignored
  });

  it("the alternative option grants a plain +2 attack", () => {
    let state = moandorCombat();
    const plays = moandorOption(state, 1);
    expect(plays.length).toBeGreaterThan(0);
    const onLich = plays.find(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.target?.type === "unit" && legal.action.target.unitId === "unit_p1_griffins"
    );
    state = passAllReactions(applyOk(state, onLich!.action));

    const lich = state.combat!.units.unit_p1_griffins;
    // Not elemental — a flat attack buff that does raise the attack.
    expect(unitDealsElementalDamage(state, lich)).toBe(false);
    expect(state.activeEffects.some((effect) => effect.modifiers.some((m) => m.type === "ATTACK_BONUS"))).toBe(true);
  });
});
