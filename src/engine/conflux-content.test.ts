import { describe, expect, it } from "vitest";
import { TOWN_BUILDING_IMAGES } from "@/data/assets/homm-assets";
import { cardLibrary } from "@/data/cards/library";
import { coreBuildingDefinitions, coreFactionDefinitions, coreHeroDefinitions } from "@/data/factions/core";
import { coreUnitDefinitions } from "@/data/factions/units";
import { unitAbilities } from "@/data/units/abilities";
import { getActivationSpellPowerBoost, hasImmuneToSpecialtyDamage, unitImmuneToSpellSchools } from "./unit-abilities";
import {
  applyAction,
  createAdventureGameState,
  createInitialGameState,
  getAttackRollMode,
  getLegalActions,
  getUnitMoveRange,
  makeCombatUnitFromArmy,
  markUnitRemovedIfNeeded,
  standingSpellPower,
  unitMatchesSpecialtyName
} from "./index";
import { PLAYABLE_FACTIONS, startAdventureRound, startPlayerTurn } from "./adventure";
import { pumpAdventureQueues } from "./adventure-reducer";
import type { CombatUnitState, GameAction, GameEvent, GameState } from "./state";

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

function unitWith(abilities: string[]): CombatUnitState {
  return { abilities } as CombatUnitState;
}

// Read pendingChoice through a function boundary so a prior `state.pendingChoice
// = null` in the same test does not narrow the type to `never`.
function pendingChoiceOf(state: GameState): GameState["pendingChoice"] {
  return state.pendingChoice;
}

describe("Conflux content", () => {
  it("wires the faction to its eight town buildings, six heroes, seven units, cards, and art slots", () => {
    const faction = coreFactionDefinitions.conflux;
    expect(faction).toBeDefined();
    expect(faction.startingTileId).toBe("S8");
    expect(faction.buildings).toEqual([
      "conflux.city_hall",
      "conflux.citadel",
      "conflux.mage_guild",
      "conflux.dwelling_bronze",
      "conflux.dwelling_silver",
      "conflux.dwelling_gold",
      "conflux.garden_of_life",
      "conflux.magic_university"
    ]);
    expect(Object.keys(TOWN_BUILDING_IMAGES.conflux ?? {})).toHaveLength(8);
    for (const building of faction.buildings) {
      expect(coreBuildingDefinitions[building].assets?.image, `${building} art`).toContain("/assets/town/conflux_");
    }

    expect(faction.heroes).toEqual(["erdamon", "monere", "pasis", "luna", "ciele", "tarnum_conflux"]);
    for (const heroId of faction.heroes) {
      const hero = coreHeroDefinitions[heroId];
      expect(hero, heroId).toBeDefined();
      expect(hero.faction).toBe("conflux");
      expect(hero.portrait, `${heroId} portrait`).toBeTruthy();
      expect(cardLibrary[hero.startingAbilityCardId], `${heroId} ability`).toBeDefined();
      for (const specialtyId of Object.values(hero.specialtyCardIds!)) {
        const specialty = cardLibrary[specialtyId];
        expect(specialty, `${heroId} specialty ${specialtyId}`).toBeDefined();
        // Every shipped Conflux specialty must actually be implemented.
        expect(specialty?.implementationStatus, specialtyId).toBe("implemented");
      }
    }

    expect(faction.units).toEqual([
      "conflux.sprites",
      "conflux.storm_elementals",
      "conflux.ice_elementals",
      "conflux.energy_elementals",
      "conflux.magma_elementals",
      "conflux.magic_elementals",
      "conflux.phoenixes"
    ]);
    for (const unitId of faction.units) {
      const unit = coreUnitDefinitions[unitId];
      expect(unit.few?.cardImage, `${unit.id} few art`).toBeTruthy();
      expect(unit.pack?.cardImage, `${unit.id} pack art`).toBeTruthy();
    }
  });

  it("is a first-class playable faction — eligible as a Random Town defender", () => {
    // The Random Town defender pool must cover every faction with a unit roster
    // that is ALSO playable; Conflux and Cove were silently missing from the old
    // hand-maintained list.
    const playableFactionsWithUnits = Object.values(coreFactionDefinitions)
      .filter((faction) => faction.units.length > 0 && faction.playable !== false)
      .map((faction) => faction.id);
    expect(new Set(PLAYABLE_FACTIONS)).toEqual(new Set(playableFactionsWithUnits));
    expect(PLAYABLE_FACTIONS).toContain("conflux");
    expect(PLAYABLE_FACTIONS).toContain("cove");
    // Factory is now a real playable faction (&S1 starting tile), so it IS in
    // the pool alongside the others.
    expect(PLAYABLE_FACTIONS).toContain("factory");
  });

  it("City Hall income is 4 gold OR Search(3) the Spell deck (wiki-verified)", () => {
    expect(coreBuildingDefinitions["conflux.city_hall"].effect).toMatchObject({
      type: "RESOURCE_ROUND_CHOICE",
      options: [{ gold: 4 }, { searchSpellDeck: 3 }]
    });
    expect(coreBuildingDefinitions["conflux.city_hall"].cost).toEqual({ gold: 10, buildingMaterials: 3 });
  });

  it("City Hall Search runs at the start of the round; a card over the hand limit is discarded at your turn", () => {
    const state = createAdventureGameState({
      seed: "conflux-cityhall",
      rollFirstPlayer: false,
      events: false,
      players: [
        { id: "p1", name: "Erdamon", factionId: "conflux", heroDefId: "erdamon" },
        { id: "p2", name: "Catherine", factionId: "castle", heroDefId: "catherine" }
      ]
    });
    const town = Object.values(state.towns).find((candidate) => candidate.controllerId === "p1");
    if (!town) {
      throw new Error("no Conflux town");
    }
    if (!town.buildings.includes("conflux.city_hall")) {
      town.buildings.push("conflux.city_hall");
    }
    // Sit exactly on the hand limit, so any card taken pushes over it.
    const limit = 3;
    state.players.p1.limits.hand = limit;
    state.players.p1.hand = ["stat.attack", "stat.defense", "stat.power"];
    state.pendingChoice = null;
    if (state.adventure) {
      state.adventure.rewardQueue = [];
    }
    // Isolate the City Hall Spell Search from the first-round face-up seed on the
    // Spell discards, so the search opens straight onto its reveal.
    state.decks.spells.discardPile = [];
    if (state.decks["spells-expert"]) {
      state.decks["spells-expert"].discardPile = [];
    }
    state.round = 3; // a Resource round (odd > 1)
    startAdventureRound(state);
    pumpAdventureQueues(state);

    // The City Hall choice is presented at the start of the round.
    const choice = pendingChoiceOf(state);
    if (choice?.type !== "OPTION_CHOICE" || choice.context !== "city-hall") {
      throw new Error("expected the Conflux City Hall choice at the start of the Resource round");
    }
    const search = getLegalActions(state, "p1").find((legal) => legal.label.includes("Search(3)"));
    expect(search, "the Search(3) City Hall option should be offered at round start").toBeTruthy();
    let next = applyOk(state, search!.action);
    pumpAdventureQueues(next);

    // Take the first revealed Spell — it lands in hand (the round-start gain),
    // pushing the hand over the limit.
    const keep = getLegalActions(next, "p1").find((legal) => legal.action.type === "RESOLVE_DECK_SEARCH");
    expect(keep, "a revealed Spell to keep").toBeTruthy();
    next = applyOk(next, keep!.action);
    expect(next.players.p1.hand.length).toBe(limit + 1);

    // A Search(3) puts TWO cards back, so the searcher first picks which one sits
    // face up on the discard pile (openDiscardTopPick). Settle it and carry on.
    const faceUp = pendingChoiceOf(next);
    if (faceUp?.type === "OPTION_CHOICE" && faceUp.context === "spell-discard-top") {
      next = applyOk(next, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: faceUp.id, optionIndex: 0 });
    }

    // At p1's turn the over-limit hand forces a discard before they can act
    // (the hand-limit snapshot runs when the start-of-turn queue is pumped).
    startPlayerTurn(next, "p1");
    pumpAdventureQueues(next);
    expect(next.players.p1.needsHandRefresh).toBe(true);
  });

  it("Garden of Life and Magic University are both implemented", () => {
    const garden = coreBuildingDefinitions["conflux.garden_of_life"];
    expect(garden.implementationStatus).toBe("implemented");
    expect(garden.effect).toMatchObject({ type: "ROUND_START_FREE_SPRITE", unitDefId: "conflux.sprites" });

    const university = coreBuildingDefinitions["conflux.magic_university"];
    expect(university.implementationStatus).toBe("implemented");
    expect(university.effect?.type).toBe("MAGIC_UNIVERSITY");
  });

  it("carries the implemented elemental / phoenix / sprite ability tags on the right sides", () => {
    // Per the verbatim wiki card the FACTION elemental Few has NO abilities and
    // the Pack only the spell-power activation — the Magic-Arrow/school immunity
    // and "deals elemental damage" belong to the separate NEUTRAL guard card
    // (neutral.storm_elementals), NOT the recruitable Conflux Few/Pack.
    expect(coreUnitDefinitions["conflux.storm_elementals"].few?.abilities).toEqual([]);
    expect(coreUnitDefinitions["conflux.storm_elementals"].pack?.abilities).toEqual(["storm-elemental-air-power"]);
    expect(coreUnitDefinitions["conflux.magma_elementals"].few?.abilities).toEqual([]);
    expect(coreUnitDefinitions["conflux.magma_elementals"].pack?.abilities).toEqual(["magma-elemental-earth-power"]);
    // The neutral GUARD elementals keep the immunity + elemental-damage passives.
    expect(coreUnitDefinitions["neutral.storm_elementals"].neutral?.abilities).toEqual([
      "elemental-damage",
      "air-elemental-immunity"
    ]);
    // Sprites: only the Pack ignores retaliation.
    expect(coreUnitDefinitions["conflux.sprites"].few?.abilities).toEqual([]);
    expect(coreUnitDefinitions["conflux.sprites"].pack?.abilities).toEqual(["ignores-retaliation"]);
    // Phoenix Few = rebirth + fire immunity; Pack = line attack + fire immunity
    // only (printed/wiki). Pack Rebirth is the `phoenix-pack-rebirth` house rule
    // injected at mint — not printed on the Pack definition.
    expect(coreUnitDefinitions["conflux.phoenixes"].few?.abilities).toEqual([
      "phoenix-rebirth",
      "phoenix-fire-immunity"
    ]);
    expect(coreUnitDefinitions["conflux.phoenixes"].pack?.abilities).toEqual([
      "dragon-line-attack-2",
      "phoenix-fire-immunity"
    ]);
    // The four new elemental spell-power abilities resolve to an implemented effect.
    for (const id of [
      "storm-elemental-air-power",
      "ice-elemental-water-power",
      "energy-elemental-fire-power",
      "magma-elemental-earth-power"
    ]) {
      expect(unitAbilities[id]?.implementationStatus, id).toBe("implemented");
      expect(unitAbilities[id]?.effect?.type, id).toBe("ON_ACTIVATION_SPELL_POWER_FIRST_CAST");
    }
  });

  it("flips Storm/Ice elementals ground→ranged and Energy ground→flying when reinforced (per-side type)", () => {
    const checks: { id: string; few: string; pack: string }[] = [
      { id: "conflux.storm_elementals", few: "ground", pack: "ranged" },
      { id: "conflux.ice_elementals", few: "ground", pack: "ranged" },
      { id: "conflux.energy_elementals", few: "ground", pack: "flying" }
    ];
    for (const { id, few, pack } of checks) {
      const fewUnit = makeCombatUnitFromArmy({ id: "a-few", unitDefId: id, side: "few" }, "p1", "u-few", 0);
      const packUnit = makeCombatUnitFromArmy({ id: "a-pack", unitDefId: id, side: "pack" }, "p1", "u-pack", 1);
      expect(fewUnit?.type, `${id} few`).toBe(few);
      expect(packUnit?.type, `${id} pack`).toBe(pack);
    }
    // Magma Elementals stay ground on both sides.
    const magma = makeCombatUnitFromArmy({ id: "a-magma", unitDefId: "conflux.magma_elementals", side: "pack" }, "p1", "u-magma", 0);
    expect(magma?.type).toBe("ground");
  });

  it("a Pack Storm/Ice Elemental knocked down to its Few side becomes MELEE (ground) and changes combat behaviour", () => {
    // The Few side is ground (melee); the Pack side is ranged. When a Pack is
    // knocked down to its Few side mid-combat the unit must STOP shooting and
    // fight in melee — the type has to be recomputed on the side change, not
    // frozen at the Pack's ranged type.
    for (const id of ["conflux.storm_elementals", "conflux.ice_elementals"]) {
      const state = createInitialGameState(`elemental-flip-${id}`);
      const elem = state.combat!.units.unit_p2_skeletons;
      elem.unitDefId = id;
      elem.name = coreUnitDefinitions[id].name;
      elem.variant = "pack";
      elem.type = "ranged"; // Pack side is ranged
      elem.maxHealth = coreUnitDefinitions[id].pack!.health;
      elem.damage = 0;
      elem.position = 13;

      // A foe placed directly above (adjacent) to test the attack roll.
      const foe = state.combat!.units.unit_p1_griffins;
      foe.type = "ground";
      foe.position = 9;

      // BEFORE the flip (Pack, ranged): shooting an ADJACENT enemy suffers the
      // ranged Combat penalty (roll two dice, keep the lower), and it moves 1.
      expect(getAttackRollMode(elem, foe), `${id} pack adjacent`).toBe("disadvantage");
      expect(getUnitMoveRange(elem), `${id} pack move`).toBe(1);

      // Knock the Pack down to its Few side.
      elem.damage = elem.maxHealth;
      markUnitRemovedIfNeeded(state, elem);
      expect(elem.variant, `${id} flipped`).toBe("few");

      // AFTER the flip (Few, ground/melee): it strikes the adjacent enemy with a
      // normal single-die roll (no ranged penalty) and moves 3 like a ground unit.
      expect(elem.type, `${id} few type`).toBe("ground");
      expect(getAttackRollMode(elem, foe), `${id} few adjacent`).toBe("normal");
      expect(getUnitMoveRange(elem), `${id} few move`).toBe(3);
    }
  });

  it("places the Conflux starting tile and town for a seated Conflux player", () => {
    const state = createAdventureGameState({
      seed: "conflux-setup",
      rollFirstPlayer: false,
      players: [
        { id: "p1", name: "Erdamon", factionId: "conflux", heroDefId: "erdamon" },
        { id: "p2", name: "Catherine", factionId: "castle", heroDefId: "catherine" }
      ]
    });
    const town = Object.values(state.towns).find((candidate) => candidate.controllerId === "p1");
    expect(town, "Conflux player should own a town").toBeTruthy();
    expect(town?.factionId).toBe("conflux");
    const hero = Object.values(state.heroes).find((candidate) => candidate.controllerId === "p1");
    expect(hero, "Conflux player should have a main hero").toBeTruthy();
  });

  function confluxGardenGame(seed: string) {
    const state = createAdventureGameState({
      seed,
      rollFirstPlayer: false,
      players: [
        { id: "p1", name: "Pasis", factionId: "conflux", heroDefId: "pasis" },
        { id: "p2", name: "Catherine", factionId: "castle", heroDefId: "catherine" }
      ]
    });
    const town = Object.values(state.towns).find((candidate) => candidate.controllerId === "p1");
    if (!town) {
      throw new Error("no Conflux town");
    }
    if (!town.buildings.includes("conflux.garden_of_life")) {
      town.buildings.push("conflux.garden_of_life");
    }
    state.pendingChoice = null;
    if (state.adventure) {
      state.adventure.rewardQueue = [];
    }
    // Round 3 is a Resource round (odd > 1).
    state.round = 3;
    return state;
  }

  it("Garden of Life recruits a free Sprites Few when you don't own one yet (exactly one, no duplicate)", () => {
    const state = confluxGardenGame("conflux-garden");
    // A default Conflux army already holds a Sprites Few; strip it so this case
    // exercises the recruit branch from an empty start.
    state.players.p1.army = state.players.p1.army.filter((unit) => unit.unitDefId !== "conflux.sprites");
    const goldBefore = state.players.p1.resources.gold;
    startAdventureRound(state);
    pumpAdventureQueues(state);

    const recruit = getLegalActions(state, "p1").find((legal) => legal.label.includes("Recruit Sprites"));
    expect(recruit, "the free-Sprites recruit option should be offered when none are owned").toBeTruthy();
    const next = applyOk(state, recruit!.action);
    pumpAdventureQueues(next);

    const sprites = next.players.p1.army.filter((unit) => unit.unitDefId === "conflux.sprites");
    expect(sprites).toHaveLength(1);
    expect(sprites[0].side).toBe("few");
    // It was free — gold is unchanged by the recruit itself (resource-round income
    // may have been gained, but no gold was spent on the unit).
    expect(next.players.p1.resources.gold).toBeGreaterThanOrEqual(goldBefore);
  });

  it("Garden of Life reinforces (never duplicate-recruits) the Sprites Few you already own", () => {
    // Regression: a unit card exists once. A Conflux player starts WITH a Sprites
    // Few, so the Garden must offer to reinforce it — not to recruit a second
    // Sprites card that would stack a duplicate Few in the army every round.
    const state = confluxGardenGame("conflux-garden-owned");
    const spritesBefore = state.players.p1.army.filter((unit) => unit.unitDefId === "conflux.sprites");
    expect(spritesBefore, "the default Conflux army holds exactly one Sprites Few").toHaveLength(1);
    expect(spritesBefore[0].side).toBe("few");
    startAdventureRound(state);
    pumpAdventureQueues(state);

    const labels = getLegalActions(state, "p1")
      .filter((legal) => legal.label.includes("Sprites"))
      .map((legal) => legal.label);
    expect(labels.some((label) => label.includes("Recruit Sprites"))).toBe(false);
    const reinforce = getLegalActions(state, "p1").find((legal) => legal.label.includes("Reinforce Sprites"));
    expect(reinforce, "owning a Sprites Few should offer the free reinforce").toBeTruthy();

    const next = applyOk(state, reinforce!.action);
    pumpAdventureQueues(next);

    // Still a single Sprites card — now a Pack, not a second Few.
    const spritesAfter = next.players.p1.army.filter((unit) => unit.unitDefId === "conflux.sprites");
    expect(spritesAfter).toHaveLength(1);
    expect(spritesAfter[0].side).toBe("pack");
  });
});

// ---------------------------------------------------------------------------
// Erdamon: the Magma Elementals specialist (wiki — "The effect doubles for the
// Magma Elementals unit"). I = atk/def, IV = +1 initiative — both doubled ONLY
// for Magma Elementals; VI = instant +2 attack OR ongoing +3 initiative.
// ---------------------------------------------------------------------------

describe("Erdamon specialty (Magma Elementals specialist)", () => {
  it("doubles only for Magma Elementals, not for every '… Elementals' unit", () => {
    expect(unitMatchesSpecialtyName("Magma Elementals", "Magma Elementals")).toBe(true);
    // The other Elementals (and Sprites) are NOT doubled — Erdamon is Magma-only.
    for (const name of ["Storm Elementals", "Ice Elementals", "Energy Elementals", "Magic Elementals", "Sprites"]) {
      expect(unitMatchesSpecialtyName(name, "Magma Elementals"), name).toBe(false);
    }
    // The generic family descriptor (used by Pasis) still matches every Elemental.
    for (const name of ["Storm Elementals", "Ice Elementals", "Energy Elementals", "Magma Elementals", "Magic Elementals"]) {
      expect(unitMatchesSpecialtyName(name, "an Elementals unit"), name).toBe(true);
    }
  });

  it("I/IV double only for Magma Elementals; VI is +2 attack (instant) OR +3 initiative (ongoing)", () => {
    const one = cardLibrary["specialty.erdamon.1"];
    expect(one?.effect.type).toBe("CHOOSE_ONE");
    if (one?.effect.type === "CHOOSE_ONE") {
      for (const option of one.effect.options) {
        expect(option.effect.type).toBe("ADD_COMBAT_STAT");
        if (option.effect.type === "ADD_COMBAT_STAT") {
          expect(option.effect.doubleForUnitName).toBe("Magma Elementals");
        }
      }
    }

    // House rule (BINH): IV is now a CHOOSE_ONE — option A is the initiative buff
    // (which also grants +1 Combat movement), option B draws a card.
    const four = cardLibrary["specialty.erdamon.4"];
    expect(four?.effect.type).toBe("CHOOSE_ONE");
    if (four?.effect.type === "CHOOSE_ONE") {
      const buff = four.effect.options[0].effect;
      expect(buff.type).toBe("CREATE_INITIATIVE_BUFF");
      if (buff.type === "CREATE_INITIATIVE_BUFF") {
        expect(buff.amount).toBe(1);
        expect(buff.doubleForUnitName).toBe("Magma Elementals");
        expect(buff.movementBonus).toBe(1);
      }
      expect(four.effect.options[1].effect).toMatchObject({ type: "DRAW_CARDS", amount: 1 });
    }

    const six = cardLibrary["specialty.erdamon.6"];
    expect(six?.effect.type).toBe("CHOOSE_ONE");
    if (six?.effect.type === "CHOOSE_ONE") {
      const [attackOption, initiativeOption] = six.effect.options;
      // +2 attack: an instant one-shot played as an attack reaction (trigger).
      expect(attackOption.trigger?.event).toBe("UNIT_ATTACK_DECLARED");
      expect(attackOption.effect).toMatchObject({ type: "ADD_COMBAT_STAT", stat: "attack", amount: 2 });
      // +3 initiative: an ongoing combat buff on a chosen friendly unit.
      expect(initiativeOption.effect).toMatchObject({ type: "CREATE_INITIATIVE_BUFF", amount: 3 });
      expect(initiativeOption.target?.type).toBe("friendly-unit");
    }
  });
});

// ---------------------------------------------------------------------------
// Conflux Pack Elementals: "+1 power to the first <school> Magic spell you cast
// during this Activation" — school-scoped, only while that unit is active.
// ---------------------------------------------------------------------------

describe("Conflux elemental school spell-power boost", () => {
  it("getActivationSpellPowerBoost is school-aware", () => {
    // The Storm Elemental boost lands only on an Air spell.
    expect(getActivationSpellPowerBoost(unitWith(["storm-elemental-air-power"]), ["air"])).toBe(1);
    expect(getActivationSpellPowerBoost(unitWith(["storm-elemental-air-power"]), ["fire"])).toBe(0);
    // Magic Arrow (school "any") may take a school-scoped activation boost —
    // wiki: benefits from any school, one school at a time.
    expect(getActivationSpellPowerBoost(unitWith(["storm-elemental-air-power"]), ["any"])).toBe(1);
    expect(getActivationSpellPowerBoost(unitWith(["storm-elemental-air-power"]))).toBe(0);
    // The Magma Elemental boost lands only on an Earth spell.
    expect(getActivationSpellPowerBoost(unitWith(["magma-elemental-earth-power"]), ["earth"])).toBe(1);
    expect(getActivationSpellPowerBoost(unitWith(["magma-elemental-earth-power"]), ["air"])).toBe(0);
    // The Magi (school-less) boost still lands on any school.
    expect(getActivationSpellPowerBoost(unitWith(["magi-power-boost"]), ["fire"])).toBe(1);
    expect(getActivationSpellPowerBoost(unitWith(["magi-power-boost"]))).toBe(1);
  });

  it("standingSpellPower (UI/cost preview) counts the school-scoped boost so it agrees with the cast", () => {
    // standingSpellPower drives the spell-power preview, the Sorrow power-cost
    // affordability check and the pool-scaling attack power. It must include the
    // SAME school-scoped Elemental boost performSpellCast applies, or the preview
    // and the resolved cast disagree. (Regression: it dropped the school-scoped
    // boost by calling getActivationSpellPowerBoost without the card's schools.)
    const state = createInitialGameState("conflux-standing-power");
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";
    state.players.p1.combatStats.spellsCastThisRound = 0;
    const airSpell = cardLibrary["spell.lightning_bolt"]; // school: air
    const fireSpell = cardLibrary["spell.curse"]; // school: fire

    // Storm Elemental (Air) active: its first Air spell previews +1; a Fire spell
    // (wrong school) gets nothing.
    state.combat!.units.unit_p1_griffins.abilities = ["storm-elemental-air-power"];
    expect(standingSpellPower(state, "p1", airSpell)).toBe(1);
    expect(standingSpellPower(state, "p1", fireSpell)).toBe(0);

    // Control 1 — no Elemental ability: even the Air spell previews 0.
    state.combat!.units.unit_p1_griffins.abilities = [];
    expect(standingSpellPower(state, "p1", airSpell)).toBe(0);

    // Control 2 — the school-less Magi boost still previews on any school.
    state.combat!.units.unit_p1_griffins.abilities = ["magi-power-boost"];
    expect(standingSpellPower(state, "p1", airSpell)).toBe(1);
    expect(standingSpellPower(state, "p1", fireSpell)).toBe(1);
  });

  /**
   * Cast a hand Lightning Bolt (Air spell; power 0 → 2 damage, power 1 → 3).
   * The active unit `unit_p1_griffins` carries the ability under test.
   */
  function castLightningBolt(setup: (state: GameState) => void): GameState {
    const state = createInitialGameState("conflux-spell-power-seed");
    state.players.p1.hand = ["spell.lightning_bolt"];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";
    const target = state.combat!.units.unit_p2_vampires;
    target.maxHealth = 20;
    target.damage = 0;
    setup(state);
    const cast = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "CAST_SPELL" &&
        !legal.action.fromScroll &&
        legal.action.cardId === "spell.lightning_bolt" &&
        legal.action.target?.type === "unit" &&
        legal.action.target.unitId === "unit_p2_vampires"
    );
    expect(cast, "hand cast of Lightning Bolt at the target should be legal").toBeTruthy();
    return passAllReactions(applyOk(state, cast!.action));
  }

  it("an ordinary active unit casting Lightning Bolt deals 2 (no boost)", () => {
    const next = castLightningBolt(() => {});
    expect(next.combat!.units.unit_p2_vampires.damage).toBe(2);
  });

  it("a Storm Elemental Pack active unit gives its first Air spell +1 power (deals 3)", () => {
    const next = castLightningBolt((state) => {
      state.combat!.units.unit_p1_griffins.abilities = ["storm-elemental-air-power"];
    });
    expect(next.combat!.units.unit_p2_vampires.damage).toBe(3);
  });

  it("no boost when the Storm Elemental is on the board but NOT the active unit", () => {
    const next = castLightningBolt((state) => {
      state.combat!.units.unit_p1_crusaders.abilities = ["storm-elemental-air-power"];
      state.combat!.units.unit_p1_griffins.abilities = [];
    });
    expect(next.combat!.units.unit_p2_vampires.damage).toBe(2);
  });

  it("no boost for a Magma Elemental (Earth) casting an Air spell — wrong school", () => {
    const next = castLightningBolt((state) => {
      state.combat!.units.unit_p1_griffins.abilities = ["magma-elemental-earth-power"];
    });
    expect(next.combat!.units.unit_p2_vampires.damage).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Magic University (Conflux): a turn action you choose INSTEAD of buying spells
// normally — once per round, pick a School of Magic and discard from the top of
// your deck until a Spell of that school is revealed, then take it to hand.
// ---------------------------------------------------------------------------

describe("Conflux Magic University deck dig", () => {
  function confluxGame(seed: string): GameState {
    const state = createAdventureGameState({
      seed,
      rollFirstPlayer: false,
      players: [
        { id: "p1", name: "Monere", factionId: "conflux", heroDefId: "monere" },
        { id: "p2", name: "Catherine", factionId: "castle", heroDefId: "catherine" }
      ]
    });
    const town = Object.values(state.towns).find((candidate) => candidate.controllerId === "p1");
    if (!town) {
      throw new Error("no Conflux town");
    }
    if (!town.buildings.includes("conflux.magic_university")) {
      town.buildings.push("conflux.magic_university");
    }
    state.pendingChoice = null;
    state.reactionWindow = null;
    if (state.adventure) {
      state.adventure.rewardQueue = [];
      state.adventure.pendingVisit = null;
    }
    state.activePlayerId = "p1";
    return state;
  }

  it("is offered as a per-school turn action (a choice besides buying spells), once per round", () => {
    const state = confluxGame("conflux-university-offer");
    const labels = getLegalActions(state, "p1").map((legal) => legal.label);
    expect(labels.some((label) => label.includes("Magic University") && label.includes("Air Magic spell"))).toBe(true);
    expect(labels.some((label) => label.includes("Magic University") && label.includes("Fire Magic spell"))).toBe(true);

    // After using it this round, it is no longer offered.
    state.players.p1.magicUniversityUsedRound = state.round;
    const after = getLegalActions(state, "p1").map((legal) => legal.label);
    expect(after.some((label) => label.includes("Magic University"))).toBe(false);
  });

  it("discards down to — and takes — the first Spell of the chosen school, skipping a wrong-school spell", () => {
    const state = confluxGame("conflux-university-hit");
    state.players.p1.hand = [];
    state.players.p1.discard = [];
    // Top of deck (popped first) → bottom: a Statistic, then a Fire spell
    // (wrong school, must be skipped), then the Air spell we want.
    state.players.p1.deck = ["spell.lightning_bolt", "spell.curse", "stat.attack"];
    const action = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "MAGIC_UNIVERSITY_ACTION" && legal.action.school === "air"
    );
    expect(action, "the Air-school Magic University action should be offered").toBeTruthy();
    const next = applyOk(state, action!.action);

    expect(next.players.p1.hand).toContain("spell.lightning_bolt");
    // The skipped Fire spell and the Statistic were discarded, not taken.
    expect(next.players.p1.discard).toContain("spell.curse");
    expect(next.players.p1.discard).toContain("stat.attack");
    expect(next.players.p1.deck).not.toContain("spell.lightning_bolt");
    // It is spent for the round.
    expect(next.players.p1.magicUniversityUsedRound).toBe(next.round);
  });

  it("takes nothing (but still discards) when the deck holds no Spell of that school", () => {
    const state = confluxGame("conflux-university-miss");
    state.players.p1.hand = [];
    state.players.p1.discard = [];
    // Only a Fire spell + a Statistic; searching for Air finds nothing.
    state.players.p1.deck = ["spell.curse", "stat.defense"];
    const action = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "MAGIC_UNIVERSITY_ACTION" && legal.action.school === "air"
    );
    const next = applyOk(state, action!.action);

    expect(next.players.p1.hand).toEqual([]);
    expect(next.players.p1.discard).toContain("spell.curse");
    expect(next.players.p1.discard).toContain("stat.defense");
  });
});

// ---------------------------------------------------------------------------
// Magic Elementals — the gold unit's signature abilities, engine-enforced:
//  • "Attack all adjacent [enemy] units": after its primary attack it makes a
//    full separate attack at its OWN (buffable) Attack against every other
//    adjacent unit — the Few hits friend AND foe, the Pack enemies only.
//  • Pack only: "Ignore any Spell effects" (full spell immunity, incl. Magic
//    Arrow) and "damage from Specialty". The card has NO elemental-damage line.
// Each test fails if the wiring is removed (the Few/Pack divergence is the
// built-in mutation control).
// ---------------------------------------------------------------------------

describe("Conflux Magic Elementals abilities", () => {
  function elementalAttackState(side: "few" | "pack"): GameState {
    const state = createInitialGameState("magic-elementals-attack-all");
    const def = coreUnitDefinitions["conflux.magic_elementals"][side]!;
    const me = state.combat!.units.unit_p1_griffins;
    me.name = "Magic Elementals";
    me.cardName = side === "pack" ? "Pack of Magic Elementals" : "Magic Elementals";
    me.type = "ground";
    me.abilities = [...(def.abilities ?? [])]; // straight from the shipped definition
    me.attack = def.attack;
    me.position = 9;

    // Main enemy target + another adjacent enemy + an adjacent FRIENDLY unit.
    const vampires = state.combat!.units.unit_p2_vampires;
    const skeletons = state.combat!.units.unit_p2_skeletons;
    const crusaders = state.combat!.units.unit_p1_crusaders;
    vampires.position = 5; // main target (adjacent to 9)
    skeletons.position = 10; // adjacent enemy
    crusaders.position = 13; // adjacent friendly
    for (const unit of [vampires, skeletons, crusaders]) {
      unit.defense = 0;
      unit.maxHealth = 50;
      unit.damage = 0;
    }

    state.combat!.activeUnitId = me.id;
    state.activePlayerId = "p1";
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    state.combat!.dice.scriptedRolls = [0, 0, 0, 0, 0, 0];
    return state;
  }

  function resolveAttack(state: GameState): GameState {
    let next = applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_griffins",
      defenderId: "unit_p2_vampires"
    });
    for (let guard = 0; guard < 30 && next.reactionWindow; guard += 1) {
      next = applyOk(next, { type: "PASS_REACTION", playerId: next.reactionWindow.priorityPlayerId });
    }
    return next;
  }

  function followUpsOf(state: GameState, abilityId: string) {
    return state.eventLog.filter(
      (event): event is Extract<GameEvent, { type: "UNIT_ATTACK_DECLARED" }> =>
        event.type === "UNIT_ATTACK_DECLARED" && event.abilityAttack?.abilityId === abilityId
    );
  }

  it("Pack: attacks every OTHER adjacent ENEMY (sparing friendlies) at its own attack 5", () => {
    const next = resolveAttack(elementalAttackState("pack"));
    const followUps = followUpsOf(next, "magic-elemental-attack-all-enemies");
    expect(followUps).toHaveLength(1);
    expect(followUps[0].defenderId).toBe("unit_p2_skeletons");
    // Its own (buffable) attack value — not a fixed Cerberi-style 3.
    expect(followUps[0].abilityAttack?.baseAttack).toBe(5);
    // The adjacent friendly Crusaders is never a follow-up target and takes no hit.
    expect(followUps.some((event) => event.defenderId === "unit_p1_crusaders")).toBe(false);
    expect(next.combat!.units.unit_p1_crusaders.damage).toBe(0);
    // The adjacent enemy actually took the follow-up's damage (attack 5, roll 0).
    expect(next.combat!.units.unit_p2_skeletons.damage).toBe(5);
  });

  it("Few: attacks every OTHER adjacent unit — friend AND foe — at its own attack 4", () => {
    const next = resolveAttack(elementalAttackState("few"));
    const followUps = followUpsOf(next, "magic-elemental-attack-all");
    expect(followUps).toHaveLength(2);
    expect(new Set(followUps.map((event) => event.defenderId))).toEqual(
      new Set(["unit_p2_skeletons", "unit_p1_crusaders"])
    );
    for (const followUp of followUps) {
      expect(followUp.abilityAttack?.baseAttack).toBe(4);
    }
    // The friendly Crusaders really took the follow-up damage (friendly-fire).
    expect(next.combat!.units.unit_p1_crusaders.damage).toBe(4);
  });

  it("Pack ignores all Spells (incl. Magic Arrow) and Specialty damage; the Few does not", () => {
    const few = makeCombatUnitFromArmy(
      { id: "a-few", unitDefId: "conflux.magic_elementals", side: "few" },
      "p1",
      "u-me-few",
      0
    )!;
    const pack = makeCombatUnitFromArmy(
      { id: "a-pack", unitDefId: "conflux.magic_elementals", side: "pack" },
      "p1",
      "u-me-pack",
      1
    )!;

    // Pack: immune to every school of Spell AND to Magic Arrow ("any").
    for (const school of ["any", "air", "earth", "fire", "water"] as const) {
      expect(unitImmuneToSpellSchools(pack, [school]), `pack vs ${school}`).toBe(true);
    }
    expect(hasImmuneToSpecialtyDamage(pack)).toBe(true);

    // Few: no immunity at all — the control that proves the Pack lines are real
    // wiring, not a blanket gold-unit default.
    expect(unitImmuneToSpellSchools(few, ["fire"])).toBe(false);
    expect(unitImmuneToSpellSchools(few, ["any"])).toBe(false);
    expect(hasImmuneToSpecialtyDamage(few)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Luna — Conflux Elementalist, the Fire Wall specialist. I/VI place the SAME
// engine `fire_wall` battlefield token as the Fire Wall spell (its bite-on-stop
// / bite-on-pass-through is the shared, separately-tested token mechanic) but at
// a FIXED 1 / 3 damage; IV is the spell-economy choice (map discard recall OR a
// +2-Power spell-cast reaction). Each test fails if the wiring is removed.
// ---------------------------------------------------------------------------

describe("Conflux Luna (Fire Wall specialist)", () => {
  function lunaCombat(seed: string, cardId: string): GameState {
    const state = createInitialGameState(seed);
    state.players.p1.hand = [cardId];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    // Pin all six units away from the centre so space 9 is a clean empty target.
    const u = state.combat!.units;
    u.unit_p1_griffins.position = 0;
    u.unit_p1_crusaders.position = 1;
    u.unit_p1_marksmen.position = 2;
    u.unit_p2_vampires.position = 16;
    u.unit_p2_skeletons.position = 17;
    u.unit_p2_dread_knights.position = 18;
    state.combat!.obstacles = [];
    state.combat!.battlefieldTokens = [];
    return state;
  }

  function placeWall(seed: string, cardId: string) {
    const state = lunaCombat(seed, cardId);
    const play = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "PLAY_CARD" &&
        legal.action.cardId === cardId &&
        legal.action.target?.type === "space" &&
        legal.action.target.position === 9
    );
    expect(play, `${cardId} should be offered in combat on an empty space`).toBeTruthy();
    const next = applyOk(state, play!.action);
    return (next.combat!.battlefieldTokens ?? []).find((token) => token.kind === "fire_wall");
  }

  it("I places a Fire Wall token dealing a fixed 1 damage on the chosen empty space", () => {
    const wall = placeWall("luna-i", "specialty.luna.1");
    expect(wall).toBeTruthy();
    expect(wall!.position).toBe(9);
    expect(wall!.damage).toBe(1);
    expect(wall!.controllerId).toBe("p1");
  });

  it("VI places a Fire Wall token dealing a fixed 3 damage (control vs I's 1)", () => {
    const wall = placeWall("luna-vi", "specialty.luna.6");
    expect(wall?.damage).toBe(3);
  });

  it("a placed Fire Wall actually bites a unit that stops on it", () => {
    // End-to-end: drive an enemy onto the wall and confirm it takes the damage,
    // so the placement is a live token, not an inert marker.
    const state = lunaCombat("luna-bite", "specialty.luna.6");
    const play = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "PLAY_CARD" &&
        legal.action.cardId === "specialty.luna.6" &&
        legal.action.target?.type === "space" &&
        legal.action.target.position === 9
    );
    let next = applyOk(state, play!.action);

    // Hand the activation to the enemy Skeletons, parked next to the wall (9).
    const skeletons = next.combat!.units.unit_p2_skeletons;
    skeletons.position = 10; // adjacent to 9
    skeletons.maxHealth = 20;
    skeletons.damage = 0;
    skeletons.type = "ground";
    skeletons.activatedThisRound = false;
    skeletons.movedThisActivation = false;
    next.combat!.activeUnitId = "unit_p2_skeletons";
    next.activePlayerId = "p2";

    next = applyOk(next, { type: "MOVE_UNIT", playerId: "p2", unitId: "unit_p2_skeletons", destination: 9 });
    expect(next.combat!.units.unit_p2_skeletons.position).toBe(9);
    expect(next.combat!.units.unit_p2_skeletons.damage).toBe(3);
  });

  it("IV returns a card from the discard pile to hand (map play)", () => {
    const game = createAdventureGameState({
      seed: "luna-iv",
      rollFirstPlayer: false,
      players: [
        { id: "p1", name: "Luna", factionId: "conflux", heroDefId: "luna" },
        { id: "p2", name: "Catherine", factionId: "castle", heroDefId: "catherine" }
      ]
    });
    let state = game.players.p1.needsHandRefresh
      ? applyOk(game, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] })
      : game;
    state.activePlayerId = "p1";
    state.pendingChoice = null;
    state.reactionWindow = null;
    // The start-of-turn draw is mandatory (house rule) before any map card play;
    // mark it taken so the discard-recall play is offered.
    state.players.p1.canMulligan = false;
    state.players.p1.hand = ["specialty.luna.4"];
    state.players.p1.discard = ["spell.lightning_bolt", "stat.attack"];

    const play = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "specialty.luna.4"
    );
    expect(play, "Luna IV (take from discard) should be offered on the map").toBeTruthy();
    state = applyOk(state, play!.action);

    const choice = pendingChoiceOf(state);
    expect(choice?.type === "OPTION_CHOICE" && choice.context).toBe("discard-pick");
    const labels = choice?.type === "OPTION_CHOICE" ? choice.options.map((option) => option.label) : [];
    state = applyOk(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: (choice as { id: string }).id,
      optionIndex: labels.findIndex((label) => label.includes("Lightning Bolt"))
    });
    expect(state.players.p1.hand).toContain("spell.lightning_bolt");
    expect(state.players.p1.discard).not.toContain("spell.lightning_bolt");
  });

  it("IV returns a card from the discard pile to hand DURING combat too (allowInCombat)", () => {
    // The recall used to be map-only; the discard-pick now opens straight away in
    // a live fight. Fails if `allowInCombat` is dropped (the option would not even
    // be offered in combat).
    const state = lunaCombat("luna-iv-combat", "specialty.luna.4");
    state.combat!.activeUnitId = "unit_p1_griffins";
    state.players.p1.discard = ["spell.lightning_bolt", "stat.attack"];
    const play = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "specialty.luna.4"
    );
    expect(play, "Luna IV's discard recall should be offered in combat").toBeTruthy();
    let next = applyOk(state, play!.action);
    const choice = pendingChoiceOf(next);
    expect(choice?.type === "OPTION_CHOICE" && choice.context, "the discard-pick opens mid-combat").toBe("discard-pick");
    const labels = choice?.type === "OPTION_CHOICE" ? choice.options.map((option) => option.label) : [];
    next = applyOk(next, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: (choice as { id: string }).id,
      optionIndex: labels.findIndex((label) => label.includes("Lightning Bolt"))
    });
    expect(next.players.p1.hand).toContain("spell.lightning_bolt");
    expect(next.players.p1.discard).not.toContain("spell.lightning_bolt");
  });

  it("IV's other option is a +2-Power spell-cast reaction", () => {
    const four = cardLibrary["specialty.luna.4"];
    expect(four?.effect.type).toBe("CHOOSE_ONE");
    if (four?.effect.type === "CHOOSE_ONE") {
      const power = four.effect.options.find((option) => option.effect.type === "ADD_SPELL_POWER");
      expect(power?.trigger?.event).toBe("SPELL_CAST_STARTED");
      expect(power?.effect).toMatchObject({ type: "ADD_SPELL_POWER", amount: 2 });
    }
  });
});
