import { afterEach, describe, expect, it } from "vitest";
import poseManifest from "../../../scripts/pose-sprite-manifest.json";
import { HEX_SPEED_DEFAULTS, setHexBattleSpeed } from "@/lib/hex-battle-speed";
import {
  HEX_IDLE_FRAME_MS,
  SPRITE_GROUP,
  creatureGaitSound,
  creatureHasFidget,
  creatureIdleFrameMs,
  creatureShootFrameMs,
  creatureShotClimaxFrame,
  creatureSpriteForSlug,
  hexActionBeatMs,
  hexActionFrameMs,
  hexCastReleaseMs,
  hexMovePlan,
  hexRangedReleaseMs,
  hexReactionFrameMs,
  spriteGroupFrames,
  unitCreatureSprite,
  warMachineShotLeadMs,
  warMachineSprite
} from "./creature-sprites";

/**
 * Hex Battlefield pace and war machine data (creature-anim-times.json): every
 * creature moves at its own PC walk time (H3 CRANIM "Walk Animation Time"),
 * VCMI's formulas at the default move speed 3 (the PC's fast combat speed) — a
 * walker 1000/6·walk ms a hex, a flyer 44000/750·walk ms a hex, move frames
 * 100/3·walk ms — while blows keep 80 ms frames, and a war machine's shot
 * leaves on its CRANIM climax frame. Card-art tokens take the neutral 1.0.
 */
afterEach(() => {
  setHexBattleSpeed(HEX_SPEED_DEFAULTS);
});

const walkPlan = (unit: { unitDefId?: string; variant?: "few" | "pack"; heroDefId?: string }, steps = 3, initiativeDelta = 0) =>
  hexMovePlan({ ...unit, initiativeDelta, steps, distance: steps, flying: false, teleport: false });

describe("hex move pace", () => {
  it("walks each creature at its PC walk time: a Zombie shambles, a Wolf Rider trots (CONTROL: a card token's 1.0)", () => {
    const zombie = walkPlan({ unitDefId: "necropolis.zombies", variant: "pack" }); // CRANIM 1.30
    const wolf = walkPlan({ unitDefId: "stronghold.wolf_raiders", variant: "few" }); // CRANIM 0.93
    const token = walkPlan({ unitDefId: "no.such_unit", variant: "few" });
    expect(token.legsMs).toBeCloseTo((3 * 1000) / 6, 6);
    expect(zombie.legsMs).toBeCloseTo((3 * 1000 * 1.3) / 6, 6);
    expect(wolf.legsMs).toBeCloseTo((3 * 1000 * 0.93) / 6, 6);
    // The stride stretches with the pace: the move frames play at 100/3·walk ms.
    expect(token.walkFrameMs).toBeCloseTo(100 / 3, 6);
    expect(zombie.walkFrameMs).toBeCloseTo((100 / 3) * 1.3, 6);
    // A move's own turns and start/stop frames run at the move pace; a face /
    // aim turn outside a move keeps the calmer reaction pace (CONTROL).
    expect(token.turnFrameMs).toBeCloseTo(100 / 3, 6);
    expect(token.edgeFrameMs).toBeCloseTo(100 / 3, 6);
    expect(hexReactionFrameMs()).toBeCloseTo(80, 6);
  });

  it("paces a battlefield hero by its own figure (Komari over the Master Gremlin's walk, 0.75)", () => {
    expect(unitCreatureSprite({ heroDefId: "komari_kamikita" })?.slug).toBe("lb-komari");
    expect(walkPlan({ heroDefId: "komari_kamikita" }).legsMs).toBeCloseTo((3 * 1000 * 0.75) / 6, 6);
  });

  it("glides a flyer at its flight pace, and Haste hurries every beat", () => {
    const flight = hexMovePlan({ unitDefId: "castle.archangels", variant: "pack", flyer: true, steps: 0, distance: 6, flying: true, teleport: false });
    // 250·speed / walk PC px a second over 44 px hexes: 6 · 44000 · 0.82 / 750 ms.
    expect(flight.legsMs).toBeCloseTo((6 * 44000 * 0.82) / 750, 6);
    const hasted = walkPlan({ unitDefId: "necropolis.zombies", variant: "pack" }, 3, 2);
    expect(hasted.legsMs).toBeCloseTo((3 * 1000 * 1.3) / 6 / 1.36, 6);
    expect(hasted.walkFrameMs).toBeCloseTo(((100 / 3) * 1.3) / 1.36, 6);
  });
});

describe("hex battle speed (battle bar Options)", () => {
  it("the Movement setting paces walks, move frames, a move's turns and a teleport blink — and nothing else", () => {
    const token = walkPlan({ unitDefId: "no.such_unit", variant: "few" });
    setHexBattleSpeed({ move: 1 });
    const slow = walkPlan({ unitDefId: "no.such_unit", variant: "few" });
    // PC slow: 2 hexes a second, 10 move frames a second (CONTROL: fast, 6 and 30).
    expect(token.legsMs).toBeCloseTo(500, 6);
    expect(slow.legsMs).toBeCloseTo(1500, 6);
    expect(slow.walkFrameMs).toBeCloseTo(100, 6);
    expect(slow.turnFrameMs).toBeCloseTo(100, 6);
    expect(slow.edgeFrameMs).toBeCloseTo(100, 6);
    // A token's teleport blink: 400 ms at the default move speed, 1200 at speed 1.
    expect(hexMovePlan({ steps: 0, distance: 0, flying: false, teleport: true }).totalMs).toBe(1200);
    // Blows, hits and deaths keep their own pace.
    expect(hexActionFrameMs()).toBeCloseTo(80, 6);
    expect(hexReactionFrameMs()).toBeCloseTo(80, 6);
    setHexBattleSpeed({ move: 3 });
    expect(hexMovePlan({ steps: 0, distance: 0, flying: false, teleport: true }).totalMs).toBe(400);
  });

  it("the Attacks setting shortens the blow, the shot's draw, release and flight and the cast wind-up together", () => {
    // Default attack speed: every beat is its authored value (CONTROL).
    expect(hexActionBeatMs(500)).toBeCloseTo(500, 6);
    expect(hexRangedReleaseMs()).toBeCloseTo(300, 6);
    expect(hexCastReleaseMs()).toBeCloseTo(450, 6);
    expect(warMachineShotLeadMs("war_machine.ballista")).toBe(320);
    const archer = creatureSpriteForSlug("archer");
    const drawAtDefault = creatureShootFrameMs(archer);
    setHexBattleSpeed({ attack: 2.5 });
    expect(hexActionBeatMs(500)).toBeCloseTo(250, 6);
    expect(hexRangedReleaseMs()).toBeCloseTo(150, 6);
    expect(hexCastReleaseMs()).toBeCloseTo(225, 6);
    expect(hexActionFrameMs()).toBeCloseTo(40, 6);
    expect(creatureShootFrameMs(archer)).toBeCloseTo(drawAtDefault / 2, 6);
    expect(warMachineShotLeadMs("war_machine.ballista")).toBe(160);
    // Moves and reactions keep their pace.
    expect(walkPlan({ unitDefId: "no.such_unit", variant: "few" }).legsMs).toBeCloseTo(500, 6);
    expect(hexReactionFrameMs()).toBeCloseTo(80, 6);
  });

  it("the Reactions setting paces hits, blocks, deaths and turning to face", () => {
    setHexBattleSpeed({ reaction: 2 });
    expect(hexReactionFrameMs()).toBeCloseTo(50, 6);
    expect(hexActionFrameMs()).toBeCloseTo(80, 6);
    expect(hexActionBeatMs(500)).toBeCloseTo(500, 6);
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
