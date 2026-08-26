/**
 * ONE unified pass that voices EVERY wuxia unit (Azure Breeze + Heavenly Demon),
 * EVERY action, over the existing SFX beds — with the voice CLEAR and FULL (like
 * the Fate/Naruto packs): the voice sits on top of the bed (bed low), attack is
 * the character's multiple battle barks CONCATENATED into one longer cry, deaths
 * use the longest available clip, and every action has a generous length cap with
 * a smooth tail so nothing is cut abrupt or buried.
 *
 * Sources (all real, action-labeled — no guessing):
 *  - HUMAN MALE: Total War Chinese (E:/voice/Chinese) Attack×3 concatenated ->
 *    attack, Move -> move; Fallout 3 Chinese Soldiers -> defend/hurt/death
 *    (longest clips, that pack has the only real _hit_/_death_ barks).
 *  - GU WITCHES (female): No Heroes Allowed! VR Chinese pack, pitch-selected
 *    female clips, longest per action (needs scripts/analyze-voice-pitch.py json).
 *  - NON-HUMAN: one Age of Mythology Chinese-myth CREATURE each; attack =
 *    creature attack+grunt concatenated (fuller), death = its long roar, etc.
 *    Missing creature actions fall back to grunt/select, else keep the bed.
 *
 * File paths / manifest / unit-sounds.ts unchanged.
 * Usage: PITCH=<wuxia_pitch2.json> BEDS=<pristine bed dir> node scripts/build-wuxia-all.mjs
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const TW = "E:/voice/Chinese";
const FO = "E:/voice/PC _ Computer - Fallout 3 - Character Voices - Chinese Soldiers";
const AOM = "E:/voice/PC _ Computer - Age of Mythology_ Extended Edition - Units - Chinese/chinese";
const HER = "E:/voice/Heroes (Chinese)";
const OUT_DIR = "public/sounds/units";
const BED_DIR = process.env.BEDS || OUT_DIR;
const PITCH = process.env.PITCH;

// Fallout pools sorted LONGEST-first so every unit gets a clear, full clip.
const FO_HIT = [
  "genericchinesetroop_hit_0009325b_1.ogg", "genericchinesetroop_hit_0009325a_1.ogg",
  "dlc02chinesedialogue_hit_0000bf91_1.ogg", "dlc02chinesedialogue_hit_0000bf92_1.ogg",
  "dlc02chinesedialogue_hit_0000bf8f_1.ogg", "dlc02chinesedialogue_hit_0000bf90_1.ogg",
  "dlc02chinesedialogue_hit_0000bf8e_1.ogg"
];
const FO_DEATH = [
  "genericchinesetroop_death_0009324f_1.ogg", "dlc02chinesedialogue_death_0000c00e_1.ogg",
  "dlc02chinesedialogue_death_0000c00b_1.ogg", "genericchinesetroop_death_0009324d_1.ogg",
  "dlc02chinesedialogue_death_0000c00c_1.ogg", "dlc02chinesedialogue_death_0000c00d_1.ogg",
  "genericchinesetroop_death_0009324e_1.ogg"
];
// defend: pair a combat-ready shout with a follow bark, concatenated for length.
const FO_DEFEND = [
  ["dlc02chine_startcombatresp_0000c016_1.ogg", "dlc02chine_normaltocombat_0000bffe_1.ogg"],
  ["dlc02chine_startcombatresp_0000c017_1.ogg", "dlc02chine_normaltocombat_0000bfff_1.ogg"],
  ["dlc02chine_startcombatresp_0000c018_1.ogg", "dlc02chine_normaltocombat_0000c000_1.ogg"],
  ["dlc02chine_startcombatresp_0000c019_1.ogg", "dlc02chine_normaltocombat_0000c001_1.ogg"],
  ["dlc02chine_alerttocombat_0000c00f_1.ogg", "dlc02chine_startcombatresp_0000c016_1.ogg"],
  ["dlc02chine_alerttocombat_0000c010_1.ogg", "dlc02chine_startcombatresp_0000c017_1.ogg"],
  ["dlc02chine_alerttocombat_0000c011_1.ogg", "dlc02chine_startcombatresp_0000c018_1.ogg"]
];

const HUMAN = [
  { stem: "azure-breeze-outer-disciples", tw: "Changdao" },
  { stem: "azure-breeze-inner-swordsmen", tw: "IronTroop" },
  { stem: "azure-breeze-sect-protectors", tw: "IronFlail" },
  { stem: "azure-breeze-mountain-guardian", tw: "MeteorHammer" },
  { stem: "azure-breeze-true-inheritors", tw: "Keshik" },
  { stem: "azure-breeze-core-master", tw: "ChuKoNu", ranged: true },
  { stem: "heavenly-demon-blood-disciples", tw: "QiangPikeman" }
];
const CREATURE = [
  { stem: "azure-breeze-spirit-crane", cr: "vermilionbird" },
  { stem: "heavenly-demon-shadow-wraiths", cr: "whitetiger" },
  { stem: "heavenly-demon-corpse-puppets", cr: "terracottasoldier" },
  { stem: "heavenly-demon-bone-reavers", cr: "jiangshi" },
  { stem: "heavenly-demon-ghost-king", cr: "azuredragon" },
  { stem: "heavenly-demon-avatar", cr: "earthdragon" }
];

// bed low so the VOICE is clear on top; generous caps so clips are not cut short.
const MIX = {
  attack: { bed: 0.4, voice: 1.0, delay: 30, dur: 2.8 },
  move: { bed: 0.6, voice: 0.85, delay: 20, dur: 2.0 },
  defend: { bed: 0.4, voice: 1.0, delay: 15, dur: 2.4 },
  hurt: { bed: 0.3, voice: 1.0, delay: 0, dur: 2.2 },
  death: { bed: 0.3, voice: 1.0, delay: 15, dur: 3.4 },
  shoot: { bed: 0.5, voice: 1.0, delay: 30, dur: 2.4 }
};

const VF =
  "highpass=f=90,lowpass=f=15000," +
  "silenceremove=start_periods=1:start_silence=0.02:start_threshold=-45dB," +
  "areverse,silenceremove=start_periods=1:start_silence=0.02:start_threshold=-45dB,areverse," +
  "loudnorm=I=-18:TP=-1.5:LRA=11,alimiter=limit=0.95";

const tmp = mkdtempSync(join(tmpdir(), "wuxall-"));
let seq = 0;
function toWav(src) {
  const out = join(tmp, `s${seq++}.wav`);
  execFileSync("ffmpeg", ["-y", "-i", src, "-af", VF, "-ac", "1", "-ar", "32000", out],
    { stdio: ["ignore", "ignore", "ignore"] });
  return out;
}
// process each src, then concatenate (0.08s gap) into one longer, clear voice wav.
function voiceWav(srcs) {
  const wavs = srcs.map(toWav);
  if (wavs.length === 1) return wavs[0];
  const inputs = wavs.flatMap((w) => ["-i", w]);
  const parts = wavs.map((_, i) => `[${i}:a]`).join("");
  const out = join(tmp, `c${seq++}.wav`);
  execFileSync("ffmpeg", ["-y", ...inputs, "-filter_complex",
    `${parts}concat=n=${wavs.length}:v=0:a=1,aresample=32000[o]`, "-map", "[o]", out],
    { stdio: ["ignore", "ignore", "ignore"] });
  return out;
}
function mix(stem, action, srcs, bedVolOverride) {
  const m = MIX[action];
  const bed = join(BED_DIR, `${stem}-${action}.mp3`);
  if (!existsSync(bed)) throw new Error(`missing bed: ${bed}`);
  for (const s of srcs) if (!existsSync(s)) throw new Error(`missing source: ${s}`);
  const v = voiceWav(srcs);
  const bedVol = bedVolOverride ?? m.bed;
  // voice on top; fade the tail so the (longer) clip rings out instead of cutting.
  const filter =
    `[0:a]volume=${bedVol}[b];` +
    `[1:a]volume=${m.voice}${m.delay ? `,adelay=${m.delay}|${m.delay}` : ""}[v];` +
    `[b][v]amix=inputs=2:duration=longest:normalize=0:dropout_transition=0,` +
    `loudnorm=I=-18:TP=-1.5:LRA=11,afade=t=out:st=${(m.dur - 0.18).toFixed(2)}:d=0.18,alimiter=limit=0.95`;
  execFileSync("ffmpeg", ["-y", "-i", bed, "-i", v, "-filter_complex", filter,
    "-t", String(m.dur), "-ac", "1", "-ar", "32000", "-b:a", "48k",
    join(OUT_DIR, `${stem}-${action}.mp3`)], { stdio: ["ignore", "ignore", "ignore"] });
}
const P = (dir, f) => join(dir, f);

console.log("== HUMAN MALE ==");
HUMAN.forEach((u, i) => {
  const atk = [1, 2, 3].map((n) => P(TW, `${u.tw}Attack${n}.wav`)).filter(existsSync);
  const mov = [1, 2].map((n) => P(TW, `${u.tw}Move${n}.wav`)).filter(existsSync);
  mix(u.stem, "attack", atk);
  mix(u.stem, "move", mov);
  mix(u.stem, "defend", FO_DEFEND[i % FO_DEFEND.length].map((f) => P(FO, f)));
  mix(u.stem, "hurt", [P(FO, FO_HIT[i % FO_HIT.length])]);
  mix(u.stem, "death", [P(FO, FO_DEATH[i % FO_DEATH.length])]);
  if (u.ranged) mix(u.stem, "shoot", [P(TW, `${u.tw}Attack2.wav`)]);
  console.log(`${u.stem} [${u.tw}] atk×${atk.length} move×${mov.length} + Fallout defend/hurt/death`);
});

console.log("\n== NON-HUMAN (AoM creatures) ==");
function cr(u, ...names) {
  const hit = names.map((n) => P(AOM, `${u}_${n}.wav`)).filter(existsSync);
  return hit.length ? hit : undefined;
}
for (const u of CREATURE) {
  const map = {
    attack: cr(u.cr, "attack", "grunt1") || cr(u.cr, "grunt1", "grunt2") || cr(u.cr, "select1"),
    death: cr(u.cr, "death"),
    move: cr(u.cr, "move1", "move2") || cr(u.cr, "move1"),
    hurt: cr(u.cr, "grunt1") || cr(u.cr, "grunt2") || cr(u.cr, "select1"),
    defend: cr(u.cr, "grunt2") || cr(u.cr, "select1") || cr(u.cr, "grunt1")
  };
  const built = [];
  for (const [action, srcs] of Object.entries(map)) {
    if (srcs) { mix(u.stem, action, srcs, 0.4); built.push(action); }
  }
  console.log(`${u.stem} [${u.cr}] -> ${built.join(", ")}${built.length < 5 ? "  (rest keep bed)" : ""}`);
}

if (PITCH && existsSync(PITCH)) {
  console.log("\n== GU WITCHES (female) ==");
  const rows = JSON.parse(readFileSync(PITCH, "utf8"))
    .filter((r) => r.vr >= 0.4 && r.rms >= 0.02 && r.dur >= 0.3 && r.dur <= 2.4 &&
      r.f0 >= 180 && r.f0 <= 320 && r.aper <= 0.3);
  // longest clips first for clarity/length
  const A = [
    { name: "attack", t: 1.1 }, { name: "defend", t: 0.9 }, { name: "hurt", t: 0.6 },
    { name: "death", t: 1.8 }, { name: "move", t: 0.8 }, { name: "shoot", t: 1.0 }
  ];
  for (const a of A) {
    if (!existsSync(join(BED_DIR, `heavenly-demon-gu-witches-${a.name}.mp3`))) continue;
    const pick = rows.filter((r) => !r.used).sort((x, y) => Math.abs(x.dur - a.t) - Math.abs(y.dur - a.t))[0];
    if (!pick) continue;
    pick.used = true;
    mix("heavenly-demon-gu-witches", a.name, [P(HER, pick.file)]);
    console.log(`   ${a.name.padEnd(6)} <- ${pick.file} (${pick.dur}s)`);
  }
}
console.log("\nDone — voice clear on top, attacks concatenated, generous lengths.");
