import { HERO_GRADE_NODE_IDS } from "@/data/anime/hero-grades";
import { effectiveInitiative } from "./active-effects";
import { finishCombatIfNeeded, markUnitRemovedIfNeeded } from "./combat-units";
import { appendEvent, nextEventNumber } from "./events";
import { heroHasGradeNode, playerMainHeroInCombat } from "./anime-hero-grades";
import { noteUnitDamagedForTokens } from "./tokens";
import type { CombatUnitState, GameState, PlayerId } from "./state";
import { unitCells, unitOccupiesCell } from "./hex-footprint";

export const STARWIND_FAMILIAR_CARD_IMAGE = "/assets/anime/units/starwind-familiar-card.webp";
export const STARWIND_FAMILIAR_ARMY_UNIT_PREFIX = "hero_grade_starwind_familiar_";

function createStarwindFamiliar(
  state: GameState,
  playerId: PlayerId,
  position: number,
  source: "hero-grade" | "commander-artifact",
): CombatUnitState {
  const serial = nextEventNumber(state);
  return {
    id: `unit_${playerId}_starwind_${serial}`,
    controllerId: playerId,
    name: "Starwind Familiar",
    cardName: "Starwind Familiar",
    variant: "neutral",
    grade: "bronze",
    type: "ground",
    attack: 2,
    defense: 1,
    maxHealth: 2,
    damage: 0,
    initiative: 8,
    position,
    activatedThisRound: false,
    movedThisActivation: false,
    retaliatedThisRound: false,
    defenseToken: false,
    abilities: [],
    summoned: true,
    temporary: true,
    ...(source === "hero-grade"
      ? { armyUnitId: `${STARWIND_FAMILIAR_ARMY_UNIT_PREFIX}${playerId}` }
      : {}),
    heroGradeExpiresAfterRound: 1,
    assets: { cardImage: STARWIND_FAMILIAR_CARD_IMAGE, imageAlt: "Starwind Familiar unit card" }
  };
}

/** Add the Tier-1 familiar to setup so its owner can arrange it normally. */
export function injectHeroGradeFamiliar(
  state: GameState,
  playerId: PlayerId,
  preferredCells: readonly number[]
): CombatUnitState | null {
  const combat = state.combat;
  if (
    !combat ||
    combat.round !== 1 ||
    !playerMainHeroInCombat(state, playerId) ||
    !heroHasGradeNode(state, playerId, HERO_GRADE_NODE_IDS.spiritCompanion)
  ) return null;
  const existing = Object.values(combat.units).find(
    (unit) => unit.controllerId === playerId && unit.heroGradeExpiresAfterRound === 1
  );
  if (existing) return existing;
  const occupied = new Set(Object.values(combat.units).filter((unit) => unit.damage < unit.maxHealth).flatMap((unit) => unitCells(combat, unit)));
  const position = preferredCells.find((cell) => !occupied.has(cell));
  if (position === undefined) return null;
  const familiar = createStarwindFamiliar(state, playerId, position, "hero-grade");
  combat.units[familiar.id] = familiar;
  appendEvent(state, {
    type: "HERO_SKILL_USED",
    playerId,
    nodeId: HERO_GRADE_NODE_IDS.spiritCompanion,
    message: "Spirit Companion summons a Starwind Familiar for combat round 1."
  });
  return familiar;
}

/** Lanternroot Crook: place the same weak one-round spirit after deployment. */
export function injectCommanderArtifactSpirit(
  state: GameState,
  playerId: PlayerId,
  position: number,
): CombatUnitState | null {
  const combat = state.combat;
  if (
    !combat ||
    combat.round !== 1 ||
    Object.values(combat.units).some(
      (unit) => unit.damage < unit.maxHealth && unitOccupiesCell(combat, unit, position),
    )
  ) return null;
  const familiar = createStarwindFamiliar(state, playerId, position, "commander-artifact");
  combat.units[familiar.id] = familiar;
  appendEvent(state, {
    type: "UNIT_ABILITY_TRIGGERED",
    unitId: familiar.id,
    abilityId: "commander-artifact-lanternroot-crook",
    message: `Lanternroot Crook summons a Starwind Familiar at combat start; it lasts through round 1.`,
  });
  return familiar;
}

/** Swift Host: permanent +1 printed initiative for every friendly combat body. */
export function applyHeroGradeArmyInitiative(state: GameState): void {
  const combat = state.combat;
  if (!combat) return;
  combat.heroGradeInitiativeAppliedFor ??= [];
  for (const playerId of [combat.attackerPlayerId, combat.defenderPlayerId]) {
    if (
      combat.heroGradeInitiativeAppliedFor.includes(playerId) ||
      !playerMainHeroInCombat(state, playerId) ||
      !heroHasGradeNode(state, playerId, HERO_GRADE_NODE_IDS.swiftHost)
    ) continue;
    for (const unit of Object.values(combat.units)) {
      if (unit.controllerId === playerId && unit.damage < unit.maxHealth) unit.initiative += 1;
    }
    combat.heroGradeInitiativeAppliedFor.push(playerId);
  }
}

/** Remove familiars whose single combat round has ended. */
export function expireHeroGradeFamiliars(state: GameState, finishedRound: number): void {
  for (const unit of Object.values(state.combat?.units ?? {})) {
    if (unit.heroGradeExpiresAfterRound === finishedRound && unit.damage < unit.maxHealth) {
      unit.damage = unit.maxHealth;
      appendEvent(state, { type: "UNIT_REMOVED", unitId: unit.id, playerId: unit.controllerId });
    }
  }
}

/** Falling Star is effect damage from a Hero Grade, never a war-machine shot. */
export function applyHeroGradeRoundStartDamage(state: GameState): void {
  const combat = state.combat;
  if (!combat) return;
  const owners = [combat.attackerPlayerId, combat.defenderPlayerId].filter(
    (id, index, all) => all.indexOf(id) === index
  );
  for (const playerId of owners) {
    if (
      !playerMainHeroInCombat(state, playerId) ||
      !heroHasGradeNode(state, playerId, HERO_GRADE_NODE_IDS.fallingStar)
    ) continue;
    const enemies = Object.values(combat.units).filter(
      (unit) => unit.controllerId !== playerId && unit.damage < unit.maxHealth
    );
    enemies.sort((a, b) =>
      effectiveInitiative(a, state.activeEffects, combat) - effectiveInitiative(b, state.activeEffects, combat) ||
      a.id.localeCompare(b.id)
    );
    const target = enemies[0];
    if (!target) continue;
    target.damage += 1;
    noteUnitDamagedForTokens(state, target, 1);
    appendEvent(state, {
      type: "DAMAGE_ASSIGNED",
      source: { type: "system" },
      target: { type: "unit", unitId: target.id },
      amount: 1,
      damageKind: "effect"
    });
    appendEvent(state, {
      type: "HERO_SKILL_USED",
      playerId,
      nodeId: HERO_GRADE_NODE_IDS.fallingStar,
      message: `Falling Star deals 1 damage to ${target.cardName}, the slowest enemy unit.`
    });
    markUnitRemovedIfNeeded(state, target);
    if (finishCombatIfNeeded(state)) return;
  }
}
