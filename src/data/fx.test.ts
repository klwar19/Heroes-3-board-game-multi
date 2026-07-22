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
  unitShotFxPlan,
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

describe("Enterprise Lucky E voice", () => {
  it("plays Enterprise's Japanese ability line at every specialty level", () => {
    for (const level of [1, 4, 6]) {
      expect(spellFxPlans[`specialty.enterprise.${level}`]?.sound).toBe(
        "azur-lane/voices/enterprise/ability"
      );
    }
  });

  it("measures the Lucky E voice so its presentation gate is real (durations.json entry)", () => {
    // The clip is an .ogg (measure-sound-durations.mjs now parses Ogg Vorbis),
    // so it MUST have a measured length in durations.json — otherwise the gate
    // would floor to 0 and the sound could be cut off. A missing entry (e.g. a
    // regen that dropped ogg) fails here.
    expect(soundDurationMs("azur-lane/voices/enterprise/ability")).toBeGreaterThan(0);
    for (const level of [1, 4, 6]) {
      expect(spellPresentationMs(spellFxPlans[`specialty.enterprise.${level}`])).toBeGreaterThan(0);
    }
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
  // Every paralysis ability whose id is logged ONLY on the actual paralysis must
  // answer with the paralyze sprite + sound, or the token lands in silence.
  // Extra-die variants (basilisk-paralysis, medusa-paralyze-retaliation-die,
  // commander-paralyze) now use the Death-Stare id split: bare id on land,
  // `${id}-roll` on a miss — so they are safe to key here too.
  it.each([
    "azure-dragon-paralysis",
    "fortress-basilisk-paralysis",
    "basilisk-paralysis",
    "medusa-paralyze-retaliation",
    "medusa-paralyze-retaliation-die",
    "unicorn-paralyze-retaliation",
    "bank-medusa-paralyze-stacked",
    "commander-fearsome",
    "commander-paralyze"
  ])("wires %s with the paralyze freeze glyph + sound", (abilityId) => {
    const plan = abilityFxPlans[abilityId];
    expect(plan, `${abilityId} needs an ability FX plan`).toBeTruthy();
    expect(plan.affect?.[0]?.key).toBe("paralyze");
    expect(spriteDurationMs(plan.affect?.[0]?.key)).toBeGreaterThan(0);
    expect(plan.sound).toBe("spells/paralyze");
    expect(soundDurationMs(plan.sound)).toBeGreaterThan(0);
    expect(spellPresentationMs(plan)).toBeGreaterThan(0);
  });

  it("does not key the roll-announce ids (a missed gaze must not freeze)", () => {
    expect(abilityFxPlans["basilisk-paralysis-roll"]).toBeUndefined();
    expect(abilityFxPlans["medusa-paralyze-retaliation-die-roll"]).toBeUndefined();
    expect(abilityFxPlans["commander-paralyze-roll"]).toBeUndefined();
  });

  it("wards ignore-paralysis with the anti-magic shimmer + resist cue", () => {
    const plan = abilityFxPlans["ignore-paralysis"];
    expect(plan, "ignore-paralysis needs an ability FX plan").toBeTruthy();
    expect(plan.affect?.[0]?.key).toBe("anti-magic");
    expect(spriteDurationMs(plan.affect?.[0]?.key)).toBeGreaterThan(0);
    expect(plan.sound).toBe("effects/magic-resist");
    expect(soundDurationMs(plan.sound)).toBeGreaterThan(0);
  });
});

describe("previously-silent monster abilities now carry a cue", () => {
  // Each id below is emitted by the engine as a UNIT_ABILITY_TRIGGERED carrying
  // that exact ability id (verified at the emit sites: heal.abilityId for Life
  // Drain, followUp.abilityId for the Death Stare, a literal id for the Dispel),
  // so an abilityFxPlans entry actually fires — NOT a decorative no-op. The cue
  // dies if the plan is removed.
  it.each([
    ["fortress-gorgon-death-stare", "death-stare", "spells/death-stare"],
    ["dragon-fly-dispel", "dispel", "spells/dispel"],
    ["wraith-heal-1", "cure", "spells/cure"],
    ["wraith-heal-2", "cure", "spells/cure"],
    ["troll-heal-3", "cure", "spells/cure"]
  ])("%s plays the %s sprite + sound", (abilityId, sheetKey, sound) => {
    const plan = abilityFxPlans[abilityId];
    expect(plan, `${abilityId} needs an ability FX plan`).toBeTruthy();
    expect(plan.affect?.[0]?.key).toBe(sheetKey);
    expect(spriteDurationMs(plan.affect?.[0]?.key)).toBeGreaterThan(0);
    expect(plan.sound).toBe(sound);
    expect(soundDurationMs(plan.sound)).toBeGreaterThan(0);
    expect(spellPresentationMs(plan)).toBeGreaterThan(0);
  });

  it.each(["vampire-heal-on-attack", "bank-vampire-life-drain"])(
    "%s uses the supplied Vampire Life Drain frames, never the Cure animation",
    (abilityId) => {
      const plan = abilityFxPlans[abilityId];
      expect(plan.affect?.[0]?.key).toBe("vampire-life-drain");
      expect(plan.affect?.some((entry) => entry.key === "cure") ?? false).toBe(false);
      expect(spriteDurationMs(plan.affect?.[0]?.key)).toBeGreaterThan(0);
      expect(plan.sound).toBe("effects/drain-life");
      expect(soundDurationMs(plan.sound)).toBeGreaterThan(0);
      expect(spellPresentationMs(plan)).toBeGreaterThan(0);
    }
  );

  it("the Fortress Gorgon Death Stare matches its neutral sibling (parity)", () => {
    expect(abilityFxPlans["fortress-gorgon-death-stare"]).toEqual(abilityFxPlans["gorgon-death-stare"]);
  });
});

describe("WOG neutral ability cues (mirror reflect, armor block, death-stare proc split)", () => {
  it("wires the War Zealot's innate Magic Mirror reflect with the mirror sprite + sound", () => {
    // applyUnitMagicMirror fires UNIT_ABILITY_TRIGGERED("wog-war-zealot-mirror") on
    // the reflect, so the table answers with the same glass + cue the Magic Mirror
    // spell plays. The cue dies if this plan is dropped.
    const plan = abilityFxPlans["wog-war-zealot-mirror"];
    expect(plan, "wog-war-zealot-mirror needs an ability FX plan").toBeTruthy();
    expect(plan.affect?.[0]?.key).toBe("magic-mirror");
    expect(spriteDurationMs(plan.affect?.[0]?.key)).toBeGreaterThan(0);
    expect(plan.sound).toBe("spells/magic-mirror");
    expect(soundDurationMs(plan.sound)).toBeGreaterThan(0);
    expect(spellPresentationMs(plan)).toBeGreaterThan(0);
  });

  it("wires the Dracolich's Necrotic Armor block with the resistance (anti-magic) shimmer", () => {
    // The "-1" armor block fires UNIT_ABILITY_TRIGGERED("wog-dracolich-armor"); the
    // plan carries the spell-resistance shimmer, and page.tsx layers the unit's own
    // DEFEND cry under it (a per-unit voice a fixed library sound cannot express),
    // so the plan deliberately has no `sound`.
    const plan = abilityFxPlans["wog-dracolich-armor"];
    expect(plan, "wog-dracolich-armor needs an ability FX plan").toBeTruthy();
    expect(plan.affect?.[0]?.key).toBe("anti-magic");
    expect(spriteDurationMs(plan.affect?.[0]?.key)).toBeGreaterThan(0);
    expect(spellPresentationMs(plan)).toBeGreaterThan(0);
  });

  it("does NOT key the death-stare announce ids (a failed stare must not flash)", () => {
    // The engine emits "<id>-roll" on a FAILED stare; leaving it unmapped is what
    // keeps the death-stare animation/sound to actual procs (the Nightmare's stare).
    expect(abilityFxPlans["gorgon-death-stare-roll"]).toBeUndefined();
    expect(abilityFxPlans["fortress-gorgon-death-stare-roll"]).toBeUndefined();
  });

  it("wires the Dracolich's spread attack with the Lich Death Cloud burst (parity)", () => {
    // declareAbilityAttack fires UNIT_ABILITY_TRIGGERED("wog-dracolich-death-cloud")
    // before the spread strike, exactly like the Lich fires "lich-death-cloud", so
    // the table bursts the same death cloud + sound over the adjacent target.
    const plan = abilityFxPlans["wog-dracolich-death-cloud"];
    expect(plan, "wog-dracolich-death-cloud needs an ability FX plan").toBeTruthy();
    expect(plan.hit).toBe("death-cloud");
    expect(spriteDurationMs(plan.hit)).toBeGreaterThan(0);
    expect(plan.hitSound).toBe("spells/death-cloud");
    expect(soundDurationMs(plan.hitSound)).toBeGreaterThan(0);
    expect(spellPresentationMs(plan)).toBeGreaterThan(0);
    // Same burst as the base Lich's Death Cloud.
    expect(plan).toEqual(abilityFxPlans["lich-death-cloud"]);
  });
});

describe("unit ranged shots that ARE spell bolts", () => {
  it("flies the Santa Gremlin's Ice Bolt shot (projectile + burst + spell sounds)", () => {
    // The Santa Gremlin "attacks with Ice Bolt", so page.tsx flies the real ice-bolt
    // projectile + hit (with the Ice Bolt spell's launch/impact sounds) for its shot
    // instead of the generic arrow bolt. The cue dies if this plan is dropped.
    const plan = unitShotFxPlan("wog.santa_gremlin");
    expect(plan, "Santa Gremlin needs a shot FX plan").toBeTruthy();
    expect(plan!.projectile).toBe("ice-bolt-projectile-0");
    expect(spriteDurationMs(plan!.projectile)).toBeGreaterThan(0);
    expect(plan!.hit).toBe("ice-bolt-hit");
    expect(spriteDurationMs(plan!.hit)).toBeGreaterThan(0);
    expect(plan!.sound).toBe("spells/ice-bolt");
    expect(soundDurationMs(plan!.sound)).toBeGreaterThan(0);
    expect(plan!.hitSound).toBe("spells/ice-bolt-hit");
    expect(soundDurationMs(plan!.hitSound)).toBeGreaterThan(0);
    expect(spellPresentationMs(plan)).toBeGreaterThan(0);
  });

  it("gives an ordinary shooter no shot plan (it keeps the plain arrow bolt)", () => {
    expect(unitShotFxPlan("castle.marksmen")).toBeUndefined();
    expect(unitShotFxPlan(undefined)).toBeUndefined();
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
    ["specialty.xyron.6", "inferno", "spells/inferno"],
    // Septienna's Death Ripple sweep, Melodia's Fortune luck wash and Glacius's
    // Frost Ring (I/VI area damage) — each emits CARD_PLAYED (reducer.ts main play
    // AND reaction-play paths), so its centre-stage sprite + cast sound actually
    // fire. The cue dies if the plan, its sheet or its sound is dropped.
    ["specialty.septienna.1", "death-ripple", "spells/death-ripple"],
    ["specialty.septienna.4", "death-ripple", "spells/death-ripple"],
    ["specialty.septienna.6", "death-ripple", "spells/death-ripple"],
    ["specialty.melodia.1", "fortune", "spells/fortune"],
    ["specialty.melodia.4", "fortune", "spells/fortune"],
    ["specialty.melodia.6", "fortune", "spells/fortune"],
    ["specialty.glacius.1", "frost-ring", "spells/frost-ring"],
    ["specialty.glacius.6", "frost-ring", "spells/frost-ring"]
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

  // Glacius IV casts no ring (a card-economy instant) — it must stay FX-less so a
  // frost-ring sprite never flashes for it. Guards against an over-eager copy.
  it("does NOT give Glacius IV a frost-ring FX (it casts no ring)", () => {
    expect(spellFxPlans["specialty.glacius.4"]).toBeUndefined();
  });

  // Ash's Bloodlust has no sprite in the original game — the engine tinted the
  // unit red. Its specialty (I/IV/VI) carries the red battle-rage TINT + the
  // bloodlust cast roar; the CARD_PLAYED handler flashes it at centre stage.
  it.each(["specialty.ash.1", "specialty.ash.4", "specialty.ash.6"])(
    "wires %s with the bloodlust tint + cast sound (no sprite, like the spell)",
    (id) => {
      const plan = spellFxPlans[id];
      expect(plan, `${id} needs an FX plan`).toBeTruthy();
      expect(plan.tint).toBe("bloodlust");
      expect(plan.affect).toBeUndefined();
      expect(plan.sound).toBe("spells/bloodlust");
      expect(soundDurationMs(plan.sound)).toBeGreaterThan(0);
      // A real, non-zero presentation gate so the tint wash holds (TINT_HOLD_MS).
      expect(spellPresentationMs(plan)).toBeGreaterThan(0);
    }
  );
});

describe("more spells wired with SFX + animation (no silent resolves)", () => {
  // Damage / debuff spells that animate over a board target with their converted
  // sprite sheet + measured sound. These had no FX plan and resolved silently.
  const SPRITE_SPELLS: Record<string, { sprite: string; sound: string; projectile?: string }> = {
    "spell.implosion": { sprite: "implosion", sound: "spells/implosion" },
    // H3 pair: projectile then the ray shimmer over the unit whose Defense falls.
    "spell.disrupting_ray": {
      sprite: "disrupting-ray",
      sound: "spells/disrupting-ray",
      projectile: "disrupting-ray-projectile"
    },
    "spell.frenzy": { sprite: "frenzy", sound: "spells/frenzy" }
  };

  it.each(Object.entries(SPRITE_SPELLS))("wires %s with a real sprite + sound", (id, expected) => {
    const plan = spellFxPlans[id];
    expect(plan, `${id} needs an FX plan`).toBeTruthy();
    expect(plan.affect?.[0]?.key).toBe(expected.sprite);
    expect(spriteDurationMs(plan.affect?.[0]?.key)).toBeGreaterThan(0);
    if (expected.projectile) {
      expect(plan.projectile).toBe(expected.projectile);
      expect(spriteDurationMs(plan.projectile)).toBeGreaterThan(0);
    }
    expect(plan.sound).toBe(expected.sound);
    expect(soundDurationMs(plan.sound)).toBeGreaterThan(0);
    expect(spellPresentationMs(plan)).toBeGreaterThan(0);
  });

  // Spells with no dedicated sprite (the board result is the visual) carry just
  // their measured cast sound — but a real, non-zero one with a real gate.
  // Sacrifice is NOT here: it shares the Resurrection sheet (C01SPE0) and is
  // pinned in "resurrection family uses the Resurrection sheet".
  const SOUND_ONLY_SPELLS: Record<string, string> = {
    "spell.earthquake": "spells/earthquake",
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

describe("Factory expansion gold/cube abilities carry their SFX + animation", () => {
  // Each id is emitted by the engine as a UNIT_ABILITY_TRIGGERED under that exact
  // id (the couatl ward/fade/block, the Dreadnought per-target splash, the
  // Automaton place-cube + Detonate, the Sandworm Devour + Feeding Frenzy, and the
  // Bounty Hunter Preemptive Shot), so an abilityFxPlans entry actually fires — the
  // matching engine effects are proven in factory-gold-abilities.test.ts. The cue
  // dies if the plan, its sprite or its sound is dropped.
  const FACTORY_ABILITY_FX: [string, string, string][] = [
    ["couatl-invulnerability-few", "shield", "spells/shield"],
    ["couatl-invulnerability-pack", "shield", "spells/shield"],
    ["couatl-invulnerability", "shield", "spells/shield"],
    ["dreadnought-splash-1", "death-ripple", "units/dreadnought-shoot"],
    ["dreadnought-splash-2", "death-ripple", "units/dreadnought-shoot"],
    ["automaton-detonate-cubes", "fireball", "units/automaton-special"],
    ["automaton-detonate", "fireball", "units/automaton-special"],
    ["automaton-detonate-1", "fireball", "units/automaton-special"],
    ["sandworm-cube-gain", "vampire-life-drain", "units/sandworm-special"],
    ["sandworm-cube-attack", "frenzy", "spells/frenzy"],
    ["bounty-hunter-preemptive", "counterstrike", "units/gunslinger-special"]
  ];

  it.each(FACTORY_ABILITY_FX)("wires %s with its sprite + sound", (abilityId, sprite, sound) => {
    const plan = abilityFxPlans[abilityId];
    expect(plan, `${abilityId} needs an ability FX plan`).toBeTruthy();
    expect(plan.affect?.[0]?.key).toBe(sprite);
    expect(spriteDurationMs(plan.affect?.[0]?.key)).toBeGreaterThan(0);
    expect(plan.sound).toBe(sound);
    expect(soundDurationMs(plan.sound)).toBeGreaterThan(0);
    expect(spellPresentationMs(plan)).toBeGreaterThan(0);
  });

  it("gives the Automaton's cube-place a real sound-only cue (a mechanical whir, no sprite)", () => {
    const plan = abilityFxPlans["automaton-place-cube"];
    expect(plan, "automaton-place-cube needs an ability FX plan").toBeTruthy();
    expect(plan.sound).toBe("units/automaton-move");
    expect(soundDurationMs(plan.sound)).toBeGreaterThan(0);
    expect(plan.affect).toBeUndefined();
    expect(plan.hit).toBeUndefined();
    expect(spellPresentationMs(plan)).toBeGreaterThan(0);
  });
});

describe("resurrection family uses the Resurrection sheet (never Prayer)", () => {
  // The converted library has a dedicated Resurrection sheet (C01SPE0, shared
  // with Animate Dead / Sacrifice). An earlier mapping wrongly used the Prayer
  // column (C10SPW). Every resurrection-family cue must use the real sheet.
  it.each([
    ["resurrection", "spells/resurrection"],
    ["phoenix-rebirth", "spells/resurrection"],
    ["archangel-lethal-save", "spells/resurrection"]
  ] as const)("ability %s plays the resurrection sheet + %s", (abilityId, sound) => {
    const plan = abilityFxPlans[abilityId];
    expect(plan, `${abilityId} needs an ability FX plan`).toBeTruthy();
    expect(plan.affect?.[0]?.key).toBe("resurrection");
    expect(plan.affect?.[0]?.key).not.toBe("prayer");
    expect(spriteDurationMs(plan.affect?.[0]?.key)).toBeGreaterThan(0);
    expect(plan.sound).toBe(sound);
    expect(soundDurationMs(plan.sound)).toBeGreaterThan(0);
    expect(spellPresentationMs(plan)).toBeGreaterThan(0);
  });

  it.each([
    ["spell.resurrection", "spells/resurrection"],
    ["spell.animate_dead", "spells/animate-dead"],
    ["spell.sacrifice", "spells/sacrifice"]
  ] as const)("spell %s plays the resurrection sheet + %s", (spellId, sound) => {
    const plan = spellFxPlans[spellId];
    expect(plan, `${spellId} needs a spell FX plan`).toBeTruthy();
    expect(plan.affect?.[0]?.key).toBe("resurrection");
    expect(plan.affect?.[0]?.key).not.toBe("prayer");
    expect(spriteDurationMs(plan.affect?.[0]?.key)).toBeGreaterThan(0);
    expect(plan.sound).toBe(sound);
    expect(soundDurationMs(plan.sound)).toBeGreaterThan(0);
    expect(spellPresentationMs(plan)).toBeGreaterThan(0);
  });

  it("keeps the Prayer spell on the Prayer sheet (control — different effect)", () => {
    const plan = spellFxPlans["spell.prayer"];
    expect(plan.affect?.[0]?.key).toBe("prayer");
    expect(plan.sound).toBe("spells/prayer");
  });
});

describe("additional monster ability cues (SFX + animation)", () => {
  // Each id is emitted by the engine as a UNIT_ABILITY_TRIGGERED under that exact
  // id ONLY when the effect lands (misses use `${id}-roll` or `${id}-buff`). The
  // cue dies if the plan, its sprite or its sound is dropped.
  it.each([
    ["sorceress-weakness-few", "weakness", "spells/weakness"],
    ["sorceress-weakness-on-attack", "weakness", "spells/weakness"],
    ["bulwark-freezing-shot", "slow", "spells/slow"],
    ["behemoth-defense-crush-few", "disrupting-ray", "spells/disrupting-ray"],
    ["behemoth-defense-crush-pack", "disrupting-ray", "spells/disrupting-ray"],
    ["commander-defense-crush", "disrupting-ray", "spells/disrupting-ray"],
    ["manticore-ignore-defense", "disrupting-ray", "spells/disrupting-ray"],
    ["ghost-dragon-knockback", "fear", "effects/fear"],
    ["ghost-dragon-morale-drain", "age", "effects/age"],
    ["mechanics-repair-1", "cure", "spells/repair"],
    ["mechanics-repair-2", "cure", "spells/repair"],
    ["enchanter-heal-or-buff", "cure", "spells/cure"],
    ["commander-regeneration", "cure", "spells/cure"]
  ] as const)("%s plays the %s sprite + sound", (abilityId, sheetKey, sound) => {
    const plan = abilityFxPlans[abilityId];
    expect(plan, `${abilityId} needs an ability FX plan`).toBeTruthy();
    expect(plan.affect?.[0]?.key).toBe(sheetKey);
    expect(spriteDurationMs(plan.affect?.[0]?.key)).toBeGreaterThan(0);
    expect(plan.sound).toBe(sound);
    expect(soundDurationMs(plan.sound)).toBeGreaterThan(0);
    expect(spellPresentationMs(plan)).toBeGreaterThan(0);
  });

  it("does not key Nix damage-cap or Halfling Precise Shot (removed cues)", () => {
    expect(abilityFxPlans["nix-damage-cap"]).toBeUndefined();
    expect(abilityFxPlans["nix-damage-cap-neutral"]).toBeUndefined();
    expect(abilityFxPlans["halfling-precise-shot"]).toBeUndefined();
  });

  it("does not key roll-announce / buff-fallback ids (misses must stay silent)", () => {
    expect(abilityFxPlans["ghost-dragon-knockback-roll"]).toBeUndefined();
    expect(abilityFxPlans["thunderbirds-lightning-roll"]).toBeUndefined();
    expect(abilityFxPlans["wyvern-sting-roll"]).toBeUndefined();
    expect(abilityFxPlans["enchanter-heal-or-buff-buff"]).toBeUndefined();
    expect(abilityFxPlans["mechanics-repair-2-buff"]).toBeUndefined();
  });
});
