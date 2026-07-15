import { coreBuildingDefinitions, coreFactionDefinitions } from "@/data/factions/core";
import { coreUnitDefinitions } from "@/data/factions/units";
import type { TownBuildingEffect, UnitTier } from "@/data/factions/types";
import { TRADE_RATES } from "@/data/map/locations";
import type { GameState, PlayerId, ResourceCost } from "../state";

/** The reliable early army the policy tries to establish before fair fights. */
export const CORE_PACK_TARGET = 3;

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

  let phase: ArmyDevelopmentPhase;
  if (army.length < CORE_PACK_TARGET || packUnits < CORE_PACK_TARGET) {
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
    silverUnits,
    goldUnits,
    bronzeUnlocked,
    silverUnlocked,
    goldUnlocked,
    reinforceUnlocked,
  };
}

/**
 * A fair neutral fight is acceptable once the core has three Pack stacks.
 * Guaranteed Quick Combat wins are handled separately and never need this gate.
 */
export function armyReadyForContestedFight(
  state: GameState,
  playerId: PlayerId,
): boolean {
  const profile = armyDevelopmentProfile(state, playerId);
  return (
    profile.totalUnits >= CORE_PACK_TARGET &&
    profile.packUnits >= CORE_PACK_TARGET
  );
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
  }
  const tier = phase === "unlock-silver" ? "silver" : phase === "unlock-gold" ? "gold" : null;
  if (!tier) return null;
  return (
    factionBuildingForEffect(
      state,
      playerId,
      (effect) => effect.type === "UNLOCK_RECRUIT_TIER" && effect.tier === tier,
    )?.cost ?? null
  );
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
