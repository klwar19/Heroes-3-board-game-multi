/** Explicit offline training from stored replays or a local export; no games run.
 * node scripts/train-ranked-policy.mjs --input path/to/export.json
 */
import fs from "node:fs";
import { gunzipSync } from "node:zlib";
import { describeReplayAction, trainReplayPolicy } from "../src/engine/computer/replay-model.ts";
import { replayConditions } from "../src/engine/computer/replay-context.ts";
import { extractStrategicDecisionSamples } from "../src/server/ranked-replay-learning.ts";
const args = process.argv.slice(2);
const input = args[args.indexOf("--input") + 1];
let data;
if (args.includes("--input")) data = JSON.parse(fs.readFileSync(input, "utf8"));
else {
  if (fs.existsSync(".env.local")) process.loadEnvFile(".env.local");
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.log(
      "Replay training: keeping bundled model (no database credentials).",
    );
    process.exit(0);
  }
  const headers = { apikey: key, Authorization: "Bearer " + key };
  async function all(table, select) {
    const rows = [];
    for (let offset = 0; ; offset += 50) {
      const response = await fetch(
        url.replace(/\/+$/, "") +
          "/rest/v1/" +
          table +
          "?select=" +
          select +
          "&order=recorded_at.asc&limit=50&offset=" +
          offset,
        { headers, signal: AbortSignal.timeout(30000) },
      );
      if (!response.ok)
        throw Error("Replay training fetch failed: HTTP " + response.status);
      const page = await response.json();
      rows.push(...page);
      if (page.length < 50) return rows;
    }
  }
  data = {
    replays: await all("homm3bg_ranked_replays", "match_id,payload,payload_gzip_base64"),
    matches: await all("homm3bg_matches", "match_id,participants"),
  };
}
const samples = [];
for (const row of data.replays) {
  const p = row.payload ?? (
    typeof row.payload_gzip_base64 === "string"
      ? JSON.parse(gunzipSync(Buffer.from(row.payload_gzip_base64, "base64")).toString("utf8"))
      : null
  );
  if (!p) continue;
  const history = data.matches?.find((m) => m.match_id === row.match_id);
  if (
    row.match_id.includes("codex") ||
    p.entries.length < 100 ||
    history?.participants?.some?.((s) => s.result === "abandon") ||
    p.entries.some((e) => e.events.some((v) => v.type === "AFK_AUTO_KICKED"))
  )
    continue;
  for (const sample of extractStrategicDecisionSamples(p)) {
    // Older combat records may have a domain but no health/kind snapshot.
    // Missing tactical context must not teach a fabricated map-spell policy.
    if (!sample.context.combat && sample.context.domains.some((domain) =>
      domain === "pvp-combat" || domain === "neutral-combat")) continue;
    const action = describeReplayAction(sample.context.policyFacts?.action ?? sample.chosenAction, sample.context.search?.revealedCardIds);
    samples.push({
      matchId: sample.matchId,
      action,
      outcome: sample.decisionOutcome,
      context: {
        conditions: sample.context.policyFacts?.conditions ?? (p.initialState ? replayConditions(p.initialState) : undefined),
        situation: sample.context.policyFacts?.situation,
        stage: sample.context.stage,
        faction:
          sample.context.development?.factionId ??
          p.initialState.players[sample.actorPlayerId]?.factionId ??
          "unknown",
        combat: sample.context.combat?.kind ?? "map",
        pressure: sample.context.combat
          ? sample.context.combat.ownRemainingHealth <
            sample.context.combat.enemyRemainingHealth
          : (sample.context.actorEconomy?.gold ?? 99) <= 2,
      },
    });
  }
}
const model = trainReplayPolicy(samples);
const path = args.includes("--output")
  ? args[args.indexOf("--output") + 1]
  : "src/engine/computer/learned-policy.json";
if (model.samples === 0) {
  console.log("Replay training: no usable samples; keeping existing model.");
  process.exit(0);
}
fs.writeFileSync(path + ".tmp", JSON.stringify(model, null, 2) + "\n");
fs.renameSync(path + ".tmp", path);
const report = {
    matches: model.matches,
    samples: model.samples,
    learnedPatterns: Object.keys(model.weights).length,
    samplesWithDecisionTimeFacts: samples.filter(sample => sample.context.situation).length,
    samplesByStage: Object.fromEntries(["opening", "midgame", "late-game"].map(stage =>
      [stage, samples.filter(sample => sample.context.stage === stage).length])),
    samplesByConditions: Object.fromEntries([...new Set(samples.map(sample => sample.context.conditions))].map(conditions =>
      [conditions, samples.filter(sample => sample.context.conditions === conditions).length])),
    samplesByAction: Object.fromEntries([...new Set(samples.map(sample => sample.action.type))].sort().map(type =>
      [type, samples.filter(sample => sample.action.type === type).length])),
    samplesByDomain: Object.fromEntries(["map", "pvp", "neutral"].map((domain) =>
      [domain, samples.filter((sample) => sample.context.combat === domain).length])),
    patternsByAction: Object.fromEntries([...new Set(samples.map((sample) => sample.action.type))].sort()
      .map((type) => [type, Object.keys(model.weights).filter((key) => key.split("|")[4] === type).length])
      .filter(([, count]) => count > 0)),
};
const reportPath = args.includes("--report") ? args[args.indexOf("--report") + 1] : undefined;
if (reportPath) fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report));
