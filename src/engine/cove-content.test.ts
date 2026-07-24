import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { cardLibrary } from "@/data/cards/library";
import {
  coreBuildingDefinitions,
  coreFactionDefinitions,
  coreHeroDefinitions,
  neutralCounterpartId,
  neutralUnitIdsByFaction,
  neutralUnitIdsByTier,
  startingTileByFaction
} from "@/data/factions/core";
import { coreUnitDefinitions } from "@/data/factions/units";
import { unitAbilities } from "@/data/units/abilities";
import { TOWN_BUILDING_IMAGES } from "@/data/assets/homm-assets";
import { unitSoundKey, type UnitSoundAction } from "@/data/unit-sounds";
import { applyAction, createAdventureGameState, getLegalActions } from "./index";
import { startAdventureRound } from "./adventure";
import { pumpAdventureQueues } from "./adventure-reducer";
import type { GameAction, GameState } from "./state";

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

describe("Cove faction wiring", () => {
  it("registers the faction with its starting tile, eight buildings, two heroes and seven units", () => {
    const faction = coreFactionDefinitions.cove;
    expect(faction).toBeDefined();
    expect(faction.id).toBe("cove");
    expect(faction.startingTileId).toBe("S9");
    expect(startingTileByFaction.cove).toBe("S9");
    expect(faction.color).toBeTruthy();

    expect(faction.buildings).toEqual([
      "cove.city_hall",
      "cove.citadel",
      "cove.mage_guild",
      "cove.dwelling_bronze",
      "cove.dwelling_silver",
      "cove.dwelling_gold",
      "cove.thieves_guild",
      "cove.pub"
    ]);
    expect(faction.units).toEqual([
      "cove.oceanids",
      "cove.seamen",
      "cove.sea_dogs",
      "cove.ayssids",
      "cove.sorceresses",
      "cove.nix",
      "cove.haspids"
    ]);
    // All six Cove heroes are registered (every specialty is engine-wired).
    expect(faction.heroes).toEqual(["astra", "cassiopeia", "jeremy", "zilare", "miriam", "casmetra"]);
  });
});

describe("Cove units", () => {
  it("carries the wiki stats on each side (spot-checks)", () => {
    expect(coreUnitDefinitions["cove.oceanids"].few).toMatchObject({ attack: 2, defense: 0, health: 3, initiative: 6, cost: { gold: 2 } });
    expect(coreUnitDefinitions["cove.nix"].pack).toMatchObject({ attack: 6, defense: 2, health: 8, initiative: 7, cost: { gold: 20, valuables: 1 } });
    expect(coreUnitDefinitions["cove.haspids"].pack).toMatchObject({ attack: 7, defense: 3, health: 8, initiative: 12, cost: { gold: 30, valuables: 2 } });
    expect(coreUnitDefinitions["cove.sea_dogs"].few?.type ?? coreUnitDefinitions["cove.sea_dogs"].type).toBe("ranged");
  });

  it("wires every side's abilities to implemented engine tags — no decorative ones", () => {
    const expected: Record<string, { few: string[]; pack: string[] }> = {
      "cove.oceanids": { few: [], pack: ["immune-all-spells"] },
      "cove.seamen": { few: [], pack: ["seamen-plunder"] },
      "cove.sea_dogs": { few: ["ignore-combat-penalties"], pack: ["ignores-retaliation", "ignore-combat-penalties"] },
      "cove.ayssids": { few: [], pack: ["ayssid-pounce"] },
      "cove.sorceresses": { few: ["sorceress-weakness-few"], pack: ["sorceress-weakness-on-attack"] },
      "cove.nix": { few: [], pack: ["nix-damage-cap"] },
      "cove.haspids": { few: ["haspid-vengeance"], pack: ["wyvern-poison-cube-pack"] }
    };
    for (const [unitId, sides] of Object.entries(expected)) {
      const def = coreUnitDefinitions[unitId];
      expect(def, unitId).toBeDefined();
      expect(def.faction).toBe("cove");
      expect(def.few?.abilities ?? [], `${unitId} few`).toEqual(sides.few);
      expect(def.pack?.abilities ?? [], `${unitId} pack`).toEqual(sides.pack);
      // Every listed ability resolves to an implemented engine effect.
      for (const abilityId of [...sides.few, ...sides.pack]) {
        const ability = unitAbilities[abilityId];
        expect(ability, abilityId).toBeDefined();
        expect(ability.implementationStatus, abilityId).toBe("implemented");
        expect(ability.effect?.type, abilityId).toBeTruthy();
      }
    }
  });

  it("registers the four new Cove ability effects as implemented", () => {
    const newAbilities: Record<string, string> = {
      "seamen-plunder": "ON_KILL_GAIN_RESOURCE",
      "ayssid-pounce": "SECOND_ATTACK_ONE_ADJACENT_TO_SELF",
      "nix-damage-cap": "CAP_DAMAGE_PER_ATTACK",
      "haspid-vengeance": "ATTACK_BONUS_IF_FLIPPED"
    };
    for (const [abilityId, effectType] of Object.entries(newAbilities)) {
      const ability = unitAbilities[abilityId];
      expect(ability, abilityId).toBeDefined();
      expect(ability.implementationStatus, abilityId).toBe("implemented");
      expect(ability.effect?.type, abilityId).toBe(effectType);
    }
    // The Ayssid follow-up is the kill-gated variant.
    expect(unitAbilities["ayssid-pounce"].effect).toMatchObject({ requiresTargetRemoved: true });
  });

  it("has a combat voice for every unit/action (SFX present)", () => {
    for (const unitId of coreFactionDefinitions.cove.units) {
      const def = coreUnitDefinitions[unitId];
      const actions: UnitSoundAction[] =
        def.type === "ranged"
          ? ["attack", "shoot", "defend", "hurt", "death", "move"]
          : ["attack", "defend", "hurt", "death", "move"];
      for (const action of actions) {
        expect(unitSoundKey(unitId, action), `${unitId}:${action}`).toBeTruthy();
      }
    }
  });

  it("ships real card art for every Few/Pack face (cropped from the Gamefound reveal, not the blank placeholder)", () => {
    for (const unitId of coreFactionDefinitions.cove.units) {
      const def = coreUnitDefinitions[unitId];
      for (const side of ["few", "pack"] as const) {
        const image = def[side]?.cardImage;
        expect(image, `${unitId}.${side} cardImage`).toMatch(/^\/assets\/units-cove-(bronze|silver|golden)-[a-z_]+-(few|pack)\.webp$/);
        expect(image, `${unitId}.${side} not blank`).not.toContain("units-blank");
        const file = fileURLToPath(new URL(`../../public${image}`, import.meta.url));
        expect(existsSync(file), `${unitId}.${side} art file ${image}`).toBe(true);
      }
    }
  });
});

describe("Cove neutral guard units", () => {
  // The wiki prints a single-sided Neutral Unit card for each Cove creature; the
  // engine ships all seven as neutral.<slug> guards.
  const NEUTRAL: Record<string, { tier: "bronze" | "silver" | "gold"; type: string; neutral: { attack: number; defense: number; health: number; initiative: number; gold: number }; abilities: string[]; counterpartOf: string }> = {
    "neutral.oceanids": { tier: "bronze", type: "flying", neutral: { attack: 2, defense: 0, health: 3, initiative: 6, gold: 3 }, abilities: ["immune-all-spells"], counterpartOf: "cove.oceanids" },
    "neutral.seamen": { tier: "bronze", type: "ground", neutral: { attack: 2, defense: 1, health: 3, initiative: 5, gold: 5 }, abilities: [], counterpartOf: "cove.seamen" },
    "neutral.sea_dogs": { tier: "bronze", type: "ranged", neutral: { attack: 2, defense: 0, health: 4, initiative: 6, gold: 7 }, abilities: ["ignore-combat-penalties"], counterpartOf: "cove.sea_dogs" },
    "neutral.ayssids": { tier: "silver", type: "flying", neutral: { attack: 3, defense: 1, health: 5, initiative: 9, gold: 9 }, abilities: ["ayssid-pounce"], counterpartOf: "cove.ayssids" },
    "neutral.sorceresses": { tier: "silver", type: "ranged", neutral: { attack: 3, defense: 1, health: 5, initiative: 6, gold: 13 }, abilities: ["sorceress-weakness-on-attack"], counterpartOf: "cove.sorceresses" },
    "neutral.nix": { tier: "gold", type: "ground", neutral: { attack: 5, defense: 1, health: 7, initiative: 6, gold: 20 }, abilities: ["nix-damage-cap-neutral"], counterpartOf: "cove.nix" },
    "neutral.haspids": { tier: "gold", type: "ground", neutral: { attack: 5, defense: 2, health: 6, initiative: 9, gold: 25 }, abilities: ["wyvern-poison-cube-few"], counterpartOf: "cove.haspids" }
  };

  it("registers all seven with the wiki's Neutral-column stats and implemented abilities", () => {
    for (const [unitId, spec] of Object.entries(NEUTRAL)) {
      const def = coreUnitDefinitions[unitId];
      expect(def, unitId).toBeDefined();
      expect(def.faction).toBe("neutral");
      expect(def.tier).toBe(spec.tier);
      expect(def.type).toBe(spec.type);
      expect(def.neutral, `${unitId} neutral side`).toMatchObject({
        attack: spec.neutral.attack,
        defense: spec.neutral.defense,
        health: spec.neutral.health,
        initiative: spec.neutral.initiative,
        cost: { gold: spec.neutral.gold }
      });
      expect(def.neutral?.abilities ?? [], `${unitId} abilities`).toEqual(spec.abilities);
      for (const abilityId of spec.abilities) {
        const ability = unitAbilities[abilityId];
        expect(ability, abilityId).toBeDefined();
        expect(ability.implementationStatus, abilityId).toBe("implemented");
        expect(ability.effect?.type, abilityId).toBeTruthy();
      }
      // The guard now ships its own dedicated Neutral-tier face (composited from
      // the counterpart's exact creature illustration), NOT the faction Few crop.
      expect(def.neutral?.cardImage).toMatch(/^\/assets\/units-neutral-(bronze|silver|golden)-[a-z_]+\.webp$/);
      expect(def.neutral?.cardImage).not.toBe(coreUnitDefinitions[spec.counterpartOf].few?.cardImage);
    }
  });

  it("each guard joins its tier's Neutral Units deck (so it can appear as a map guard)", () => {
    for (const [unitId, spec] of Object.entries(NEUTRAL)) {
      expect(neutralUnitIdsByTier[spec.tier], `${unitId} in ${spec.tier} deck`).toContain(unitId);
    }
  });

  it("each is matched as the Cove faction counterpart (Unexpected Reinforcements)", () => {
    for (const [unitId, spec] of Object.entries(NEUTRAL)) {
      expect(neutralCounterpartId(spec.counterpartOf), `${spec.counterpartOf} counterpart`).toBe(unitId);
      expect(neutralUnitIdsByFaction.cove, `cove faction pool has ${unitId}`).toContain(unitId);
    }
    expect(neutralUnitIdsByFaction.cove).toHaveLength(7);
  });

  it("the Nix guard caps at 5 and the Haspid guard plants 1 cube — distinct from the Pack sides", () => {
    expect(unitAbilities["nix-damage-cap-neutral"].effect).toMatchObject({ type: "CAP_DAMAGE_PER_ATTACK", amount: 5 });
    expect(unitAbilities["nix-damage-cap"].effect).toMatchObject({ type: "CAP_DAMAGE_PER_ATTACK", amount: 4 });
    expect(unitAbilities["wyvern-poison-cube-few"].effect).toMatchObject({ type: "ON_ATTACK_POISON_CUBES", count: 1 });
    expect(unitAbilities["wyvern-poison-cube-pack"].effect).toMatchObject({ type: "ON_ATTACK_POISON_CUBES", count: 2 });
  });

  it("speaks with the same creature voice as its faction twin", () => {
    for (const [unitId, spec] of Object.entries(NEUTRAL)) {
      const actions: UnitSoundAction[] =
        spec.type === "ranged"
          ? ["attack", "shoot", "defend", "hurt", "death", "move"]
          : ["attack", "defend", "hurt", "death", "move"];
      for (const action of actions) {
        expect(unitSoundKey(unitId, action), `${unitId}:${action}`).toBe(unitSoundKey(spec.counterpartOf, action));
      }
    }
  });
});

describe("Cove heroes", () => {
  it("registers Astra, Cassiopeia, Jeremy, Zilare, Miriam and Casmetra with implemented starting abilities and specialties", () => {
    for (const [heroId, klass, type, ability] of [
      ["astra", "Navigator", "magic", "ability.luck"],
      ["cassiopeia", "Captain", "might", "ability.tactics"],
      ["jeremy", "Captain", "might", "ability.offense"],
      ["zilare", "Navigator", "magic", "ability.interference"],
      ["miriam", "Captain", "might", "ability.logistics"],
      ["casmetra", "Navigator", "magic", "ability.wisdom"]
    ] as const) {
      const hero = coreHeroDefinitions[heroId];
      expect(hero, heroId).toBeDefined();
      expect(hero.faction).toBe("cove");
      expect(hero.class).toBe(klass);
      expect(hero.type).toBe(type);
      expect(cardLibrary[hero.startingAbilityCardId], `${heroId} ability ${ability}`).toBeDefined();
      expect(hero.startingAbilityCardId).toBe(ability);
      // PC portrait is hosted locally (scripts/fetch-cove-art.py); no board scan yet.
      expect(hero.portrait).toBe(`/assets/hero_portraits-${heroId}.webp`);
      expect(hero.boardScan).toBeUndefined();
      expect(existsSync(fileURLToPath(new URL(`../../public${hero.portrait}`, import.meta.url))), `${heroId} portrait file`).toBe(true);
      for (const specialtyId of Object.values(hero.specialtyCardIds!)) {
        const card = cardLibrary[specialtyId];
        expect(card, specialtyId).toBeDefined();
        expect(card.kind).toBe("hero-specialty");
        expect(card.implementationStatus, specialtyId).toBe("implemented");
      }
    }
  });

});

describe("Cove buildings", () => {
  it("reuses the standard implemented effects for the core buildings", () => {
    expect(coreBuildingDefinitions["cove.citadel"].effect).toMatchObject({ type: "UNLOCK_REINFORCE" });
    expect(coreBuildingDefinitions["cove.mage_guild"].effect).toMatchObject({ type: "MAGE_GUILD" });
    expect(coreBuildingDefinitions["cove.mage_guild"].spellBookCost).toBe(5);
    expect(coreBuildingDefinitions["cove.dwelling_bronze"]).toMatchObject({
      name: "Bay",
      cost: { gold: 4, buildingMaterials: 3, valuables: 1 },
      effect: { type: "UNLOCK_RECRUIT_TIER", tier: "bronze" }
    });
    expect(coreBuildingDefinitions["cove.dwelling_silver"].effect).toMatchObject({ type: "UNLOCK_RECRUIT_TIER", tier: "silver" });
    expect(coreBuildingDefinitions["cove.dwelling_gold"].effect).toMatchObject({ type: "UNLOCK_RECRUIT_TIER", tier: "gold" });
  });

  it("gives the City Hall its Resource-round gold/experience choice (BINH house rule)", () => {
    const cityHall = coreBuildingDefinitions["cove.city_hall"];
    expect(cityHall.cost).toEqual({ gold: 10, buildingMaterials: 4 });
    expect(cityHall.implementationStatus).toBe("implemented");
    // House rule: the Cove City Hall fires on the RESOURCE round like every
    // other faction's, not the Astrologers' round it prints.
    expect(cityHall.effect).toMatchObject({
      type: "RESOURCE_ROUND_CHOICE",
      options: [
        { gold: 4 },
        { experience: 1, removeArtifactFromHand: true }
      ]
    });
  });

  it("gives the Pub its Astrologers'-round flat −3-gold reinforce discount", () => {
    const pub = coreBuildingDefinitions["cove.pub"];
    expect(pub.implementationStatus).toBe("implemented");
    expect(pub.effect).toMatchObject({
      type: "ASTROLOGERS_FLAT_GOLD_REINFORCE",
      discount: 3,
      tiers: ["bronze", "silver", "gold"]
    });
  });

  it("wires the Thieves' Guild as an implemented once-per-turn deck-peek action", () => {
    const guild = coreBuildingDefinitions["cove.thieves_guild"];
    expect(guild.implementationStatus).toBe("implemented");
    expect(guild.effect?.type).toBe("THIEVES_GUILD");
  });

  it("renders all eight buildings with a Cove town-screen image on disk", () => {
    const images = TOWN_BUILDING_IMAGES.cove;
    expect(Object.keys(images ?? {})).toHaveLength(8);
    for (const buildingId of coreFactionDefinitions.cove.buildings) {
      const key = buildingId.split(".")[1];
      const image = images?.[key];
      expect(image, `${buildingId} image mapping`).toBeTruthy();
      // The faction loader copies the mapping onto building.assets.image.
      expect(coreBuildingDefinitions[buildingId].assets?.image, `${buildingId} assets.image`).toBe(image);
      const file = fileURLToPath(new URL(`../../public${image}`, import.meta.url));
      expect(existsSync(file), `${buildingId} image file ${image}`).toBe(true);
    }
  });
});

describe("Cove Pub — Astrologers'-round reinforce discount", () => {
  function applyOk(state: GameState, action: GameAction): GameState {
    const result = applyAction(state, action);
    expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
    return result.state;
  }

  /** A Cove (p1) adventure on the Astrologers' round (round 2) with a Pub and Citadel. */
  function pubRound(
    seed: string,
    army: { id: string; unitDefId: string; side: "few" | "pack" }[],
    gold: number,
    withCitadel = true
  ): GameState {
    const state = createAdventureGameState({
      seed,
      rollFirstPlayer: false,
      players: [
        { id: "p1", name: "Astra", factionId: "cove", heroDefId: "astra" },
        { id: "p2", name: "Catherine", factionId: "castle", heroDefId: "catherine" }
      ]
    });
    const town = Object.values(state.towns).find((candidate) => candidate.controllerId === "p1");
    if (!town) throw new Error("no Cove town");
    town.buildings = withCitadel ? ["cove.pub", "cove.citadel"] : ["cove.pub"];
    state.players.p1.army = army;
    state.players.p1.resources.gold = gold;
    state.pendingChoice = null;
    if (state.adventure) state.adventure.rewardQueue = [];
    state.round = 2; // even rounds are Astrologers' rounds
    // Keep the drawn proclamation inert so the ONLY reinforce offer is the Pub's.
    // (The shuffled deck can otherwise deal a reinforce proclamation — e.g. Isra's
    // Friends — whose own half-cost offer would compete with the Pub's here.)
    state.decks.astrologers!.drawPile = ["astrologers.dead_silence"];
    startAdventureRound(state);
    return state;
  }

  function reinforceAction(state: GameState, unitName: string) {
    return getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "RESOLVE_VISIT_STEP" && legal.label.startsWith("Reinforce") && legal.label.includes(unitName)
    );
  }

  it("queues a once-per-round offer and reinforces one Few unit for 3 less gold", () => {
    // Sea Dogs pack costs 6 gold; the Pub knocks 3 off → 3 gold.
    const state = pubRound("pub-discount", [{ id: "army_sd", unitDefId: "cove.sea_dogs", side: "few" }], 10);
    const offer = state.adventure?.rewardQueue.some(
      (reward) => reward.kind === "visit-steps" && reward.steps[0]?.type === "CHOOSE_ONE" && reward.steps[0].prompt.includes("Pub")
    );
    expect(offer, "the Pub reinforce offer should be queued at the Astrologers' round").toBe(true);

    pumpAdventureQueues(state);
    const reinforce = reinforceAction(state, "Sea Dogs");
    expect(reinforce, "the Pub should offer to reinforce the Sea Dogs").toBeTruthy();
    const after = applyOk(state, reinforce!.action);
    expect(after.players.p1.army.find((unit) => unit.id === "army_sd")?.side).toBe("pack");
    expect(after.players.p1.resources.gold).toBe(7); // 10 − (6 − 3)
  });

  it("does not offer Pub reinforcement without a Citadel", () => {
    const state = pubRound("pub-needs-citadel", [{ id: "army_sd", unitDefId: "cove.sea_dogs", side: "few" }], 10, false);
    pumpAdventureQueues(state);

    expect(reinforceAction(state, "Sea Dogs"), "Pub reinforcement still needs a Citadel").toBeUndefined();
  });

  it("STACKS the Pub discount with a Legion voucher reserved for the same unit", () => {
    // Sea Dogs pack costs 6 gold. The Pub −3 and a 2-gold Legion voucher reserved
    // for the same army unit STACK → −5, so the reinforce charges 1 gold — not the
    // Pub-only 3, nor the Legion-only 4. (The Pub offer is queued at round start;
    // the player banks the Legion piece during the turn, so the charge — read at
    // resolution by reinforceCostFor — is what stacks the two.)
    const state = pubRound("pub-legion-stack", [{ id: "army_sd", unitDefId: "cove.sea_dogs", side: "few" }], 10);
    // Bank a Legion voucher for the Sea Dogs (mid-turn, after round start so it is
    // not expired). reinforceCostFor reads it when the reinforce actually resolves.
    state.players.p1.recruitDiscounts = [
      { cardId: "artifact.legs_of_legion", amount: 2, target: { kind: "reinforce", armyUnitId: "army_sd" } }
    ];

    pumpAdventureQueues(state);
    const reinforce = reinforceAction(state, "Sea Dogs");
    expect(reinforce, "the Pub should offer the Sea Dogs reinforce").toBeTruthy();
    const after = applyOk(state, reinforce!.action);
    expect(after.players.p1.army.find((unit) => unit.id === "army_sd")?.side).toBe("pack");
    expect(after.players.p1.resources.gold).toBe(9); // 10 − 1 (stacked −5), NOT 7 (Pub only) or 8 (Legion only)
    // The Legion voucher was consumed by the reinforce.
    expect(after.players.p1.recruitDiscounts ?? []).toHaveLength(0);
  });

  it("never drops gold below 0 (Oceanids pack costs 3 → free)", () => {
    const packGold = coreUnitDefinitions["cove.oceanids"].pack?.cost.gold ?? 0;
    expect(packGold).toBeLessThanOrEqual(3); // the discount fully covers it
    const state = pubRound("pub-min0", [{ id: "army_oc", unitDefId: "cove.oceanids", side: "few" }], 5);
    pumpAdventureQueues(state);
    const reinforce = reinforceAction(state, "Oceanids");
    expect(reinforce).toBeTruthy();
    const after = applyOk(state, reinforce!.action);
    expect(after.players.p1.army.find((unit) => unit.id === "army_oc")?.side).toBe("pack");
    expect(after.players.p1.resources.gold).toBe(5); // 5 − max(0, 3 − 3) = 5
  });

  it("control: no Pub building → no reinforce offer at the Astrologers' round", () => {
    const state = pubRound("pub-control", [{ id: "army_sd", unitDefId: "cove.sea_dogs", side: "few" }], 10);
    // pubRound already built the Pub; rebuild the town without it to prove the offer is the Pub's.
    const town = Object.values(state.towns).find((candidate) => candidate.controllerId === "p1");
    town!.buildings = [];
    state.pendingChoice = null;
    if (state.adventure) state.adventure.rewardQueue = [];
    startAdventureRound(state);
    const offer = state.adventure?.rewardQueue.some(
      (reward) => reward.kind === "visit-steps" && reward.steps[0]?.type === "CHOOSE_ONE" && reward.steps[0].prompt.includes("Pub")
    );
    expect(offer ?? false).toBe(false);
  });
});

describe("Cove adventure setup", () => {
  function coveGame(seed: string): GameState {
    return createAdventureGameState({
      seed,
      rollFirstPlayer: false,
      players: [
        { id: "p1", name: "Astra", factionId: "cove", heroDefId: "astra" },
        { id: "p2", name: "Catherine", factionId: "castle", heroDefId: "catherine" }
      ]
    });
  }

  it("seats a Cove player with their town and main hero", () => {
    const state = coveGame("cove-setup");
    const town = Object.values(state.towns).find((candidate) => candidate.controllerId === "p1");
    expect(town, "Cove player should own a town").toBeTruthy();
    expect(town?.factionId).toBe("cove");
    expect(Object.values(state.heroes).some((hero) => hero.controllerId === "p1")).toBe(true);
  });

  it("queues the City Hall choice for the Cove player on the Resource round (BINH house rule)", () => {
    const state = coveGame("cove-cityhall-queue");
    const town = Object.values(state.towns).find((candidate) => candidate.controllerId === "p1");
    expect(town, "Cove town").toBeTruthy();
    if (!town!.buildings.includes("cove.city_hall")) {
      town!.buildings.push("cove.city_hall");
    }
    state.pendingChoice = null;
    if (state.adventure) {
      state.adventure.rewardQueue = [];
    }
    state.round = 3; // odd round > 1 → Resource round
    startAdventureRound(state);
    const queued =
      state.adventure?.rewardQueue.some(
        (reward) => reward.kind === "city-hall-choice" && reward.playerId === "p1" && reward.buildingId === "cove.city_hall"
      ) ?? false;
    expect(queued).toBe(true);
  });

  it("control: the City Hall does NOT queue on the Astrologers' round", () => {
    const state = coveGame("cove-cityhall-not-astro");
    const town = Object.values(state.towns).find((candidate) => candidate.controllerId === "p1");
    if (!town!.buildings.includes("cove.city_hall")) {
      town!.buildings.push("cove.city_hall");
    }
    state.pendingChoice = null;
    if (state.adventure) {
      state.adventure.rewardQueue = [];
    }
    state.round = 2; // even round → Astrologers' round; the House-ruled City Hall must stay silent
    startAdventureRound(state);
    const queued =
      state.adventure?.rewardQueue.some(
        (reward) => reward.kind === "city-hall-choice" && reward.playerId === "p1" && reward.buildingId === "cove.city_hall"
      ) ?? false;
    expect(queued).toBe(false);
  });

  /** Drives the City Hall choice straight off the reward queue (no turn machinery). */
  function openCityHallChoice(seed: string, hand: string[]): GameState {
    const state = coveGame(seed);
    state.players.p1.hand = hand;
    state.players.p1.discard = [];
    state.pendingChoice = null;
    if (!state.adventure) {
      throw new Error("no adventure state");
    }
    state.adventure.rewardQueue = [{ playerId: "p1", kind: "city-hall-choice", buildingId: "cove.city_hall" }];
    pumpAdventureQueues(state);
    return state;
  }

  it("City Hall pays 4 gold (the only option offered with no Artifact in hand)", () => {
    const state = openCityHallChoice("cove-cityhall-gold", ["stat.attack"]);
    const choice = state.pendingChoice;
    if (choice?.type !== "OPTION_CHOICE" || choice.context !== "city-hall") {
      throw new Error("expected the Cove City Hall choice");
    }
    expect(choice.cityHall?.options).toHaveLength(1); // artifact option filtered out
    const goldBefore = state.players.p1.resources.gold;
    const next = applyOk(state, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: choice.id, optionIndex: 0 });
    expect(next.players.p1.resources.gold).toBe(goldBefore + 4);
  });

  it("City Hall can spend an Artifact for 1 experience when one is held", () => {
    const state = openCityHallChoice("cove-cityhall-xp", ["artifact.centaurs_axe"]);
    const hero = Object.values(state.heroes).find((candidate) => candidate.controllerId === "p1" && candidate.kind === "main");
    expect(hero).toBeTruthy();
    const xpBefore = hero!.experience;
    const choice = state.pendingChoice;
    if (choice?.type !== "OPTION_CHOICE" || choice.context !== "city-hall") {
      throw new Error("expected the Cove City Hall choice");
    }
    // With an Artifact in hand both options are offered; index 1 is the cost option.
    expect(choice.cityHall?.options).toHaveLength(2);
    const next = applyOk(state, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: choice.id, optionIndex: 1 });
    const heroAfter = Object.values(next.heroes).find((candidate) => candidate.controllerId === "p1" && candidate.kind === "main");
    expect(next.players.p1.hand).not.toContain("artifact.centaurs_axe");
    // The Artifact is REMOVED FROM THE GAME (the "remove" keyword), NOT discarded:
    // it lands on player.removed and must NOT reach the discard pile (where it
    // could be searched/recovered). A discard here fails this test.
    expect(next.players.p1.removed).toContain("artifact.centaurs_axe");
    expect(next.players.p1.discard).not.toContain("artifact.centaurs_axe");
    expect(heroAfter!.experience).toBe(xpBefore + 1);
  });
});
