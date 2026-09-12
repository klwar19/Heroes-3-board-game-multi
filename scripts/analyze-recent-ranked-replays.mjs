/**
 * Read-only production replay audit for the newest completed ranked games.
 * It reports seat-level strategic timelines without names/account identities
 * and never executes the engine or a simulation.
 *
 * node scripts/analyze-recent-ranked-replays.mjs [count]
 */
import { gunzipSync } from "node:zlib";

process.loadEnvFile(".env.local");
const count = Math.max(1, Math.min(20, Number(process.argv[2] ?? 4) || 4));
const url = (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL)?.replace(/\/+$/, "");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Supabase replay credentials are unavailable.");
const headers = { apikey: key, Authorization: `Bearer ${key}` };

async function read(table, query) {
  const response = await fetch(`${url}/rest/v1/${table}?${query}`, {
    headers,
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Replay audit fetch failed: HTTP ${response.status}`);
  return response.json();
}

const rows = await read(
  "homm3bg_ranked_replays",
  `select=match_id,recorded_at,truncated,payload,payload_gzip_base64&order=recorded_at.desc&limit=${count}`,
);
const reports = [];
for (const row of rows) {
  const replay = row.payload ?? JSON.parse(
    gunzipSync(Buffer.from(row.payload_gzip_base64, "base64")).toString("utf8"),
  );
  const seats = {};
  for (const [playerId, player] of Object.entries(replay.initialState.players)) {
    if (playerId === "neutrals") continue;
    const entries = replay.entries.filter((entry) => entry.actorPlayerId === playerId);
    const moves = entries
      .filter((entry) => entry.action.type === "MOVE_HERO")
      .map((entry) => ({ round: entry.round, heroId: entry.action.heroId, to: entry.action.to }));
    const returns = [];
    const recentByHero = new Map();
    for (const move of moves) {
      const recent = recentByHero.get(move.heroId) ?? [];
      if (recent.length >= 2 && recent.at(-2).to === move.to) {
        returns.push({ round: move.round, heroId: move.heroId, via: recent.at(-1).to, to: move.to });
      }
      recent.push(move);
      recentByHero.set(move.heroId, recent.slice(-2));
    }
    const rounds = new Map();
    for (const entry of entries) {
      const list = rounds.get(entry.round) ?? [];
      list.push(entry.action.type);
      rounds.set(entry.round, list);
    }
    const marketRounds = [...rounds]
      .filter(([, actions]) => actions.includes("OPEN_MARKET"))
      .map(([round, actions]) => ({
        round,
        opens: actions.filter((type) => type === "OPEN_MARKET").length,
        trades: actions.filter((type) => type === "TRADE_RESOURCES").length,
        productiveMapActions: actions.filter((type) =>
          type === "MOVE_HERO" || type === "DISCOVER_TILE" ||
          type === "PLACE_TILE" || type === "START_NEUTRAL_COMBAT").length,
      }));
    const ownEvents = entries.flatMap((entry) =>
      entry.events.map((event) => ({ round: entry.round, sequence: entry.sequence, ...event })),
    );
    seats[playerId] = {
      faction: player.factionId,
      outcome: replay.winnerPlayerId
        ? replay.winnerPlayerId === playerId ? "win" : "loss"
        : "unknown",
      actionCount: entries.length,
      lastRound: entries.at(-1)?.round ?? null,
      marketRounds,
      marketTimeline: entries.filter((entry) =>
        entry.action.type === "OPEN_MARKET" ||
        entry.action.type === "TRADE_RESOURCES" ||
        entry.action.type === "CLOSE_MARKET" ||
        entry.action.type === "END_TURN" ||
        entry.action.type === "COMPLETE_SIMULTANEOUS_TURN"
      ).map((entry) => ({ sequence: entry.sequence, round: entry.round, action: entry.action.type })),
      immediateRouteReturns: returns,
      flags: ownEvents.filter((event) => event.type === "FIELD_FLAGGED").length,
      tilesOpened: ownEvents.filter((event) =>
        event.type === "TILE_PLACED" || event.type === "TILE_REVEALED")
        .map((event) => ({ round: event.round, type: event.type, tileDefId: event.tileDefId })),
      combatsWon: ownEvents.filter((event) =>
        event.type === "COMBAT_ENDED" && event.winnerPlayerId === playerId)
        .map((event) => ({ round: event.round, defeatedPlayerId: event.defeatedPlayerId })),
      milestones: ownEvents.filter((event) =>
        event.type === "STRUCTURE_BUILT" || event.type === "UNIT_RECRUITED" ||
        event.type === "HERO_LEVEL_UP" || event.type === "FIELD_FLAGGED")
        .map((event) => ({
          round: event.round,
          type: event.type,
          id: event.buildingId ?? event.unitDefId ?? event.location ?? `level-${event.level}`,
          kind: event.kind,
        })),
    };
  }
  reports.push({
    matchId: row.match_id,
    recordedAt: row.recorded_at,
    truncated: row.truncated,
    winnerPlayerId: replay.winnerPlayerId ?? null,
    seats,
  });
}
console.log(JSON.stringify({ count: reports.length, matches: reports }, null, 2));
