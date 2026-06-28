import { describe, expect, it } from "vitest";
import {
  applyAction,
  createAdventureLobbyState,
  getDraftPhase,
  getLegalActions,
  getPlayerView
} from "./index";
import type { FactionId, GameAction, GameState } from "./state";
import { coreFactionDefinitions } from "@/data/factions/core";

const ALL_FACTION_IDS = Object.keys(coreFactionDefinitions) as FactionId[];

/**
 * Map-setup "Draft & random" tab. The four setup formats are driven through the
 * real engine handlers (SET_DRAFT_FORMAT / ROLL_TOWN_OPTIONS / CHOOSE_TOWN /
 * ROLL_HERO_OPTIONS / BAN_HERO / CHOOSE_FACTION / RANDOM_ASSIGN_SEAT) and every
 * test asserts the observable outcome — a banned hero is genuinely unpickable, a
 * rolled choice is genuinely enforced, a turn that isn't yours is refused — so
 * each fails if the wiring is removed. Mutation controls accompany the gates.
 */

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toHaveLength(0);
  return result.state;
}

function reject(state: GameState, action: GameAction): string {
  const result = applyAction(state, action);
  expect(result.errors.length, `expected ${action.type} to be rejected`).toBeGreaterThan(0);
  return result.errors.map((error) => error.message).join("; ");
}

function lobby(state: GameState) {
  if (!state.setupLobby) {
    throw new Error("expected a setup lobby");
  }
  return state.setupLobby;
}

function seatOf(state: GameState, playerId: string) {
  return lobby(state).seats.find((seat) => seat.playerId === playerId);
}

const CASTLE = coreFactionDefinitions.castle;
const NECRO = coreFactionDefinitions.necropolis;

describe("setup format selector", () => {
  it("starts in free pick and switching format restarts every seat + the draft state", () => {
    let state = createAdventureLobbyState({ seed: "fmt" });
    expect(lobby(state).draft?.format).toBe("open");

    // Free pick (TYPE 4): a normal pick, then switch format and watch it reset.
    state = apply(state, { type: "CHOOSE_FACTION", playerId: "p1", factionId: "castle", heroDefId: "catherine" });
    expect(seatOf(state, "p1")?.heroDefId).toBe("catherine");

    state = apply(state, { type: "SET_DRAFT_FORMAT", playerId: "p1", format: "draft" });
    expect(lobby(state).draft?.format).toBe("draft");
    // The pick is wiped so the new flow starts clean.
    expect(seatOf(state, "p1")?.factionId).toBeNull();
    expect(seatOf(state, "p1")?.heroDefId).toBeNull();
  });

  it("rejects an unknown format", () => {
    const state = createAdventureLobbyState({ seed: "fmt-bad" });
    reject(state, { type: "SET_DRAFT_FORMAT", playerId: "p1", format: "nonsense" as never });
  });
});

describe("TYPE 4 — free pick (open)", () => {
  it("lets a seat pick any untaken town, and blocks a town another seat already holds", () => {
    let state = createAdventureLobbyState({ seed: "open" });
    state = apply(state, { type: "CHOOSE_FACTION", playerId: "p1", factionId: "castle", heroDefId: "catherine" });

    reject(state, { type: "CHOOSE_FACTION", playerId: "p2", factionId: "castle", heroDefId: "rion" });

    state = apply(state, { type: "CHOOSE_FACTION", playerId: "p2", factionId: "necropolis", heroDefId: "sandro" });
    expect(seatOf(state, "p2")?.heroDefId).toBe("sandro");

    const started = apply(state, { type: "START_ADVENTURE", playerId: "p1" });
    expect(started.setupLobby).toBeNull();
    expect(started.adventure).not.toBeNull();
  });
});

describe("TYPE 1 — draft: town two-choice", () => {
  it("rolls two untaken towns, locks one of them, and refuses a town outside the rolled pair", () => {
    let state = createAdventureLobbyState({ seed: "draft-town" });
    state = apply(state, { type: "SET_DRAFT_FORMAT", playerId: "p1", format: "draft" });
    state = apply(state, { type: "ROLL_TOWN_OPTIONS", playerId: "p1" });

    const options = lobby(state).draft?.seatRolls?.p1?.townOptions ?? [];
    expect(options).toHaveLength(2);
    expect(options[0]).not.toBe(options[1]);

    // A town outside the rolled pair is refused while a roll is pending.
    const outside = ALL_FACTION_IDS.find((id) => !options.includes(id))!;
    reject(state, { type: "CHOOSE_TOWN", playerId: "p1", factionId: outside });

    // Locking one of the two rolled towns works and clears the pending roll.
    state = apply(state, { type: "CHOOSE_TOWN", playerId: "p1", factionId: options[0] });
    expect(seatOf(state, "p1")?.factionId).toBe(options[0]);
    expect(seatOf(state, "p1")?.heroDefId).toBeNull();
    expect(lobby(state).draft?.seatRolls?.p1).toBeUndefined();
  });

  it("is deterministic — the same seed + action sequence rolls the same pair", () => {
    const roll = () => {
      let state = createAdventureLobbyState({ seed: "draft-town-det" });
      state = apply(state, { type: "SET_DRAFT_FORMAT", playerId: "p1", format: "draft" });
      state = apply(state, { type: "ROLL_TOWN_OPTIONS", playerId: "p1" });
      return lobby(state).draft?.seatRolls?.p1?.townOptions ?? [];
    };
    expect(roll()).toEqual(roll());
  });

  it("allows a direct town select when no roll is pending, and a per-seat reset during the town phase", () => {
    let state = createAdventureLobbyState({ seed: "draft-direct" });
    state = apply(state, { type: "SET_DRAFT_FORMAT", playerId: "p1", format: "draft" });

    // "(or select town)": with no pending roll, any untaken town locks directly.
    state = apply(state, { type: "CHOOSE_TOWN", playerId: "p1", factionId: "castle" });
    expect(seatOf(state, "p1")?.factionId).toBe("castle");

    // Reset is allowed while not every seat is locked yet.
    state = apply(state, { type: "RESET_SEAT_DRAFT", playerId: "p1" });
    expect(seatOf(state, "p1")?.factionId).toBeNull();

    // Re-lock a different town.
    state = apply(state, { type: "CHOOSE_TOWN", playerId: "p1", factionId: "rampart" });
    expect(seatOf(state, "p1")?.factionId).toBe("rampart");
  });

  it("blocks choosing a hero before the ban phase is done", () => {
    let state = createAdventureLobbyState({ seed: "draft-early-hero" });
    state = apply(state, { type: "SET_DRAFT_FORMAT", playerId: "p1", format: "draft" });
    state = apply(state, { type: "CHOOSE_TOWN", playerId: "p1", factionId: "castle" });
    // Town phase not finished (p2 unlocked): no hero picking yet.
    reject(state, { type: "CHOOSE_FACTION", playerId: "p1", factionId: "castle", heroDefId: "catherine" });
  });
});

describe("TYPE 1 — draft: ban phase (2 players → 2 bans each, round-robin)", () => {
  function lockedTwoPlayerDraft(seed: string): GameState {
    let state = createAdventureLobbyState({ seed });
    state = apply(state, { type: "SET_DRAFT_FORMAT", playerId: "p1", format: "draft" });
    state = apply(state, { type: "CHOOSE_TOWN", playerId: "p1", factionId: "castle" });
    state = apply(state, { type: "CHOOSE_TOWN", playerId: "p2", factionId: "necropolis" });
    return state;
  }

  it("opens the ban phase only once every town is locked, with the right budget and first turn", () => {
    let state = createAdventureLobbyState({ seed: "draft-ban-open" });
    state = apply(state, { type: "SET_DRAFT_FORMAT", playerId: "p1", format: "draft" });
    state = apply(state, { type: "CHOOSE_TOWN", playerId: "p1", factionId: "castle" });

    // One town still open → no ban phase, and a ban is refused.
    expect(getDraftPhase(lobby(state)).banPhaseActive).toBe(false);
    reject(state, { type: "BAN_HERO", playerId: "p1", heroDefId: "sandro" });

    state = apply(state, { type: "CHOOSE_TOWN", playerId: "p2", factionId: "necropolis" });
    const phase = getDraftPhase(lobby(state));
    expect(phase.townLockedAll).toBe(true);
    expect(phase.banPhaseActive).toBe(true);
    expect(phase.banBudgetPerSeat).toBe(2);
    expect(phase.totalBans).toBe(4);
    expect(phase.currentBannerPlayerId).toBe("p1");
  });

  it("only the current banner may ban, only an opponent's hero, going around until 4 bans land", () => {
    let state = lockedTwoPlayerDraft("draft-ban-flow");

    // It's p1's turn: p2 cannot ban yet (mutation control for the turn gate).
    reject(state, { type: "BAN_HERO", playerId: "p2", heroDefId: "catherine" });
    // p1 may NOT ban a hero of their OWN town (castle) — only opponents' (necro).
    reject(state, { type: "BAN_HERO", playerId: "p1", heroDefId: "catherine" });

    // p1 bans a necropolis hero; turn passes to p2.
    state = apply(state, { type: "BAN_HERO", playerId: "p1", heroDefId: "sandro" });
    expect(getDraftPhase(lobby(state)).currentBannerPlayerId).toBe("p2");
    expect(lobby(state).draft?.bannedHeroDefIds).toContain("sandro");

    // p2 bans a castle hero; back to p1.
    state = apply(state, { type: "BAN_HERO", playerId: "p2", heroDefId: "catherine" });
    expect(getDraftPhase(lobby(state)).currentBannerPlayerId).toBe("p1");

    // Round two: p1 bans another necro hero, p2 another castle hero.
    state = apply(state, { type: "BAN_HERO", playerId: "p1", heroDefId: "tamika" });
    state = apply(state, { type: "BAN_HERO", playerId: "p2", heroDefId: "rion" });

    const phase = getDraftPhase(lobby(state));
    expect(phase.banPicksMade).toBe(4);
    expect(phase.banPhaseActive).toBe(false);
    expect(phase.pickPhaseOpen).toBe(true);
    expect(lobby(state).draft?.bannedHeroDefIds).toEqual(["sandro", "catherine", "tamika", "rion"]);

    // No more bans once the budget is spent.
    reject(state, { type: "BAN_HERO", playerId: "p1", heroDefId: "moandor" });
  });

  it("legal actions in the ban phase offer ONLY the current banner ONLY opponents' un-banned heroes", () => {
    let state = lockedTwoPlayerDraft("draft-ban-legal");
    state = apply(state, { type: "BAN_HERO", playerId: "p1", heroDefId: "sandro" });

    // Now it's p2's turn. p1 (not the banner) is offered no bans.
    const p1Bans = getLegalActions(state, "p1").filter((entry) => entry.action.type === "BAN_HERO");
    expect(p1Bans).toHaveLength(0);

    // p2 is offered castle heroes (p1's town), minus none banned yet, and never a
    // necropolis hero (their own) nor the already-banned sandro.
    const p2Bans = getLegalActions(state, "p2")
      .map((entry) => entry.action)
      .filter((action): action is Extract<GameAction, { type: "BAN_HERO" }> => action.type === "BAN_HERO")
      .map((action) => action.heroDefId);
    expect(p2Bans).toEqual(expect.arrayContaining(["catherine", "rion"]));
    for (const heroDefId of NECRO.heroes) {
      expect(p2Bans).not.toContain(heroDefId);
    }
    expect(p2Bans).not.toContain("sandro");
  });

  it("the pick phase: each seat picks its own non-banned hero; a banned hero or a wrong town is refused", () => {
    let state = lockedTwoPlayerDraft("draft-pick");
    state = apply(state, { type: "BAN_HERO", playerId: "p1", heroDefId: "sandro" });
    state = apply(state, { type: "BAN_HERO", playerId: "p2", heroDefId: "catherine" });
    state = apply(state, { type: "BAN_HERO", playerId: "p1", heroDefId: "tamika" });
    state = apply(state, { type: "BAN_HERO", playerId: "p2", heroDefId: "rion" });

    // p1 (castle) cannot take catherine/rion (banned by p2) ...
    reject(state, { type: "CHOOSE_FACTION", playerId: "p1", factionId: "castle", heroDefId: "catherine" });
    // ... and cannot pick a hero from a town that is not theirs.
    reject(state, { type: "CHOOSE_FACTION", playerId: "p1", factionId: "necropolis", heroDefId: "moandor" });

    // A surviving castle hero is pickable. (Mutation control: if the ban filter
    // were dropped, the rejected catherine pick above would have succeeded.)
    const survivor = CASTLE.heroes.find((id) => !["catherine", "rion"].includes(id))!;
    state = apply(state, { type: "CHOOSE_FACTION", playerId: "p1", factionId: "castle", heroDefId: survivor });
    expect(seatOf(state, "p1")?.heroDefId).toBe(survivor);

    // p2 (necropolis) takes a surviving necro hero, then the adventure builds.
    const necroSurvivor = NECRO.heroes.find((id) => !["sandro", "tamika"].includes(id))!;
    state = apply(state, { type: "CHOOSE_FACTION", playerId: "p2", factionId: "necropolis", heroDefId: necroSurvivor });

    const started = apply(state, { type: "START_ADVENTURE", playerId: "p1" });
    expect(started.adventure).not.toBeNull();
    expect(Object.values(started.heroes).map((hero) => hero.heroDefId).sort()).toEqual(
      [survivor, necroSurvivor].sort()
    );
  });

  it("a per-seat reset is blocked once the ban phase has begun", () => {
    const state = lockedTwoPlayerDraft("draft-reset-block");
    reject(state, { type: "RESET_SEAT_DRAFT", playerId: "p1" });
  });
});

describe("TYPE 1 — draft ban budgets scale with player count", () => {
  function lockAllTowns(seed: string, playerCount: number, factions: string[]): GameState {
    let state = createAdventureLobbyState({ seed, playerCount });
    state = apply(state, { type: "SET_DRAFT_FORMAT", playerId: "p1", format: "draft" });
    state.setupLobby!.seats.forEach((seat, index) => {
      state = apply(state, { type: "CHOOSE_TOWN", playerId: seat.playerId, factionId: factions[index] as never });
    });
    return state;
  }

  it("3 players → 1 ban each (3 total), going around in seat order", () => {
    let state = lockAllTowns("draft-3p", 3, ["castle", "necropolis", "rampart"]);
    let phase = getDraftPhase(lobby(state));
    expect(phase.seatCount).toBe(3);
    expect(phase.banBudgetPerSeat).toBe(1);
    expect(phase.totalBans).toBe(3);
    expect(phase.currentBannerPlayerId).toBe("p1");

    state = apply(state, { type: "BAN_HERO", playerId: "p1", heroDefId: "sandro" }); // p1 bans a necro (p2)
    expect(getDraftPhase(lobby(state)).currentBannerPlayerId).toBe("p2");
    state = apply(state, { type: "BAN_HERO", playerId: "p2", heroDefId: "gelu" }); // p2 bans a rampart (p3)
    expect(getDraftPhase(lobby(state)).currentBannerPlayerId).toBe("p3");
    state = apply(state, { type: "BAN_HERO", playerId: "p3", heroDefId: "catherine" }); // p3 bans a castle (p1)

    phase = getDraftPhase(lobby(state));
    expect(phase.banPicksMade).toBe(3);
    expect(phase.pickPhaseOpen).toBe(true);
  });

  it("4 players → 1 ban each (4 total), going around in seat order", () => {
    const state = lockAllTowns("draft-4p", 4, ["castle", "necropolis", "rampart", "tower"]);
    const phase = getDraftPhase(lobby(state));
    expect(phase.seatCount).toBe(4);
    expect(phase.banBudgetPerSeat).toBe(1);
    expect(phase.totalBans).toBe(4);
    expect(["p1", "p2", "p3", "p4"]).toContain(phase.currentBannerPlayerId);
    expect(phase.currentBannerPlayerId).toBe("p1");
  });
});

describe("TYPE 2 — full random", () => {
  it("rolls an untaken town + hero for each seat; the rolls never collide and build a real adventure", () => {
    let state = createAdventureLobbyState({ seed: "rand" });
    state = apply(state, { type: "SET_DRAFT_FORMAT", playerId: "p1", format: "random" });

    // A manual hero pick is refused in Full random — you must roll.
    reject(state, { type: "CHOOSE_FACTION", playerId: "p1", factionId: "castle", heroDefId: "catherine" });

    state = apply(state, { type: "RANDOM_ASSIGN_SEAT", playerId: "p1", scope: "faction" });
    state = apply(state, { type: "RANDOM_ASSIGN_SEAT", playerId: "p2", scope: "faction" });

    const p1 = seatOf(state, "p1");
    const p2 = seatOf(state, "p2");
    expect(p1?.factionId).toBeTruthy();
    expect(p2?.factionId).toBeTruthy();
    expect(p1?.factionId).not.toBe(p2?.factionId);
    expect(coreFactionDefinitions[p1!.factionId!].heroes).toContain(p1?.heroDefId);

    const started = apply(state, { type: "START_ADVENTURE", playerId: "p1" });
    expect(started.adventure).not.toBeNull();
  });

  it("is deterministic and a hero re-roll keeps the seat's town", () => {
    const rollSeat = () => {
      let state = createAdventureLobbyState({ seed: "rand-det" });
      state = apply(state, { type: "SET_DRAFT_FORMAT", playerId: "p1", format: "random" });
      state = apply(state, { type: "RANDOM_ASSIGN_SEAT", playerId: "p1", scope: "faction" });
      return seatOf(state, "p1");
    };
    expect(rollSeat()).toEqual(rollSeat());

    let state = createAdventureLobbyState({ seed: "rand-rehero" });
    state = apply(state, { type: "SET_DRAFT_FORMAT", playerId: "p1", format: "random" });
    state = apply(state, { type: "RANDOM_ASSIGN_SEAT", playerId: "p1", scope: "faction" });
    const town = seatOf(state, "p1")?.factionId;
    state = apply(state, { type: "RANDOM_ASSIGN_SEAT", playerId: "p1", scope: "hero" });
    expect(seatOf(state, "p1")?.factionId).toBe(town);
    expect(coreFactionDefinitions[town!].heroes).toContain(seatOf(state, "p1")?.heroDefId);
  });

  it("refuses a random roll outside the Full random format", () => {
    let state = createAdventureLobbyState({ seed: "rand-wrong-format" });
    // Default is "open": a full random roll is not the open-format mechanic.
    reject(state, { type: "RANDOM_ASSIGN_SEAT", playerId: "p1", scope: "faction" });
    state = apply(state, { type: "SET_DRAFT_FORMAT", playerId: "p1", format: "draft" });
    reject(state, { type: "RANDOM_ASSIGN_SEAT", playerId: "p1", scope: "faction" });
  });
});

describe("TYPE 3 — random with choice", () => {
  it("rolls two towns to pick from, then two heroes of that town to pick from", () => {
    let state = createAdventureLobbyState({ seed: "rc" });
    state = apply(state, { type: "SET_DRAFT_FORMAT", playerId: "p1", format: "random-choice" });

    // Must roll a town first — a direct select is refused here.
    reject(state, { type: "CHOOSE_TOWN", playerId: "p1", factionId: "castle" });

    state = apply(state, { type: "ROLL_TOWN_OPTIONS", playerId: "p1" });
    const townOptions = lobby(state).draft?.seatRolls?.p1?.townOptions ?? [];
    expect(townOptions).toHaveLength(2);

    // A town outside the rolled pair is refused.
    const outsideTown = ALL_FACTION_IDS.find((id) => !townOptions.includes(id))!;
    reject(state, { type: "CHOOSE_TOWN", playerId: "p1", factionId: outsideTown });

    state = apply(state, { type: "CHOOSE_TOWN", playerId: "p1", factionId: townOptions[0] });
    expect(seatOf(state, "p1")?.factionId).toBe(townOptions[0]);

    // Cannot commit a hero before rolling hero options.
    const townHeroes = coreFactionDefinitions[townOptions[0]].heroes;
    reject(state, { type: "CHOOSE_FACTION", playerId: "p1", factionId: townOptions[0], heroDefId: townHeroes[0] });

    state = apply(state, { type: "ROLL_HERO_OPTIONS", playerId: "p1" });
    const heroOptions = lobby(state).draft?.seatRolls?.p1?.heroOptions ?? [];
    expect(heroOptions).toHaveLength(2);
    expect(heroOptions.every((id) => townHeroes.includes(id))).toBe(true);

    // A hero outside the rolled pair is refused; one inside it commits.
    const outsideHero = townHeroes.find((id) => !heroOptions.includes(id))!;
    reject(state, { type: "CHOOSE_FACTION", playerId: "p1", factionId: townOptions[0], heroDefId: outsideHero });

    state = apply(state, { type: "CHOOSE_FACTION", playerId: "p1", factionId: townOptions[0], heroDefId: heroOptions[0] });
    expect(seatOf(state, "p1")?.heroDefId).toBe(heroOptions[0]);
  });
});

describe("draft state propagates to every player's view", () => {
  it("shares the format and bans with the opponent's filtered view", () => {
    let state = createAdventureLobbyState({ seed: "view" });
    state = apply(state, { type: "SET_DRAFT_FORMAT", playerId: "p1", format: "draft" });
    state = apply(state, { type: "CHOOSE_TOWN", playerId: "p1", factionId: "castle" });
    state = apply(state, { type: "CHOOSE_TOWN", playerId: "p2", factionId: "necropolis" });
    state = apply(state, { type: "BAN_HERO", playerId: "p1", heroDefId: "sandro" });

    const opponentView = getPlayerView(state, "p2");
    expect(opponentView.setupLobby?.draft?.format).toBe("draft");
    expect(opponentView.setupLobby?.draft?.bannedHeroDefIds).toContain("sandro");
  });
});
