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
    profile.packUnits >= CORE_PACK_TARGET ||
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
 * Scoped strictly to the player's OWN holdings — a Far Settlement they opened
 * (tracked per player at flip time in `farSettlementOpenedByPlayer`) or a Far
 * Settlement / premium mine they have FLAGGED. A previous version scanned every
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
  if (adventure.farSettlementOpenedByPlayer?.[playerId]) return true;
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
 * Opening fallback used by conquest navigation. From round 3 onward, three
 * Bronze Packs are a real rush force when the first Far tiles failed to yield
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
    profile.totalUnits >= CORE_PACK_TARGET &&
    profile.bronzePacks >= CORE_PACK_TARGET &&
    !hasOpenedFarEconomy(state, playerId)
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

/**
 * Cheapest missing faction Gold body after its Dwelling is unlocked. This is
 * the development outcome the policy saves for; constructing the Gold
 * Dwelling alone is not a completed milestone.
 */
export function firstGoldRecruitCost(
  state: GameState,
  playerId: PlayerId,
): ResourceCost | null {
  const player = state.players[playerId];
  if (!player) return null;
  const candidates = (coreFactionDefinitions[player.factionId ?? ""]?.units ?? [])
    .filter((unitDefId) => {
      const unit = coreUnitDefinitions[unitDefId];
      return (
        unit?.tier === "gold" &&
        Boolean(unit.few) &&
        !player.army.some(
          (owned) => owned.side !== "bank" && owned.unitDefId === unitDefId,
        )
      );
    })
    .map((unitDefId) => coreUnitDefinitions[unitDefId]!.few!.cost)
    .sort(
      (left, right) =>
        (left.gold ?? 0) +
        (left.buildingMaterials ?? 0) * 3 +
        (left.valuables ?? 0) * 7 -
        ((right.gold ?? 0) +
          (right.buildingMaterials ?? 0) * 3 +
          (right.valuables ?? 0) * 7),
    );
  return candidates[0] ?? null;
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
  if (profile.goldUnlocked && profile.goldUnits === 0) {
    const recruit = firstGoldRecruitCost(state, playerId);
    if (recruit) {
      return {
        // Preserve the normal five-gold safety cushion after the purchase.
        gold: (recruit.gold ?? 0) + 5,
        buildingMaterials: recruit.buildingMaterials ?? 0,
        valuables: recruit.valuables ?? 0,
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
