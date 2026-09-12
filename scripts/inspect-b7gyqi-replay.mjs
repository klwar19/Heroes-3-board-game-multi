// Read-only production retrieval and recorded-event analysis; no engine execution.
import fs from 'node:fs';
import { gunzipSync } from 'node:zlib';
process.loadEnvFile('.env.local');
const matchId = 'room-room-b7gyqi-9b8c7c7d-257e-45af-b01d-26cf482fd361';
const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const response = await fetch(`${url}/rest/v1/homm3bg_ranked_replays?select=*&match_id=eq.${matchId}`, {headers:{apikey:key,Authorization:`Bearer ${key}`}});
if (!response.ok) throw new Error(`Replay fetch HTTP ${response.status}`);
const rows = await response.json();
if (!rows.length) { console.log('Replay still pending upload'); process.exit(0); }
const row = rows[0];
const replay = row.payload ?? JSON.parse(gunzipSync(Buffer.from(row.payload_gzip_base64,'base64')).toString('utf8'));
const directory = 'artifacts/match-b7gyqi';
fs.mkdirSync(directory,{recursive:true});
fs.writeFileSync(`${directory}/replay.json`,JSON.stringify(replay));
const count = xs => Object.fromEntries([...new Set(xs)].map(x=>[x,xs.filter(y=>y===x).length]).sort((a,b)=>b[1]-a[1]));
const events = replay.entries.flatMap(e=>e.events.map(v=>({sequence:e.sequence,round:e.round,actor:e.actorPlayerId,...v})));
const summary = {
 matchId, captureStart:replay.captureStart,initialRound:replay.initialState.round,entries:replay.entries.length,bytes:row.byte_length,truncated:replay.truncated,truncationReason:replay.truncationReason,winner:replay.winnerPlayerId,
 initialPlayers:replay.initialState.players,initialHeroes:replay.initialState.heroes,initialAdventure:replay.initialState.adventure,
 hashGaps:replay.entries.flatMap((e,i)=>i && replay.entries[i-1].afterStateHash!==e.beforeStateHash?[e.sequence]:[]),
 legalTruncated:replay.entries.filter(e=>e.legalActionsTruncated).length,
 rounds:count(replay.entries.map(e=>e.round)),actions:count(replay.entries.map(e=>e.action.type)),eventTypes:count(events.map(e=>e.type)),
 battles:events.filter(e=>/COMBAT_STARTED|COMBAT_ENDED|AFK|ABANDON|ELIMINATED/.test(e.type)),
 seats:Object.fromEntries(Object.entries(replay.initialState.players).map(([seat,p])=>[seat,{
 faction:p.factionId,hero:p.heroDefId,
 actions:count(replay.entries.filter(e=>e.actorPlayerId===seat).map(e=>e.action.type)),
 milestones:events.filter(e=>(e.playerId??e.actor)===seat && /BUILT|RECRUITED|LEVEL_UP|FLAGGED|PRODUCTION|TRADE|CARD_PLAYED|RESOURCES_SPENT|RESOURCES_GAINED|DISCOVER|REVEAL|TILE_PLACED/.test(e.type)),
 decisions:replay.entries.filter(e=>e.actorPlayerId===seat && !/PASS|ACK|END_TURN|ADVANCE/.test(e.action.type)).map(e=>({sequence:e.sequence,round:e.round,action:e.action,context:e.learningContext})),
 }]))
};
fs.writeFileSync(`${directory}/evidence.json`,JSON.stringify(summary,null,2));
console.log(JSON.stringify({...summary,initialPlayers:undefined,initialHeroes:undefined,initialAdventure:undefined,seats:Object.fromEntries(Object.entries(summary.seats).map(([s,p])=>[s,{faction:p.faction,hero:p.hero,actions:p.actions}]))},null,2));
