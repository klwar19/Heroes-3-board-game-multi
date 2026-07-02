# Multiplayer Platform Plan (boardgame.io Path)

> **Status update:** the edge backend now exists as a PartyKit scaffold —
> `party/index.ts` runs one Cloudflare Durable Object per room (the
> authoritative twin of `src/server/game-room-store.ts`), persists snapshots
> in Durable Object storage, and broadcasts over WebSockets. The client picks
> it up through `src/lib/realtime.ts` when `NEXT_PUBLIC_PARTYKIT_HOST` is set
> and falls back to the built-in API + SSE store otherwise.

> **Rooms / host / seats (implemented, engine-enforced + tested).** Membership
> now lives inside the synced `GameState` as `state.room`
> (`RoomMembershipState`), so it flows through `applyAction` like any rule and
> works identically on both transports. See `src/engine/room.ts` and the tests
> in `src/engine/room-membership.test.ts` / `src/server/game-room-store.test.ts`
> / `src/components/table/room-panel.test.tsx`.
>
> - **Two modes.** *Open table* (no `room`, or `hosted:false`) keeps the
>   original free local seat-switch — the easy single-browser test mode, with
>   no seat enforcement. *Hosted* (`hosted:true`) locks seats: only the host
>   assigns/kicks/transfers, players cannot self-move, and a game action is
>   accepted only from the client whose seat matches its `playerId`.
> - **Actions** (all keyed by a stable per-browser `clientId` in localStorage,
>   `src/lib/identity.ts`): `JOIN_ROOM`, `LEAVE_ROOM`, `SET_ROOM_HOSTED`,
>   `ASSIGN_SEAT` (host; the host may seat themselves as Player 1, bumping a
>   prior occupant to observer), `KICK_MEMBER` (host), `TRANSFER_HOST` (host).
> - **Seat ownership** is enforced in `applyAction` via `roomActionGuard` when
>   the transport supplies `actorClientId` (PartyKit message / API body). Room
>   membership is **carried across a game reset** so a table need not re-host.
> - **Observers** are unbounded (seat `"observer"`, hands filtered by the
>   existing `getPlayerView`). The shareable invite link + "New room" / "Host
>   this room" controls live in `src/components/table/room-panel.tsx`.
> - **Trust boundary (declared, not hidden):** `actorClientId` is the value the
>   client claims; there is no auth binding a socket to a clientId yet (guest
>   play). The engine enforces the rule *given* the claimed identity — it is not
>   yet a defence against a client forging another's id. Authentication is the
>   next milestone (Step 4 below).
> - **Destructive room ops are host-gated (same claimed-identity model):**
>   `closeRoom`, `resetRoom` (both backends, socket + HTTP — see
>   `reset-authority.test.ts`) and, on hosted lobbies, `restoreRoom`
>   (member-only) all refuse a non-host/non-member actor.
> - **Known wire-level privacy limit (NOT yet fixed):** every snapshot is
>   broadcast as the FULL `GameState`; `getPlayerView` redacts hands, deck
>   order, face-down tiles and private pending choices only at render time in
>   the browser. Anyone reading the WebSocket/SSE frames (devtools) sees
>   everything. Fixing it means per-recipient redaction at the transport
>   (per-connection views keyed by seat) and belongs to the auth milestone —
>   the redactor itself (`src/engine/player-view.ts`) already exists.
> - **Smaller accepted gaps (same trust model):** the PartyKit lobby directory
>   Durable Object accepts unauthenticated POST/DELETE (worst case: a room
>   vanishes from the browser list, join-by-code still works); an SSE/socket
>   opened with someone else's clientId reaps that id's ephemeral OBSERVER
>   membership on disconnect (seated players and hosts are never reaped);
>   PartyKit snapshots carry no `bootId` (the built-in store's
>   version-counter-reset escape hatch) — Durable Object storage persists, so
>   the freeze that bootId guards against needs a storage wipe to occur.
>
> **Lobby / room directory (implemented on the built-in backend, tested).**
> Opening the app with no `?room=` link now shows a **lobby** (`src/components/
> lobby.tsx`) — a live list of rooms with names, member/seat counts, host, and
> "setting up / in progress" status — plus create, join-by-code, and close. The
> same controls (name, close, browse) are also in the in-table Room panel, so
> both surfaces work. Backed by:
> - **Room naming.** `SET_ROOM_NAME` (engine action, `state.room.name`) — open
>   table: any member; hosted: host-only. `roomDisplayName()` falls back to a
>   `Room <id>` default. Tested in `room-membership.test.ts` /
>   `room-panel.test.tsx`.
> - **Directory + creation + close + expiry** live in `src/server/
>   game-room-store.ts`: `listRooms(viewerClientId?)` (merges in-memory + disk,
>   computes a per-viewer `canClose`), `createRoom()` (named, attributed, never
>   clobbers an existing id), `closeRoom()` (host on a hosted room, any member on
>   an open one — broadcasts a `closed` frame so connected clients drop back to
>   the lobby), and **auto-expiry** of empty rooms idle past `STALE_ROOM_TTL_MS`
>   (6h), pruned (store + disk) as the directory is listed. REST surface:
>   `GET/POST /api/rooms`, `DELETE /api/rooms/[roomId]`. All covered by
>   `game-room-store.test.ts` (directory, create, close authorization, expiry).
> - **Trust boundary (unchanged):** `actorClientId` for close is client-claimed,
>   exactly like the seat lock — it enforces the rule *given* the identity, not
>   against a forged one. Auth is still the next milestone.
> - **PartyKit (edge backend) — now lists rooms too.** Room naming and host-close
>   already worked there (the action flows through synced state; the party answers
>   a `DELETE` and broadcasts `closed`). Room **listing** is now closed: a single
>   **lobby Durable Object** (`party/lobby.ts`, addressed at the fixed singleton
>   `/parties/lobby/directory`) holds the registry of live rooms. Each room party
>   reports its directory record to it whenever a browser-visible field changes
>   (name / members / host / phase) and deregisters on close (`reportToLobby` /
>   `deregisterFromLobby` in `party/index.ts`); the browser's `fetchRoomList()`
>   GETs the lobby object, so `supported:true` on the edge and the room browser
>   works. It still reports `supported:false` (falling back to join-by-code) only
>   when that object can't be reached — e.g. a PartyKit deploy made before the
>   lobby party existed.
>   - **What is tested vs. not (no dressing up).** The directory *logic* —
>     derivation, per-viewer `canClose`, stale-room expiry, dedup, sort — lives in
>     the shared, isomorphic `src/server/lobby-registry.ts` and is covered by
>     `lobby-registry.test.ts` (each rule with a mutation control) plus
>     `lobby-party.test.ts`, which drives the Durable Object's GET/POST/DELETE +
>     storage round-trip through a fake room. The **built-in store and the edge
>     now derive the directory from the same module**, so they can't diverge. What
>     vitest does **not** exercise is the cross-party network plumbing itself (the
>     room party's `fetch` to the lobby object, and real Durable Object storage):
>     that needs the PartyKit/Workers runtime and is verified only by `tsc` +
>     `partykit deploy`, exactly like the rest of `party/index.ts`.
>
> **Still future work:** simultaneous early-day turns in adventure mode (the
> `TurnState.mode`/`simultaneousRoundLimit` scaffolding exists but is wired only
> for combat-sandbox today), per-player concurrent map combats (today there is
> one global combat slot), a PartyKit lobby Durable Object (room listing on the
> edge backend), and auth/persistent identity. The notes below about lobbies and
> the boardgame.io carrier remain as background.


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
