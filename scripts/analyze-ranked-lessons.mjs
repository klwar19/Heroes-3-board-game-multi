/** Offline, read-only evidence extraction. No credentials or database writes.
 * node scripts/analyze-ranked-lessons.mjs <export.json> <output.json>
 * Export shape: { matches: [{match_id,participants}], replays: [{match_id,payload}] }.
 */
import { readFileSync, writeFileSync } from 'node:fs';
const [input, output] = process.argv.slice(2);
if (!input || !output) throw Error('Usage: node scripts/analyze-ranked-lessons.mjs export.json output.json');
const data = JSON.parse(readFileSync(input, 'utf8'));
const totals = (events, type, field) => events.filter(e => e.type === type).reduce((n, e) => n + Number(e[field] ?? 0), 0);
const report = { version: 1, source: 'recorded events; not counterfactual proof', exclusions: [], matches: [] };
for (const row of data.replays) {
  if (row.match_id.includes('codex')) { report.exclusions.push({matchId:row.match_id,reason:'test recording'}); continue; }
  const p = row.payload;
  const events = p.entries.flatMap(entry => entry.events.map(event => ({sequence:entry.sequence,round:entry.round,...event})));
  const history = data.matches.find(m => m.match_id === row.match_id);
  const game = {
    matchId: row.match_id, participants: history?.participants?.map(({nickname,result}) => ({nickname,result})),
    captureStart:p.captureStart ?? 'unknown', truncated:p.truncated,
    hashGaps:p.entries.flatMap((e,i)=>i && p.entries[i-1].afterStateHash!==e.beforeStateHash?[e.sequence]:[]),
    // Seat identities stay separate from the participant list; array ordering
    // alone is not a reliable account-to-seat join in recovered 3-player games.
    seats:{},
    battles:events.filter(e=>e.type==='COMBAT_ENDED'),
  };
  for (const [seat, player] of Object.entries(p.initialState.players)) {
    if (seat === 'neutrals') continue;
    const own = events.filter(e=>e.playerId===seat);
    const gainsByReason = {};
    for (const e of own.filter(e=>e.type==='RESOURCES_GAINED')) {
      const gain = gainsByReason[e.reason??'unspecified'] ??= {gold:0,buildingMaterials:0,valuables:0};
      for(const key of Object.keys(gain)) gain[key] += Number(e[key]??0);
    }
    game.seats[seat] = {
      faction:player.factionId, hero:player.heroDefId,
      outcome:p.winnerPlayerId ? (p.winnerPlayerId===seat?'win':'not-winner') : 'unknown',
      initialResources:player.resources, initialProduction:player.production, initialArmy:player.army,
      gainsByReason,
      // Gross receipts: includes trades/recycling; never label this net profit.
      grossGoldReceived:totals(own,'RESOURCES_GAINED','gold'),
      resourceSpends:own.filter(e=>e.type==='RESOURCES_SPENT').map(({sequence,round,cost,reason})=>({sequence,round,cost,reason})),
      milestones:own.filter(e=>['STRUCTURE_BUILT','UNIT_RECRUITED','HERO_LEVEL_UP','FIELD_FLAGGED','PRODUCTION_CHANGED','TRADE_EXECUTED'].includes(e.type)),
      cardPlays:own.filter(e=>e.type==='CARD_PLAYED'),
      searches:p.entries.filter(e=>e.actorPlayerId===seat && e.action.type==='RESOLVE_DECK_SEARCH').map(e=>({sequence:e.sequence,round:e.round,action:e.action,candidates:e.learningContext?.search?.revealedCardIds ?? null,chosenCard:e.action.pick?.kind==='revealed' ? (e.learningContext?.search?.revealedCardIds[e.action.pick.index] ?? null) : null})),
    };
  }
  report.matches.push(game);
}
writeFileSync(output, JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({playerReplays:report.matches.length,testReplaysExcluded:report.exclusions.length,output}));
