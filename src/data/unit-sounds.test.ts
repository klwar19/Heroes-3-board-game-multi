import { describe, expect, it } from "vitest";
import soundManifest from "../../public/sounds/manifest.json";
import { hasMediaFile } from "@/lib/media-manifest";
import { coreUnitDefinitions } from "./factions/units";
import { DOOM_UNIT_IDS } from "./doom";
import { COMMANDER_SLUGS } from "./commanders";
import { listAllBossDefinitions } from "./anime/bosses";
import { commanderSoundKey, commanderVoiceId, unitAttackFlourish, unitSoundKey, type UnitSoundAction } from "./unit-sounds";

const soundLibrary = soundManifest as Record<string, { src?: string; sequence?: string[]; random?: string[]; repeat?: number; sequenceDelayMs?: number }>;
const roster = Object.values(coreUnitDefinitions);
const coreActions: UnitSoundAction[] = ["attack", "defend", "hurt", "death", "move"];
const curatedAnimeTownVoices = [
  ["azure_breeze.outer_disciples", "azure-breeze-outer-disciples"],
  ["azure_breeze.inner_swordsmen", "azure-breeze-inner-swordsmen"],
  ["azure_breeze.spirit_crane", "azure-breeze-spirit-crane"],
  ["azure_breeze.sect_protectors", "azure-breeze-sect-protectors"],
  ["azure_breeze.true_inheritors", "azure-breeze-true-inheritors"],
  ["azure_breeze.core_master", "azure-breeze-core-master"],
  ["azure_breeze.mountain_guardian", "azure-breeze-mountain-guardian"],
  ["hidden_leaf.genin_squad", "hidden-leaf-genin-squad"],
  ["hidden_leaf.medical_nin", "hidden-leaf-medical-nin"],
  ["hidden_leaf.anbu", "hidden-leaf-anbu"],
  ["hidden_leaf.jonin", "hidden-leaf-jonin"],
  ["hidden_leaf.giant_toad", "hidden-leaf-giant-toad"],
  ["hidden_leaf.jinchuriki", "hidden-leaf-jinchuriki"],
  ["hidden_leaf.susanoo", "hidden-leaf-susanoo"],
  ["hidden_leaf.hokage_vanguard", "hidden-leaf-hokage-vanguard"],
  ["heavenly_demon.blood_disciples", "heavenly-demon-blood-disciples"],
  ["heavenly_demon.gu_witches", "heavenly-demon-gu-witches"],
  ["heavenly_demon.shadow_wraiths", "heavenly-demon-shadow-wraiths"],
  ["heavenly_demon.corpse_puppets", "heavenly-demon-corpse-puppets"],
  ["heavenly_demon.bone_reavers", "heavenly-demon-bone-reavers"],
  ["heavenly_demon.ghost_king", "heavenly-demon-ghost-king"],
  ["heavenly_demon.demon_avatar", "heavenly-demon-avatar"]
] as const;

/**
 * The concrete clip `src`s a manifest key resolves to: a plain clip is its own
 * `src`; a `sequence` (e.g. the Arch Devil teleport) expands to its members'
 * srcs in order. Returns [] when nothing resolves.
 */
function clipSrcs(key: string | undefined): string[] {
  if (!key) {
    return [];
  }
  const entry = soundLibrary[key];
  if (entry?.random?.length) {
    return entry.random.flatMap((member) => clipSrcs(member));
  }
  if (entry?.sequence?.length) {
    return entry.sequence.flatMap((member) => clipSrcs(member));
  }
  return entry?.src ? [entry.src] : [];
}

describe("unit combat voices", () => {
  it("voices the full roster, including Little Busters", () => {
    expect(roster.length).toBeGreaterThan(0);
    const voiceless = roster
      .filter((unit) => !unitSoundKey(unit.id, "attack"))
      .map((unit) => unit.id);
    expect(voiceless).toEqual([]);
  });

  it("resolves every combat action for every unit to a manifest entry", () => {
    const missing: string[] = [];
    for (const unit of roster) {
      const actions: UnitSoundAction[] =
        unit.type === "ranged" ? [...coreActions, "shoot"] : coreActions;
      for (const action of actions) {
        const key = unitSoundKey(unit.id, action);
        if (!key || clipSrcs(key).length === 0) {
          missing.push(`${unit.id}: ${action}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it("only resolves to clips that exist on disk", () => {
    const lost = new Set<string>();
    for (const unit of roster) {
      for (const action of [...coreActions, "shoot"] as UnitSoundAction[]) {
        const key = unitSoundKey(unit.id, action);
        for (const src of clipSrcs(key)) {
          if (!hasMediaFile(src)) {
            lost.add(src);
          }
        }
      }
    }
    expect([...lost]).toEqual([]);
  });

  it("uses complete dedicated action sets for both cultivation towns and Hidden Leaf", () => {
    for (const [unitId, voice] of curatedAnimeTownVoices) {
      const unit = coreUnitDefinitions[unitId];
      expect(unit, `${unitId} should be in the roster`).toBeTruthy();
      const actions: UnitSoundAction[] = unit.type === "ranged" ? [...coreActions, "shoot"] : coreActions;
      for (const action of actions) {
        const key = unitSoundKey(unitId, action);
        expect(key, `${unitId}: ${action}`).toBe(`units/${voice}-${action}`);
        expect(clipSrcs(key), `${key} should resolve to one file`).toEqual([`/sounds/${key}.mp3`]);
      }
    }
  });

  // The EXACT manifest key each of the 16 Doom neutrals' six actions must
  // resolve to — an independent restatement of the intended wiring. A truthy /
  // "resolves to some clip" check is not enough: a typo'd override key falls
  // through to the H3 voice the unit is mapped onto (Behemoth, Gog, …) and a
  // clip still plays, so the weaker check greenlights the bug. These exact-key
  // assertions ARE the mutation guard — they caught doom.demon attack/shoot
  // falling back to the Behemoth roar (override pointed at a nonexistent
  // "doom/demon-attack") and doom.cacodemon death to the Gog's (missing
  // "doom/dscacdth" manifest entry).
  const doomVoiceKeys: Record<string, Record<UnitSoundAction, string>> = {
    demon: { attack: "units/doom-demon-attack", shoot: "units/doom-demon-attack", defend: "doom/dsdmact", hurt: "doom/dsdmpain", death: "doom/dssgtdth", move: "units/doom-demon-move" },
    former_human: { attack: "doom/dspistol", shoot: "doom/dspistol", defend: "doom/dsposact", hurt: "doom/dspopain", death: "units/doom-former-human-death", move: "units/doom-former-human-move" },
    former_human_sergeant: { attack: "doom/dsshotgn", shoot: "doom/dsshotgn", defend: "doom/dsposact", hurt: "doom/dspopain", death: "units/doom-former-human-death", move: "units/doom-former-human-move" },
    imp: { attack: "units/doom-imp-attack", shoot: "units/doom-imp-attack", defend: "doom/dsbgact", hurt: "doom/dspopain", death: "units/doom-imp-death", move: "units/doom-imp-move" },
    lost_soul: { attack: "doom/dssklatk", shoot: "doom/dssklatk", defend: "doom/dsdmact", hurt: "doom/dsdmpain", death: "doom/dsfirxpl", move: "units/doom-lost-soul-move" },
    cacodemon: { attack: "units/doom-cacodemon-attack", shoot: "units/doom-cacodemon-attack", defend: "doom/dsdmact", hurt: "doom/dsdmpain", death: "doom/dscacdth", move: "units/doom-cacodemon-move" },
    hell_knight: { attack: "units/doom-hell-knight-attack", shoot: "units/doom-hell-knight-attack", defend: "doom/dsdmact", hurt: "doom/dsdmpain", death: "doom/dskntdth", move: "units/doom-hell-knight-move" },
    arachnotron: { attack: "units/doom-arachnotron-attack", shoot: "units/doom-arachnotron-attack", defend: "doom/dsbspact", hurt: "doom/dsdmpain", death: "doom/dsbspdth", move: "units/doom-arachnotron-move" },
    former_commando: { attack: "units/doom-machinegun-attack", shoot: "units/doom-machinegun-attack", defend: "doom/dsposact", hurt: "doom/dspopain", death: "units/doom-former-human-death", move: "units/doom-former-human-move" },
    baron_of_hell: { attack: "units/doom-baron-attack", shoot: "units/doom-baron-attack", defend: "doom/dsdmact", hurt: "doom/dsdmpain", death: "doom/dsbrsdth", move: "units/doom-baron-move" },
    revenant: { attack: "units/doom-revenant-attack", shoot: "units/doom-revenant-attack", defend: "doom/dsskeact", hurt: "doom/dspopain", death: "doom/dsskedth", move: "units/doom-revenant-move" },
    mancubus: { attack: "units/doom-mancubus-attack", shoot: "units/doom-mancubus-attack", defend: "doom/dsposact", hurt: "doom/dsmnpain", death: "doom/dsmandth", move: "units/doom-mancubus-move" },
    pain_elemental: { attack: "doom/dssklatk", shoot: "doom/dssklatk", defend: "doom/dsdmact", hurt: "doom/dspepain", death: "doom/dspedth", move: "units/doom-pain-elemental-move" },
    arch_vile: { attack: "units/doom-arch-vile-attack", shoot: "units/doom-arch-vile-attack", defend: "doom/dsvilact", hurt: "doom/dsvipain", death: "doom/dsvildth", move: "units/doom-arch-vile-move" },
    spider_mastermind: { attack: "units/doom-machinegun-attack", shoot: "units/doom-machinegun-attack", defend: "doom/dsdmact", hurt: "doom/dsdmpain", death: "doom/dsspidth", move: "units/doom-spider-mastermind-move" },
    cyberdemon: { attack: "units/doom-cyberdemon-attack", shoot: "units/doom-cyberdemon-attack", defend: "doom/dsdmact", hurt: "doom/dsdmpain", death: "doom/dscybdth", move: "units/doom-cyberdemon-move" }
  };

  it("maps every Doom neutral action to its EXACT intended clip (no H3 fallback)", () => {
    const doomActions: UnitSoundAction[] = ["attack", "shoot", "defend", "hurt", "death", "move"];
    for (const unitId of DOOM_UNIT_IDS) {
      const bareName = unitId.split(".")[1];
      const expected = doomVoiceKeys[bareName];
      expect(expected, `${unitId} missing from the expected-key table`).toBeTruthy();
      for (const action of doomActions) {
        const key = unitSoundKey(unitId, action);
        expect(key, `${unitId}: ${action}`).toBe(expected[action]);
        // …and that key resolves to real clips that exist on disk (fails if the
        // manifest entry or the underlying .wav is removed — effect, not artifact).
        const srcs = clipSrcs(key);
        expect(srcs, `${unitId}: ${action} -> ${key} should resolve to real clips`).not.toEqual([]);
        for (const src of srcs) {
          expect(hasMediaFile(src), `${unitId}: ${action} -> ${src} on disk`).toBe(true);
        }
      }
    }

    // Special source-lump behaviors pinned structurally.
    // The machine-gun burst is one shotgun lump replayed four times, shared by
    // the Heavy Weapon Dude and the Spider Mastermind's chaingun.
    expect(unitSoundKey("doom.former_commando", "attack")).toBe("units/doom-machinegun-attack");
    expect(unitSoundKey("doom.spider_mastermind", "shoot")).toBe("units/doom-machinegun-attack");
    expect(soundLibrary["units/doom-machinegun-attack"]).toMatchObject({
      src: "/sounds/doom/dsshotgn.mp3",
      repeat: 4
    });
    // Cyberdemon/Revenant rockets are a launch→explosion sequence.
    expect(soundLibrary["units/doom-cyberdemon-attack"]).toMatchObject({
      sequence: ["doom/dsrlaunc", "doom/dsbarexp"]
    });
    // Arachnotron move is a sight cue, then a delayed two-play walking loop.
    expect(soundLibrary["units/doom-arachnotron-move"]).toMatchObject({
      sequence: ["doom/dsbspsit", "doom/dsbspwlk-move"],
      sequenceDelayMs: 90
    });
    expect(soundLibrary["doom/dsbspwlk-move"]).toMatchObject({
      src: "/sounds/doom/dsbspwlk.mp3",
      repeat: 2
    });
    // The three zombie-soldier types share one random death-variant pool.
    expect(soundLibrary["units/doom-former-human-death"].random).toEqual([
      "doom/dspodth1",
      "doom/dspodth2",
      "doom/dspodth3"
    ]);
  });

  it("never lets a NON-Doom unit borrow a Doom clip (bare-name hijack guard)", () => {
    // The Doom overrides are spread into the SHARED moveSoundOverrides /
    // actionSoundOverrides maps keyed by BARE name. A future unit whose bare
    // name collides (e.g. some faction gaining an `imp` or `revenant`) would
    // silently pick up a Doom voice — the exact regression class this repo has
    // shipped before. No unit outside the doom.* namespace may resolve to a
    // Doom clip.
    const leaks: string[] = [];
    for (const unit of roster) {
      if (unit.id.startsWith("doom.")) {
        continue;
      }
      for (const action of [...coreActions, "shoot"] as UnitSoundAction[]) {
        const key = unitSoundKey(unit.id, action);
        if (key && (key.startsWith("units/doom-") || key.startsWith("doom/"))) {
          leaks.push(`${unit.id}: ${action} -> ${key}`);
        }
      }
    }
    expect(leaks).toEqual([]);
    // CONTROL: a real Doom unit DOES resolve to a Doom clip, so the guard is
    // asserting a live condition, not a vacuous one.
    expect(unitSoundKey("doom.imp", "attack")).toBe("units/doom-imp-attack");
  });
  it("uses the documented shared-audio pairings", () => {
    // The original game shares these creatures' files (docs/sound-mapping.md).
    expect(unitSoundKey("castle.marksmen", "shoot")).toBe("units/archer-shoot");
    expect(unitSoundKey("necropolis.zombies", "attack")).toBe("units/zombie-lord-attack");
    expect(unitSoundKey("rampart.elves", "shoot")).toBe("units/wood-elf-shoot");
    expect(unitSoundKey("rampart.dendroids", "death")).toBe("units/dendroid-soldier-death");
    // Neutral twins speak with the same voice as their faction unit.
    expect(unitSoundKey("neutral.marksmen", "shoot")).toBe("units/archer-shoot");
  });

  it("lets melee-voiced creatures cover a missing strike variant", () => {
    // Griffins have no ranged clip: a (hypothetical) shoot falls back to attack.
    expect(unitSoundKey("castle.griffins", "shoot")).toBe("units/griffin-attack");
  });

  it("plays the Arch Devil's teleport as its movement, EXT1 then EXT2 in order", () => {
    // The Arch Devil does not walk: its `move` is the teleport, not the generic
    // -move footstep loop.
    const key = unitSoundKey("inferno.arch_devils", "move");
    expect(key).toBe("units/arch-devil-teleport");
    expect(unitSoundKey("inferno.arch_devils", "move")).not.toBe("units/arch-devil-move");

    // The teleport is a strict sequence: vanish (EXT1) first, reappear (EXT2)
    // after it finishes — order matters.
    const entry = soundManifest["units/arch-devil-teleport" as keyof typeof soundManifest] as {
      sequence?: string[];
    };
    expect(entry.sequence).toEqual(["units/arch-devil-special", "units/arch-devil-special-2"]);

    // Both halves resolve to real clips on disk.
    expect(clipSrcs(key)).toEqual([
      "/sounds/units/arch-devil-special.mp3",
      "/sounds/units/arch-devil-special-2.mp3"
    ]);
    for (const src of clipSrcs(key)) {
      expect(hasMediaFile(src), `${src} should exist on disk`).toBe(true);
    }
  });

  it("stays silent for unknown units", () => {
    expect(unitSoundKey("castle.unknown", "attack")).toBeUndefined();
  });

  it("gives every WOG commander a voice for every action, resolving to a real clip on disk", () => {
    const missing: string[] = [];
    for (const slug of COMMANDER_SLUGS) {
      if (slug === "kyousuke_natsume") {
        continue;
      }
      for (const action of coreActions) {
        const key = commanderSoundKey(slug, action);
        const srcs = clipSrcs(key);
        if (!key || srcs.length === 0) {
          missing.push(`${slug}: ${action}`);
          continue;
        }
        for (const src of srcs) {
          if (!hasMediaFile(src)) {
            missing.push(`${slug}: ${action} -> ${src} (no file)`);
          }
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it("routes a `commander:<slug>` voice id through unitSoundKey", () => {
    expect(commanderVoiceId("paladin")).toBe("commander:paladin");
    expect(unitSoundKey(commanderVoiceId("paladin"), "attack")).toBe("units/swordsman-attack");
    expect(unitSoundKey("commander:soul_eater", "move")).toBe("units/zombie-lord-move");
  });

  it("voices every Imperium unit and gives the female Lion commander the Sea Witch set", () => {
    const expectedUnitVoices: Record<string, string> = {
      astra_militarum: "sharpshooter",
      apothecary: "zealot",
      space_marines: "crusader",
      rhino: "iron-golem",
      terminators: "crusader",
      dreadnought: "titan",
      titan: "titan"
    };
    for (const [slug, voice] of Object.entries(expectedUnitVoices)) {
      expect(unitSoundKey(`imperium.${slug}`, "attack")).toBe(`units/${voice}-attack`);
      expect(unitSoundKey(`imperium.${slug}`, "move")).toBe(`units/${voice}-move`);
    }
    for (const action of coreActions) {
      expect(commanderSoundKey("lion_el_jonson", action)).toBe(`units/sea-witch-${action}`);
    }
  });

  it("uses the bespoke Japanese voices for every Azur Lane shipgirl and Belfast", () => {
    // Nine shipgirls since the 2026-09-05 roster expansion (Ayanami + Akagi).
    for (const slug of [
      "laffey",
      "javelin",
      "honolulu",
      "unicorn",
      "yukikaze",
      "ayanami",
      "prinz_eugen",
      "i19",
      "akagi"
    ]) {
      expect(unitSoundKey(`azur_lane.${slug}`, "attack")).toBe(`azur-lane/voices/${slug}/attack`);
      expect(unitSoundKey(`azur_lane.${slug}`, "shoot")).toBe(`azur-lane/voices/${slug}/attack`);
      expect(unitSoundKey(`azur_lane.${slug}`, "defend")).toBe(`azur-lane/voices/${slug}/hurt`);
      expect(unitSoundKey(`azur_lane.${slug}`, "hurt")).toBe(`azur-lane/voices/${slug}/hurt`);
      expect(unitSoundKey(`azur_lane.${slug}`, "death")).toBe(`azur-lane/voices/${slug}/death`);
      expect(unitSoundKey(`azur_lane.${slug}`, "move")).toBe(`azur-lane/voices/${slug}/move`);
    }
    expect(commanderSoundKey("belfast", "attack")).toBe("azur-lane/voices/belfast/attack");
    expect(commanderSoundKey("belfast", "shoot")).toBe("azur-lane/voices/belfast/attack");
    expect(commanderSoundKey("belfast", "defend")).toBe("azur-lane/voices/belfast/hurt");
    expect(commanderSoundKey("belfast", "hurt")).toBe("azur-lane/voices/belfast/hurt");
    expect(commanderSoundKey("belfast", "death")).toBe("azur-lane/voices/belfast/death");
    expect(commanderSoundKey("belfast", "move")).toBe("azur-lane/voices/belfast/move");
  });

  it("uses curated Rune Factory women for all MGQ units, four spirits, and Sonya", () => {
    const slugs = [
      "spirit_sylph", "spirit_gnome", "spirit_undine", "spirit_salamander",
      "pochi", "shesta", "gigi", "kamuro_kitsu", "fleesia", "sofia", "miyabi", "eater",
      "hild", "chrome_frederica", "shizuku", "regina", "maiden", "seraphy", "lisa", "tama",
      "maya", "matis", "ooma", "jessie", "aria", "carmilla", "giga", "lucretia", "cupi",
      "sphinx", "lucifina_chan", "spider_princess", "emily"
    ];
    const actions: UnitSoundAction[] = ["attack", "shoot", "defend", "hurt", "death", "move"];
    const expectOggExists = (key: string | undefined, action: UnitSoundAction) => {
      expect(key).toBeTruthy();
      const srcs = clipSrcs(key);
      const sequenced = action === "attack" || action === "shoot" || action === "move";
      expect(srcs, `${key} source count`).toHaveLength(sequenced ? 2 : 1);
      expect(srcs[0], `${key} must lead with its female voice`).toMatch(/^\/sounds\/mgq\/rune-factory\//);
      if (sequenced) {
        expect(srcs[1], `${key} must put its effect after its voice`).toMatch(/^\/sounds\/mgq\/effects\//);
      }
      for (const src of srcs) {
        expect(hasMediaFile(src), `${src} file on disk`).toBe(true);
      }
    };

    for (const slug of slugs) {
      for (const action of actions) {
        const key = unitSoundKey(`mgq.${slug}`, action);
        expect(key).toBe(`mgq/voices/${slug}/${action}`);
        expectOggExists(key, action);
      }
    }
    for (const action of actions) {
      const key = commanderSoundKey("sonya", action);
      expect(key).toBe(`mgq/voices/sonya/${action}`);
      expectOggExists(key, action);
    }
  });

  it("uses randomized canonical Little Busters voices with post-voice attack effects", () => {
    const units: Record<string, string> = {
      haruka: "haruka",
      rins_cats: "rins_cats",
      disciplinary_committee: "kanata",
      masato: "masato",
      softball_club: "sasami_goons",
      saya: "saya",
      mio: "mio"
    };
    const heroes: Record<string, string> = {
      sasami_sasasegawa: "sasami",
      riki_naoe: "riki",
      rin_natsume: "rin",
      yuiko_kurugaya: "yuiko",
      kudryavka_noumi: "kud",
      komari_kamikita: "komari"
    };
    const actions = ["attack", "shoot", "defend", "hurt", "death", "move"] as UnitSoundAction[];

    for (const [unit, profile] of Object.entries(units)) {
      for (const action of actions) {
        expect(unitSoundKey(`little_busters.${unit}`, action)).toBe(`little-busters/voices/${profile}/${action}`);
      }
    }
    for (const [hero, profile] of Object.entries(heroes)) {
      for (const action of actions) {
        expect(unitSoundKey(hero, action)).toBe(`little-busters/voices/${profile}/${action}`);
      }
    }
    for (const action of actions) {
      expect(commanderSoundKey("kyousuke_natsume", action)).toBe(`little-busters/voices/kyousuke/${action}`);
    }

    for (const profile of [...Object.values(units), ...Object.values(heroes), "kyousuke"]) {
      for (const action of actions) {
        const key = `little-busters/voices/${profile}/${action}`;
        const variants = soundLibrary[key]?.random ?? [];
        expect(variants.length, key).toBeGreaterThanOrEqual(profile === "rins_cats" ? 3 : 1);
        expect(variants.length, key).toBeLessThanOrEqual(3);
        for (const variant of variants) {
          const entry = soundLibrary[variant];
          if (action === "attack" || action === "shoot") {
            const sequence = entry?.sequence ?? [];
            expect(sequence.length, `${variant} sequence`).toBe(profile === "rins_cats" ? 3 : 2);
            expect(soundLibrary[sequence[0]]?.src, `${variant} leads with voice`).toContain("/sounds/little-busters/source/");
            expect(soundLibrary[sequence.at(-1)!]?.src, `${variant} ends with effect`).toContain("/sounds/little-busters/effects/");
          } else if (profile === "rins_cats") {
            expect(entry?.sequence, `${variant} combines Rin and cat`).toHaveLength(2);
          } else {
            expect(entry?.src, `${variant} is a voice response`).toContain("/sounds/little-busters/source/");
          }
          for (const src of clipSrcs(variant)) {
            expect(hasMediaFile(src), `${src} file on disk`).toBe(true);
          }
        }
      }
    }

    const catAttackVariants = soundLibrary["little-busters/voices/rins_cats/attack"].random ?? [];
    expect(catAttackVariants).toHaveLength(3);
    const catMiddles = catAttackVariants.map((variant) => soundLibrary[soundLibrary[variant].sequence![1]].src);
    expect(catMiddles).toEqual([
      "/sounds/little-busters/effects/rin.ogg",
      "/sounds/little-busters/effects/rin2.ogg",
      "/sounds/little-busters/effects/rin3.ogg"
    ]);
  });

  it("uses Fate/unlimited codes audio for every Fuyuki Servant line", () => {
    const meleeSlugs = ["assassins", "riders", "lancers", "sabers", "berserkers"];
    const rangedSlugs = ["archers", "casters"];

    // The wiring's shoot handling depends on which lines are ranged: only a
    // ranged line ships a dedicated shoot clip; a melee line borrows its attack
    // clip. Pin that split against the actual town data so a type change (which
    // would make a melee line demand a missing shoot clip) fails HERE.
    for (const slug of meleeSlugs) {
      expect(coreUnitDefinitions[`fuyuki.${slug}`]?.type, `${slug} type`).not.toBe("ranged");
    }
    for (const slug of rangedSlugs) {
      expect(coreUnitDefinitions[`fuyuki.${slug}`]?.type, `${slug} type`).toBe("ranged");
    }

    // Every action resolves to the bespoke key AND that key resolves to a real
    // clip on disk (fails if the wiring, the manifest entry, or the file is
    // removed — the effect, not just the artifact).
    const expectResolvesToOgg = (key: string | undefined) => {
      const srcs = clipSrcs(key);
      expect(srcs, `${key} should resolve to one clip`).toEqual([`/sounds/${key}.ogg`]);
      expect(hasMediaFile(`/sounds/${key}.ogg`), `${key} file on disk`).toBe(true);
    };

    for (const slug of [...meleeSlugs, ...rangedSlugs]) {
      for (const action of coreActions) {
        const key = unitSoundKey(`fuyuki.${slug}`, action);
        expect(key).toBe(`fuyuki/voices/${slug}/${action}`);
        expectResolvesToOgg(key);
      }
    }
    for (const slug of meleeSlugs) {
      // A melee line has no shoot clip: a shoot-shaped event borrows its attack.
      const key = unitSoundKey(`fuyuki.${slug}`, "shoot");
      expect(key).toBe(`fuyuki/voices/${slug}/attack`);
      expectResolvesToOgg(key);
    }
    for (const slug of rangedSlugs) {
      const key = unitSoundKey(`fuyuki.${slug}`, "shoot");
      expect(key).toBe(`fuyuki/voices/${slug}/shoot`);
      expectResolvesToOgg(key);
    }
  });

  it("layers naval combat SFX under Azur Lane attacks", () => {
    for (const slug of ["laffey", "javelin", "honolulu", "yukikaze", "ayanami", "prinz_eugen"]) {
      expect(unitAttackFlourish(`azur_lane.${slug}`)).toBe("units/cannon-shoot");
    }
    expect(unitAttackFlourish("azur_lane.i19")).toBe("spells/scuttle-boat");
    // The two CARRIERS launch aircraft rather than firing a main battery.
    expect(unitAttackFlourish("azur_lane.unicorn")).toBe("units/ballista-shoot");
    expect(unitAttackFlourish("azur_lane.akagi")).toBe("units/ballista-shoot");
    expect(unitAttackFlourish(commanderVoiceId("belfast"))).toBe("units/cannon-shoot");
  });

  it("maps each faction commander to the user-specified creature voice(s)", () => {
    // Castle → Swordsman (not Crusader); Rampart → Monk (not Zealot).
    expect(commanderSoundKey("paladin", "attack")).toBe("units/swordsman-attack");
    expect(commanderSoundKey("paladin", "death")).toBe("units/swordsman-death");
    expect(commanderSoundKey("hierophant", "attack")).toBe("units/monk-attack");
    // Tower → "sorceress" (the Cove Sorceresses' Sea Witch voice).
    expect(commanderSoundKey("temple_guardian", "hurt")).toBe("units/sea-witch-hurt");
    // Inferno — move: Gargoyle; hurt/death/defend: Pixie; attack: Magi (Mage).
    expect(commanderSoundKey("succubus", "move")).toBe("units/stone-gargoyle-move");
    expect(commanderSoundKey("succubus", "hurt")).toBe("units/pixie-hurt");
    expect(commanderSoundKey("succubus", "death")).toBe("units/pixie-death");
    expect(commanderSoundKey("succubus", "defend")).toBe("units/pixie-defend");
    expect(commanderSoundKey("succubus", "attack")).toBe("units/mage-attack");
    // Dungeon → Minotaur; Stronghold → Ogre; Fortress → Gnoll (all actions).
    expect(commanderSoundKey("brute", "attack")).toBe("units/minotaur-attack");
    expect(commanderSoundKey("brute", "move")).toBe("units/minotaur-move");
    expect(commanderSoundKey("ogre_leader", "death")).toBe("units/ogre-death");
    expect(commanderSoundKey("shaman", "defend")).toBe("units/gnoll-defend");
    // Necropolis — move: Zombie; hurt/defend/death: Lich; attack: Lich melee
    // (the "attack" action must be lich-attack, NOT lich-shoot).
    expect(commanderSoundKey("soul_eater", "move")).toBe("units/zombie-lord-move");
    expect(commanderSoundKey("soul_eater", "hurt")).toBe("units/lich-hurt");
    expect(commanderSoundKey("soul_eater", "death")).toBe("units/lich-death");
    expect(commanderSoundKey("soul_eater", "attack")).toBe("units/lich-attack");
    // Conflux — hurt/death/defend: Pixie; move/attack: Inferno Efreet.
    expect(commanderSoundKey("astral_spirit", "death")).toBe("units/pixie-death");
    expect(commanderSoundKey("astral_spirit", "move")).toBe("units/efreet-move");
    expect(commanderSoundKey("astral_spirit", "attack")).toBe("units/efreet-attack");
    // Cove → the level-3 unit (Sea Dogs = Pirate); Factory → the Cove level-2
    // unit (Seamen = Crew Mate); Bulwark → the level-7 unit (Jotunns = Titan).
    expect(commanderSoundKey("corsair", "attack")).toBe("units/pirate-attack");
    expect(commanderSoundKey("factory", "attack")).toBe("units/crew-mate-attack");
    expect(commanderSoundKey("bulwark", "attack")).toBe("units/titan-attack");
    // Fuyuki Astral Regent uses the Mage set, not the Castle Swordsman set.
    expect(commanderSoundKey("ruler", "attack")).toBe("units/mage-attack");
    expect(commanderSoundKey("ruler", "move")).toBe("units/mage-move");
  });

  it("borrows the attack voice for a Sharpshooter-combo commander's shoot", () => {
    // Swordsman has no shoot clip → the commander's shoot falls back to attack.
    expect(commanderSoundKey("paladin", "shoot")).toBe("units/swordsman-attack");
    // A voice that does have a shoot clip uses it.
    expect(commanderSoundKey("hierophant", "shoot")).toBe("units/monk-shoot");
  });

  it("stays silent for an unknown commander slug", () => {
    expect(commanderSoundKey("nobody", "attack")).toBeUndefined();
    expect(unitSoundKey("commander:nobody", "attack")).toBeUndefined();
  });

  it("layers a magical strike flourish over the Magic Elemental's blow", () => {
    // The Magic Elemental is made of raw magic: its strike carries an extra
    // magic zap on top of its melee clip — on both the Conflux and Neutral
    // rosters (the same creature).
    for (const id of ["conflux.magic_elementals", "neutral.magic_elementals"]) {
      const key = unitAttackFlourish(id);
      expect(key, `${id} should carry a magical strike flourish`).toBeTruthy();
      // It must point at a real manifest clip, never a missing file.
      expect(soundLibrary[key!]?.src, `${key} should resolve to a real clip`).toBeTruthy();
    }
    // Ordinary melee creatures carry no flourish, and unknown ids are silent.
    expect(unitAttackFlourish("stronghold.behemoths")).toBeUndefined();
    expect(unitAttackFlourish(undefined)).toBeUndefined();
    // The Hell Steed is a NORMAL melee attacker now (no Magic Arrow), so its blow
    // no longer layers a magic-arrow zap over its voice.
    expect(unitAttackFlourish("wog.hell_steed")).toBeUndefined();
  });

  it("gives every Raid Boss / Dungeon warden a voice, resolving to real clips on disk", () => {
    // A boss combat unit's id is `boss.<id>` (makeRaidBossCombatUnit); before the
    // bossVoices map it fell through to silence. Sweep every shipped boss plus the
    // custom-boss fallback: each must resolve every core action to a clip that
    // exists on disk. Fails if a boss id is added without a voice, or a mapped
    // voice base loses its clip — the effect (audible boss), not the artifact.
    const bossIds = [...listAllBossDefinitions().map((b) => b.id), "custom_boss"];
    expect(bossIds.length).toBeGreaterThan(20);
    const missing: string[] = [];
    for (const id of bossIds) {
      for (const action of coreActions) {
        const key = unitSoundKey(`boss.${id}`, action);
        const srcs = clipSrcs(key);
        if (!key || srcs.length === 0) {
          missing.push(`${id}: ${action}`);
          continue;
        }
        for (const src of srcs) {
          if (!hasMediaFile(src)) {
            missing.push(`${id}: ${action} -> ${src} (no file)`);
          }
        }
      }
    }
    expect(missing).toEqual([]);
    // CONTROL: the calamity dragon speaks with the Black Dragon's voice, and an
    // unmapped boss id stays silent (so the map is doing the work, not a catch-all).
    expect(unitSoundKey("boss.calamity_dragon", "attack")).toBe("units/black-dragon-attack");
    expect(unitSoundKey("boss.not_a_boss", "attack")).toBeUndefined();
    // Two bosses carry real Naruto character voices (dedicated naruto-boss-*
    // bases), not a borrowed H3 creature — pin the mapping so a revert is caught.
    expect(unitSoundKey("boss.avatar_of_erebos", "attack")).toBe("units/naruto-boss-kaguya-attack");
    expect(unitSoundKey("boss.avatar_of_erebos", "death")).toBe("units/naruto-boss-kaguya-death");
    expect(unitSoundKey("boss.colossal_titan", "attack")).toBe("units/naruto-boss-gaara-attack");
    expect(unitSoundKey("boss.colossal_titan", "move")).toBe("units/naruto-boss-gaara-move");
  });
});
