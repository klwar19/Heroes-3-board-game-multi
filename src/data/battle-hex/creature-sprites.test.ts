import { describe, expect, it } from "vitest";
import poseManifest from "../../../scripts/pose-sprite-manifest.json";
import {
  HEX_IDLE_FRAME_MS,
  SPRITE_GROUP,
  creatureGaitSound,
  creatureHasFidget,
  creatureIdleFrameMs,
  creatureShotClimaxFrame,
  creatureSpriteForSlug,
  hexMovePlan,
  spriteGroupFrames,
  unitCreatureSprite,
  warMachineShotLeadMs,
  warMachineSprite
} from "./creature-sprites";

/**
 * Hex Battlefield pace and war machine data (creature-anim-times.json): every
 * creature moves at its own PC walk time (H3 CRANIM "Walk Animation Time"),
 * VCMI's formulas at speed 1.25 — a walker 400·walk ms a hex, a flyer
 * 141·walk ms a hex, move frames 80·walk ms — and a war machine's shot
 * leaves on its CRANIM climax frame. Card-art tokens take the neutral 1.0.
 */
const walkPlan = (unit: { unitDefId?: string; variant?: "few" | "pack"; heroDefId?: string }, steps = 3, initiativeDelta = 0) =>
  hexMovePlan({ ...unit, initiativeDelta, steps, distance: steps, flying: false, teleport: false });

describe("hex move pace", () => {
  it("walks each creature at its PC walk time: a Zombie shambles, a Wolf Rider trots (CONTROL: a card token's 1.0)", () => {
    const zombie = walkPlan({ unitDefId: "necropolis.zombies", variant: "pack" }); // CRANIM 1.30
    const wolf = walkPlan({ unitDefId: "stronghold.wolf_raiders", variant: "few" }); // CRANIM 0.93
    const token = walkPlan({ unitDefId: "no.such_unit", variant: "few" });
    expect(token.legsMs).toBeCloseTo(3 * 400, 6);
    expect(zombie.legsMs).toBeCloseTo(3 * 400 * 1.3, 6);
    expect(wolf.legsMs).toBeCloseTo(3 * 400 * 0.93, 6);
    // The stride stretches with the pace: the move frames play at 80·walk ms.
    expect(token.walkFrameMs).toBeCloseTo(80, 6);
    expect(zombie.walkFrameMs).toBeCloseTo(80 * 1.3, 6);
  });

  it("paces a battlefield hero by its own figure (Komari over the Master Gremlin's walk, 0.75)", () => {
    expect(unitCreatureSprite({ heroDefId: "komari_kamikita" })?.slug).toBe("lb-komari");
    expect(walkPlan({ heroDefId: "komari_kamikita" }).legsMs).toBeCloseTo(3 * 400 * 0.75, 6);
  });

  it("glides a flyer at its flight pace, and Haste hurries every beat", () => {
    const flight = hexMovePlan({ unitDefId: "castle.archangels", variant: "pack", flyer: true, steps: 0, distance: 6, flying: true, teleport: false });
    // 250·speed / walk PC px a second over 44 px hexes: 6 · 44000 · 0.82 / 312.5 ms.
    expect(flight.legsMs).toBeCloseTo((6 * 44000 * 0.82) / 312.5, 6);
    const hasted = walkPlan({ unitDefId: "necropolis.zombies", variant: "pack" }, 3, 2);
    expect(hasted.legsMs).toBeCloseTo((3 * 400 * 1.3) / 1.36, 6);
    expect(hasted.walkFrameMs).toBeCloseTo((80 * 1.3) / 1.36, 6);
  });
});

describe("hex idle and footsteps", () => {
  it("slows a slight idle breath (Snow Elf) but keeps lively ones and unknown creatures at the PC's 10 fps", () => {
    expect(creatureIdleFrameMs(creatureSpriteForSlug("snow-elf"))).toBe(300);
    expect(creatureIdleFrameMs(creatureSpriteForSlug("fire-elemental"))).toBe(HEX_IDLE_FRAME_MS);
    expect(creatureIdleFrameMs(null)).toBe(HEX_IDLE_FRAME_MS);
  });

  it("never fidgets a rotoscoped figure whose mouse-over row copies its idle, and walks it on its donor's footsteps", () => {
    const rin = creatureSpriteForSlug("lb-rin");
    const pikeman = creatureSpriteForSlug("pikeman");
    expect(creatureHasFidget(rin)).toBe(false);
    expect(creatureHasFidget(pikeman)).toBe(true);
    expect(creatureGaitSound(rin)).toBe("units/satyr-move");
    expect(creatureGaitSound(pikeman)).toBeNull();
  });
});

describe("hex shots", () => {
  it("releases a rotoscoped shot on the repainted frame that traces its donor's climax frame", () => {
    // build-pose-guide carries a long shoot row as an evenly picked subset of
    // the donor's frames (first and last kept): the donor's frame NUMBER would
    // land past the throw (Komari 11 of 8 frames, Mio 9 of 9).
    const sprites = (poseManifest as { sprites: Record<string, { donor: string }> }).sprites;
    const checked: string[] = [];
    for (const [slug, { donor }] of Object.entries(sprites)) {
      const own = creatureSpriteForSlug(slug);
      const base = creatureSpriteForSlug(donor);
      const donorClimax = creatureShotClimaxFrame(base, SPRITE_GROUP.shootStraight);
      const frames = own ? spriteGroupFrames(own, SPRITE_GROUP.shootStraight) : 0;
      if (!own || !base || donorClimax === null || frames === 0) continue;
      const total = spriteGroupFrames(base, SPRITE_GROUP.shootStraight);
      const picked = Array.from({ length: frames }, (_, k) => (frames === 1 ? 0 : Math.round((k * (total - 1)) / (frames - 1))));
      const climax = creatureShotClimaxFrame(own, SPRITE_GROUP.shootStraight)!;
      expect(picked[climax], `${slug} releases at or after its donor's climax pose`).toBeGreaterThanOrEqual(donorClimax);
      if (climax > 0) expect(picked[climax - 1], `${slug} releases on the first frame past it`).toBeLessThan(donorClimax);
      checked.push(slug);
    }
    expect(checked).toEqual(expect.arrayContaining(["lb-komari", "lb-mio", "ba-aru", "forge-grunt"]));
  });
});

describe("hex war machines", () => {
  it("draws each machine card as its PC machine (card token when it has none)", () => {
    expect(warMachineSprite("war_machine.ballista")?.slug).toBe("war-ballista");
    expect(warMachineSprite("war_machine.cannon")?.slug).toBe("war-cannon");
    expect(warMachineSprite("war_machine.lightning_generator")?.slug).toBe("war-lightning-generator");
    expect(warMachineSprite("war_machine.no_such_machine")).toBeNull();
  });

  it("winds up to its CRANIM climax frame before the shot leaves", () => {
    // Ballista: climax frame 5 at 80 ms a frame; the HotA Cannon: climax 4 at attack time 0.5 (40 ms).
    expect(warMachineShotLeadMs("war_machine.ballista")).toBe(320);
    expect(warMachineShotLeadMs("war_machine.cannon")).toBe(120);
    // No firing row (the Ammo Cart) or no machine figure: the shot leaves at once.
    expect(warMachineShotLeadMs("war_machine.ammo_cart")).toBe(0);
    expect(warMachineShotLeadMs("war_machine.no_such_machine")).toBe(0);
  });
});
