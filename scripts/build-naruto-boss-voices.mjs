/**
 * Real character voices for two Raid Bosses that otherwise borrow a Heroes III
 * creature voice: Kaguya Otsutsuki (a primordial goddess villain) for the apex
 * Avatar of Erebos, and Gaara (sand juggernaut) for the Colossal Titan. Sources:
 * E:/voice/Kaguya_ActVoice (+ Kaguya_ActSE) and E:/voice/Gaara.
 *
 * Bosses have no SFX bed, so each of the five core actions is built from the
 * character's real recording; the attack additionally layers a weighty SFX
 * (Kaguya's own jutsu SE; Gaara gets the in-game Earthquake). Clip -> action is
 * a duration heuristic and is PRINTED. Wiring is data-only: unit-sounds.ts points
 * bossVoices at these `naruto-boss-*` bases, so the existing resolver builds
 * `units/naruto-boss-<char>-<action>` with no new code path.
 *
 * Usage: node scripts/build-naruto-boss-voices.mjs
 */
import { execFileSync } from "node:child_process";
import { readdirSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const VOICE_ROOT = "E:/voice";
const OUT_DIR = "public/sounds/units";

const BOSSES = [
  {
    base: "naruto-boss-kaguya", label: "Kaguya -> Avatar of Erebos",
    dir: "Kaguya_ActVoice", filter: (f) => /\.wav$/i.test(f),
    attackSe: { dir: "Kaguya_ActSE", pickDur: 0.85 } // her own jutsu SE
  },
  {
    base: "naruto-boss-gaara", label: "Gaara -> Colossal Titan",
    dir: "Gaara", filter: (f) => /^(char_gaala_|gar_str_)/.test(f),
    attackSe: { file: "public/sounds/spells/earthquake.mp3" } // in-game earth SFX
  }
];

// action -> target duration, window, and max seconds.
const ACTIONS = [
  { name: "attack", tgt: 0.9, lo: 0.55, hi: 1.4, dur: 2.6 },
  { name: "hurt", tgt: 0.3, lo: 0.18, hi: 0.55, dur: 1.8 },
  { name: "death", tgt: 1.8, lo: 1.2, hi: 2.6, dur: 2.8 },
  { name: "defend", tgt: 0.5, lo: 0.3, hi: 0.85, dur: 2.0 },
  { name: "move", tgt: 0.4, lo: 0.2, hi: 0.7, dur: 1.5 }
];

function dur(file) {
  return parseFloat(execFileSync("ffprobe", ["-v", "error", "-show_entries",
    "format=duration", "-of", "csv=p=0", file]).toString().trim());
}
function probeDir(dir, filter) {
  return readdirSync(dir).filter(filter)
    .map((f) => ({ file: f, path: join(dir, f), dur: dur(join(dir, f)) }));
}
function take(pool, act) {
  const band = pool.filter((r) => !r.used && r.dur >= act.lo && r.dur <= act.hi);
  const cand = (band.length ? band : pool.filter((r) => !r.used))
    .sort((a, b) => Math.abs(a.dur - act.tgt) - Math.abs(b.dur - act.tgt));
  cand[0].used = true;
  return cand[0];
}

const VOICE_FILTER =
  "highpass=f=90,lowpass=f=13000," +
  "silenceremove=start_periods=1:start_silence=0.02:start_threshold=-45dB," +
  "areverse,silenceremove=start_periods=1:start_silence=0.02:start_threshold=-45dB,areverse," +
  "loudnorm=I=-18:TP=-1.5:LRA=11,alimiter=limit=0.95";

const tmp = mkdtempSync(join(tmpdir(), "nboss-"));
for (const b of BOSSES) {
  const pool = probeDir(join(VOICE_ROOT, b.dir), b.filter);
  console.log(`${b.base}  [${b.label}]`);
  let sePath;
  if (b.attackSe.file) {
    sePath = b.attackSe.file;
  } else {
    const se = probeDir(join(VOICE_ROOT, b.attackSe.dir), (f) => /\.wav$/i.test(f))
      .sort((a, x) => Math.abs(a.dur - b.attackSe.pickDur) - Math.abs(x.dur - b.attackSe.pickDur))[0];
    sePath = se.path;
  }
  for (const act of ACTIONS) {
    const sel = take(pool, act);
    console.log(`   ${act.name.padEnd(6)} <- ${sel.file} (${sel.dur.toFixed(2)}s)`);
    const vwav = join(tmp, `${b.base}-${act.name}.wav`);
    execFileSync("ffmpeg", ["-y", "-i", sel.path, "-af", VOICE_FILTER, "-ac", "1", "-ar", "32000", vwav],
      { stdio: ["ignore", "ignore", "ignore"] });
    const out = join(OUT_DIR, `${b.base}-${act.name}.mp3`);
    if (act.name === "attack") {
      const filter =
        `[0:a]volume=1.0[v];[1:a]volume=0.7,adelay=25|25[s];` +
        `[v][s]amix=inputs=2:duration=first:normalize=0:dropout_transition=0,` +
        `loudnorm=I=-18:TP=-1.5:LRA=11,alimiter=limit=0.95`;
      execFileSync("ffmpeg", ["-y", "-i", vwav, "-i", sePath, "-filter_complex", filter,
        "-t", String(act.dur), "-ac", "1", "-ar", "32000", "-b:a", "48k", out],
        { stdio: ["ignore", "ignore", "ignore"] });
    } else {
      execFileSync("ffmpeg", ["-y", "-i", vwav, "-t", String(act.dur),
        "-ac", "1", "-ar", "32000", "-b:a", "48k", out],
        { stdio: ["ignore", "ignore", "ignore"] });
    }
  }
}
console.log("\nDone. Point bossVoices at naruto-boss-kaguya / naruto-boss-gaara.");
