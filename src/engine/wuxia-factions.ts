import { EQUIPMENT_IDS } from "@/data/anime/equipment";
import {
  battlefieldTokenCovers,
  unitAdjacentToCell,
  unitCellDistance,
  unitCells,
  unitOccupiesCell,
  unitsAdjacent,
} from "./hex-footprint";
import type { WuxiaArtId } from "@/data/units/abilities";
import { combatGeometry, getBattlefieldPositions } from "./battlefield";
import { isFortificationPosition } from "./siege";
import { playerHasEquipment } from "./anime-equipment";
import { cultivationEnabled, cultivationRealmLabel, cultivationRealmOf, type CultivationRealm } from "./anime-cultivation";
import { appendEvent, nextEventNumber } from "./events";
import { getUnitAbilityDefinitions } from "./unit-abilities";
import type {
  CombatState,
  CombatUnitState,
  EffectDefinition,
  GameState,
  PlayerId,
  ResolutionStackItem,
  UnitId
} from "./state";

export const AZURE_BREEZE_FACTION_ID = "azure_breeze";
export const HEAVENLY_DEMON_FACTION_ID = "heavenly_demon";
/** Sect Qi capacity (Core Formation realm adds 1). */
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

type CultivationRecord = NonNullable<CombatState["cultivationFactions"]>[PlayerId];

function factionOf(state: Pick<GameState, "players">, playerId: PlayerId): string | undefined {
  return state.players[playerId]?.factionId;
}

function mainHeroDefId(state: Pick<GameState, "heroes">, playerId: PlayerId): string | undefined {
  return Object.values(state.heroes).find(
    (hero) => hero.controllerId === playerId && hero.kind === "main"
  )?.heroDefId;
}

function alive(unit: CombatUnitState): boolean {
  return unit.damage < unit.maxHealth;
}

/** Whether a unit carries one implemented wuxia art (printed side or veteran rank). */
export function unitHasWuxiaArt(unit: CombatUnitState, art: WuxiaArtId): boolean {
  return getUnitAbilityDefinitions(unit).some(
    (ability) =>
      ability.implementationStatus === "implemented" &&
      ability.effect?.type === "WUXIA_ART" &&
      ability.effect.art === art
  );
}

function abilityIdForArt(unit: CombatUnitState, art: WuxiaArtId): string {
  return (
    getUnitAbilityDefinitions(unit).find(
      (ability) => ability.effect?.type === "WUXIA_ART" && ability.effect.art === art
    )?.id ?? art
  );
}

/** Once-per-round keys: the unit arts plus the Demon Ancestor's furnace specialty. */
type RoundArtKey = WuxiaArtId | "ancestral-blood";

function artUsedThisRound(combat: CombatState, record: CultivationRecord, art: RoundArtKey, unitId: string): boolean {
  return record?.artRounds?.[`${art}:${unitId}`] === combat.round;
}

function markArtRound(combat: CombatState, record: NonNullable<CultivationRecord>, art: RoundArtKey, unitId: string): void {
  record.artRounds = { ...(record.artRounds ?? {}), [`${art}:${unitId}`]: combat.round };
}

function artUsedThisCombat(record: CultivationRecord, art: WuxiaArtId, unitId: string): boolean {
  return Boolean(record?.artUsedCombat?.includes(`${art}:${unitId}`));
}

function markArtCombat(record: NonNullable<CultivationRecord>, art: WuxiaArtId, unitId: string): void {
  record.artUsedCombat = [...(record.artUsedCombat ?? []), `${art}:${unitId}`];
}

function artEvent(state: GameState, unit: CombatUnitState, art: WuxiaArtId, message: string, targetUnitId = unit.id): void {
  appendEvent(state, {
    type: "UNIT_ABILITY_TRIGGERED",
    unitId: unit.id,
    targetUnitId,
    abilityId: abilityIdForArt(unit, art),
    message
  });
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
  // Azure Breeze (Sect Qi): start with 1 Qi at Foundation, +1 Qi capacity at
  // Core Formation, and Sword Domain at Nascent Soul (formation links may
  // circulate Qi twice per round; Sword Intent releases after 2 temperings).
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

/** A living commander of this slug fights for the player in the current combat. */
function commanderStands(state: GameState, playerId: PlayerId, slug: string): CombatUnitState | undefined {
  return Object.values(state.combat?.units ?? {}).find(
    (unit) => unit.controllerId === playerId && unit.commanderSlug === slug && alive(unit)
  );
}

export function sectQiCapacity(state: GameState, playerId: PlayerId): number {
  return (
    SECT_QI_MAX +
    (heroHasWuxiaUpgrade(state, playerId, "xianxia-body-refinement") ? 1 : 0) +
    // Sword Saint commander "Sect Grandmaster": +1 capacity while it stands.
    (commanderStands(state, playerId, "sword_saint") ? 1 : 0)
  );
}

export function bloodEssenceCapacity(state: GameState, playerId: PlayerId): number {
  return BLOOD_ESSENCE_MAX + (heroHasWuxiaUpgrade(state, playerId, "modao-corpse-furnace") ? 1 : 0);
}

function swordIntentThreshold(state: GameState, playerId: PlayerId): number {
  return heroHasWuxiaUpgrade(state, playerId, "xianxia-sword-domain") ? 2 : SWORD_INTENT_MAX;
}

function formationLinkGainsPerRound(state: GameState, playerId: PlayerId): number {
  return heroHasWuxiaUpgrade(state, playerId, "xianxia-sword-domain") ? 2 : 1;
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
      alive(candidate) &&
      unitAdjacentToCell(combat, candidate, at)
  );
}

function azureRecord(state: GameState, playerId: PlayerId): NonNullable<CultivationRecord> | undefined {
  if (factionOf(state, playerId) !== AZURE_BREEZE_FACTION_ID) return undefined;
  return state.combat?.cultivationFactions?.[playerId];
}

function demonRecord(state: GameState, playerId: PlayerId): NonNullable<CultivationRecord> | undefined {
  if (factionOf(state, playerId) !== HEAVENLY_DEMON_FACTION_ID) return undefined;
  return state.combat?.cultivationFactions?.[playerId];
}

/**
 * Add Sect Qi up to capacity. Returns the amount actually gained (0 at cap or
 * for a side without the Azure meter). Shared by unit arts, hero cards and the
 * Sword Saint commander so every source respects the same cap.
 */
export function gainSectQi(state: GameState, playerId: PlayerId, amount: number, nodeId: string, reason: string): number {
  const record = azureRecord(state, playerId);
  if (!record || amount <= 0) return 0;
  const capacity = sectQiCapacity(state, playerId);
  const before = record.sectQi ?? 0;
  const after = Math.min(capacity, before + amount);
  if (after <= before) return 0;
  record.sectQi = after;
  appendEvent(state, {
    type: "HERO_SKILL_USED",
    playerId,
    nodeId,
    message: `${reason}: Sect Qi ${after}/${capacity}.`
  });
  return after - before;
}

/** Add Blood Essence up to capacity. Returns the amount actually gained. */
export function gainBloodEssence(state: GameState, playerId: PlayerId, amount: number, nodeId: string, reason: string): number {
  const record = demonRecord(state, playerId);
  if (!record || amount <= 0) return 0;
  const capacity = bloodEssenceCapacity(state, playerId);
  const before = record.bloodEssence ?? 0;
  const after = Math.min(capacity, before + amount);
  if (after <= before) return 0;
  record.bloodEssence = after;
  appendEvent(state, {
    type: "HERO_SKILL_USED",
    playerId,
    nodeId,
    message: `${reason}: Essence ${after}/${capacity}.`
  });
  return after - before;
}

/** Current meter values (0 for a side without that meter). */
export function currentSectQi(state: GameState, playerId: PlayerId): number {
  return azureRecord(state, playerId)?.sectQi ?? 0;
}

export function currentBloodEssence(state: GameState, playerId: PlayerId): number {
  return demonRecord(state, playerId)?.bloodEssence ?? 0;
}

/** Spend meter points; returns false (and spends nothing) when short. */
export function spendCultivationMeter(
  state: GameState,
  playerId: PlayerId,
  meter: "sectQi" | "bloodEssence",
  amount: number
): boolean {
  const record = meter === "sectQi" ? azureRecord(state, playerId) : demonRecord(state, playerId);
  if (!record || amount <= 0) return amount <= 0;
  const have = record[meter] ?? 0;
  if (have < amount) return false;
  record[meter] = have - amount;
  return true;
}

/** Sword Intent (Qingyun / Xuedao): add tempering points up to the release threshold. */
export function gainSwordIntent(state: GameState, playerId: PlayerId, amount: number): number {
  const record = state.combat?.cultivationFactions?.[playerId];
  if (!record || amount <= 0 || !SWORD_INTENT_HERO_IDS.has(mainHeroDefId(state, playerId) ?? "")) return 0;
  const threshold = swordIntentThreshold(state, playerId);
  const before = record.swordIntent ?? 0;
  record.swordIntent = Math.min(threshold, before + amount);
  if (record.swordIntent > before) {
    appendEvent(state, {
      type: "HERO_SKILL_USED",
      playerId,
      nodeId: "sword-intent-tempered",
      message: `Sword Intent ${record.swordIntent}/${threshold}.`
    });
  }
  return record.swordIntent - before;
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
        sectQi: heroHasWuxiaUpgrade(state, playerId, "xianxia-meridian-circulation") ? 1 : 0,
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

/**
 * Moving into a genuinely new friendly adjacency circulates Sect Qi: once per
 * combat round (twice at Nascent Soul). Beyond that limit, Qi Breathing (once per
 * combat) and Cloud Relay (once per round) let their own unit's link still count.
 */
export function gainSectQiAfterMove(
  state: GameState,
  unit: CombatUnitState,
  from: number,
  to: number
): void {
  const combat = state.combat;
  if (!combat) return;
  const record = azureRecord(state, unit.controllerId);
  if (!record) return;
  const allies = Object.values(combat.units).filter(
    (candidate) =>
      candidate.id !== unit.id &&
      candidate.controllerId === unit.controllerId &&
      alive(candidate)
  );
  const formedNewLink = allies.some(
    (ally) => unitAdjacentToCell(combat, ally, to) && !unitAdjacentToCell(combat, ally, from)
  );
  const capacity = sectQiCapacity(state, unit.controllerId);
  if (!formedNewLink || (record.sectQi ?? 0) >= capacity) return;
  // Legacy records carry only sectQiGainedRound: that counts as one gain taken.
  const gainsThisRound =
    record.sectQiGainedRound === combat.round ? (record.sectQiLinkGains ?? 1) : 0;
  if (gainsThisRound < formationLinkGainsPerRound(state, unit.controllerId)) {
    record.sectQiGainedRound = combat.round;
    record.sectQiLinkGains = gainsThisRound + 1;
    gainSectQi(state, unit.controllerId, 1, "azure-sect-qi", `${unit.cardName} closes the formation`);
    return;
  }
  if (unitHasWuxiaArt(unit, "crane-relay") && !artUsedThisRound(combat, record, "crane-relay", unit.id)) {
    markArtRound(combat, record, "crane-relay", unit.id);
    artEvent(state, unit, "crane-relay", `${unit.cardName}'s Cloud Relay carries the formation's Qi.`);
    gainSectQi(state, unit.controllerId, 1, "azure-sect-qi", `${unit.cardName}'s Cloud Relay`);
    return;
  }
  if (unitHasWuxiaArt(unit, "outer-breathing") && !artUsedThisCombat(record, "outer-breathing", unit.id)) {
    markArtCombat(record, "outer-breathing", unit.id);
    artEvent(state, unit, "outer-breathing", `${unit.cardName} breathes with the formation.`);
    gainSectQi(state, unit.controllerId, 1, "azure-sect-qi", `${unit.cardName}'s Qi Breathing`);
  }
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

  const addAttack = (amount: number) => {
    stackItem.modifiers.cultivationAttackBonus =
      (stackItem.modifiers.cultivationAttackBonus ?? 0) + amount;
  };
  const addDefense = (amount: number) => {
    stackItem.modifiers.cultivationDefenseBonus =
      (stackItem.modifiers.cultivationDefenseBonus ?? 0) + amount;
  };

  // Bloodscent is unit-intrinsic (no meter): the Shadow Sabre smells blood.
  if (unitHasWuxiaArt(attacker, "bloodscent") && defender.damage > 0 && alive(defender)) {
    addAttack(1);
    artEvent(state, attacker, "bloodscent", `${attacker.cardName}'s Bloodscent: +1 Attack against the wounded ${defender.cardName}.`, defender.id);
  }

  const attackerRecord = azureRecord(state, attacker.controllerId);
  const adjacentAllies = livingAdjacentAllies(combat, attacker).length;
  if (attackerRecord && (attackerRecord.sectQi ?? 0) > 0 && adjacentAllies > 0) {
    const burst = unitHasWuxiaArt(attacker, "heir-burst") && (attackerRecord.sectQi ?? 0) >= 2;
    const spend = burst ? 2 : 1;
    // Seven-Star Array (Jianxu innate): a unit striking from inside a tight
    // formation (2+ adjacent allies) converts the spent Qi into +1 more Attack.
    const sevenStarArray = mainHeroDefId(state, attacker.controllerId) === JIANXU_HERO_ID && adjacentAllies >= 2;
    const amount = spend + (sevenStarArray ? 1 : 0);
    attackerRecord.sectQi = Math.max(0, (attackerRecord.sectQi ?? 0) - spend);
    addAttack(amount);
    stackItem.modifiers.wuxiaQiAttack = true;
    const edge = unitHasWuxiaArt(attacker, "qi-edge");
    if (edge) {
      stackItem.modifiers.cultivationDefensePierce = (stackItem.modifiers.cultivationDefensePierce ?? 0) + 1;
    }
    appendEvent(state, {
      type: "HERO_SKILL_USED",
      playerId: attacker.controllerId,
      nodeId: sevenStarArray ? "jianxu-seven-star-array" : burst ? "azure-inheritance-burst" : "azure-sword-formation",
      message: `${sevenStarArray ? "Seven-Star Array" : burst ? "Inheritance Burst" : "Sword Formation"} spends ${spend} Sect Qi: ${attacker.cardName} gains +${amount} Attack${edge ? " and ignores 1 Defense (Qi Edge)" : ""}.`
    });
  }

  // Sword Intent is hero-specific, not a town-wide free bonus. Three damaging
  // own attacks temper the intent; the following own attack releases it.
  const intentRecord = combat.cultivationFactions?.[attacker.controllerId];
  if (
    intentRecord &&
    SWORD_INTENT_HERO_IDS.has(mainHeroDefId(state, attacker.controllerId) ?? "") &&
    (intentRecord.swordIntent ?? 0) >= swordIntentThreshold(state, attacker.controllerId)
  ) {
    intentRecord.swordIntent = 0;
    addAttack(1);
    appendEvent(state, {
      type: "HERO_SKILL_USED",
      playerId: attacker.controllerId,
      nodeId: "sword-intent-release",
      message: `Sword Intent releases: ${attacker.cardName} gains +1 Attack.`
    });
  }

  const demonAttacker = demonRecord(state, attacker.controllerId);
  if (
    demonAttacker &&
    (demonAttacker.bloodEssence ?? 0) > 0 &&
    demonAttacker.bloodFrenzySpentRound !== combat.round
  ) {
    demonAttacker.bloodEssence = Math.max(0, (demonAttacker.bloodEssence ?? 0) - 1);
    demonAttacker.bloodFrenzySpentRound = combat.round;
    const mastery = heroHasWuxiaUpgrade(state, attacker.controllerId, "modao-forbidden-overreach");
    addAttack(mastery ? 2 : 1);
    appendEvent(state, {
      type: "HERO_SKILL_USED",
      playerId: attacker.controllerId,
      nodeId: "heavenly-demon-blood-frenzy",
      message: `Blood Frenzy spends 1 Essence: ${attacker.cardName} gains +${mastery ? 2 : 1} Attack.`
    });
  }

  const defenderRecord = azureRecord(state, defender.controllerId);
  if (defenderRecord && livingAdjacentAllies(combat, defender).length > 0) {
    // Formation Anchor: an adjacent Warden holds the line for free (once per
    // round per Warden) before any Qi is spent.
    const anchor = livingAdjacentAllies(combat, defender).find(
      (ally) => unitHasWuxiaArt(ally, "warden-anchor") && !artUsedThisRound(combat, defenderRecord, "warden-anchor", ally.id)
    );
    const paidWithQi = !anchor && (defenderRecord.sectQi ?? 0) > 0;
    if (anchor || paidWithQi) {
      if (anchor) {
        markArtRound(combat, defenderRecord, "warden-anchor", anchor.id);
        artEvent(state, anchor, "warden-anchor", `${anchor.cardName}'s Formation Anchor shields ${defender.cardName}.`, defender.id);
      } else {
        defenderRecord.sectQi = Math.max(0, (defenderRecord.sectQi ?? 0) - 1);
      }
      addDefense(1);
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
        message: `Shared Ward ${anchor ? "(Formation Anchor, no Qi spent)" : "spends 1 Sect Qi"}: ${defender.cardName} gains +1 Defense${jadeBodyRecovery ? " and recovers 1 damage through Jade Body" : ""}.`
      });
    }
  }

  const demonDefender = demonRecord(state, defender.controllerId);
  if (
    demonDefender &&
    unitHasWuxiaArt(defender, "demon-body") &&
    !artUsedThisRound(combat, demonDefender, "demon-body", defender.id)
  ) {
    // Printed "the first time each round it is attacked": the first attack
    // claims the round's use whether or not Essence is there to pay for it.
    markArtRound(combat, demonDefender, "demon-body", defender.id);
    if ((demonDefender.bloodEssence ?? 0) > 0) {
      demonDefender.bloodEssence = Math.max(0, (demonDefender.bloodEssence ?? 0) - 1);
      addDefense(1);
      artEvent(state, defender, "demon-body", `${defender.cardName}'s Heavenly Demon Body spends 1 Essence: +1 Defense against this attack.`);
    }
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

/** A "damage" veteran-style pick request (the elemental-veterancy choice queue). */
export type WuxiaDamagePick = {
  kind: "damage";
  unitId: string;
  abilityId: string;
  amount: number;
  anchorId?: string;
  adjacent: true;
  excludeTargetId: string;
  enemiesOnly: true;
  /** Soulfire Volley: Blood Essence spent when the pick resolves. */
  bloodEssenceCost?: number;
};

/**
 * After-attack wuxia arts. Returns the player-choice damage picks the caller
 * must queue (Sword Wave / Soulfire Volley), so this leaf never imports the
 * choice machinery.
 */
export function wuxiaAfterAttack(
  state: GameState,
  stackItem: ResolutionStackItem | undefined,
  attacker: CombatUnitState,
  defender: CombatUnitState,
  isRetaliation: boolean,
  damage: number
): WuxiaDamagePick[] {
  const combat = state.combat;
  const picks: WuxiaDamagePick[] = [];
  if (!combat || combat.outcome) return picks;

  // Demon Ancestor commander "Ancestral Blood Furnace": the first time each
  // round an attack (own or Retaliation) damages it, the furnace gains 1.
  const ancestorRecord = demonRecord(state, defender.controllerId);
  if (
    ancestorRecord &&
    damage > 0 &&
    defender.commanderSlug === "demon_ancestor" &&
    !artUsedThisRound(combat, ancestorRecord, "ancestral-blood", defender.id)
  ) {
    markArtRound(combat, ancestorRecord, "ancestral-blood", defender.id);
    gainBloodEssence(state, defender.controllerId, 1, "demon-ancestor-ancestral-blood", "Ancestral Blood Furnace");
  }

  // Yulian's Jade Body Arts VI: the protected defender mends after the blow —
  // even when the attacker itself fell to a Fire Shield on the way in.
  const jadeRecover = stackItem?.modifiers.wuxiaJadeRecover ?? 0;
  if (!isRetaliation && jadeRecover > 0 && alive(defender) && defender.damage > 0) {
    const healed = Math.min(jadeRecover, defender.damage);
    defender.damage -= healed;
    appendEvent(state, {
      type: "DAMAGE_HEALED",
      source: { type: "unit", unitId: defender.id, controllerId: defender.controllerId },
      target: { type: "unit", unitId: defender.id },
      amount: healed
    });
  }

  if (!alive(attacker)) return picks;
  const enemyAdjacentTo = (anchor: CombatUnitState) =>
    Object.values(combat.units).some(
      (unit) =>
        alive(unit) &&
        unit.id !== defender.id &&
        unit.controllerId !== attacker.controllerId &&
        unitsAdjacent(combat, anchor, unit)
    );

  if (isRetaliation) {
    // Qi Well: the mountain answers a blow and draws Qi from it.
    const record = azureRecord(state, attacker.controllerId);
    if (record && unitHasWuxiaArt(attacker, "mountain-qi-well") && !artUsedThisRound(combat, record, "mountain-qi-well", attacker.id)) {
      if ((record.sectQi ?? 0) < sectQiCapacity(state, attacker.controllerId)) {
        markArtRound(combat, record, "mountain-qi-well", attacker.id);
        artEvent(state, attacker, "mountain-qi-well", `${attacker.cardName}'s Qi Well draws Qi from the exchange.`);
        gainSectQi(state, attacker.controllerId, 1, "azure-sect-qi", `${attacker.cardName}'s Qi Well`);
      }
    }
    return picks;
  }

  if (
    damage > 0 &&
    stackItem?.modifiers.wuxiaQiAttack &&
    unitHasWuxiaArt(attacker, "sword-wave") &&
    enemyAdjacentTo(attacker)
  ) {
    picks.push({
      kind: "damage",
      unitId: attacker.id,
      abilityId: abilityIdForArt(attacker, "sword-wave"),
      amount: 1,
      adjacent: true,
      excludeTargetId: defender.id,
      enemiesOnly: true
    });
  }

  const demon = demonRecord(state, attacker.controllerId);
  if (
    demon &&
    damage > 0 &&
    unitHasWuxiaArt(attacker, "soulfire-volley") &&
    (demon.bloodEssence ?? 0) >= 2 &&
    !artUsedThisRound(combat, demon, "soulfire-volley", attacker.id) &&
    enemyAdjacentTo(defender)
  ) {
    markArtRound(combat, demon, "soulfire-volley", attacker.id);
    artEvent(state, attacker, "soulfire-volley", `${attacker.cardName}'s Soulfire Volley gathers soulfire.`, defender.id);
    // The Essence is spent when the splash actually lands (the pick executor),
    // so a target that dies before the pick opens never wastes it.
    picks.push({
      kind: "damage",
      unitId: attacker.id,
      abilityId: abilityIdForArt(attacker, "soulfire-volley"),
      amount: 1,
      anchorId: defender.id,
      adjacent: true,
      excludeTargetId: defender.id,
      enemiesOnly: true,
      bloodEssenceCost: 1
    });
  }
  return picks;
}

/**
 * An attack (own or Retaliation) drove an ENEMY side or Stack layer to 0 HP.
 * Blood Harvest: +1 Essence once per combat round; Reaper's Toll: +1 more on the
 * unit's own attack, beyond the round limit.
 */
export function wuxiaDefeatedSideOrLayer(
  state: GameState,
  attacker: CombatUnitState,
  defender: CombatUnitState,
  isRetaliation: boolean
): void {
  const combat = state.combat;
  if (!combat || attacker.controllerId === defender.controllerId) return;
  const record = demonRecord(state, attacker.controllerId);
  if (!record) return;
  // Legacy records carry only bloodHarvestRound: that counts as one harvest taken.
  const taken = record.bloodHarvestRound === combat.round ? (record.bloodHarvestCount ?? 1) : 0;
  if (taken < (record.harvestsPerRound ?? 1)) {
    record.bloodHarvestRound = combat.round;
    record.bloodHarvestCount = taken + 1;
    gainBloodEssence(state, attacker.controllerId, 1, "heavenly-demon-blood-harvest", `${attacker.cardName} harvests ${defender.cardName}'s blood`);
    // Xuanming's Legion of Bones: the harvesting unit drinks from the fallen.
    const heal = record.harvestHeal ?? 0;
    if (heal > 0 && alive(attacker) && attacker.damage > 0) {
      const healed = Math.min(heal, attacker.damage);
      attacker.damage -= healed;
      appendEvent(state, {
        type: "DAMAGE_HEALED",
        source: { type: "unit", unitId: attacker.id, controllerId: attacker.controllerId },
        target: { type: "unit", unitId: attacker.id },
        amount: healed
      });
    }
  }
  if (!isRetaliation && unitHasWuxiaArt(attacker, "reaper-toll")) {
    artEvent(state, attacker, "reaper-toll", `${attacker.cardName}'s Reaper's Toll claims the fallen.`, defender.id);
    gainBloodEssence(state, attacker.controllerId, 1, "heavenly-demon-blood-harvest", `${attacker.cardName}'s Reaper's Toll`);
  }
}

/** Activation arts: Golden Core (Qi) and Corpse Stitching (Essence → heal). */
export function wuxiaActivation(state: GameState, unit: CombatUnitState): void {
  const combat = state.combat;
  if (!combat || combat.outcome || !alive(unit)) return;
  const azure = azureRecord(state, unit.controllerId);
  if (
    azure &&
    unitHasWuxiaArt(unit, "golden-core") &&
    !artUsedThisRound(combat, azure, "golden-core", unit.id) &&
    livingAdjacentAllies(combat, unit).length > 0 &&
    (azure.sectQi ?? 0) < sectQiCapacity(state, unit.controllerId)
  ) {
    markArtRound(combat, azure, "golden-core", unit.id);
    artEvent(state, unit, "golden-core", `${unit.cardName}'s Golden Core circulates Qi through the formation.`);
    gainSectQi(state, unit.controllerId, 1, "azure-sect-qi", `${unit.cardName}'s Golden Core`);
  }
  const demon = demonRecord(state, unit.controllerId);
  if (
    demon &&
    unitHasWuxiaArt(unit, "corpse-stitch") &&
    unit.damage > 0 &&
    (demon.bloodEssence ?? 0) > 0 &&
    !artUsedThisRound(combat, demon, "corpse-stitch", unit.id)
  ) {
    markArtRound(combat, demon, "corpse-stitch", unit.id);
    demon.bloodEssence = (demon.bloodEssence ?? 0) - 1;
    const healed = Math.min(2, unit.damage);
    unit.damage -= healed;
    artEvent(state, unit, "corpse-stitch", `${unit.cardName}'s Corpse Stitching spends 1 Essence and mends ${healed} damage.`);
    appendEvent(state, {
      type: "DAMAGE_HEALED",
      source: { type: "unit", unitId: unit.id, controllerId: unit.controllerId },
      target: { type: "unit", unitId: unit.id },
      amount: healed
    });
  }
}

/**
 * A real Heavenly Demon army card feeds Blood Essence (Blood Price): once per
 * combat round, and each unit once per combat — except a Blood Oath unit, whose
 * every flip or removal feeds the furnace.
 */
export function gainBloodEssenceFromCasualty(state: GameState, unit: CombatUnitState): void {
  const combat = state.combat;
  if (
    !combat ||
    factionOf(state, unit.controllerId) !== HEAVENLY_DEMON_FACTION_ID ||
    unit.summoned ||
    unit.temporary ||
    !unit.armyUnitId
  ) return;
  const record = combat.cultivationFactions?.[unit.controllerId];
  if (!record) return;
  const oath = unitHasWuxiaArtIgnoringSuppression(unit, "blood-oath");
  // Shiyan's Corpse-Furnace Sutra (innate): the once-per-round limit is lifted;
  // each real unit still feeds the furnace once per combat.
  const furnace = mainHeroDefId(state, unit.controllerId) === SHIYAN_HERO_ID;
  if (
    !oath &&
    (unit.heavenlyDemonEssenceGranted || (!furnace && record.bloodEssenceGainedRound === combat.round))
  ) return;
  if (!oath) {
    unit.heavenlyDemonEssenceGranted = true;
    record.bloodEssenceGainedRound = combat.round;
    if (furnace) {
      appendEvent(state, {
        type: "HERO_SKILL_USED",
        playerId: unit.controllerId,
        nodeId: "shiyan-corpse-furnace-sutra",
        message: `Shiyan's Corpse-Furnace Sutra refines ${unit.cardName}.`
      });
    }
  } else {
    artEvent(state, unit, "blood-oath", `${unit.cardName}'s Blood Oath pays the furnace.`);
  }
  const capacity = bloodEssenceCapacity(state, unit.controllerId);
  record.bloodEssence = Math.min(capacity, (record.bloodEssence ?? 0) + 1);
  appendEvent(state, {
    type: "HERO_SKILL_USED",
    playerId: unit.controllerId,
    nodeId: "heavenly-demon-blood-essence",
    message: `${unit.cardName} feeds the Blood Furnace (+1): Essence ${record.bloodEssence}/${capacity}.`
  });
}

/**
 * Blood Oath is read at the moment of death/flip. A flip re-derives the unit's
 * abilities from its NEW (Few) side before this hook runs, and both sides print
 * the Oath, so the ordinary read is correct; the helper exists so a future
 * suppression edge (Disrupting Ray on a dying unit) keeps the printed promise.
 */
function unitHasWuxiaArtIgnoringSuppression(unit: CombatUnitState, art: WuxiaArtId): boolean {
  if (!unit.abilitiesSuppressed) return unitHasWuxiaArt(unit, art);
  return unitHasWuxiaArt({ ...unit, abilitiesSuppressed: false }, art);
}

// ---------------------------------------------------------------------------
// Wuxia hero specialty cards (WUXIA_ART_CARD) and the option meter riders.
// ---------------------------------------------------------------------------

export type WuxiaArtCardEffect = Extract<EffectDefinition, { type: "WUXIA_ART_CARD" }>;
export type CultivationGainRider = { sectQi?: number; bloodEssence?: number; swordIntent?: number };

/** Whether this side owns the meter an option cost names and can pay it. */
export function canPayCultivationCost(
  state: GameState,
  playerId: PlayerId,
  cost: { sectQi?: number; bloodEssence?: number } | undefined
): boolean {
  if (!cost) return true;
  if ((cost.sectQi ?? 0) > 0 && (!state.combat || currentSectQi(state, playerId) < (cost.sectQi ?? 0))) return false;
  if ((cost.bloodEssence ?? 0) > 0 && (!state.combat || currentBloodEssence(state, playerId) < (cost.bloodEssence ?? 0))) return false;
  return true;
}

/** Spend an option's meter price (legality already proved it affordable). */
export function payCultivationCost(
  state: GameState,
  playerId: PlayerId,
  cost: { sectQi?: number; bloodEssence?: number } | undefined,
  cardName: string
): void {
  if (!cost) return;
  if ((cost.sectQi ?? 0) > 0 && !spendCultivationMeter(state, playerId, "sectQi", cost.sectQi ?? 0)) {
    throw new Error(`${cardName} needs ${cost.sectQi} Sect Qi.`);
  }
  if ((cost.bloodEssence ?? 0) > 0 && !spendCultivationMeter(state, playerId, "bloodEssence", cost.bloodEssence ?? 0)) {
    throw new Error(`${cardName} needs ${cost.bloodEssence} Blood Essence.`);
  }
  if ((cost.sectQi ?? 0) > 0 || (cost.bloodEssence ?? 0) > 0) {
    appendEvent(state, {
      type: "HERO_SKILL_USED",
      playerId,
      nodeId: (cost.sectQi ?? 0) > 0 ? "azure-sect-qi" : "heavenly-demon-blood-essence",
      message: `${cardName} spends ${(cost.sectQi ?? 0) > 0 ? `${cost.sectQi} Sect Qi` : `${cost.bloodEssence} Blood Essence`}.`
    });
  }
}

/** Apply an option's meter gains (no-op outside combat or without the meter). */
export function applyCultivationGainRider(
  state: GameState,
  playerId: PlayerId,
  gain: CultivationGainRider | undefined,
  cardName: string
): void {
  if (!gain || !state.combat) return;
  if ((gain.sectQi ?? 0) > 0) gainSectQi(state, playerId, gain.sectQi ?? 0, "azure-sect-qi", cardName);
  if ((gain.bloodEssence ?? 0) > 0) gainBloodEssence(state, playerId, gain.bloodEssence ?? 0, "heavenly-demon-blood-essence", cardName);
  if ((gain.swordIntent ?? 0) > 0) gainSwordIntent(state, playerId, gain.swordIntent ?? 0);
}

function linkedFriendlyUnits(combat: CombatState, playerId: PlayerId): CombatUnitState[] {
  return Object.values(combat.units).filter(
    (unit) => unit.controllerId === playerId && alive(unit) && livingAdjacentAllies(combat, unit).length > 0
  );
}

/**
 * Empty cells of this combat's board (4×5 grid or hex): no living unit (any
 * cell of a two-hex body), obstacle, battlefield token (a wall token's every
 * hex), wall or gate.
 */
function emptyCells(combat: CombatState): number[] {
  const obstacles = new Set(combat.obstacles ?? []);
  const living = Object.values(combat.units).filter(alive);
  return getBattlefieldPositions(combatGeometry(combat)).filter(
    (cell) =>
      !obstacles.has(cell) &&
      !(combat.battlefieldTokens ?? []).some((token) => battlefieldTokenCovers(token, cell)) &&
      !isFortificationPosition(combat.siege, cell) &&
      !living.some((unit) => unitOccupiesCell(combat, unit, cell))
  );
}

/**
 * Legality of a NON-reaction wuxia art card option. Reaction arts
 * (array-strike / jade-guard) are validated by wuxiaArtCardReactionLegal.
 */
export function wuxiaArtCardPlayable(
  state: GameState,
  playerId: PlayerId,
  effect: WuxiaArtCardEffect
): boolean {
  const combat = state.combat;
  if (!combat || combat.outcome) return false;
  switch (effect.art) {
    case "channel": {
      const qiRoom = (effect.gain?.sectQi ?? 0) > 0 && Boolean(azureRecord(state, playerId)) &&
        currentSectQi(state, playerId) < sectQiCapacity(state, playerId);
      const essenceRoom = (effect.gain?.bloodEssence ?? 0) > 0 && Boolean(demonRecord(state, playerId)) &&
        currentBloodEssence(state, playerId) < bloodEssenceCapacity(state, playerId);
      return qiRoom || essenceRoom || (effect.drawCards ?? 0) > 0;
    }
    case "formation-mending":
      return Boolean(azureRecord(state, playerId));
    case "legion-harvest": {
      const record = demonRecord(state, playerId);
      if (!record) return false;
      // Never offered once an equal-or-better Legion is already live this combat.
      return (record.harvestsPerRound ?? 1) < (effect.harvestsPerRound ?? 1) ||
        (record.harvestHeal ?? 0) < (effect.harvestHeal ?? 0);
    }
    case "bound-soul":
      return emptyCells(combat).length > 0;
    default:
      return false;
  }
}

/** Legality of the two attack-window reaction arts for the triggering attack. */
export function wuxiaArtCardReactionLegal(
  state: GameState,
  playerId: PlayerId,
  effect: WuxiaArtCardEffect,
  attackerId: UnitId,
  defenderId: UnitId,
  isRetaliation: boolean
): boolean {
  const combat = state.combat;
  if (!combat || isRetaliation) return false;
  const attacker = combat.units[attackerId];
  const defender = combat.units[defenderId];
  if (!attacker || !defender || !alive(attacker) || !alive(defender)) return false;
  if (effect.art === "array-strike") {
    return attacker.controllerId === playerId && livingAdjacentAllies(combat, attacker).length > 0;
  }
  if (effect.art === "jade-guard") {
    return defender.controllerId === playerId && attacker.controllerId !== playerId;
  }
  return false;
}

/** Bound Soul stats: base 2/0/2; Bai Luohun's Soul Shepherd +1 Defense +1 Health; empowered +1 Attack +1 Health. */
function mintBoundSoul(
  state: GameState,
  playerId: PlayerId,
  position: number,
  options: { armyUnitId: string; expiresAfterRound: number; empowered?: boolean }
): CombatUnitState {
  const combat = state.combat!;
  const soulShepherd = mainHeroDefId(state, playerId) === LUOHUN_HERO_ID;
  const shade: CombatUnitState = {
    id: `unit_${playerId}_soul_banner_${nextEventNumber(state)}`,
    controllerId: playerId,
    name: "Bound Soul",
    cardName: "Bound Soul",
    variant: "neutral",
    grade: "bronze",
    type: "flying",
    attack: 2 + (options.empowered ? 1 : 0),
    defense: soulShepherd ? 1 : 0,
    maxHealth: 2 + (soulShepherd ? 1 : 0) + (options.empowered ? 1 : 0),
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
    armyUnitId: options.armyUnitId,
    heroGradeExpiresAfterRound: options.expiresAfterRound,
    assets: { cardImage: SOUL_BANNER_SHADE_CARD_IMAGE, imageAlt: "Bound Soul unit card" }
  };
  combat.units[shade.id] = shade;
  return shade;
}

/**
 * Resolve a wuxia art card option. `stackItem` is the paused attack for the two
 * reaction arts; `targetUnitId` the chosen friendly unit for Bound Soul. Returns
 * how many cards the caller must draw (the caller owns the draw machinery).
 */
export function resolveWuxiaArtCard(
  state: GameState,
  playerId: PlayerId,
  effect: WuxiaArtCardEffect,
  cardName: string,
  context: { stackItem?: ResolutionStackItem; targetUnitId?: UnitId }
): { drawCards: number } {
  const combat = state.combat;
  if (!combat) throw new Error(`${cardName} can only be played during combat.`);
  switch (effect.art) {
    case "channel": {
      if ((effect.gain?.sectQi ?? 0) > 0) gainSectQi(state, playerId, effect.gain?.sectQi ?? 0, "azure-sect-qi", cardName);
      if ((effect.gain?.bloodEssence ?? 0) > 0) {
        gainBloodEssence(state, playerId, effect.gain?.bloodEssence ?? 0, "heavenly-demon-blood-essence", cardName);
      }
      return { drawCards: effect.drawCards ?? 0 };
    }
    case "formation-mending": {
      for (const unit of linkedFriendlyUnits(combat, playerId)) {
        const healed = Math.min(effect.amount ?? 1, unit.damage);
        if (healed <= 0) continue;
        unit.damage -= healed;
        appendEvent(state, {
          type: "DAMAGE_HEALED",
          source: { type: "system" },
          target: { type: "unit", unitId: unit.id },
          amount: healed
        });
      }
      appendEvent(state, {
        type: "HERO_SKILL_USED",
        playerId,
        nodeId: "lingxi-formation-mending",
        message: `${cardName} mends every unit standing in formation.`
      });
      return { drawCards: 0 };
    }
    case "legion-harvest": {
      const record = demonRecord(state, playerId);
      if (!record) throw new Error(`${cardName} needs the Blood Essence furnace.`);
      record.harvestsPerRound = Math.max(record.harvestsPerRound ?? 1, effect.harvestsPerRound ?? 1);
      record.harvestHeal = Math.max(record.harvestHeal ?? 0, effect.harvestHeal ?? 0);
      appendEvent(state, {
        type: "HERO_SKILL_USED",
        playerId,
        nodeId: "xuanming-legion-of-bones",
        message: `${cardName}: Blood Harvest may fire ${record.harvestsPerRound >= 99 ? "on every defeated side or layer" : `${record.harvestsPerRound} times each round`}${record.harvestHeal ? `, healing the harvester ${record.harvestHeal}` : ""} this combat.`
      });
      return { drawCards: 0 };
    }
    case "bound-soul": {
      const anchor = context.targetUnitId ? combat.units[context.targetUnitId] : undefined;
      if (!anchor || anchor.controllerId !== playerId || !alive(anchor)) {
        throw new Error(`${cardName} needs one of your living units to rally the souls beside.`);
      }
      const count = Math.max(1, effect.count ?? 1);
      let summoned = 0;
      for (let index = 0; index < count; index += 1) {
        const cells = emptyCells(combat).sort(
          (left, right) =>
            unitCellDistance(combat, anchor, left) - unitCellDistance(combat, anchor, right) || left - right
        );
        const position = cells[0];
        if (position === undefined) break;
        mintBoundSoul(state, playerId, position, {
          armyUnitId: `${SOUL_BANNER_SHADE_ARMY_PREFIX}${playerId}_card_${nextEventNumber(state)}`,
          expiresAfterRound: combat.round + 1,
          empowered: effect.empowered
        });
        summoned += 1;
      }
      if (summoned === 0) throw new Error(`${cardName} has no empty space for a Bound Soul.`);
      appendEvent(state, {
        type: "HERO_SKILL_USED",
        playerId,
        nodeId: "luohun-soul-shepherd",
        message: `${cardName} binds ${summoned} ${effect.empowered ? "empowered " : ""}Bound Soul${summoned === 1 ? "" : "s"} beside ${anchor.cardName} through combat round ${combat.round + 1}.`
      });
      return { drawCards: 0 };
    }
    case "array-strike": {
      const stackItem = context.stackItem;
      const action = stackItem?.action;
      const attacker = action && "attackerId" in action ? combat.units[action.attackerId] : undefined;
      if (!stackItem || !attacker) throw new Error(`${cardName} must be played on your own declared attack.`);
      const bonus = Math.min(effect.max ?? 2, livingAdjacentAllies(combat, attacker).length);
      stackItem.modifiers.cultivationAttackBonus = (stackItem.modifiers.cultivationAttackBonus ?? 0) + bonus;
      if (effect.ignoresRetaliation) stackItem.modifiers.ignoresRetaliationThisAttack = true;
      appendEvent(state, {
        type: "HERO_SKILL_USED",
        playerId,
        nodeId: "jianxu-seven-star-array",
        message: `${cardName}: ${attacker.cardName} strikes with the array (+${bonus} Attack${effect.ignoresRetaliation ? ", no Retaliation" : ""}).`
      });
      return { drawCards: 0 };
    }
    case "jade-guard": {
      const stackItem = context.stackItem;
      const action = stackItem?.action;
      const defender = action && "defenderId" in action ? combat.units[action.defenderId] : undefined;
      if (!stackItem || !defender) throw new Error(`${cardName} must be played on an attack against your unit.`);
      const amount = effect.max ?? 1;
      stackItem.modifiers.cultivationDefenseBonus = (stackItem.modifiers.cultivationDefenseBonus ?? 0) + amount;
      if ((effect.recover ?? 0) > 0) {
        stackItem.modifiers.wuxiaJadeRecover = (stackItem.modifiers.wuxiaJadeRecover ?? 0) + (effect.recover ?? 0);
      }
      appendEvent(state, {
        type: "HERO_SKILL_USED",
        playerId,
        nodeId: "yulian-jade-body",
        message: `${cardName}: ${defender.cardName} gains +${amount} Defense${effect.recover ? ` and will recover ${effect.recover} damage if it survives` : ""}.`
      });
      return { drawCards: 0 };
    }
    default:
      throw new Error(`${cardName} has no engine resolution.`);
  }
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
    Object.values(combat.units).filter((unit) => unit.damage < unit.maxHealth).flatMap((unit) => unitCells(combat, unit))
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

// ---------------------------------------------------------------------------
// Read-only meter view for the combat UI (src/components/table/wuxia-meter-panel.tsx).
// Every number comes from the same helpers the rules use, so the panel can
// never promise a gain or bonus the engine would not give.
// ---------------------------------------------------------------------------

export type CultivationMeterRealmStep = {
  realm: 1 | 2 | 3;
  /** The faction's own realm name (Foundation / Demon Core / ...). */
  name: string;
  effect: string;
  reached: boolean;
};

export type CultivationMeterView = {
  kind: "sect-qi" | "blood-essence";
  playerId: PlayerId;
  value: number;
  capacity: number;
  /** Where the capacity comes from (base, realm, Sword Saint). */
  capacitySources: { label: string; amount: number }[];
  /** Empty when the Cultivation module is off (the realm upgrades never arm). */
  realmSteps: CultivationMeterRealmStep[];
  /** Azure: formation-link Qi gains taken this combat round / allowed per round. */
  formationLinks?: { used: number; limit: number };
  /** Qingyun (Azure) / Xuedao (Heavenly Demon) only: Sword Intent tempering toward release. */
  swordIntent?: { value: number; threshold: number };
  /** Demon: Blood Price (own army casualty) still available this round; Shiyan lifts the round limit. */
  bloodPrice?: { ready: boolean; unlimited: boolean };
  /** Demon: Blood Harvest gains taken this round / allowed per round. */
  bloodHarvest?: { used: number; limit: number };
  /** Demon: Blood Frenzy not yet spent this round, and its Attack bonus. */
  bloodFrenzy?: { ready: boolean; bonus: number };
};

export function isCultivationMeterFaction(state: Pick<GameState, "players">, playerId: PlayerId): boolean {
  const factionId = factionOf(state, playerId);
  return factionId === AZURE_BREEZE_FACTION_ID || factionId === HEAVENLY_DEMON_FACTION_ID;
}

/** The wuxia meter of one seat in the current combat, or null (no combat / not a wuxia seat). */
export function getCultivationMeter(state: GameState, playerId: PlayerId): CultivationMeterView | null {
  const combat = state.combat;
  if (!combat) return null;
  const factionId = factionOf(state, playerId);
  // Before the combat record is stamped (deployment) the meter reads as empty.
  const record = combat.cultivationFactions?.[playerId];
  const round = combat.round;
  // Sword Intent is hero-specific, not faction-specific: Qingyun (Azure) and
  // Xuedao (Heavenly Demon) both temper it, and both release at 2 at realm 3.
  const swordIntent = SWORD_INTENT_HERO_IDS.has(mainHeroDefId(state, playerId) ?? "")
    ? { value: record?.swordIntent ?? 0, threshold: swordIntentThreshold(state, playerId) }
    : undefined;
  const realmOn = cultivationEnabled(state);
  const step = (realm: 1 | 2 | 3, effect: string): CultivationMeterRealmStep => ({
    realm,
    name: cultivationRealmLabel(state, playerId, realm).en,
    effect,
    reached: cultivationRealmOf(state, playerId) >= realm
  });

  if (factionId === AZURE_BREEZE_FACTION_ID) {
    const realmBonus = heroHasWuxiaUpgrade(state, playerId, "xianxia-body-refinement") ? 1 : 0;
    const saint = commanderStands(state, playerId, "sword_saint") ? 1 : 0;
    const capacitySources = [{ label: "Sect Qi", amount: SECT_QI_MAX }];
    if (realmBonus) capacitySources.push({ label: cultivationRealmLabel(state, playerId, 2).en, amount: realmBonus });
    if (saint) capacitySources.push({ label: "Sword Saint", amount: saint });
    const linkLimit = formationLinkGainsPerRound(state, playerId);
    const linksUsed = record?.sectQiGainedRound === round ? (record.sectQiLinkGains ?? 1) : 0;
    return {
      kind: "sect-qi",
      playerId,
      value: record?.sectQi ?? 0,
      capacity: sectQiCapacity(state, playerId),
      capacitySources,
      realmSteps: realmOn
        ? [
            step(1, "Begin each combat with 1 Qi"),
            step(2, "+1 Qi capacity"),
            step(3, "Formation links gain Qi twice a round; Sword Intent releases after 2")
          ]
        : [],
      formationLinks: { used: Math.min(linksUsed, linkLimit), limit: linkLimit },
      swordIntent
    };
  }

  if (factionId === HEAVENLY_DEMON_FACTION_ID) {
    const realmBonus = heroHasWuxiaUpgrade(state, playerId, "modao-corpse-furnace") ? 1 : 0;
    const capacitySources = [{ label: "Blood Essence", amount: BLOOD_ESSENCE_MAX }];
    if (realmBonus) capacitySources.push({ label: cultivationRealmLabel(state, playerId, 2).en, amount: realmBonus });
    const furnace = mainHeroDefId(state, playerId) === SHIYAN_HERO_ID;
    const harvestLimit = record?.harvestsPerRound ?? 1;
    const harvested = record?.bloodHarvestRound === round ? (record.bloodHarvestCount ?? 1) : 0;
    return {
      kind: "blood-essence",
      playerId,
      value: record?.bloodEssence ?? 0,
      capacity: bloodEssenceCapacity(state, playerId),
      capacitySources,
      realmSteps: realmOn
        ? [
            step(1, "Begin each combat with 1 Essence"),
            step(2, "+1 Essence capacity"),
            step(3, swordIntent ? "Blood Frenzy grants +2 Attack; Sword Intent releases after 2" : "Blood Frenzy grants +2 Attack")
          ]
        : [],
      bloodPrice: { ready: furnace || record?.bloodEssenceGainedRound !== round, unlimited: furnace },
      bloodHarvest: { used: Math.min(harvested, harvestLimit), limit: harvestLimit },
      bloodFrenzy: {
        ready: record?.bloodFrenzySpentRound !== round,
        bonus: heroHasWuxiaUpgrade(state, playerId, "modao-forbidden-overreach") ? 2 : 1
      },
      swordIntent
    };
  }

  return null;
}
