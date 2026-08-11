// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createAdventureGameState, createInitialGameState, type GameState } from "@/engine";
import { buildCoachTip, cardUnplayableReason } from "./helper-coach";

describe("buildCoachTip", () => {
  it("returns null during setup lobby", () => {
    const state = createInitialGameState("helper-coach-setup") as GameState;
    // Coach is intentionally silent while the table is still in map setup.
    state.phase = "setup";
    state.setupLobby = {
      scenarioId: "homecoming",
      seats: [],
      options: {} as never
    } as GameState["setupLobby"];
    expect(buildCoachTip(state, "p1", [])).toBeNull();
  });

  it("surfaces the viewer's own choice prompt", () => {
    const state = createInitialGameState("helper-coach-choice") as GameState;
    state.pendingChoice = {
      id: "c1",
      type: "OPTION_CHOICE",
      playerId: "p1",
      prompt: "Empower a Statistic",
      options: [{ label: "Attack" }],
      context: "city-hall",
      returnPhase: "combat"
    } as GameState["pendingChoice"];
    const tip = buildCoachTip(state, "p1", []);
    expect(tip?.tone).toBe("choice");
    expect(tip?.detail).toContain("Empower a Statistic");
  });

  it("explains waiting when another seat owns a choice", () => {
    const state = createInitialGameState("helper-coach-wait") as GameState;
    state.pendingChoice = {
      id: "c1",
      type: "OPTION_CHOICE",
      playerId: "p2",
      prompt: "Pick a reward",
      options: [{ label: "A" }],
      context: "city-hall",
      returnPhase: "combat"
    } as GameState["pendingChoice"];
    const tip = buildCoachTip(state, "p1", []);
    expect(tip?.tone).toBe("wait");
    expect(tip?.headline).toMatch(/Waiting/i);
  });

  it("coaches the active unit owner in combat", () => {
    const state = createInitialGameState("helper-coach-combat") as GameState;
    state.pendingChoice = null;
    state.reactionWindow = null;
    const activeId = state.combat?.activeUnitId;
    expect(activeId).toBeTruthy();
    const unit = state.combat!.units[activeId!];
    // Ensure the viewer owns the active unit for a "go" tip.
    if (unit.controllerId !== "p1") {
      unit.controllerId = "p1";
    }
    unit.attackedThisActivation = false;
    unit.activatedThisRound = false;
    const tip = buildCoachTip(state, "p1", []);
    expect(tip).not.toBeNull();
    expect(tip?.tone).toBe("go");
    expect(tip?.headline).toMatch(new RegExp(unit.name));
  });
});

describe("cardUnplayableReason", () => {
  it("names map-only timing for map cards during combat", () => {
    const state = createInitialGameState("helper-coach-map-card") as GameState;
    // Town Portal is a classic map spell (timing "map").
    const reason = cardUnplayableReason(state, "p1", "spell.town_portal");
    expect(reason.toLowerCase()).toMatch(/map/);
  });

  it("blocks plays while another player holds Instant priority", () => {
    const state = createInitialGameState("helper-coach-instant") as GameState;
    state.reactionWindow = {
      id: "rw1",
      priorityPlayerId: "p2",
      trigger: { type: "UNIT_ATTACK_DECLARED" },
      triggerEvent: { type: "UNIT_ATTACK_DECLARED" },
      stackItemId: "s1",
      legalReactions: [],
      passedPlayerIds: [],
      allowedPlayerIds: ["p2"],
      closesWhen: "all-pass"
    } as unknown as GameState["reactionWindow"];
    const reason = cardUnplayableReason(state, "p1", "spell.bless");
    expect(reason.toLowerCase()).toMatch(/waiting|instant/i);
  });

  it("flags trayActive so the reaction tray is not interrupted", () => {
    const state = createInitialGameState("helper-coach-tray") as GameState;
    const reason = cardUnplayableReason(state, "p1", "spell.bless", { trayActive: true });
    expect(reason.toLowerCase()).toMatch(/instant window|finish|pass/i);
  });

  it("reports spell limit reached", () => {
    const state = createInitialGameState("helper-coach-spell-limit") as GameState;
    state.reactionWindow = null;
    state.pendingChoice = null;
    state.players.p1.combatStats.spellsCastThisRound = 99;
    const reason = cardUnplayableReason(state, "p1", "spell.magic_arrow");
    expect(reason.toLowerCase()).toMatch(/spell limit/);
  });

  it("explains that Chain Lightning needs three battlefield units", () => {
    const state = createInitialGameState("helper-coach-chain-three") as GameState;
    for (const unitId of Object.keys(state.combat!.units)) {
      if (unitId !== "unit_p1_marksmen" && unitId !== "unit_p2_skeletons") {
        delete state.combat!.units[unitId];
      }
    }
    const reason = cardUnplayableReason(state, "p1", "spell.chain_lightning");
    expect(reason).toContain("requires 3 living units");
  });

  it("explains Meteor Shower's adjacent-target requirement", () => {
    const state = createInitialGameState("helper-coach-meteor-adjacent") as GameState;
    const separated = [0, 3, 8, 11, 16, 19];
    Object.values(state.combat!.units).forEach((unit, index) => {
      unit.position = separated[index];
    });
    const reason = cardUnplayableReason(state, "p1", "specialty.deemer.6");
    expect(reason).toContain("2 living adjacent targets");
  });

  it("Polish Cast a Spell: points at own unit activation, not a reaction Instant window", () => {
    const state = createInitialGameState("helper-coach-polish-cast") as GameState;
    const adventure = createAdventureGameState({
      seed: "helper-coach-polish-cast-rules",
      ruleset: "binh",
      rollFirstPlayer: false,
      houseRules: { "polish-spell-book": true }
    });
    state.adventure = adventure.adventure;
    state.ruleset = "binh";
    state.reactionWindow = null;
    state.pendingChoice = null;
    state.combat!.activeUnitId = "unit_p2_skeletons";
    state.players.p1.hand = ["spell.cast_a_spell"];
    state.players.p1.spellBook = ["spell.magic_arrow"];
    const reason = cardUnplayableReason(state, "p1", "spell.cast_a_spell");
    expect(reason.toLowerCase()).toMatch(/own unit|activation|before it attacks/);
    expect(reason.toLowerCase()).not.toMatch(/instant spell|power cards can empower/);
  });

  // REPORTED 2026-08-11: "cannot play Ash speciality IV card". The printed
  // ground-or-flying gate is real and correctly enforced by the engine — but a
  // holder whose whole line is RANGED (Inferno's Magogs, Tower's Gremlins) was
  // only ever told "No legal play right now (check targets or unit state)",
  // which reads as a broken card. The hint now names the printed restriction.
  describe("printed unit-TYPE gates are named", () => {
    function bloodlustState(seed: string, ownType: "ground" | "ranged"): GameState {
      const state = createInitialGameState(seed) as GameState;
      state.reactionWindow = null;
      state.pendingChoice = null;
      for (const unit of Object.values(state.combat!.units)) {
        if (unit.controllerId === "p1") {
          unit.type = ownType;
        }
      }
      const active = state.combat!.activeUnitId ? state.combat!.units[state.combat!.activeUnitId] : undefined;
      if (active) {
        active.controllerId = "p1";
        active.type = ownType;
        active.activatedThisRound = false;
        active.attackedThisActivation = false;
      }
      return state;
    }

    it("Bloodlust IV names the ground-or-flying restriction when every own unit is ranged", () => {
      const state = bloodlustState("helper-coach-ash-iv-ranged", "ranged");
      const reason = cardUnplayableReason(state, "p1", "specialty.ash.4");
      expect(reason).toMatch(/ground.*flying/i);
      expect(reason).toMatch(/unit of yours/i);
    });

    it("CONTROL: with a ground unit on the board the hint falls through to the generic reasons", () => {
      const state = bloodlustState("helper-coach-ash-iv-ground", "ground");
      // Make the active unit the OPPONENT's so the card is still unplayable —
      // but for a timing reason, not a unit-type one.
      state.combat!.activeUnitId = "unit_p2_skeletons";
      const reason = cardUnplayableReason(state, "p1", "specialty.ash.4");
      expect(reason).not.toMatch(/ground.*flying/i);
      expect(reason.toLowerCase()).toMatch(/own unit's activation/);
    });

    it("the instant sides (Bloodlust I / VI) name it too instead of promising an attack window", () => {
      const state = bloodlustState("helper-coach-ash-i-ranged", "ranged");
      for (const cardId of ["specialty.ash.1", "specialty.ash.6"]) {
        const reason = cardUnplayableReason(state, "p1", cardId);
        expect(reason, cardId).toMatch(/ground.*flying/i);
        expect(reason.toLowerCase(), cardId).not.toMatch(/waits for an attack/);
      }
    });

    it("CONTROL: a card with no printed unit-type gate is unaffected", () => {
      const state = bloodlustState("helper-coach-no-type-gate", "ranged");
      state.combat!.activeUnitId = "unit_p2_skeletons";
      const reason = cardUnplayableReason(state, "p1", "spell.bless");
      expect(reason).not.toMatch(/only lands on/i);
    });
  });
});
