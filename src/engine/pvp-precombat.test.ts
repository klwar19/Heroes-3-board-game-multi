import { describe, expect, it } from "vitest";
import {
  applyAction,
  createAdventureGameState,
  createInitialGameState,
  getLegalActions
} from "./index";
import { getMainHero } from "./adventure";
import { startPlayerCombat } from "./adventure-reducer";
import { chooseComputerAction } from "./computer/policy";
import type { GameAction, GameState, PlayerId, PlayerVisibleState } from "./state";

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((e) => e.message).join("; ")).toEqual([]);
  return result.state;
}

const offersRetreat = (state: GameState, playerId: PlayerId) =>
  getLegalActions(state, playerId).some((l) => l.action.type === "RETREAT_FROM_COMBAT");
const offersAccept = (state: GameState, playerId: PlayerId) =>
  getLegalActions(state, playerId).some((l) => l.action.type === "ACCEPT_COMBAT");

// ===========================================================================
// Part 1 — the "Retreat button always shows" bug: Retreat / Surrender is a
// start-of-combat decision and must vanish the moment a unit begins fighting.
// ===========================================================================

describe("PvP Retreat / Surrender — only before any unit acts", () => {
  /** A round-1 PvP combat already past deployment (phase "combat"). */
  function pvpFight(seed: string): GameState {
    const state = createAdventureGameState({ startingBuildings: [], seed, difficulty: "normal", rollFirstPlayer: false });
    state.combat = createInitialGameState(seed).combat;
    state.combat!.context = {
      kind: "player",
      attackerHeroId: "hero_p1",
      defenderHeroId: "hero_p2",
      fieldId: state.heroes.hero_p1.spaceId ?? "0,0"
    };
    state.combat!.setup = null;
    state.combat!.round = 1;
    state.phase = "combat";
    state.activePlayerId = "p1";
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    for (const unit of Object.values(state.combat!.units)) {
      unit.activatedThisRound = false;
      unit.movedThisActivation = false;
      unit.attackedThisActivation = false;
      unit.attacksThisActivation = 0;
    }
    return state;
  }

  it("offers Retreat to BOTH heroes at the opening, before anyone has acted", () => {
    const state = pvpFight("escape-open");
    expect(offersRetreat(state, "p1")).toBe(true);
    expect(offersRetreat(state, "p2")).toBe(true);
  });

  it("withdraws Retreat from everyone once a single unit has begun fighting", () => {
    const state = pvpFight("escape-closed");
    // Any one unit having activated this round closes the start-of-combat window.
    Object.values(state.combat!.units)[0].activatedThisRound = true;

    expect(offersRetreat(state, "p1")).toBe(false);
    expect(offersRetreat(state, "p2")).toBe(false);
  });

  it("withdraws Retreat the instant the active unit has only moved (not yet ended its turn)", () => {
    const state = pvpFight("escape-moved");
    const active = Object.values(state.combat!.units)[0];
    active.movedThisActivation = true; // mid-activation: fighting has begun

    expect(offersRetreat(state, "p1")).toBe(false);
    expect(offersRetreat(state, "p2")).toBe(false);
  });

  it("the engine rejects a RETREAT_FROM_COMBAT action after a unit has acted", () => {
    const state = pvpFight("escape-reject");
    Object.values(state.combat!.units)[0].activatedThisRound = true;

    const rejected = applyAction(state, { type: "RETREAT_FROM_COMBAT", playerId: "p1" });
    expect(rejected.errors.length).toBeGreaterThan(0);
    expect(rejected.state.combat?.outcome ?? null).toBeNull();
  });

  it("still ACCEPTS a Retreat at the opening (the legitimate decision point)", () => {
    const state = pvpFight("escape-accept");
    const ok = applyAction(state, { type: "RETREAT_FROM_COMBAT", playerId: "p1" });
    expect(ok.errors).toEqual([]);
    expect(ok.state.combat?.outcome).toMatchObject({ defeatedPlayerId: "p1", reason: "retreat" });
  });
});

// ===========================================================================
// Part 2 — PvP pre-battle preparation window: when an enemy hero attacks, BOTH
// the attacker and the defender may build / recruit / buy spells (on the map,
// with towns and resources in full view), then each presses Accept. Deployment
// begins only once both sides have accepted.
// ===========================================================================

describe("PvP pre-battle preparation window (both sides)", () => {
  /** Triggers a hero-vs-hero PvP combat with p1 attacking p2. */
  function attack(seed: string, prep: (state: GameState) => void = () => {}): GameState {
    const state = createAdventureGameState({ startingBuildings: [], seed, difficulty: "normal", rollFirstPlayer: false });
    // Give both sides fresh town actions and resources to spend in prep.
    for (const id of ["p1", "p2"] as const) {
      state.players[id].townTokens = { build: true, population: true, spellBook: true };
      state.players[id].resources = { gold: 50, buildingMaterials: 20, valuables: 20, magic: 20 } as never;
    }
    prep(state);
    const attacker = getMainHero(state, "p1")!;
    const defender = getMainHero(state, "p2")!;
    startPlayerCombat(state, attacker, defender, defender.spaceId ?? "0,0");
    return state;
  }

  it("a computer defender spends every useful town action before accepting a human attack", () => {
    let state = attack("prep-computer-spend", (s) => {
      s.sessionMode = "single-player";
      s.controllers = {
        ...(s.controllers ?? {}),
        p2: { kind: "computer", difficulty: "standard", policyVersion: 1 },
      };
      s.players.p2.hand = [];
      s.towns.town_p2.buildings.push(`${s.players.p2.factionId}.citadel`);
      s.players.p2.army.shift();
    });
    const actionsBeforeAccept: GameAction["type"][] = [];

    for (let safety = 0; safety < 20; safety += 1) {
      const legalActions = getLegalActions(state, "p2");
      const decision = chooseComputerAction({
        playerId: "p2",
        state: state as unknown as PlayerVisibleState,
        legalActions,
      });
      expect(
        decision,
        `computer owns a preparation decision; prior=${actionsBeforeAccept.join(",")} legal=${legalActions
          .map((legal) => legal.action.type)
          .join(",")}`,
      ).toBeTruthy();
      if (
        decision!.action.type === "ACCEPT_COMBAT" ||
        decision!.action.type === "RETREAT_FROM_COMBAT" ||
        decision!.action.type === "SURRENDER_COMBAT"
      ) {
        // A prep exit is allowed to win only after the finite town
        // acquisition actions have been consumed or become unaffordable —
        // and for a healthy defender that exit is READYING UP, never a
        // tie-hash retreat that hands the attacker the fight for free.
        expect(decision!.action.type, "a healthy defender readies up").toBe("ACCEPT_COMBAT");
        expect(
          legalActions.some((legal) =>
            ["BUILD_STRUCTURE", "POPULATION_ACTION", "SPELL_BOOK_ACTION"].includes(
              legal.action.type,
            ),
          ),
          "no town purchase remains when the computer readies",
        ).toBe(false);
        state = applyOk(state, decision!.action);
        break;
      }
      actionsBeforeAccept.push(decision!.action.type);
      const applied = applyAction(state, decision!.action);
      expect(
        applied.errors,
        `${decision!.action.type}: ${applied.errors.map((error) => error.message).join("; ")}`,
      ).toEqual([]);
      state = applied.state;
    }

    expect(actionsBeforeAccept).toContain("BUILD_STRUCTURE");
    expect(actionsBeforeAccept).toContain("POPULATION_ACTION");
    expect(
      state.combat?.prep?.accepted.includes("p2"),
      "after shopping, the computer readies up for the fight",
    ).toBe(true);
  });

  it("a computer defender with NOTHING to prepare ALWAYS readies up — never a tie-hash retreat", () => {
    // Only the four exit actions remain legal in prep here. Before the fix the
    // exits all tied at score 225 and the seed hash picked one — a healthy
    // defender retreated from a winnable fight on ~2/3 of seeds. ACCEPT must
    // outrank every escape strictly, so all seeds agree.
    for (const seed of ["prep-exit-a", "prep-exit-b", "prep-exit-c", "prep-exit-d", "prep-exit-e", "prep-exit-f"]) {
      const state = attack(seed, (s) => {
        s.sessionMode = "single-player";
        s.controllers = {
          ...(s.controllers ?? {}),
          p2: { kind: "computer", difficulty: "standard", policyVersion: 1 },
        };
        s.players.p2.hand = [];
        s.players.p2.townTokens = { build: false, population: false, spellBook: false };
      });
      const decision = chooseComputerAction({
        playerId: "p2",
        state: state as unknown as PlayerVisibleState,
        legalActions: getLegalActions(state, "p2"),
      });
      expect(decision?.action.type, `${seed}: a healthy defender readies up`).toBe("ACCEPT_COMBAT");
    }
  });

  it("opens for BOTH participants — each offered Accept, Retreat and town actions", () => {
    const state = attack("prep-open");
    expect(state.combat?.prep?.accepted).toEqual([]);
    expect(state.phase).toBe("combat-setup");
    // No single priority holder: both sides may prepare at the same time.
    expect(state.priorityPlayerId).toBeNull();

    for (const id of ["p1", "p2"] as const) {
      expect(offersAccept(state, id), `${id} is offered Accept`).toBe(true);
      expect(offersRetreat(state, id), `${id} is offered Retreat`).toBe(true);
      const legal = getLegalActions(state, id);
      expect(legal.some((l) => l.action.type === "BUILD_STRUCTURE"), `${id} may build`).toBe(true);
    }
  });

  it("opens even when a side has no town action left — they simply accept", () => {
    const state = attack("prep-none-tokens", (s) => {
      s.players.p2.townTokens = { build: false, population: false, spellBook: false };
    });
    // The window still opens for both; the defender just has nothing to spend.
    expect(state.combat?.prep?.accepted).toEqual([]);
    expect(offersAccept(state, "p2")).toBe(true);
    expect(getLegalActions(state, "p2").some((l) => l.action.type === "BUILD_STRUCTURE")).toBe(false);
    // The attacker, with fresh tokens, may still build.
    expect(getLegalActions(state, "p1").some((l) => l.action.type === "BUILD_STRUCTURE")).toBe(true);
  });

  it("lets the ATTACKER prepare too (build during the window)", () => {
    let state = attack("prep-attacker-build");
    const goldBefore = state.players.p1.resources.gold;
    state = applyOk(state, {
      type: "BUILD_STRUCTURE",
      playerId: "p1",
      townId: "town_p1",
      buildingId: "castle.dwelling_bronze"
    });
    expect(state.towns.town_p1.buildings).toContain("castle.dwelling_bronze");
    expect(state.players.p1.resources.gold).toBeLessThan(goldBefore);
    // The window stays open — nobody has accepted yet.
    expect(state.combat?.prep?.accepted).toEqual([]);
  });

  it("requires BOTH accepts before deployment begins (attacker first)", () => {
    let state = attack("prep-both-accept");

    // The defender accepts first: still in prep, waiting on the attacker.
    state = applyOk(state, { type: "ACCEPT_COMBAT", playerId: "p2" });
    expect(state.combat?.prep?.accepted).toEqual(["p2"]);
    expect(state.combat?.setup).not.toBeNull();
    // Deployment is still locked: the attacker cannot place a unit yet.
    const tooEarly = applyAction(state, {
      type: "PLACE_COMBAT_UNIT",
      playerId: "p1",
      armyUnitId: state.players.p1.army[0].id,
      position: 13
    });
    expect(tooEarly.errors.length).toBeGreaterThan(0);

    // The attacker accepts: prep clears and deployment opens, attacker first.
    state = applyOk(state, { type: "ACCEPT_COMBAT", playerId: "p1" });
    expect(state.combat?.prep ?? null).toBeNull();
    expect(state.priorityPlayerId).toBe("p1");
    expect(state.phase).toBe("combat-setup");
    expect(state.combat?.setup).not.toBeNull();
  });

  it("locks a side in once they accept — no more town actions, no double accept", () => {
    let state = attack("prep-lock", (s) => {
      // Free a bronze unit so the bronze dwelling actually unlocks a recruit.
      s.players.p2.army = s.players.p2.army.filter((u) => u.unitDefId !== "necropolis.skeletons");
    });
    state = applyOk(state, { type: "ACCEPT_COMBAT", playerId: "p2" });

    // The accepted defender gets no further actions and is rejected if they try.
    expect(getLegalActions(state, "p2")).toEqual([]);
    const buildAfter = applyAction(state, {
      type: "BUILD_STRUCTURE",
      playerId: "p2",
      townId: "town_p2",
      buildingId: "necropolis.dwelling_bronze"
    });
    expect(buildAfter.errors.length).toBeGreaterThan(0);
    const acceptTwice = applyAction(state, { type: "ACCEPT_COMBAT", playerId: "p2" });
    expect(acceptTwice.errors.length).toBeGreaterThan(0);

    // The attacker is still free to prepare.
    expect(getLegalActions(state, "p1").some((l) => l.action.type === "BUILD_STRUCTURE")).toBe(true);
  });

  it("recruits a fresh unit during prep that then joins the army for deployment", () => {
    let state = attack("prep-recruit", (s) => {
      // Free up the bronze units so there is actually something to recruit once
      // the bronze dwelling stands (each unit card exists only once). Keep a
      // higher-tier unit so the army is not empty (no auto-restore).
      s.players.p2.army = s.players.p2.army.filter(
        (unit) => unit.unitDefId !== "necropolis.skeletons" && unit.unitDefId !== "necropolis.zombies"
      );
    });
    // Unlock a recruit tier first (build the bronze dwelling).
    state = applyOk(state, {
      type: "BUILD_STRUCTURE",
      playerId: "p2",
      townId: "town_p2",
      buildingId: "necropolis.dwelling_bronze"
    });

    const armyBefore = state.players.p2.army.length;
    const recruit = getLegalActions(state, "p2").find((l) => l.action.type === "POPULATION_ACTION");
    expect(recruit, "a recruit/reinforce should be available in prep").toBeTruthy();
    state = applyOk(state, recruit!.action);

    expect(state.players.p2.army.length).toBeGreaterThan(armyBefore);
    // The window is still open until both sides accept.
    expect(state.combat?.prep?.accepted).toEqual([]);
  });

  it("lets either side Retreat straight out of the prep window (and closes prep)", () => {
    const fromDefender = applyAction(attack("prep-retreat-d"), { type: "RETREAT_FROM_COMBAT", playerId: "p2" });
    expect(fromDefender.errors).toEqual([]);
    expect(fromDefender.state.combat?.outcome).toMatchObject({ defeatedPlayerId: "p2", reason: "retreat" });
    // The prep window closes so the result (not the map) takes over.
    expect(fromDefender.state.combat?.prep ?? null).toBeNull();

    const fromAttacker = applyAction(attack("prep-retreat-a"), { type: "RETREAT_FROM_COMBAT", playerId: "p1" });
    expect(fromAttacker.errors).toEqual([]);
    expect(fromAttacker.state.combat?.outcome).toMatchObject({ defeatedPlayerId: "p1", reason: "retreat" });
    expect(fromAttacker.state.combat?.prep ?? null).toBeNull();
  });

  it("rejects a town action from a non-participant during prep", () => {
    // p3 (if seated) is not part of this fight; even with a town it cannot prep.
    const state = attack("prep-nonparticipant");
    const rejected = applyAction(state, {
      type: "BUILD_STRUCTURE",
      playerId: "p1",
      townId: "town_p2", // p1 may not build in p2's town
      buildingId: "necropolis.dwelling_bronze"
    });
    expect(rejected.errors.length).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // Hand cards in prep: a held card (the Legion of Skeletons / Sandro's Cloak,
  // an artifact, an ability …) may be PLAYED to prepare for the fight, exactly
  // as on a map turn — so it is never wasted just because the enemy attacked
  // mid-turn. Only map-MOVEMENT Spells (Town Portal) are withheld.
  // -------------------------------------------------------------------------

  it("lets a participant PLAY a hand card (the Legion of Skeletons) to prepare for the battle", () => {
    const state = attack("prep-play-card", (s) => {
      s.players.p2.hand = ["specialty.sandro.6"]; // Cloak of the Undead King VI → Legion of Skeletons
    });
    // The defender (Necropolis, with Skeletons in the army) is offered the play.
    const legionPlay = getLegalActions(state, "p2").find(
      (l) => l.action.type === "PLAY_CARD" && l.action.cardId === "specialty.sandro.6"
    );
    expect(legionPlay, "the Legion of Skeletons should be playable in the prep window").toBeTruthy();

    // Playing it rides the transform onto the Skeletons army card for the battle.
    const after = applyOk(state, legionPlay!.action);
    const skeletons = after.players.p2.army.find((u) => u.unitDefId === "necropolis.skeletons");
    expect(skeletons?.transforms?.some((t) => t.name === "Legion of Skeletons")).toBe(true);
    // Preparing is not accepting — the window stays open.
    expect(after.combat?.prep?.accepted).toEqual([]);
  });

  it("withholds a map-movement Spell (Town Portal) in prep, but still offers real prep cards", () => {
    const state = attack("prep-no-town-portal", (s) => {
      s.players.p2.hand = ["spell.town_portal", "specialty.sandro.6"];
    });
    const offered = getLegalActions(state, "p2").map((l) => l.action);
    // Town Portal would teleport the hero out of the pending fight — never offered.
    expect(offered.some((a) => a.type === "CAST_SPELL" && a.cardId === "spell.town_portal")).toBe(false);
    expect(offered.some((a) => "cardId" in a && a.cardId === "spell.town_portal")).toBe(false);
    // The Legion (a genuine prep play) still is.
    expect(offered.some((a) => a.type === "PLAY_CARD" && a.cardId === "specialty.sandro.6")).toBe(true);
  });

  it("lets the ATTACKER prepare with hand cards too — not just the defender", () => {
    const state = attack("prep-attacker-card", (s) => {
      s.players.p1.hand = ["specialty.sandro.6"];
      // Give the attacker a Skeletons unit to ride the Legion onto.
      s.players.p1.army = [...s.players.p1.army, { id: "p1_skel", unitDefId: "necropolis.skeletons", side: "few" }];
    });
    const legionPlay = getLegalActions(state, "p1").find(
      (l) => l.action.type === "PLAY_CARD" && l.action.cardId === "specialty.sandro.6"
    );
    expect(legionPlay, "the attacker should also play prep cards in the window").toBeTruthy();
    const after = applyOk(state, legionPlay!.action);
    const skeletons = after.players.p1.army.find((u) => u.id === "p1_skel");
    expect(skeletons?.transforms?.some((t) => t.name === "Legion of Skeletons")).toBe(true);
  });
});
