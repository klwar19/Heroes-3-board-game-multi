import { coreBuildingDefinitions, coreFactionDefinitions } from "@/data/factions/core";
import { coreUnitDefinitions } from "@/data/factions/units";
import type { TownBuildingEffect, UnitTier } from "@/data/factions/types";
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
