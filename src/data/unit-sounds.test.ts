import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import soundManifest from "../../public/sounds/manifest.json";
import { coreUnitDefinitions } from "./factions/units";
import { COMMANDER_SLUGS } from "./commanders";
import { commanderSoundKey, commanderVoiceId, unitAttackFlourish, unitSoundKey, type UnitSoundAction } from "./unit-sounds";

const soundLibrary = soundManifest as Record<string, { src?: string; sequence?: string[] }>;
const roster = Object.values(coreUnitDefinitions);
const coreActions: UnitSoundAction[] = ["attack", "defend", "hurt", "death", "move"];

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
  if (entry?.sequence?.length) {
    return entry.sequence.flatMap((member) => clipSrcs(member));
  }
  return entry?.src ? [entry.src] : [];
}

describe("unit combat voices", () => {
  it("knows the full roster", () => {
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
          const file = fileURLToPath(new URL(`../../public${src}`, import.meta.url));
          if (!existsSync(file)) {
            lost.add(src);
          }
        }
      }
    }
    expect([...lost]).toEqual([]);
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
      const file = fileURLToPath(new URL(`../../public${src}`, import.meta.url));
      expect(existsSync(file), `${src} should exist on disk`).toBe(true);
    }
  });

  it("stays silent for unknown units", () => {
    expect(unitSoundKey("castle.unknown", "attack")).toBeUndefined();
  });

  it("gives every WOG commander a voice for every action, resolving to a real clip on disk", () => {
    const missing: string[] = [];
    for (const slug of COMMANDER_SLUGS) {
      for (const action of coreActions) {
        const key = commanderSoundKey(slug, action);
        const srcs = clipSrcs(key);
        if (!key || srcs.length === 0) {
          missing.push(`${slug}: ${action}`);
          continue;
        }
        for (const src of srcs) {
          const file = fileURLToPath(new URL(`../../public${src}`, import.meta.url));
          if (!existsSync(file)) {
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
});
