/**
 * Overlay REAL Naruto character battle voices onto the existing, carefully
 * designed Hidden Leaf SFX beds (jutsu / kunai / chakra / footstep layers).
 *
 * The curated beds in public/sounds/units/hidden-leaf-*.mp3 stay the base for
 * every action; this script rebuilds only the three VOICE-relevant actions
 * (attack kiai, hurt, death) by mixing a matching character's real recording
 * on top. defend / move / shoot are left untouched (they are SFX cues, not
 * voice). giant_toad is a summon (Gamabunta) with no character voice and is
 * left entirely unchanged.
 *
 * Sources (real character rips, kept private): E:/voice/<pack>. Clip -> action
 * is chosen by a transparent duration heuristic and PRINTED so a human can
 * verify/adjust by ear. Manifest keys and unit-sounds.ts are unchanged (the
 * files keep their existing paths), so the resolver and its tests stay valid.
 *
 * Usage: node scripts/build-hidden-leaf-voice-overlays.mjs
 *   env BEDS=<dir> overrides the bed source dir (default: the live public dir,
 *   but callers should pass the pristine backup so a re-run never overlays an
 *   already-overlaid file).
 */
import { execFileSync } from "node:child_process";
import { readdirSync, mkdtempSync, existsSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const VOICE_ROOT = "E:/voice";
const OUT_DIR = "public/sounds/units";
const BED_DIR = process.env.BEDS || OUT_DIR;

// unit id (matches hidden-leaf-<unit> file stem) -> voice source + pick targets.
// `dir` may be nested; `filter` restricts to battle clips (drops menu/win/dialogue).
// deathPool (optional) restricts the death pick to longer "special" recordings.
const UNITS = [
  {
    unit: "genin-squad", character: "Naruto (Ultimate Ninja Storm 2)",
    dir: "Naruto23/AB", filter: (f) => /^(PL_2nrt|SP_2nrt)/.test(f),
    kiai: 0.72, hurt: 0.27, death: 1.6
  },
  {
    unit: "medical-nin", character: "Sakura (female medic)",
    dir: "Sakura", filter: (f) => /^char_sakura_/.test(f),
    deathPool: (f) => /^sak_str_/.test(f),
    kiai: 0.72, hurt: 0.22, death: 1.5
  },
  {
    // char_ clips only — the sas_str_ dramatic specials are reserved for Susanoo.
    unit: "anbu", character: "Sasuke (black-ops assassin)",
    dir: "Sasuke", filter: (f) => /^char_sasuke_/.test(f),
    kiai: 0.7, hurt: 0.25, death: 1.7
  },
  {
    unit: "jonin", character: "Kakashi (elite jonin)",
    dir: "Kakashi", filter: (f) => /^char_kakashi_/.test(f),
    deathPool: (f) => /^kak_str_/.test(f),
    kiai: 0.7, hurt: 0.23, death: 1.4
  },
  {
    // Gold melee vanguard with no bed of its own — seed the SFX bed from the
    // Jōnin set it borrows today (zero SFX change) and overlay Lee's voice, so
    // it gains a distinct gold-tier voice. defend/move copied verbatim.
    unit: "hokage-vanguard", character: "Rock Lee (taijutsu vanguard)",
    dir: "Lee", filter: (f) => /^char_lee_/.test(f),
    deathPool: (f) => /^lee_str_/.test(f),
    bedFrom: "jonin", bedActions: ["defend", "move"],
    kiai: 0.9, hurt: 0.26, death: 1.6
  },
  {
    unit: "jinchuriki", character: "Nine-Tails Naruto (Naruto vs Pain)",
    dir: "NarVPae/Naruto VS Pain", filter: (f) => /^IA_d09/.test(f),
    kiai: 0.8, hurt: 0.24, death: 1.5
  },
  {
    // Sasuke's own Susanoo avatar — his longer, dramatic special yells.
    unit: "susanoo", character: "Sasuke — Susanoo (dramatic specials)",
    dir: "Sasuke", filter: (f) => /^sas_str_/.test(f),
    kiai: 1.3, hurt: 0.75, death: 2.0
  }
];

function ffprobeDur(file) {
  const out = execFileSync("ffprobe", [
    "-v", "error", "-show_entries", "format=duration",
    "-of", "csv=p=0", file
  ]).toString().trim();
  return parseFloat(out);
}

/** Closest-to-target file, preferring the [lo,hi] window. */
function pick(files, target, lo, hi) {
  const scored = files.map((f) => ({ f, d: f.dur }));
  const inWin = scored.filter((s) => s.d >= lo && s.d <= hi);
  const pool = inWin.length ? inWin : scored;
  pool.sort((a, b) => Math.abs(a.d - target) - Math.abs(b.d - target));
  return pool[0];
}

const VOICE_FILTER =
  "highpass=f=110,lowpass=f=13000," +
  "silenceremove=start_periods=1:start_silence=0.02:start_threshold=-45dB," +
  "areverse,silenceremove=start_periods=1:start_silence=0.02:start_threshold=-45dB,areverse," +
  "loudnorm=I=-18:TP=-1.5:LRA=11,alimiter=limit=0.95";

function processVoice(src, outWav) {
  execFileSync("ffmpeg", [
    "-y", "-i", src, "-af", VOICE_FILTER, "-ac", "1", "-ar", "32000", outWav
  ], { stdio: ["ignore", "ignore", "ignore"] });
}

// per-action mix: [bed volume, voice volume, voice delay ms, max seconds]
const MIX = {
  attack: { bed: 0.85, voice: 1.0, delay: 45, dur: 2.35 },
  hurt: { bed: 0.4, voice: 1.0, delay: 0, dur: 2.0 },
  death: { bed: 0.5, voice: 1.0, delay: 30, dur: 2.8 }
};

function buildMix(bed, voiceWav, action, out) {
  const m = MIX[action];
  const filter =
    `[0:a]volume=${m.bed}[b];` +
    `[1:a]volume=${m.voice}${m.delay ? `,adelay=${m.delay}|${m.delay}` : ""}[v];` +
    `[b][v]amix=inputs=2:duration=longest:normalize=0:dropout_transition=0,` +
    `loudnorm=I=-18:TP=-1.5:LRA=11,alimiter=limit=0.95`;
  execFileSync("ffmpeg", [
    "-y", "-i", bed, "-i", voiceWav, "-filter_complex", filter,
    "-t", String(m.dur), "-ac", "1", "-ar", "32000", "-b:a", "48k", out
  ], { stdio: ["ignore", "ignore", "ignore"] });
}

const tmp = mkdtempSync(join(tmpdir(), "hlvoice-"));
console.log("Hidden Leaf real-voice overlay — source clip -> action map\n");

for (const u of UNITS) {
  const dir = join(VOICE_ROOT, u.dir);
  const wavs = readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".wav"));
  const probe = (f) => ({ name: f, path: join(dir, f), dur: ffprobeDur(join(dir, f)) });
  const files = wavs.filter((f) => u.filter(f)).map(probe);
  const deathFiles = u.deathPool ? wavs.filter((f) => u.deathPool(f)).map(probe) : files;

  const kiai = pick(files, u.kiai, 0.45, 1.35);
  const hurt = pick(files, u.hurt, 0.15, 0.45);
  const death = pick(deathFiles, u.death, 1.0, 2.6);

  console.log(`${u.unit}  [${u.character}]`);
  console.log(`   attack(kiai) <- ${kiai.f.name} (${kiai.d.toFixed(2)}s)`);
  console.log(`   hurt         <- ${hurt.f.name} (${hurt.d.toFixed(2)}s)`);
  console.log(`   death        <- ${death.f.name} (${death.d.toFixed(2)}s)`);

  const bedName = (action) =>
    join(BED_DIR, `hidden-leaf-${u.bedFrom || u.unit}-${action}.mp3`);

  // Copy the non-voice beds under this unit's own name when it has no bed set.
  for (const action of u.bedActions || []) {
    const src = bedName(action);
    if (!existsSync(src)) throw new Error(`missing bed: ${src}`);
    copyFileSync(src, join(OUT_DIR, `hidden-leaf-${u.unit}-${action}.mp3`));
  }

  for (const [action, sel] of [["attack", kiai], ["hurt", hurt], ["death", death]]) {
    const bed = bedName(action);
    if (!existsSync(bed)) throw new Error(`missing bed: ${bed}`);
    const vwav = join(tmp, `${u.unit}-${action}.wav`);
    processVoice(sel.f.path, vwav);
    buildMix(bed, vwav, action, join(OUT_DIR, `hidden-leaf-${u.unit}-${action}.mp3`));
  }
}
console.log("\nDone. defend/move/shoot beds and giant_toad left unchanged.");
