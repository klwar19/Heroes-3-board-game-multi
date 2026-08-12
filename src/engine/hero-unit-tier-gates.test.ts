import { describe, expect, it } from "vitest";
import {
  applyAction,
  commanderCastCandidates,
  createAdventureGameState,
  createInitialGameState,
  getLegalActions,
  getMainHero,
  makeCommanderCombatUnit
} from "./index";
import { startNeutralEncounter } from "./adventure-reducer";
import type { CombatUnitState, GameAction, GameState } from "./state";

/**
 * SIBLING AUDIT for `unit.heroUnit` (Little Busters battlefield heroes): the
 * branch made hero units TIERLESS in `gradeRankOfUnit` (legal-actions +
 * reducer), the raid-boss Devour gate, artifact-set tier gates and
 * neutral-ai's `isNoTierTarget` — but two commanderSlug-keyed tier reads were
 * missed. Both are pinned here; each test FAILS if its `heroUnit` exclusion is
 * removed while its non-hero CONTROL keeps passing.
 */

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

describe("hero units are tierless at EVERY commanderSlug-keyed tier gate", () => {
  it("Ring of the Wayfarer's start-of-combat Paralysis never offers a hero unit (a plain gold body IS offered)", () => {
    let state = createAdventureGameState({ seed: "wayfarer-hero-unit", difficulty: "normal", rollFirstPlayer: false });
    if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
      state = apply(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
    }
    const hero = getMainHero(state, "p1")!;
    hero.level = 1;
    hero.spaceId = "guard-field";
    state.players.p1.hand = ["artifact.ring_of_the_wayfarer"];
    state.adventure!.fields["guard-field"] = {
      spaceId: "guard-field",
      tileInstanceId: "t",
      slot: 0,
      location: "empty_field",
      difficulty: 3,
      blackCube: false,
      flagOwnerId: null,
      everFlagged: false,
      settlementResource: null
    };
    startNeutralEncounter(state, hero, state.adventure!.fields["guard-field"]);
    const place = getLegalActions(state, "p1").find((entry) => entry.action.type === "PLACE_COMBAT_UNIT");
    expect(place, "a unit to place").toBeTruthy();
    state = apply(state, place!.action);

    // Two synthetic GOLD bodies on free attacker cells: one plain (the
    // CONTROL — gold is within the Ring's "any unit except Azure" ceiling),
    // one a Little Busters-style battlefield hero.
    const template = Object.values(state.combat!.units).find((unit) => unit.controllerId === "p1")!;
    const makeProbe = (id: string, position: number, heroUnit: boolean): CombatUnitState => {
      const probe: CombatUnitState = {
        ...structuredClone(template),
        id,
        position,
        grade: "gold",
        abilities: [],
        damage: 0,
        ...(heroUnit ? { heroUnit: true } : {})
      };
      delete (probe as { armyUnitId?: string }).armyUnitId;
      return probe;
    };
    state.combat!.units.unit_probe_plain = makeProbe("unit_probe_plain", 17, false);
    state.combat!.units.unit_probe_hero = makeProbe("unit_probe_hero", 18, true);

    state = apply(state, { type: "FINISH_COMBAT_PLACEMENT", playerId: "p1" });
    const choice = state.pendingChoice;
    expect(choice?.type === "OPTION_CHOICE" ? choice.context : null).toBe("wayfarer-paralysis");
    if (choice?.type !== "OPTION_CHOICE" || !choice.wayfarerParalysis) {
      return;
    }
    const offered = choice.wayfarerParalysis.unitIds;
    // CONTROL: the identical plain gold body IS a legal Paralysis target —
    // proving the exclusion below keys on `heroUnit`, not on grade or position.
    expect(offered, "the plain gold probe is offered").toContain("unit_probe_plain");
    // THE PIN: the hero unit shares the commander exemption (tierless).
    expect(offered, "a battlefield hero is never a Wayfarer target").not.toContain("unit_probe_hero");
  });

  it("a tier-laddered commander cast (Soul Eater's Animate Dead) never targets a hero unit", () => {
    const state = createInitialGameState();
    state.wog = { enabled: true, commanders: true, newObjects: false, newCreatures: false, artifacts: false };
    state.players.p1.commander = {
      slug: "soul_eater",
      // Magic grade 3 → cast Power 2 → the GOLD rung of maxTierByPower, so the
      // control below cannot pass merely because the ally is low-tier.
      grades: { attack: 0, defense: 0, health: 0, damage: 0, magic: 3, speed: 0 }
    };
    const commander = makeCommanderCombatUnit(state.players.p1, 9);
    expect(commander, "a commander combat unit").toBeTruthy();
    state.combat!.units[commander!.id] = commander!;

    const ally = Object.values(state.combat!.units).find(
      (unit) =>
        unit.controllerId === "p1" &&
        unit.id !== commander!.id &&
        unit.damage < unit.maxHealth &&
        unit.grade !== "azure" &&
        !unit.commanderSlug
    );
    expect(ally, "a graded friendly body").toBeTruthy();
    ally!.damage = 1; // Animate Dead is damagedOnly

    // CONTROL: as a plain graded unit it IS a legal cast target at this Power.
    expect(commanderCastCandidates(state, commander!).map((unit) => unit.id)).toContain(ally!.id);

    // THE PIN: flag the very same unit as a battlefield hero → tierless, so
    // the tier ladder can no longer reach it (the commander/bank/summon rule).
    ally!.heroUnit = true;
    expect(commanderCastCandidates(state, commander!).map((unit) => unit.id)).not.toContain(ally!.id);
  });
});
