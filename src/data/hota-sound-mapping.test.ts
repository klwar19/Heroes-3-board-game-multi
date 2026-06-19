import { describe, expect, it } from "vitest";
// The converter exports its pure mapping helpers; importing it must not run any
// conversion (that is guarded behind a direct-execution check in the script).
import { destinationFor, loadReference } from "../../scripts/convert-h3-sounds.mjs";

const ref = loadReference();
const dest = (name: string) => destinationFor(name, ref);

/**
 * Proves the HotA (Horn of the Abyss) Cove & Factory sound names decode to the
 * right files. Identifications come from the VCMI HotA port
 * (vcmi-mods/horn-of-the-abyss): creature prefixes + action suffixes, dwelling
 * ambiences, and the two Factory ability sounds. If a reference row or the
 * AMBIENT entry backing any of these is removed, the matching case fails.
 */
describe("HotA sound name decoding", () => {
  it("decodes the two examples from the request", () => {
    expect(dest("AELMWNCE")).toBe("units/air-elemental-hurt"); // base game, sanity check
    expect(dest("ARMAATTK")).toBe("units/armadillo-attack"); // HotA Factory
  });

  it("maps every Cove creature prefix+action to a units/ clip", () => {
    const expected: Record<string, string> = {
      // Nymph / Oceanid (NIMP) — EXT1/EXT2 are move-start/move-end
      NIMPATTK: "units/nymph-attack",
      NIMPDFND: "units/nymph-defend",
      NIMPKILL: "units/nymph-death",
      NIMPMOVE: "units/nymph-move",
      NIMPWNCE: "units/nymph-hurt",
      NIMPEXT1: "units/nymph-special",
      NIMPEXT2: "units/nymph-special-2",
      // Crew Mate / Seaman (SAYL)
      SAYLATTK: "units/crew-mate-attack",
      SAYLWNCE: "units/crew-mate-hurt",
      // Pirate / Corsair / Sea Dog (PIRT)
      PIRTSHOT: "units/pirate-shoot",
      PIRTKILL: "units/pirate-death",
      // Stormbird / Ayssid (ASSI)
      ASSIMOVE: "units/stormbird-move",
      // Sea Witch / Sorceress (SORC)
      SORCSHOT: "units/sea-witch-shoot",
      // Nix / Nix Warrior (NIXX)
      NIXXKILL: "units/nix-death",
      // Sea Serpent / Haspid (ASPI)
      ASPIDFND: "units/sea-serpent-defend"
    };
    for (const [name, want] of Object.entries(expected)) {
      expect(dest(name), name).toBe(want);
    }
  });

  it("maps every Factory creature prefix+action to a units/ clip", () => {
    const expected: Record<string, string> = {
      // Mechanic / Engineer (MECH)
      MECHSHOT: "units/mechanic-shoot",
      // Armadillo / Bellwether Armadillo (ARMA)
      ARMADFND: "units/armadillo-defend",
      ARMAKILL: "units/armadillo-death",
      ARMAMOVE: "units/armadillo-move",
      ARMAWNCE: "units/armadillo-hurt",
      // Automaton / Sentinel Automaton (AUTO)
      AUTOSHOT: "units/automaton-shoot",
      // Sandworm / Olgoi-Khorkhoi / Larva (WORM) — EXT1/EXT2 burrow/surface
      WORMEXT1: "units/sandworm-special",
      WORMEXT2: "units/sandworm-special-2",
      // Gunslinger / Bounty Hunter (GUNS)
      GUNSWNCE: "units/gunslinger-hurt",
      // Couatl (COTL) vs. Crimson Couatl (CCOT) — distinct sound sets
      COTLATTK: "units/couatl-attack",
      CCOTATTK: "units/crimson-couatl-attack",
      // Dreadnought / Juggernaut (DRED)
      DREDKILL: "units/dreadnought-death",
      // Halfling Grenadier ranged sound (HALG); base Halfling reuses core HALF*
      HALGSHOT: "units/halfling-grenadier-shoot"
    };
    for (const [name, want] of Object.entries(expected)) {
      expect(dest(name), name).toBe(want);
    }
  });

  it("keeps the base-game Halfling reused by Factory's basic Halfling", () => {
    // Factory's tier-1 Halfling is core:halfling, so HALF* must stay the base
    // Halfling and never collide with the Grenadier's HALG* set.
    expect(dest("HALFATTK")).toBe("units/halfling-attack");
    expect(dest("HALFSHOT")).toBe("units/halfling-shoot");
  });

  it("files the two Factory ability sounds under spells/", () => {
    expect(dest("GRENEXPL")).toBe("spells/grenade");
    expect(dest("REPAIR")).toBe("spells/repair");
  });

  it("names the HotA dwelling ambiences", () => {
    const expected: Record<string, string> = {
      LOOPWTFL: "ambient/nymph-waterfall",
      LOOPMATR: "ambient/cove-shack",
      LOOPFRIG: "ambient/frigate",
      LOOPNIXF: "ambient/nix-fort",
      LOOPHASP: "ambient/maelstrom",
      LOOPSORC: "ambient/tower-of-the-seas",
      LOOPHALF: "ambient/halfling-adobe",
      LOOPGUNS: "ambient/watchtower",
      LOOPCOTL: "ambient/serpentarium",
      // Stormbird "Nest" reuses the base-game bird-nest ambience.
      LOOPBIRD: "ambient/birds"
    };
    for (const [name, want] of Object.entries(expected)) {
      expect(dest(name), name).toBe(want);
    }
  });

  it("still rejects unknown names instead of guessing", () => {
    expect(dest("ZZZZATTK")).toBeNull();
  });
});
