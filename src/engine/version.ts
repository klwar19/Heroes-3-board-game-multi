import { coreFactionDefinitions, coreHeroDefinitions } from "@/data/factions/core";
import { coreUnitDefinitions } from "@/data/factions/units";

/**
 * Room-server / client compatibility fingerprint.
 *
 * The app ships as two independently-deployed halves:
 *   - the Vercel frontend (this bundle), and
 *   - the PartyKit room server (party/index.ts), which is the authoritative
 *     rules engine and validates every action.
 *
 * They drift apart when one is redeployed without the other — e.g. the UI
 * ships new heroes (Moandor/Zydar) or a new action (Hire a Secondary Hero)
 * but the room server still runs the old engine and silently rejects them.
 * That looked like "the hero can't be selected / hiring does nothing".
 *
 * Both halves compile ENGINE_SIGNATURE from their own copy of the engine, and
 * the server stamps it onto every snapshot it sends. The client compares the
 * server's signature against its own; a mismatch surfaces a visible "room
 * server is out of date — redeploy PartyKit" banner instead of a silent
 * failure. See README "Deploying" and .github/workflows/deploy-partykit.yml.
 */

/**
 * Bump when the action set or the persisted GameState schema changes in a way
 * the room server must understand (a new `GameAction` type, changed reducer
 * semantics, a new required state field). Pure content additions — heroes,
 * factions, units — are detected automatically by the fingerprint below and
 * do NOT need a bump.
 */
export const ENGINE_PROTOCOL_VERSION = 8;

/** FNV-1a (32-bit) — small, dependency-free, and identical under every V8
 * runtime the two halves run on (Vercel Node and Cloudflare Workers). */
function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * A short, stable fingerprint of the rules engine's content + protocol. It
 * changes whenever the catalog of heroes / factions / units changes, or the
 * protocol version is bumped — exactly the cases where a stale room server
 * would reject actions the new UI offers. Keys are sorted so the value is
 * deterministic regardless of declaration order.
 */
export const ENGINE_SIGNATURE: string = (() => {
  const heroes = Object.keys(coreHeroDefinitions).sort().join(",");
  const factions = Object.keys(coreFactionDefinitions).sort().join(",");
  const units = Object.keys(coreUnitDefinitions).sort().join(",");
  return `v${ENGINE_PROTOCOL_VERSION}-${fnv1a(`${heroes}|${factions}|${units}`)}`;
})();
