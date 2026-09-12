import { coreBuildingDefinitions, coreFactionDefinitions } from "@/data/factions/core";
import { coreUnitDefinitions } from "@/data/factions/units";
import type { TownBuildingEffect, UnitSideDefinition, UnitTier } from "@/data/factions/types";
import { TRADE_RATES } from "@/data/map/locations";
import { NEUTRAL_PLAYER_ID } from "../state";
import type { GameState, PlayerId, ResourceCost } from "../state";
import { unitExperienceActive } from "../unit-experience";
import { playersAreAllied } from "./control";

/** Maximum opening Pack target. Composition-aware openings may need only 1–2. */
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
 * roster. One exceptional tempo Pack plus two useful Few can be enough; most
 * factions want two; weak/attrition openings retain the safe three-Pack plan.
 */
export function openingCorePackTarget(
  state: GameState,
  playerId: PlayerId,
): 1 | 2 | 3 {
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
  // A one-Pack pivot requires a genuinely exceptional individual, not merely
  // a high-stat collection of Few cards.
  if (bronze[0].pack >= 29 && projected(1) >= 54) return 1;
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
  if (army.length < CORE_BODY_TARGET || packUnits < corePackTarget) {
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
    profile.packUnits >= profile.corePackTarget
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

/** Last round in which the hall may go BEFORE the next dwelling (winners: R2–R6). */
export const INCOME_FIRST_LAST_ROUND = 6;
/**
 * Same window when the bronze-only stretch the hall implies is SLOW or HARD:
 * no unit experience and no commanders (Packs never grow, so Silver is the only
 * way the army improves), or human-played neutrals (PvP Neutral Control: a
 * rival seat focuses the guards, so bronze fights cost more). Reasoning, not
 * replay-evidenced — every ranked record ran with commanders and unit
 * experience on and the scripted Neutral AI.
 */
export const INCOME_FIRST_LAST_ROUND_SLOW = 4;
/** No ranked seat built a City Hall from R8 on; from here its +5/round never pays back. */
export const INCOME_NEVER_FROM_ROUND = 9;
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
  if (!bronzeCoreHasWork) return null;
  // Until the first FAR income is captured, fund Silver/Gold and its fighting
  // army. A revealed settlement is still a battle to win, not an income base.
  if (!hasOpenedFarEconomy(state, playerId)) return null;
  const profile = armyDevelopmentProfile(state, playerId);
  if (profile.phase !== "unlock-silver" && profile.phase !== "unlock-gold") {
    return null;
  }
  const building = factionIncomeBuilding(state, playerId);
  if (!building) return null;
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
  if (dwelling?.cost && player) {
    if (purchaseReachable(player.resources, {}, dwelling.cost, 0)) return null;
    if (
      purchaseReachable(player.resources, player.production ?? {}, dwelling.cost, 1)
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
    .filter(({ unit }) => unit?.tier === "gold" && Boolean(unit.few) && Boolean(unit.pack))
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

/**
 * The next Gold-army purchase in the taught order: the highest-ranked missing
 * Few, else the highest-ranked unit still at Few (its Pack). Null before the
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
      return { unitDefId, kind: "recruit", cost: coreUnitDefinitions[unitDefId]!.few!.cost, rank };
    }
  }
  for (const [rank, unitDefId] of ranked.entries()) {
    if (owned(unitDefId)?.side === "few") {
      return { unitDefId, kind: "reinforce", cost: coreUnitDefinitions[unitDefId]!.pack!.cost, rank };
    }
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
  const nextBuilding = nextDevelopmentBuildingCost(state, playerId);
  if (nextBuilding) {
    return {
      gold: Math.max(14, (nextBuilding.gold ?? 0) + 5),
      buildingMaterials: nextBuilding.buildingMaterials ?? 0,
      valuables: nextBuilding.valuables ?? 0,
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
      (step.kind === "recruit" || goldPurchaseReachable(state, playerId, step.cost, 1))
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
 * "Not destroy potential": the reserve preserved is the development gold reserve
 * (`developmentResourceTargets().gold`, which already folds in the dwelling's own
 * gold cost plus a recruit cushion — this EXTENDS that model rather than inventing
 * a second one). Only gold ABOVE it funds the conversion, so after the build the
 * seat still holds the cushion to recruit the newly-unlocked tier. Materials and
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
  const reserveGold = developmentResourceTargets(state, playerId).gold;
  const feasible = res.gold - goldForTrades >= reserveGold;
  return { feasible, inputRateIndices };
}
