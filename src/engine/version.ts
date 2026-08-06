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
// v14: authoritative combat semantics changed so Rebirth resolves BEFORE a
// Creature Bank Stack Token or Pack→Few layer is lost. The earlier v13 worker
// consumed the Stack Token first, so a 5-damage hit left a Crypt Skeleton
// un-Stacked at 1 HP even when the frontend contained the fix. This is a pure
// reducer change (the catalogs below do not detect it), therefore the explicit
// protocol bump is required to make every stale room/server show the version-
// skew warning and to invalidate cached v13 room snapshots.
// v15: verified-identity seats (Phase 2). A new action (SET_ROOM_REQUIRE_AUTH),
// two new state fields (RoomMember.userId, RoomMembershipState.requireAuth) and a
// changed reducer contract — the seat-ownership guard now binds a signed-in actor
// to their verified account id (a spoofed actorClientId no longer grants a seat)
// and joinRoom stamps that id onto the member. A stale room server would ignore
// the new action and the verified-identity guard, so the explicit bump surfaces
// the version-skew banner instead of silently reverting to clientId-only seats.
// v16: changed reducer/legal-actions semantics — computerDecisionOwner mirrors
// getLegalActions' window precedence (the round-6 single-player table freeze: a
// computer-owned window behind the round-start barrier was owned by nobody),
// the runner's stall recovery, the edge adopting the duplicate-army-id repair
// on rejected actions, and mandatory ability-target choices becoming skippable
// once every candidate died. A stale worker legality-checks differently from
// the new client, which surfaces as "That action is not legal in the current
// game state" on clicks the table itself offered — the catalogs cannot detect
// any of this, so the explicit bump makes the skew banner fire.
// v17: new persisted GameState schema + reducer semantics that a stale room
// server cannot understand — the `polish-grail-utopia` house rule (random
// Grail/Utopia placement, guard packages, dig/build rules), a new
// `subterranean-tile-pick` OPTION_CHOICE opened on first gate entry (resolved
// through CHOOSE_OPTION), the single-player map-authored deployment + per-seat
// `computerStartingBonus`, the `garrisonBorderPassage` field, and the
// `subterraneanTilePool` / `tileIdentityLocked` / `gateTileChoiceEligible`
// state. None of these touch the hero/faction/unit catalogs the fingerprint
// hashes, so the explicit bump is required to make a skewed edge/client show
// the version banner instead of silently ignoring the new rules or rejecting a
// `subterranean-tile-pick` click the new client offers.
// v18: another batch of persisted schema + reducer semantics a stale room
// server cannot replicate — the `market_trade` designer timed event (a
// trade-only Market after Resource-round income, raising the round-start
// barrier), the hidden Grail/Utopia editor package (`objectives.hiddenGrailUtopia`,
// `grailFieldCleared`) and the now-COUNTED `defeat-dragon-utopia` win condition
// (`utopiaDefeatedFieldIds`), a new `dimension-door-hero` OPTION_CHOICE with
// multi-hero Dimension Door / Town Portal (a v17 server offers only the main
// hero, so a secondary-hero cast or its CHOOSE_OPTION indices mismatch), the
// `garrisonBorderPassage` default flipped OFF→ON (changed `canCrossEdge`
// movement legality) and the lethal-save reaction window now opening for a
// Polish Unit-Stack layer hit (`stackLayerOnly`), plus 6-player skirmish seats
// (`unusedStartsAsNearFrom`). None touch the hero/faction/unit catalogs the
// fingerprint hashes, so the explicit bump makes a skewed edge/client show the
// version banner instead of silently dropping these rules or rejecting a
// `dimension-door-hero` click the new client offers.
// v19: the 2026-08-06 gameplay-fixes batch — a new
// `ACKNOWLEDGE_FIRST_PLAYER_ROLL` action + the `openingFirstPlayerRollPending`
// opening gate (a stale edge would reject the dismiss click and strand the
// table), the `GRAIL_TILE_SCRY` visit step (private Obelisk Grail clues),
// `USE_UNIT_DIE_IGNORE` gaining a REQUIRED `discardCardId` (the Halberdier
// Parry selectable discard — old/new payloads are mutually unintelligible),
// the PLAY_CARD/PLAY_REACTION `drawOnly`/`utilityOnly` flags, per-owner
// in-flight card tracking (`playedCardIdsByPlayer`) with recovery
// `excludeCardIds`, and two new house rules (`initiative-specialty-draw`,
// `eversmoking-ring-of-sulfur-major`). None touch the hero/faction/unit
// catalogs the fingerprint hashes, so the explicit bump makes a skewed
// edge/client show the version banner instead of silently dropping the new
// rules or rejecting the new actions.
// v20: Grail → Utopia conversion re-timed and de-rewarded (USER RULE
// 2026-08-07). New persisted state a stale room server neither writes nor
// understands: `adventure.grailTakenFieldId` / `grailTakenConversion` (the
// conversion now fires at the DIG, not when a Grail's guards fall, and the dug
// field is excluded by id) and `MapFieldState.grailConverted` (a converted extra
// Grail pays NO Utopia reward and is not a Dragon-Hunt / VP Utopia). A v19 edge
// would convert on the guard clear and pay the full 20 gold + Search 3/5/5 +
// token pick on a converted site — a silent rules divergence between the two
// halves, which is exactly what the version banner exists to surface. It also
// drops the `grailAsUtopia: "always"` pre-dig Utopia-dragon guard swap (a v19
// server deals a different guard army for the same field).
export const ENGINE_PROTOCOL_VERSION = 20;

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
