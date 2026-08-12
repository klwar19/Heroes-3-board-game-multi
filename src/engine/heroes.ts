import { coreHeroDefinitions } from "@/data/factions/core";
import type { HeroDefinition } from "@/data/factions/types";
import type { CombatUnitState, GameState, HeroId, HeroState, PlayerId } from "./state";

/** Battlefield id of a hero. Kept separate from army cards and commanders. */
export function heroUnitId(heroId: HeroId): string {
  return `hero_${heroId}`;
}

export type HeroCombatProfile = {
  attack: number;
  defense: number;
  health: number;
  initiative: number;
  type: "ground" | "ranged";
  passiveAbilityId: string;
  passiveName: string;
};

const PASSIVE_BY_STARTING_ABILITY: Record<string, Pick<HeroCombatProfile, "passiveAbilityId" | "passiveName"> & { ranged?: boolean }> = {
  "ability.archery": { passiveAbilityId: "ignore-all-combat-penalties", passiveName: "Master Archer", ranged: true },
  "ability.armorer": { passiveAbilityId: "commander-defense-token", passiveName: "Armored Command" },
  "ability.artillery": { passiveAbilityId: "commander-max-damage", passiveName: "Artillery Spotter", ranged: true },
  "ability.basic_fire_magic": { passiveAbilityId: "wog-fire-shield-1", passiveName: "Fire Adept" },
  "ability.diplomacy": { passiveAbilityId: "ignores-retaliation", passiveName: "Parley" },
  "ability.eagle_eye": { passiveAbilityId: "gargoyle-spell-ward", passiveName: "Spell Reader", ranged: true },
  "ability.estates": { passiveAbilityId: "commander-defense-token", passiveName: "Well Supplied" },
  "ability.first_aid": { passiveAbilityId: "wraith-heal-1", passiveName: "Field Medic" },
  "ability.intelligence": { passiveAbilityId: "reduce-spell-damage-1", passiveName: "Arcane Reserve", ranged: true },
  "ability.interference": { passiveAbilityId: "wog-nightmare-fear", passiveName: "Interference" },
  "ability.leadership": { passiveAbilityId: "wog-no-negative-attack-roll", passiveName: "Inspiring Presence" },
  "ability.logistics": { passiveAbilityId: "commander-charge", passiveName: "Forced March" },
  "ability.luck": { passiveAbilityId: "attack-roll-advantage-passive", passiveName: "Heroic Luck" },
  "ability.mysticism": { passiveAbilityId: "wraith-heal-1", passiveName: "Mystic Renewal", ranged: true },
  "ability.necromancy": { passiveAbilityId: "ignore-paralysis", passiveName: "Undying Will" },
  "ability.offense": { passiveAbilityId: "commander-charge", passiveName: "Offensive Mastery" },
  "ability.pathfinding": { passiveAbilityId: "teleport-move", passiveName: "Pathfinder" },
  "ability.resistance": { passiveAbilityId: "reduce-spell-damage-1", passiveName: "Magic Resistance" },
  "ability.scholar": { passiveAbilityId: "gargoyle-spell-ward", passiveName: "Battle Scholar", ranged: true },
  "ability.scouting": { passiveAbilityId: "ignores-retaliation", passiveName: "Ambush" },
  "ability.sorcery": { passiveAbilityId: "magi-power-boost", passiveName: "Battle Sorcery", ranged: true },
  "ability.tactics": { passiveAbilityId: "commander-defense-token", passiveName: "Prepared Position" },
  "ability.water_magic": { passiveAbilityId: "gargoyle-spell-ward", passiveName: "Water Ward", ranged: true },
  "ability.wisdom": { passiveAbilityId: "reduce-spell-damage-1", passiveName: "Ancient Wisdom", ranged: true }
};

const LITTLE_BUSTERS_MIGHT_LEVELS = [
  { attack: 2, defense: 1, health: 4, initiative: 5 },
  { attack: 3, defense: 1, health: 4, initiative: 6 },
  { attack: 3, defense: 1, health: 5, initiative: 7 },
  { attack: 3, defense: 2, health: 5, initiative: 7 },
  { attack: 4, defense: 2, health: 6, initiative: 8 },
  { attack: 4, defense: 2, health: 7, initiative: 8 },
  { attack: 4, defense: 2, health: 9, initiative: 9 }
] as const;

const LITTLE_BUSTERS_MAGIC_LEVELS = [
  { attack: 2, defense: 0, health: 3, initiative: 6 },
  { attack: 2, defense: 1, health: 3, initiative: 7 },
  { attack: 3, defense: 1, health: 3, initiative: 7 },
  { attack: 3, defense: 1, health: 4, initiative: 8 },
  { attack: 4, defense: 1, health: 5, initiative: 9 },
  { attack: 4, defense: 1, health: 6, initiative: 10 },
  { attack: 4, defense: 1, health: 7, initiative: 12 }
] as const;

const LITTLE_BUSTERS_PASSIVES: Partial<Record<string, Pick<HeroCombatProfile, "passiveAbilityId" | "passiveName" | "type">>> = {
  kudryavka_noumi: {
    passiveAbilityId: "little-busters-kud-random-follow-up",
    passiveName: "Unexpected Trajectory",
    type: "ranged"
  },
  komari_kamikita: {
    passiveAbilityId: "little-busters-komari-smile-ward",
    passiveName: "Everyone Smiles",
    type: "ranged"
  },
  rin_natsume: {
    passiveAbilityId: "little-busters-rin-second-attack",
    passiveName: "Catlike Combo",
    type: "ground"
  }
};

/**
 * Balanced level curve: heroes begin between a bronze Pack and a commander,
 * reach silver/gold strength at levels IV/VI, and never exceed a specialized
 * max-grade commander. Starting primary stats tilt, rather than explode, the
 * curve so every existing hero definition remains viable.
 */
export function heroCombatProfile(definition: HeroDefinition, level: number): HeroCombatProfile {
  const boundedLevel = Math.max(1, Math.min(7, Math.floor(level)));
  if (definition.faction === "little_busters") {
    const stats = (definition.type === "magic" ? LITTLE_BUSTERS_MAGIC_LEVELS : LITTLE_BUSTERS_MIGHT_LEVELS)[boundedLevel - 1];
    const bespokePassive = LITTLE_BUSTERS_PASSIVES[definition.id];
    const passive = bespokePassive ?? PASSIVE_BY_STARTING_ABILITY[definition.startingAbilityCardId] ?? {
        passiveAbilityId: "commander-charge",
        passiveName: "Heroic Assault"
      };
    return {
      ...stats,
      type: bespokePassive?.type ?? ("ranged" in passive && passive.ranged ? "ranged" : "ground"),
      passiveAbilityId: passive.passiveAbilityId,
      passiveName: passive.passiveName
    };
  }
  const might = definition.type === "might";
  const attackBias = Math.max(0, definition.startingStats.attack - (might ? 2 : 1));
  const defenseBias = Math.max(0, definition.startingStats.defense - 1);
  const magicBias = Math.max(0, definition.startingStats.power - 1);
  const passive = PASSIVE_BY_STARTING_ABILITY[definition.startingAbilityCardId] ??
    (might
      ? { passiveAbilityId: "commander-charge", passiveName: "Heroic Assault" }
      : { passiveAbilityId: "reduce-spell-damage-1", passiveName: "Arcane Ward", ranged: true });

  return {
    attack: (might ? 2 : 1) + Math.floor((boundedLevel - 1) / (might ? 2 : 3)) + Math.min(1, attackBias),
    defense: 1 + Math.floor((boundedLevel - 1) / 3) + Math.min(1, defenseBias),
    health: (might ? 4 : 3) + Math.floor((boundedLevel - 1) / 2) + (definition.startingStats.defense >= 3 ? 1 : 0),
    initiative: (might ? 5 : 6) + Math.floor((boundedLevel - 1) / (might ? 3 : 2)) + (magicBias >= 2 ? 1 : 0),
    type: passive.ranged ? "ranged" : "ground",
    passiveAbilityId: passive.passiveAbilityId,
    passiveName: passive.passiveName
  };
}

export function makeHeroCombatUnit(hero: HeroState, position: number): CombatUnitState | null {
  const definition = hero.heroDefId ? coreHeroDefinitions[hero.heroDefId] : undefined;
  if (!definition || definition.faction !== "little_busters") return null;
  const profile = heroCombatProfile(definition, hero.level);
  const grade = Math.max(0, Math.min(3, hero.grade ?? 0));
  // Seishun grade bonuses are cumulative: Regular +1 HP; Ace additionally
  // +1 Initiative; Strongest additionally +1 Attack and +1 HP.
  const gradeHealth = grade >= 1 ? 1 : 0;
  const gradeInitiative = grade >= 2 ? 1 : 0;
  const gradeAttack = grade >= 3 ? 1 : 0;
  if (grade >= 3) profile.health += 1;
  return {
    id: heroUnitId(hero.id),
    controllerId: hero.controllerId,
    name: definition.name,
    cardName: definition.name,
    variant: "few",
    grade: "gold",
    type: profile.type,
    attack: profile.attack + gradeAttack,
    defense: profile.defense,
    maxHealth: profile.health + gradeHealth,
    damage: 0,
    initiative: profile.initiative + gradeInitiative,
    position,
    activatedThisRound: false,
    movedThisActivation: false,
    retaliatedThisRound: false,
    defenseToken: false,
    abilities: [profile.passiveAbilityId],
    heroUnit: true,
    heroDefId: definition.id,
    heroLevel: hero.level,
    heroGrade: grade,
    heroPassiveName: profile.passiveName,
    assets: { cardImage: definition.portrait, imageAlt: `${definition.name} dynamic battlefield hero card` }
  };
}

/** Auto-place a Little Busters hero at full Health. Death is combat-scoped. */
export function injectHeroIntoCombat(
  state: GameState,
  heroId: HeroId,
  preferredCells: readonly number[]
): CombatUnitState | null {
  const combat = state.combat;
  const hero = state.heroes[heroId];
  if (!combat || !hero || combat.units[heroUnitId(heroId)]) return null;
  const occupied = new Set(Object.values(combat.units).filter((unit) => unit.damage < unit.maxHealth).map((unit) => unit.position));
  for (const obstacle of combat.obstacles ?? []) occupied.add(obstacle);
  const cell = preferredCells.find((candidate) => !occupied.has(candidate));
  if (cell === undefined) return null;
  const unit = makeHeroCombatUnit(hero, cell);
  if (!unit) return null;
  combat.units[unit.id] = unit;
  return unit;
}

export function fightingHeroIdForPlayer(state: GameState, playerId: PlayerId): HeroId | null {
  const context = state.combat?.context;
  if (!context) return null;
  if (context.kind === "neutral") return state.heroes[context.heroId]?.controllerId === playerId ? context.heroId : null;
  if (context.kind === "player") {
    if (state.heroes[context.attackerHeroId]?.controllerId === playerId) return context.attackerHeroId;
    if (context.defenderHeroId && state.heroes[context.defenderHeroId]?.controllerId === playerId) return context.defenderHeroId;
    return null;
  }
  return Object.values(state.heroes).find((hero) => hero.controllerId === playerId && hero.kind === "main")?.id ?? null;
}
