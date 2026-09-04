import { describe, expect, it } from "vitest";
import { startNeutralEncounter } from "./adventure-reducer";
import {
  drawGuardArmy,
  ensureRevealedRandomTownFactions,
  getMainHero,
  getTileFootprintSpaceIds,
  instantiateTile,
  PLAYABLE_FACTIONS,
  randomTownDefaultBronzePackId,
  randomTownBronzePackCandidates,
  eliminatePlayer
} from "./adventure";
import { applyAction, createAdventureGameState, getLegalActions, NEUTRAL_PLAYER_ID } from "./index";
import { redactStateForSeat } from "./player-view";
import { coreFactionDefinitions } from "@/data/factions/core";
import { coreUnitDefinitions } from "@/data/factions/units";
import { marketGoldValueOf } from "@/data/map/locations";
import type { GameAction, GameState, MapFieldState, PlayerId, ResourceKind } from "./state";

/**
 * Random Town defenders (printed Stretch-Goals card): "defended by units from
 * that Faction: a Pack of BRONZE-tier units, chosen by the player who controls the
 * defense during this Combat; two Packs of SILVER-tier units; two Fews of
 * GOLD-tier units. Add Walls and the Gate for this Combat, but not the Arrow
 * Tower." The faction is one NOT in play.
 *
 * Every claim below asserts the real minted combat units (or the real seeded
 * faction pick), with a CONTROL that fails under the previous reading.
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function makeGame(seed: string, options: Record<string, unknown> = {}): GameState {
  const state = createAdventureGameState({
    seed,
    difficulty: "normal",
    rollFirstPlayer: false,
    ...options
  } as Parameters<typeof createAdventureGameState>[0]);
  for (const player of Object.values(state.players)) {
    player.canMulligan = false;
    player.needsHandRefresh = false;
  }
  state.activePlayerId = "p1";
  state.priorityPlayerId = "p1";
  state.phase = "player-turn";
  state.pendingChoice = null;
  state.reactionWindow = null;
  state.stack = [];
  if (state.adventure) {
    state.adventure.pendingTileChoice = null;
    state.adventure.pendingVisit = null;
    state.adventure.rewardQueue = [];
  }
  return state;
}

function randomTownField(spaceId = "70,70"): MapFieldState {
  return {
    spaceId,
    tileInstanceId: "t",
    slotIndex: 0,
    location: "random_town",
    difficulty: 7,
    terrain: "land"
  } as unknown as MapFieldState;
}

/** Opens a Random Town fight for p1 and deploys, so the guards are drawn. */
function fightRandomTown(state: GameState, fighter: PlayerId = "p1"): GameState {
  let next = state;
  const hero = getMainHero(next, fighter)!;
  const field = randomTownField();
  next.adventure!.fields[field.spaceId] = field;
  hero.spaceId = field.spaceId;
  next.players[fighter].hand = [];
  startNeutralEncounter(next, hero, field);
  expect(next.combat?.context.kind).toBe("neutral");
  const army = next.players[fighter].army;
  next = applyOk(next, {
    type: "PLACE_COMBAT_UNIT",
    playerId: fighter,
    armyUnitId: army[0].id,
    position: 13
  });
  return applyOk(next, { type: "FINISH_COMBAT_PLACEMENT", playerId: fighter });
}

/** The open OPTION_CHOICE context, or undefined for any other/no choice. */
function optionChoiceContext(state: GameState): string | undefined {
  const choice = state.pendingChoice;
  return choice && choice.type === "OPTION_CHOICE" ? choice.context : undefined;
}

function neutralUnits(state: GameState) {
  return Object.values(state.combat?.units ?? {}).filter(
    (unit) => unit.controllerId === NEUTRAL_PLAYER_ID && unit.position >= 0
  );
}

/** Gold-equivalent printed Pack cost (Trading Post rates), the "cost" read. */
function packGoldCost(unitDefId: string): number {
  const cost = (coreUnitDefinitions[unitDefId]?.pack?.cost ?? {}) as Partial<Record<ResourceKind, number>>;
  return (Object.entries(cost) as [ResourceKind, number][]).reduce(
    (sum, [resource, amount]) =>
      sum + (resource === "gold" ? amount : amount * marketGoldValueOf(resource as "buildingMaterials" | "valuables")),
    0
  );
}

describe("Random Town defense — the printed composition", () => {
  it("mints 1 bronze Pack + 2 silver Packs + 2 gold Fews of the chosen faction", () => {
    const state = fightRandomTown(makeGame("rt-composition"));
    const field = state.adventure!.fields["70,70"]!;
    const faction = field.faction!;
    expect(faction).toBeTruthy();

    const guards = neutralUnits(state);
    expect(guards).toHaveLength(5);
    expect(guards.every((unit) => coreUnitDefinitions[unit.unitDefId!]?.faction === faction)).toBe(true);

    const packs = guards.filter((unit) => unit.variant === "pack");
    const fews = guards.filter((unit) => unit.variant === "few");
    expect(packs.map((unit) => unit.grade).sort()).toEqual(["bronze", "silver", "silver"]);
    expect(fews.map((unit) => unit.grade)).toEqual(["gold", "gold"]);

    // Each Pack/Few really fights on that printed side (stats, not just a flag).
    for (const unit of packs) {
      const side = coreUnitDefinitions[unit.unitDefId!]!.pack!;
      expect(unit.attack).toBe(side.attack);
      expect(unit.maxHealth).toBe(side.health);
    }
    for (const unit of fews) {
      const side = coreUnitDefinitions[unit.unitDefId!]!.few!;
      expect(unit.attack).toBe(side.attack);
      expect(unit.maxHealth).toBe(side.health);
    }

    // CONTROL against the OLD composition (1 bronze + 2 silver + 2 gold PACKS):
    // the two gold bodies are FEWS, and exactly ONE bronze body (the choosable
    // Pack) stands — never two gold Packs.
    expect(guards.filter((unit) => unit.grade === "bronze")).toHaveLength(1);
    expect(packs.filter((unit) => unit.grade === "gold")).toHaveLength(0);
    expect(fews).toHaveLength(2);
  });

  it("takes the faction's highest-printed-cost bronze Pack when no human controls the defense", () => {
    const state = fightRandomTown(makeGame("rt-default-pick"));
    const faction = state.adventure!.fields["70,70"]!.faction!;
    const bronzePack = neutralUnits(state).find((unit) => unit.variant === "pack" && unit.grade === "bronze")!;

    const candidates = randomTownBronzePackCandidates(faction);
    expect(candidates.length).toBeGreaterThan(1);
    const best = [...candidates].sort((left, right) => packGoldCost(right) - packGoldCost(left))[0]!;
    expect(bronzePack.unitDefId).toBe(best);
    // CONTROL: it is NOT merely the first (or cheapest) bronze unit of the roster.
    const cheapest = [...candidates].sort((left, right) => packGoldCost(left) - packGoldCost(right))[0]!;
    expect(packGoldCost(best)).toBeGreaterThan(packGoldCost(cheapest));
    expect(bronzePack.unitDefId).not.toBe(cheapest);
    // No pick window ever opened: the fight went straight to the battle.
    expect(optionChoiceContext(state)).not.toBe("random-town-pack");
  });

  it("picks per faction cost table, not a fixed roster slot (CONTROL across factions)", () => {
    // Sweep every faction against its OWN printed bronze cost table: the pick is
    // never a fixed roster slot. Heavenly Demon is the sharp case — its dearest
    // bronze Pack is the MIDDLE one (Gu Witches 6 > Shadow Wraiths 5), so a
    // "last bronze in the roster" reading fails here.
    for (const faction of Object.keys(coreFactionDefinitions)) {
      const candidates = randomTownBronzePackCandidates(faction);
      if (candidates.length === 0) continue;
      const best = randomTownDefaultBronzePackId(faction)!;
      const maxCost = Math.max(...candidates.map((id) => packGoldCost(id)));
      expect(packGoldCost(best)).toBe(maxCost);
    }
    // Concrete divergences: never the first (cheapest) bronze, and not always the
    // last one either.
    expect(randomTownDefaultBronzePackId("castle")).toBe("castle.griffins");
    expect(randomTownDefaultBronzePackId("rampart")).toBe("rampart.elves");
    expect(randomTownDefaultBronzePackId("heavenly_demon")).toBe("heavenly_demon.gu_witches");
  });
});

describe("Random Town faction pick", () => {
  it("is drawn seeded-random from factions NOT participating, deterministically", () => {
    const factions: string[] = [];
    for (const seed of ["rt-f1", "rt-f2", "rt-f3", "rt-f4", "rt-f5", "rt-f6"]) {
      const state = makeGame(seed);
      const inPlay = Object.values(state.players).map((player) => player.factionId);
      const field = randomTownField();
      drawGuardArmy(state, field, 7);
      expect(field.faction).toBeTruthy();
      // CONTROL: a participating faction is never the defender.
      expect(inPlay).not.toContain(field.faction);
      factions.push(field.faction!);

      // Determinism: the same seed re-rolls the same faction (no Math.random).
      const twin = makeGame(seed);
      const twinField = randomTownField();
      drawGuardArmy(twin, twinField, 7);
      expect(twinField.faction).toBe(field.faction);
    }
    // The pick really varies with the seed (not a constant).
    expect(new Set(factions).size).toBeGreaterThan(1);
  });

  it("is the field's VII fight with Walls and the Gate but NO Arrow Tower", () => {
    const state = fightRandomTown(makeGame("rt-siege"));
    expect(state.combat?.context.kind).toBe("neutral");
    if (state.combat?.context.kind !== "neutral") return;
    expect(state.combat.context.difficulty).toBe(7);
    expect(state.combat.siege?.walls).toHaveLength(3);
    expect(state.combat.siege?.gatePosition).not.toBeNull();
    expect(state.combat.siege?.gatePosition).toBeGreaterThanOrEqual(0);
    // CONTROL: a real town siege DOES field an Arrow Tower; this one must not.
    expect(state.combat.siege?.arrowTowerUnitId).toBeNull();
    expect(
      Object.values(state.combat.units).some((unit) => unit.position === -1)
    ).toBe(false);
  });
});

describe("Random Town — single player never pauses for the Pack pick", () => {
  it("auto-takes the highest-cost bronze Pack in a single-player game with manual guard control", () => {
    const state = fightRandomTown(
      makeGame("rt-single-player", { manualGuardControl: true, sessionMode: "single-player" })
    );
    expect(state.sessionMode).toBe("single-player");
    expect(optionChoiceContext(state)).not.toBe("random-town-pack");
    const faction = state.adventure!.fields["70,70"]!.faction!;
    const bronzePack = neutralUnits(state).find((unit) => unit.variant === "pack" && unit.grade === "bronze")!;
    expect(bronzePack.unitDefId).toBe(randomTownDefaultBronzePackId(faction));
  });
});

describe("Random Town — a HUMAN defense controller picks the bronze Pack", () => {
  function pvpControlGame(seed: string): GameState {
    const state = makeGame(seed, { pvpNeutralControl: true });
    return state;
  }

  it("opens the pick for the controlling seat and mints exactly what they chose", () => {
    let state = fightRandomTown(pvpControlGame("rt-controller-pick"));
    // The controller is the next live seat clockwise from the fighter.
    expect(optionChoiceContext(state)).toBe("random-town-pack");
    const controller = state.pendingChoice!.playerId;
    expect(controller).not.toBe("p1");
    expect(controller).not.toBe(NEUTRAL_PLAYER_ID);

    const faction = state.adventure!.fields["70,70"]!.faction!;
    const candidates = randomTownBronzePackCandidates(faction);
    const wanted = candidates.find((id) => id !== randomTownDefaultBronzePackId(faction))!;
    const optionIndex = candidates.indexOf(wanted);

    state = applyOk(state, {
      type: "CHOOSE_OPTION",
      playerId: controller,
      choiceId: state.pendingChoice!.id,
      optionIndex
    });

    const bronzePack = neutralUnits(state).find((unit) => unit.variant === "pack" && unit.grade === "bronze")!;
    // CONTROL: the picked unit replaced the default, and it is a real Pack body.
    expect(bronzePack.unitDefId).toBe(wanted);
    expect(bronzePack.unitDefId).not.toBe(randomTownDefaultBronzePackId(faction));
    expect(bronzePack.attack).toBe(coreUnitDefinitions[wanted]!.pack!.attack);
    // The rest of the printed composition is untouched.
    expect(neutralUnits(state)).toHaveLength(5);
  });

  it("hands an eliminated controller's pick back and reveals the default army (no stall)", () => {
    let state = fightRandomTown(pvpControlGame("rt-controller-eliminated"));
    expect(optionChoiceContext(state)).toBe("random-town-pack");
    const controller = state.pendingChoice!.playerId;
    const faction = state.adventure!.fields["70,70"]!.faction!;

    // The REAL elimination path: eliminatePlayer hands a neutral-side choice the
    // dead controller held back to the Neutral seat instead of dropping it.
    eliminatePlayer(state, controller, "gave up", true);
    expect(state.pendingChoice?.playerId).toBe(NEUTRAL_PLAYER_ID);

    // Any next action pumps the engine: the window auto-resolves to the default.
    state = applyOk(state, { type: "JOIN_ROOM", clientId: "c1", name: "watcher" } as GameAction);
    expect(optionChoiceContext(state)).not.toBe("random-town-pack");
    const bronzePack = neutralUnits(state).find((unit) => unit.variant === "pack" && unit.grade === "bronze")!;
    expect(bronzePack.unitDefId).toBe(randomTownDefaultBronzePackId(faction));
    expect(neutralUnits(state)).toHaveLength(5);
  });
});

/**
 * USER RULE 2026-08-22: "you should know the type of units (faction) when the
 * tile with Random Town is revealed … and it is fixed. But you should not know
 * where the gate is before setting your army."
 *
 * The defending faction used to be rolled lazily when the guards were DRAWN (at
 * the fight). It is now stamped on the field the moment its tile is face up —
 * public, fixed, and the SAME value the fight later draws from.
 */
describe("Random Town — the defending faction is public at tile reveal", () => {
  /** Reveals tile C5 (slot 0 is the printed Ⅶ Random Town) face up. */
  function revealRandomTownTile(state: GameState, center = { row: 40, col: 40 }): string {
    const tile = instantiateTile(state.adventure!, "C5", center, 0, false);
    const spaceId = getTileFootprintSpaceIds(tile)[0]!;
    expect(state.adventure!.fields[spaceId]?.location).toBe("random_town");
    return spaceId;
  }

  /** A harmless real action, so the shared applyAction tail runs. */
  function pump(state: GameState): GameState {
    return applyOk(state, { type: "JOIN_ROOM", clientId: "c-rt", name: "watcher" } as GameAction);
  }

  it("stamps a faction NOT in play on the revealed hex, seeded and fixed", () => {
    const stamped: string[] = [];
    for (const seed of ["rt-reveal-1", "rt-reveal-2", "rt-reveal-3", "rt-reveal-4", "rt-reveal-5"]) {
      let state = makeGame(seed);
      const spaceId = revealRandomTownTile(state);
      // Before any action ran the field carries no faction (the tile was
      // instantiated straight into state, outside the reducer).
      expect(state.adventure!.fields[spaceId]!.faction).toBeUndefined();

      state = pump(state);
      const faction = state.adventure!.fields[spaceId]!.faction;
      // (a) revealed ⇒ published, with NO combat anywhere near it.
      expect(faction).toBeTruthy();
      expect(state.combat).toBeFalsy();
      // CONTROL: never a faction someone is playing.
      const inPlay = Object.values(state.players).map((player) => player.factionId);
      expect(inPlay).not.toContain(faction);
      expect(PLAYABLE_FACTIONS).toContain(faction);

      // PUBLIC: it survives the seat redaction, so every player sees the crest…
      const opponentFrame = redactStateForSeat(state, "p2");
      expect(opponentFrame.adventure!.fields[spaceId]!.faction).toBe(faction);
      // …but nothing about the GATE or the defender layout exists yet: the siege
      // board is minted only when the fight starts (at deployment).
      expect(opponentFrame.combat).toBeFalsy();
      expect(JSON.stringify(opponentFrame.adventure!.fields[spaceId])).not.toContain("gate");

      // FIXED: a further action never re-rolls it.
      const later = pump(state);
      expect(later.adventure!.fields[spaceId]!.faction).toBe(faction);

      // Deterministic: the same seed reveals the same defender.
      let twin = makeGame(seed);
      revealRandomTownTile(twin);
      twin = pump(twin);
      expect(twin.adventure!.fields[spaceId]!.faction).toBe(faction);
      stamped.push(faction!);
    }
    // …and it really varies with the seed (not a constant).
    expect(new Set(stamped).size).toBeGreaterThan(1);
  });

  it("never stamps a hex whose tile is still FACE DOWN (CONTROL)", () => {
    const state = makeGame("rt-reveal-facedown");
    // A face-down tile materializes no fields at all — nothing to leak.
    const hidden = instantiateTile(state.adventure!, "C5", { row: 40, col: 40 }, 0, true);
    expect(state.adventure!.fields[getTileFootprintSpaceIds(hidden)[0]!]).toBeUndefined();

    // And the sweep's own guard: a field whose tile is flagged face down is skipped.
    const spaceId = revealRandomTownTile(state, { row: 46, col: 46 });
    state.adventure!.tiles[state.adventure!.fields[spaceId]!.tileInstanceId!]!.faceDown = true;
    expect(ensureRevealedRandomTownFactions(state)).toBe(false);
    expect(state.adventure!.fields[spaceId]!.faction).toBeUndefined();
  });

  it("fights the faction stamped at reveal — the draw READS the field, it never re-rolls", () => {
    let state = makeGame("rt-reveal-fight");
    const spaceId = revealRandomTownTile(state);
    state = pump(state);
    const revealed = state.adventure!.fields[spaceId]!.faction!;
    expect(revealed).toBeTruthy();

    // Walk the fight's own draw over the REVEALED field (not the fixture field).
    const draws = drawGuardArmy(state, state.adventure!.fields[spaceId]!, 7);
    expect(draws.length).toBeGreaterThan(0);
    expect(
      draws.every((draw) => coreUnitDefinitions[draw.unitDefId]?.faction === revealed)
    ).toBe(true);
    // The draw did not move the published crest.
    expect(state.adventure!.fields[spaceId]!.faction).toBe(revealed);

    // MUTATION CHECK: re-stamp the field with a DIFFERENT unused faction and the
    // fight follows the field. If the draw re-rolled its own faction instead of
    // reading the persisted one, these guards would be `revealed`'s units.
    const inPlay = new Set(Object.values(state.players).map((player) => player.factionId));
    const other = PLAYABLE_FACTIONS.find(
      (faction) =>
        faction !== revealed &&
        !inPlay.has(faction as never) &&
        (coreFactionDefinitions[faction]?.units.length ?? 0) > 0
    )!;
    state.adventure!.fields[spaceId]!.faction = other;
    const rebound = drawGuardArmy(state, state.adventure!.fields[spaceId]!, 7);
    expect(rebound.every((draw) => coreUnitDefinitions[draw.unitDefId]?.faction === other)).toBe(true);
    expect(rebound.some((draw) => coreUnitDefinitions[draw.unitDefId]?.faction === revealed)).toBe(false);
  });

  it("falls back to the old draw-time roll for a legacy field the sweep never saw", () => {
    // Legacy snapshot shape: a Random Town field with no `faction` and no tile
    // of its own (the pre-2026-08-22 state). The fight must still work.
    const state = makeGame("rt-reveal-legacy");
    const field = randomTownField("71,71");
    state.adventure!.fields[field.spaceId] = field;
    delete (field as { tileInstanceId?: string }).tileInstanceId;
    expect(field.faction).toBeUndefined();

    const draws = drawGuardArmy(state, field, 7);
    expect(field.faction).toBeTruthy();
    expect(draws.every((draw) => coreUnitDefinitions[draw.unitDefId]?.faction === field.faction)).toBe(true);
  });
});

/**
 * Reported (2026-09-04): "when you attack random town and control guards —
 * still cannot attack walls". A Random Town fight IS a siege
 * (`combat.siege.townPlayerId = NEUTRAL_PLAYER_ID`), so the BESIEGER's adjacent
 * ground/flying units must be able to bring a Wall/Gate down exactly as in a
 * normal town siege, whether or not a neutral-control mode is on — while the
 * player DRIVING the guards (the town side) is never offered the town's own
 * fortifications. Each case asserts the observable outcome: the offer, and the
 * fortification really leaving `siege`.
 */

/** Drive the fight to the attacker's first activation (guards slowed to last). */
function driveToAttackerActivation(start: GameState): GameState {
  let state = start;
  for (const unit of Object.values(state.combat!.units)) {
    unit.initiative = unit.controllerId === "p1" ? 30 : 1;
  }
  state.combat!.activeUnitId = null;
  for (let step = 0; step < 40; step += 1) {
    const combat = state.combat;
    if (!combat) break;
    const active = combat.activeUnitId ? combat.units[combat.activeUnitId] : null;
    if (
      state.phase === "combat" &&
      active &&
      active.controllerId === "p1" &&
      !state.pendingChoice
    ) {
      break;
    }
    const legal = getLegalActions(state, "p1");
    const pick =
      legal.find((entry) => entry.action.type === "CONTINUE_NEUTRAL_STEP") ??
      legal.find((entry) => entry.action.type === "FINISH_NEUTRAL_PLACEMENT") ??
      legal.find((entry) => entry.action.type === "CHOOSE_OPTION") ??
      legal[0];
    if (!pick) break;
    state = applyOk(state, pick.action);
  }
  return state;
}

/** The Random Town fight with p1's single unit parked beside the Gate at 13. */
function siegeAtTheGate(seed: string, manualGuardControl: boolean): GameState {
  const base = makeGame(seed);
  if (manualGuardControl) {
    base.adventure!.manualGuardControl = true;
  }
  const hero = getMainHero(base, "p1")!;
  const field = randomTownField();
  base.adventure!.fields[field.spaceId] = field;
  hero.spaceId = field.spaceId;
  base.players.p1.hand = [];
  startNeutralEncounter(base, hero, field);
  // Park the unit directly below whichever middle-row space carries the Gate.
  const gate = base.combat!.siege!.gatePosition!;
  let placed = applyOk(base, {
    type: "PLACE_COMBAT_UNIT",
    playerId: "p1",
    armyUnitId: base.players.p1.army[0].id,
    position: gate + 4
  });
  placed = applyOk(placed, { type: "FINISH_COMBAT_PLACEMENT", playerId: "p1" });
  return driveToAttackerActivation(placed);
}

describe("Random Town siege — the attacker batters the fortifications", () => {
  for (const manual of [false, true]) {
    it(`the besieger fells the Gate with manual guard control ${manual ? "ON" : "OFF (CONTROL)"}`, () => {
      const state = siegeAtTheGate("rt-siege-gate", manual);
      expect(state.phase).toBe("combat");
      const gate = state.combat!.siege!.gatePosition;
      expect(gate).not.toBeNull();

      const offer = getLegalActions(state, "p1").find(
        (entry) =>
          entry.action.type === "ATTACK_FORTIFICATION" &&
          entry.action.target.kind === "gate"
      );
      expect(offer, "the besieger must be offered the Gate").toBeTruthy();

      // The offer must survive the HOSTED client's frame too — a client that
      // cannot see `combat.siege` renders no clickable Wall/Gate at all.
      const seatFrame = redactStateForSeat(state, "p1") as unknown as GameState;
      expect(seatFrame.combat?.siege?.gatePosition).toBe(gate);
      expect(
        getLegalActions(seatFrame, "p1").some(
          (entry) =>
            entry.action.type === "ATTACK_FORTIFICATION" &&
            entry.action.target.kind === "gate"
        )
      ).toBe(true);

      // Observable outcome: the Gate really leaves the siege state.
      const after = applyOk(state, offer!.action);
      expect(after.combat!.siege!.gatePosition).toBeNull();
    });
  }

  it("the player DRIVING the guards is never offered the town's own fortifications", () => {
    let state = siegeAtTheGate("rt-siege-guardside", true);
    // Hand the activation on until a NEUTRAL guard (driven by p1 under manual
    // guard control) is the active unit.
    for (let step = 0; step < 40; step += 1) {
      const combat = state.combat;
      if (!combat) break;
      const active = combat.activeUnitId ? combat.units[combat.activeUnitId] : null;
      if (
        state.phase === "combat" &&
        active &&
        active.controllerId === NEUTRAL_PLAYER_ID &&
        !state.pendingChoice
      ) {
        const legal = getLegalActions(state, "p1");
        // The guard IS being driven by p1 here (manual guard control) …
        expect(legal.length).toBeGreaterThan(0);
        // … and none of its options touches the fortifications it defends.
        expect(legal.some((entry) => entry.action.type === "ATTACK_FORTIFICATION")).toBe(false);
        expect(state.combat!.siege!.walls.length).toBeGreaterThan(0);
        return;
      }
      const legal = getLegalActions(state, "p1");
      const pick =
        legal.find((entry) => entry.action.type === "CONTINUE_NEUTRAL_STEP") ??
        legal.find((entry) => entry.action.type === "END_ACTIVATION") ??
        legal.find((entry) => entry.action.type === "CHOOSE_OPTION") ??
        legal[0];
      if (!pick) break;
      state = applyOk(state, pick.action);
    }
    throw new Error("no neutral guard activation was reached");
  });
});
