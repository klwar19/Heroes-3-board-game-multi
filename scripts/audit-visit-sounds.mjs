/**
 * One-shot audit: VCMI object visit sounds vs our LOCATION_VISIT_SOUNDS /
 * MAP_TELEPORT_SOUNDS wiring. Run: node scripts/audit-visit-sounds.mjs
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const TMP = os.tmpdir();

function stripJsonComments(s) {
  return s
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "")
    .replace(/,(\s*[}\]])/g, "$1");
}

function walkSounds(obj, p = [], out = []) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return out;
  if (obj.sounds && (obj.sounds.visit || obj.sounds.ambient)) {
    out.push({
      path: p.join("."),
      visit: obj.sounds.visit ?? [],
      ambient: obj.sounds.ambient ?? []
    });
  }
  for (const [k, v] of Object.entries(obj)) {
    if (k === "sounds") continue;
    walkSounds(v, p.concat(k), out);
  }
  return out;
}

// H3 archive name → our library key (from convert-h3-sounds + CSV category).
const H3_TO_LIBRARY = {
  TELPTOUT: "spells/teleport",
  TELEIN: "adventure/teleport",
  TELPTIN: "spells/teleport-in",
  DANGER: "effects/danger",
  CAVEHEAD: "adventure/cave-visit",
  MYSTERY: "adventure/mystery",
  GAZEBO: "adventure/gazebo",
  STORE: "adventure/store",
  MILITARY: "adventure/military",
  GETPROTECTION: "adventure/get-protection",
  QUEST: "adventure/quest",
  LIGHTHOUSE: "adventure/lighthouse",
  FLAGMINE: "adventure/flag-mine",
  TREASURE: "adventure/treasure",
  ROGUE: "adventure/rogue",
  EXPERNCE: "adventure/experience",
  TEMPLE: "adventure/temple",
  GRAVEYARD: "adventure/graveyard",
  MORALE: "adventure/morale",
  LUCK: "adventure/luck",
  OBELISK: "adventure/obelisk", // if present; may be mystery
  DIGSOUND: "adventure/dig",
  NOMAD: "adventure/nomad",
  PROTECT: "adventure/protect",
  ULTIMATEARTIFACT: "adventure/ultimate-artifact",
  PICKUP01: "adventure/pickup-01",
  PICKUP02: "adventure/pickup-02",
  PICKUP03: "adventure/pickup-03",
  PICKUP04: "adventure/pickup-04",
  PICKUP05: "adventure/pickup-05",
  PICKUP06: "adventure/pickup-06",
  PICKUP07: "adventure/pickup-07",
  // Ambient loops (for mismatch detection when we wrongly use ambient as visit)
  LOOPMON1: "ambient/monolith-1",
  LOOPMON2: "ambient/monolith-2",
  LOOPWHIR: "ambient/whirlpool",
  LOOPGATE: "ambient/subterranean-gate",
  LOOPFOUN: "ambient/fountain",
  LOOPGARD: "ambient/garden",
  LOOPMAGI: "ambient/magic",
  LOOPSANC: "ambient/sanctuary",
  LOOPMARK: "ambient/market",
  LOOPTAV: "ambient/tavern",
  LOOPHORS: "ambient/stables",
  LOOPSHRIN: "ambient/shrine",
  LOOPWIND: "ambient/windmill",
  LOOPMILL: "ambient/mill",
  LOOPMINE: "ambient/mine",
  LOOPSTAR: "ambient/star-axis",
  LOOPLEAR: "ambient/faerie-ring",
  LOOPBUOY: "ambient/buoy",
  LOOPSIRE: "ambient/sirens",
  LOOPOCEA: "ambient/ocean",
  LOOPCAVE: "ambient/cave",
  LOOPSWAR: "ambient/swords"
};

// VCMI object path fragment → our location id(s) in LOCATION_VISIT_SOUNDS / teleports
const VCMI_TO_OUR_LOCATIONS = {
  "monolithTwoWay": ["monolith", "gate"],
  "monolithOneWayEntrance": ["monolith"],
  "whirlpool": ["whirlpool"],
  "subterraneanGate": ["subterranean_gate"],
  "obelisk": ["obelisk"],
  "pandoraBox": ["pandoras_box"],
  "prison": ["prison"],
  "sanctuary": ["sanctuary"],
  "tavern": ["tavern"],
  "hillFort": ["hill_fort"],
  "sirens": ["mermaid"],
  "denOfThieves": ["den_of_thieves"],
  "eyeOfTheMagi": ["redwood_observatory"],
  "hutOfTheMagi": ["redwood_observatory"],
  "shipyard": ["shipyard"],
  "sign": ["sign"],
  "oceanBottle": ["ocean_bottle"],
  "refugeeCamp": ["refugee_camp"],
  "warMachineFactory": ["war_machine_factory"],
  "questGuard": ["quest_guard"],
  "borderGuard": ["border_guard"],
  "borderGate": ["border_gate"],
  "keymasterTent": ["keymasters_tent"],
  "seerHut": ["seer_hut"],
  "witchHut": ["witch_hut"],
  "scholar": ["scholar"],
  "shrine": ["shrine_of_magic_incantation", "shrine_of_magic_gesture"],
  "magicWell": ["magic_well"],
  "magicSpring": ["magic_spring"],
  "lighthouse": ["lighthouse"],
  "observatory": ["redwood_observatory"],
  "pyramid": ["pyramid"],
  "cartographer": ["cartographer"],
  "coverOfDarkness": ["cover_of_darkness"],
  "mine.types.sawmill": ["mine"],
  "mine.types.goldMine": ["mine"],
  "mine.types.orePit": ["mine"],
  "mine.types.abandoned": ["mine"],
  "garrisonHorizontal": ["garrison"],
  "garrisonVertical": ["garrison"]
};

// Load our map-sounds tables by reading the TS source (no TS import).
const mapSoundsSrc = fs.readFileSync(path.join(ROOT, "src/data/map-sounds.ts"), "utf8");
function extractRecord(name) {
  const re = new RegExp(`export const ${name}[^=]*=\\s*\\{([\\s\\S]*?)\\n\\};`);
  const m = mapSoundsSrc.match(re);
  if (!m) return {};
  const body = m[1];
  const out = {};
  for (const line of body.split("\n")) {
    const km = line.match(/^\s*(?:["']([^"']+)["']|([A-Za-z0-9_]+))\s*:\s*["']([^"']+)["']/);
    if (km) out[km[1] || km[2]] = km[3];
  }
  return out;
}
const LOCATION_VISIT = extractRecord("LOCATION_VISIT_SOUNDS");
const MAP_TELEPORT = extractRecord("MAP_TELEPORT_SOUNDS");

const manifestRaw = fs.readFileSync(path.join(ROOT, "public/sounds/manifest.json"), "utf8").replace(/^\uFEFF/, "");
const manifest = JSON.parse(manifestRaw);

// Collect VCMI visit entries
const vcmiFiles = fs.readdirSync(TMP).filter((f) => f.startsWith("vcmi-") && f.endsWith(".json"));
const visits = [];
for (const f of vcmiFiles) {
  try {
    const j = JSON.parse(stripJsonComments(fs.readFileSync(path.join(TMP, f), "utf8")));
    visits.push(...walkSounds(j, [f.replace(/^vcmi-/, "").replace(/\.json$/, "")]));
  } catch (e) {
    console.error("parse fail", f, e.message);
  }
}

const withVisit = visits.filter((v) => v.visit?.length);
console.log("=== VCMI objects with visit sounds ===");
for (const row of withVisit) {
  const lib = row.visit.map((n) => H3_TO_LIBRARY[n] ?? `???${n}`);
  console.log(`${row.path.padEnd(50)} visit=${row.visit.join(",").padEnd(18)} → ${lib.join(",")}`);
}

// Teleport audit
console.log("\n=== TELEPORT WIRING (must match VCMI visit, not ambient) ===");
const teleportExpected = {
  monolith: "spells/teleport",
  gate: "spells/teleport",
  whirlpool: "effects/danger",
  subterranean: "adventure/cave-visit",
  spell: "spells/teleport"
};
let bad = 0;
for (const [k, want] of Object.entries(teleportExpected)) {
  const got = MAP_TELEPORT[k];
  const ok = got === want && manifest[want];
  if (!ok) bad += 1;
  console.log(ok ? "OK " : "BAD", `teleport.${k}: got=${got} want=${want}`);
}

// LOCATION_VISIT audit for known VCMI mappings
console.log("\n=== LOCATION_VISIT vs VCMI visit (known mismatches) ===");
const checks = [
  // [our location id, expected library key from VCMI visit, note]
  ["subterranean_gate", "adventure/cave-visit", "VCMI subterraneanGate visit CAVEHEAD — NOT LOOPGATE ambient"],
  ["obelisk", "adventure/mystery", "VCMI obelisk visit MYSTERY (we may use adventure/obelisk if that is OBELISK)"],
  ["pandoras_box", "adventure/mystery", "VCMI pandoraBox visit MYSTERY"],
  ["sanctuary", "adventure/get-protection", "VCMI sanctuary visit GETPROTECTION — NOT LOOPSANC ambient"],
  ["tavern", "adventure/store", "VCMI tavern visit STORE — NOT LOOPTAV ambient"],
  ["hill_fort", "adventure/military", "VCMI hillFort visit MILITARY"],
  // Board-game Mermaid ≈ VCMI mermaids (LUCK), not sirens (DANGER).
  ["mermaid", "adventure/luck", "VCMI mermaids visit LUCK"],
  ["witch_hut", "adventure/gazebo", "VCMI witchHut visit GAZEBO"],
  ["scholar", "adventure/gazebo", "VCMI scholar visit GAZEBO"],
  ["redwood_observatory", "adventure/lighthouse", "VCMI eye/hut/observatory visit LIGHTHOUSE"],
  ["shipwreck_survivor", "adventure/treasure", "VCMI shipwreckSurvivor visit TREASURE"],
  ["fountain_of_youth", "adventure/morale", "VCMI fountainOfYouth visit MORALE"],
  ["mystical_garden", "adventure/experience", "VCMI mysticalGarden visit EXPERNCE"],
  ["magic_spring", "units/faerie-dragon-special", "VCMI magicSpring visit FAERIE (same WAV as unit)"],
  ["faerie_ring", "adventure/luck", "VCMI faerieRing visit LUCK"],
  ["buoy", "adventure/morale", "VCMI buoy visit MORALE"],
  ["stables", "adventure/store", "VCMI stables visit STORE"],
  ["windmill", "units/genie-special", "VCMI windmill visit GENIE (same WAV as unit)"],
  ["water_wheel", "units/genie-special", "VCMI waterWheel visit GENIE"]
];

// Find rewardable visit sounds of interest from VCMI dump
const rewardableVisits = withVisit.filter(
  (r) =>
    /fountain|garden|spring|faerie|buoy|stable|windmill|water|mill|temple|market|trading|black|stables|arena|school|library|tree|idol|rally|lean|mercenary|marletto|star|oasis|watering|swan|rally|colosseum|learning|garden|fountain|well|spring|ring|buoy/i.test(
      r.path
    )
);
console.log("\n=== Rewardable-ish VCMI visits (for cross-check) ===");
for (const row of rewardableVisits) {
  console.log(row.path, "→", row.visit.join(","), "(amb", (row.ambient || []).join(",") + ")");
}

for (const [loc, want, note] of checks) {
  const got = LOCATION_VISIT[loc];
  if (want == null) {
    console.log("?", loc.padEnd(28), `wired=${got ?? "(none)"}`, "—", note);
    continue;
  }
  // Special: obelisk may be adventure/obelisk if that file is the OBELISK clip
  const ok =
    got === want ||
    (loc === "obelisk" && got === "adventure/obelisk" && manifest["adventure/obelisk"]);
  if (!ok) bad += 1;
  console.log(ok ? "OK " : "BAD", loc.padEnd(28), `got=${got ?? "(none)"}`.padEnd(36), `want=${want}`, "—", note);
}

// Ambient-as-visit smell: LOCATION_VISIT keys that point at ambient/
console.log("\n=== LOCATION_VISIT keys using ambient/* (often wrong — visit should be one-shot) ===");
for (const [loc, key] of Object.entries(LOCATION_VISIT)) {
  if (key.startsWith("ambient/")) {
    console.log("SMELL", loc, "→", key);
  }
}

// Manifest missing
console.log("\n=== Wired keys missing from manifest ===");
for (const [loc, key] of Object.entries({ ...LOCATION_VISIT, ...MAP_TELEPORT })) {
  if (!manifest[key]) {
    bad += 1;
    console.log("MISSING", loc, key);
  }
}

console.log("\n=== SUMMARY ===");
console.log(bad === 0 ? "No hard BAD teleport mismatches." : `${bad} hard mismatch(es) found.`);
process.exitCode = bad > 0 ? 1 : 0;
