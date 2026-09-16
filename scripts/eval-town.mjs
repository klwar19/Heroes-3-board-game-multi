/**
 * Batch strategy evaluator. Plays K seeds of one faction (seat p2) to a round
 * cap on impossible, both seats computer, single-player boost ON. Aggregates the
 * metrics that matter for the user's goal:
 *   - firstFar / secondFar round (settlement/mine L>=1 far captures)
 *   - goldRound: first round our army contains a gold/azure tier unit
 *   - silverRound: first round our army contains a silver tier unit
 *   - fights won / lost / retreated (neutral main-hero fights)
 *   - lossesWithStrongBody: fights LOST while we had a Minotaur/gold/attack>=4 body
 *
 *   node scripts/eval-town.mjs <faction> <seeds> <maxRound>
 */
import { register } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

register("./lib/ts-resolver.mjs", import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = (rel) => pathToFileURL(path.join(ROOT, "src", rel)).href;

const faction = process.argv[2] ?? "dungeon";
const SEEDS = Number(process.argv[3] ?? 30);
const MAX_ROUND = Number(process.argv[4] ?? 11);
const ME = "p2";

const [setup, runner, factions, units] = await Promise.all([
  import(src("engine/adventure-setup.ts")),
  import(src("server/computer-runner.ts")),
  import(src("data/factions/core.ts")),
  import(src("data/factions/units.ts")),
]);
const heroOf = (f) => factions.coreFactionDefinitions[f]?.heroes?.[0];
const tierOf = (defId) => units.coreUnitDefinitions[defId]?.tier;
const hp = (u) => Math.max(0, (u.maxHealth ?? 0) - (u.damage ?? 0));
const armyDefs = (st) => (st.players?.[ME]?.army ?? []).map((a) => a.unitDefId);
const hasTier = (st, ...tiers) => armyDefs(st).some((d) => tiers.includes(tierOf(d)));
const hasStrongBody = (combat) => Object.values(combat.units).some(
  (u) => u.controllerId === ME && hp(u) > 0 && (u.grade === "gold" || u.grade === "azure" || u.attack >= 4));
function farCount(st) {
  const fields = Object.values(st.adventure?.fields ?? {});
  return fields.filter((f) => f.flagOwnerId === ME && f.tileInstanceId &&
    st.adventure?.tiles?.[f.tileInstanceId]?.group === "far" &&
    (f.location === "settlement" || f.location === "mine")).length;
}

const rows = [];
for (let si = 0; si < SEEDS; si++) {
  const seed = `eval-${si}`;
  let state = setup.createAdventureGameState({
    seed, difficulty: "impossible", events: false, rollFirstPlayer: false,
    players: [
      { id: "p1", name: "P1", factionId: "castle", heroDefId: heroOf("castle") },
      { id: "p2", name: "P2", factionId: faction, heroDefId: heroOf(faction) },
    ],
    controllers: {
      p1: { kind: "computer", difficulty: "standard", policyVersion: 1 },
      p2: { kind: "computer", difficulty: "standard", policyVersion: 1 },
    },
  });
  state.sessionMode = "single-player";

  const m = { seed, firstFar: null, secondFar: null, gold: null, silver: null,
    won: 0, lost: 0, retreat: 0, lossStrong: 0 };
  let inCombat = false, strongAtStart = false, prevFar = 0;

  for (let step = 0; step < 12000 && state.round <= MAX_ROUND; step++) {
    const run = runner.driveComputerPlayers(state, undefined, { maxSteps: 1 });
    const prev = state; state = run.state;

    if (m.silver === null && hasTier(state, "silver")) m.silver = state.round;
    if (m.gold === null && hasTier(state, "gold", "azure")) m.gold = state.round;

    const combat = state.combat;
    const meIn = combat && Object.values(combat.units).some((u) => u.controllerId === ME);
    const isNeutralMain = combat && combat.context?.kind === "neutral" && combat.attackerPlayerId === ME;
    if (meIn && !inCombat) { inCombat = true; strongAtStart = hasStrongBody(combat); }
    else if (!meIn && inCombat) {
      inCombat = false;
      const ended = prev.combat;
      if (ended && ended.context?.kind === "neutral" && ended.attackerPlayerId === ME) {
        const outcome = ended.outcome?.winnerPlayerId;
        // A retreat ends with our units alive but neutrals "winning" and no bank flag.
        const ourAlive = Object.values(ended.units).filter((u) => u.controllerId === ME && hp(u) > 0).length;
        const neutralAlive = Object.values(ended.units).filter((u) => u.controllerId !== ME && hp(u) > 0).length;
        if (outcome === ME) m.won++;
        else if (ourAlive > 0 && neutralAlive > 0) m.retreat++;
        else { m.lost++; if (strongAtStart) m.lossStrong++; }
      }
    }

    const far = farCount(state);
    if (far > prevFar) {
      if (m.firstFar === null) m.firstFar = state.round;
      else if (m.secondFar === null) m.secondFar = state.round;
      prevFar = far;
    }
  }
  rows.push(m);
}

const nums = (key) => rows.map((r) => r[key]).filter((v) => v !== null);
const med = (arr) => arr.length ? [...arr].sort((a, b) => a - b)[Math.floor(arr.length / 2)] : null;
const pct = (n) => `${Math.round((n / SEEDS) * 100)}%`;
const sum = (key) => rows.reduce((s, r) => s + r[key], 0);

const goldBy9 = rows.filter((r) => r.gold !== null && r.gold <= 9).length;
const secondFarBy9 = rows.filter((r) => r.secondFar !== null && r.secondFar <= 9).length;
const totalFights = sum("won") + sum("lost") + sum("retreat");
const report = [
  `===== ${faction}  (${SEEDS} seeds, to R${MAX_ROUND}) =====`,
  `first far:  median R${med(nums("firstFar"))}  captured ${pct(nums("firstFar").length)}`,
  `second far: median R${med(nums("secondFar"))}  by R9 ${pct(secondFarBy9)}  captured ${pct(nums("secondFar").length)}`,
  `silver unit: median R${med(nums("silver"))}  got ${pct(nums("silver").length)}`,
  `gold unit:   median R${med(nums("gold"))}  by R9 ${pct(goldBy9)}  got ${pct(nums("gold").length)}`,
  `neutral fights: ${totalFights}  won ${sum("won")}  lost ${sum("lost")}  retreat ${sum("retreat")}`,
  `LOSSES WITH STRONG BODY (minotaur/gold): ${sum("lossStrong")}   << the "lose with minotaur" bug`,
].join("\n");

const outFile = path.join(ROOT, "artifacts", `eval-${faction}.txt`);
fs.writeFileSync(outFile, report + "\n\n" + rows.map((r) =>
  `${r.seed}: far ${r.firstFar}/${r.secondFar} silver ${r.silver} gold ${r.gold} | W${r.won} L${r.lost} R${r.retreat} strongLoss ${r.lossStrong}`).join("\n"));
console.log(report);
console.log(`\n[${outFile}]`);
