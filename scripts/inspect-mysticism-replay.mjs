import fs from "node:fs";
import { gunzipSync } from "node:zlib";
process.loadEnvFile(".env.local");
const url = (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL)?.replace(/\/+$/, "");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw Error("Replay credentials unavailable");
const response = await fetch(`${url}/rest/v1/homm3bg_ranked_replays?select=match_id,recorded_at,payload,payload_gzip_base64&order=recorded_at.desc&limit=8`, {
  headers: { apikey: key, Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(30000),
});
if (!response.ok) throw Error(`Replay read failed: ${response.status}`);
fs.mkdirSync("artifacts/mysticism-review", { recursive: true });
for (const row of await response.json()) {
  const replay = row.payload ?? JSON.parse(gunzipSync(Buffer.from(row.payload_gzip_base64, "base64")).toString());
  const players = Object.entries(replay.initialState.players).filter(([id]) => id !== "neutrals").map(([id, player]) => ({ id, name: player.name, faction: player.factionId }));
  console.log(JSON.stringify({ match: row.match_id, time: row.recorded_at, players, entries: replay.entries.length }));
  if (!players.some((p) => p.faction === "conflux") || !players.some((p) => p.faction === "castle")) continue;
  const file = `artifacts/mysticism-review/${row.match_id.replace(/[^a-z0-9_-]/gi, "_")}.json`;
  fs.writeFileSync(file, JSON.stringify(replay));
  const hits = replay.entries.flatMap((entry, index) => {
    const actions = entry.action.plays ?? [entry.action];
    return actions.some((action) => action.cardId === "ability.mysticism") ? [index] : [];
  });
  console.log(JSON.stringify({ file, mysticism: hits.map((i) => replay.entries.slice(Math.max(0, i - 5), i + 5).map((entry) => ({ sequence: entry.sequence, round: entry.round, action: entry.action, events: entry.events }))) }));
}
