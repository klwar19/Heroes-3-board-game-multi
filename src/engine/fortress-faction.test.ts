import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { applyAction, createInitialGameState } from "./index";
import { createAdventureGameState } from "./adventure-setup";
import { startAdventureRound } from "./adventure";
import { pumpAdventureQueues } from "./adventure-reducer";
import { makeActiveEffect } from "./active-effects";
import { getLegalActions } from "./legal-actions";
import { coreFactionDefinitions, coreHeroDefinitions, startingTileByFaction } from "@/data/factions/core";
import { coreUnitDefinitions } from "@/data/factions/units";
import { adventureCards } from "@/data/cards/adventure";
import { cardLibrary } from "@/data/cards/library";
import { getRoomSnapshot, submitRoomAction } from "@/server/game-room-store";
import type { GameAction, GameState } from "./state";

const assetPath = (src: string) => fileURLToPath(new URL(`../../public${src}`, import.meta.url));

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

/** Pass reactions and decline any reroll until the attack settles. */
function settle(state: GameState): GameState {
  let current = state;
  let safety = 40;
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
        candidateIndex: choice.candidates.length - 1
      });
    }
  }
  return current;
}

/** A clean ranged duel in the sandbox: p1 Marksmen (attack 3) shoot p2 Skeletons. */
function rangedAttackState(): GameState {
  const state = createInitialGameState();
  const attacker = state.combat!.units.unit_p1_marksmen;
  attacker.abilities = [];
  attacker.attack = 3;
  attacker.position = 1;
  const defender = state.combat!.units.unit_p2_skeletons;
  defender.abilities = [];
  defender.position = 13; // non-adjacent → ranged shot, no retaliation
  defender.defense = 0;
  defender.maxHealth = 20;
  defender.damage = 0;
  state.players.p1.hand = [];
  state.players.p2.hand = [];
  state.combat!.dice.scriptedRolls = [0];
  state.combat!.dice.rollCount = 0;
  state.activePlayerId = "p1";
  state.combat!.activeUnitId = "unit_p1_marksmen";
  return state;
}

const ATTACK: Extract<GameAction, { type: "ATTACK_UNIT" }> = {
  type: "ATTACK_UNIT",
  playerId: "p1",
  attackerId: "unit_p1_marksmen",
  defenderId: "unit_p2_skeletons"
};

describe("Fortress faction wiring", () => {
  const fortress = coreFactionDefinitions.fortress;

  it("is registered with a swamp starting tile, four heroes and a full roster", () => {
    expect(fortress).toBeDefined();
    expect(fortress.startingTileId).toBe("S5");
    expect(startingTileByFaction.fortress).toBe("S5");
    expect(fortress.heroes).toEqual(["bron", "wystan", "tazar", "adrienne"]);
    // 7 creatures (3 bronze, 2 silver, 2 gold) and 8 buildings (6 standard + 2 special).
    expect(fortress.units).toHaveLength(7);
    expect(fortress.buildings).toHaveLength(8);
  });

  it("recruits exactly the Fortress creature line-up", () => {
    const names = fortress.units.map((id) => coreUnitDefinitions[id].name).sort();
    expect(names).toEqual(["Basilisks", "Dragon Flies", "Gnolls", "Gorgons", "Hydras", "Lizardmen", "Wyverns"]);
  });

  it("gives every hero a valid starting ability and three implemented specialties", () => {
    for (const heroId of fortress.heroes) {
      const hero = coreHeroDefinitions[heroId];
      expect(hero.faction).toBe("fortress");
      expect(cardLibrary[hero.startingAbilityCardId]).toBeDefined();
      for (const level of [1, 4, 6] as const) {
        const specialty = adventureCards[hero.specialtyCardIds[level]];
        expect(specialty, `${heroId} level ${level} specialty`).toBeDefined();
        expect(specialty.implementationStatus).toBe("implemented");
      }
    }
  });
});

describe("Fortress card art", () => {
  const fortressUnits = Object.values(coreUnitDefinitions).filter((def) => def.faction === "fortress");

  it("wires Few and Pack art that exists on disk for every unit", () => {
    const broken: string[] = [];
    for (const def of fortressUnits) {
      for (const side of [def.few, def.pack]) {
        const src = side?.cardImage;
        if (!src || !existsSync(assetPath(src))) {
          broken.push(`${def.id} ${src ?? "(no image)"}`);
        }
      }
    }
    expect(broken).toEqual([]);
  });

  it("wires hero portraits, board scans and specialty cards that exist on disk", () => {
    const broken: string[] = [];
    for (const heroId of coreFactionDefinitions.fortress.heroes) {
      const hero = coreHeroDefinitions[heroId];
      for (const src of [hero.portrait, hero.boardScan]) {
        if (!src || !existsSync(assetPath(src))) {
          broken.push(`${heroId} ${src ?? "(none)"}`);
        }
      }
      for (const level of [1, 4, 6] as const) {
        const src = adventureCards[hero.specialtyCardIds[level]].assets?.cardImage;
        if (!src || !existsSync(assetPath(src))) {
          broken.push(`${heroId} specialty ${level} ${src ?? "(none)"}`);
        }
      }
    }
    expect(broken).toEqual([]);
  });
});

describe("Fortress is selectable in the lobby", () => {
  it("seats a player as Bron of Fortress through the room server", () => {
    const roomId = `fortress-${Math.random().toString(36).slice(2)}`;
    const fresh = getRoomSnapshot(roomId);
    const seatId = fresh.state.setupLobby?.seats[0]?.playerId ?? "p1";
    const { snapshot } = submitRoomAction(roomId, {
      type: "CHOOSE_FACTION",
      playerId: seatId,
      factionId: "fortress",
      heroDefId: "bron"
    });
    const seat = snapshot.state.setupLobby?.seats.find((candidate) => candidate.playerId === seatId);
    expect(seat?.factionId).toBe("fortress");
    expect(seat?.heroDefId).toBe("bron");
  });
});

describe("Cage of Warlords cube spend", () => {
  it("lets the attacker burn a cube for +1 attack", () => {
    let state = rangedAttackState();
    state.towns.town_p1.factionId = "fortress";
    state.towns.town_p1.buildings.push("fortress.cage_of_warlords");
    state.towns.town_p1.factionCubes = { "fortress.cage_of_warlords": 2 };

    state = applyOk(state, ATTACK);
    const spend = getLegalActions(state, "p1").find(
      (entry) => entry.action.type === "SPEND_TOWN_CUBE" && entry.action.boost === "attack"
    );
    expect(spend, "attacker should be offered a +1 attack cube spend").toBeTruthy();
    state = applyOk(state, spend!.action);
    state = settle(state);

    // attack 3 + die 0 + 1 cube − defense 0 = 4 damage; one cube left.
    expect(state.combat!.units.unit_p2_skeletons.damage).toBe(4);
    expect(state.towns.town_p1.factionCubes!["fortress.cage_of_warlords"]).toBe(1);
  });

  it("lets the defender burn a cube for +1 defense", () => {
    let state = rangedAttackState();
    state.towns.town_p2.factionId = "fortress";
    state.towns.town_p2.buildings.push("fortress.cage_of_warlords");
    state.towns.town_p2.factionCubes = { "fortress.cage_of_warlords": 1 };

    state = applyOk(state, ATTACK);
    const spend = getLegalActions(state, "p2").find(
      (entry) => entry.action.type === "SPEND_TOWN_CUBE" && entry.action.boost === "defense"
    );
    expect(spend, "defender should be offered a +1 defense cube spend").toBeTruthy();
    state = applyOk(state, spend!.action);
    state = settle(state);

    // attack 3 + die 0 − (defense 0 + 1 cube) = 2 damage; no cubes left.
    expect(state.combat!.units.unit_p2_skeletons.damage).toBe(2);
    expect(state.towns.town_p2.factionCubes!["fortress.cage_of_warlords"]).toBe(0);
  });
});

describe("Blood Obelisk resource-round Search", () => {
  it("queues a Search(4) of the owner's discard pile each Resource round", () => {
    const state = createAdventureGameState({ seed: "obelisk-seed", rollFirstPlayer: false });
    state.towns.town_p1.buildings.push("fortress.blood_obelisk");
    state.players.p1.discard = ["spell.magic_arrow", "stat.attack"];
    state.adventure!.rewardQueue = [];

    state.round = 3; // an odd round is a Resource round
    startAdventureRound(state);

    const search = state.adventure!.rewardQueue.find(
      (reward) => reward.kind === "discard-pick" && reward.playerId === "p1"
    );
    expect(search, "Blood Obelisk should queue a discard-pick").toBeTruthy();
    expect(search?.kind === "discard-pick" && search.fromTop).toBe(4);
  });
});

describe("Dragon Flies dispel", () => {
  it("strips the enemy's own ongoing buffs from the target but keeps the attacker's debuff", () => {
    let state = rangedAttackState();
    state.combat!.units.unit_p1_marksmen.abilities = ["dragon-fly-dispel"];

    state.activeEffects.push(
      // p2 buffed its own unit (a unit-targeted Stone Skin)…
      makeActiveEffect(
        state,
        {
          name: "Stone Skin",
          scope: "unit",
          duration: { type: "combat" },
          polarity: "positive",
          removable: true,
          modifiers: [{ type: "DEFENSE_BONUS", amount: 2 }]
        },
        { type: "card", cardId: "spell.stone_skin", controllerId: "p2" },
        "p2",
        { type: "unit", unitId: "unit_p2_skeletons" }
      ),
      // …and runs a player-scope Archery aura.
      makeActiveEffect(
        state,
        {
          name: "Archery",
          scope: "player",
          duration: { type: "combat" },
          polarity: "positive",
          removable: true,
          modifiers: [{ type: "RANGED_ATTACK_BONUS", amount: 1, nonAdjacentOnly: true }]
        },
        { type: "card", cardId: "ability.archery", controllerId: "p2" },
        "p2"
      ),
      // p1's own debuff on the enemy unit must survive the dispel.
      makeActiveEffect(
        state,
        {
          name: "Curse",
          scope: "unit",
          duration: { type: "combat" },
          polarity: "negative",
          removable: true,
          modifiers: [{ type: "DEFENSE_BONUS", amount: -1 }]
        },
        { type: "card", cardId: "spell.curse", controllerId: "p1" },
        "p1",
        { type: "unit", unitId: "unit_p2_skeletons" }
      )
    );

    state = applyOk(state, ATTACK);
    state = settle(state);

    const names = state.activeEffects.map((effect) => effect.name);
    expect(names).not.toContain("Stone Skin");
    expect(names).not.toContain("Archery");
    expect(names).toContain("Curse");
  });

  it("removes the Anti-Magic immunity the enemy cast on the target", () => {
    let state = rangedAttackState();
    state.combat!.units.unit_p1_marksmen.abilities = ["dragon-fly-dispel"];
    state.activeEffects.push(
      makeActiveEffect(
        state,
        {
          name: "Anti-Magic",
          scope: "unit",
          duration: { type: "combat" },
          polarity: "positive",
          removable: true,
          modifiers: [{ type: "UNIT_SPELL_IMMUNE", maxGrade: "gold" }]
        },
        { type: "card", cardId: "spell.anti_magic", controllerId: "p2" },
        "p2",
        { type: "unit", unitId: "unit_p2_skeletons" }
      )
    );

    state = applyOk(state, ATTACK);
    state = settle(state);
    expect(state.activeEffects.some((effect) => effect.name === "Anti-Magic")).toBe(false);
  });
});

describe("Fortress City Hall trading option", () => {
  it("opens a Trading Post when the exchange-resources option is chosen", () => {
    const state = createAdventureGameState({ seed: "cityhall-seed", rollFirstPlayer: false });
    state.towns.town_p1.factionId = "fortress";
    state.towns.town_p1.buildings = ["fortress.city_hall"];
    state.adventure!.rewardQueue = [];

    state.round = 3; // resource round → City Hall offers its choice
    startAdventureRound(state);
    pumpAdventureQueues(state);

    const choice = state.pendingChoice;
    expect(choice?.type).toBe("OPTION_CHOICE");
    if (choice?.type !== "OPTION_CHOICE") {
      throw new Error("expected the City Hall choice");
    }
    expect(choice.context).toBe("city-hall");

    // Option 0 = gain gold; option 1 = exchange resources (Trading Post).
    const next = applyOk(state, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: choice.id, optionIndex: 1 });
    expect(next.adventure?.pendingVisit?.steps[0]?.type).toBe("TRADING_POST");
  });
});
