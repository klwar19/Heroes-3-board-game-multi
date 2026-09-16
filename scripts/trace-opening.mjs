/**
 * TEMPORARY diagnostic: play a real game from round 1 with both seats on the
 * computer AI and print a readable, round-by-round trace of one seat's opening
 * — map moves, tile reveals, resource/army changes, and every neutral fight it
 * takes (formation + blow-by-blow + outcome), plus when it flags Far tiles.
 *
 *   node scripts/trace-opening.mjs <faction> <difficulty> <seed>
 */
import { register } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

register("./lib/ts-resolver.mjs", import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = (rel) => pathToFileURL(path.join(ROOT, "src", rel)).href;

const faction = process.argv[2] ?? "conflux";
const difficulty = process.argv[3] ?? "impossible";
const seed = process.argv[4] ?? "trace-1";
const MAX_ROUND = Number(process.argv[5] ?? 8);
const ME = "p2"; // the seat we trace

const [setup, runner, factions, reducer] = await Promise.all([
  import(src("engine/adventure-setup.ts")),
  import(src("server/computer-runner.ts")),
  import(src("data/factions/core.ts")),
  import(src("engine/reducer.ts")),
]);

const heroOf = (f) => factions.coreFactionDefinitions[f]?.heroes?.[0];
let state = setup.createAdventureGameState({
  seed,
  difficulty,
  events: false,
  rollFirstPlayer: false,
  players: [
    { id: "p1", name: "P1", factionId: "castle", heroDefId: heroOf("castle") },
    { id: "p2", name: "P2", factionId: faction, heroDefId: heroOf(faction) },
  ],
  controllers: {
    p1: { kind: "computer", difficulty: "standard", policyVersion: 1 },
    p2: { kind: "computer", difficulty: "standard", policyVersion: 1 },
  },
});
// Real single-player game context: enables the single-player computer combat
// boost (the phantom Attack/Defense/Power/Magic-Arrow cards).
state.sessionMode = "single-player";

const out = [];
const log = (s) => out.push(s);

const shortName = (u) => (u.name || u.cardName || u.unitDefId || "?").replace(/^[a-z]+\./, "");
const hp = (u) => Math.max(0, (u.maxHealth ?? 0) - (u.damage ?? 0));

function farCaptures(st) {
  const fields = Object.values(st.adventure?.fields ?? {});
  return fields.filter((f) => f.flagOwnerId === ME && f.tileInstanceId &&
    st.adventure?.tiles?.[f.tileInstanceId]?.group === "far" &&
    (f.location === "settlement" || f.location === "mine")).map((f) => `${f.location}${f.resource ? `(${f.resource})` : ""}${f.difficulty ? ` L${f.difficulty}` : ""}`);
}
function armyOf(st) {
  return (st.players?.[ME]?.army ?? []).map((a) => `${a.unitDefId.replace(/^[a-z]+\./, "")}:${a.side}`);
}
function renderFormation(combat) {
  const cells = Array.from({ length: 20 }, () => "        ");
  for (const u of Object.values(combat.units)) {
    if (u.position < 0 || u.position > 19) continue;
    const tag = `${shortName(u).slice(0, 5)}`.padEnd(5);
    const side = u.controllerId === ME ? "*" : u.controllerId === "p1" ? "+" : "n";
    cells[u.position] = `${side}${tag}${String(hp(u)).padStart(2)}`;
  }
  const rows = [];
  for (let r = 0; r < 5; r++) {
    const label = r === 0 ? "defBack " : r === 1 ? "defFront" : r === 2 ? "  mid   " : r === 3 ? "atkFront" : "atkBack ";
    rows.push(`   ${label} | ${cells.slice(r * 4, r * 4 + 4).join(" | ")}`);
  }
  return rows.join("\n");
}

let round = state.round;
let inCombat = false;
let renderedFormation = false;
let combatSnap = new Map();
let prevArmy = armyOf(state).join(",");
let prevFar = farCaptures(state).length;
let firstPremiumFar = null;
let secondFar = null;
const combatLines = [];

log(`=== ${faction} (seat ${ME}) vs castle — difficulty ${difficulty}, seed ${seed} ===`);
log(`R1 start: army [${armyOf(state).join(", ")}]  gold ${state.players[ME]?.resources?.gold}`);

let combatLogCount = 0;
for (let step = 0; step < 12000 && state.round <= MAX_ROUND; step++) {
  const run = runner.driveComputerPlayers(state, undefined, { maxSteps: 1 });
  const prev = state;
  state = run.state;

  if (state.round !== round) {
    round = state.round;
    const r = state.players[ME]?.resources ?? {};
    log(`\n----- ROUND ${round} -----  gold ${r.gold ?? 0} / mat ${r.buildingMaterials ?? 0} / val ${r.valuables ?? 0}  army [${armyOf(state).join(", ")}]`);
  }

  // Log our seat's MAP activity (movement, tile reveals, pickups, recruits,
  // builds) so the round-by-round exploration/collection is visible.
  if (!state.combat) {
    for (const d of run.decisions) {
      const a = d.action;
      if (a.playerId && a.playerId !== ME) continue;
      const bits = [];
      if (a.to) bits.push(`→${a.to}`);
      if (a.spaceId) bits.push(`@${a.spaceId}`);
      if (a.tileInstanceId) bits.push(`tile:${a.tileInstanceId}`);
      if (a.optionIndex != null) bits.push(`opt:${a.optionIndex}`);
      if (a.cardId) bits.push(a.cardId);
      if (a.buildingId) bits.push(`build:${a.buildingId}`);
      if (Array.isArray(a.purchases)) bits.push(a.purchases.map((p) => `${p.kind}:${(p.unitDefId||"").replace(/^[a-z]+\./,"")}`).join(","));
      if (a.type !== "END_TURN") log(`   R${round} ${a.type} ${bits.join(" ")}  [${d.policy}]`);
    }
  }

  // Combat lifecycle for our seat.
  const combat = state.combat;
  const meInCombat = combat && (combat.attackerPlayerId === ME || combat.defenderPlayerId === ME ||
    Object.values(combat.units).some((u) => u.controllerId === ME));
  if (meInCombat && !inCombat) {
    inCombat = true;
    combatLogCount = 0;
    renderedFormation = false;
    const ctx = combat.context?.kind;
    const field = combat.context?.fieldId ? state.adventure?.fields?.[combat.context.fieldId] : null;
    const guards = Object.values(combat.units).filter((u) => u.controllerId !== ME)
      .map((u) => `${shortName(u)}(${hp(u)}hp/a${u.attack}/d${u.defense})`);
    log(`\n  >>> FIGHT (R${round}, ${ctx}${field ? ` @ ${field.location}${field.difficulty ? ` L${field.difficulty}` : ""}` : ""})`);
    log(`      guards: ${guards.join(", ") || "(placing…)"}`);
    combatSnap = new Map(Object.values(combat.units).map((u) => [u.id, hp(u)]));
  } else if (meInCombat && inCombat) {
    // Once units are placed, render the formation grid one time.
    if (!renderedFormation && Object.values(combat.units).some((u) => u.controllerId === ME && u.position >= 0) &&
        Object.values(combat.units).some((u) => u.controllerId !== ME && u.position >= 0)) {
      renderedFormation = true;
      log(`      formation:`);
      log(renderFormation(combat));
    }
    // Log the decision(s) + health deltas this step.
    for (const d of run.decisions) {
      const a = d.action;
      if (["ATTACK_UNIT", "MOVE_AND_ATTACK_UNIT"].includes(a.type)) {
        const atk = combat.units[a.attackerId] || prev.combat?.units?.[a.attackerId];
        const def = combat.units[a.defenderId] || prev.combat?.units?.[a.defenderId];
        if (atk && def && combatLogCount < 60) {
          combatLogCount++;
          const before = combatSnap.get(def.id) ?? hp(def);
          const after = hp(def);
          log(`   ${combatLogCount}. ${atk.controllerId === ME ? "*" : "n"}${shortName(atk)} → ${shortName(def)}  ${before}→${after} (${after - before})${after <= 0 ? " ☠" : ""}`);
        }
      } else if (["CAST_SPELL", "PLAY_REACTION", "PLAY_CARD"].includes(a.type) && combatLogCount < 60) {
        combatLogCount++;
        log(`   ${combatLogCount}. [card] ${a.type} ${a.cardId ?? ""}${a.mode ? ` (${a.mode})` : ""} — ${d.policy}`);
      }
    }
    for (const u of Object.values(combat.units)) combatSnap.set(u.id, hp(u));
  }
  if (!meInCombat && inCombat) {
    inCombat = false;
    const ended = prev.combat;
    const outcome = ended?.outcome?.winnerPlayerId ?? state.eventLog?.findLast?.((e) => e.type === "COMBAT_ENDED")?.winnerPlayerId;
    const survivors = ended ? Object.values(ended.units).filter((u) => u.controllerId === ME && hp(u) > 0).length : "?";
    const won = outcome === ME;
    log(`  <<< FIGHT ENDED — winner ${outcome ?? "?"} ${won ? "WON" : "LOST"}  (our survivors: ${survivors})  army now [${armyOf(state).join(", ")}]`);
  }

  // Far capture milestones.
  const far = farCaptures(state);
  if (far.length > prevFar) {
    if (firstPremiumFar === null) { firstPremiumFar = round; log(`  ★ FIRST far capture at R${round}: ${far.join(", ")}`); }
    else if (secondFar === null && far.length >= 2) { secondFar = round; log(`  ★★ SECOND far capture at R${round}: ${far.join(", ")}`); }
    prevFar = far.length;
  }

  if (!run.decisions.length && !meInCombat) {
    // No computer decision and not our combat — advance any pending owner minimally.
    if (state.phase === "game-over") break;
  }
}

log(`\n=== SUMMARY: first far R${firstPremiumFar ?? "-"}, second far R${secondFar ?? "-"}, final round R${state.round}, army [${armyOf(state).join(", ")}] ===`);
const file = path.join(ROOT, "artifacts", `trace-${faction}-${difficulty}.txt`);
fs.writeFileSync(file, out.join("\n"));
console.log(out.join("\n"));
console.log(`\n[written ${file}]`);
