"use client";

/**
 * Garrison Wars online duels. Two browsers meet in a relay room (PartyKit
 * party "garrison", or the built-in SSE relay in local development). The host
 * runs the authoritative simulation; each tick's commands travel to the guest
 * in ordered batches and the guest replays them on its own copy (lockstep).
 * Periodic checksums catch any drift and the host then re-sends a snapshot.
 */

import PartySocket from "partysocket";
import { GW_TICK_MS } from "@/engine/garrison/content";
import {
  cloneGarrison, createGarrison, garrisonHash, stepGarrison,
  type GarrisonConfig, type GarrisonEvent, type GarrisonState, type Side, type SidedCommand
} from "@/engine/garrison/sim";
import type { GarrisonDriver } from "@/components/garrison/driver";
import { getPartyKitHost } from "./party-origin";

export type Role = "host" | "guest";

/**
 * Bumped whenever the simulation changes in a way that would make two
 * browsers disagree: host and guest must run the same rules to stay in lockstep.
 */
export const GARRISON_NET_VERSION = 11;

/** Frames between the two seats. */
export type NetFrame =
  | { k: "hello"; role: Role }
  | { k: "peer"; role: Role; present: boolean }
  | { k: "full" }
  | { k: "ping" }
  | { k: "start"; seq: number; version: number; config: GarrisonConfig; guestSide: Side; lobby: unknown }
  | { k: "ticks"; seq: number; upto: number; batches: [number, SidedCommand[]][]; hash?: [number, number] }
  | { k: "snap"; seq: number; state: GarrisonState }
  | { k: "cmd"; c: SidedCommand }
  | { k: "desync"; at: number }
  | { k: "bye" };

export type Link = {
  send(frame: NetFrame): void;
  close(): void;
};

export type LinkHandlers = {
  onFrame(frame: NetFrame): void;
  onClosed(reason: string): void;
};

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function newRoomCode(): string {
  let code = "";
  for (let i = 0; i < 5; i += 1) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return code;
}

export function normalizeCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
}

function clientId(): string {
  return `gw-${Math.random().toString(36).slice(2, 12)}${Date.now().toString(36)}`;
}

export function openLink(code: string, handlers: LinkHandlers): Link {
  const host = getPartyKitHost();
  const parse = (data: unknown) => {
    if (typeof data !== "string") return;
    try {
      handlers.onFrame(JSON.parse(data) as NetFrame);
    } catch {
      // Malformed frame: ignore.
    }
  };
  if (host) {
    const socket = new PartySocket({ host, party: "garrison", room: `gw-${code}`, maxRetries: 0 });
    let closed = false;
    socket.addEventListener("message", (event) => parse(event.data));
    socket.addEventListener("close", () => {
      if (!closed) handlers.onClosed("Connection lost.");
      closed = true;
    });
    return {
      send: (frame) => {
        if (!closed) socket.send(JSON.stringify(frame));
      },
      close: () => {
        closed = true;
        socket.close();
      }
    };
  }
  // Built-in backend: SSE down, POST up (sends serialized so frames keep their order).
  const id = clientId();
  const base = `/api/garrison-relay/${encodeURIComponent(code)}`;
  const source = new EventSource(`${base}?clientId=${encodeURIComponent(id)}`);
  let closed = false;
  let chain: Promise<unknown> = Promise.resolve();
  source.onmessage = (event) => parse(event.data);
  source.onerror = () => {
    if (source.readyState === EventSource.CLOSED && !closed) {
      closed = true;
      handlers.onClosed("Connection lost.");
    }
  };
  return {
    send: (frame) => {
      if (closed) return;
      const body = JSON.stringify({ clientId: id, frame: JSON.stringify(frame) });
      chain = chain
        .then(() => fetch(base, { method: "POST", headers: { "Content-Type": "application/json" }, body }))
        .catch(() => undefined);
    },
    close: () => {
      closed = true;
      source.close();
    }
  };
}

const HASH_EVERY = 60;
const SEND_EVERY = 2;

/** Host: the authoritative simulation; batches its ticks to the guest. */
export function createHostDriver(config: GarrisonConfig, hostSide: Side, link: Link, startSeq: number): GarrisonDriver & { receive(frame: NetFrame): void } {
  const state = createGarrison(config);
  const guestSide: Side = hostSide === "def" ? "atk" : "def";
  let queue: SidedCommand[] = [];
  let acc = 0;
  let seq = startSeq;
  let pending: [number, SidedCommand[]][] = [];
  let lastSent = 0;
  let hash: [number, number] | undefined;
  let peerGone = false;
  const flush = () => {
    link.send({ k: "ticks", seq: seq++, upto: state.tick, batches: pending, hash });
    pending = [];
    hash = undefined;
    lastSent = state.tick;
  };
  return {
    state: () => state,
    local: [hostSide],
    canPause: false,
    submit(cmd) {
      if (cmd.by === hostSide) queue.push(cmd);
    },
    receive(frame) {
      if (frame.k === "cmd" && frame.c && frame.c.by === guestSide) queue.push(frame.c);
      else if (frame.k === "desync") {
        flush();
        link.send({ k: "snap", seq: seq++, state: cloneGarrison(state) });
      } else if (frame.k === "peer" && frame.role === "guest") peerGone = !frame.present;
      else if (frame.k === "bye") peerGone = true;
    },
    pump(dtMs) {
      const events: GarrisonEvent[] = [];
      if (!state.outcome) acc += Math.min(250, dtMs);
      let steps = 0;
      while (acc >= GW_TICK_MS && steps < 10 && !state.outcome) {
        const commands = queue;
        queue = [];
        stepGarrison(state, commands);
        if (commands.length) pending.push([state.tick, commands]);
        if (state.tick % HASH_EVERY === 0) hash = [state.tick, garrisonHash(state)];
        if (state.events.length) events.push(...state.events);
        acc -= GW_TICK_MS;
        steps += 1;
      }
      if (steps >= 10) acc = Math.min(acc, GW_TICK_MS);
      if (state.tick - lastSent >= SEND_EVERY || (state.outcome && state.tick !== lastSent) || pending.length > 0) flush();
      return { events, alpha: Math.max(0, Math.min(1, acc / GW_TICK_MS)) };
    },
    status: () => (peerGone ? "Your opponent left the match." : null),
    dispose() {
      link.send({ k: "bye" });
      link.close();
    }
  };
}

/** Guest: replays the host's batches on its own copy, never ahead of the host. */
export function createGuestDriver(config: GarrisonConfig, guestSide: Side, link: Link, firstSeq: number): GarrisonDriver & { receive(frame: NetFrame): void } {
  let state = createGarrison(config);
  let expect = firstSeq;
  const early = new Map<number, NetFrame>();
  const batches = new Map<number, SidedCommand[]>();
  const hashes = new Map<number, number>();
  let known = 0;
  let acc = 0;
  let waitingSnap = false;
  let hostGone = false;
  let lag = 0;
  let stalledSince = 0;
  let askedAt = 0;
  const askSnapshot = (at: number) => {
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (now - askedAt < 3000) return;
    askedAt = now;
    waitingSnap = true;
    link.send({ k: "desync", at });
  };
  const apply = (frame: NetFrame) => {
    if (frame.k === "ticks") {
      for (const [tick, cmds] of frame.batches) if (tick > state.tick) batches.set(tick, cmds);
      if (frame.hash) hashes.set(frame.hash[0], frame.hash[1]);
      known = Math.max(known, frame.upto);
    } else if (frame.k === "snap") {
      state = frame.state;
      state.events = [];
      for (const tick of [...batches.keys()]) if (tick <= state.tick) batches.delete(tick);
      for (const tick of [...hashes.keys()]) if (tick <= state.tick) hashes.delete(tick);
      known = Math.max(known, state.tick);
      waitingSnap = false;
    }
  };
  return {
    state: () => state,
    local: [guestSide],
    canPause: false,
    submit(cmd) {
      if (cmd.by === guestSide) link.send({ k: "cmd", c: cmd });
    },
    receive(frame) {
      if (frame.k === "ticks" || frame.k === "snap") {
        if (frame.seq < expect) return;
        // A snapshot supersedes anything missing before it.
        if (frame.k === "snap") {
          for (const seq of [...early.keys()]) if (seq < frame.seq) early.delete(seq);
          expect = frame.seq;
        }
        early.set(frame.seq, frame);
        while (early.has(expect)) {
          const next = early.get(expect)!;
          early.delete(expect);
          expect += 1;
          apply(next);
        }
      } else if (frame.k === "peer" && frame.role === "host") hostGone = !frame.present;
      else if (frame.k === "bye") hostGone = true;
    },
    pump(dtMs) {
      const events: GarrisonEvent[] = [];
      const now = typeof performance !== "undefined" ? performance.now() : Date.now();
      // A frame went missing (a reconnect on the SSE relay): ask for a snapshot.
      if (early.size > 0) {
        stalledSince ||= now;
        if (now - stalledSince > 2000) askSnapshot(state.tick);
      } else {
        stalledSince = 0;
      }
      // Our copy ended but the host plays on: we drifted, resynchronise.
      if (state.outcome && known > state.tick) askSnapshot(state.tick);
      if (waitingSnap) {
        if (now - askedAt > 3000) waitingSnap = false;
        return { events, alpha: 1 };
      }
      acc += Math.min(250, dtMs);
      const behind = known - state.tick;
      // Catch up quickly when far behind; otherwise follow the host's pace.
      const budget = behind > 8 ? Math.min(40, behind) : 10;
      let steps = 0;
      while (state.tick < known && steps < budget && (acc >= GW_TICK_MS || behind > 8)) {
        const next = state.tick + 1;
        stepGarrison(state, batches.get(next) ?? []);
        batches.delete(next);
        if (state.events.length) events.push(...state.events);
        const expected = hashes.get(state.tick);
        if (expected !== undefined) {
          hashes.delete(state.tick);
          if (expected !== garrisonHash(state)) {
            askSnapshot(state.tick);
            break;
          }
        }
        acc = Math.max(0, acc - GW_TICK_MS);
        steps += 1;
      }
      if (state.tick >= known) acc = Math.min(acc, GW_TICK_MS);
      lag = known - state.tick;
      return { events, alpha: state.tick < known ? Math.max(0, Math.min(1, acc / GW_TICK_MS)) : 1 };
    },
    status: () => (hostGone ? "The host left the match." : waitingSnap ? "Resynchronising…" : lag > 20 ? "Catching up…" : null),
    dispose() {
      link.send({ k: "bye" });
      link.close();
    }
  };
}
