// @vitest-environment jsdom
/**
 * USER RULE (2026-09-05) — "Death Stare must happen BEFORE the retaliation."
 *
 * The ENGINE always resolved it that way (pinned by
 * `src/engine/death-stare-before-retaliation.test.ts`). What the player SAW was
 * the other way round: the whole exchange (primary die → stare dice →
 * retaliation die) arrives in ONE snapshot, and the client built its dice
 * overlay queue in two passes — every `ATTACK_ROLLED` cue first, then the
 * ability dice appended BEHIND them. So the table rolled the Retaliation
 * Attack, and only afterwards showed the stare that (on a Pack) had already
 * flipped the defender, or (on a Few) would have cancelled the retaliation
 * entirely.
 *
 * `mergeDiceCuesInEventOrder` now splices the ability cue in at its event-log
 * position, and the attack-die clock reserves its beat so the later die's
 * strike/damage FX stay pinned behind it.
 *
 * This test stages that exact snapshot and asserts the overlay ORDER. It fails
 * against the pre-fix client (the second overlay is the retaliation roll).
 *
 * LEADING WITH THE LIMIT: only the QUEUE ORDER half is pinned here. The second
 * half of the client fix — `diceClock` reserving `ABILITY_DICE_BEAT_MS` per
 * sandwiched roll so the later die's strike animation and damage floater stay
 * pinned BEHIND the ability cue, and the matching `timeline` double-count guard
 * — is wall-clock FX timing that jsdom cannot observe: zeroing that reservation
 * leaves all three cases below green. It is a real-browser concern and there is
 * NO e2e spec for it.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Home from "./page";
import { createAdventureGameState, NEUTRAL_PLAYER_ID, type GameState } from "@/engine";
import { ATTACK_DIE_FACES } from "@/engine/battlefield";
import { getMainHero } from "@/engine/adventure";
import { appendEvent } from "@/engine/events";
import type { CombatState, MapFieldState } from "@/engine/state";
import type { GameRoomSnapshot, RoomConnectionHandlers } from "@/lib/realtime";
import { UI_MODE_STORAGE_KEY } from "@/lib/ui-mode-preference";
import { HELPER_COACH_STORAGE_KEY } from "@/lib/helper-coach-preference";

const { connectRoomMock, routerPush } = vi.hoisted(() => ({
  connectRoomMock: vi.fn(),
  routerPush: vi.fn()
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush, replace: vi.fn(), prefetch: vi.fn() })
}));
vi.mock("@/lib/music", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/music")>();
  return { ...original, useBackgroundMusic: vi.fn() };
});
vi.mock("@/lib/lobby-presence-client", () => ({
  sendPresence: vi.fn(async () => undefined),
  leavePresence: vi.fn()
}));
vi.mock("@/lib/auth-client", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/auth-client")>();
  return {
    ...original,
    fetchSession: vi.fn(async () => null),
    fetchSocketToken: vi.fn(async () => undefined)
  };
});
vi.mock("@/lib/match-claim-client", () => ({ maybeClaimFinishedMatch: vi.fn() }));
vi.mock("@/lib/realtime", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/realtime")>();
  return { ...original, connectRoom: connectRoomMock };
});

const ROOM_ID = "death-stare-dice-order-test";

function snapshotFor(state: GameState, version: number): GameRoomSnapshot {
  return { roomId: ROOM_ID, version, updatedAt: new Date().toISOString(), state };
}

function serveRoom(state: GameState) {
  const snapshot = snapshotFor(state, 1);
  let handlers: RoomConnectionHandlers | null = null;
  connectRoomMock.mockReset().mockImplementation((_roomId: string, given: RoomConnectionHandlers) => {
    handlers = given;
    return {
      close: vi.fn(),
      submitAction: vi.fn(async () => ({ version: 1, errors: [], notices: [] })),
      resetRoom: vi.fn(async () => snapshot),
      fetchSnapshot: vi.fn(async () => snapshot),
      restoreRoom: vi.fn(async () => snapshot),
      fetchSinglePlayerSave: vi.fn(async () => ({ state: snapshot.state, version: snapshot.version })),
      loadSinglePlayerSave: vi.fn(async () => snapshot)
    };
  });
  return {
    push(next: GameState, version: number) {
      handlers?.onSnapshot(snapshotFor(next, version), { source: "broadcast" });
    }
  };
}

async function settle(rounds = 2) {
  for (let index = 0; index < rounds; index += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

/** A live (undecided) neutral fight so the battlefield dice overlay is mounted. */
function stageLiveCombat(): GameState {
  const state = createAdventureGameState({ seed: "death-stare-dice-order", rollFirstPlayer: false });
  for (const player of Object.values(state.players)) {
    player.needsHandRefresh = false;
    player.canMulligan = false;
  }
  state.adventure!.tiles["stare-tile"] = {
    id: "stare-tile",
    tileDefId: "stare",
    centerRow: 0,
    centerCol: 0,
    rotation: 0,
    faceDown: false,
    group: "far"
  };
  const field: MapFieldState = {
    spaceId: "stare-field",
    tileInstanceId: "stare-tile",
    slot: 0,
    location: "treasure_symbol",
    difficulty: 2,
    blackCube: false,
    flagOwnerId: null,
    everFlagged: false,
    settlementResource: null
  };
  state.adventure!.fields[field.spaceId] = field;
  const hero = getMainHero(state, "p1")!;
  hero.spaceId = field.spaceId;
  state.phase = "combat";
  state.combat = {
    attackerPlayerId: "p1",
    defenderPlayerId: NEUTRAL_PLAYER_ID,
    units: {},
    setup: null,
    awaitingContinue: false,
    context: {
      kind: "neutral",
      heroId: hero.id,
      fieldId: hero.spaceId!,
      difficulty: 2,
      hasAzure: false
    },
    dice: { faces: [...ATTACK_DIE_FACES], seed: "s", rollCount: 0 }
  } as CombatState;
  return state;
}

/**
 * The snapshot the engine really produces for a melee blow whose post-attack
 * follow-up MISSED: blow → the follow-up's own dice → the defender's
 * Retaliation Attack.
 *
 * `followUp` is parameterised on purpose: the splice is keyed on the EVENT
 * CLASS (`UNIT_ABILITY_TRIGGERED` carrying `dice`, sandwiched between two of the
 * snapshot's attack rolls), never on the Gorgons — so the Thunderbirds' extra
 * lightning die, the neutral Wyverns' sting, the Ghost Dragons' knock-back roll
 * and a raid boss's Devour all take the same path. The second case below fires
 * a Thunderbird roll through it to prove exactly that.
 */
function pushExchange(
  state: GameState,
  followUp: { unitId: string; abilityId: string; message: string; rolls: number[]; label: string } = {
    unitId: "u_gorgons",
    abilityId: "gorgon-death-stare-roll",
    message: "Gorgons roll -1, 1 for Death Stare.",
    rolls: [-1, 1],
    label: "Death Stare"
  }
): GameState {
  const next = structuredClone(state);
  appendEvent(next, {
    type: "UNIT_ATTACK_DECLARED",
    playerId: "p1",
    attackerId: "u_gorgons",
    defenderId: "u_target",
    isRetaliation: false,
    attackKind: "melee",
    rollMode: "normal"
  });
  appendEvent(next, {
    type: "ATTACK_ROLLED",
    attackerId: "u_gorgons",
    defenderId: "u_target",
    rolls: [0],
    roll: 0,
    rollMode: "normal",
    attackBonus: 0,
    defenseBonus: 0,
    attackValue: 4,
    defenseValue: 2,
    damage: 2,
    isRetaliation: false
  });
  appendEvent(next, {
    type: "UNIT_ABILITY_TRIGGERED",
    unitId: followUp.unitId,
    abilityId: followUp.abilityId,
    targetUnitId: "u_target",
    message: followUp.message,
    dice: { rolls: [...followUp.rolls], success: false, label: followUp.label, caption: "No effect." }
  });
  appendEvent(next, {
    type: "UNIT_ATTACK_DECLARED",
    playerId: NEUTRAL_PLAYER_ID,
    attackerId: "u_target",
    defenderId: "u_gorgons",
    isRetaliation: true,
    attackKind: "melee",
    rollMode: "normal"
  });
  appendEvent(next, {
    type: "ATTACK_ROLLED",
    attackerId: "u_target",
    defenderId: "u_gorgons",
    rolls: [1],
    roll: 1,
    rollMode: "normal",
    attackBonus: 0,
    defenseBonus: 0,
    attackValue: 3,
    defenseValue: 1,
    damage: 3,
    isRetaliation: true
  });
  return next;
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState(null, "", `/?room=${ROOM_ID}`);
  window.localStorage.setItem("homm3bg.displayName", "Tester");
  window.localStorage.setItem(HELPER_COACH_STORAGE_KEY, "off");
  window.localStorage.setItem(UI_MODE_STORAGE_KEY, "computer");
});

afterEach(() => {
  cleanup();
});

describe("a post-attack follow-up's dice read before the retaliation die", () => {
  it("shows the stare's dice between the blow and the Retaliation Attack", async () => {
    const first = stageLiveCombat();
    const room = serveRoom(first);
    render(<Home />);
    await settle();

    await act(async () => {
      room.push(pushExchange(first), 2);
    });
    await settle();

    // 1st beat: the Gorgons' own blow. CONTROL that the queue really started
    // with the primary die (and that the retaliation is NOT on screen yet).
    const blow = await screen.findByRole("status", { name: /attack roll/i });
    expect(blow.textContent).toContain("Attack!");
    expect(blow.textContent).not.toContain("Retaliation!");

    // Skip its read: the NEXT overlay is the one under test.
    fireEvent.click(blow);

    // 2nd beat: the Death Stare. Pre-fix this was the retaliation roll, and the
    // stare only appeared third.
    const stare = await waitFor(() => screen.getByRole("status", { name: /death stare/i }), {
      timeout: 4000
    });
    expect(stare.textContent).toContain("Death Stare");
    expect(
      screen.queryByText(/Retaliation!/),
      "the counter-blow has not been rolled on screen yet"
    ).toBeNull();

    // 3rd beat: only now the Retaliation Attack.
    fireEvent.click(stare);
    await waitFor(() => expect(screen.getByText(/Retaliation!/)).toBeTruthy(), { timeout: 4000 });
  });

  it("is GENERIC by event class: a Thunderbird's lightning die reads first too", async () => {
    // The same splice with a DIFFERENT ability (a single die, another unit id,
    // another label). Nothing in the client keys off the Gorgons — this is what
    // makes the neutral Wyverns' sting, the Ghost Dragons' knock-back roll and a
    // raid boss's Devour read before the counter-blow as well.
    const first = stageLiveCombat();
    const room = serveRoom(first);
    render(<Home />);
    await settle();

    await act(async () => {
      room.push(
        pushExchange(first, {
          unitId: "u_gorgons",
          abilityId: "thunderbirds-lightning-roll",
          message: "Thunderbirds roll -1 for Lightning Strike.",
          rolls: [-1],
          label: "Lightning Strike"
        }),
        2
      );
    });
    await settle();

    const blow = await screen.findByRole("status", { name: /attack roll/i });
    expect(blow.textContent).not.toContain("Retaliation!");
    fireEvent.click(blow);

    const lightning = await waitFor(() => screen.getByRole("status", { name: /lightning strike/i }), {
      timeout: 4000
    });
    expect(lightning.textContent).toContain("Lightning Strike");
    expect(
      screen.queryByText(/Retaliation!/),
      "the counter-blow has not been rolled on screen yet"
    ).toBeNull();

    fireEvent.click(lightning);
    await waitFor(() => expect(screen.getByText(/Retaliation!/)).toBeTruthy(), { timeout: 4000 });
  });

  it("a follow-up that REMOVED the target shows no retaliation at all", async () => {
    // The engine emits no retaliation event once the defender is gone (pinned in
    // `src/engine/follow-up-kill-before-retaliation.test.ts`), so the client has
    // nothing to draw. This is the client half of that invariant: after the
    // landed stare's read there is no third overlay and never a "Retaliation!".
    const first = stageLiveCombat();
    const room = serveRoom(first);
    render(<Home />);
    await settle();

    const lethal = structuredClone(first);
    appendEvent(lethal, {
      type: "UNIT_ATTACK_DECLARED",
      playerId: "p1",
      attackerId: "u_gorgons",
      defenderId: "u_target",
      isRetaliation: false,
      attackKind: "melee",
      rollMode: "normal"
    });
    appendEvent(lethal, {
      type: "ATTACK_ROLLED",
      attackerId: "u_gorgons",
      defenderId: "u_target",
      rolls: [0],
      roll: 0,
      rollMode: "normal",
      attackBonus: 0,
      defenseBonus: 0,
      attackValue: 4,
      defenseValue: 2,
      damage: 2,
      isRetaliation: false
    });
    appendEvent(lethal, {
      type: "UNIT_ABILITY_TRIGGERED",
      unitId: "u_gorgons",
      abilityId: "gorgon-death-stare",
      targetUnitId: "u_target",
      message: "Gorgons roll -1, -1 for Death Stare — the target is petrified!",
      dice: { rolls: [-1, -1], success: true, label: "Death Stare", caption: "Petrified!" }
    });

    await act(async () => {
      room.push(lethal, 2);
    });
    await settle();

    const blow = await screen.findByRole("status", { name: /attack roll/i });
    fireEvent.click(blow);
    const stare = await waitFor(() => screen.getByRole("status", { name: /death stare/i }), {
      timeout: 4000
    });
    fireEvent.click(stare);
    await settle(4);
    expect(screen.queryByText(/Retaliation!/), "a removed target never strikes back").toBeNull();
  });
});
