// Read stored replay actions/events only. Does not import or execute the engine.
import { gunzipSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
process.loadEnvFile('.env.local');
const base = (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL).replace(/\/+$/, '');
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const response = await fetch(`${base}/rest/v1/homm3bg_ranked_replays?select=match_id,recorded_at,truncated,payload,payload_gzip_base64&order=recorded_at.desc&limit=4`, {
  headers: { apikey: key, Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(30000),
});
if (!response.ok) throw Error(`Replay read HTTP ${response.status}`);
for (const row of await response.json()) {
  const replay = row.payload ?? JSON.parse(gunzipSync(Buffer.from(row.payload_gzip_base64, 'base64')).toString('utf8'));
  const path = `artifacts/ai-review-${row.match_id}.json`;
  writeFileSync(path, JSON.stringify(replay));
  const eventCounts = {};
  const starts = [], ends = [];
  for (const entry of replay.entries) {
    for (const event of entry.events ?? []) {
      eventCounts[event.type] = (eventCounts[event.type] ?? 0) + 1;
      if (event.type === 'COMBAT_STARTED') starts.push({sequence:entry.sequence,round:entry.round,action:entry.action,event});
      if (event.type === 'COMBAT_ENDED') ends.push({sequence:entry.sequence,round:entry.round,event});
    }
  }
  console.log(JSON.stringify({path,recordedAt:row.recorded_at,captureStart:replay.captureStart,truncated:row.truncated,keys:Object.keys(replay),controls:replay.initialState.computerPlayers,starts,ends,eventCounts}));
}
