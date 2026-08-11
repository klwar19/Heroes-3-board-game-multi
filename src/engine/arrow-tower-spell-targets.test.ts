import { describe, expect, it } from "vitest";
import { applyAction, createInitialGameState, getActivationOrder, getLegalActions } from "./index";
import { cardLibrary } from "@/data/cards/library";
import { effectRelocatesUnitOnBoard, makeArrowTowerUnit } from "./siege";
import { chooseComputerAction } from "./computer/policy";

import type { CardId, GameAction, GameState, PlayerId, UnitId } from "./state";

/**
 * USER RULING: "You should be able to cast aiming spells like magic arrow,
 * lightning, slow etc. on Arrow Tower."
 *
 * The Arrow Tower is a REAL combat unit that fights from position -1 (beside the
 * board). These tests pin, through the live action flow, that a unit-targeted
 * card really lands on it — damage wounds it, a lethal cast destroys it through
 * the normal removal path (siege bookkeeping cleared, no more shots), and the
 * debuffs that HAVE a meaning for a tower (Slow's initiative, Blind's Paralysis,
 * Forgetfulness, Disrupting Ray, Berserk) really change its behaviour.
 *
 * They also pin the ONE principled exclusion this change ADDED: a card effect
 * whose whole job is to MOVE a unit onto a battlefield cell (the Teleport Spell,
 * the Necklace of Swiftness's "move one space") can never target the Tower —
 * "not affected by anything related to its positioning". Before the fix both
 * physically dragged the Tower onto the board.
 *
 * Sandbox grades (createInitialGameState): p1 marksmen bronze/ranged, griffins
 * bronze/flying, crusaders silver/ground; p2 skeletons bronze/ground, vampires
 * silver/flying, dread_knights gold/ground. The Arrow Tower is SILVER, ranged,
 * ATK 4 / DEF 2 / HP 3 / initiative 9.
 */

const TOWER: UnitId = "siege_tower";

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

/** A p2-defended siege with a live Arrow Tower, p1 besieging in the open. */
function siegeWithTower(seed: string, options: { walls?: number[]; gate?: number | null } = {}): GameState {
  const state = createInitialGameState(seed);
  const combat = state.combat!;
  combat.obstacles = [];
  const tower = makeArrowTowerUnit(TOWER, "p2");
  combat.units[tower.id] = tower;
  combat.siege = {
    townPlayerId: "p2",
    walls: options.walls ?? [8, 10, 11],
    gatePosition: options.gate === undefined ? 9 : options.gate,
    arrowTowerUnitId: tower.id
  };
  // Keep the real bodies off the fortification row.
  combat.units.unit_p1_marksmen.position = 16;
  combat.units.unit_p1_griffins.position = 17;
  combat.units.unit_p1_crusaders.position = 19;
  combat.units.unit_p2_skeletons.position = 0;
  combat.units.unit_p2_vampires.position = 1;
  combat.units.unit_p2_dread_knights.position = 2;
  return state;
}

/**
 * Arms `caster` with `cardId` (plus spare Power statistics, so a cast that needs
 * Power can pay it) and opens that side's own activation.
 */
function armed(state: GameState, caster: PlayerId, cardId: CardId, powerCards = 4): GameState {
  const other = caster === "p1" ? "p2" : "p1";
  state.players[caster].hand = [cardId, ...Array.from({ length: powerCards }, () => "stat.power" as CardId)];
  state.players[other].hand = [];
  const own = Object.values(state.combat!.units).find(
    (unit) => unit.controllerId === caster && unit.id !== TOWER
  )!;
  state.combat!.activeUnitId = own.id;
  state.activePlayerId = caster;
  return state;
}

/** The SURFACED cast/play of `cardId` aimed at the Tower — the path the UI takes. */
function towerOffer(state: GameState, caster: PlayerId, cardId: CardId, optionIndex?: number) {
  return getLegalActions(state, caster).find((legal) => {
    const action = legal.action as {
      type: string;
      cardId?: string;
      optionIndex?: number;
      target?: { type?: string; unitId?: string };
    };
    return (
      (action.type === "CAST_SPELL" || action.type === "PLAY_CARD") &&
      action.cardId === cardId &&
      action.target?.type === "unit" &&
      action.target.unitId === TOWER &&
      (optionIndex === undefined || action.optionIndex === optionIndex)
    );
  });
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

/** Casts `cardId` at the Tower and resolves the stack, paying `power`. */
function castAtTower(
  state: GameState,
  caster: PlayerId,
  cardId: CardId,
  power = 0,
  optionIndex?: number
): GameState {
  const offer = towerOffer(state, caster, cardId, optionIndex);
  expect(offer, `${cardId} should be offered at the Arrow Tower`).toBeTruthy();
  const casted = applyOk(state, offer!.action);
  if (casted.stack[0]) {
    casted.stack[0].modifiers.spellPowerBonus = power;
  }
  return passAllReactions(casted);
}

// ---------------------------------------------------------------------------
// The ruling: aiming spells reach the Arrow Tower
// ---------------------------------------------------------------------------

describe("Arrow Tower — aiming spells target it", () => {
  // HONEST NOTE: this case passed BEFORE the fix too — the engine always offered
  // these casts. It is a regression pin, not the repro; the reported bug was that
  // the offer had no clickable surface (see
  // src/components/table/arrow-tower-spell-target.test.tsx for the real repro).
  it("the besieger's Magic Arrow / Lightning Bolt / Slow are all offered at the Tower", () => {
    for (const cardId of ["spell.magic_arrow", "spell.lightning_bolt", "spell.slow"] as CardId[]) {
      const state = armed(siegeWithTower(`offer-${cardId}`), "p1", cardId);
      expect(towerOffer(state, "p1", cardId), `${cardId} should be aimable at the Arrow Tower`).toBeTruthy();
    }
  });

  it("Magic Arrow really WOUNDS the Tower (and a bigger bolt wounds it more)", () => {
    const arrow = castAtTower(armed(siegeWithTower("arrow-dmg"), "p1", "spell.magic_arrow"), "p1", "spell.magic_arrow");
    expect(arrow.combat!.units[TOWER].damage).toBe(1); // Magic Arrow, Power 0 → 1

    const bolt = castAtTower(
      armed(siegeWithTower("bolt-dmg"), "p1", "spell.lightning_bolt"),
      "p1",
      "spell.lightning_bolt"
    );
    // CONTROL that the number is the SPELL's, not a flat "any spell = 1": the
    // Lightning Bolt ladder pays 2 at Power 0.
    expect(bolt.combat!.units[TOWER].damage).toBe(2);
    // Wounding it does NOT collapse it — it still stands and still shoots.
    expect(bolt.combat!.siege!.arrowTowerUnitId).toBe(TOWER);
    expect(
      getLegalActions(
        (() => {
          bolt.combat!.activeUnitId = TOWER;
          bolt.activePlayerId = "p2";
          return bolt;
        })(),
        "p2"
      ).some((legal) => legal.action.type === "ATTACK_UNIT" && legal.action.attackerId === TOWER),
      "a merely damaged Tower keeps shooting"
    ).toBe(true);
  });

  it("a LETHAL cast destroys the Tower through the normal removal path — it stops shooting", () => {
    const state = armed(siegeWithTower("arrow-lethal"), "p1", "spell.lightning_bolt");
    state.combat!.units[TOWER].damage = 2; // 1 Health left; the bolt deals 2

    const after = castAtTower(state, "p1", "spell.lightning_bolt");

    // Observable outcome, not an intermediate: the Tower is gone.
    expect(after.combat!.units[TOWER].damage).toBeGreaterThanOrEqual(after.combat!.units[TOWER].maxHealth);
    // The siege bookkeeping is cleared — the same field the Ballistics/Cyclops
    // demolition clears — so nothing thinks a Tower still stands.
    expect(after.combat!.siege!.arrowTowerUnitId).toBeNull();
    expect(after.eventLog.some((event) => event.type === "UNIT_REMOVED" && event.unitId === TOWER)).toBe(true);
    // And the dead Tower can no longer act.
    after.combat!.activeUnitId = TOWER;
    after.activePlayerId = "p2";
    expect(
      getLegalActions(after, "p2").some(
        (legal) => legal.action.type === "ATTACK_UNIT" && legal.action.attackerId === TOWER
      ),
      "a destroyed Arrow Tower never shoots again"
    ).toBe(false);
    // The Walls it was NOT holding up are untouched (the kill is the spell's, not
    // a breach collapse).
    expect(after.combat!.siege!.walls).toEqual([8, 10, 11]);
  });

  it("Slow really lowers the Tower's Initiative — it activates LATER in the round", () => {
    const before = siegeWithTower("slow-order");
    const orderBefore = getActivationOrder(before.combat!, before.activeEffects).map((unit) => unit.id);

    const after = castAtTower(armed(siegeWithTower("slow-order"), "p1", "spell.slow"), "p1", "spell.slow", 2);
    const tower = after.combat!.units[TOWER];
    // Power 2 Slow is −3 Initiative: 9 → 6.
    expect(
      after.activeEffects.some(
        (effect) =>
          effect.name === "Slow" &&
          effect.target?.type === "unit" &&
          effect.target.unitId === TOWER &&
          effect.modifiers.some((modifier) => modifier.type === "INITIATIVE_BONUS" && modifier.amount === -3)
      )
    ).toBe(true);
    expect(tower.initiative).toBe(9); // the PRINTED value is untouched…
    const orderAfter = getActivationOrder(after.combat!, after.activeEffects).map((unit) => unit.id);
    // …but the observable outcome — where it acts — really moves.
    expect(orderAfter.indexOf(TOWER)).toBeGreaterThan(orderBefore.indexOf(TOWER));
  });

  it("Blind really Paralyses the Tower", () => {
    const after = castAtTower(armed(siegeWithTower("blind-tower"), "p1", "spell.blind"), "p1", "spell.blind", 2);
    expect(after.combat!.units[TOWER].tokens?.some((token) => token.kind === "paralysis")).toBe(true);
  });

  it("Blind at too little Power fizzles on the SILVER Tower (the tier gate is unchanged)", () => {
    // CONTROL for the case above: the Tower is a real silver card, so Power 0
    // (bronze only) does nothing. It is NOT a gradeless bank guard.
    const after = castAtTower(armed(siegeWithTower("blind-low"), "p1", "spell.blind"), "p1", "spell.blind", 0);
    expect(after.combat!.units[TOWER].tokens?.some((token) => token.kind === "paralysis") ?? false).toBe(false);
    // …and the same Power DOES paralyse a bronze body, so the gate is what
    // stopped it, not "spells cannot reach the Tower".
    const bronze = armed(siegeWithTower("blind-bronze"), "p1", "spell.blind");
    const offer = getLegalActions(bronze, "p1").find((legal) => {
      const action = legal.action as { cardId?: string; target?: { unitId?: string } };
      return action.cardId === "spell.blind" && action.target?.unitId === "unit_p2_skeletons";
    })!;
    const resolved = passAllReactions(applyOk(bronze, offer.action));
    expect(resolved.combat!.units.unit_p2_skeletons.tokens?.some((token) => token.kind === "paralysis")).toBe(true);
  });

  it("Forgetfulness really silences the Tower's shot", () => {
    const after = castAtTower(
      armed(siegeWithTower("forget-tower"), "p1", "spell.forgetfulness"),
      "p1",
      "spell.forgetfulness",
      2
    );
    after.combat!.activeUnitId = TOWER;
    after.activePlayerId = "p2";
    const actions = getLegalActions(after, "p2");
    expect(
      actions.some((legal) => legal.action.type === "ATTACK_UNIT" && legal.action.attackerId === TOWER),
      "a Forgetful Arrow Tower cannot shoot"
    ).toBe(false);
    // It is silenced, not removed: it can still hold position.
    expect(actions.some((legal) => legal.action.type === "END_ACTIVATION")).toBe(true);
  });

  it("Disrupting Ray really suppresses the Tower's ability", () => {
    const after = castAtTower(
      armed(siegeWithTower("ray-tower"), "p1", "spell.disrupting_ray"),
      "p1",
      "spell.disrupting_ray",
      2
    );
    expect(
      after.activeEffects.some(
        (effect) =>
          effect.target?.type === "unit" &&
          effect.target.unitId === TOWER &&
          effect.modifiers.some((modifier) => modifier.type === "UNIT_ABILITY_SUPPRESSED")
      )
    ).toBe(true);
  });

  it("Berserk really binds the Tower to one forced target", () => {
    const before = siegeWithTower("berserk-tower");
    before.combat!.activeUnitId = TOWER;
    before.activePlayerId = "p2";
    const freeShots = getLegalActions(before, "p2").filter(
      (legal) => legal.action.type === "ATTACK_UNIT" && legal.action.attackerId === TOWER
    );
    expect(freeShots.length, "an unberserked Tower may shoot any enemy").toBeGreaterThan(1);

    const after = castAtTower(armed(siegeWithTower("berserk-tower"), "p1", "spell.berserk"), "p1", "spell.berserk", 4);
    after.combat!.activeUnitId = TOWER;
    after.activePlayerId = "p2";
    const forced = getLegalActions(after, "p2").filter(
      (legal) => legal.action.type === "ATTACK_UNIT" && legal.action.attackerId === TOWER
    );
    expect(forced).toHaveLength(1);
    // The forced shot really resolves (no stall on an off-board attacker).
    const resolved = applyOk(after, forced[0]!.action);
    const struck = (forced[0]!.action as { defenderId: UnitId }).defenderId;
    expect(resolved.combat!.units[struck]!.damage).toBeGreaterThan(0);
  });

  it("the DEFENDER may aim its own buffs at its Tower (Haste really speeds it up)", () => {
    const before = siegeWithTower("haste-tower");
    const orderBefore = getActivationOrder(before.combat!, before.activeEffects).map((unit) => unit.id);
    const after = castAtTower(armed(siegeWithTower("haste-tower"), "p2", "spell.haste"), "p2", "spell.haste", 2);
    const orderAfter = getActivationOrder(after.combat!, after.activeEffects).map((unit) => unit.id);
    expect(orderAfter.indexOf(TOWER)).toBeLessThan(orderBefore.indexOf(TOWER));
  });

  it("CONTROL: outside a siege nothing changed — a plain unit is still the target", () => {
    const state = createInitialGameState("no-siege");
    state.combat!.obstacles = [];
    armed(state, "p1", "spell.magic_arrow");
    const casts = getLegalActions(state, "p1").filter(
      (legal) => legal.action.type === "CAST_SPELL" && legal.action.cardId === "spell.magic_arrow"
    );
    expect(casts.length).toBeGreaterThan(0);
    expect(
      casts.every((legal) => {
        const target = (legal.action as { target?: { unitId?: string } }).target;
        return target?.unitId !== TOWER;
      })
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// The exclusion: the Tower is never RELOCATED onto the board
// ---------------------------------------------------------------------------

describe("Arrow Tower — never relocated onto the board", () => {
  it("the Teleport Spell is not offered at the Tower (it WAS, and dragged it onto a cell)", () => {
    const state = armed(siegeWithTower("teleport-refused"), "p2", "spell.teleport");
    expect(towerOffer(state, "p2", "spell.teleport"), "Teleport must never aim at the Arrow Tower").toBeFalsy();
    // CONTROL: the same cast IS offered at an ordinary friendly unit, so it is
    // the Tower that is excluded, not the spell that stopped working.
    expect(
      getLegalActions(state, "p2").some((legal) => {
        const action = legal.action as { cardId?: string; target?: { unitId?: string } };
        return action.cardId === "spell.teleport" && action.target?.unitId === "unit_p2_skeletons";
      })
    ).toBe(true);
  });

  it("a FORGED Teleport at the Tower is REJECTED and the Tower never moves", () => {
    const state = armed(siegeWithTower("teleport-forged"), "p2", "spell.teleport");
    const forged: GameAction = {
      type: "CAST_SPELL",
      playerId: "p2",
      cardId: "spell.teleport",
      target: { type: "unit", unitId: TOWER }
    };
    const result = applyAction(state, forged);
    // CAST_SPELL is offer-validated, so dropping the Tower from the offers IS
    // the enforcement — a hand-built action never reaches the resolution.
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.state.combat!.units[TOWER].position).toBe(-1);
    expect(
      result.state.pendingChoice?.type === "OPTION_CHOICE" &&
        result.state.pendingChoice.context === "combat-teleport"
    ).toBe(false);
    // CONTROL: the same forged shape at a legal target is ACCEPTED, so it is
    // the Tower that the guard refuses, not the payload that is malformed.
    const legalShape = applyAction(state, {
      ...forged,
      target: { type: "unit", unitId: "unit_p2_skeletons" }
    } as GameAction);
    expect(legalShape.errors).toEqual([]);
  });

  it("the Necklace of Swiftness's move arm is not offered at the Tower (it WAS, and stepped it to a cell)", () => {
    const state = armed(siegeWithTower("necklace-refused"), "p2", "artifact.necklace_of_swiftness", 0);
    expect(towerOffer(state, "p2", "artifact.necklace_of_swiftness", 1)).toBeFalsy();
    // CONTROL: the arm is alive for the defender's ordinary units.
    expect(
      getLegalActions(state, "p2").some((legal) => {
        const action = legal.action as { cardId?: string; optionIndex?: number; target?: { unitId?: string } };
        return (
          action.cardId === "artifact.necklace_of_swiftness" &&
          action.optionIndex === 1 &&
          action.target?.unitId === "unit_p2_skeletons"
        );
      })
    ).toBe(true);
  });

  it("a FORGED Necklace step at the Tower is REJECTED and the Tower never moves", () => {
    const state = armed(siegeWithTower("necklace-forged"), "p2", "artifact.necklace_of_swiftness", 0);
    const forged: GameAction = {
      type: "PLAY_CARD",
      playerId: "p2",
      cardId: "artifact.necklace_of_swiftness",
      optionIndex: 1,
      target: { type: "unit", unitId: TOWER }
    } as GameAction;
    const result = applyAction(state, forged);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.state.combat!.units[TOWER].position).toBe(-1);
    expect(
      result.state.pendingChoice?.type === "OPTION_CHOICE" && result.state.pendingChoice.context === "combat-step"
    ).toBe(false);
    const legalShape = applyAction(state, {
      ...forged,
      target: { type: "unit", unitId: "unit_p2_skeletons" }
    } as GameAction);
    expect(legalShape.errors).toEqual([]);
  });

  it("REGISTRY: the relocation list is exactly the shipped move-a-unit effects", () => {
    // A future card that MOVES a unit must join `effectRelocatesUnitOnBoard`, or
    // it will silently drag the Tower onto the board again. This sweep fails
    // when such an effect ships unlisted.
    const movers = new Set<string>();
    for (const card of Object.values(cardLibrary)) {
      if (card.implementationStatus !== "implemented") {
        continue;
      }
      const effects = [card.effect, ...(card.effect.type === "CHOOSE_ONE" ? card.effect.options.map((o) => o.effect) : [])];
      for (const effect of effects) {
        if (effect.type === "TELEPORT_UNIT" || effect.type === "MOVE_UNIT_ADJACENT") {
          movers.add(effect.type);
        }
      }
    }
    expect([...movers].sort()).toEqual(["MOVE_UNIT_ADJACENT", "TELEPORT_UNIT"]);
    for (const type of movers) {
      expect(effectRelocatesUnitOnBoard({ type }), `${type} must be listed as a relocation`).toBe(true);
    }
    // …and an ordinary damaging effect is NOT a relocation (the predicate is not
    // vacuously true).
    expect(effectRelocatesUnitOnBoard({ type: "DEAL_DAMAGE" })).toBe(false);
  });

  it("CONTROL: Chain Lightning still refuses the off-board Tower (its own rule, untouched)", () => {
    const state = armed(siegeWithTower("chain-tower"), "p1", "spell.chain_lightning");
    expect(towerOffer(state, "p1", "spell.chain_lightning")).toBeFalsy();
    expect(
      getLegalActions(state, "p1").some((legal) => {
        const action = legal.action as { cardId?: string; target?: { unitId?: string } };
        return action.cardId === "spell.chain_lightning" && action.target?.unitId === "unit_p2_skeletons";
      })
    ).toBe(true);
  });

  it("a computer besieger picks a legal action in a Tower siege and it applies (no stall)", () => {
    // The Tower has always been in the AI's damage-spell target list (this
    // change only REMOVES two offers), but a computer seat can assault a town,
    // so pin that the off-board position -1 neither throws in the scorers nor
    // leaves the runner without a move.
    const state = armed(siegeWithTower("ai-siege"), "p1", "spell.magic_arrow");
    const legalActions = getLegalActions(state, "p1");
    expect(legalActions.length).toBeGreaterThan(0);
    const decision = chooseComputerAction({
      playerId: "p1",
      state: state as unknown as Parameters<typeof chooseComputerAction>[0]["state"],
      legalActions
    });
    expect(decision, "the AI must always have something to do in a Tower siege").toBeTruthy();
    expect(applyAction(state, decision!.action).errors).toEqual([]);
  });

  it("CONTROL: the Catapult still never aims at the Tower", () => {
    // Guarded by the war-machine target list, not by this change — pinned here
    // so a future widening of the Tower's reachability cannot quietly add it.
    const state = siegeWithTower("catapult-tower");
    state.players.p1.permanents = ["war_machine.catapult"];
    state.players.p1.resources.buildingMaterials = 3;
    state.combat!.activeUnitId = null;
    state.activePlayerId = "p1";
    const rounded = applyOk(state, { type: "END_COMBAT_ROUND", playerId: "p1" });
    const fire = getLegalActions(rounded, "p1").find((legal) => legal.label.includes("Fire the Catapult"));
    expect(fire).toBeTruthy();
    const aiming = applyOk(rounded, fire!.action);
    const candidates =
      aiming.pendingChoice?.type === "ABILITY_TARGET_CHOICE" ? aiming.pendingChoice.candidateUnitIds : [];
    expect(candidates).not.toContain(TOWER);
    expect(candidates.length).toBeGreaterThan(0);
  });
});
