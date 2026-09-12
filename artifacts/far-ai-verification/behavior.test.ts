import { expect, it } from "vitest";
import { applyAction, createAdventureGameState, getMainHero, type GameState } from "@/engine";
import { driveComputerPlayers } from "@/server/computer-runner";
import { allTileDefinitions } from "@/data/map/tiles";
import { coreFactionDefinitions, coreBuildingDefinitions } from "@/data/factions/core";
import { materializeTileFields } from "@/engine/adventure";
import { neutralCombatControllerId } from "@/engine/neutral-control";
import { developmentResourceTargets } from "@/engine/computer/development";
import { coreUnitDefinitions } from "@/data/factions/units";

function fixture(factionId: "necropolis" | "castle" | "conflux" = "necropolis") {
  const heroDefId = { necropolis: "sandro", castle: "catherine", conflux: "ciele" }[factionId];
  const state = createAdventureGameState({ seed: `far-outcome-${factionId}`, difficulty: "hard",
    sessionMode: "single-player", rollFirstPlayer: false, events: false,
    players: [{ id: "p1", name: "Control", factionId: "tower", heroDefId: "solmyr" },
      { id: "p2", name: factionId, factionId, heroDefId }],
    houseRules: { "free-neutral-combat-extend": false, "polish-quick-combat": false, "bank-move-points": true },
  });
  state.round = 2;
  state.phase = "player-turn";
  state.activePlayerId = state.priorityPlayerId = "p2";
  state.computerGuaranteedWins = { p2: 2 };
  for (const player of Object.values(state.players)) {
    player.needsHandRefresh = player.canMulligan = false;
    player.townTokens = { build: false, population: false, spellBook: false };
  }
  state.players.p2.resources = { gold: 0, buildingMaterials: 0, valuables: 0 };
  for (const unit of state.players.p2.army) unit.side = "pack";
  const hero = getMainHero(state, "p2")!;
  hero.level = 3;
  hero.spaceId = "h:10:7";
  hero.movementPoints = 2;
  const id = "VERIFICATION_FAR_INCOME";
  allTileDefinitions[id] = {
    id, group: "far", content: "core_game", terrain: "grass",
    fields: Array.from({ length: 7 }, () => ({ location: "empty_field" })),
    outerImpassable: [false, false, false, false, false, false],
    source: { product: "requested verification", credit: "fixture" },
  } as (typeof allTileDefinitions)[string];
  const tile = { id: "verification-far", tileDefId: id, group: "far" as const,
    centerRow: 10, centerCol: 7, rotation: 0, faceDown: false, awaitingRotation: false };
  const homeField = { ...state.adventure!.fields["h:10:7"] };
  state.adventure!.tiles = { [tile.id]: tile };
  state.adventure!.fields = {};
  state.adventure!.playerFarTiles.p2 = [];
  state.adventure!.farTilePool = [];
  state.adventure!.pendingTileChoice = null;
  state.adventure!.pendingVisit = null;
  materializeTileFields(state.adventure!, tile);
  const settlement = state.adventure!.fields["h:9:7"];
  const mine = state.adventure!.fields["h:10:8"];
  settlement.location = "settlement";
  settlement.difficulty = 3;
  mine.location = "mine";
  mine.resource = "gold";
  mine.difficulty = 3;
  return { state, hero, settlement, mine, homeField };
}

function drive(initial: GameState, stop: (state: GameState) => boolean) {
  let state = initial;
  const actions: unknown[] = [];
  for (let step = 0; step < 450 && !stop(state); step++) {
    const run = driveComputerPlayers(state, (s, action, playerId) =>
      applyAction(s, action, { computerActorPlayerId: playerId }), { maxSteps: 1 });
    if (!run.decisions.length) break;
    actions.push(run.decisions[0].action);
    state = run.state;
  }
  return { state, actions };
}

for (const faction of ["necropolis", "castle", "conflux"] as const) {
  it(`${faction}: two MP enters settlement before a competing gold mine in round 2 and captures it`, () => {
    const { state, settlement } = fixture(faction);
    const entry = drive(state, s => Boolean(s.combat));
    expect(entry.state.combat?.context).toMatchObject({ kind: "neutral", fieldId: settlement.spaceId });
    expect(getMainHero(entry.state, "p2")?.movementPoints).toBe(1);
    const result = drive(entry.state, s => s.adventure?.fields[settlement.spaceId]?.flagOwnerId === "p2");
    expect(result.state.adventure?.fields[settlement.spaceId]?.flagOwnerId, JSON.stringify(result.actions)).toBe("p2");
    expect(result.state.round).toBe(2);
  });
}

it("one MP holds outside a paid settlement fight", () => {
  const { state, hero, settlement } = fixture();
  hero.movementPoints = 1;
  const result = drive(state, s => s.activePlayerId !== "p2");
  expect(result.state.adventure?.fields[settlement.spaceId]?.flagOwnerId).not.toBe("p2");
  expect(result.actions).not.toContainEqual(expect.objectContaining({ type: "MOVE_HERO", to: settlement.spaceId }));
});

for (const target of ["settlement", "gold", "valuables"] as const) {
  it(`Impossible ${target}: saves two MP for a three-MP attack turn`, () => {
    const { state, settlement, mine } = fixture();
    state.adventure!.difficulty = "impossible";
    state.round = 3;
    mine.location = "empty_field";
    delete mine.difficulty;
    if (target !== "settlement") { settlement.location = "mine"; settlement.resource = target; }
    const result = drive(state, s => s.activePlayerId !== "p2");
    expect(result.actions).not.toContainEqual(expect.objectContaining({ type: "MOVE_HERO", to: settlement.spaceId }));
    expect(getMainHero(result.state, "p2")?.spaceId).toBe("h:10:7");
  });
}

for (const faction of ["necropolis", "castle", "conflux"] as const) {
  it(`Impossible ${faction}: three Packs enter and capture round-4 settlement with three MP`, () => {
    const { state, hero, settlement } = fixture(faction);
    state.adventure!.difficulty = "impossible";
    state.round = 4;
    hero.movementPoints = 3;
    const entry = drive(state, s => Boolean(s.combat));
    expect(entry.state.combat?.context).toMatchObject({ kind: "neutral", fieldId: settlement.spaceId });
    expect(getMainHero(entry.state, "p2")?.movementPoints).toBe(2);
    const result = drive(entry.state, s => s.adventure?.fields[settlement.spaceId]?.flagOwnerId === "p2");
    expect(result.state.adventure?.fields[settlement.spaceId]?.flagOwnerId, JSON.stringify(result.actions)).toBe("p2");
    expect(result.state.round).toBe(4);
  });
  for (const mustAttack of [true, false]) for (const target of ["settlement", "gold", "valuables"] as const)
    it(`human neutrals ${faction} ${target} mustAttack=${mustAttack}: three Packs attack on round 4`, () => {
    const { state, hero, settlement, mine } = fixture(faction);
    if (target !== "settlement") {
      settlement.location = "mine";
      settlement.resource = target;
      mine.location = "empty_field";
      delete mine.difficulty;
    }
    state.adventure!.difficulty = "impossible";
    state.adventure!.pvpNeutralControl = true;
    state.adventure!.pvpNeutralControlMustAttack = mustAttack;
    state.sessionMode = "multiplayer";
    state.turn.mode = "parallel";
    state.round = 4;
    hero.movementPoints = 3;
    const entry = drive(state, s => Boolean(s.combat));
    expect(entry.state.combat?.context).toMatchObject({ kind: "neutral", fieldId: settlement.spaceId });
    expect(getMainHero(entry.state, "p2")?.movementPoints).toBe(2);
    expect(neutralCombatControllerId(entry.state, entry.state.combat!)).toBe("p1");
    expect(entry.state.round).toBe(4);
  });
}

it("Wisdom purchase preserves the first Gold recruit fund", () => {
  const { state, hero } = fixture("castle");
  state.round = 8;
  hero.movementPoints = 0;
  for (const town of Object.values(state.towns).filter(t => t.controllerId === "p2")) {
    for (const id of coreFactionDefinitions.castle.buildings) {
      if (coreBuildingDefinitions[id]?.effect?.type === "UNLOCK_RECRUIT_TIER" && !town.buildings.includes(id)) town.buildings.push(id);
    }
  }
  state.players.p2.hand.push("ability.wisdom");
  state.players.p2.townTokens.spellBook = true;
  const reserve = developmentResourceTargets(state, "p2");
  state.players.p2.resources = { ...reserve };
  const result = drive(state, s => s.activePlayerId !== "p2");
  expect(result.actions).not.toContainEqual(expect.objectContaining({ type: "SPELL_BOOK_ACTION" }));
});

it("round-4 full Bronze core takes FAR income before a leftover home reward", () => {
  const { state, hero, settlement, mine, homeField } = fixture();
  state.round = 4;
  state.adventure!.difficulty = "impossible";
  hero.movementPoints = 3;
  const farTile = Object.values(state.adventure!.tiles)[0];
  state.adventure!.tiles.home = { ...farTile, id: "home", group: "starting" };
  state.adventure!.fields[hero.spaceId!] = { ...homeField, tileInstanceId: "home" };
  mine.tileInstanceId = "home";
  mine.location = "treasure_symbol";
  mine.difficulty = 1;
  const entry = drive(state, s => Boolean(s.combat));
  expect(entry.actions[0]).toMatchObject({ type: "MOVE_HERO", to: settlement.spaceId });
  expect(getMainHero(entry.state, "p2")?.movementPoints).toBe(2);
});

it("free Mages spell purchase remains usable without spare gold", () => {
  const { state, hero } = fixture();
  hero.movementPoints = 0;
  state.players.p2.townTokens.spellBook = true;
  state.adventure!.astrologers!.activeCardId = "astrologers.mages";
  const result = drive(state, s => s.activePlayerId !== "p2");
  expect(result.actions).toContainEqual(expect.objectContaining({ type: "SPELL_BOOK_ACTION" }));
});

for (const rich of [false, true]) it(`Silver recruitment requires surplus: rich=${rich}`, () => {
  const { state, hero } = fixture("castle");
  hero.movementPoints = 0;
  state.round = 4;
  const town = Object.values(state.towns).find(t => t.controllerId === "p2")!;
  town.buildings.push("castle.dwelling_silver");
  state.players.p2.townTokens.population = true;
  const reserve = developmentResourceTargets(state, "p2");
  state.players.p2.resources = { gold: rich ? 100 : 12, buildingMaterials: reserve.buildingMaterials,
    valuables: reserve.valuables };
  const result = drive(state, s => s.activePlayerId !== "p2");
  expect(result.state.players.p2.army.some(u => coreUnitDefinitions[u.unitDefId]?.tier === "silver")).toBe(rich);
});

for (const captured of [false, true]) it(`second hero waits for first FAR capture: captured=${captured}`, () => {
  const { state, hero, settlement, mine, homeField } = fixture();
  state.round = 5;
  hero.movementPoints = 0;
  state.adventure!.fields[hero.spaceId!] = { ...homeField, tileInstanceId: "home" };
  state.players.p2.resources = { gold: 100, buildingMaterials: 0, valuables: 0 };
  state.players.p2.townTokens.population = true;
  settlement.location = "settlement";
  if (captured) { settlement.flagOwnerId = "p2"; settlement.everFlagged = true; }
  for (const field of Object.values(state.adventure!.fields)) {
    if (field !== settlement && field.spaceId !== hero.spaceId) {
      field.location = "resource_symbol"; delete field.difficulty;
    }
  }
  mine.location = "mine"; mine.resource = "valuables";
  const result = drive(state, s => s.activePlayerId !== "p2");
  expect(Object.values(result.state.heroes).some(h => h.controllerId === "p2" && h.kind === "secondary")).toBe(captured);
});

it("one MP holds outside a bank with paid continuations", () => {
  const { state, hero, settlement, mine } = fixture();
  hero.movementPoints = 1;
  settlement.location = "creature_bank";
  settlement.bankId = "imp_cache";
  settlement.bankSize = 1;
  delete settlement.difficulty;
  mine.location = "empty_field";
  delete mine.difficulty;
  const result = drive(state, s => s.activePlayerId !== "p2");
  expect(result.actions).not.toContainEqual(expect.objectContaining({ type: "MOVE_HERO", to: settlement.spaceId }));
});

it("round-2 market conversion builds Silver and leaves the market", () => {
  const { state, hero } = fixture();
  for (const field of Object.values(state.adventure!.fields)) { field.location = "empty_field"; delete field.difficulty; }
  state.adventure!.fields[hero.spaceId!].location = "trading_post";
  const silver = coreFactionDefinitions.necropolis.buildings.find(id => {
    const effect = coreBuildingDefinitions[id]?.effect;
    return effect?.type === "UNLOCK_RECRUIT_TIER" && effect.tier === "silver";
  })!;
  const cost = coreBuildingDefinitions[silver].cost!;
  state.players.p2.resources = { gold: (cost.gold ?? 0) + 20,
    buildingMaterials: cost.buildingMaterials ?? 0, valuables: (cost.valuables ?? 0) - 1 };
  state.players.p2.townTokens.build = true;
  const result = drive(state, s => s.activePlayerId !== "p2");
  expect(Object.values(result.state.towns).find(t => t.controllerId === "p2")?.buildings).toContain(silver);
  expect(result.actions.filter((a: any) => a.type === "TRADE_RESOURCES")).toHaveLength(1);
  expect(result.state.adventure?.pendingVisit).toBeFalsy();
});
