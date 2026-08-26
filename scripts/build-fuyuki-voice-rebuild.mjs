/**
 * Rebuild the Fuyuki City (Fate/unlimited codes) Servant voices from the FULL
 * character voice packs under E:/voice/<Servant>, replacing the old minimal
 * build that used only `se/chrm` action grunts. Now each Servant's ATTACK is the
 * character's iconic named battle cry (voice/<prefix>/<prefix>_etc_*) layered
 * over their own weapon SE (se/chrm_<prefix>00_00002), DEATH is the real KO line
 * (<prefix>_ko_00), and ranged Servants (EMIYA/Medea) get their named projectile
 * line for SHOOT. hurt/defend/move stay the character's short chrm action grunts
 * so frequent play does not repeat long dialogue (the pack's own design rule).
 *
 * Outputs mono 44.1 kHz Vorbis to the SAME paths
 * (public/sounds/fuyuki/voices/<slug>/<action>.ogg), so manifest keys and the
 * unit-sounds.ts resolver are unchanged. Picks are PRINTED.
 *
 * Usage: node scripts/build-fuyuki-voice-rebuild.mjs
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const VOICE_ROOT = "E:/voice";
const OUT_ROOT = "public/sounds/fuyuki/voices";

// slug -> Servant folder, source prefix, iconic attack cry, optional shoot line.
const UNITS = [
  { slug: "sabers", dir: "Artoria-Saber", pfx: "sbr", attack: "sbr_etc_haaaa" },
  { slug: "lancers", dir: "CuChulainn-Lancer", pfx: "lan", attack: "lan_etc_haaaa" },
  { slug: "archers", dir: "EMIYA-Archer", pfx: "emy", attack: "emy_etc_bladeoff", shoot: "emy_etc_hrunting" },
  { slug: "berserkers", dir: "Heracles-Berserker", pfx: "ber", attack: "ber_etc_attack00" },
  { slug: "casters", dir: "Medea-Caster", pfx: "cas", attack: "cas_etc_sininasai", shoot: "cas_etc_koryukion" },
  { slug: "riders", dir: "Medusa-Rider", pfx: "rid", attack: "rid_etc_okakugowo" },
  { slug: "assassins", dir: "Sasaki-Kojiro-Assassin", pfx: "koj", attack: "koj_etc_kiero" }
];

// caps (seconds) per action
const CAP = { attack: 2.0, shoot: 1.6, death: 2.8, hurt: 1.4, defend: 1.5, move: 1.2 };

function vpath(u, name) { return join(VOICE_ROOT, u.dir, "voice", u.pfx, name); }
function chrm(u, idx) {
  return join(VOICE_ROOT, u.dir, "se", `chrm_${u.pfx}00-mono`, `chrm_${u.pfx}00_${String(idx).padStart(5, "0")}.wav`);
}
// first existing chrm index from the preference list (action grunts differ per rip)
function chrmPick(u, prefs) {
  for (const i of prefs) { if (existsSync(chrm(u, i))) return chrm(u, i); }
  throw new Error(`no chrm grunt for ${u.pfx} in ${prefs}`);
}

const VF =
  "highpass=f=90,lowpass=f=15000," +
  "silenceremove=start_periods=1:start_silence=0.02:start_threshold=-45dB," +
  "areverse,silenceremove=start_periods=1:start_silence=0.02:start_threshold=-45dB,areverse," +
  "loudnorm=I=-18:TP=-1.5:LRA=11,alimiter=limit=0.95";

function encode(inWav, out, cap) {
  execFileSync("ffmpeg", ["-y", "-i", inWav, "-af", VF, "-t", String(cap),
    "-ac", "1", "-ar", "44100", "-c:a", "libvorbis", "-q:a", "4", out],
    { stdio: ["ignore", "ignore", "ignore"] });
}
function encodeMix(voiceWav, seWav, out, cap) {
  const filter =
    `[0:a]${VF},volume=1.0[v];[1:a]volume=0.7,adelay=15|15[s];` +
    `[v][s]amix=inputs=2:duration=first:normalize=0:dropout_transition=0,` +
    `loudnorm=I=-18:TP=-1.5:LRA=11,alimiter=limit=0.95`;
  execFileSync("ffmpeg", ["-y", "-i", voiceWav, "-i", seWav, "-filter_complex", filter,
    "-t", String(cap), "-ac", "1", "-ar", "44100", "-c:a", "libvorbis", "-q:a", "4", out],
    { stdio: ["ignore", "ignore", "ignore"] });
}

for (const u of UNITS) {
  const outDir = join(OUT_ROOT, u.slug);
  mkdirSync(outDir, { recursive: true });
  const attackVoice = vpath(u, `${u.attack}.wav`);
  const deathVoice = existsSync(vpath(u, `${u.pfx}_ko_00.wav`)) ? vpath(u, `${u.pfx}_ko_00.wav`) : vpath(u, `${u.pfx}_ko_01.wav`);
  const seAttack = chrm(u, 2);
  const hurt = chrmPick(u, [14, 15, 12, 13]);
  const defend = chrmPick(u, [10, 11, 9]);
  const move = chrmPick(u, [7, 8, 6]);

  console.log(`${u.slug}  [${u.dir}]`);
  console.log(`   attack <- ${u.attack} + chrm_00002 SE`);
  console.log(`   death  <- ${u.pfx}_ko_00`);
  if (u.shoot) console.log(`   shoot  <- ${u.shoot} + chrm_00002 SE`);

  encodeMix(attackVoice, seAttack, join(outDir, "attack.ogg"), CAP.attack);
  encode(deathVoice, join(outDir, "death.ogg"), CAP.death);
  encode(hurt, join(outDir, "hurt.ogg"), CAP.hurt);
  encode(defend, join(outDir, "defend.ogg"), CAP.defend);
  encode(move, join(outDir, "move.ogg"), CAP.move);
  if (u.shoot) encodeMix(vpath(u, `${u.shoot}.wav`), seAttack, join(outDir, "shoot.ogg"), CAP.shoot);
}
console.log("\nDone. Rebuilt all 7 Fuyuki Servant voices from the full Fate packs.");
