import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));

const AD =
  "Art direction: late-1990s painted fantasy game box-art meets Chinese ink-wash horror. Deep obsidian blacks, blood-crimson reds, sickly jade-green ghost-light accents. Dramatic rim lighting, painterly brushwork, ominous cultist atmosphere. No text, no border, no UI, no card frame — just the illustration.";

const CHAR_TAIL =
  "Full-body figure(s), centered, filling the frame vertically. Plain dark atmospheric background (obsidian mist / faint jade glow). " +
  AD +
  "\n\nDo not run any shell commands; just generate the image and finish.\n";

const unit = (subject) =>
  `Generate a single 1024x1536 portrait illustration for a dark-fantasy board game character card art window.\n\nSubject: ${subject}\n\n${CHAR_TAIL}`;

const hero = (subject) =>
  `Generate a single 1024x1536 portrait illustration of a single dark-fantasy hero for a game portrait.\n\nSubject: ${subject}\n\nSingle imposing figure, three-quarter to full body, centered, dramatic hero portrait. Plain dark atmospheric background (obsidian mist / faint crimson glow). ${AD}\n\nDo not run any shell commands; just generate the image and finish.\n`;

const PROMPTS = {
  // --- units (one master per unit; distinct few/pack for the two gold units) ---
  "units/blood-disciples-master.txt": unit(
    '"Blood Disciples" — evil demonic-path cultivator warriors of the Heavenly Demon Palace, a wuxia-horror sect. Two gaunt blood-robed disciples in tattered crimson-and-black robes, pale corpse-like skin, glowing sickly jade-green eyes, wielding curved blood-slick jian swords, wisps of crimson blood-qi swirling around them. Menacing, sinister, cultish.'
  ),
  "units/gu-witches-master.txt": unit(
    '"Gu Witches" — ranged gu-sorceress casters of the Heavenly Demon Palace, an evil wuxia-horror sect. Two sinister witches in ragged crimson-black silk robes, pale skin, jade-green glowing eyes, conjuring swarms of venomous jade insects and poison-hex darts from open hands. Bone talismans, gourds of gu poison at their belts. Menacing, occult.'
  ),
  "units/shadow-wraiths-master.txt": unit(
    '"Shadow Wraiths" — spectral shadow-assassins of the Heavenly Demon Palace. Two gaunt hooded figures half-dissolving into black-and-crimson smoke, faceless but for burning jade-green eyes, wielding wicked curved daggers, trailing tattered wraith-shrouds. Silent, deadly, ghostly.'
  ),
  "units/corpse-puppets-master.txt": unit(
    '"Corpse Puppets" — reanimated undead-tank warriors of the Heavenly Demon Palace. Two hulking stitched corpse-soldiers in rotting crimson-black lacquered armor, grey mottled dead flesh, jade-green talisman seals pasted on their foreheads, dragging huge cleaver-blades. Slow, heavy, gruesome corpse-sorcery puppets.'
  ),
  "units/bone-reavers-master.txt": unit(
    '"Bone Reavers" — fast bone-armored raider warriors of the Heavenly Demon Palace. Two lithe demonic reavers clad in white bone-plate over crimson wraps, skull-masks, wielding twin bone-scythe blades wreathed in jade ghost-fire, mid-lunge with predatory speed. Savage, agile.'
  ),
  // Gold unit: Ghost King (distinct few/pack)
  "units/ghost-king-few-master.txt": unit(
    '"Ghost King" — a towering spectral undead sovereign of the Heavenly Demon Palace. A crowned ghost-emperor in flowing translucent crimson-black funeral robes, gaunt regal face, jade-green spectral flames pouring from empty eye-sockets, wielding a ghostly bone scepter, hovering above a swirl of wailing spirit-smoke. Majestic, terrifying, regal.'
  ),
  "units/ghost-king-pack-master.txt": unit(
    '"Ghost King" (empowered) — an enraged ghost-emperor of the Heavenly Demon Palace at full spectral power. The crowned undead sovereign engulfed in a towering vortex of jade-green ghost-fire and crimson spirit-storm, ghostly courtiers and wailing skulls swirling behind him, arms raised commanding the dead. Overwhelming, apocalyptic, regal horror.'
  ),
  // Gold unit: Heavenly Demon Avatar (distinct few/pack)
  "units/demon-avatar-few-master.txt": unit(
    '"Heavenly Demon Avatar" — the incarnate demon-god champion of the Heavenly Demon Palace. A colossal muscular demonic warrior in obsidian-and-crimson demon armor with jagged horns, four burning jade-green eyes, wielding an enormous blood-drinking demon glaive, crimson demon-qi erupting around him. The ultimate evil-path avatar. Imposing, godlike, monstrous.'
  ),
  "units/demon-avatar-pack-master.txt": unit(
    '"Heavenly Demon Avatar" (ascended) — the demon-god avatar of the Heavenly Demon Palace in full ascension. A titanic multi-horned demon warlord wreathed in a blazing crimson-and-jade demonic aura, a spectral second pair of demon arms manifesting behind him, shattered ground and rising blood-mist below, roaring in triumph. Cataclysmic, godlike, monstrous horror.'
  ),

  // --- heroes ---
  "heroes/xuedao-master.txt": hero(
    'Xuedao, the "Blood Path Patriarch" — supreme male patriarch of the Heavenly Demon Palace evil sect. An aged but powerful cultivator in ornate blood-crimson-and-black patriarch robes with demonic gold trim, long grey-black hair and beard, cold cruel eyes glowing faint crimson, a blood-red dao saber, swirling blood-qi. Regal, sinister, commanding.'
  ),
  "heroes/guiyan-master.txt": hero(
    'Guiyan, the "Ghost Flame Sovereign" — a male ghost-master lord of the Heavenly Demon Palace. A pale gaunt sorcerer in dark crimson-black robes hung with ghost-talismans, jade-green ghost-flames dancing over his hands and a spectral skull-lantern at his side, hollow glowing eyes. Eerie, undead-summoner menace.'
  ),
  "heroes/xuanming-master.txt": hero(
    'Xuanming, the "Bone Reaver Marshal" — a male demonic war-general of the Heavenly Demon Palace. An armored warlord in black bone-plated crimson armor, a horned skull-motif helm under his arm, scarred stern face, a massive bone-hafted demon glaive, commanding presence. Brutal, martial, sinister.'
  ),
  "heroes/yaoji-master.txt": hero(
    'Yaoji, the "Blood Alchemist" — a female blood-witch healer of the Heavenly Demon Palace. A beautiful but sinister woman in flowing crimson-and-black silk robes, holding a jade vial of glowing blood-elixir, blood-red qi threads coiling around her fingers, a cold seductive smile, faint crimson glow in her eyes. Elegant, dangerous, occult.'
  ),
  "heroes/molian-master.txt": hero(
    'Molian, the "Corpse Weaver" — a female corpse-sorceress mystic of the Heavenly Demon Palace. A pale graceful woman in dark crimson funeral robes trailing threads and needles of ghostly jade light, weaving spectral suture-threads between her hands, corpse-talismans hanging from her sleeves, an unsettling calm expression. Macabre, mystical, elegant.'
  ),

  // --- commander ---
  "commander/demon-ancestor-master.txt": hero(
    'The "Demon Ancestor" (Thiên Ma Tổ Sư) — the ancient founding demon-god ancestor of the Heavenly Demon Palace, an undying demonic patriarch. A colossal ancient demonic overlord seated/looming in imperial obsidian-and-crimson demon-emperor robes and horned crown, immense age and power, jade-green and crimson demon-qi radiating, skeletal demonic hands, four glowing eyes. The undying founder of the evil sect. Godlike, ancient, terrifying.'
  ),
};

// --- panorama (empty) ---
PROMPTS["panorama/palace-empty-master.txt"] =
  "Generate a single 1536x1024 wide landscape establishing shot for a fantasy board-game town panorama.\n\n" +
  "Subject: the Heavenly Demon Palace — an evil demonic-path cultivation sect's mountain stronghold, EARLY / UNBUILT state. A vast volcanic obsidian mountain terrace under a blood-crimson stormy sky, jagged black volcanic rock, rivers of dim red lava in crevices, empty graded building foundations and bare stone platforms where a dark palace will rise, a few ruined black stone pillars and demonic statues, sickly jade-green mist pooling in the hollows. Ominous, desolate, brooding. " +
  AD +
  "\n\nDo not run any shell commands; just generate the image and finish.\n";

// --- tile ---
PROMPTS["tile/palace-tile-master.txt"] =
  "Generate a single 1024x1024 top-down aerial illustration for a fantasy board-game map tile.\n\n" +
  "Subject: an aerial bird's-eye view of the Heavenly Demon Palace stronghold on a volcanic obsidian island — a sprawling black demonic palace complex with crimson-tiled pagoda roofs, blood-red courtyards, glowing lava channels and jade-green ghost-lantern lights, jagged black rock, surrounded by dark misty terrain. Nighttime, ominous, painted top-down map style. " +
  AD +
  "\n\nDo not run any shell commands; just generate the image and finish.\n";

for (const [rel, text] of Object.entries(PROMPTS)) {
  const out = path.join(DIR, rel);
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, text, "utf8");
  console.log("wrote", rel);
}
console.log(`\n${Object.keys(PROMPTS).length} prompt files written.`);
