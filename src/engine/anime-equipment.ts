/**
 * Anime Equipment (`anime.equipment`, plan §3.13).
 *
 * Always-on hero ITEMS, distinct from Artifact cards: an item sits in one of a
 * MAIN hero's three slots (weapon/armor/accessory) and its effect runs while
 * equipped — never in hand, never cast. Bought at two outfitter Field Overrides;
 * buying into an occupied slot REPLACES the previous item (no refund). SHARED by
 * both packages and every hero; independent of Hero Grades (§3.11) and
 * Cultivation (§5.6) — all three tracks coexist.
 *
 * This is a LEAF read-layer (mirroring anime-hero-grades.ts): it imports only
 * `./state` (types), `./anime` (the module gate), `./events` (feed events) and
 * the catalog data, so the heavy modules that consume its grants (reducer,
 * legal-actions, adventure) can import it with no cycle. The main-hero lookup
 * and the combat-scope predicate are inlined here for the same reason.
 *
 * Default OFF ⇒ every helper returns 0/false/{} and `equipEquipment` is never
 * reached (no shop in the pool), so a module-off table and every legacy snapshot
 * are byte-identical.
 */

import { appendEvent } from "./events";
import { animeModuleEnabled } from "./anime";
import {
  EQUIPMENT_IDS,
  getEquipmentDefinition
} from "@/data/anime/equipment";
import type { AnimeEquipmentSlot, CombatUnitState, GameState, HeroState, PlayerId } from "./state";

/** Whether the Equipment module is on (implies anime master enabled). */
export function equipmentEnabled(state: Pick<GameState, "anime">): boolean {
  return animeModuleEnabled(state, "equipment");
}

/** The player's MAIN hero (inlined to keep this a leaf — see the file header). */
function mainHeroOf(state: GameState, playerId: PlayerId): HeroState | null {
  for (const hero of Object.values(state.heroes)) {
    if (hero.controllerId === playerId && hero.kind === "main") {
      return hero;
    }
  }
  return null;
}

// ===========================================================================
// Per-player reads (all gated by the module being on)
// ===========================================================================

/** The player's equipped items ({} when off / unstamped). */
export function heroEquipmentOf(state: GameState, playerId: PlayerId): Partial<Record<AnimeEquipmentSlot, string>> {
  if (!equipmentEnabled(state)) {
    return {};
  }
  return mainHeroOf(state, playerId)?.equipment ?? {};
}

/** The item id in a given slot ({undefined} when empty / off). */
export function heroEquipmentSlot(state: GameState, playerId: PlayerId, slot: AnimeEquipmentSlot): string | undefined {
  return heroEquipmentOf(state, playerId)[slot];
}

/** Whether the player's main hero currently has the given item equipped. */
export function playerHasEquipment(state: GameState, playerId: PlayerId, equipmentId: string): boolean {
  const equipment = heroEquipmentOf(state, playerId);
  return Object.values(equipment).includes(equipmentId);
}

// --- Always-on economy / caster grants (each gated by the item equipped) ----

/** Cosmos Pendant (accessory): +1 spell Power. Folded at the standing chokepoint. */
export function equipmentSpellPowerBonus(state: GameState, playerId: PlayerId): number {
  return playerHasEquipment(state, playerId, EQUIPMENT_IDS.cosmosPendant) ? 1 : 0;
}

/** Guild-Issue Mail (armor): +1 hand limit. Folded at effectiveHandLimit. */
export function equipmentHandLimitBonus(state: GameState, playerId: PlayerId): number {
  return playerHasEquipment(state, playerId, EQUIPMENT_IDS.guildIssueMail) ? 1 : 0;
}

/** Adventurer's Blade (weapon): +1 gold after each won combat. */
export function equipmentWinGold(state: GameState, playerId: PlayerId): number {
  return playerHasEquipment(state, playerId, EQUIPMENT_IDS.adventurersBlade) ? 1 : 0;
}

/** Supply Satchel (accessory): +1 building materials each Resources round. */
export function equipmentResourceRoundMaterials(state: GameState, playerId: PlayerId): number {
  return playerHasEquipment(state, playerId, EQUIPMENT_IDS.supplySatchel) ? 1 : 0;
}

// ===========================================================================
// Combat scope + the two per-combat combat items
// ===========================================================================

/**
 * Whether the player's MAIN hero is a fighter in the current combat — the
 * commander-scope convention (mirroring anime-hero-grades.playerMainHeroInCombat):
 * a neutral fight by their main hero, or a PvP/sandbox side their main hero
 * leads. Garrison defenses (no main hero) and secondary-hero fights return
 * false, so the combat items never apply there.
 */
function playerMainHeroInCombat(state: GameState, playerId: PlayerId): boolean {
  const combat = state.combat;
  if (!combat) {
    return false;
  }
  const brings = (heroId: string | null | undefined): boolean => {
    const hero = heroId ? state.heroes[heroId] : null;
    return Boolean(hero && hero.kind === "main" && hero.controllerId === playerId);
  };
  const context = combat.context;
  if (context.kind === "neutral") {
    return brings(context.heroId);
  }
  if (context.kind === "player") {
    return brings(context.attackerHeroId) || brings(context.defenderHeroId);
  }
  if (context.kind === "sandbox") {
    return combat.attackerPlayerId === playerId || combat.defenderPlayerId === playerId;
  }
  return false;
}

/** Whether `playerId`'s Iron-Blood Sword first-attack charge is still available. */
function swordAvailable(state: GameState, playerId: PlayerId): boolean {
  return (
    equipmentEnabled(state) &&
    playerHasEquipment(state, playerId, EQUIPMENT_IDS.ironBloodSword) &&
    playerMainHeroInCombat(state, playerId) &&
    !state.players[playerId]?.combatStats.equipmentFirstAttackUsed
  );
}

/** Whether `playerId`'s Black Tortoise Mail first-incoming charge is still available. */
function mailAvailable(state: GameState, playerId: PlayerId): boolean {
  return (
    equipmentEnabled(state) &&
    playerHasEquipment(state, playerId, EQUIPMENT_IDS.blackTortoiseMail) &&
    playerMainHeroInCombat(state, playerId) &&
    !state.players[playerId]?.combatStats.equipmentIncomingAttackUsed
  );
}

/**
 * Iron-Blood Sword (weapon): +1 Attack on the sword owner's FIRST declared
 * attack each combat. Read live in getAttackStackDetails (unclamped, beside the
 * combat-script delta) — a non-retaliation attack by a unit whose controller
 * owns the sword and whose charge is unspent. Retaliations neither benefit nor
 * consume. Returns 0 when the module is off / no sword / already spent.
 */
export function equipmentFirstAttackBonus(state: GameState, attacker: CombatUnitState, isRetaliation: boolean): number {
  if (isRetaliation) {
    return 0;
  }
  return swordAvailable(state, attacker.controllerId) ? 1 : 0;
}

/**
 * Black Tortoise Mail (armor): the FIRST incoming declared attack against the
 * mail owner's units resolves at −1 Attack. Returns the PENALTY (0 or 1) to
 * subtract from the ATTACKER's attack value — read in getAttackStackDetails off
 * the DEFENDER's controller. Only a non-retaliation attack whose defender's
 * controller owns the mail (unspent charge) is reduced; damage floors at 0
 * naturally. Retaliations neither reduce nor consume.
 */
export function equipmentIncomingAttackPenalty(state: GameState, defender: CombatUnitState, isRetaliation: boolean): number {
  if (isRetaliation) {
    return 0;
  }
  return mailAvailable(state, defender.controllerId) ? 1 : 0;
}

/**
 * Mark the two per-combat combat items spent, called once a NON-retaliation
 * attack has definitively LANDED (finishResolvedAttack, past the lethal-save
 * gate). The sword's charge belongs to the ATTACKER's owner; the mail's to the
 * DEFENDER's owner. Each is marked only when it was actually available on this
 * attack (same gating as the read), so a fight where the item didn't apply
 * leaves the charge for its real first qualifying attack.
 */
export function markEquipmentAttackResolved(
  state: GameState,
  attacker: CombatUnitState,
  defender: CombatUnitState,
  isRetaliation: boolean
): void {
  if (isRetaliation || !equipmentEnabled(state)) {
    return;
  }
  if (swordAvailable(state, attacker.controllerId)) {
    const stats = state.players[attacker.controllerId]?.combatStats;
    if (stats) {
      stats.equipmentFirstAttackUsed = true;
    }
  }
  if (mailAvailable(state, defender.controllerId)) {
    const stats = state.players[defender.controllerId]?.combatStats;
    if (stats) {
      stats.equipmentIncomingAttackUsed = true;
    }
  }
}

// ===========================================================================
// Buying / equipping
// ===========================================================================

/**
 * Equip `equipmentId` onto the player's MAIN hero, REPLACING whatever sat in its
 * slot (no refund). Stamps `hero.equipment` lazily. Returns the replaced item id
 * (or null). Gold is charged and the feed line emitted by the BUY_EQUIPMENT
 * visit-step handler; this is the pure slot mutation.
 */
export function equipEquipment(state: GameState, playerId: PlayerId, equipmentId: string): string | null {
  const def = getEquipmentDefinition(equipmentId);
  const hero = mainHeroOf(state, playerId);
  if (!def || !hero) {
    return null;
  }
  const current = hero.equipment ?? {};
  const replaced = current[def.slot] ?? null;
  hero.equipment = { ...current, [def.slot]: equipmentId };
  appendEvent(state, {
    type: "EQUIPMENT_EQUIPPED",
    playerId,
    heroId: hero.id,
    equipmentId,
    slot: def.slot,
    replacedId: replaced
  });
  return replaced;
}
