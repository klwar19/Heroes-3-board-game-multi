import { describe, expect, it } from "vitest";
import {
  applyAction,
  createCombatSandboxLobbyState,
  createInitialGameState,
  getLegalActions,
  isCombatSandboxSetup,
  type GameState
} from "./index";

function applyOk(state: GameState, action: Parameters<typeof applyAction>[1]): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

describe("Battle Test free setup", () => {
  it("opens a combat-sandbox room in setup with both seats pre-filled", () => {
    const state = createCombatSandboxLobbyState("sandbox-lobby");
    expect(state.mode).toBe("combat-sandbox");
    expect(state.phase).toBe("setup");
    expect(isCombatSandboxSetup(state)).toBe(true);
    expect(state.combat).toBeNull();
    expect(state.combatSandboxSetup?.seats.p1.factionId).toBe("castle");
    expect(state.combatSandboxSetup?.seats.p2.factionId).toBe("necropolis");
    expect(state.combatSandboxSetup?.seats.p1.units.length).toBeGreaterThan(0);
    expect(state.combatSandboxSetup?.seats.p2.units.length).toBeGreaterThan(0);
  });

  it("lets either seat change faction, units and cards before begin", () => {
    let state = createCombatSandboxLobbyState("sandbox-configure");
    state = applyOk(state, {
      type: "SANDBOX_CONFIGURE_SEAT",
      playerId: "p1",
      seatId: "p1",
      factionId: "tower",
      heroDefId: "solmyr",
      units: [
        { unitDefId: "tower.gargoyles", side: "pack" },
        { unitDefId: "tower.genies", side: "few" }
      ],
      hand: ["spell.magic_arrow", "spell.lightning_bolt"]
    });

    const seat = state.combatSandboxSetup!.seats.p1;
    expect(seat.factionId).toBe("tower");
    expect(seat.heroDefId).toBe("solmyr");
    expect(seat.units.map((unit) => unit.unitDefId)).toEqual(["tower.gargoyles", "tower.genies"]);
    expect(seat.hand).toEqual(["spell.magic_arrow", "spell.lightning_bolt"]);
    // Name follows hero + faction.
    expect(seat.name).toMatch(/Solmyr/i);
  });

  it("toggles WOG commanders and morale cards, and picks a battlefield", () => {
    let state = createCombatSandboxLobbyState("sandbox-options");
    state = applyOk(state, {
      type: "SANDBOX_SET_OPTIONS",
      playerId: "p1",
      options: {
        boardArtId: "frozen",
        moraleCards: true,
        wog: { enabled: true, commanders: true }
      }
    });

    expect(state.combatSandboxSetup!.boardArtId).toBe("frozen");
    expect(state.combatSandboxSetup!.moraleCards).toBe(true);
    expect(state.combatSandboxSetup!.wog.enabled).toBe(true);
    expect(state.combatSandboxSetup!.wog.commanders).toBe(true);
    expect(state.wog?.commanders).toBe(true);
  });

  it("lets the tester pick BINH or Tournament mode before Begin", () => {
    let state = createCombatSandboxLobbyState("sandbox-play-mode");
    expect(state.combatSandboxSetup!.playMode ?? "binh").toBe("binh");
    expect(state.ruleset).toBe("binh");
    expect(state.decks["spells-expert"], "BINH ships a split Expert spell deck").toBeTruthy();

    state = applyOk(state, {
      type: "SANDBOX_SET_OPTIONS",
      playerId: "p1",
      options: { playMode: "tournament" }
    });
    expect(state.combatSandboxSetup!.playMode).toBe("tournament");
    expect(state.ruleset, "Tournament uses the legacy ruleset").toBe("legacy");
    // The SANDBOX keeps legacy single decks: it has no adventure state to
    // freeze `split-decks` onto, so its tier gates read the legacy default and
    // split decks would be unreachable (dead searches). The REAL tournament
    // game splits decks — pinned in adventure-setup tests.
    expect(state.decks["spells-expert"], "Tournament sandbox drops the BINH split Expert deck").toBeUndefined();
    expect(state.decks.artifacts, "Tournament sandbox uses a single Artifact deck").toBeTruthy();
    expect(state.decks.abilities?.drawPile ?? [], "Diplomacy is banned in Tournament").not.toContain(
      "ability.diplomacy"
    );

    // CONTROL: switching back restores BINH split decks + ruleset.
    state = applyOk(state, {
      type: "SANDBOX_SET_OPTIONS",
      playerId: "p1",
      options: { playMode: "binh" }
    });
    expect(state.ruleset).toBe("binh");
    expect(state.decks["spells-expert"]).toBeTruthy();

    // Begin materialises the chosen mode onto the live fight state.
    state = applyOk(state, {
      type: "SANDBOX_SET_OPTIONS",
      playerId: "p1",
      options: { playMode: "tournament" }
    });
    state = applyOk(state, { type: "SANDBOX_BEGIN_COMBAT", playerId: "p1" });
    expect(state.ruleset).toBe("legacy");
    expect(state.decks.artifacts).toBeTruthy();
  });

  it("Begin battle opens PvP-style unit deployment (combat-setup), not an auto-started fight", () => {
    let state = createCombatSandboxLobbyState("sandbox-begin");
    state = applyOk(state, {
      type: "SANDBOX_SET_OPTIONS",
      playerId: "p1",
      options: { boardArtId: "jungle-fortress" }
    });
    state = applyOk(state, {
      type: "SANDBOX_CONFIGURE_SEAT",
      playerId: "p1",
      seatId: "p2",
      hand: ["spell.magic_arrow", "ability.offense"]
    });

    state = applyOk(state, { type: "SANDBOX_BEGIN_COMBAT", playerId: "p1" });

    expect(isCombatSandboxSetup(state)).toBe(false);
    expect(state.phase).toBe("combat-setup");
    expect(state.combat?.context.kind).toBe("sandbox");
    expect(state.combat?.boardArtId).toBe("jungle-fortress");
    expect(state.combatSandboxSetup).toBeNull();

    // Board empty until players place; armies are ready to deploy.
    expect(Object.keys(state.combat!.units)).toEqual([]);
    expect(state.combat!.setup?.pendingPlayerIds).toEqual(["p1", "p2"]);
    expect(state.combat!.setup?.placedUnitIds.p1).toEqual([]);
    expect(state.priorityPlayerId).toBe("p1");
    expect(state.players.p1.army.length).toBeGreaterThan(0);
    expect(state.players.p2.army.length).toBeGreaterThan(0);

    // Hands and heroes match the free setup.
    expect(state.players.p2.hand).toEqual(["spell.magic_arrow", "ability.offense"]);
    expect(state.heroes.hero_p1.heroDefId).toBe("catherine");
    expect(state.heroes.hero_p2.heroDefId).toBe("sandro");
  });

  it("getLegalActions drives deployment (not a town-build turn) during combat-setup", () => {
    // Regression: the sandbox combat runs on turn.mode "simultaneous", and the
    // simultaneous town-turn branch only excluded phase "combat" — NOT
    // "combat-setup". So getLegalActions (the UI's only source of clickable
    // actions) offered Build Training Ground / Marketplace and NO deployment,
    // leaving the tester unable to place a unit or start the fight. The board
    // has nothing to click without PLACE_COMBAT_UNIT here. Fails if the sandbox
    // combat path stops routing through the shared combat dispatcher.
    let state = createCombatSandboxLobbyState("sandbox-deploy-actions");
    state = applyOk(state, { type: "SANDBOX_BEGIN_COMBAT", playerId: "p1" });
    expect(state.phase).toBe("combat-setup");

    const p1Offers = getLegalActions(state, "p1");
    // The attacker (head of the placement queue) can place every army unit and
    // has no town-build actions offered.
    expect(p1Offers.some((legal) => legal.action.type === "PLACE_COMBAT_UNIT")).toBe(true);
    expect(p1Offers.some((legal) => legal.action.type === "BUILD_STRUCTURE")).toBe(false);
    expect(p1Offers.some((legal) => legal.action.type === "COMPLETE_SIMULTANEOUS_TURN")).toBe(false);
    // The waiting defender is not yet at the head of the queue: no placement,
    // and still no stray town-build actions.
    const p2Offers = getLegalActions(state, "p2");
    expect(p2Offers.some((legal) => legal.action.type === "PLACE_COMBAT_UNIT")).toBe(false);
    expect(p2Offers.some((legal) => legal.action.type === "BUILD_STRUCTURE")).toBe(false);

    // Place one unit → "Ready for battle" (FINISH_COMBAT_PLACEMENT) appears; the
    // tester can actually start the fight.
    const p1Army = state.players.p1.army[0]!;
    state = applyOk(state, {
      type: "PLACE_COMBAT_UNIT",
      playerId: "p1",
      armyUnitId: p1Army.id,
      position: 12
    });
    const afterPlace = getLegalActions(state, "p1");
    expect(afterPlace.some((legal) => legal.action.type === "FINISH_COMBAT_PLACEMENT")).toBe(true);

    // Both sides deploy and lock in → the live fight offers unit ACTIONS (attack/
    // move/defend), still never a town-build button.
    state = applyOk(state, { type: "FINISH_COMBAT_PLACEMENT", playerId: "p1" });
    const p2Army = state.players.p2.army[0]!;
    state = applyOk(state, { type: "PLACE_COMBAT_UNIT", playerId: "p2", armyUnitId: p2Army.id, position: 4 });
    state = applyOk(state, { type: "FINISH_COMBAT_PLACEMENT", playerId: "p2" });

    // Whoever's unit is active gets real combat actions and no town build.
    const active = state.combat!.activeUnitId
      ? state.combat!.units[state.combat!.activeUnitId]?.controllerId ?? "p1"
      : "p1";
    if (state.phase === "combat") {
      const combatOffers = getLegalActions(state, active);
      expect(combatOffers.some((legal) => legal.action.type === "BUILD_STRUCTURE")).toBe(false);
      expect(combatOffers.some((legal) => legal.action.type === "COMPLETE_SIMULTANEOUS_TURN")).toBe(false);
      const combatActionTypes = new Set([
        "MOVE_UNIT",
        "ATTACK_UNIT",
        "MOVE_AND_ATTACK_UNIT",
        "DEFEND_UNIT",
        "END_ACTIVATION"
      ]);
      expect(combatOffers.some((legal) => combatActionTypes.has(legal.action.type))).toBe(true);
    }
  });

  it("after both sides Ready, the fight starts and WOG commanders inject", () => {
    let state = createCombatSandboxLobbyState("sandbox-deploy");
    state = applyOk(state, {
      type: "SANDBOX_SET_OPTIONS",
      playerId: "p1",
      options: { wog: { enabled: true, commanders: true } }
    });
    state = applyOk(state, {
      type: "SANDBOX_CONFIGURE_SEAT",
      playerId: "p1",
      seatId: "p1",
      commanderGrades: { attack: 2, defense: 1, health: 1, damage: 0, magic: 0, speed: 1 }
    });
    state = applyOk(state, { type: "SANDBOX_BEGIN_COMBAT", playerId: "p1" });

    const p1Army = state.players.p1.army[0]!;
    const p2Army = state.players.p2.army[0]!;
    // Attacker places on attacker frontline (12–15), defender on defender (4–7).
    state = applyOk(state, {
      type: "PLACE_COMBAT_UNIT",
      playerId: "p1",
      armyUnitId: p1Army.id,
      position: 12
    });
    state = applyOk(state, { type: "FINISH_COMBAT_PLACEMENT", playerId: "p1" });
    expect(state.combat!.setup?.pendingPlayerIds).toEqual(["p2"]);

    state = applyOk(state, {
      type: "PLACE_COMBAT_UNIT",
      playerId: "p2",
      armyUnitId: p2Army.id,
      position: 4
    });
    state = applyOk(state, { type: "FINISH_COMBAT_PLACEMENT", playerId: "p2" });

    // Placement is locked; round 1 may open a start-of-combat choice (war machine,
    // activation order, etc.) before phase settles on "combat".
    expect(state.combat!.setup).toBeNull();
    expect(["combat", "choice", "reaction"].includes(state.phase)).toBe(true);
    expect(state.wog?.commanders).toBe(true);
    expect(state.players.p1.commander?.grades.attack).toBe(2);
    const commanders = Object.values(state.combat!.units).filter((unit) => unit.commanderSlug);
    expect(commanders.length).toBe(2);
    expect(Object.values(state.combat!.units).some((unit) => unit.controllerId === "p1" && !unit.commanderSlug)).toBe(
      true
    );
    expect(Object.values(state.combat!.units).some((unit) => unit.controllerId === "p2" && !unit.commanderSlug)).toBe(
      true
    );
  });

  it("Begin with morale cards stores the rule on sandboxRules and seeds decks", () => {
    let state = createCombatSandboxLobbyState("sandbox-morale");
    state = applyOk(state, {
      type: "SANDBOX_SET_OPTIONS",
      playerId: "p1",
      options: { moraleCards: true }
    });
    state = applyOk(state, {
      type: "SANDBOX_CONFIGURE_SEAT",
      playerId: "p1",
      seatId: "p1",
      moraleCards: {
        positive: ["morale.positive.combat_bonus"],
        negative: []
      }
    });
    state = applyOk(state, { type: "SANDBOX_BEGIN_COMBAT", playerId: "p1" });

    expect(state.sandboxRules?.moraleCards).toBe(true);
    expect(state.players.p1.moraleCards?.positive).toContain("morale.positive.combat_bonus");
    // Morale decks are stocked when the rule is on (ids from data/cards/morale).
    expect(Object.keys(state.decks).some((id) => id.includes("morale"))).toBe(true);
  });

  it("morale cards drawn in a Battle Test are actually USABLE in the fight (not decorative)", () => {
    // Regression: the sandbox drew morale cards at combat start but every USE
    // path still gated on state.adventure?.moraleCards (null in a sandbox), so a
    // held card could never be spent. Prove a held Positive Morale combat-bonus
    // both (a) is OFFERED in the running fight and (b) produces its +1 Attack
    // effect when spent. Fails if the gate reverts to adventure-only.
    let state = createCombatSandboxLobbyState("sandbox-morale-usable");
    state = applyOk(state, {
      type: "SANDBOX_SET_OPTIONS",
      playerId: "p1",
      options: { moraleCards: true }
    });
    // Both seats hold the card so whoever activates first is offered it.
    for (const seatId of ["p1", "p2"] as const) {
      state = applyOk(state, {
        type: "SANDBOX_CONFIGURE_SEAT",
        playerId: "p1",
        seatId,
        moraleCards: { positive: ["morale.positive.combat_bonus"], negative: [] }
      });
    }
    state = applyOk(state, { type: "SANDBOX_BEGIN_COMBAT", playerId: "p1" });

    // Deploy one unit each and lock in — same flow as a PvP fight.
    const p1Army = state.players.p1.army[0]!;
    const p2Army = state.players.p2.army[0]!;
    state = applyOk(state, { type: "PLACE_COMBAT_UNIT", playerId: "p1", armyUnitId: p1Army.id, position: 12 });
    state = applyOk(state, { type: "FINISH_COMBAT_PLACEMENT", playerId: "p1" });
    state = applyOk(state, { type: "PLACE_COMBAT_UNIT", playerId: "p2", armyUnitId: p2Army.id, position: 4 });
    state = applyOk(state, { type: "FINISH_COMBAT_PLACEMENT", playerId: "p2" });

    // The card survives Begin into the live fight for both seats.
    expect(state.players.p1.moraleCards?.positive).toContain("morale.positive.combat_bonus");
    expect(state.combat).not.toBeNull();

    // (a) It is offered in the running combat to the participant whose unit is
    // active — the addMoraleActions gate now honours the sandbox rule.
    const activeController = state.combat!.activeUnitId
      ? state.combat!.units[state.combat!.activeUnitId]?.controllerId
      : "p1";
    const offers = getLegalActions(state, activeController ?? "p1").filter(
      (legal) => legal.action.type === "SPEND_MORALE" && legal.action.benefit === "combat-bonus"
    );
    expect(offers.length).toBeGreaterThan(0);

    // (b) Spending it lands the +1 Attack player-scoped effect — the spendMorale
    // handler now runs the card branch instead of throwing "no morale token".
    const before = state.activeEffects.filter((effect) => effect.name.includes("+1 Attack")).length;
    const spent = applyAction(state, {
      type: "SPEND_MORALE",
      playerId: activeController ?? "p1",
      benefit: "combat-bonus",
      bonus: "attack"
    });
    expect(spent.errors.map((error) => error.message).join("; ")).toBe("");
    const after = spent.state.activeEffects.filter((effect) => effect.name.includes("+1 Attack"));
    expect(after.length).toBe(before + 1);
    expect(after.some((effect) => effect.controllerId === (activeController ?? "p1"))).toBe(true);
  });

  it("rejects setup actions once deployment has begun", () => {
    let state = createCombatSandboxLobbyState("sandbox-locked");
    state = applyOk(state, { type: "SANDBOX_BEGIN_COMBAT", playerId: "p1" });
    const result = applyAction(state, {
      type: "SANDBOX_SET_OPTIONS",
      playerId: "p1",
      options: { boardArtId: "frozen" }
    });
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("keeps createInitialGameState as a ready-to-fight fixture for tests", () => {
    const state = createInitialGameState("fixture");
    expect(state.phase).toBe("combat");
    expect(state.combat?.context.kind).toBe("sandbox");
    expect(isCombatSandboxSetup(state)).toBe(false);
  });
});
