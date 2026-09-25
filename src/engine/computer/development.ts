import { coreBuildingDefinitions, coreFactionDefinitions, coreHeroDefinitions, factoryGoldUnitConflict } from "@/data/factions/core";
import { cardLibrary } from "@/data/cards/library";
import { hasNecromancyPlan } from "./necromancy-plan";
export { hasNecromancyPlan } from "./necromancy-plan";
import { coreUnitDefinitions } from "@/data/factions/units";
import type { TownBuildingEffect, UnitSideDefinition, UnitTier } from "@/data/factions/types";
import { TRADE_RATES } from "@/data/map/locations";
import { NEUTRAL_PLAYER_ID } from "../state";
import type { GameState, PlayerId, ResourceCost } from "../state";
import { unitExperienceActive } from "../unit-experience";
import { playersAreAllied } from "./control";
import { isFieldGuarded, reinforceCostFor, applyRecruitGoldDiscount, playerCanRecruitFewNow } from "../adventure";
import { isOpeningFarMaterialMine, securedFarTileIds } from "./far-sweep";
import { effectiveTownBuildingCost } from "../house-rules";

/** The faction's bronze units in roster (unit-level) order: [level-1, level-2,
 * level-3]. Falls back to the seat's actual bronze cards for custom armies. */
function bronzeUnitsByLevel(state: GameState, playerId: PlayerId): string[] {
  const factionId = state.players[playerId]?.factionId ?? "";
  const isBronzeCore = (unitDefId: string): boolean => {
    const def = coreUnitDefinitions[unitDefId];
    return def?.tier === "bronze" && Boolean(def.few && def.pack);
  };
  const roster = (coreFactionDefinitions[factionId]?.units ?? []).filter(isBronzeCore);
  if (roster.length >= 2) return roster;
  // Custom army without a full faction roster: use its own bronze cards, in
  // whatever order they were dealt (best effort).
  return (state.players[playerId]?.army ?? [])
    .filter((unit) => unit.side !== "bank" && isBronzeCore(unit.unitDefId))
    .map((unit) => unit.unitDefId);
}

/** Factions whose 2nd Pack is the LEVEL-1 bronze instead of the level-2. */
const SECOND_PACK_PREFERS_LEVEL_ONE = new Set(["conflux", "castle", "inferno"]);
/** Factions content with only TWO bronze Packs (no third body): Inferno and
 * Dungeon (evil_eyes + harpies) per the user ruling, and Rampart which pivots
 * early into its Silver (Dendroid) after the Elves + Dwarves Packs. */
const TWO_PACK_FACTIONS = new Set(["inferno", "dungeon", "rampart", "forge"]);
// Forge: expensive, slow, ranged-heavy — Watchers + Cyber Zombies Packs, the
// Grunts stay a Few screen and gold flows to the Silver/Gold ladder.

/**
 * Ordered Pack purchases (user ruling 2026-09-15): the 1st Pack is ALWAYS the
 * level-3 bronze (strongest bronze); the 2nd is the level-1 bronze for
 * Conflux/Castle/Inferno and the level-2 bronze for everyone else; a 3rd Pack
 * (the remaining bronze) follows unless the faction is content with two
 * (Inferno, Dungeon's evil_eyes + harpies). Necromancy keeps its own earned
 * upgrade plan. Anything not upgraded here stays a Few meat-shield screen.
 */
/**
 * The Silver dwelling is here or buildable RIGHT NOW — the trigger for the user's
 * 2026-09-18 doctrine: once you can get Silver, stop upgrading the bronze level-1 and
 * level-2 bodies to Packs (they stay Few meatshields); only the level-3 bronze Pack is
 * worth fighting, and gold flows to the Silver body and the higher ladder instead. True
 * when Silver (or Gold) is already unlocked, or the Silver dwelling's prerequisites stand
 * and the seat can afford it now.
 */
export function silverAccessible(state: GameState, playerId: PlayerId): boolean {
  const town = Object.values(state.towns ?? {}).find((candidate) => candidate.controllerId === playerId);
  if (!town) return false;
  if (town.buildings.some((id) => {
    const effect = coreBuildingDefinitions[id]?.effect;
    return effect?.type === "UNLOCK_RECRUIT_TIER" && (effect.tier === "silver" || effect.tier === "gold");
  })) return true;
  const building = factionBuildingForEffect(state, playerId,
    (effect) => effect.type === "UNLOCK_RECRUIT_TIER" && effect.tier === "silver");
  if (!building) return false;
  const requires = (building as { requires?: readonly string[] }).requires ?? [];
  if (requires.some((id) => !town.buildings.includes(id))) return false;
  const cost = building.cost;
  const res = state.players[playerId]?.resources;
  return Boolean(cost && res &&
    (res.gold ?? 0) >= (cost.gold ?? 0) &&
    (res.buildingMaterials ?? 0) >= (cost.buildingMaterials ?? 0) &&
    (res.valuables ?? 0) >= (cost.valuables ?? 0));
}

export function preferredOpeningPacks(state: GameState, playerId: PlayerId): readonly string[] {
  const factionId = state.players[playerId]?.factionId ?? "";
  // Only a hero actually running the earned-upgrade Necromancy plan skips this
  // order (it saves the Necromancy ability to upgrade Wraiths etc.). A Necropolis
  // hero WITHOUT the Necromancy ability develops normally — 3 Packs, level-3
  // (Wraiths) first — like any other faction (user ruling 2026-09-15).
  if (hasNecromancyPlan(state, playerId)) return [];
  const bronze = bronzeUnitsByLevel(state, playerId);
  const [levelOne, levelTwo, levelThree] = [bronze[0], bronze[1], bronze[2]];
  // User ruling 2026-09-18 (live tutoring): once Silver is accessible (built, or
  // buildable now), the lv1/lv2 bronze bodies stay Few meatshields — ONLY the lv3
  // bronze Pack is worth completing. Drop the lower Packs from the opening plan so
  // gold flows to the Silver body and the higher ladder, not bronze upgrades.
  if (silverAccessible(state, playerId)) {
    const top = levelThree ?? levelTwo ?? levelOne;
    return top ? [top] : [];
  }
  const order: string[] = [];
  // 1st Pack: always the level-3 bronze (fall back to the strongest available).
  const first = levelThree ?? levelTwo ?? levelOne;
  if (first) order.push(first);
  // 2nd Pack: level-1 for Conflux/Castle/Inferno, otherwise level-2.
  // Sandro's starting specialty needs a Skeleton Pack. Give it a legal host
  // before Zombies; a hero with actual Necromancy took the earned path above.
  const second = SECOND_PACK_PREFERS_LEVEL_ONE.has(factionId) || state.players[playerId]?.heroDefId === "sandro"
    ? levelOne : levelTwo;
  if (second && !order.includes(second)) order.push(second);
  // 3rd Pack: the remaining bronze — unless this faction is a two-Pack town.
  if (!TWO_PACK_FACTIONS.has(factionId)) {
    const third = [levelThree, levelTwo, levelOne].find((id) => id && !order.includes(id));
    if (third) order.push(third);
  }
  return order;
}

export function openingBronzeCoreReady(state: GameState, playerId: PlayerId): boolean {
  const army = (state.players[playerId]?.army ?? []).filter(unit => unit.side !== "bank");
  const preferred = preferredOpeningPacks(state, playerId);
  return army.length >= CORE_BODY_TARGET && (preferred.length > 0
    ? preferred.every(id => army.some(unit => unit.unitDefId === id && unit.side === "pack"))
    : army.filter(unit => unit.side === "pack" && coreUnitDefinitions[unit.unitDefId]?.tier === "bronze").length >= openingCorePackTarget(state, playerId));
}

export function necromancyUpgradePriority(unitDefId: string): number {
  const tier = coreUnitDefinitions[unitDefId]?.tier;
  if (tier === "gold" || tier === "azure") return 8;
  if (tier === "silver") return unitDefId === "necropolis.vampires" ? 7 : 6;
  return ({ "necropolis.wraiths": 4,
    "necropolis.zombies": 2, "necropolis.skeletons": 1 } as Record<string, number>)[unitDefId] ?? 0;
}

export function needsNecromancyVampire(state: GameState, playerId: PlayerId): boolean {
  return hasNecromancyPlan(state, playerId) && !hasReachedGoldArmy(state, playerId) &&
    !state.computerMemory?.[playerId]?.necromancyVampirePackEarned &&
    !state.players[playerId].army.some(unit => unit.unitDefId === "necropolis.vampires" && unit.side === "pack") &&
    !goldDwellingFlushDespiteVampirePlan(state, playerId);
}

/** Gold kept aside for the paid Vampire Pack upgrade while the flush seat builds Gold. */
const VAMPIRE_UPGRADE_GOLD_CUSHION = 9;

/**
 * A FLUSH Necropolis seat builds its Gold dwelling instead of holding the
 * whole economy for the earned Vampire Pack. Measured (Necropolis eval-16,
 * impossible): the seat rushed its Gold dwelling for eight rounds, then the
 * round-9 hand refresh drew Necromancy — the plan flipped on, the dwelling
 * stopped being the saved purchase (no rush, no market), and the seat sat on
 * 53 → 73 gold with 3 valuables through R11, no Gold body ever. The Vampire
 * plan is about not SPENDING the Silver-era purse twice; once the Gold
 * dwelling is payable right now — stock, or gold covering its missing inputs
 * at Trading Post rates — with the Vampire upgrade's gold still left over,
 * the dwelling goes up and the earned Pack keeps coming from the fights.
 * Silver dwelling must stand. Once the Gold dwelling stands the same test
 * applies to the next Gold-ladder body (measured next: the R9 dwelling went
 * up, then every Gold recruit scored 180 for two rounds on 32 gold / 1
 * valuable with Ghost Dragons at 19 gold + 1 valuable).
 *
 * Scope: only a plan that exists because of DRAWN cards (hand / discard). A
 * hero-born Necromancer (Vidomina: Necromancy is her own card) keeps the
 * committed design — earned Vampire Pack before the Gold body — which the
 * Necropolis game tests pin.
 */
function goldDwellingFlushDespiteVampirePlan(state: GameState, playerId: PlayerId): boolean {
  const hero = coreHeroDefinitions[state.players[playerId]?.heroDefId ?? ""];
  const heroBorn = [hero?.startingAbilityCardId, hero?.specialtyCardIds?.[1]].some(
    (id) => Boolean(id && cardLibrary[id]?.effect.type === "NECROMANCY_REINFORCE"));
  if (heroBorn) return false;
  const effects = Object.values(state.towns ?? {})
    .filter((town) => town.controllerId === playerId)
    .flatMap((town) => town.buildings)
    .map((id) => coreBuildingDefinitions[id]?.effect);
  const tierBuilt = (tier: string) => effects.some(
    (effect) => effect?.type === "UNLOCK_RECRUIT_TIER" && effect.tier === tier);
  if (!tierBuilt("silver")) return false;
  const res = state.players[playerId]?.resources;
  if (!res) return false;
  let cost: ResourceCost;
  if (tierBuilt("gold")) {
    const step = nextGoldLadderStep(state, playerId);
    if (!step?.cost) return false;
    cost = step.cost;
  } else {
    const dwelling = factionBuildingForEffect(state, playerId,
      (effect) => effect.type === "UNLOCK_RECRUIT_TIER" && effect.tier === "gold");
    if (!dwelling) return false;
    cost = effectiveTownBuildingCost(state, dwelling);
  }
  const missingValuables = Math.max(0, (cost.valuables ?? 0) - (res.valuables ?? 0));
  const missingMaterials = Math.max(0, (cost.buildingMaterials ?? 0) - (res.buildingMaterials ?? 0));
  const valuableRate = goldPurchaseRate("valuables");
  const materialRate = goldPurchaseRate("buildingMaterials");
  if ((missingValuables > 0 && !valuableRate) || (missingMaterials > 0 && !materialRate)) return false;
  const goldNeeded = (cost.gold ?? 0) +
    missingValuables * (valuableRate?.goldPerUnit ?? 0) +
    missingMaterials * (materialRate?.goldPerUnit ?? 0) +
    VAMPIRE_UPGRADE_GOLD_CUSHION;
  return (res.gold ?? 0) >= goldNeeded;
}

/** Whether the faction's Gold dwelling is payable from stock this instant
 * WITHOUT eating the planned Silver body's price. The stalled-opening
 * exemption below only steps aside for a genuinely flush seat that does both
 * the same turn — a seat that could pay the dwelling but would then sit at
 * less than the Silver Few's cost is exactly the R4–R7 stall the exemption
 * exists for, so it stays open for them. */
function goldDwellingPayableNow(state: GameState, playerId: PlayerId): boolean {
  const dwelling = factionBuildingForEffect(state, playerId,
    (effect) => effect.type === "UNLOCK_RECRUIT_TIER" && effect.tier === "gold");
  if (!dwelling) return false;
  const cost = effectiveTownBuildingCost(state, dwelling);
  const res = state.players[playerId]?.resources;
  if (!res) return false;
  const silverCost = premiumSilverCost(state, playerId);
  return (res.gold ?? 0) >= (cost.gold ?? 0) + (silverCost?.gold ?? 0) &&
    (res.buildingMaterials ?? 0) >= (cost.buildingMaterials ?? 0) + (silverCost?.buildingMaterials ?? 0) &&
    (res.valuables ?? 0) >= (cost.valuables ?? 0) + (silverCost?.valuables ?? 0);
}

/** Fund the first Silver breakthrough and Dungeon's ordered second Silver
 * before opening Gold. Combat and movement legality remain separate. */
export function needsPremiumSilverBreakthrough(state: GameState, playerId: PlayerId): boolean {
  const profile = armyDevelopmentProfile(state, playerId);
  if (hasReachedGoldArmy(state, playerId)) return false;
  // Once the Gold ladder is open, the Gold Few IS the breakthrough body — a
  // Silver bought here would outrank the saved Gold step (968) at 976.
  if (profile.goldUnlocked) return false;
  // Dungeon's second body is part of its opening, not a surplus purchase.
  // Keep saving for Medusas after Minotaurs instead of opening Gold first.
  if (profile.silverUnits > 0) return state.players[playerId]?.factionId === "dungeon" &&
    nextPlannedSilver(state, playerId) !== null;
  if (!hasNecromancyPlan(state, playerId) && securedFarTileIds(state, playerId).size > 0) return true;
  // STALLED OPENING: the Silver dwelling stands, the opening Pack core is
  // complete and NOT ONE Far tile has been secured. That seat is exactly the
  // one whose planned Silver body is the difference between winning the Far III
  // fight its whole economy hangs on and refusing/retreating from it again.
  // Measured (Rampart seed eval-19, R4-R7): the Dendroid Few (8 gold) sat
  // unbought at 13 gold for three straight rounds because the treasury target
  // had already jumped to the Gold dwelling PLUS its Gold recruit (37 gold), so
  // the generic Silver guard called the body "surplus"; the first Far landed
  // R10 and the Gold body R11. USER RULING (2026-09-15): buy the PLANNED body
  // first at all cost. Seats that already hold a Far tile took the branch above.
  // Only while the seat is genuinely STALLED: a Gold dwelling it can pay for
  // RIGHT NOW is the bigger milestone and goes up first (the Build and
  // Population tokens are separate, so a flush seat does both the same turn).
  if (!hasNecromancyPlan(state, playerId) && profile.silverUnlocked &&
      openingBronzeCoreReady(state, playerId) &&
      nextPlannedSilver(state, playerId) !== null &&
      !goldDwellingPayableNow(state, playerId)) return true;
  const memory = state.computerMemory?.[playerId];
  if ((memory?.settlementLossStreak ?? 0) >= 2) return true;
  const target = memory?.stickyObjectiveSpaceId;
  const field = target && state.adventure?.fields[target];
  return Boolean(field && isFieldGuarded(field) && field.flagOwnerId !== playerId &&
    (field.location === "settlement" || isOpeningFarMaterialMine(state, playerId, field) ||
      (field.location === "mine" && (field.resource === "gold" || field.resource === "valuables"))) &&
    profile.bronzePacks >= profile.corePackTarget);
}

/** The two-Far income base funds Gold growth before optional town extras. */
export function committedGoldInvestment(state: GameState, playerId: PlayerId): boolean {
  return !hasNecromancyPlan(state, playerId) &&
    securedFarTileIds(state, playerId).size >= 2 && nextGoldLadderStep(state, playerId) !== null;
}

/** Per-faction ordered Silver plan (user ruling 2026-09-15): which Silver bodies
 * to recruit and in what order. Dungeon takes the Minotaur first then the Medusa;
 * Rampart takes the Dendroid and skips the Pegasi. Others fall back to cheapest
 * -first over the whole Silver roster. */
const SILVER_RECRUIT_PLAN: Record<string, string[]> = {
  dungeon: ["dungeon.minotaurs", "dungeon.medusas"],
  rampart: ["rampart.dendroids"],
  // Inferno by the same reading as Rampart's Dendroid ruling: the BREAKTHROUGH
  // body, not the cheapest one. Pit Lords (8 gold, Attack 4 / Health 6, Pack
  // Attack 5 + summon-demons) are the body that can actually carry the Far III
  // fight; Demons (6 gold, Attack 3 / Health 4) are the weakest Silver Few in
  // the game and the cheapest-first fallback bought them first. Measured
  // (Inferno seeds eval-20 and eval-27, R4-R9): every premium level-3 attempt
  // with the Demons/Bronze army was lost or retreated, no Far income ever
  // landed and the Gold body never arrived.
  inferno: ["inferno.pit_lords"],
  // Forge: the flying Jump Troopers (4/1/5) screen the ranged line and carry
  // the Far fights; Bruisers (ranged splash) follow.
  forge: ["forge.jump_troopers", "forge.bruisers"],
};

export function silverRecruitPlan(state: GameState, playerId: PlayerId): string[] {
  const factionId = state.players[playerId]?.factionId ?? "";
  const explicit = (SILVER_RECRUIT_PLAN[factionId] ?? []).filter(
    (id) => coreUnitDefinitions[id]?.tier === "silver" && coreUnitDefinitions[id]?.few,
  );
  if (explicit.length > 0) return explicit;
  return (coreFactionDefinitions[factionId]?.units ?? [])
    .filter((id) => coreUnitDefinitions[id]?.tier === "silver" && coreUnitDefinitions[id]?.few)
    .sort((a, b) => costWeight(coreUnitDefinitions[a].few?.cost) - costWeight(coreUnitDefinitions[b].few?.cost));
}

/** The next Silver this seat should recruit — the first plan entry it does not
 * already own (bank cards excluded). Null once the plan is complete. */
export function nextPlannedSilver(state: GameState, playerId: PlayerId): string | null {
  const army = state.players[playerId]?.army ?? [];
  const owns = (id: string) => army.some((unit) => unit.side !== "bank" && unit.unitDefId === id);
  return silverRecruitPlan(state, playerId).find((id) => !owns(id)) ?? null;
}

function premiumSilverCost(state: GameState, playerId: PlayerId): ResourceCost | null {
  const next = nextPlannedSilver(state, playerId);
  return next ? coreUnitDefinitions[next]?.few?.cost ?? null : null;
}

/** Paid openings need two or three Packs; Necromancy earns its own upgrades. */
export const CORE_PACK_TARGET = 3;
export const CORE_BODY_TARGET = 3;

/** Printed combat/tempo value used for opening reinforcement order. Repeat
 * attacks, retaliation denial and ranged reach matter here because raw stats
 * alone badly undervalue units such as Elves. */
export function unitDevelopmentSideStrength(
  unitDefId: string,
  side: "few" | "pack" | "neutral",
): number {
  const definition = coreUnitDefinitions[unitDefId];
  const face: UnitSideDefinition | undefined = definition?.[side];
  if (!definition || !face) return 0;
  const type = face.type ?? definition.type;
  let value =
    face.attack * 3 +
    face.health * 2 +
    face.defense +
    Math.round(face.initiative / 2) +
    (type === "ranged" ? 3 : type === "flying" ? 2 : 0);
  for (const abilityId of face.abilities ?? []) {
    if (
      abilityId.includes("double-attack") ||
      abilityId.includes("strike-twice") ||
      abilityId.includes("double-shot")
    ) {
      value += Math.max(6, face.attack * 2);
    } else if (abilityId === "ignores-retaliation") {
      value += 6;
    } else if (
      abilityId.includes("second-head") ||
      abilityId.includes("splash") ||
      abilityId.includes("death-cloud")
    ) {
      value += 4;
    } else if (abilityId.includes("ignore-combat-penalties")) {
      value += 3;
    }
  }
  return value;
}

/**
 * Minimum Packs needed before pivoting into Silver for this actual bronze
 * roster. Strong factions want two; weak/attrition openings retain the
 * three-Pack plan. Necromancy has its separate earned-upgrade opening.
 */
export function openingCorePackTarget(
  state: GameState,
  playerId: PlayerId,
): 1 | 2 | 3 {
  // A Necromancer earns its Packs through combat; requiring all three first
  // deadlocks the fights that pay for Wraiths and Zombies.
  if (hasNecromancyPlan(state, playerId)) return 1;
  // User ruling: the opening Pack count per faction is exactly the length of the
  // ordered Pack plan (preferredOpeningPacks — 1st = level-3 bronze, 2nd per
  // faction, optional 3rd). Two-Pack towns therefore stop at two.
  const preferred = preferredOpeningPacks(state, playerId);
  if (preferred.length > 0) return Math.min(3, Math.max(1, preferred.length)) as 1 | 2 | 3;
  const player = state.players[playerId];
  const factionBronze = (coreFactionDefinitions[player?.factionId ?? ""]?.units ?? [])
    .filter((unitDefId) => {
      const def = coreUnitDefinitions[unitDefId];
      return def?.tier === "bronze" && Boolean(def.few && def.pack);
    });
  // Use the faction roster so casualties do not silently change the strategic
  // target from one to three. Custom armies without a faction roster fall back
  // to their actual public cards.
  const unitIds = factionBronze.length >= CORE_BODY_TARGET
    ? factionBronze
    : (player?.army ?? [])
        .filter((unit) => {
          const def = coreUnitDefinitions[unit.unitDefId];
          return unit.side !== "bank" && def?.tier === "bronze" && def.few && def.pack;
        })
        .map((unit) => unit.unitDefId);
  const bronze = unitIds.map((unitDefId) => ({
    few: unitDevelopmentSideStrength(unitDefId, "few"),
    pack: unitDevelopmentSideStrength(unitDefId, "pack"),
  }));
  if (bronze.length < CORE_BODY_TARGET) return CORE_PACK_TARGET;
  bronze.sort((left, right) => (right.pack - right.few) - (left.pack - left.few));
  const projected = (packs: number) =>
    bronze.reduce(
      (sum, unit, index) => sum + (index < packs ? unit.pack : unit.few),
      0,
    );
  if (projected(2) >= 52) return 2;
  return 3;
}

export type ArmyDevelopmentPhase =
  | "establish-core"
  | "unlock-silver"
  | "unlock-gold"
  | "improve-army";

export type ArmyDevelopmentProfile = {
  phase: ArmyDevelopmentPhase;
  totalUnits: number;
  packUnits: number;
  fewUnits: number;
  bronzePacks: number;
  corePackTarget: 1 | 2 | 3;
  silverUnits: number;
  goldUnits: number;
  bronzeUnlocked: boolean;
  silverUnlocked: boolean;
  goldUnlocked: boolean;
  reinforceUnlocked: boolean;
};

function townBuildingEffects(state: GameState, playerId: PlayerId) {
  return Object.values(state.towns ?? {})
    .filter((town) => town.controllerId === playerId)
    .flatMap((town) => town.buildings)
    .map((buildingId) => coreBuildingDefinitions[buildingId]?.effect)
    .filter((effect): effect is NonNullable<typeof effect> => Boolean(effect));
}

export function armyDevelopmentProfile(
  state: GameState,
  playerId: PlayerId,
): ArmyDevelopmentProfile {
  const army = state.players[playerId]?.army ?? [];
  const effects = townBuildingEffects(state, playerId);
  const tierOf = (unitDefId: string): UnitTier | undefined =>
    coreUnitDefinitions[unitDefId]?.tier;
  const packUnits = army.filter((unit) => unit.side === "pack").length;
  const bronzePacks = army.filter(
    (unit) => unit.side === "pack" && tierOf(unit.unitDefId) === "bronze",
  ).length;
  const silverUnits = army.filter(
    (unit) => tierOf(unit.unitDefId) === "silver",
  ).length;
  const goldUnits = army.filter(
    (unit) => tierOf(unit.unitDefId) === "gold",
  ).length;
  const silverUnlocked = effects.some(
    (effect) => effect.type === "UNLOCK_RECRUIT_TIER" && effect.tier === "silver",
  );
  const bronzeUnlocked = effects.some(
    (effect) => effect.type === "UNLOCK_RECRUIT_TIER" && effect.tier === "bronze",
  );
  const goldUnlocked = effects.some(
    (effect) => effect.type === "UNLOCK_RECRUIT_TIER" && effect.tier === "gold",
  );
  const reinforceUnlocked = effects.some(
    (effect) => effect.type === "UNLOCK_REINFORCE",
  );
  const corePackTarget = openingCorePackTarget(state, playerId);

  let phase: ArmyDevelopmentPhase;
  // Gold survivors (including foreign recruits) must not restart the bronze
  // opening after a screen dies or a Pack flips. Fight readiness is separate.
  if (!hasReachedSilverArmy(state, playerId) &&
      (silverUnits === 0 || army.length < CORE_BODY_TARGET || hasNecromancyPlan(state, playerId)) &&
      (army.length < CORE_BODY_TARGET || packUnits < corePackTarget ||
        (preferredOpeningPacks(state, playerId).length > 0 && !openingBronzeCoreReady(state, playerId)))) {
    phase = "establish-core";
  } else if (!silverUnlocked) {
    phase = "unlock-silver";
  } else if (!goldUnlocked) {
    phase = "unlock-gold";
  } else {
    phase = "improve-army";
  }

  return {
    phase,
    totalUnits: army.length,
    packUnits,
    fewUnits: army.length - packUnits,
    bronzePacks,
    corePackTarget,
    silverUnits,
    goldUnits,
    bronzeUnlocked,
    silverUnlocked,
    goldUnlocked,
    reinforceUnlocked,
  };
}

export function hasGoldArmy(state: GameState, playerId: PlayerId): boolean {
  return (state.players[playerId]?.army ?? []).some((unit) => {
    const tier = coreUnitDefinitions[unit.unitDefId]?.tier;
    return unit.side !== "bank" && (tier === "gold" || tier === "azure");
  });
}

/**
 * Valuables the seat must still HOLD for the whole Gold ladder: the Gold
 * dwelling while it is unbuilt, then for every ranked Gold unit its missing
 * Few and Pack inputs (Few + Pack when unowned, the Pack upgrade when at Few,
 * nothing once a Pack stands). USER RULING (2026-09-16): valuables are never
 * sold below this — e.g. a ladder needing 4 keeps 4 after the dwelling, 3
 * once the level-7 Few is bought, 1 with the level-7 Pack, 0 with every Pack
 * done; a Gold casualty reopens its steps and the reserve rises again. Only
 * the surplus above it may be sold.
 */
export function goldLadderValuablesReserve(state: GameState, playerId: PlayerId): number {
  const player = state.players[playerId];
  if (!player) return 0;
  let reserve = 0;
  if (!armyDevelopmentProfile(state, playerId).goldUnlocked) {
    const dwelling = factionBuildingForEffect(state, playerId,
      (effect) => effect.type === "UNLOCK_RECRUIT_TIER" && effect.tier === "gold");
    reserve += dwelling ? effectiveTownBuildingCost(state, dwelling).valuables ?? 0 : 0;
  }
  for (const unitDefId of rankedGoldUnits(state, playerId)) {
    const owned = player.army.find((unit) => unit.side !== "bank" && unit.unitDefId === unitDefId);
    const definition = coreUnitDefinitions[unitDefId];
    if (!owned) {
      reserve += (definition?.few?.cost.valuables ?? 0) + (definition?.pack?.cost.valuables ?? 0);
    } else if (owned.side === "few") {
      reserve += (reinforceCostFor(state, playerId, owned.id, false, false, false) ??
        definition?.pack?.cost)?.valuables ?? 0;
    }
  }
  return reserve;
}

/** A Gold casualty reopens its recruit step, never the Bronze opening. */
export function hasReachedGoldArmy(state: GameState, playerId: PlayerId): boolean {
  return hasGoldArmy(state, playerId) || Boolean(state.computerMemory?.[playerId]?.goldArmyEstablished);
}

export function hasReachedSilverArmy(state: GameState, playerId: PlayerId): boolean {
  return hasReachedGoldArmy(state, playerId) || Boolean(state.computerMemory?.[playerId]?.silverArmyEstablished) ||
    (state.players[playerId]?.army ?? []).some(unit => unit.side !== "bank" && coreUnitDefinitions[unit.unitDefId]?.tier === "silver");
}

/** After Silver, keep the level-3 Pack and at most one cheap replacement
 * level-1/2 Few screen. After Gold, paid Bronze stops, including replacements.
 * This is an AI spending rule; free rewards and engine legality stay separate. */
export function goldArmyAllowsBronzePurchase(
  state: GameState,
  playerId: PlayerId,
  unitDefId: string,
  kind: "recruit" | "reinforce" | "stack",
): boolean {
  const definition = coreUnitDefinitions[unitDefId];
  if (definition?.tier !== "bronze") return true;
  if (hasReachedGoldArmy(state, playerId)) return false;
  if (!hasReachedSilverArmy(state, playerId)) return true;
  const player = state.players[playerId];
  const bronze = bronzeUnitsByLevel(state, playerId);
  if (kind !== "recruit") return kind === "reinforce" &&
    (unitDefId === bronze[2] || (player.factionId === "conflux" && unitDefId === "conflux.sprites"));
  const cost = definition.few?.cost;
  return bronze.slice(0, 2).includes(unitDefId) && Boolean(cost) &&
    (cost?.gold ?? 0) <= 4 && !(cost?.buildingMaterials || cost?.valuables) &&
    !player.army.some(unit => unit.side !== "bank" && bronze.slice(0, 2).includes(unit.unitDefId));
}

/**
 * A fair neutral fight is acceptable once the composition-aware core is ready.
 * Guaranteed Quick Combat wins are handled separately and never need this gate.
 */
export function armyReadyForContestedFight(
  state: GameState,
  playerId: PlayerId,
): boolean {
  const profile = armyDevelopmentProfile(state, playerId);
  return (
    profile.totalUnits >= CORE_BODY_TARGET &&
    // 3 core packs, OR a Silver/Gold body: a Silver unit (e.g. Crusaders) carries a
    // contested lv3 guard fight even with only two bronze packs behind it (user ruling
    // 2026-09-18, live tutoring: "with silver, certainly doable"). Field-specific
    // winnability is still checked by canBeatGuardedField at the objective.
    (profile.packUnits >= profile.corePackTarget ||
      hasGoldArmy(state, playerId) ||
      hasReachedSilverArmy(state, playerId))
  );
}

const FIRST_AID_TENT_ID = "war_machine.first_aid_tent";

function ownedWarMachineCount(state: GameState, playerId: PlayerId): number {
  return (state.players[playerId]?.permanents ?? []).filter((cardId) =>
    cardId.startsWith("war_machine."),
  ).length;
}

/**
 * The one opening shop exception: a Tent is worth the detour when there is a
 * real army to preserve and buying it leaves the dwelling/recruit reserve.
 */
export function shouldPrioritizeFirstAidTent(
  state: GameState,
  playerId: PlayerId,
): boolean {
  if ((state.round ?? 0) >= 5) return false;
  const player = state.players[playerId];
  if (
    !player ||
    player.permanents?.includes(FIRST_AID_TENT_ID) ||
    ownedWarMachineCount(state, playerId) > 0
  ) return false;
  const profile = armyDevelopmentProfile(state, playerId);
  const hasPremiumUnit = player.army.some((unit) => {
    const tier = coreUnitDefinitions[unit.unitDefId]?.tier;
    return tier === "silver" || tier === "gold" || tier === "azure";
  });
  const hasArmyWorthPreserving =
    hasPremiumUnit ||
    profile.packUnits >= profile.corePackTarget ||
    player.heroDefId === "gem";
  const target = developmentResourceTargets(state, playerId);
  return (
    hasArmyWorthPreserving &&
    (player.resources.gold ?? 0) >= target.gold + 9
  );
}

/** Late-development machine shopping: at most two machines, with a much
 * larger surplus required for the second so it cannot drain army plans. */
export function shouldSeekLateWarMachineShop(
  state: GameState,
  playerId: PlayerId,
): boolean {
  if ((state.round ?? 0) < 5) return false;
  if (armyDevelopmentProfile(state, playerId).phase !== "improve-army") return false;
  const machineCount = ownedWarMachineCount(state, playerId);
  if (machineCount >= 2) return false;
  const target = developmentResourceTargets(state, playerId);
  const surplusNeeded = machineCount === 0 ? 12 : 24;
  return (
    (state.players[playerId]?.resources.gold ?? 0) >=
    target.gold + surplusNeeded
  );
}

/**
 * Whether THIS player has secured the opening Far (II-III) economy the computer
 * is looking for: a Settlement, Gold Mine, or Valuables Mine.
 *
 * Scoped strictly to the player's OWN captured holdings. Revealing a settlement
 * does not earn income and must not switch off the capture priority.
 * A previous version scanned every
 * revealed Far field globally, so an OPPONENT opening a Far mine wrongly flipped
 * this player's rush decisions (turned off the bronze rush, re-opened
 * side-neutral fights) purely because a rival had expanded.
 */
export function hasOpenedFarEconomy(
  state: GameState,
  playerId: PlayerId,
): boolean {
  const adventure = state.adventure;
  if (!adventure || !state.players[playerId]) return false;
  return Object.values(adventure.fields).some((field) => {
    if (field.flagOwnerId !== playerId) return false;
    const tile = field.tileInstanceId
      ? adventure.tiles[field.tileInstanceId]
      : undefined;
    if (tile?.group !== "far" || tile.faceDown) return false;
    if (field.location === "settlement") return true;
    return (
      field.location === "mine" &&
      (field.resource === "gold" || field.resource === "valuables")
    );
  });
}

/**
 * Opening fallback used by conquest navigation. From round 3 onward, a ready
 * bronze composition is a real rush force when the first Far tiles failed to yield
 * a Settlement / premium mine. The caller still checks the scenario victory
 * mode so non-conquest games continue pursuing their actual win condition.
 */
export function shouldLaunchBronzeRush(
  state: GameState,
  playerId: PlayerId,
): boolean {
  if ((state.round ?? 0) < 3) return false;
  const profile = armyDevelopmentProfile(state, playerId);
  return (
    profile.totalUnits >= CORE_BODY_TARGET &&
    profile.bronzePacks >= profile.corePackTarget &&
    !hasOpenedFarEconomy(state, playerId)
  );
}

/** The faction's income building (City Hall — RESOURCE_ROUND_CHOICE). */
export function factionIncomeBuilding(state: GameState, playerId: PlayerId) {
  return factionBuildingForEffect(
    state,
    playerId,
    (effect) => effect.type === "RESOURCE_ROUND_CHOICE",
  );
}

/**
 * Last round in which the hall may go BEFORE the next dwelling. USER RULING
 * (2026-09-16): the City Hall is situational — ideal on R4 or before,
 * marginal on R5–R6 (surplus only, never ahead of a dwelling), OFF LIMITS
 * from R7. Ranked (36 replays, 60 human seats ≥8 rounds): 40 seats built it,
 * median R4.
 */
export const INCOME_FIRST_LAST_ROUND = 4;
/**
 * Same window when the bronze-only stretch the hall implies is SLOW or HARD:
 * no unit experience and no commanders (Packs never grow, so Silver is the only
 * way the army improves), or human-played neutrals (PvP Neutral Control: a
 * rival seat focuses the guards, so bronze fights cost more). Reasoning, not
 * replay-evidenced — every ranked record ran with commanders and unit
 * experience on and the scripted Neutral AI.
 */
export const INCOME_FIRST_LAST_ROUND_SLOW = 4;
/** USER RULING: the City Hall is off limits from round 7 — its +5/round cannot pay back. */
export const INCOME_NEVER_FROM_ROUND = 7;
/**
 * USER RULING (2026-09-17): Necropolis and Stronghold never build their City
 * Hall — Necromancy grows the army for free and Stronghold's cheap bodies
 * make the +4/round income a wasted build token. Faction (town) ids.
 */
export const NO_INCOME_HALL_FACTIONS: ReadonlySet<string> = new Set(["necropolis", "stronghold"]);
export function factionSkipsIncomeHall(state: GameState, playerId: PlayerId): boolean {
  return NO_INCOME_HALL_FACTIONS.has(state.players[playerId]?.factionId ?? "");
}
/**
 * Factions whose City Hall pays too little (Forge: 3 gold, or 2 random enemy
 * discards) to outrank a dwelling as hall-first; it is still built normally.
 */
export const NO_HALL_FIRST_FACTIONS: ReadonlySet<string> = new Set(["forge"]);
/** A hostile main hero this many levels (or more) ahead = "behind": army first, no hall-first. */
export const INCOME_FIRST_LEVEL_DEFICIT = 2;

/**
 * Whether the bronze-only stretch a hall-first plan implies is slow: Packs
 * cannot rank up (no unit experience) and no commander grows with the hero.
 */
export function bronzeStretchIsSlow(state: GameState): boolean {
  const commanders = Boolean(state.wog?.enabled && state.wog.commanders);
  return !unitExperienceActive(state) && !commanders;
}

/**
 * Neutral guards are played AGAINST this seat by a human (PvP Neutral Control
 * with a live human seat other than ours; co-op keeps the scripted Neutral AI).
 * Manual Guard Control is NOT this case — there the fighter commands the guards.
 */
export function neutralsArePlayerControlled(
  state: GameState,
  playerId: PlayerId,
): boolean {
  if (state.gameMode === "coop" || !state.adventure?.pvpNeutralControl) return false;
  return Object.entries(state.controllers ?? {}).some(
    ([otherId, controller]) =>
      otherId !== playerId &&
      controller?.kind === "human" &&
      !state.players[otherId]?.eliminated,
  );
}

function isHostile(state: GameState, playerId: PlayerId, otherId: string): boolean {
  return (
    otherId !== playerId &&
    otherId !== NEUTRAL_PLAYER_ID &&
    !state.players[otherId]?.eliminated &&
    !playersAreAllied(state, playerId, otherId)
  );
}

/** Largest level lead a live hostile MAIN hero holds over ours (public levels). */
function hostileMainHeroLevelLead(state: GameState, playerId: PlayerId): number {
  const levelOf = (id: string) =>
    Object.values(state.heroes ?? {}).reduce(
      (best, hero) =>
        hero.controllerId === id && hero.kind === "main" ? Math.max(best, hero.level) : best,
      0,
    );
  const own = levelOf(playerId);
  if (own <= 0) return 0;
  let lead = 0;
  for (const otherId of Object.keys(state.players)) {
    if (isHostile(state, playerId, otherId)) {
      lead = Math.max(lead, levelOf(otherId) - own);
    }
  }
  return lead;
}

/** A live hostile seat already owns a Gold dwelling (public town buildings). */
function hostileGoldDwellingStands(state: GameState, playerId: PlayerId): boolean {
  return Object.values(state.towns ?? {}).some(
    (town) =>
      town.controllerId &&
      isHostile(state, playerId, town.controllerId) &&
      town.buildings.some((id) => {
        const effect = coreBuildingDefinitions[id]?.effect;
        return effect?.type === "UNLOCK_RECRUIT_TIER" && effect.tier === "gold";
      }),
  );
}

/**
 * SITUATIONAL income-first step: the still-missing City Hall when building it
 * before the next dwelling is the better tempo — else null and the hall stays an
 * ordinary side build (surplus only, dwelling fund protected).
 *
 * Evidence, all 23 ranked replays through 2026-09-11 (not just the last four):
 * hall-first winners (hall R2–R3, Silver R5–R6: dc1o0g, 0oyq08, b7gyqi, cpgbmq,
 * wv1n1h, mnrtc8, al8ilr) and Silver-first winners (Silver R3–R5, hall R5–R7 or
 * never: 06j7su, 58nqa1, 910btc, l6675g, 5fcaqr, id6j4t) both exist; the loser
 * who built Silver on R3 and starved (ceqyjy) is one seat. What separates the
 * winners is the GOLD dwelling by R7 (2p games with both seats reaching Gold:
 * winner R7 vs loser R9 twice, R7 vs R11 once). No seat built a hall after R7.
 * So the hall goes first only while it buys that tempo:
 *  - the Pack core stands and has captured its first FAR economy;
 *  - round ≤ INCOME_FIRST_LAST_ROUND (later the +5/round cannot repay before
 *    the Gold spending peak; from INCOME_NEVER_FROM_ROUND it is never built);
 *  - the seat is not already behind — a hostile main hero
 *    INCOME_FIRST_LEVEL_DEFICIT levels up, or an enemy Gold dwelling while we
 *    still lack Silver — then every coin goes to the army;
 *  - the next dwelling is NOT in reach: affordable now (trading the input gap
 *    from gold counts — the rush planner does that) → build the dwelling; from
 *    landing next Resource Round → do not push it out for the hall.
 * Town costs make this vary by faction on their own (Bulwark's 10g/6b hall,
 * the 8g/6b/3v Silver dwellings), so no per-town table is hard-coded.
 *
 * Big picture: choosing the hall means fighting with the bronze core for a
 * while longer. That is only a plan when the core still HAS work it can win —
 * the map policy passes `bronzeCoreHasWork` (a beatable guard or unguarded
 * progress in the objective list; false = the army is the bottleneck, so the
 * dwelling comes first) — and the window shrinks to INCOME_FIRST_LAST_ROUND_SLOW
 * when the rule variants make that stretch slow (no unit experience, no
 * commanders) or hard (player-controlled neutrals, which also lowers the
 * tolerated hero-level deficit to one).
 */
export function incomeBuildingBeforeDwelling(
  state: GameState,
  playerId: PlayerId,
  bronzeCoreHasWork = true,
) {
  if (!bronzeCoreHasWork || factionSkipsIncomeHall(state, playerId) ||
      NO_HALL_FIRST_FACTIONS.has(state.players[playerId]?.factionId ?? "") || needsNecromancyVampire(state, playerId) ||
      needsPremiumSilverBreakthrough(state, playerId) || securedFarTileIds(state, playerId).size >= 2) return null;
  // No "first FAR income captured" precondition: the ranked seats build the
  // hall on R2–R4, before their first Far fight (median first fight R3–R4),
  // and the eval seats that waited for the Far capture never built it at all
  // (0 halls in 60 impossible seeds) — the Silver dwelling was always "in
  // reach next round" by then. The tempo guard below protects that dwelling.
  const profile = armyDevelopmentProfile(state, playerId);
  const building = factionIncomeBuilding(state, playerId);
  if (!building) return null;
  // FACTION-SPECIFIC payout: Rampart's hall pays 7 gold, Inferno's 6, most
  // others 4–5. A high-payout hall repays itself within two Resource Rounds
  // and is what every ranked Rampart seat built by R3 (5 of 6, R2–R3); the
  // Rampart eval seeds that missed R9 were pure gold starvation (10 income,
  // Gold Dragons 22 gold). Such a hall may go during the Pack-core opening
  // and without the cushion below — the tempo guard on the dwelling still
  // applies. A low-payout hall (Tower +4) measured as harm when bought on R3
  // with the last gold (seeds eval-11/12: Silver dwelling slipped to R6–R8),
  // so it keeps waiting for the finished core and the five-gold cushion.
  const payout = building.effect?.type === "RESOURCE_ROUND_CHOICE"
    ? Math.max(0, ...building.effect.options.map((option) => option.gold ?? 0))
    : 0;
  const highPayout = payout >= 6;
  const duringPackCore = highPayout && profile.phase === "establish-core" &&
    profile.reinforceUnlocked && profile.bronzeUnlocked;
  if (!duringPackCore && profile.phase !== "unlock-silver" && profile.phase !== "unlock-gold") {
    return null;
  }
  const built = Object.values(state.towns ?? {}).some(
    (town) =>
      town.controllerId === playerId && town.buildings.includes(building.id),
  );
  if (built) return null;
  const round = state.round ?? 0;
  const hardNeutrals = neutralsArePlayerControlled(state, playerId);
  const lastRound =
    bronzeStretchIsSlow(state) || hardNeutrals
      ? INCOME_FIRST_LAST_ROUND_SLOW
      : INCOME_FIRST_LAST_ROUND;
  if (round > lastRound) return null;
  const levelDeficit = hardNeutrals ? 1 : INCOME_FIRST_LEVEL_DEFICIT;
  if (hostileMainHeroLevelLead(state, playerId) >= levelDeficit) return null;
  if (!profile.silverUnlocked && hostileGoldDwellingStands(state, playerId)) return null;
  const dwelling = factionBuildingForEffect(
    state,
    playerId,
    (effect) =>
      effect.type === "UNLOCK_RECRUIT_TIER" &&
      effect.tier === (profile.silverUnlocked ? "gold" : "silver"),
  );
  const player = state.players[playerId];
  if (!player) return null;
  // The hall must be payable NOW (the build token is otherwise idle this
  // round) ...
  const hallCost = effectiveTownBuildingCost(state, building);
  if (!purchaseReachable(player.resources, {}, hallCost, 0)) return null;
  const afterHall: ResourceCost = {
    gold: (player.resources.gold ?? 0) - (hallCost.gold ?? 0),
    buildingMaterials:
      (player.resources.buildingMaterials ?? 0) - (hallCost.buildingMaterials ?? 0),
    valuables: (player.resources.valuables ?? 0) - (hallCost.valuables ?? 0),
  };
  // ... and it keeps the five-gold cushion. Measured (Tower, impossible,
  // seeds eval-11/12): a R3 hall bought with exactly 10 gold left 0; the
  // next fight's casualties then ate the R5 income for re-recruits and the
  // Silver dwelling slipped to R6–R8 (Gold body R11 / never).
  if (!highPayout && (afterHall.gold ?? 0) < 5) return null;
  if (dwelling?.cost) {
    // ... and never ahead of a dwelling the seat can build this round, nor at
    // the cost of pushing a next-Resource-Round dwelling out: the hall is only
    // ever a use of a round the dwelling could not have taken anyway.
    if (purchaseReachable(player.resources, {}, dwelling.cost, 0)) return null;
    const production = player.production ?? {};
    if (
      purchaseReachable(player.resources, production, dwelling.cost, 1) &&
      !purchaseReachable(afterHall, production, dwelling.cost, 1)
    ) {
      return null;
    }
  }
  return building;
}

export function factionBuildingForEffect(
  state: GameState,
  playerId: PlayerId,
  predicate: (effect: TownBuildingEffect) => boolean,
) {
  const factionId = state.players[playerId]?.factionId;
  if (!factionId) return null;
  for (const buildingId of coreFactionDefinitions[factionId]?.buildings ?? []) {
    const building = coreBuildingDefinitions[buildingId];
    if (building?.effect && predicate(building.effect)) {
      return building;
    }
  }
  return null;
}

/** Exact next dwelling cost, used to stop the market from selling the plan. */
export function nextDevelopmentBuildingCost(
  state: GameState,
  playerId: PlayerId,
): ResourceCost | null {
  const profile = armyDevelopmentProfile(state, playerId);
  if (needsPremiumSilverBreakthrough(state, playerId) && !needsNecromancyVampire(state, playerId)) {
    return profile.silverUnlocked ? null : factionBuildingForEffect(state, playerId,
      effect => effect.type === "UNLOCK_RECRUIT_TIER" && effect.tier === "silver")?.cost ?? null;
  }
  if (profile.silverUnlocked && needsNecromancyVampire(state, playerId)) return null;
  const phase = profile.phase;
  // Income-first: with the Pack core ready, the missing City Hall is the build
  // being saved for (its cost drives the treasury target and the rush trades).
  const income = incomeBuildingBeforeDwelling(state, playerId);
  if (income) return income.cost ?? null;
  if (phase === "establish-core") {
    if (!profile.reinforceUnlocked) {
      return (
        factionBuildingForEffect(
          state,
          playerId,
          (effect) => effect.type === "UNLOCK_REINFORCE",
        )?.cost ?? null
      );
    }
    if (!profile.bronzeUnlocked) {
      return (
        factionBuildingForEffect(
          state,
          playerId,
          (effect) =>
            effect.type === "UNLOCK_RECRUIT_TIER" &&
            effect.tier === "bronze",
        )?.cost ?? null
      );
    }
    // Citadel + Bronze already stand (the live lobby pre-builds both): the
    // Pack core needs only gold-paid Population reinforces, so the build
    // milestone being SAVED FOR is already the next missing dwelling. Without
    // this the opening rounds had no savings target at all and side buildings
    // ate the dwelling's materials on round 1 (measured: silver slid to R6-R8).
  }
  const tier =
    phase === "unlock-silver"
      ? "silver"
      : phase === "unlock-gold"
        ? "gold"
        : phase === "establish-core"
          ? !profile.silverUnlocked
            ? "silver"
            : !profile.goldUnlocked
              ? "gold"
              : null
          : null;
  if (!tier) return null;
  return (
    factionBuildingForEffect(
      state,
      playerId,
      (effect) => effect.type === "UNLOCK_RECRUIT_TIER" && effect.tier === tier,
    )?.cost ?? null
  );
}

// ---------------------------------------------------------------------------
// GOLD LADDER
// ---------------------------------------------------------------------------
//
// User rule (2026-09-12) backed by the ranked replays of 2026-09-10/11: buy the
// top Gold Few (the "lv7" body) first, then the lower Gold Few, then upgrade the
// top unit to a Pack, then the lower one. Silver stays at Few (one Pack at most)
// until the top Gold body is owned. Evidence: the Tower winner bought the Titans
// Few the round its dwelling stood (R7), the Titans Pack plus the Nagas Few on
// R9 and won the batch's only PvP on R10 at a LOWER hero level; the Necropolis
// loser reached Gold on R9, bought both Fews and upgraded the CHEAPER one to a
// Pack first — it was defending with a Dread Knights Pack and a Ghost Dragons
// Few when the Titans arrived.

const costWeight = (cost: ResourceCost | undefined): number =>
  (cost?.gold ?? 0) +
  (cost?.buildingMaterials ?? 0) * 3 +
  (cost?.valuables ?? 0) * 7;

/**
 * The faction's Gold units, strongest first: printed Few cost (weighted like
 * the dwelling planner), ties broken by roster order (later = higher level).
 * Index 0 is the "lv7" body. Units without both printed sides are skipped.
 */
export function rankedGoldUnits(state: GameState, playerId: PlayerId): string[] {
  const player = state.players[playerId];
  const roster = coreFactionDefinitions[player?.factionId ?? ""]?.units ?? [];
  return roster
    .map((unitDefId, index) => ({ unitDefId, index, unit: coreUnitDefinitions[unitDefId] }))
    .filter(({ unit, unitDefId }) => unit?.tier === "gold" && Boolean(unit.few) && Boolean(unit.pack) &&
      !factoryGoldUnitConflict(player?.army ?? [], unitDefId))
    .sort(
      (left, right) =>
        costWeight(right.unit!.few!.cost) - costWeight(left.unit!.few!.cost) ||
        right.index - left.index,
    )
    .map(({ unitDefId }) => unitDefId);
}

export type GoldLadderStep = {
  unitDefId: string;
  kind: "recruit" | "reinforce";
  cost: ResourceCost;
  /** 0 = the top Gold body. */
  rank: number;
};

/** Remaining dwelling prerequisites plus the first level-7 body. No speculative
 * loot, trades or expiring Legion vouchers are counted as future income. */
export function firstGoldMilestoneCost(state: GameState, playerId: PlayerId): Required<ResourceCost> | null {
  const player = state.players[playerId];
  const unitId = rankedGoldUnits(state, playerId)[0];
  if (!player || !unitId || player.army.some(unit => unit.unitDefId === unitId && unit.side !== "bank")) return null;
  const dwelling = factionBuildingForEffect(state, playerId,
    effect => effect.type === "UNLOCK_RECRUIT_TIER" && effect.tier === "gold");
  if (!dwelling) return null;
  const cost = { gold: 0, buildingMaterials: 0, valuables: 0 };
  const add = (part: ResourceCost) => {
    for (const key of ["gold", "buildingMaterials", "valuables"] as const) cost[key] += part[key] ?? 0;
  };
  const built = new Set(Object.values(state.towns ?? {}).filter(town => town.controllerId === playerId)
    .flatMap(town => town.buildings));
  const seen = new Set<string>();
  const addBuilding = (id: string) => {
    if (built.has(id) || seen.has(id)) return;
    seen.add(id);
    const building = coreBuildingDefinitions[id];
    if (!building) return;
    for (const prerequisite of building.prerequisites ?? []) addBuilding(prerequisite);
    add(effectiveTownBuildingCost(state, building));
  };
  if (!armyDevelopmentProfile(state, playerId).goldUnlocked) addBuilding(dwelling.id);
  add(coreUnitDefinitions[unitId]!.few!.cost);
  return cost;
}

/** The actual Resource rounds remaining through R9, not nine income ticks.
 * After R9, keep planning over the next two rounds to recover a late start. */
export function goldMilestoneShortfall(
  state: GameState, playerId: PlayerId, spend: ResourceCost = {},
): Required<ResourceCost> {
  const shortfall = { gold: 0, buildingMaterials: 0, valuables: 0 };
  const balance = goldMilestoneBalance(state, playerId, spend);
  if (!balance) return shortfall;
  for (const key of ["gold", "buildingMaterials", "valuables"] as const) shortfall[key] = Math.max(0, -balance[key]);
  return shortfall;
}

/** Stock plus deadline income minus the first-Gold milestone (and `spend`),
 * per resource: negative = short, positive = surplus. Null without a milestone. */
function goldMilestoneBalance(
  state: GameState, playerId: PlayerId, spend: ResourceCost = {},
): Required<ResourceCost> | null {
  const cost = firstGoldMilestoneCost(state, playerId);
  const player = state.players[playerId];
  if (!cost || !player) return null;
  let payouts = 0;
  const deadline = state.round <= 9 ? 9 : state.round + 2;
  for (let round = state.round + 1; round <= deadline; round += 1) {
    if (round > 1 && round % 2 === 1) payouts += 1;
  }
  const balance = { gold: 0, buildingMaterials: 0, valuables: 0 };
  for (const key of ["gold", "buildingMaterials", "valuables"] as const) {
    balance[key] = player.resources[key] + payouts * (player.production?.[key] ?? 0) - cost[key] - (spend[key] ?? 0);
  }
  return balance;
}

/**
 * Gold the Trading Post still needs at the deadline to buy the milestone's
 * missing materials / valuables, after deadline income and after surplus
 * materials are exchanged 3 → 1 valuable. Gold is the only stock that converts
 * into the scarce inputs, so gold "above the milestone's gold cost" is not
 * spare while this is positive. Printed trade rates only.
 */
export function goldMilestoneConversionGold(state: GameState, playerId: PlayerId, spend: ResourceCost = {}): number {
  const balance = goldMilestoneBalance(state, playerId, spend);
  if (!balance) return 0;
  const valuablesRate = goldPurchaseRate("valuables");
  const materialsRate = goldPurchaseRate("buildingMaterials");
  const exchange = materialsForValuableRate();
  const missingMaterials = Math.max(0, -balance.buildingMaterials);
  let missingValuables = Math.max(0, -balance.valuables);
  if (exchange && balance.buildingMaterials > 0) {
    missingValuables = Math.max(0, missingValuables - Math.floor(balance.buildingMaterials / exchange.materialsPerValuable));
  }
  return missingValuables * (valuablesRate?.goldPerUnit ?? 0) + missingMaterials * (materialsRate?.goldPerUnit ?? 0);
}

/** Optional spending must not create or worsen a deadline funding gap. Core
 * recovery and the planned Silver breakthrough decide in their own paths. */
export function spendWorsensGoldMilestone(state: GameState, playerId: PlayerId, spend: ResourceCost): boolean {
  const before = goldMilestoneShortfall(state, playerId);
  const after = goldMilestoneShortfall(state, playerId, spend);
  return (["gold", "buildingMaterials", "valuables"] as const).some(key => after[key] > before[key]);
}

/**
 * The next Gold-army purchase in the taught order: the highest-ranked missing
 * Few, else the highest-ranked unit still at Few (its Pack), with an affordable
 * first-Pack fallback for the non-Necropolis two-Far plan. Null before the
 * Gold dwelling stands or once every Gold unit is a Pack. A Gold body lost in
 * combat re-opens its Few step, so the ladder "goes back" on its own.
 */
export function nextGoldLadderStep(
  state: GameState,
  playerId: PlayerId,
): GoldLadderStep | null {
  const player = state.players[playerId];
  if (!player || !armyDevelopmentProfile(state, playerId).goldUnlocked) return null;
  const ranked = rankedGoldUnits(state, playerId);
  const owned = (unitDefId: string) =>
    player.army.find((unit) => unit.side !== "bank" && unit.unitDefId === unitDefId);
  for (const [rank, unitDefId] of ranked.entries()) {
    if (!owned(unitDefId)) {
      return { unitDefId, kind: "recruit", cost: applyRecruitGoldDiscount(state, playerId,
        { kind: "recruit", unitDefId }, coreUnitDefinitions[unitDefId]!.few!.cost), rank };
    }
  }
  // Once both Gold bodies stand, take an affordable first Pack when scarce
  // inputs block the preferred one. This gives the army its breakthrough now
  // instead of parking both Few cards through several Resource Rounds.
  if (player.factionId !== "necropolis" && securedFarTileIds(state, playerId).size >= 2 &&
      !ranked.some(id => owned(id)?.side === "pack")) {
    const affordable = ranked.find(id => {
      const unit = owned(id);
      const cost = unit && reinforceCostFor(state, playerId, unit.id, false, false, false);
      return unit?.side === "few" && cost &&
        player.resources.gold >= (cost.gold ?? 0) &&
        player.resources.buildingMaterials >= (cost.buildingMaterials ?? 0) &&
        player.resources.valuables >= (cost.valuables ?? 0);
    });
    if (affordable) return { unitDefId: affordable, kind: "reinforce",
      cost: reinforceCostFor(state, playerId, owned(affordable)!.id, false, false, false) ??
        coreUnitDefinitions[affordable]!.pack!.cost, rank: ranked.indexOf(affordable) };
  }
  for (const [rank, unitDefId] of ranked.entries()) {
    if (owned(unitDefId)?.side === "few") {
      return { unitDefId, kind: "reinforce", cost: reinforceCostFor(state, playerId,
        owned(unitDefId)!.id, false, false, false) ?? coreUnitDefinitions[unitDefId]!.pack!.cost, rank };
    }
  }
  return null;
}

/** Dungeon's remaining mandatory spend through Black Dragons Pack. Optional
 * purchases may use only resources above this amount until the Pack exists. */
export function dungeonBlackDragonPackBudget(
  state: GameState,
  playerId: PlayerId,
): Required<ResourceCost> | null {
  const player = state.players[playerId];
  if (player?.factionId !== "dungeon" ||
      player.army.some(unit => unit.unitDefId === "dungeon.black_dragons" && unit.side === "pack")) return null;
  const dragon = player.army.find(unit => unit.unitDefId === "dungeon.black_dragons" && unit.side === "few");
  const toPack = dragon
    ? reinforceCostFor(state, playerId, dragon.id, false, false, false) ??
      coreUnitDefinitions["dungeon.black_dragons"].pack!.cost
    : coreUnitDefinitions["dungeon.black_dragons"].pack!.cost;
  const toFew = dragon ? null : firstGoldMilestoneCost(state, playerId);
  return {
    gold: (toFew?.gold ?? 0) + (toPack.gold ?? 0),
    buildingMaterials: (toFew?.buildingMaterials ?? 0) + (toPack.buildingMaterials ?? 0),
    valuables: (toFew?.valuables ?? 0) + (toPack.valuables ?? 0),
  };
}

export type ResourceUrgency = Record<"gold" | "buildingMaterials" | "valuables", number>;

/**
 * Resource Rounds of printed production each development-target deficit
 * still needs (0 = already covered). Gold and valuables deficits are NOT
 * interchangeable: 16 gold short on 15 income is one Resource Round, 3
 * valuables short on 1 per round is three — the market/objective planners
 * read this instead of raw deficits so the true bottleneck wins.
 */
export function resourceUrgency(state: GameState, playerId: PlayerId): ResourceUrgency {
  const player = state.players[playerId];
  const target = developmentResourceTargets(state, playerId);
  const urgency: ResourceUrgency = { gold: 0, buildingMaterials: 0, valuables: 0 };
  if (!player) return urgency;
  for (const key of ["gold", "buildingMaterials", "valuables"] as const) {
    const deficit = target[key] - (player.resources[key] ?? 0);
    if (deficit <= 0) continue;
    urgency[key] = deficit / Math.max(1, player.production?.[key] ?? 0);
  }
  return urgency;
}

/**
 * USER RULING (2026-09-16, "valuables-starved maps"): gold is covered within a
 * Resource Round but valuables are two or more away. Measured (Necropolis,
 * impossible, seeds eval-10/29): 39–52 gold idle at R9 on 1 valuable per
 * round, body at R11. Such a seat must go and GET valuables — explore near /
 * deeper tiles, fight creature banks that pay them, take a valuables hall
 * option — instead of waiting on the trickle.
 */
export function valuablesStarved(state: GameState, playerId: PlayerId): boolean {
  const urgency = resourceUrgency(state, playerId);
  return urgency.valuables >= 2 && urgency.gold <= 1;
}

/**
 * Resource Rounds until `cost` is payable (0 = now), or null beyond
 * `maxRounds`. With `allowTrade` the materials/valuables gap may be bought
 * from gold at Trading Post rates ({@link purchaseReachable}); without it only
 * printed production counts — the read for a seat with no Trading Post in
 * reach, where "reachable by trade" was a fiction that held purchases back.
 */
export function purchaseLandingRounds(
  resources: ResourceCost,
  production: ResourceCost,
  cost: ResourceCost,
  allowTrade: boolean,
  maxRounds = 4,
): number | null {
  for (let rounds = 0; rounds <= maxRounds; rounds += 1) {
    if (allowTrade) {
      if (purchaseReachable(resources, production, cost, rounds)) return rounds;
      continue;
    }
    const enough = (["gold", "buildingMaterials", "valuables"] as const).every((key) =>
      (resources[key] ?? 0) + rounds * (production[key] ?? 0) >= (cost[key] ?? 0));
    if (enough) return rounds;
  }
  return null;
}

/**
 * Whether `cost` is payable after `rounds` more Resource Rounds of printed
 * production, buying any remaining materials/valuables gap from that gold at
 * Trading Post rates (2 gold per material, 6 per valuable). Public state only.
 */
export function purchaseReachable(
  resources: ResourceCost,
  production: ResourceCost,
  cost: ResourceCost,
  rounds: number,
): boolean {
  const gold = (resources.gold ?? 0) + rounds * (production.gold ?? 0);
  const materials =
    (resources.buildingMaterials ?? 0) + rounds * (production.buildingMaterials ?? 0);
  const valuables = (resources.valuables ?? 0) + rounds * (production.valuables ?? 0);
  const need =
    (cost.gold ?? 0) +
    2 * Math.max(0, (cost.buildingMaterials ?? 0) - materials) +
    6 * Math.max(0, (cost.valuables ?? 0) - valuables);
  return gold >= need;
}

export function goldPurchaseReachable(
  state: GameState,
  playerId: PlayerId,
  cost: ResourceCost,
  rounds: number,
): boolean {
  const player = state.players[playerId];
  if (!player) return false;
  return purchaseReachable(player.resources, player.production ?? {}, cost, rounds);
}

/**
 * True when paying `spend` now would push a saved purchase past the next
 * Resource Round: it lands next round without the spend but not with it. A
 * purchase that changes nothing about the landing round is never a delay, so
 * cheap bodies keep flowing while the savings are safe.
 */
export function spendDelaysSavedCost(
  state: GameState,
  playerId: PlayerId,
  cost: ResourceCost,
  spend: ResourceCost,
): boolean {
  const player = state.players[playerId];
  if (!player) return false;
  const production = player.production ?? {};
  if (!purchaseReachable(player.resources, production, cost, 1)) return false;
  const after: ResourceCost = {
    gold: (player.resources.gold ?? 0) - (spend.gold ?? 0),
    buildingMaterials:
      (player.resources.buildingMaterials ?? 0) - (spend.buildingMaterials ?? 0),
    valuables: (player.resources.valuables ?? 0) - (spend.valuables ?? 0),
  };
  return !purchaseReachable(after, production, cost, 1);
}

/**
 * Resource stocks worth preserving. They follow the concrete development goal,
 * rather than treating materials above 4 / valuables above 1 as disposable.
 */
export function developmentResourceTargets(
  state: GameState,
  playerId: PlayerId,
): Required<ResourceCost> {
  const profile = armyDevelopmentProfile(state, playerId);
  const dragonBudget = dungeonBlackDragonPackBudget(state, playerId);
  if (dragonBudget && profile.goldUnlocked) {
    return { ...dragonBudget, gold: dragonBudget.gold + 5 };
  }
  if (needsPremiumSilverBreakthrough(state, playerId) && !needsNecromancyVampire(state, playerId)) {
    const recruit = premiumSilverCost(state, playerId) ?? {};
    const dwelling = nextDevelopmentBuildingCost(state, playerId) ?? {};
    return {
      gold: (recruit.gold ?? 0) + (dwelling.gold ?? 0) + 5,
      buildingMaterials: (recruit.buildingMaterials ?? 0) + (dwelling.buildingMaterials ?? 0),
      valuables: (recruit.valuables ?? 0) + (dwelling.valuables ?? 0),
    };
  }
  const nextBuilding = nextDevelopmentBuildingCost(state, playerId);
  if (needsNecromancyVampire(state, playerId)) {
    const vampire = state.players[playerId].army.find(unit => unit.unitDefId === "necropolis.vampires" && unit.side !== "bank");
    const few = applyRecruitGoldDiscount(state, playerId, { kind: "recruit", unitDefId: "necropolis.vampires" }, coreUnitDefinitions["necropolis.vampires"].few!.cost);
    const pack = coreUnitDefinitions["necropolis.vampires"].pack!.cost;
    const upgrade = vampire ? reinforceCostFor(state, playerId, vampire.id, false, true, true) ?? pack
      : { ...pack, gold: Math.floor((pack.gold ?? 0) / 2) };
    const dwelling = profile.silverUnlocked ? {} : nextBuilding ?? {};
    const bronzeGold = state.players[playerId].army.reduce((sum, unit) => {
      if (unit.side !== "few" || coreUnitDefinitions[unit.unitDefId]?.tier !== "bronze") return sum;
      const paid = unit.unitDefId === "necropolis.skeletons" ||
        (unit.unitDefId === "necropolis.zombies" && !(state.players[playerId].army.some(u =>
          u.unitDefId === "necropolis.wraiths" && u.side === "pack") && state.players[playerId].hand.some(id =>
          cardLibrary[id]?.effect.type === "NECROMANCY_REINFORCE")));
      return sum + (reinforceCostFor(state, playerId, unit.id, false, !paid, !paid)?.gold ?? 0);
    }, 0);
    return {
      gold: bronzeGold + (dwelling.gold ?? 0) + (vampire ? 0 : few.gold ?? 0) + (upgrade.gold ?? 0),
      buildingMaterials: (dwelling.buildingMaterials ?? 0) + (vampire ? 0 : few.buildingMaterials ?? 0) + (upgrade.buildingMaterials ?? 0),
      valuables: (dwelling.valuables ?? 0) + (vampire ? 0 : few.valuables ?? 0) + (upgrade.valuables ?? 0),
    };
  }
  if (nextBuilding) {
    // Fund the first Gold body while gathering its dwelling inputs. Otherwise
    // the map stops collecting as soon as the building alone is affordable.
    const goldDwelling = factionBuildingForEffect(state, playerId,
      effect => effect.type === "UNLOCK_RECRUIT_TIER" && effect.tier === "gold");
    const firstGold = rankedGoldUnits(state, playerId)[0];
    const recruit = profile.phase === "unlock-gold" && !needsPremiumSilverBreakthrough(state, playerId) &&
      goldDwelling?.cost === nextBuilding && firstGold
      ? applyRecruitGoldDiscount(state, playerId, { kind: "recruit", unitDefId: firstGold },
        coreUnitDefinitions[firstGold]!.few!.cost) : {};
    return {
      gold: Math.max(14, (nextBuilding.gold ?? 0) + (recruit.gold ?? 0) + 5),
      buildingMaterials: (nextBuilding.buildingMaterials ?? 0) + (recruit.buildingMaterials ?? 0),
      valuables: (nextBuilding.valuables ?? 0) + (recruit.valuables ?? 0),
    };
  }
  if (profile.phase === "establish-core") {
    return { gold: 16, buildingMaterials: 3, valuables: 1 };
  }
  if (profile.goldUnlocked) {
    // Save for the next Gold-ladder step: always for a missing Gold Few, and
    // for a Gold Pack only once it lands within one Resource Round (so the
    // mature target below keeps side spending alive during a long save).
    const step = nextGoldLadderStep(state, playerId);
    if (
      step &&
      (step.kind === "recruit" || committedGoldInvestment(state, playerId) || goldPurchaseReachable(state, playerId, step.cost, 1))
    ) {
      return {
        // Preserve the normal five-gold safety cushion after the purchase.
        gold: (step.cost.gold ?? 0) + 5,
        buildingMaterials: step.cost.buildingMaterials ?? 0,
        valuables: step.cost.valuables ?? 0,
      };
    }
  }
  // Mature town: keep enough for a Silver recruit or a useful reinforcement.
  return { gold: 18, buildingMaterials: 3, valuables: 2 };
}

// ---------------------------------------------------------------------------
// DWELLING-RUSH TRADE PLANNER (Step 5)
// ---------------------------------------------------------------------------
//
// User's words: "know to trade to quickly get to silver and gold dwelling ...
// but not destroy potential." When the next recruit-tier dwelling is affordable
// EXCEPT for a materials / valuables shortfall the Trading Post can cover from a
// genuine GOLD SURPLUS, the AI should convert and BUILD it THIS turn instead of
// idling until income trickles in — WITHOUT spending the fund reserved for
// planned recruits.

/** Resources the seat is holding, as a fully-populated record. */
function playerResourceRecord(
  state: GameState,
  playerId: PlayerId,
): Required<ResourceCost> {
  const r = state.players[playerId]?.resources;
  return {
    gold: r?.gold ?? 0,
    buildingMaterials: r?.buildingMaterials ?? 0,
    valuables: r?.valuables ?? 0,
  };
}

/**
 * The TRADE_RATES entry that buys exactly 1 of `resource` for gold (Trading Post
 * "2 gold -> 1 building materials" / "6 gold -> 1 valuables"). Looked up by shape
 * rather than a magic index so a reordered rate table cannot silently break the
 * planner. Null when no such single-resource gold purchase exists.
 */
function goldPurchaseRate(
  resource: "buildingMaterials" | "valuables",
): { rateIndex: number; goldPerUnit: number } | null {
  for (let index = 0; index < TRADE_RATES.length; index += 1) {
    const rate = TRADE_RATES[index];
    const sellKeys = Object.keys(rate.sell);
    const buyKeys = Object.keys(rate.buy);
    if (
      sellKeys.length === 1 &&
      sellKeys[0] === "gold" &&
      (rate.sell.gold ?? 0) > 0 &&
      buyKeys.length === 1 &&
      buyKeys[0] === resource &&
      (rate.buy[resource] ?? 0) === 1
    ) {
      return { rateIndex: index, goldPerUnit: rate.sell.gold ?? 0 };
    }
  }
  return null;
}

/** The TRADE_RATES entry that SELLS exactly 1 of `resource` for gold ("1 building
 * materials -> 1 gold" / "1 valuables -> 3 gold"), looked up by shape like
 * {@link goldPurchaseRate}. Null when the post has no such direct sale. */
function goldSaleRate(
  resource: "buildingMaterials" | "valuables",
): { rateIndex: number; goldPerUnit: number } | null {
  for (let index = 0; index < TRADE_RATES.length; index += 1) {
    const rate = TRADE_RATES[index];
    const sellKeys = Object.keys(rate.sell);
    const buyKeys = Object.keys(rate.buy);
    if (
      sellKeys.length === 1 &&
      sellKeys[0] === resource &&
      (rate.sell[resource] ?? 0) === 1 &&
      buyKeys.length === 1 &&
      buyKeys[0] === "gold" &&
      (rate.buy.gold ?? 0) > 0
    ) {
      return { rateIndex: index, goldPerUnit: rate.buy.gold ?? 0 };
    }
  }
  return null;
}

/** The TRADE_RATES entry that turns exactly 3 building materials into 1 valuable
 * ("3 building materials -> 1 valuables"), looked up by shape like
 * {@link goldPurchaseRate}. Null when the post has no such conversion. */
function materialsForValuableRate(): { rateIndex: number; materialsPerValuable: number } | null {
  for (let index = 0; index < TRADE_RATES.length; index += 1) {
    const rate = TRADE_RATES[index];
    const sellKeys = Object.keys(rate.sell);
    const buyKeys = Object.keys(rate.buy);
    if (
      sellKeys.length === 1 &&
      sellKeys[0] === "buildingMaterials" &&
      (rate.sell.buildingMaterials ?? 0) > 0 &&
      buyKeys.length === 1 &&
      buyKeys[0] === "valuables" &&
      (rate.buy.valuables ?? 0) === 1
    ) {
      return { rateIndex: index, materialsPerValuable: rate.sell.buildingMaterials ?? 0 };
    }
  }
  return null;
}

export type GoldStepMarketPlan = {
  /** TRADE_RATES indices that together make the saved Gold recruit payable. */
  rateIndices: number[];
};

/**
 * Trades at a Trading Post that make the saved Gold-ladder RECRUIT (the missing
 * level-7 / level-6 body, see nextGoldLadderStep) payable on THIS visit: buy the
 * missing valuables / materials from gold, and if gold itself is short, sell
 * the stock the step does not need (materials first, then valuables) at the
 * printed rates. Null when no recruit step is saved, when it is already
 * affordable (the buy fires directly), or when the post cannot close the gap.
 *
 * Measured before this plan (impossible, 4 seats): a seat held 24 gold and no
 * valuable for two Resource Rounds, one 6-gold trade short of its Hydra, with
 * a Trading Post two fields away — the generic trade heuristic called that
 * gold "scarce" and refused the very exchange that completes the purchase.
 * Public resources and printed costs only.
 */
export function goldStepMarketPlan(
  state: GameState,
  playerId: PlayerId,
): GoldStepMarketPlan | null {
  if (!state.players[playerId]) return null;
  // Every ladder step qualifies — a missing body AND a Pack upgrade (USER
  // RULING 2026-09-16: surplus valuables are sold "to upgrade others").
  const step = nextGoldLadderStep(state, playerId);
  // Before the Gold ladder opens, the saved purchase is the next DWELLING.
  // Only its GOLD gap is closed here, from surplus stock (buying missing
  // inputs from gold is the dwelling-rush planner's job). Measured
  // (Necropolis, impossible, seed eval-14): a seat sat on 5 gold with 16
  // materials and 8 valuables for two Resource Rounds, its Silver dwelling
  // 3 gold short, a Trading Post one field away.
  let savedCost: ResourceCost | null = step?.cost ?? null;
  if (!step) {
    const dwelling = nextDevelopmentBuildingCost(state, playerId);
    const hall = factionIncomeBuilding(state, playerId)?.cost;
    if (!dwelling || dwelling === hall) return null;
    savedCost = dwelling;
  }
  if (!savedCost) return null;
  const res = playerResourceRecord(state, playerId);
  const need: Required<ResourceCost> = {
    gold: savedCost.gold ?? 0,
    buildingMaterials: savedCost.buildingMaterials ?? 0,
    valuables: savedCost.valuables ?? 0,
  };
  if (
    res.gold >= need.gold &&
    res.buildingMaterials >= need.buildingMaterials &&
    res.valuables >= need.valuables
  ) {
    return null;
  }
  const rateIndices: number[] = [];
  let goldShort = need.gold - res.gold;
  for (const key of ["valuables", "buildingMaterials"] as const) {
    const missing = Math.max(0, need[key] - res[key]);
    if (missing === 0) continue;
    // A dwelling's missing inputs belong to the rush planner, never here.
    if (!step) return null;
    const rate = goldPurchaseRate(key);
    if (!rate) return null;
    goldShort += missing * rate.goldPerUnit;
    rateIndices.push(rate.rateIndex);
  }
  if (goldShort > 0) {
    // Spare materials first (1 gold each, cheap to lose), then ONLY the
    // valuables above the whole remaining ladder's reserve (USER RULING
    // 2026-09-16, see goldLadderValuablesReserve): a valuable fetches 3 gold
    // and costs 6 to buy back, and every missing Gold Few/Pack still needs its
    // own. The reserve already contains this step's valuables.
    let raised = 0;
    const materialRate = goldSaleRate("buildingMaterials");
    // For a dwelling keep the same +3 materials cushion the generic trade
    // floor keeps before Gold (the NEXT dwelling's rebuild starts from it).
    const materialSurplus = Math.max(0,
      res.buildingMaterials - need.buildingMaterials - (step ? 0 : 3));
    if (materialRate && materialSurplus > 0) {
      raised += materialSurplus * materialRate.goldPerUnit;
      rateIndices.push(materialRate.rateIndex);
    }
    if (raised < goldShort) {
      const valuableRate = goldSaleRate("valuables");
      const valuableSurplus = Math.max(0,
        res.valuables - Math.max(need.valuables, goldLadderValuablesReserve(state, playerId)));
      if (valuableRate && valuableSurplus > 0) {
        raised += valuableSurplus * valuableRate.goldPerUnit;
        rateIndices.push(valuableRate.rateIndex);
      }
    }
    if (raised < goldShort) return null;
  }
  return rateIndices.length > 0 ? { rateIndices } : null;
}

export type PremiumRecruitTradePlan = {
  /** The planned Silver body the trades make payable (nextPlannedSilver). */
  unitDefId: string;
  /** TRADE_RATES indices that together make that recruit payable now. */
  rateIndices: number[];
};

/**
 * Trades at a Trading Post that make the seat's PLANNED Silver body (the
 * premium breakthrough recruit, see needsPremiumSilverBreakthrough) payable on
 * THIS visit, with the Population token still unspent so the recruit follows
 * at once: buy its missing valuables / materials from gold, and if gold is
 * short sell stock the body does not need — spare materials first, then only
 * valuables above the whole remaining Gold ladder's reserve (HARD RULING
 * 2026-09-16, goldLadderValuablesReserve). Null when the Gold ladder is open
 * (goldStepMarketPlan owns those trades), the Silver dwelling is missing,
 * no planned body remains, the recruit is already affordable (buy it
 * directly) or the post cannot close the gap.
 *
 * USER RULING (2026-09-17): from MARKET_MIN_ROUND a generic resource
 * exchange is "terrible" unless it gets the Silver unit NEXT — this plan is
 * the only trade the round-5+ market still offers; its two timing gates
 * (the body joins a fight this round, no income lands next round) live in
 * premiumRecruitMarketVisit. Public printed costs and resource counts only.
 */
export function premiumRecruitTradePlan(
  state: GameState,
  playerId: PlayerId,
): PremiumRecruitTradePlan | null {
  const player = state.players[playerId];
  if (!player || !player.townTokens?.population) return null;
  const profile = armyDevelopmentProfile(state, playerId);
  if (profile.goldUnlocked || !profile.silverUnlocked) return null;
  // The recruit must be the one populationScore pays 976 for after the trade;
  // an off-plan / surplus Silver would be refused at 240 and the trade wasted.
  if (!needsPremiumSilverBreakthrough(state, playerId)) return null;
  const unitDefId = nextPlannedSilver(state, playerId);
  if (!unitDefId || !playerCanRecruitFewNow(state, playerId, unitDefId)) return null;
  const printed = coreUnitDefinitions[unitDefId]?.few?.cost;
  if (!printed) return null;
  const cost = applyRecruitGoldDiscount(state, playerId, { kind: "recruit", unitDefId }, printed);
  const res = playerResourceRecord(state, playerId);
  const need: Required<ResourceCost> = {
    gold: cost.gold ?? 0,
    buildingMaterials: cost.buildingMaterials ?? 0,
    valuables: cost.valuables ?? 0,
  };
  if (
    res.gold >= need.gold &&
    res.buildingMaterials >= need.buildingMaterials &&
    res.valuables >= need.valuables
  ) {
    return null;
  }
  const rateIndices: number[] = [];
  let goldShort = need.gold - res.gold;
  for (const key of ["valuables", "buildingMaterials"] as const) {
    const missing = Math.max(0, need[key] - res[key]);
    if (missing === 0) continue;
    const rate = goldPurchaseRate(key);
    if (!rate) return null;
    goldShort += missing * rate.goldPerUnit;
    rateIndices.push(rate.rateIndex);
  }
  if (goldShort > 0) {
    let raised = 0;
    // Keep the next dwelling's own inputs (never the hall's — it is not a
    // dwelling) so the body does not eat the Gold dwelling's materials.
    const saved = nextDevelopmentBuildingCost(state, playerId);
    const hall = factionIncomeBuilding(state, playerId)?.cost;
    const dwelling: ResourceCost = saved && saved !== hall ? saved : {};
    const materialRate = goldSaleRate("buildingMaterials");
    const materialSurplus = Math.max(
      0,
      res.buildingMaterials - need.buildingMaterials - (dwelling.buildingMaterials ?? 0),
    );
    if (materialRate && materialSurplus > 0) {
      raised += materialSurplus * materialRate.goldPerUnit;
      rateIndices.push(materialRate.rateIndex);
    }
    if (raised < goldShort) {
      const valuableRate = goldSaleRate("valuables");
      const valuableSurplus = Math.max(
        0,
        res.valuables - Math.max(
          need.valuables + (dwelling.valuables ?? 0),
          goldLadderValuablesReserve(state, playerId),
        ),
      );
      if (valuableRate && valuableSurplus > 0) {
        raised += valuableSurplus * valuableRate.goldPerUnit;
        rateIndices.push(valuableRate.rateIndex);
      }
    }
    if (raised < goldShort) return null;
  }
  return rateIndices.length > 0 ? { unitDefId, rateIndices } : null;
}

/**
 * Trades that make the GOLD DWELLING **and** the top Gold Few payable on ONE
 * Trading Post visit, so the level-7 body lands the SAME round its dwelling is
 * built instead of a whole Resource Round later.
 *
 * Measured (Dungeon seed eval-4, R9): 53 gold / 14 materials / 4 valuables. The
 * dwelling-rush planner found no missing DWELLING input and returned null, the
 * dwelling was built for exactly those 4 valuables, and the Black Dragon Few
 * (19 gold + 1 valuable) was then left one 6-gold trade short with 38 gold in
 * hand — the body landed R10. The generic heuristic cannot close that gap
 * either: its gold floor is the target that already contains the dwelling AND
 * the recruit, so spending 6 gold on the valuable always reads as "scarce".
 *
 * Only fires while the next development building IS the Gold dwelling, and only
 * when the gold left after the trades still pays BOTH the dwelling and the
 * recruit — so it can never strip a fund it cannot complete. Valuables are
 * never sold. Materials ABOVE what the dwelling and the body need are spare
 * (USER RULING 2026-09-17: a trade is worth it exactly when it gets the body
 * NOW): they turn into a missing valuable at the printed 3→1 rate before gold
 * is spent on it, and they sell 1:1 to close a remaining gold gap. Measured
 * (Dungeon eval-10, R9, 39g/16m/3v): the dwelling landed but the Black
 * Dragons waited a round because the generic exchange that used to sell the
 * spare materials is gone. Public printed costs and resource counts only.
 */
export function goldBodyComboTradePlan(
  state: GameState,
  playerId: PlayerId,
): GoldStepMarketPlan | null {
  const profile = armyDevelopmentProfile(state, playerId);
  if (profile.phase !== "unlock-gold" || profile.goldUnlocked) return null;
  if (needsPremiumSilverBreakthrough(state, playerId) ||
      needsNecromancyVampire(state, playerId)) return null;
  const goldDwelling = factionBuildingForEffect(state, playerId,
    (effect) => effect.type === "UNLOCK_RECRUIT_TIER" && effect.tier === "gold");
  const nextBuilding = nextDevelopmentBuildingCost(state, playerId);
  if (!goldDwelling || !nextBuilding || goldDwelling.cost !== nextBuilding) return null;
  const topGold = rankedGoldUnits(state, playerId)[0];
  const few = topGold ? coreUnitDefinitions[topGold]?.few : undefined;
  if (!topGold || !few) return null;
  const recruit = applyRecruitGoldDiscount(state, playerId,
    { kind: "recruit", unitDefId: topGold }, few.cost);
  const dwelling = effectiveTownBuildingCost(state, goldDwelling);
  const need: Required<ResourceCost> = {
    gold: (dwelling.gold ?? 0) + (recruit.gold ?? 0),
    buildingMaterials: (dwelling.buildingMaterials ?? 0) + (recruit.buildingMaterials ?? 0),
    valuables: (dwelling.valuables ?? 0) + (recruit.valuables ?? 0),
  };
  const res = playerResourceRecord(state, playerId);
  const rateIndices: number[] = [];
  let goldForTrades = 0;
  let spareMaterials = Math.max(0, res.buildingMaterials - need.buildingMaterials);
  const missingMaterials = Math.max(0, need.buildingMaterials - res.buildingMaterials);
  if (missingMaterials > 0) {
    const rate = goldPurchaseRate("buildingMaterials");
    if (!rate) return null;
    goldForTrades += missingMaterials * rate.goldPerUnit;
    rateIndices.push(rate.rateIndex);
  }
  let missingValuables = Math.max(0, need.valuables - res.valuables);
  if (missingValuables > 0) {
    // Spare materials first (3 → 1 valuable, no gold), then gold.
    const convert = materialsForValuableRate();
    const byMaterials = convert
      ? Math.min(missingValuables, Math.floor(spareMaterials / convert.materialsPerValuable))
      : 0;
    if (convert && byMaterials > 0) {
      spareMaterials -= byMaterials * convert.materialsPerValuable;
      missingValuables -= byMaterials;
      rateIndices.push(convert.rateIndex);
    }
    if (missingValuables > 0) {
      const rate = goldPurchaseRate("valuables");
      if (!rate) return null;
      goldForTrades += missingValuables * rate.goldPerUnit;
      rateIndices.push(rate.rateIndex);
    }
  }
  // Both purchases must still be payable after the trades — a remaining gold
  // gap may be closed by selling the spare materials 1:1 — or this is just the
  // ordinary dwelling rush and the recruit waits for its own Resource Round.
  const goldShort = need.gold + goldForTrades - res.gold;
  if (goldShort > 0) {
    const sale = goldSaleRate("buildingMaterials");
    if (!sale || spareMaterials * sale.goldPerUnit < goldShort) return null;
    rateIndices.push(sale.rateIndex);
  }
  if (rateIndices.length === 0) return null;
  return { rateIndices };
}

export type DwellingRushAssessment = {
  /**
   * True when genuine gold surplus covers EVERY missing dwelling input AND leaves
   * the whole development gold reserve intact — i.e. the seat can trade, build the
   * dwelling, and still hold the recruit cushion. False when the only way to buy
   * the inputs would eat that reserve (do NOT trade — preserve the potential).
   */
  feasible: boolean;
  /**
   * TRADE_RATES indices that BUY a still-missing dwelling input (materials /
   * valuables) from gold. Enabled decisively when `feasible`; SUPPRESSED when not,
   * so a half-conversion never strips the recruit fund chasing a dwelling the seat
   * cannot actually complete this turn.
   */
  inputRateIndices: number[];
};

/**
 * Assess a same-turn dwelling rush. Returns null when it does not apply: outside
 * the unlock-silver / unlock-gold phases, when there is no next dwelling, when the
 * dwelling is ALREADY affordable (the build fires directly — no trade needed), or
 * when the shortfall is not a materials / valuables gap fundable from gold (a pure
 * gold shortage has no surplus to convert).
 *
 * Preserve the development gold reserve for Silver and Necromancy. The Gold
 * dwelling can use its Build token with the normal five-gold cushion even while
 * the long-term target also saves for the first Gold recruit. Materials and
 * valuables are only ever BOUGHT, never sold, so the plan cannot strip its own
 * saved inputs.
 *
 * Honest scope: the planner funds missing inputs from GOLD only. A seat short on
 * gold but flush on the other two is left to the generic trade heuristic; the
 * materials<->valuables cross-conversions are out of scope.
 */
export function assessDwellingRush(
  state: GameState,
  playerId: PlayerId,
): DwellingRushAssessment | null {
  const profile = armyDevelopmentProfile(state, playerId);
  if (profile.phase !== "unlock-silver" && profile.phase !== "unlock-gold") {
    return null;
  }
  const cost = nextDevelopmentBuildingCost(state, playerId);
  if (!cost) {
    return null;
  }
  const need: Required<ResourceCost> = {
    gold: cost.gold ?? 0,
    buildingMaterials: cost.buildingMaterials ?? 0,
    valuables: cost.valuables ?? 0,
  };
  const res = playerResourceRecord(state, playerId);
  // Already affordable → the build fires directly; no rush trade is needed.
  if (
    res.gold >= need.gold &&
    res.buildingMaterials >= need.buildingMaterials &&
    res.valuables >= need.valuables
  ) {
    return null;
  }
  const missingMaterials = Math.max(0, need.buildingMaterials - res.buildingMaterials);
  const missingValuables = Math.max(0, need.valuables - res.valuables);
  if (missingMaterials === 0 && missingValuables === 0) {
    // The only gap is gold — no surplus input to convert; not a rush case.
    return null;
  }
  const matsRate = goldPurchaseRate("buildingMaterials");
  const valsRate = goldPurchaseRate("valuables");
  const inputRateIndices: number[] = [];
  let goldForTrades = 0;
  if (missingMaterials > 0 && matsRate) {
    goldForTrades += missingMaterials * matsRate.goldPerUnit;
    inputRateIndices.push(matsRate.rateIndex);
  }
  if (missingValuables > 0 && valsRate) {
    goldForTrades += missingValuables * valsRate.goldPerUnit;
    inputRateIndices.push(valsRate.rateIndex);
  }
  if (inputRateIndices.length === 0) {
    // A missing input the Trading Post cannot supply from gold — cannot rush.
    return null;
  }
  // The long-term target includes the future recruit. Do not require that
  // entire fund before using this round's Build token on its prerequisite.
  const reserveGold = profile.phase === "unlock-gold" && !needsNecromancyVampire(state, playerId) &&
    !needsPremiumSilverBreakthrough(state, playerId)
    ? Math.max(14, (cost.gold ?? 0) + 5)
    : developmentResourceTargets(state, playerId).gold;
  const feasible = res.gold - goldForTrades >= reserveGold;
  return { feasible, inputRateIndices };
}
