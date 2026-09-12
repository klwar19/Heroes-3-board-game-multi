import fs from 'node:fs';
process.loadEnvFile('.env.local');
const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw Error('Database credentials unavailable');
const headers = { apikey: key, Authorization: 'Bearer ' + key };
async function get(table, query) {
  const response = await fetch(url.replace(/\/+$/, '') + '/rest/v1/' + table + '?' + query,
    { headers, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw Error('Replay read HTTP ' + response.status);
  return response.json();
}
const filter = 'recorded_at=gte.2026-09-05T17:00:00Z&recorded_at=lt.2026-09-06T17:00:00Z';
const matches = await get('homm3bg_matches', 'select=match_id,recorded_at,participants&' + filter);
const four = matches.filter(m => m.participants?.length === 4);
console.log(JSON.stringify(four));
for (const match of four) {
  const rows = await get('homm3bg_ranked_replays', 'select=match_id,payload&match_id=eq.' + encodeURIComponent(match.match_id));
  for (const row of rows) {
    const path = 'artifacts/four-player-' + row.match_id.replace(/[^a-zA-Z0-9_-]/g,'_') + '.json';
    fs.writeFileSync(path, JSON.stringify(row.payload));
    console.log(JSON.stringify({path, entries: row.payload.entries.length, initial: row.payload.captureStart, truncated: row.payload.truncated}));
  }
}
