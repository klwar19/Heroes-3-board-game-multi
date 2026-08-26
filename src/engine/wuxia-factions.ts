import { EQUIPMENT_IDS } from "@/data/anime/equipment";
import { isAdjacent } from "./battlefield";
import { playerHasEquipment } from "./anime-equipment";
import { cultivationRealmOf, type CultivationRealm } from "./anime-cultivation";
import { appendEvent, nextEventNumber } from "./events";
import type {
  CombatState,
  CombatUnitState,
  GameState,
  PlayerId,
  ResolutionStackItem
} from "./state";

export const AZURE_BREEZE_FACTION_ID = "azure_breeze";
export const HEAVENLY_DEMON_FACTION_ID = "heavenly_demon";
export const SECT_QI_MAX = 3;
export const BLOOD_ESSENCE_MAX = 4;
export const SWORD_INTENT_MAX = 3;
export const SWORD_INTENT_HERO_IDS = new Set(["qingyun", "xuedao"]);
export const JIANXU_HERO_ID = "jianxu";
export const YULIAN_HERO_ID = "yulian";
export const LUOHUN_HERO_ID = "luohun";
export const SHIYAN_HERO_ID = "shiyan";
export const SOUL_BANNER_SHADE_CARD_IMAGE = "/assets/anime/units/soul-banner-shade-card.webp";
export const SOUL_BANNER_SHADE_ARMY_PREFIX = "heavenly_demon_soul_banner_shade_";

function factionOf(state: Pick<GameState, "players">, playerId: PlayerId): string | undefined {
  return state.players[playerId]?.factionId;
}

function mainHeroDefId(state: Pick<GameState, "heroes">, playerId: PlayerId): string | undefined {
  return Object.values(state.heroes).find(
    (hero) => hero.controllerId === playerId && hero.kind === "main"
  )?.heroDefId;
}

/**
 * Wuxia towns run the Cultivation Realm track as their ONLY hero-progression
 * system (USER RULE: "when select wuxia town, no hero grade, only cultivation").
 * The signature-meter upgrades that USED to be hero-grade nodes are FOLDED into
 * cultivation: each former node auto-grants the moment the main hero's Cultivation
 * Realm reaches its mapped threshold, so the faction identity is preserved without
 * a duplicate grade tree. Realm is 0 when the Cultivation module is off, so the
 * base meter still works — the upgrades simply never arm.
 */
const WUXIA_CULTIVATION_UPGRADE_REALM: Record<string, CultivationRealm> = {
  // Azure Breeze (Sect Qi): start with +1 Qi at Foundation, +1 cap at Core
  // Formation, and the easier Sword Domain release at Nascent Soul.
  "xianxia-meridian-circulation": 1,
  "xianxia-body-refinement": 2,
  "xianxia-sword-domain": 3,
  // Heavenly Demon (Blood Essence): start with 1 Essence at Blood Foundation,
  // +1 cap at Demon Core, the stronger Blood Frenzy at Demon Soul.
  "modao-blood-refinement": 1,
  "modao-corpse-furnace": 2,
  "modao-forbidden-overreach": 3
};

/** Whether a wuxia hero has reached the Cultivation Realm that grants an upgrade. */
function heroHasWuxiaUpgrade(state: GameState, playerId: PlayerId, upgradeId: string): boolean {
  const threshold = WUXIA_CULTIVATION_UPGRADE_REALM[upgradeId];
  return threshold !== undefined && cultivationRealmOf(state, playerId) >= threshold;
}

function sectQiCapacity(state: GameState, playerId: PlayerId): number {
  return SECT_QI_MAX + (heroHasWuxiaUpgrade(state, playerId, "xianxia-body-refinement") ? 1 : 0);
}

function bloodEssenceCapacity(state: GameState, playerId: PlayerId): number {
  return BLOOD_ESSENCE_MAX + (heroHasWuxiaUpgrade(state, playerId, "modao-corpse-furnace") ? 1 : 0);
}

function swordIntentThreshold(state: GameState, playerId: PlayerId): number {
  return heroHasWuxiaUpgrade(state, playerId, "xianxia-sword-domain") ? 2 : SWORD_INTENT_MAX;
}

function livingAdjacentAllies(
  combat: CombatState,
  unit: CombatUnitState,
  at = unit.position
): CombatUnitState[] {
  return Object.values(combat.units).filter(
    (candidate) =>
      candidate.id !== unit.id &&
      candidate.controllerId === unit.controllerId &&
      candidate.damage < candidate.maxHealth &&
      isAdjacent(at, candidate.position)
  );
}

/** Stamp only the faction meter owned by each fighter. */
export function initializeCultivationFactionCombat(
  state: GameState,
  combat: CombatState
): void {
  const records: NonNullable<CombatState["cultivationFactions"]> = {};
  for (const playerId of [combat.attackerPlayerId, combat.defenderPlayerId]) {
    const factionId = factionOf(state, playerId);
    if (factionId === AZURE_BREEZE_FACTION_ID) {
      records[playerId] = {
        // Meridian Circulation (Foundation realm) grants the +1 starting Qi.
        sectQi: Math.min(SECT_QI_MAX, 1 + (heroHasWuxiaUpgrade(state, playerId, "xianxia-meridian-circulation") ? 1 : 0)),
        swordIntent: 0
      };
    } else if (factionId === HEAVENLY_DEMON_FACTION_ID) {
      records[playerId] = {
        // Blood Refinement (Foundation realm) grants the 1 starting Essence.
        bloodEssence: heroHasWuxiaUpgrade(state, playerId, "modao-blood-refinement") ? 1 : 0,
        swordIntent: 0
      };
    }
  }
  if (Object.keys(records).length > 0) combat.cultivationFactions = records;
}

/** Moving into a genuinely new friendly adjacency circulates one Sect Qi. */
export function gainSectQiAfterMove(
  state: GameState,
  unit: CombatUnitState,
  from: number,
  to: number
): void {
  const combat = state.combat;
  if (!combat || factionOf(state, unit.controllerId) !== AZURE_BREEZE_FACTION_ID) return;
  const record = combat.cultivationFactions?.[unit.controllerId];
  if (!record) return;
  const allies = Object.values(combat.units).filter(
    (candidate) =>
      candidate.id !== unit.id &&
      candidate.controllerId === unit.controllerId &&
      candidate.damage < candidate.maxHealth
  );
  const formedNewLink = allies.some(
    (ally) => isAdjacent(to, ally.position) && !isAdjacent(from, ally.position)
  );
  const capacity = sectQiCapacity(state, unit.controllerId);
  if (!formedNewLink || (record.sectQi ?? 0) >= capacity) return;
  record.sectQi = (record.sectQi ?? 0) + 1;
  appendEvent(state, {
    type: "HERO_SKILL_USED",
    playerId: unit.controllerId,
    nodeId: "azure-sect-qi",
    message: `${unit.cardName} closes the formation: Sect Qi ${record.sectQi}/${capacity}.`
  });
}

/**
 * Latch automatic faction spends onto one attack. This happens once, at attack
 * declaration, so reaction previews and final damage can never disagree.
 */
export function applyCultivationAttackDeclaration(
  state: GameState,
  stackItem: ResolutionStackItem,
  attacker: CombatUnitState,
  defender: CombatUnitState,
  isRetaliation: boolean
): void {
  const combat = state.combat;
  if (!combat || isRetaliation) return;

  const attackerRecord = combat.cultivationFactions?.[attacker.controllerId];
  const attackerFaction = factionOf(state, attacker.controllerId);
  if (
    attackerFaction === AZURE_BREEZE_FACTION_ID &&
    attackerRecord &&
    (attackerRecord.sectQi ?? 0) > 0 &&
    livingAdjacentAllies(combat, attacker).length > 0
  ) {
    const adjacentAllies = livingAdjacentAllies(combat, attacker).length;
    const formationAmount =
      mainHeroDefId(state, attacker.controllerId) === JIANXU_HERO_ID && adjacentAllies >= 2 ? 2 : 1;
    attackerRecord.sectQi = Math.max(0, (attackerRecord.sectQi ?? 0) - 1);
    stackItem.modifiers.cultivationAttackBonus =
      (stackItem.modifiers.cultivationAttackBonus ?? 0) + formationAmount;
    appendEvent(state, {
      type: "HERO_SKILL_USED",
      playerId: attacker.controllerId,
      nodeId: formationAmount === 2 ? "jianxu-seven-star-array" : "azure-sword-formation",
      message: `${formationAmount === 2 ? "Seven-Star Array" : "Sword Formation"} spends 1 Sect Qi: ${attacker.cardName} gains +${formationAmount} Attack.`
    });
  }

  // Sword Intent is hero-specific, not a town-wide free bonus. Three damaging
  // own attacks temper the intent; the following own attack releases it.
  if (
    attackerRecord &&
    SWORD_INTENT_HERO_IDS.has(mainHeroDefId(state, attacker.controllerId) ?? "") &&
    (attackerRecord.swordIntent ?? 0) >= swordIntentThreshold(state, attacker.controllerId)
  ) {
    attackerRecord.swordIntent = 0;
    stackItem.modifiers.cultivationAttackBonus =
      (stackItem.modifiers.cultivationAttackBonus ?? 0) + 1;
    appendEvent(state, {
      type: "HERO_SKILL_USED",
      playerId: attacker.controllerId,
      nodeId: "sword-intent-release",
      message: `Sword Intent releases: ${attacker.cardName} gains +1 Attack.`
    });
  }

  if (
    attackerFaction === HEAVENLY_DEMON_FACTION_ID &&
    attackerRecord &&
    (attackerRecord.bloodEssence ?? 0) > 0 &&
    attackerRecord.bloodFrenzySpentRound !== combat.round
  ) {
    attackerRecord.bloodEssence = Math.max(0, (attackerRecord.bloodEssence ?? 0) - 1);
    attackerRecord.bloodFrenzySpentRound = combat.round;
    const mastery = heroHasWuxiaUpgrade(state, attacker.controllerId, "modao-forbidden-overreach");
    stackItem.modifiers.cultivationAttackBonus =
      (stackItem.modifiers.cultivationAttackBonus ?? 0) + (mastery ? 2 : 1);
    appendEvent(state, {
      type: "HERO_SKILL_USED",
      playerId: attacker.controllerId,
      nodeId: "heavenly-demon-blood-frenzy",
      message: `Blood Frenzy spends 1 Essence: ${attacker.cardName} gains +${mastery ? 2 : 1} Attack.`
    });
  }

  const defenderRecord = combat.cultivationFactions?.[defender.controllerId];
  if (
    factionOf(state, defender.controllerId) === AZURE_BREEZE_FACTION_ID &&
    defenderRecord &&
    (defenderRecord.sectQi ?? 0) > 0 &&
    livingAdjacentAllies(combat, defender).length > 0
  ) {
    defenderRecord.sectQi = Math.max(0, (defenderRecord.sectQi ?? 0) - 1);
    stackItem.modifiers.cultivationDefenseBonus = 1;
    const jadeBodyRecovery =
      mainHeroDefId(state, defender.controllerId) === YULIAN_HERO_ID &&
      defender.damage > 0 &&
      defenderRecord.jadeBodyTemperingRound !== combat.round;
    if (jadeBodyRecovery) {
      defender.damage = Math.max(0, defender.damage - 1);
      defenderRecord.jadeBodyTemperingRound = combat.round;
    }
    appendEvent(state, {
      type: "HERO_SKILL_USED",
      playerId: defender.controllerId,
      nodeId: jadeBodyRecovery ? "yulian-jade-body" : "azure-shared-ward",
      message: `Shared Ward spends 1 Sect Qi: ${defender.cardName} gains +1 Defense${jadeBodyRecovery ? " and recovers 1 damage through Jade Body" : ""}.`
    });
  }
}

/** A damaging own attack tempers one point of hero-specific Sword Intent. */
export function recordSwordIntentAfterAttack(
  state: GameState,
  attacker: CombatUnitState,
  isRetaliation: boolean,
  damage: number
): void {
  const record = state.combat?.cultivationFactions?.[attacker.controllerId];
  if (
    !record ||
    isRetaliation ||
    damage <= 0 ||
    !SWORD_INTENT_HERO_IDS.has(mainHeroDefId(state, attacker.controllerId) ?? "")
  ) return;
  const threshold = swordIntentThreshold(state, attacker.controllerId);
  record.swordIntent = Math.min(threshold, (record.swordIntent ?? 0) + 1);
  appendEvent(state, {
    type: "HERO_SKILL_USED",
    playerId: attacker.controllerId,
    nodeId: "sword-intent-tempered",
    message: `Sword Intent ${record.swordIntent}/${threshold}.`
  });
}

/** A real Heavenly Demon army card feeds Blood Essence once per combat. */
export function gainBloodEssenceFromCasualty(state: GameState, unit: CombatUnitState): void {
  const combat = state.combat;
  if (
    !combat ||
    factionOf(state, unit.controllerId) !== HEAVENLY_DEMON_FACTION_ID ||
    unit.heavenlyDemonEssenceGranted ||
    unit.summoned ||
    unit.temporary ||
    !unit.armyUnitId
  ) return;
  const record = combat.cultivationFactions?.[unit.controllerId];
  if (!record) return;
  unit.heavenlyDemonEssenceGranted = true;
  const capacity = bloodEssenceCapacity(state, unit.controllerId);
  const corpseFurnaceSurge =
    mainHeroDefId(state, unit.controllerId) === SHIYAN_HERO_ID &&
    record.corpseFurnaceSurgeRound !== combat.round;
  const amount = corpseFurnaceSurge ? 2 : 1;
  if (corpseFurnaceSurge) record.corpseFurnaceSurgeRound = combat.round;
  record.bloodEssence = Math.min(capacity, (record.bloodEssence ?? 0) + amount);
  appendEvent(state, {
    type: "HERO_SKILL_USED",
    playerId: unit.controllerId,
    nodeId: corpseFurnaceSurge ? "shiyan-corpse-furnace-sutra" : "heavenly-demon-blood-essence",
    message: `${unit.cardName} feeds the ${corpseFurnaceSurge ? "Corpse-Furnace Sutra" : "Blood Furnace"} (+${amount}): Essence ${record.bloodEssence}/${capacity}.`
  });
}

/** Ten Thousand Souls Banner: one weak, temporary flying shade in round 1. */
export function injectSoulBannerShade(
  state: GameState,
  playerId: PlayerId,
  preferredCells: readonly number[]
): CombatUnitState | null {
  const combat = state.combat;
  if (
    !combat ||
    combat.round !== 1 ||
    factionOf(state, playerId) !== HEAVENLY_DEMON_FACTION_ID ||
    !playerHasEquipment(state, playerId, EQUIPMENT_IDS.soulBanner)
  ) return null;
  const existing = Object.values(combat.units).find(
    (unit) => unit.controllerId === playerId && unit.armyUnitId === `${SOUL_BANNER_SHADE_ARMY_PREFIX}${playerId}`
  );
  if (existing) return existing;
  const occupied = new Set(
    Object.values(combat.units).filter((unit) => unit.damage < unit.maxHealth).map((unit) => unit.position)
  );
  const position = preferredCells.find((cell) => !occupied.has(cell));
  if (position === undefined) return null;
  const soulShepherd = mainHeroDefId(state, playerId) === LUOHUN_HERO_ID;
  const shade: CombatUnitState = {
    id: `unit_${playerId}_soul_banner_${nextEventNumber(state)}`,
    controllerId: playerId,
    name: "Bound Soul",
    cardName: "Bound Soul",
    variant: "neutral",
    grade: "bronze",
    type: "flying",
    attack: 2,
    defense: soulShepherd ? 1 : 0,
    maxHealth: soulShepherd ? 3 : 2,
    damage: 0,
    initiative: 8,
    position,
    activatedThisRound: false,
    movedThisActivation: false,
    retaliatedThisRound: false,
    defenseToken: false,
    abilities: ["ignores-retaliation"],
    summoned: true,
    temporary: true,
    armyUnitId: `${SOUL_BANNER_SHADE_ARMY_PREFIX}${playerId}`,
    heroGradeExpiresAfterRound: soulShepherd ? 2 : 1,
    assets: { cardImage: SOUL_BANNER_SHADE_CARD_IMAGE, imageAlt: "Bound Soul unit card" }
  };
  combat.units[shade.id] = shade;
  appendEvent(state, {
    type: "HERO_SKILL_USED",
    playerId,
    nodeId: "soul-banner",
    message: `Ten Thousand Souls Banner summons a Bound Soul through combat round ${soulShepherd ? 2 : 1}${soulShepherd ? " under Bai Luohun's Soul Shepherd art" : ""}.`
  });
  return shade;
}
