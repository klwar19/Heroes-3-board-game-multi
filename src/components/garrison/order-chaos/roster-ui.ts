/**
 * Order & Chaos: Crag Hack's first-time words about the roster in battle — the
 * first sight of a Chaos creature, the first time a hybrid is fused, the first
 * time a tricky troop is planted, the first stand-off foe that runs out of ammunition (lines in engine/garrison/order-chaos/roster-tips.ts).
 * Each line is said once per battle at most, and once per browser in all (it is
 * remembered in local storage; if storage is refused it simply may repeat).
 */

import { ENEMIES } from "@/engine/garrison/content";
import { baseKind } from "@/engine/garrison/order-chaos/forms";
import { OC_BOSS_TIPS } from "@/engine/garrison/order-chaos/boss-tips";
import { OC_FOE_TIPS, OC_FUSION_TIPS, OC_PLACE_TIPS, OC_STANDOFF_TIP } from "@/engine/garrison/order-chaos/roster-tips";
import type { OcLine } from "@/engine/garrison/order-chaos/story";
import type { GarrisonEvent } from "@/engine/garrison/sim";
import { setItemMakingRoom } from "@/lib/storage-space";

const KEY = "order-chaos:roster-tips:v1";
let remembered: Set<string> | null = null;

function seenTips(): Set<string> {
  if (remembered) return remembered;
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(KEY) : null;
    const list: unknown = raw ? JSON.parse(raw) : [];
    remembered = new Set(Array.isArray(list) ? list.filter((id): id is string => typeof id === "string") : []);
  } catch {
    remembered = new Set();
  }
  return remembered;
}

function remember(id: string): void {
  const seen = seenTips();
  seen.add(id);
  try {
    setItemMakingRoom(KEY, JSON.stringify([...seen]));
  } catch {
    // Storage refused: the tip may be said again another day.
  }
}

/** Crag's word for this event, the first time it happens (null: nothing to say). `said` holds this battle's. */
export function rosterQuip(ev: GarrisonEvent, said: Set<string>): OcLine | null {
  let id: string | null = null;
  let line: OcLine | undefined;
  if (ev.e === "spawn" && ev.side === "wave" && !ENEMIES[ev.kind]?.ally) {
    id = `foe:${ev.kind}`;
    line = OC_FOE_TIPS[ev.kind] ?? OC_BOSS_TIPS[ev.kind];
  } else if (ev.e === "fuse") {
    const kind = baseKind(ev.kind);
    id = `fuse:${kind}`;
    line = OC_FUSION_TIPS[kind];
  } else if (ev.e === "place") {
    const kind = baseKind(ev.kind);
    id = `place:${kind}`;
    line = OC_PLACE_TIPS[kind];
  } else if (ev.e === "unnerved") {
    id = "rule:standoff";
    line = OC_STANDOFF_TIP;
  }
  if (!id || !line || said.has(id)) return null;
  if (seenTips().has(id)) {
    said.add(id);
    return null;
  }
  // One tip at a time: another that comes up while Crag is still talking waits for the next chance.
  const now = typeof performance !== "undefined" ? performance.now() : Date.now();
  if (now - lastTipAt < TIP_GAP_MS) return null;
  lastTipAt = now;
  said.add(id);
  remember(id);
  return line;
}

/** How long a tip stays up before Crag moves on to the next (the battle UI shows a quip for about 5 s). */
const TIP_GAP_MS = 5500;
let lastTipAt = -1e9;
