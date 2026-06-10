# Multiplayer Platform Plan (boardgame.io Path)

The current prototype already plays like a shared table: a server-authoritative rules engine, REST rooms with polling, seat switching, and player-view filtering. This document plans the jump to a real multiplayer platform.

## Where We Are Today

- `src/engine/*` — pure, serializable, deterministic rules engine. All randomness (dice, shuffles) derives from the game seed, so every client replays identical results.
- `src/server/game-room-store.ts` — in-memory room store keyed by room id; `applyAction` validates every submission server-side.
- `src/app/api/rooms/*` — REST endpoints (`GET` snapshot, `POST` action, `POST` reset) with 1.2s client polling.
- `getPlayerView(state, playerId)` — hides opponent hands, every deck order, and other players' search reveals.

This is exactly the shape boardgame.io wants: `G` = engine state, moves = engine actions.

## Why boardgame.io (and not Colyseus first)

- The game is turn/window-based, not realtime physics; boardgame.io's turn order, phases, and `playerView` map 1:1 onto what the engine already exposes.
- Free, self-hostable lobby + match management.
- Socket.io transport replaces polling with push updates (reaction windows feel instant).
- Colyseus only becomes interesting if live dragging/spectator streams outgrow boardgame.io.

## Migration Steps

### Step 1 — Wrap the engine as a boardgame.io game

```ts
// src/game/homm3-game.ts
import { INVALID_MOVE } from "boardgame.io/core";
import { applyAction, createInitialGameState, getPlayerView } from "@/engine";

export const Homm3Game = {
  name: "homm3bg",
  setup: ({ ctx, random }) => ({
    engine: createInitialGameState(`match-${random.Number()}`)
  }),
  playerView: ({ G, playerID }) =>
    playerID ? { engine: getPlayerView(G.engine, seatToPlayerId(playerID)) } : G,
  moves: {
    submitAction({ G }, action) {
      const result = applyAction(G.engine, action);
      if (result.errors.length > 0) {
        return INVALID_MOVE;
      }
      G.engine = result.state;
    }
  }
};
```

Key detail: the engine keeps running its own priority/turn logic (reaction windows cut across boardgame.io turns), so boardgame.io stays in a single permissive phase and the engine's `assertLegal` remains the gatekeeper — never trust `ctx.currentPlayer` alone.

### Step 2 — Server process

- `src/server/boardgame-server.ts` running `Server({ games: [Homm3Game], origins })` on Railway/Render/Fly.
- Match creation/joining via the Lobby REST API; seats map to engine `PlayerId`s.
- Keep the existing Next.js REST rooms as a fallback/dev path until the socket path is stable.

### Step 3 — Client transport

- Replace polling with `boardgame.io/react` client or the vanilla socket client feeding the same React table components (the table only consumes `PlayerVisibleState` + `LegalAction[]`, so the swap is contained in `page.tsx`).
- The dice cinematic already keys off new `ATTACK_ROLLED` events in the synced state, so it works unchanged over sockets.

### Step 4 — Persistence + identity (Supabase)

- Supabase Postgres as the boardgame.io storage adapter (`bgio-postgres`) so matches survive restarts.
- Guest sessions first (signed cookie with display name), Supabase Auth later.
- Store finished-match event logs for replays.

### Step 5 — Lobby UX

- `/lobby`: create room (scenario, player count, seat colors) and join via code — same codes the REST rooms use today.
- Seat reservation + reconnect: the boardgame.io credentials token per seat lives in localStorage.
- Spectators: serve the redacted "no-seat" player view (hands hidden, decks counted).

## Hidden Information Rules (already enforced, keep enforcing)

- Hands: only the owner sees card ids; others see counts.
- Deck order: nobody sees it, including the owner.
- Search reveals: only the searcher sees revealed ids (`getVisiblePendingChoice`).
- Dice: rolled server-side from the seed at resolution time — clients can replay but not predict.

## Timers And Reactions Online

- Reaction windows need optional timers in multiplayer (configurable per room: off / 30s / 60s). On timeout the server auto-passes the priority player.
- An "auto-pass when I hold no legal instants" room toggle keeps the game flowing — the engine already closes windows automatically when nobody holds a legal reaction, so this only affects players who want to bluff-hold.

## Deployment Shape

```
Vercel (Next.js UI)  ──socket.io──>  Railway/Render (boardgame.io server)
        │                                   │
        └────────── Supabase (matches, auth, replays) ──────────┘
```

## Milestones

1. **M1 — Socket rooms**: boardgame.io server + client transport swap, 2 seats, same combat sandbox. Exit: two browsers play a full combat without polling.
2. **M2 — Lobby + persistence**: Supabase storage, reconnect, room codes, seat tokens.
3. **M3 — Spectators + timers**: redacted spectator view, reaction timers, auto-pass toggle.
4. **M4 — Map layer online**: adventure-map actions (see `game-flow-and-map-plan.md`) through the same move pipe.
