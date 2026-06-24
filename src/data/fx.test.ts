import { describe, expect, it } from "vitest";
import {
  abilityFxPlans,
  cardShotFxPlans,
  healFxPlans,
  MAX_PRESENTATION_MS,
  MAX_PROJECTILE_FLIGHT_MS,
  SINGLE_FRAME_FLASH_MS,
  soundDurationMs,
  spellFxPlans,
  spellPresentationMs,
  spriteDurationMs,
  warMachineFxPlans,
  type SpellFxPlan
} from "./fx";
import { cardLibrary } from "./cards/library";
import { WAR_MACHINE_CARD_IDS } from "./cards/permanents";

describe("soundDurationMs", () => {
  it("reads measured MP3 lengths from the durations manifest", () => {
    // These come from public/sounds/durations.json (measured frame-by-frame).
    expect(soundDurationMs("spells/fireball-hit")).toBeGreaterThan(800);
    expect(soundDurationMs("spells/cure")).toBeGreaterThan(800);
  });

  it("is 0 for an unknown or missing key", () => {
    expect(soundDurationMs(undefined)).toBe(0);
    expect(soundDurationMs("spells/does-not-exist")).toBe(0);
  });
});

describe("spriteDurationMs", () => {
  it("derives duration from the sheet's frame count and fps", () => {
    // fireball: 13 frames at 15 fps ≈ 867ms.
    expect(spriteDurationMs("fireball")).toBe(Math.round((13 / 15) * 1000));
  });

  it("flashes a single-frame still for a fixed window", () => {
    // lightning-bolt is one tall frame; runSprite fades it instead of ticking.
    expect(spriteDurationMs("lightning-bolt")).toBe(SINGLE_FRAME_FLASH_MS);
  });

  it("is 0 for an unknown sprite", () => {
    expect(spriteDurationMs(undefined)).toBe(0);
    expect(spriteDurationMs("not-a-sheet")).toBe(0);
  });
});

/** Every sprite key a plan will draw on the table. */
function spritesOf(plan: SpellFxPlan): string[] {
  return [plan.projectile, plan.hit, ...(plan.affect ?? []).map((a) => a.key)].filter(
    (key): key is string => Boolean(key)
  );
}

/** The sound the plan actually plays, matching queueBoardFx's selection. */
function playedSound(plan: SpellFxPlan): string | undefined {
  if (plan.projectile) {
    return plan.hitSound ?? plan.sound; // cast at launch + hit at impact; hit is the later one
  }
  if (plan.hit) {
    return plan.hitSound ?? plan.sound;
  }
  return plan.sound; // affect / tint
}

describe("spellPresentationMs", () => {
  it("covers both the sprite and the sound for a bare hit spell (Fireball)", () => {
    const plan = spellFxPlans["spell.fireball"];
    const expected = Math.max(spriteDurationMs("fireball"), soundDurationMs("spells/fireball-hit"));
    expect(spellPresentationMs(plan)).toBe(expected);
    // Long enough that the explosion AND its boom finish before the damage shows
    // (the old hard-coded gate of 850ms cut the sound off).
    expect(spellPresentationMs(plan)).toBeGreaterThan(850);
  });

  it("waits out the flight, the hit sprite and the impact sound for a projectile (Magic Arrow)", () => {
    const plan = spellFxPlans["spell.magic_arrow"];
    expect(spellPresentationMs(plan)).toBeGreaterThanOrEqual(
      MAX_PROJECTILE_FLIGHT_MS + spriteDurationMs("magic-arrow-hit")
    );
  });

  it("waits out the longer of the bolt-flash and the crackle/sound (Lightning Bolt)", () => {
    const plan = spellFxPlans["spell.lightning_bolt"];
    // crackle is offset 220ms and runs 800ms; the sound is longer still.
    expect(spellPresentationMs(plan)).toBeGreaterThanOrEqual(soundDurationMs("spells/lightning-bolt"));
    expect(spellPresentationMs(plan)).toBeGreaterThan(950); // beats the old hard-coded affect gate
  });

  it("is 0 for a missing plan", () => {
    expect(spellPresentationMs(undefined)).toBe(0);
  });

  it("never exceeds the safety bound", () => {
    for (const plan of Object.values(spellFxPlans)) {
      expect(spellPresentationMs(plan)).toBeLessThanOrEqual(MAX_PRESENTATION_MS);
    }
  });

  it("always outlasts every sprite AND the sound the plan plays", () => {
    // This is the gate's contract: the damage / heal / death queued right after
    // the presentation can never land before any part of it has been seen/heard.
    const plans = [
      ...Object.values(spellFxPlans),
      ...Object.values(abilityFxPlans),
      ...Object.values(healFxPlans),
      ...Object.values(cardShotFxPlans)
    ];
    for (const plan of plans) {
      const gate = spellPresentationMs(plan);
      for (const sprite of spritesOf(plan)) {
        expect(gate).toBeGreaterThanOrEqual(spriteDurationMs(sprite));
      }
      expect(gate).toBeGreaterThanOrEqual(soundDurationMs(playedSound(plan)));
    }
  });

  it("gives every damage/heal-bearing spell a non-zero gate", () => {
    // Buff/curse-only plans still animate, but the ones that can change a unit's
    // health must hold their result back behind a real presentation.
    for (const id of ["spell.fireball", "spell.magic_arrow", "spell.lightning_bolt", "spell.cure"]) {
      expect(spellPresentationMs(spellFxPlans[id])).toBeGreaterThan(0);
    }
  });
});

describe("healFxPlans", () => {
  it("gives the First Aid Tent a sprite + sound (it heals outside the spell flow)", () => {
    const plan = healFxPlans["war_machine.first_aid_tent"];
    expect(plan).toBeTruthy();
    expect(spellPresentationMs(plan)).toBeGreaterThan(0);
    expect(plan.affect?.length).toBeGreaterThan(0);
    expect(plan.sound).toBeTruthy();
  });

  it("does not re-animate the Cure spell (which already animates as a cast)", () => {
    expect(healFxPlans["spell.cure"]).toBeUndefined();
  });
});

describe("paralysis abilities animate (the freeze glyph + sound)", () => {
  // The table draws abilityFxPlans[event.abilityId] when a unit ability fires.
  // Every paralysis ability whose id is logged ONLY on the actual paralysis (a
  // single event) must answer with the paralyze sprite + sound, or the token
  // lands in silence — the user's Azure Dragon complaint. The extra-die variants
  // are excluded on purpose (they reuse the id for a "rolls X" announce).
  it.each([
    "azure-dragon-paralysis",
    "fortress-basilisk-paralysis",
    "medusa-paralyze-retaliation",
    "bank-medusa-paralyze-stacked"
  ])("wires %s with the paralyze freeze glyph + sound", (abilityId) => {
    const plan = abilityFxPlans[abilityId];
    expect(plan, `${abilityId} needs an ability FX plan`).toBeTruthy();
    expect(plan.affect?.[0]?.key).toBe("paralyze");
    expect(spriteDurationMs(plan.affect?.[0]?.key)).toBeGreaterThan(0);
    expect(plan.sound).toBe("spells/paralyze");
    expect(soundDurationMs(plan.sound)).toBeGreaterThan(0);
    expect(spellPresentationMs(plan)).toBeGreaterThan(0);
  });

  it("does not key the extra-die paralysis variants (they share their id with a roll announce)", () => {
    // basilisk-paralysis (extra roll) and medusa-paralyze-retaliation-die emit a
    // "rolls X" event under the same id, so a plan there would flash the freeze
    // before any paralysis lands. Left unwired until the engine splits that id.
    expect(abilityFxPlans["basilisk-paralysis"]).toBeUndefined();
    expect(abilityFxPlans["medusa-paralyze-retaliation-die"]).toBeUndefined();
  });
});

describe("previously-silent monster abilities now carry a cue", () => {
  // Each id below is emitted by the engine as a UNIT_ABILITY_TRIGGERED carrying
  // that exact ability id (verified at the emit sites: heal.abilityId for Life
  // Drain, followUp.abilityId for the Death Stare, a literal id for the Dispel),
  // so an abilityFxPlans entry actually fires — NOT a decorative no-op. The cue
  // dies if the plan is removed.
  it.each([
    ["vampire-heal-on-attack", "cure", "effects/drain-life"],
    ["bank-vampire-life-drain", "cure", "effects/drain-life"],
    ["fortress-gorgon-death-stare", "death-stare", "spells/death-stare"],
    ["dragon-fly-dispel", "dispel", "spells/dispel"]
  ])("%s plays the %s sprite + sound", (abilityId, sheetKey, sound) => {
    const plan = abilityFxPlans[abilityId];
    expect(plan, `${abilityId} needs an ability FX plan`).toBeTruthy();
    expect(plan.affect?.[0]?.key).toBe(sheetKey);
    expect(spriteDurationMs(plan.affect?.[0]?.key)).toBeGreaterThan(0);
    expect(plan.sound).toBe(sound);
    expect(soundDurationMs(plan.sound)).toBeGreaterThan(0);
    expect(spellPresentationMs(plan)).toBeGreaterThan(0);
  });

  it("the Fortress Gorgon Death Stare matches its neutral sibling (parity)", () => {
    expect(abilityFxPlans["fortress-gorgon-death-stare"]).toEqual(abilityFxPlans["gorgon-death-stare"]);
  });
});

describe("Faerie Dragon Ice Bolt animates as a flying cast (presented before the move)", () => {
  it("flies an Ice Bolt projectile from the dragon to the target, then bursts", () => {
    // The FX builder presents this cast as a PROJECTILE preamble before the
    // dragon glides (page.tsx). So the plan must carry a real projectile + hit +
    // sounds, or the cast would be silent / have nothing to lead the move with.
    const plan = abilityFxPlans["faerie-dragon-spell"];
    expect(plan, "faerie-dragon-spell needs an ability FX plan").toBeTruthy();
    expect(plan.projectile).toBe("ice-bolt-projectile-0");
    expect(spriteDurationMs(plan.projectile)).toBeGreaterThan(0);
    expect(plan.hit).toBe("ice-bolt-hit");
    expect(spriteDurationMs(plan.hit)).toBeGreaterThan(0);
    expect(plan.sound).toBe("spells/ice-bolt");
    expect(soundDurationMs(plan.sound)).toBeGreaterThan(0);
    // A real, non-zero gate: the preamble shifts the move + dice by this much, so
    // a zero here would let the dragon glide on top of its own cast.
    expect(spellPresentationMs(plan)).toBeGreaterThan(0);
  });
});

describe("war-machine ABILITY cards carry their own shot / heal cue", () => {
  it("the First Aid ability card heals with the Cure shimmer + chime (like the Tent)", () => {
    // Its basic side removes 1 damage; the heal logs DAMAGE_HEALED with the card
    // as the source, so healFxPlans answers it the same way the Tent's heal is.
    const plan = healFxPlans["ability.first_aid"];
    expect(plan, "First Aid ability card needs a heal FX plan").toBeTruthy();
    expect(plan.affect?.[0]?.key).toBe("cure");
    expect(spriteDurationMs(plan.affect?.[0]?.key)).toBeGreaterThan(0);
    expect(plan.sound).toBe("spells/cure");
    expect(soundDurationMs(plan.sound)).toBeGreaterThan(0);
    expect(spellPresentationMs(plan)).toBeGreaterThan(0);
  });

  it("the Artillery ability card fires a real Ballista shot", () => {
    // Its basic side damages the lowest-initiative enemy; the shot rides the
    // DAMAGE_ASSIGNED (source = the card) with the H3 Ballista report, just
    // before the struck unit's hurt cry — a real measured clip, with a gate so
    // the hit waits for the report.
    const plan = cardShotFxPlans["ability.artillery"];
    expect(plan, "Artillery ability card needs a shot FX plan").toBeTruthy();
    expect(plan.sound).toBe("units/ballista-shoot");
    expect(soundDurationMs(plan.sound)).toBeGreaterThan(0);
    expect(spellPresentationMs(plan)).toBeGreaterThan(0);
  });
});

describe("warMachineFxPlans", () => {
  // A war machine "fires" when its card has a round-start effect (the Ballista's
  // auto-shot, the Catapult's splash, the Cannon's expert shot). Those emit a
  // WAR_MACHINE_TRIGGERED the table answers with a shot sound. The First Aid
  // Tent (it heals — see healFxPlans) and the Ammo Cart (a passive ranged buff)
  // have no round-start shot, so they correctly carry no shot plan.
  const firingMachines = WAR_MACHINE_CARD_IDS.filter(
    (cardId) => cardLibrary[cardId]?.permanentEffect?.roundStart
  );

  it("covers exactly the three firing war machines (Ballista, Catapult, Cannon)", () => {
    expect([...firingMachines].sort()).toEqual(
      ["war_machine.ballista", "war_machine.cannon", "war_machine.catapult"].sort()
    );
  });

  it.each(firingMachines)("gives %s a real shot sound with a non-zero gate", (cardId) => {
    const plan = warMachineFxPlans[cardId];
    expect(plan, `${cardId} fires a shot but has no FX plan`).toBeTruthy();
    expect(plan.sound, `${cardId} needs a shot sound`).toBeTruthy();
    // The clip is a real converted sound (measured length on disk, in durations.json).
    expect(soundDurationMs(plan.sound)).toBeGreaterThan(0);
    // The presentation gate is real, so the struck unit's hurt cry + damage
    // number wait until the shot has been heard.
    expect(spellPresentationMs(plan)).toBeGreaterThan(0);
  });

  it("does not give the First Aid Tent or Ammo Cart a shot plan (they do not fire)", () => {
    expect(warMachineFxPlans["war_machine.first_aid_tent"]).toBeUndefined();
    expect(warMachineFxPlans["war_machine.ammo_cart"]).toBeUndefined();
  });

  it("references only real war machine cards", () => {
    for (const cardId of Object.keys(warMachineFxPlans)) {
      expect(WAR_MACHINE_CARD_IDS).toContain(cardId);
    }
  });
});

describe("previously-silent spells are wired (SFX + animation)", () => {
  // Each of these shipped with a converted sprite sheet and/or a measured sound
  // that no plan ever referenced, so the card resolved silently with no effect
  // on screen. These assertions fail if a plan — or its sound/sprite — is
  // dropped again, so the wiring cannot quietly regress to decorative.
  const SPRITE_AND_SOUND: Record<string, { sprite?: string; hit?: string; sound: string }> = {
    "spell.chain_lightning": { sprite: "lightning-bolt", sound: "spells/chain-lightning" },
    "spell.inferno": { hit: "inferno", sound: "spells/inferno" },
    "spell.blind": { sprite: "paralyze", sound: "spells/blind" },
    "spell.weakness": { sprite: "weakness", sound: "spells/weakness" },
    "spell.anti_magic": { sprite: "anti-magic", sound: "spells/anti-magic" },
    "spell.fire_shield": { sprite: "fire-shield", sound: "spells/fire-shield" },
    "spell.counterstrike": { sprite: "counterstrike", sound: "spells/counterstrike" },
    "spell.forgetfulness": { sprite: "forgetfulness", sound: "spells/forgetfulness" },
    "spell.mirth": { sprite: "mirth", sound: "spells/mirth" },
    "spell.sorrow": { sprite: "sorrow", sound: "spells/sorrow" },
    "spell.slayer": { sprite: "slayer", sound: "spells/slayer" },
    "spell.magic_mirror": { sprite: "magic-mirror", sound: "spells/magic-mirror" },
    // Berserk seizes a unit with the H3 berserk glyph + roar over it.
    "spell.berserk": { sprite: "berserk", sound: "spells/berserk" },
    // Tower-expansion / stretch-goal defensive spells: each ships a converted
    // sprite sheet + measured sound that the plan must keep referencing.
    "spell.shield": { sprite: "shield", sound: "spells/shield" },
    "spell.air_shield": { sprite: "air-shield", sound: "spells/air-shield" },
    "spell.protection_from_air": { sprite: "protect-air", sound: "spells/protect-air" },
    "spell.protection_from_earth": { sprite: "protect-earth", sound: "spells/protect-earth" },
    "spell.protection_from_fire": { sprite: "protect-fire", sound: "spells/protect-fire" },
    "spell.protection_from_water": { sprite: "protect-water", sound: "spells/protect-water" }
  };

  it.each(Object.entries(SPRITE_AND_SOUND))("wires %s with a real sprite + sound", (id, expected) => {
    const plan = spellFxPlans[id];
    expect(plan, `${id} needs an FX plan`).toBeTruthy();
    // The sound is a real converted clip (non-zero measured duration on disk).
    expect(plan.sound).toBe(expected.sound);
    expect(soundDurationMs(plan.sound)).toBeGreaterThan(0);
    // The sprite/hit sheet exists in the manifest (non-zero on-screen time).
    if (expected.hit) {
      expect(plan.hit).toBe(expected.hit);
      expect(spriteDurationMs(plan.hit)).toBeGreaterThan(0);
    }
    if (expected.sprite) {
      expect(plan.affect?.[0]?.key).toBe(expected.sprite);
      expect(spriteDurationMs(plan.affect?.[0]?.key)).toBeGreaterThan(0);
    }
    // The presentation gate is real, so the damage/effect waits for the cue.
    expect(spellPresentationMs(plan)).toBeGreaterThan(0);
  });

  // Map spells resolve off the adventure map with no battle board, so they only
  // carry a cast sound (page.tsx plays it off the CARD_PLAYED cue).
  const MAP_SPELL_SOUNDS: Record<string, string> = {
    "spell.town_portal": "spells/teleport",
    "spell.dimension_door": "spells/teleport",
    "spell.fly": "spells/fly",
    "spell.water_walk": "spells/water-walk",
    "spell.visions": "spells/visions"
  };

  it.each(Object.entries(MAP_SPELL_SOUNDS))("gives the map spell %s a cast sound", (id, sound) => {
    const plan = spellFxPlans[id];
    expect(plan, `${id} needs an FX plan`).toBeTruthy();
    expect(plan.sound).toBe(sound);
    expect(soundDurationMs(plan.sound)).toBeGreaterThan(0);
    expect(spellPresentationMs(plan)).toBeGreaterThan(0);
  });

  // Teleport has no converted sprite sheet (the unit blinking to its new space is
  // the visual), so it carries only the H3 teleport cast sound. queueBoardFx
  // plays a sound-only plan directly over the target unit.
  it("gives Teleport a cast sound with no sprite (the relocation is the visual)", () => {
    const plan = spellFxPlans["spell.teleport"];
    expect(plan, "Teleport needs an FX plan").toBeTruthy();
    expect(plan.sound).toBe("spells/teleport");
    expect(soundDurationMs(plan.sound)).toBeGreaterThan(0);
    expect(plan.affect).toBeUndefined();
    expect(plan.hit).toBeUndefined();
    expect(plan.projectile).toBeUndefined();
    expect(spellPresentationMs(plan)).toBeGreaterThan(0);
  });
});

describe("area spells & specialties carry their correct SFX + animation", () => {
  it("Frost Ring rings its space with the frost-ring sprite and sound", () => {
    const plan = spellFxPlans["spell.frost_ring"];
    expect(plan, "Frost Ring needs an FX plan").toBeTruthy();
    // Space-target burst: the cell sprite is plan.hit, its impact sound plan.hitSound.
    expect(plan.hit).toBe("frost-ring");
    expect(spriteDurationMs(plan.hit)).toBeGreaterThan(0);
    expect(plan.hitSound).toBe("spells/frost-ring");
    expect(soundDurationMs(plan.hitSound)).toBeGreaterThan(0);
    expect(spellPresentationMs(plan)).toBeGreaterThan(0);
  });

  // The hero-specialty area blasts resolve through a card play (CARD_PLAYED),
  // which plays their `affect` sprite + cast `sound`. These fail if a plan, its
  // sprite or its sound is dropped, so the SFX cannot silently regress.
  const SPECIALTY_FX: [string, string, string][] = [
    ["specialty.deemer.1", "meteor-shower", "spells/meteor-shower"],
    ["specialty.deemer.6", "meteor-shower", "spells/meteor-shower"],
    ["specialty.xyron.1", "inferno", "spells/inferno"],
    ["specialty.xyron.4", "inferno", "spells/inferno"],
    ["specialty.xyron.6", "inferno", "spells/inferno"]
  ];

  it.each(SPECIALTY_FX)("wires %s with its sprite + cast sound", (id, sprite, sound) => {
    const plan = spellFxPlans[id];
    expect(plan, `${id} needs an FX plan`).toBeTruthy();
    expect(plan.affect?.[0]?.key).toBe(sprite);
    expect(spriteDurationMs(plan.affect?.[0]?.key)).toBeGreaterThan(0);
    expect(plan.sound).toBe(sound);
    expect(soundDurationMs(plan.sound)).toBeGreaterThan(0);
    expect(spellPresentationMs(plan)).toBeGreaterThan(0);
  });
});

describe("more spells wired with SFX + animation (no silent resolves)", () => {
  // Damage / debuff spells that animate over a board target with their converted
  // sprite sheet + measured sound. These had no FX plan and resolved silently.
  const SPRITE_SPELLS: Record<string, { sprite: string; sound: string }> = {
    "spell.implosion": { sprite: "implosion", sound: "spells/implosion" },
    "spell.disrupting_ray": { sprite: "disrupting-ray", sound: "spells/disrupting-ray" },
    "spell.frenzy": { sprite: "frenzy", sound: "spells/frenzy" }
  };

  it.each(Object.entries(SPRITE_SPELLS))("wires %s with a real sprite + sound", (id, expected) => {
    const plan = spellFxPlans[id];
    expect(plan, `${id} needs an FX plan`).toBeTruthy();
    expect(plan.affect?.[0]?.key).toBe(expected.sprite);
    expect(spriteDurationMs(plan.affect?.[0]?.key)).toBeGreaterThan(0);
    expect(plan.sound).toBe(expected.sound);
    expect(soundDurationMs(plan.sound)).toBeGreaterThan(0);
    expect(spellPresentationMs(plan)).toBeGreaterThan(0);
  });

  // Spells with no dedicated sprite (the board result is the visual) carry just
  // their measured cast sound — but a real, non-zero one with a real gate.
  const SOUND_ONLY_SPELLS: Record<string, string> = {
    "spell.earthquake": "spells/earthquake",
    "spell.sacrifice": "spells/sacrifice",
    "spell.remove_obstacle": "spells/remove-obstacle",
    "spell.view_air": "spells/view",
    "spell.view_earth": "spells/view"
  };

  it.each(Object.entries(SOUND_ONLY_SPELLS))("gives %s a real cast sound and gate", (id, sound) => {
    const plan = spellFxPlans[id];
    expect(plan, `${id} needs an FX plan`).toBeTruthy();
    expect(plan.sound).toBe(sound);
    expect(soundDurationMs(plan.sound)).toBeGreaterThan(0);
    expect(plan.affect).toBeUndefined();
    expect(plan.hit).toBeUndefined();
    expect(plan.projectile).toBeUndefined();
    expect(spellPresentationMs(plan)).toBeGreaterThan(0);
  });

  it("burns the attacker with the Fire Shield ability cue (distinct from the cast shimmer)", () => {
    // The spell's cast plays spells/fire-shield over the buffed unit; the BURN
    // (an adjacent attacker takes the shield's damage) fires a "fire-shield"
    // ability event the table animates with the dedicated fire-shield-hit impact.
    const cast = spellFxPlans["spell.fire_shield"];
    expect(cast.affect?.[0]?.key).toBe("fire-shield");
    expect(cast.sound).toBe("spells/fire-shield");

    const burn = abilityFxPlans["fire-shield"];
    expect(burn, "the Fire Shield burn needs an ability FX plan").toBeTruthy();
    expect(burn.affect?.[0]?.key).toBe("fire-shield");
    expect(spriteDurationMs(burn.affect?.[0]?.key)).toBeGreaterThan(0);
    expect(burn.sound).toBe("effects/fire-shield-hit");
    expect(soundDurationMs(burn.sound)).toBeGreaterThan(0);
    expect(spellPresentationMs(burn)).toBeGreaterThan(0);
  });
});

describe("Stronghold creature abilities carry their SFX + animation", () => {
  // These three abilities fire a UNIT_ABILITY_TRIGGERED in combat but had no FX
  // plan, so they resolved silently (a bare damage/buff number) despite their
  // sprite sheets + sounds being on disk. The assertions fail if a plan — or its
  // sprite/sound — is dropped again, so the wiring cannot regress to decorative.

  it("strikes Thunderbirds' Lightning with the bolt + thunderclap (like Lightning Bolt)", () => {
    const plan = abilityFxPlans["thunderbirds-lightning"];
    expect(plan, "Thunderbirds' Lightning Strike needs an ability FX plan").toBeTruthy();
    // Same bolt-flash + crackle pair the Lightning Bolt spell plays over the target.
    expect(plan.affect?.[0]?.key).toBe("lightning-bolt");
    expect(plan.affect?.[1]?.key).toBe("lightning-crackle");
    expect(spriteDurationMs(plan.affect?.[1]?.key)).toBeGreaterThan(0);
    expect(plan.sound).toBe("spells/lightning-bolt");
    expect(soundDurationMs(plan.sound)).toBeGreaterThan(0);
    // A real gate so the lightning's 1 damage waits for the thunderclap to land.
    expect(spellPresentationMs(plan)).toBeGreaterThan(0);
  });

  it.each(["ogres-attack-token-few", "ogres-attack-token-pack"])(
    "washes the Ogres' %s buff red with the Bloodlust cry",
    (abilityId) => {
      const plan = abilityFxPlans[abilityId];
      expect(plan, `${abilityId} needs an ability FX plan`).toBeTruthy();
      // The token IS a Bloodlust buff: the red battle-rage tint + bloodlust sound.
      expect(plan.tint).toBe("bloodlust");
      expect(plan.sound).toBe("spells/bloodlust");
      expect(soundDurationMs(plan.sound)).toBeGreaterThan(0);
      // Tints have no sprite; the gate is the held wash / the cry, never zero.
      expect(spellPresentationMs(plan)).toBeGreaterThan(0);
    }
  );

  it("splashes Behemoths' Corrosion with the acid burst (like Rust Dragon acid)", () => {
    const plan = abilityFxPlans["behemoth-corrosion"];
    expect(plan, "Behemoths' Corrosion needs an ability FX plan").toBeTruthy();
    expect(plan.hit).toBe("acid-breath");
    expect(spriteDurationMs(plan.hit)).toBeGreaterThan(0);
    expect(plan.hitSound).toBe("effects/acid-breath");
    expect(soundDurationMs(plan.hitSound)).toBeGreaterThan(0);
    expect(spellPresentationMs(plan)).toBeGreaterThan(0);
  });
});
