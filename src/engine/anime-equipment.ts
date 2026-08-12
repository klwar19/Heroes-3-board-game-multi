/**
 * Anime Equipment (`anime.equipment`, plan §3.13).
 *
 * Always-on hero ITEMS, distinct from Artifact cards: an item sits in one of a
 * MAIN hero's four slots (weapon/armor/accessory/mount) and its effect runs while
 * equipped — never in hand, never cast. Bought at two outfitter Field Overrides;
 * buying into an occupied slot moves the previous item into the hero's equipment
 * bag. SHARED by
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
  getEquipmentDefinition,
  type EquipmentContextRequirement
} from "@/data/anime/equipment";
import type { AnimeEquipmentSlot, CombatUnitState, GameState, HeroState, PlayerId } from "./state";

/** Whether the Equipment module is on (implies anime master enabled). */
export function equipmentEnabled(state: Pick<GameState, "anime">): boolean {
  return animeModuleEnabled(state, "equipment");
}

/**
 * Whether a context-gated item is worth offering — the shop HIDE rule. Inlined
 * here (reading `state.wog` / the anime flag directly) so this stays a LEAF
 * module: importing commanders.ts or unit-experience.ts would form a cycle
 * (both of THOSE consume this file's grants). Mirrors `commandersModuleEnabled`
 * / `unitExperienceActive` byte-for-byte.
 */
export function equipmentContextAvailable(
  state: Pick<GameState, "anime" | "wog" | "adventure">,
  requirement: EquipmentContextRequirement
): boolean {
  switch (requirement) {
    case "wog.commanders":
      return Boolean(state.wog?.enabled && state.wog.commanders);
    case "anime.unitExperience":
      // Unit Experience has TWO enable roads into one machinery (mirroring
      // `unitExperienceActive`, inlined to keep this a leaf module): the frozen
      // adventure flag (lobby row / WOG module) OR the anime module. Either
      // makes the Veteran's Standard grant live, so either un-hides it.
      return Boolean(state.adventure?.unitExperience) || animeModuleEnabled(state, "unitExperience");
    default:
      return true;
  }
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

/** Equipment currently owned in the hero's bag, ready for an actual slot action. */
export function heroEquipmentInventoryOf(state: GameState, playerId: PlayerId): readonly string[] {
  if (!equipmentEnabled(state)) {
    return [];
  }
  return mainHeroOf(state, playerId)?.equipmentInventory ?? [];
}

/** Whether an item is owned either in a body slot or in the equipment bag. */
export function playerOwnsEquipment(state: GameState, playerId: PlayerId, equipmentId: string): boolean {
  return (
    playerHasEquipment(state, playerId, equipmentId) ||
    heroEquipmentInventoryOf(state, playerId).includes(equipmentId)
  );
}

// ---------------------------------------------------------------------------
// Per-seam item inventories. Each existing fold reads its own list, so a NEW
// item that reuses a seam only appends its id here — the fold site is
// untouched (CLAUDE.md extensibility). Same-slot items can never both be worn,
// so a summed fold (win-gold) still caps at the number of DISTINCT slots that
// carry the seam, and a boolean fold stays a single grant.
//   - `crusadersPoleaxe` twins Iron-Blood Sword (weapon, first-attack)
//   - `coinwardTalisman` / `hornOfPlenty` add accessory win-gold sources
//   - `hornOfPlenty` also adds an accessory materials source
//   - `ironbarkCuirass` twins Stage Costume (armor, defense token)
//   - `coursersBarding` twins Windrider Saddle (mount, +1 MP refresh)
//   - `wardensAegis` (armor relic) combines incoming −1 AND a defense token
//   Hidden Leaf "shinobi" line (§3.13), each a pure seam reuse:
//   - `shinobiKunaiPouch` twins Iron-Blood Sword (weapon, first-attack)
//   - `bodyFlickerTabi` twins Windrider Saddle (mount, +1 MP refresh)
//   - `sageChakraCharm` (accessory relic) combines +1 spell Power AND +1 hand
//     limit — both accessory-slot seams, so it can never lift either cap (all
//     spell-power items are accessories ⇒ +1; hand limit stays +2 = armor + one
//     accessory).
//   Azur Lane "kansen" line (§3.13), 6 items (2 per grade, all four slots),
//   each a pure seam reuse:
//   - `oxygenTorpedo` twins Iron-Blood Sword (weapon, first-attack)
//   - `repairToolkit` twins Stage Costume (armor, first-incoming defense token)
//   - `sgRadar` (accessory relic) combines +1 spell Power AND +1 hand limit —
//     same accessory-slot pair as Sage Chakra Charm, so it can never lift either
//     cap (spell-power items are all accessories ⇒ +1; hand limit stays +2 =
//     armor + one accessory).
//   - `manjuuPiggyBank` twins Lucky Coin (accessory, win-gold — the win-gold cap
//     stays +3 = weapon + armor + one accessory)
//   - `beaverSquadTag` twins Windrider Saddle (mount, +1 MP refresh)
//   - `retrofitBlueprint` (weapon relic) combines first-attack AND round-1 attack
//     — both weapon-slot folds, so a same-slot weapon never doubles either half;
//     the FIRST attack in round 1 stacks BOTH → +2.
//   Heavenly Demon Palace "modao" line (§3.13), 3 items (one per grade, distinct
//   slots weapon/armor/accessory), each a pure seam reuse:
//   - `demonBloodSaber` twins Iron-Blood Sword (weapon, first-attack)
//   - `bonefiendPlate` twins Stage Costume (armor, first-incoming defense token)
//   - `demonHeartRelic` (accessory relic) combines +1 spell Power AND +1 hand
//     limit — same accessory-slot pair as Sage Chakra Charm / SG Radar, so it can
//     never lift either cap (spell-power items are all accessories ⇒ +1; hand
//     limit stays +2 = armor + one accessory).
// ---------------------------------------------------------------------------
// MGQ seam reuses: Angel Halo = first declared attack; Heavenly Knight's
// Aegis = first-incoming Defense token (never incoming -1 Attack); Monster
// Lord's Ring = spell Power plus hand limit.
const FIRST_ATTACK_ITEMS = [
  EQUIPMENT_IDS.ironBloodSword,
  EQUIPMENT_IDS.crusadersPoleaxe,
  EQUIPMENT_IDS.shinobiKunaiPouch,
  EQUIPMENT_IDS.oxygenTorpedo,
  EQUIPMENT_IDS.retrofitBlueprint,
  EQUIPMENT_IDS.demonBloodSaber,
  EQUIPMENT_IDS.littleBustersPracticeBat,
  EQUIPMENT_IDS.mgqAngelHalo
] as const;
const INCOMING_PENALTY_ITEMS = [EQUIPMENT_IDS.blackTortoiseMail, EQUIPMENT_IDS.wardensAegis] as const;
const DEFENSE_TOKEN_ITEMS = [
  EQUIPMENT_IDS.stageCostume,
  EQUIPMENT_IDS.ironbarkCuirass,
  EQUIPMENT_IDS.wardensAegis,
  EQUIPMENT_IDS.repairToolkit,
  EQUIPMENT_IDS.bonefiendPlate,
  EQUIPMENT_IDS.littleBustersMiosParasol,
  EQUIPMENT_IDS.mgqHeavenlyKnightsAegis
] as const;
const ROUND1_ATTACK_ITEMS = [EQUIPMENT_IDS.bladeOfTheTrial, EQUIPMENT_IDS.retrofitBlueprint, EQUIPMENT_IDS.littleBustersPracticeBat] as const;
const FIRST_SPELL_POWER_ITEMS = [EQUIPMENT_IDS.neonMicrophone] as const;
const SPELL_POWER_ITEMS = [
  EQUIPMENT_IDS.cosmosPendant,
  EQUIPMENT_IDS.spiritFocus,
  EQUIPMENT_IDS.sageChakraCharm,
  EQUIPMENT_IDS.sgRadar,
  EQUIPMENT_IDS.demonHeartRelic,
  EQUIPMENT_IDS.littleBustersFlightGoggles,
  EQUIPMENT_IDS.littleBustersRevolutionWatch,
  EQUIPMENT_IDS.mgqMonsterLordsRing
] as const;
const HAND_LIMIT_ITEMS = [
  EQUIPMENT_IDS.guildIssueMail,
  EQUIPMENT_IDS.twinTailRibbon,
  EQUIPMENT_IDS.eternalSash,
  EQUIPMENT_IDS.sageChakraCharm,
  EQUIPMENT_IDS.sgRadar,
  EQUIPMENT_IDS.demonHeartRelic,
  EQUIPMENT_IDS.littleBustersMissionLetter,
  EQUIPMENT_IDS.littleBustersRevolutionWatch,
  EQUIPMENT_IDS.mgqMonsterLordsRing
] as const;
const WIN_GOLD_ITEMS = [
  EQUIPMENT_IDS.adventurersBlade,
  EQUIPMENT_IDS.luckyCoin,
  EQUIPMENT_IDS.alchemistsSatchel,
  EQUIPMENT_IDS.coinwardTalisman,
  EQUIPMENT_IDS.hornOfPlenty,
  EQUIPMENT_IDS.manjuuPiggyBank,
  EQUIPMENT_IDS.littleBustersGlassMarbles
] as const;
const RESOURCE_MATERIALS_ITEMS = [EQUIPMENT_IDS.supplySatchel, EQUIPMENT_IDS.hornOfPlenty] as const;
const RESOURCE_GOLD_ITEMS = [EQUIPMENT_IDS.alchemistsSatchel] as const;
const MOVEMENT_ITEMS = [
  EQUIPMENT_IDS.windriderSaddle,
  EQUIPMENT_IDS.coursersBarding,
  EQUIPMENT_IDS.bodyFlickerTabi,
  EQUIPMENT_IDS.beaverSquadTag
] as const;

/** Whether the player's main hero wears ANY of the given equipment ids. */
function playerHasAnyEquipment(state: GameState, playerId: PlayerId, ids: readonly string[]): boolean {
  return ids.some((id) => playerHasEquipment(state, playerId, id));
}

/** How many of the given equipment ids the player's main hero wears (≤ slots). */
function countEquipment(state: GameState, playerId: PlayerId, ids: readonly string[]): number {
  return ids.reduce((sum, id) => sum + (playerHasEquipment(state, playerId, id) ? 1 : 0), 0);
}

// --- Always-on economy / caster grants (each gated by the item equipped) ----

/**
 * Cosmos Pendant (xianxia), Spirit Focus (isekai), Sage Chakra Charm (shinobi)
 * AND SG Radar (kansen): +1 spell Power each, folded at the standing chokepoint.
 * ALL are the ACCESSORY slot, so at most ONE is ever worn — each is checked
 * independently only so whichever the hero carries contributes (they are
 * package-flavoured twins, NOT a +2/+3/+4 stack; the accessory-slot cap is
 * pinned in anime-equipment.test.ts). The equipment spell-power fold therefore
 * still tops out at +1; further Power comes from the separate Cultivation /
 * Hero-Grade seams.
 */
export function equipmentSpellPowerBonus(state: GameState, playerId: PlayerId): number {
  return countEquipment(state, playerId, SPELL_POWER_ITEMS);
}

/**
 * Neon Microphone (weapon): +1 Power on the owner's FIRST Spell each combat.
 * Folded at standingSpellPower for spells only; the charge is consumed when a
 * spell cast resolves (`markEquipmentFirstSpellCast`).
 */
export function equipmentFirstSpellPowerBonus(state: GameState, playerId: PlayerId): number {
  if (!equipmentEnabled(state)) {
    return 0;
  }
  if (!playerHasAnyEquipment(state, playerId, FIRST_SPELL_POWER_ITEMS)) {
    return 0;
  }
  if (!playerMainHeroInCombat(state, playerId)) {
    return 0;
  }
  if (state.players[playerId]?.combatStats.equipmentFirstSpellPowerUsed) {
    return 0;
  }
  return 1;
}

/** Consume the Neon Microphone first-spell charge after a spell cast lands. */
export function markEquipmentFirstSpellCast(state: GameState, playerId: PlayerId): void {
  if (equipmentFirstSpellPowerBonus(state, playerId) <= 0) {
    return;
  }
  const stats = state.players[playerId]?.combatStats;
  if (stats) {
    stats.equipmentFirstSpellPowerUsed = true;
  }
}

/**
 * Stage Costume / Ironbark Cuirass / Warden's Aegis / Repair Toolkit (all
 * armor): after the first attack against one of the owner's units this combat
 * resolves, grant that defender a Defense token (once). Same armor slot ⇒ at
 * most one is worn, so the one-charge-per-combat grant never doubles.
 */
export function applyEquipmentStageCostumeDefenseToken(
  state: GameState,
  defender: { controllerId: PlayerId; id: string; defenseToken?: boolean }
): void {
  if (!equipmentEnabled(state)) {
    return;
  }
  if (!playerHasAnyEquipment(state, defender.controllerId, DEFENSE_TOKEN_ITEMS)) {
    return;
  }
  if (!playerMainHeroInCombat(state, defender.controllerId)) {
    return;
  }
  const stats = state.players[defender.controllerId]?.combatStats;
  if (!stats || stats.equipmentStageCostumeUsed) {
    return;
  }
  stats.equipmentStageCostumeUsed = true;
  // Defense token: the Defend-die shield. No-op if already held.
  if (!defender.defenseToken) {
    (defender as { defenseToken?: boolean }).defenseToken = true;
  }
}

/**
 * Guild-Issue Mail (armor) / Twin-Tail Ribbon (accessory) / Eternal Sash
 * (accessory) / Sage Chakra Charm (accessory) / SG Radar (accessory): +1 hand
 * limit each. Folded at effectiveHandLimit. Twin-Tail, Eternal Sash, Sage Chakra
 * Charm and SG Radar all share the ACCESSORY slot (only one is worn), so
 * equipment still tops out at +2 — Guild-Issue Mail (armor) plus one accessory.
 * Each item is checked independently so whichever pair the hero wears is counted
 * (accessory-slot cap pinned in anime-equipment.test.ts).
 */
export function equipmentHandLimitBonus(state: GameState, playerId: PlayerId): number {
  return countEquipment(state, playerId, HAND_LIMIT_ITEMS);
}

/**
 * Post-combat WIN gold from equipment: Adventurer's Blade (+1), Lucky Coin (+1),
 * and Alchemist's Satchel (+1) each grant, so a hero carrying all three stacks
 * to +3 (on top of the Hero-Grade Bounty Hunter's Eye, a separate seam). Folded
 * at finalizeAdventureCombat.
 */
export function equipmentWinGold(state: GameState, playerId: PlayerId): number {
  // Adventurer's Blade (weapon), Alchemist's Satchel (armor), and one accessory
  // (Lucky Coin / Coinward Talisman / Horn of Plenty / Manjuu Piggy Bank — same
  // slot, one worn) → caps at +3; the accessory sources never double-count.
  return countEquipment(state, playerId, WIN_GOLD_ITEMS);
}

/**
 * Supply Satchel / Horn of Plenty (both accessory): +1 building materials each
 * Resources round. Same slot ⇒ at most one is worn, so the grant tops out at +1.
 */
export function equipmentResourceRoundMaterials(state: GameState, playerId: PlayerId): number {
  return playerHasAnyEquipment(state, playerId, RESOURCE_MATERIALS_ITEMS) ? 1 : 0;
}

/** Alchemist's Satchel (armor): +1 gold each Resources round (its income half). */
export function equipmentResourceRoundGold(state: GameState, playerId: PlayerId): number {
  return playerHasAnyEquipment(state, playerId, RESOURCE_GOLD_ITEMS) ? 1 : 0;
}

/**
 * Windrider Saddle (mount): +1 movement point to the player's MAIN hero each
 * turn refresh — the "Courier's Charm" idea CLAUDE.md documents as previously
 * unshipped for lack of a per-turn movement seam. The clean seam is the
 * per-turn movement MAX (`heroMovementMax`, folded there), so the drip lands
 * exactly once per turn on the refresh and raises the displayed max. 0 when the
 * module is off / no saddle.
 */
export function equipmentMovementBonus(state: GameState, playerId: PlayerId): number {
  // Windrider Saddle / Courser's Barding / Body-Flicker Tabi / Beaver Squad Tag
  // (all mount, one worn) → +1 MP.
  return playerHasAnyEquipment(state, playerId, MOVEMENT_ITEMS) ? 1 : 0;
}

/**
 * Veteran's Standard (accessory): the EXTRA Unit-Experience XP the player's
 * surviving units gain per won combat (0 or 1). Added at the unit-experience
 * grant site (so 1 base + 1 = 2 XP per win). Only meaningful while the Unit
 * Experience module is on (the grant site never runs otherwise), and only for
 * the player who actually won and wears it.
 */
export function equipmentVeteranBonusXp(state: GameState, playerId: PlayerId): number {
  return playerHasEquipment(state, playerId, EQUIPMENT_IDS.veteransStandard) ? 1 : 0;
}

/**
 * Marshal's War Horn (accessory): whether the player's main hero wears it — the
 * Source-2 branch of `commanderPreCombatSortAvailable`. Gated by
 * `playerHasEquipment` (module-off ⇒ false), so a bare / module-off hero grants
 * no sort capability. Commanders-module presence is checked by the caller.
 */
export function equipmentGrantsCommanderSort(state: GameState, playerId: PlayerId): boolean {
  return playerHasEquipment(state, playerId, EQUIPMENT_IDS.marshalsWarHorn);
}

/**
 * Spirit Crane Mount (mount): whether the player's main hero wears it — OR-branch
 * of the commander free-revive gate in `finalizeCommandersAfterCombat`. Reuses
 * the Helm-of-Immortality free-revive semantics (a fallen commander does not
 * persist its death, costs no revive gold). Module-off ⇒ false.
 */
export function equipmentGrantsCommanderRevive(state: GameState, playerId: PlayerId): boolean {
  return playerHasEquipment(state, playerId, EQUIPMENT_IDS.spiritCraneMount);
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

/** Whether `playerId`'s first-declared-attack charge (Sword / Poleaxe) is available. */
function swordAvailable(state: GameState, playerId: PlayerId): boolean {
  return (
    equipmentEnabled(state) &&
    playerHasAnyEquipment(state, playerId, FIRST_ATTACK_ITEMS) &&
    playerMainHeroInCombat(state, playerId) &&
    !state.players[playerId]?.combatStats.equipmentFirstAttackUsed
  );
}

/** Whether `playerId`'s first-incoming-attack charge (Mail / Aegis) is available. */
function mailAvailable(state: GameState, playerId: PlayerId): boolean {
  return (
    equipmentEnabled(state) &&
    playerHasAnyEquipment(state, playerId, INCOMING_PENALTY_ITEMS) &&
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
 * Blade of the Trial (weapon): +1 Attack on the owner's declared attacks during
 * combat ROUND 1 only — a LIVE read (round-gated, NOT a one-shot charge like the
 * sword), so every round-1 attack benefits and round 2 onward does not. Read
 * beside the sword in getAttackStackDetails; added UNCLAMPED. Excludes
 * retaliations (declared attacks only, matching the sword). 0 when the module is
 * off / no blade / past round 1 / the main hero is not in this combat.
 */
export function equipmentRound1AttackBonus(state: GameState, attacker: CombatUnitState, isRetaliation: boolean): number {
  if (isRetaliation || !equipmentEnabled(state)) {
    return 0;
  }
  if ((state.combat?.round ?? 1) !== 1) {
    return 0;
  }
  if (!playerHasAnyEquipment(state, attacker.controllerId, ROUND1_ATTACK_ITEMS)) {
    return 0;
  }
  return playerMainHeroInCombat(state, attacker.controllerId) ? 1 : 0;
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
 * Equip `equipmentId` onto the player's MAIN hero. Whatever sat in its slot is
 * moved to the equipment bag, and the newly equipped item is removed from that
 * bag. Stamps both stores lazily. Returns the replaced item id
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
  const inventory = (hero.equipmentInventory ?? []).filter((id) => id !== equipmentId);
  if (replaced && replaced !== equipmentId && !inventory.includes(replaced)) {
    inventory.push(replaced);
  }
  hero.equipment = { ...current, [def.slot]: equipmentId };
  hero.equipmentInventory = inventory;
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
