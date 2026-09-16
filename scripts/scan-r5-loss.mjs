/**
 * Scan Dungeon seeds for a Round-5 (or first) neutral fight where our army
 * contains a Minotaur, and dump the full blow-by-blow + outcome. Stop at the
 * first LOSS-with-minotaur found (or after N seeds), writing to a file.
 *
 *   node scripts/scan-r5-loss.mjs <faction> <seedCount>
 */
import { register } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

register("./lib/ts-resolver.mjs", import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = (rel) => pathToFileURL(path.join(ROOT, "src", rel)).href;

const faction = process.argv[2] ?? "dungeon";
const seedCount = Number(process.argv[3] ?? 20);
const ME = "p2";

const [setup, runner, factions] = await Promise.all([
  import(src("engine/adventure-setup.ts")),
  import(src("server/computer-runner.ts")),
  import(src("data/factions/core.ts")),
]);
const heroOf = (f) => factions.coreFactionDefinitions[f]?.heroes?.[0];
const shortName = (u) => (u.name || u.cardName || u.unitDefId || "?").replace(/^[a-z]+\./, "");
const hp = (u) => Math.max(0, (u.maxHealth ?? 0) - (u.damage ?? 0));
const armyOf = (st) => (st.players?.[ME]?.army ?? []).map((a) => `${a.unitDefId.replace(/^[a-z]+\./, "")}:${a.side}`);

function renderFormation(combat, lines) {
  const cells = Array.from({ length: 20 }, () => "        ");
  for (const u of Object.values(combat.units)) {
    if (u.position < 0 || u.position > 19) continue;
    const tag = `${shortName(u).slice(0, 5)}`.padEnd(5);
    const side = u.controllerId === ME ? "*" : "n";
    cells[u.position] = `${side}${tag}${String(hp(u)).padStart(2)}/d${u.defense}`;
  }
  for (let r = 0; r < 5; r++) {
    const label = r === 0 ? "defBack " : r === 1 ? "defFront" : r === 2 ? "  mid   " : r === 3 ? "atkFront" : "atkBack ";
    lines.push(`   ${label} | ${cells.slice(r * 4, r * 4 + 4).join(" | ")}`);
  }
}

const results = [];
let foundLoss = false;

for (let si = 0; si < seedCount && !foundLoss; si++) {
  const seed = `scan-${si}`;
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

  let inCombat = false, rendered = false, logCount = 0;
  const combatSnap = new Map();
  const lines = [];
  let sawMinotaurFight = false, fightHadMinotaur = false, fightLost = null;

  for (let step = 0; step < 6000 && state.round <= 7; step++) {
    const run = runner.driveComputerPlayers(state, undefined, { maxSteps: 1 });
    const prev = state; state = run.state;
    const combat = state.combat;
    const meIn = combat && Object.values(combat.units).some((u) => u.controllerId === ME);

    if (meIn && !inCombat) {
      inCombat = true; rendered = false; logCount = 0;
      fightHadMinotaur = armyOf(state).some((a) => a.startsWith("minotaurs"));
      const field = combat.context?.fieldId ? state.adventure?.fields?.[combat.context.fieldId] : null;
      const guards = Object.values(combat.units).filter((u) => u.controllerId !== ME)
        .map((u) => `${shortName(u)}(${hp(u)}hp/a${u.attack}/d${u.defense}${u.abilities?.length ? "/" + u.abilities.join("+") : ""})`);
      lines.push(`\n  >>> FIGHT R${state.round} ${combat.context?.kind}${field ? ` @ ${field.location} L${field.difficulty ?? "?"}` : ""} minotaur=${fightHadMinotaur}`);
      lines.push(`      guards: ${guards.join(", ")}`);
      lines.push(`      ourHand: ${(state.players?.[ME]?.hand ?? []).map((c) => c.cardId || c.definitionId || c.name).join(", ")}`);
      combatSnap.clear();
      for (const u of Object.values(combat.units)) combatSnap.set(u.id, hp(u));
    } else if (meIn && inCombat) {
      if (!rendered && Object.values(combat.units).some((u) => u.controllerId === ME && u.position >= 0) &&
          Object.values(combat.units).some((u) => u.controllerId !== ME && u.position >= 0)) {
        rendered = true; lines.push(`      formation:`); renderFormation(combat, lines);
      }
      for (const d of run.decisions) {
        const a = d.action;
        if (["ATTACK_UNIT", "MOVE_AND_ATTACK_UNIT"].includes(a.type)) {
          const atk = combat.units[a.attackerId] || prev.combat?.units?.[a.attackerId];
          const def = combat.units[a.defenderId] || prev.combat?.units?.[a.defenderId];
          if (atk && def && logCount < 80) {
            logCount++;
            const before = combatSnap.get(def.id) ?? hp(def);
            lines.push(`   ${logCount}. ${atk.controllerId === ME ? "*" : "n"}${shortName(atk)} → ${shortName(def)}  ${before}→${hp(def)}${hp(def) <= 0 ? " ☠" : ""}`);
          }
        } else if (["CAST_SPELL", "PLAY_REACTION", "PLAY_CARD"].includes(a.type) && logCount < 80) {
          logCount++;
          lines.push(`   ${logCount}. [card] ${a.type} ${a.cardId ?? ""}${a.mode ? ` (${a.mode})` : ""} — ${d.policy}`);
        }
      }
      for (const u of Object.values(combat.units)) combatSnap.set(u.id, hp(u));
    }
    if (!meIn && inCombat) {
      inCombat = false;
      const ended = prev.combat;
      const outcome = ended?.outcome?.winnerPlayerId;
      const survivors = ended ? Object.values(ended.units).filter((u) => u.controllerId === ME && hp(u) > 0).length : "?";
      const won = outcome === ME;
      lines.push(`  <<< ${won ? "WON" : "LOST"} (winner ${outcome ?? "?"}, survivors ${survivors}) army [${armyOf(state).join(", ")}]`);
      if (fightHadMinotaur) {
        sawMinotaurFight = true;
        if (!won) { fightLost = true; foundLoss = true; }
      }
    }
    if (foundLoss) break;
  }
  if (sawMinotaurFight) {
    results.push(`===== SEED ${seed} (minotaur fight, lost=${fightLost}) =====\n${lines.join("\n")}`);
  }
}

const outFile = path.join(ROOT, "scratchpad", "scan-r5-loss.txt");
fs.mkdirSync(path.dirname(outFile), { recursive: true });
const txt = results.length ? results.join("\n\n") : "(no minotaur fights found across seeds)";
fs.writeFileSync(outFile, txt);
console.log(txt);
console.log(`\nDONE foundLoss=${foundLoss} [${outFile}]`);
