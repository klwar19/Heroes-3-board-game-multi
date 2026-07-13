// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createInitialGameState, type GameState } from "@/engine";
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
});
