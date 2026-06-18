import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { applyAction, createInitialGameState, getLegalActions } from "./index";
import { coreFactionDefinitions, coreHeroDefinitions } from "@/data/factions/core";
import type { FactionId } from "@/data/factions/types";
import { adventureCards } from "@/data/cards/adventure";
import type { GameAction, GameEvent, GameState, UnitId } from "./state";

// ---------------------------------------------------------------------------
// Additional heroes, batch 3 — five wiki heroes for existing factions, all with
// fully engine-wired I/IV/VI specialties (mutation-checked: each test fails if
// the specialty's engine wiring is removed). Three tackle NEW engine mechanics.
//
//   Valeska (Castle)            — Marksmen: +1 HP (I) & +1 A/D (IV) doubled for
//                                 Marksmen; VI re-fires a ranged unit even if it
//                                 already acted (NEW: allowAlreadyActivated), or draw 2.
//   Ingham (Castle)             — Zealots: +1 A/D (I) & +1 HP (IV) doubled for
//                                 Zealots; VI a chosen unit ignores Defense
//                                 (NEW: IGNORES_DEFENSE active effect), or draw 1.
//   Lorelei (Dungeon)           — Harpies: +1 A/D (I), +1 HP (IV), +2 attack (VI),
//                                 all doubled for Harpies.
//   Septienna (Necropolis)      — Death Ripple: damage every enemy unit of a grade
//                                 (NEW: DAMAGE_ENEMY_UNITS_BY_GRADE) — I bronze,
//                                 IV silver, VI gold+azure — or +Power on a cast.
//   Lord Haart (Necropolis)     — Dread Knights: reduce enemy retaliation damage
//                                 by 1/2 doubled for Dread Knights (NEW:
//                                 RETALIATION_DAMAGE_REDUCTION), IV makes enemy
//                                 retaliations roll at disadvantage. Real wiki art.
// ---------------------------------------------------------------------------

const assetPath = (src: string) => fileURLToPath(new URL(`../../public${src}`, import.meta.url));

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function findPlay(state: GameState, cardId: string, optionIndex?: number, unitId?: UnitId) {
  return getLegalActions(state, "p1").find(
    (legal) =>
      legal.action.type === "PLAY_CARD" &&
      legal.action.cardId === cardId &&
      (optionIndex === undefined || legal.action.optionIndex === optionIndex) &&
      (unitId === undefined || (legal.action.target?.type === "unit" && legal.action.target.unitId === unitId))
  );
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

/** Read the attack/defense bonus the engine recorded for the latest roll by/against a unit. */
function lastAttackRolled(
  state: GameState,
  predicate: (event: Extract<GameEvent, { type: "ATTACK_ROLLED" }>) => boolean
): Extract<GameEvent, { type: "ATTACK_ROLLED" }> | undefined {
  return [...state.eventLog]
    .reverse()
    .find((event): event is Extract<GameEvent, { type: "ATTACK_ROLLED" }> => event.type === "ATTACK_ROLLED" && predicate(event));
}

/** Drive marksmen/griffins through one declared attack, then play `cardId` (option) as the attack-window reaction. */
function attackThenReact(
  seed: string,
  cardId: string,
  optionIndex: number | undefined,
  attackerId: UnitId,
  attackerName?: string
) {
  const state = createInitialGameState(seed);
  state.players.p1.hand = [cardId];
  state.players.p2.hand = [];
  const attacker = state.combat!.units[attackerId];
  attacker.abilities = [];
  attacker.position = 9;
  attacker.attack = 4;
  if (attackerName) {
    attacker.name = attackerName;
  }
  const defender = state.combat!.units.unit_p2_skeletons;
  defender.abilities = [];
  defender.position = 13;
  defender.defense = 0;
  defender.maxHealth = 40;
  defender.damage = 0;
  state.combat!.dice.scriptedRolls = new Array(8).fill(0);
  state.combat!.dice.rollCount = 0;
  state.activePlayerId = "p1";
  state.combat!.activeUnitId = attackerId;
  const declared = applyOk(state, {
    type: "ATTACK_UNIT",
    playerId: "p1",
    attackerId,
    defenderId: "unit_p2_skeletons"
  });
  const reaction = (declared.reactionWindow?.legalReactions.p1 ?? []).find(
    (legal) =>
      legal.action.type === "PLAY_REACTION" &&
      legal.action.cardId === cardId &&
      (optionIndex === undefined || legal.action.optionIndex === optionIndex)
  );
  expect(reaction, `${cardId} option ${optionIndex} should be offered on the declared attack`).toBeTruthy();
  return passAllReactions(applyOk(declared, reaction!.action));
}

// ===========================================================================
// Roster + art wiring (CLAUDE.md rule #2: data states exactly what runs)
// ===========================================================================

describe("batch-3 heroes are registered with art and implemented specialties", () => {
  const pcPortraitHeroes: Array<[string, FactionId]> = [
    ["valeska", "castle"],
    ["ingham", "castle"],
    ["lorelei", "dungeon"],
    ["septienna", "necropolis"]
  ];

  it("the placeholder-art heroes carry a real PC portrait, NO board scan, and 3 implemented specialties", () => {
    for (const [heroId, factionId] of pcPortraitHeroes) {
      const hero = coreHeroDefinitions[heroId];
      expect(hero, `${heroId} should be defined`).toBeTruthy();
      expect(coreFactionDefinitions[factionId].heroes, `${factionId} roster`).toContain(heroId);
      expect(hero.portrait, `${heroId} portrait`).toBe(`/assets/hero_portraits-${heroId}.webp`);
      expect(hero.boardScan, `${heroId} has no board scan`).toBeUndefined();
      expect(existsSync(assetPath(hero.portrait!)), `${heroId} portrait file on disk`).toBe(true);
      for (const level of [1, 4, 6] as const) {
        const card = adventureCards[hero.specialtyCardIds[level]];
        expect(card, `${hero.specialtyCardIds[level]} should exist`).toBeTruthy();
        expect(card.implementationStatus, `${card.id} implemented`).toBe("implemented");
        expect(card.tags, `${card.id} not flagged needs-implementation`).not.toContain("needs-implementation");
        // No printed specialty face exists for these heroes, so (like Cyra/Torosar)
        // the card must NOT reference a missing image file.
        expect(card.assets?.cardImage, `${card.id} omits a missing image`).toBeUndefined();
      }
    }
  });

  it("Lord Haart (Necropolis) ships his REAL wiki board scan, cropped portrait and specialty faces", () => {
    const hero = coreHeroDefinitions.lord_haart_necropolis;
    expect(hero, "lord_haart_necropolis should be defined").toBeTruthy();
    expect(coreFactionDefinitions.necropolis.heroes).toContain("lord_haart_necropolis");
    expect(hero.boardScan).toBe("/assets/heroes-necropolis-might-lord_haart_necropolis.webp");
    expect(hero.portrait).toBe("/assets/hero_boardart-lord_haart_necropolis.webp");
    expect(existsSync(assetPath(hero.boardScan!)), "board scan file").toBe(true);
    expect(existsSync(assetPath(hero.portrait!)), "portrait file").toBe(true);
    for (const level of [1, 4, 6] as const) {
      const card = adventureCards[hero.specialtyCardIds[level]];
      expect(card.implementationStatus).toBe("implemented");
      expect(card.assets?.cardImage).toBe(`/assets/hero_specialties-lord_haart_necropolis-${level}.webp`);
      expect(existsSync(assetPath(card.assets!.cardImage!)), `${card.id} face on disk`).toBe(true);
    }
  });

  it("the two Lord Haarts are distinct heroes (Castle Knight vs Necropolis Death Knight)", () => {
    expect(coreHeroDefinitions.lord_haart.faction).toBe("castle");
    expect(coreHeroDefinitions.lord_haart.class).toBe("Knight");
    expect(coreHeroDefinitions.lord_haart_necropolis.faction).toBe("necropolis");
    expect(coreHeroDefinitions.lord_haart_necropolis.class).toBe("Death Knight");
    expect(coreHeroDefinitions.lord_haart.boardScan).not.toBe(coreHeroDefinitions.lord_haart_necropolis.boardScan);
  });
});

// ===========================================================================
// Valeska (Castle) — Marksmen
// ===========================================================================

describe("Valeska's Marksmen specialty", () => {
  it("I adds +1 HP for the combat, doubled (+2) on a Marksmen unit", () => {
    const onCrusaders = createInitialGameState("valeska-1a");
    onCrusaders.players.p1.hand = ["specialty.valeska.1"];
    const crusBefore = onCrusaders.combat!.units.unit_p1_crusaders.maxHealth;
    const afterCrus = applyOk(onCrusaders, findPlay(onCrusaders, "specialty.valeska.1", undefined, "unit_p1_crusaders")!.action);
    expect(afterCrus.combat!.units.unit_p1_crusaders.maxHealth).toBe(crusBefore + 1);

    const onMarksmen = createInitialGameState("valeska-1b");
    onMarksmen.players.p1.hand = ["specialty.valeska.1"];
    const mkBefore = onMarksmen.combat!.units.unit_p1_marksmen.maxHealth;
    const afterMk = applyOk(onMarksmen, findPlay(onMarksmen, "specialty.valeska.1", undefined, "unit_p1_marksmen")!.action);
    expect(afterMk.combat!.units.unit_p1_marksmen.maxHealth).toBe(mkBefore + 2);
  });

  it("IV gives +1 attack on the attack, doubled (+2) for a Marksmen attacker", () => {
    const griffins = attackThenReact("valeska-4-griffins", "specialty.valeska.4", 0, "unit_p1_griffins");
    expect(lastAttackRolled(griffins, (event) => event.attackerId === "unit_p1_griffins")?.attackBonus).toBe(1);

    const marksmen = attackThenReact("valeska-4-marksmen", "specialty.valeska.4", 0, "unit_p1_marksmen");
    expect(lastAttackRolled(marksmen, (event) => event.attackerId === "unit_p1_marksmen")?.attackBonus).toBe(2);
  });

  it("VI re-fires a ranged unit that has ALREADY acted this round (the NEW reactivation)", () => {
    const state = createInitialGameState("valeska-6");
    state.players.p1.hand = ["specialty.valeska.6"];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";
    const marksmen = state.combat!.units.unit_p1_marksmen;
    marksmen.type = "ranged";
    marksmen.initiative = 1; // never jumps the queue
    state.combat!.units.unit_p2_skeletons.initiative = 99; // acts right after griffins
    for (const unit of Object.values(state.combat!.units)) {
      // Everyone except griffins (active) and the skeletons (next up) has acted —
      // crucially the Marksmen too, so the re-fire only works thanks to Valeska VI.
      unit.activatedThisRound = !["unit_p1_griffins", "unit_p2_skeletons"].includes(unit.id);
    }
    expect(marksmen.activatedThisRound, "Marksmen has already acted this round").toBe(true);
    const advanced = applyOk(state, { type: "DEFEND_UNIT", playerId: "p1", unitId: "unit_p1_griffins" });
    expect(advanced.combat!.activeUnitId).toBe("unit_p2_skeletons");

    const reaction = getLegalActions(advanced, "p1").find(
      (legal) =>
        legal.action.type === "PLAY_REACTION" &&
        legal.action.cardId === "specialty.valeska.6" &&
        legal.action.optionIndex === 0 &&
        legal.action.target?.type === "unit" &&
        legal.action.target.unitId === "unit_p1_marksmen"
    );
    expect(reaction, "Valeska VI re-fires the already-activated Marksmen").toBeTruthy();
    const after = applyOk(advanced, reaction!.action);
    expect(after.combat!.activeUnitId).toBe("unit_p1_marksmen");
    expect(after.combat!.units.unit_p1_marksmen.activatedThisRound).toBe(false); // fresh activation
  });

  it("VI can instead draw 2 cards", () => {
    const state = createInitialGameState("valeska-6-draw");
    state.players.p1.hand = ["specialty.valeska.6"];
    state.players.p1.deck = ["stat.attack", "stat.defense", "stat.power"];
    state.players.p2.hand = [];
    const handBefore = state.players.p1.hand.length;
    const play = findPlay(state, "specialty.valeska.6", 1);
    expect(play, "the draw-2 option should be a combat play").toBeTruthy();
    const after = applyOk(state, play!.action);
    // -1 (the specialty leaves hand) + 2 drawn.
    expect(after.players.p1.hand.length).toBe(handBefore - 1 + 2);
  });
});

// ===========================================================================
// Ingham (Castle) — Zealots
// ===========================================================================

describe("Ingham's Zealots specialty", () => {
  it("I gives +1 attack on the attack, doubled (+2) for a Zealots attacker", () => {
    const plain = attackThenReact("ingham-1-plain", "specialty.ingham.1", 0, "unit_p1_griffins");
    expect(lastAttackRolled(plain, (event) => event.attackerId === "unit_p1_griffins")?.attackBonus).toBe(1);

    const zealots = attackThenReact("ingham-1-zealots", "specialty.ingham.1", 0, "unit_p1_griffins", "Zealots");
    expect(lastAttackRolled(zealots, (event) => event.attackerId === "unit_p1_griffins")?.attackBonus).toBe(2);
  });

  it("IV adds +1 HP for the combat, doubled (+2) on a Zealots unit", () => {
    const plain = createInitialGameState("ingham-4-plain");
    plain.players.p1.hand = ["specialty.ingham.4"];
    const before = plain.combat!.units.unit_p1_crusaders.maxHealth;
    const after = applyOk(plain, findPlay(plain, "specialty.ingham.4", undefined, "unit_p1_crusaders")!.action);
    expect(after.combat!.units.unit_p1_crusaders.maxHealth).toBe(before + 1);

    const zealots = createInitialGameState("ingham-4-zealots");
    zealots.players.p1.hand = ["specialty.ingham.4"];
    zealots.combat!.units.unit_p1_crusaders.name = "Zealots";
    const zBefore = zealots.combat!.units.unit_p1_crusaders.maxHealth;
    const zAfter = applyOk(zealots, findPlay(zealots, "specialty.ingham.4", undefined, "unit_p1_crusaders")!.action);
    expect(zAfter.combat!.units.unit_p1_crusaders.maxHealth).toBe(zBefore + 2);
  });

  it("VI makes the chosen unit's attacks ignore the target's Defense this combat (NEW)", () => {
    function damageThroughDefense(playSpecialty: boolean): number {
      const state = createInitialGameState(`ingham-6-${playSpecialty}`);
      state.players.p1.hand = playSpecialty ? ["specialty.ingham.6"] : [];
      state.players.p2.hand = [];
      const attacker = state.combat!.units.unit_p1_griffins;
      attacker.abilities = [];
      attacker.position = 9;
      attacker.attack = 3;
      const defender = state.combat!.units.unit_p2_skeletons;
      defender.abilities = [];
      defender.position = 13;
      defender.defense = 10; // far above the attacker's 3 -> 0 damage unless pierced
      defender.maxHealth = 40;
      defender.damage = 0;
      state.combat!.dice.scriptedRolls = new Array(8).fill(0);
      state.combat!.dice.rollCount = 0;
      state.activePlayerId = "p1";
      state.combat!.activeUnitId = "unit_p1_griffins";
      let current = state;
      if (playSpecialty) {
        current = applyOk(current, findPlay(current, "specialty.ingham.6", 0, "unit_p1_griffins")!.action);
      }
      current = applyOk(current, {
        type: "ATTACK_UNIT",
        playerId: "p1",
        attackerId: "unit_p1_griffins",
        defenderId: "unit_p2_skeletons"
      });
      return passAllReactions(current).combat!.units.unit_p2_skeletons.damage;
    }
    expect(damageThroughDefense(false), "10 Defense soaks the 3 attack without the specialty").toBe(0);
    expect(damageThroughDefense(true), "ignoring Defense lands the full 3").toBe(3);
  });

  it("VI can instead draw 1 card", () => {
    const state = createInitialGameState("ingham-6-draw");
    state.players.p1.hand = ["specialty.ingham.6"];
    state.players.p1.deck = ["stat.attack", "stat.defense"];
    state.players.p2.hand = [];
    const handBefore = state.players.p1.hand.length;
    const play = findPlay(state, "specialty.ingham.6", 1);
    expect(play, "the draw option should be a combat play").toBeTruthy();
    const after = applyOk(state, play!.action);
    expect(after.players.p1.hand.length).toBe(handBefore - 1 + 1);
  });
});

// ===========================================================================
// Lorelei (Dungeon) — Harpies
// ===========================================================================

describe("Lorelei's Harpies specialty", () => {
  it("I gives +1 attack on the attack, doubled (+2) for a Harpies attacker", () => {
    const plain = attackThenReact("lorelei-1-plain", "specialty.lorelei.1", 0, "unit_p1_griffins");
    expect(lastAttackRolled(plain, (event) => event.attackerId === "unit_p1_griffins")?.attackBonus).toBe(1);

    const harpies = attackThenReact("lorelei-1-harpies", "specialty.lorelei.1", 0, "unit_p1_griffins", "Harpies");
    expect(lastAttackRolled(harpies, (event) => event.attackerId === "unit_p1_griffins")?.attackBonus).toBe(2);
  });

  it("IV adds +1 HP for the combat, doubled (+2) on a Harpies unit", () => {
    const plain = createInitialGameState("lorelei-4-plain");
    plain.players.p1.hand = ["specialty.lorelei.4"];
    const before = plain.combat!.units.unit_p1_griffins.maxHealth;
    const after = applyOk(plain, findPlay(plain, "specialty.lorelei.4", undefined, "unit_p1_griffins")!.action);
    expect(after.combat!.units.unit_p1_griffins.maxHealth).toBe(before + 1);

    const harpies = createInitialGameState("lorelei-4-harpies");
    harpies.players.p1.hand = ["specialty.lorelei.4"];
    harpies.combat!.units.unit_p1_griffins.name = "Harpies";
    const hBefore = harpies.combat!.units.unit_p1_griffins.maxHealth;
    const hAfter = applyOk(harpies, findPlay(harpies, "specialty.lorelei.4", undefined, "unit_p1_griffins")!.action);
    expect(hAfter.combat!.units.unit_p1_griffins.maxHealth).toBe(hBefore + 2);
  });

  it("VI gives +2 attack on the attack, doubled (+4) for a Harpies attacker", () => {
    const plain = attackThenReact("lorelei-6-plain", "specialty.lorelei.6", undefined, "unit_p1_griffins");
    expect(lastAttackRolled(plain, (event) => event.attackerId === "unit_p1_griffins")?.attackBonus).toBe(2);

    const harpies = attackThenReact("lorelei-6-harpies", "specialty.lorelei.6", undefined, "unit_p1_griffins", "Harpies");
    expect(lastAttackRolled(harpies, (event) => event.attackerId === "unit_p1_griffins")?.attackBonus).toBe(4);
  });
});

// ===========================================================================
// Septienna (Necropolis) — Death Ripple (NEW: grade-targeted mass damage)
// ===========================================================================

describe("Septienna's Death Ripple specialty", () => {
  /** Combat where every enemy unit survives a few hits; returns the post-play state. */
  function ripple(seed: string, cardId: string, options?: { azureVampires?: boolean }): GameState {
    const state = createInitialGameState(seed);
    state.players.p1.hand = [cardId];
    state.players.p2.hand = [];
    for (const id of ["unit_p2_skeletons", "unit_p2_vampires", "unit_p2_dread_knights"] as const) {
      const unit = state.combat!.units[id];
      unit.abilities = []; // strip any spell-damage reduction so the raw hit lands
      unit.maxHealth = 40;
      unit.damage = 0;
    }
    if (options?.azureVampires) {
      state.combat!.units.unit_p2_vampires.grade = "azure";
    }
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_marksmen";
    const play = findPlay(state, cardId, 0);
    expect(play, `${cardId} damage option should be a combat play`).toBeTruthy();
    return applyOk(state, play!.action);
  }

  it("I deals 1 damage to every enemy BRONZE unit only", () => {
    const after = ripple("septienna-1", "specialty.septienna.1");
    expect(after.combat!.units.unit_p2_skeletons.damage, "bronze hit").toBe(1);
    expect(after.combat!.units.unit_p2_vampires.damage, "silver untouched").toBe(0);
    expect(after.combat!.units.unit_p2_dread_knights.damage, "gold untouched").toBe(0);
  });

  it("IV deals 1 damage to every enemy SILVER unit only", () => {
    const after = ripple("septienna-4", "specialty.septienna.4");
    expect(after.combat!.units.unit_p2_skeletons.damage, "bronze untouched").toBe(0);
    expect(after.combat!.units.unit_p2_vampires.damage, "silver hit").toBe(1);
    expect(after.combat!.units.unit_p2_dread_knights.damage, "gold untouched").toBe(0);
  });

  it("VI deals 2 damage to every enemy GOLD and AZURE unit only", () => {
    const after = ripple("septienna-6", "specialty.septienna.6", { azureVampires: true });
    expect(after.combat!.units.unit_p2_skeletons.damage, "bronze untouched").toBe(0);
    expect(after.combat!.units.unit_p2_vampires.damage, "azure hit for 2").toBe(2);
    expect(after.combat!.units.unit_p2_dread_knights.damage, "gold hit for 2").toBe(2);
  });

  it("never hits the caster's own units of the same grade", () => {
    const after = ripple("septienna-friendly", "specialty.septienna.1");
    // p1's Marksmen and Griffins are bronze too, but they are friendly.
    expect(after.combat!.units.unit_p1_marksmen.damage).toBe(0);
    expect(after.combat!.units.unit_p1_griffins.damage).toBe(0);
  });

  it("the +Power option boosts a NORMAL spell cast (Magic Arrow base 0 -> Power 2)", () => {
    const state = createInitialGameState("septienna-power");
    state.players.p1.hand = ["specialty.septienna.6", "spell.magic_arrow"];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_marksmen";
    state.combat!.units.unit_p1_marksmen.activatedThisRound = false;
    const cast = applyOk(state, {
      type: "CAST_SPELL",
      playerId: "p1",
      cardId: "spell.magic_arrow",
      target: { type: "unit", unitId: "unit_p2_skeletons" }
    });
    const boost = (cast.reactionWindow?.legalReactions.p1 ?? []).find(
      (legal) =>
        legal.action.type === "PLAY_REACTION" &&
        legal.action.cardId === "specialty.septienna.6" &&
        legal.action.optionIndex === 1
    );
    expect(boost, "the +2 Power option should be offered while casting").toBeTruthy();
    const empowered = passAllReactions(applyOk(cast, boost!.action));
    const resolved = [...empowered.eventLog]
      .reverse()
      .find(
        (event): event is Extract<GameEvent, { type: "SPELL_CAST_RESOLVED" }> =>
          event.type === "SPELL_CAST_RESOLVED" && event.spellCardId === "spell.magic_arrow"
      );
    expect(resolved?.power).toBe(2);
  });

  it("the +Power option ALSO boosts an INSTANT attack-window spell (Bloodlust +1 -> +3 at Power 2)", () => {
    // The same +Power option, played in the attack window where an instant Spell
    // pools its Power onto the attack stack, must feed that instant too — not just
    // a stand-alone cast. Bloodlust adds attack by Power (0->+1, 1->+2, 2->+3).
    function bloodlustAttackBonus(boostWithPower: boolean): number | undefined {
      const state = createInitialGameState(`septienna-instant-${boostWithPower}`);
      state.players.p1.hand = boostWithPower
        ? ["specialty.septienna.6", "spell.bloodlust"]
        : ["spell.bloodlust"];
      state.players.p2.hand = [];
      const attacker = state.combat!.units.unit_p1_griffins;
      attacker.abilities = [];
      attacker.position = 9;
      attacker.attack = 3;
      const defender = state.combat!.units.unit_p2_skeletons;
      defender.abilities = [];
      defender.position = 13;
      defender.defense = 0;
      defender.maxHealth = 40;
      defender.damage = 0;
      state.combat!.dice.scriptedRolls = new Array(8).fill(0);
      state.combat!.dice.rollCount = 0;
      state.activePlayerId = "p1";
      state.combat!.activeUnitId = "unit_p1_griffins";
      let current = applyOk(state, {
        type: "ATTACK_UNIT",
        playerId: "p1",
        attackerId: "unit_p1_griffins",
        defenderId: "unit_p2_skeletons"
      });
      current = applyOk(current, { type: "PLAY_REACTION", playerId: "p1", cardId: "spell.bloodlust", mode: "basic" });
      if (boostWithPower) {
        const boost = (current.reactionWindow?.legalReactions.p1 ?? []).find(
          (legal) =>
            legal.action.type === "PLAY_REACTION" &&
            legal.action.cardId === "specialty.septienna.6" &&
            legal.action.optionIndex === 1
        );
        expect(boost, "the +Power option must be offered in the attack window too").toBeTruthy();
        current = applyOk(current, boost!.action);
      }
      return lastAttackRolled(passAllReactions(current), (event) => event.attackerId === "unit_p1_griffins")
        ?.attackBonus;
    }
    expect(bloodlustAttackBonus(false), "Bloodlust at base Power 0 adds +1").toBe(1);
    expect(bloodlustAttackBonus(true), "Septienna's +2 Power lifts Bloodlust to +3").toBe(3);
  });
});

// ===========================================================================
// Lord Haart (Necropolis) — Dread Knights (NEW: retaliation reduction/disadvantage)
// ===========================================================================

describe("Lord Haart (Necropolis)'s Dread Knights specialty", () => {
  /** griffins attack skeletons (which survive and retaliate). Returns griffins' retaliation damage. */
  function retaliationDamage(seed: string, specialtyCardId: string | null, protectedName?: string): number {
    const state = createInitialGameState(seed);
    state.players.p1.hand = specialtyCardId ? [specialtyCardId] : [];
    state.players.p2.hand = [];
    const griffins = state.combat!.units.unit_p1_griffins;
    const skeletons = state.combat!.units.unit_p2_skeletons;
    griffins.abilities = [];
    skeletons.abilities = [];
    griffins.position = 9;
    skeletons.position = 13;
    griffins.maxHealth = 60;
    griffins.damage = 0;
    griffins.defense = 0;
    griffins.attack = 1; // the outgoing hit barely scratches the skeletons
    if (protectedName) {
      griffins.name = protectedName;
    }
    skeletons.maxHealth = 60;
    skeletons.damage = 0;
    skeletons.attack = 8; // the retaliation we are measuring
    skeletons.defense = 0;
    state.combat!.dice.scriptedRolls = new Array(12).fill(0);
    state.combat!.dice.rollCount = 0;
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";
    let current = state;
    if (specialtyCardId) {
      current = applyOk(current, findPlay(current, specialtyCardId, undefined, "unit_p1_griffins")!.action);
    }
    current = applyOk(current, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_griffins",
      defenderId: "unit_p2_skeletons"
    });
    return passAllReactions(current).combat!.units.unit_p1_griffins.damage;
  }

  it("I reduces enemy retaliation damage by 1 (by 2 when protecting a Dread Knights unit)", () => {
    expect(retaliationDamage("lhn-i-base", null), "baseline retaliation").toBe(8);
    expect(retaliationDamage("lhn-i-spec", "specialty.lord_haart_necropolis.1"), "-1 reduction").toBe(7);
    expect(
      retaliationDamage("lhn-i-dread", "specialty.lord_haart_necropolis.1", "Dread Knights"),
      "doubled to -2 for Dread Knights"
    ).toBe(6);
  });

  it("VI reduces enemy retaliation damage by 2 (by 4 when protecting a Dread Knights unit)", () => {
    expect(retaliationDamage("lhn-vi-spec", "specialty.lord_haart_necropolis.6"), "-2 reduction").toBe(6);
    expect(
      retaliationDamage("lhn-vi-dread", "specialty.lord_haart_necropolis.6", "Dread Knights"),
      "doubled to -4 for Dread Knights"
    ).toBe(4);
  });

  it("IV makes the enemy Retaliation Attack against the chosen unit roll at disadvantage", () => {
    function retaliationRollMode(specialtyCardId: string | null): string | undefined {
      const state = createInitialGameState(`lhn-iv-${specialtyCardId ?? "base"}`);
      state.players.p1.hand = specialtyCardId ? [specialtyCardId] : [];
      state.players.p2.hand = [];
      const griffins = state.combat!.units.unit_p1_griffins;
      const skeletons = state.combat!.units.unit_p2_skeletons;
      griffins.abilities = [];
      skeletons.abilities = [];
      griffins.type = "ground"; // keep the retaliation roll mode free of flying quirks
      griffins.position = 9;
      skeletons.position = 13;
      griffins.maxHealth = 60;
      griffins.damage = 0;
      griffins.attack = 1;
      skeletons.maxHealth = 60;
      skeletons.damage = 0;
      skeletons.attack = 5;
      state.combat!.dice.scriptedRolls = new Array(12).fill(0);
      state.combat!.dice.rollCount = 0;
      state.activePlayerId = "p1";
      state.combat!.activeUnitId = "unit_p1_griffins";
      let current = state;
      if (specialtyCardId) {
        current = applyOk(current, findPlay(current, specialtyCardId, undefined, "unit_p1_griffins")!.action);
      }
      current = applyOk(current, {
        type: "ATTACK_UNIT",
        playerId: "p1",
        attackerId: "unit_p1_griffins",
        defenderId: "unit_p2_skeletons"
      });
      const settled = passAllReactions(current);
      return lastAttackRolled(
        settled,
        (event) => event.isRetaliation === true && event.attackerId === "unit_p2_skeletons"
      )?.rollMode;
    }
    expect(retaliationRollMode(null), "baseline retaliation is not at disadvantage").not.toBe("disadvantage");
    expect(retaliationRollMode("specialty.lord_haart_necropolis.4")).toBe("disadvantage");
  });
});
