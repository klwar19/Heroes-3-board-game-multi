# Multiplayer Platform Plan (boardgame.io Path)

> **Status update:** the edge backend now exists as a PartyKit scaffold —
> `party/index.ts` runs one Cloudflare Durable Object per room (the
> authoritative twin of `src/server/game-room-store.ts`), persists snapshots
> in Durable Object storage, and broadcasts over WebSockets. The client picks
> it up through `src/lib/realtime.ts` when `NEXT_PUBLIC_PARTYKIT_HOST` is set
> and falls back to the built-in API + SSE store otherwise. Everything below
> about lobbies, auth and seat claiming still applies as future work.


The current prototype already plays like a shared table: a server-authoritative rules engine, REST rooms with **Server-Sent Events push** (polling only as fallback), seat switching, observer seats, and player-view filtering. This document plans the jump to a real multiplayer platform.

## Hosting alternatives beyond boardgame.io (2026 survey)

boardgame.io is a *framework*, not a host — wherever it runs you still need a server. Because our engine is already a pure `(state, action) → state` reducer with its own legality checks, **any** of these carriers works; they differ in latency, cost and ops effort. Ranked for this project:

| Option | What it gives us | Latency / performance | Cost & ops | Verdict |
| --- | --- | --- | --- | --- |
| **Cloudflare Workers + Durable Objects (or PartyKit)** | One Durable Object per room = the in-memory `game-room-store` we already have, with WebSockets and global edge routing. Hibernation keeps idle rooms free. | Best-in-class: players connect to the nearest edge; room state lives in one location → consistent ordering, ~30–80 ms RTT. | Generous free tier, pay-per-use after. No servers to babysit. | **Recommended target.** Our SSE room store ports almost 1:1; swap SSE for a WebSocket per room. |
| **Colyseus (self-hosted on Fly.io / Railway / Render)** | Purpose-built game-room server: rooms, seat reservation, state-diff sync (delta patches), matchmaking, spectators out of the box. | Excellent; binary delta patches are smaller than our JSON snapshots — good for "see every hero move live". | A real Node process to run (Fly.io ~$3–5/mo); scaling = more processes. | **Best if we want engine-grade room infrastructure** and built-in spectator support. |
| **boardgame.io on Railway/Render/Fly** | Turn order, phases, lobby, playerView, socket transport. | Fine for turn-based play; heavier than Colyseus for live map movement (full-state broadcasts). | Free tiers exist; project maintenance has slowed — treat as stable but not evolving. | Good fit conceptually, but our engine already does the parts boardgame.io is best at (turns, legality, player views). |
| **Supabase Realtime / Firebase RTDB** | Managed sync: write the snapshot to a row/document, every subscriber gets it pushed. Auth + persistence included. | Good (~100 ms); broadcasts full snapshots, fine at our state size. | Zero server ops; free tiers cover a hobby table. Rules must be enforced via edge functions to stay server-authoritative. | Easiest "no backend" path; pair with an Edge Function that runs `applyAction`. |
| **Liveblocks / Ably / Pusher** | Managed WebSocket rooms + presence (great for cursors/hero pawns). | Very good. | Per-connection pricing; rules enforcement still needs a function somewhere. | Nice for presence polish, not a full solution alone. |
| **Hathora / Rivet** | Managed game-server fleets (regions on demand). | Aimed at session shooters; overkill for a board game. | More setup than we need. | Skip for now. |

**Bottom line:** keep the Next.js app on Vercel for the UI, and move the room store to **Cloudflare Durable Objects (PartyKit)** for the cheapest global low-latency rooms, or **Colyseus on Fly.io** if we prefer batteries-included room/spectator infrastructure. The engine and the React table need no changes either way — only the transport layer in `page.tsx` and the room store swap.

### What already works today (this repo)

- **Real-time map movement for all players:** every action POST broadcasts the new snapshot over the room's SSE stream; all seats and observers see hero moves and combat actions the moment they happen.
- **Observers of battles:** the `Observer` seat (and any non-fighting player) watches combats live with hands hidden; nothing is polled, updates are pushed.

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
