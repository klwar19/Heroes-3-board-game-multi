import type { TownVeterancyMechanic } from "@/data/units/abilities";
import type { CombatUnitState, GameState } from "./state";
import { getUnitAbilityDefinitions, isUndeadUnit } from "./unit-abilities";
import { unitsAdjacent } from "./hex-footprint";
import {
  veteranDamage,
  veteranHeal,
  veteranRandom,
  veteranTrigger,
} from "./faction-veterancy";
import { queueElementalChoice } from "./elemental-veterancy";
import { makeActiveEffect, effectAppliesToUnit, unitImmuneToParalysis } from "./active-effects";
import { hasToken, placeCombatToken, PETRIFYING_CURSE_SOURCE } from "./tokens";
import { drawCardsForPlayer } from "./decks";
import { coreUnitDefinitions } from "@/data/factions/units";
import { availableRunes, gainRunes } from "./runes";
import { appendEvent } from "./events";
import { forgeAfterAttack, forgeActivation, forgeDefenseBonus, forgeDefenseToken } from "./forge";

export function townVeterancy(
  unit: CombatUnitState,
  mechanic: TownVeterancyMechanic,
): boolean {
  return getUnitAbilityDefinitions(unit).some(
    (a) =>
      a.implementationStatus === "implemented" &&
      a.effect?.type === "TOWN_VETERANCY" &&
      a.effect.mechanic === mechanic,
  );
}
const alive = (u: CombatUnitState) => u.damage < u.maxHealth;

/**
 * LEGACY: the 2-round curse the old Devil's Luck left on the enemy unit (user
 * ruling 2026-09-27). Since 2026-09-29 Devil's Luck no longer curses; the name
 * is still read so a curse carried by a saved in-progress combat keeps working
 * until it expires.
 */
export const DEVIL_LUCK_CURSE_NAME = "Devil's Luck Curse";

/**
 * The unit carries a live Devil's Luck curse: its "+1" Attack die results get
 * -1 Attack, without spending any devil's per-round uses. A curse the unit
 * ignores (e.g. Blind Instinct) does not count.
 */
export function devilLuckCursed(state: GameState | undefined, unit: CombatUnitState): boolean {
  return Boolean(state?.activeEffects.some(
    (effect) =>
      effect.name === DEVIL_LUCK_CURSE_NAME &&
      effect.target?.type === "unit" &&
      effect.target.unitId === unit.id &&
      effectAppliesToUnit(effect, unit),
  ));
}

/**
 * Arch Devils R1 Devil's Luck: a living veteran devil opposing `attacker` that
 * can still curse an enemy "+1" Attack die this combat round (2 per round, per
 * devil). Read-only, so previews and the real hit agree; the hit spends it.
 * The curse does not stack: an attacker already cursed is not cursed again
 * (its "+1" still gets the single -1 through devilLuckCursed).
 */
export function devilLuckSource(
  state: GameState | undefined,
  attacker: CombatUnitState,
): CombatUnitState | undefined {
  const combat = state?.combat;
  if (!state || !combat || devilLuckCursed(state, attacker)) return undefined;
  return Object.values(combat.units).find(
    (unit) =>
      unit.controllerId !== attacker.controllerId &&
      alive(unit) &&
      townVeterancy(unit, "devil-luck") &&
      (unit.townVeterancy?.devilLuckRound === combat.round
        ? (unit.townVeterancy.devilLuckUses ?? 0)
        : 0) < 2,
  );
}

export function spendDevilLuck(
  state: GameState,
  devil: CombatUnitState,
  attacker: CombatUnitState,
): void {
  const round = state.combat?.round ?? 0;
  const vet = (devil.townVeterancy ??= {});
  vet.devilLuckUses = vet.devilLuckRound === round ? (vet.devilLuckUses ?? 0) + 1 : 1;
  vet.devilLuckRound = round;
  // The -1 on THIS attack is already folded into its resolved value. User
  // ruling 2026-09-29: that is all Devil's Luck does — no lingering curse.
  veteranTrigger(state, devil, "town-devil-luck", attacker, `${devil.cardName}'s Devil's Luck gives ${attacker.cardName}'s +1 -1 Attack (${vet.devilLuckUses}/2 this round).`);
}

/**
 * Snow Elves R2 Rune-Tipped Strike: +1 Rune after the elf's own attack and +1
 * when an enemy attacks it, sharing a budget of 2 Runes per combat round.
 */
function snowElfRuneStrike(state: GameState, unit: CombatUnitState): void {
  const round = state.combat?.round ?? 0;
  const memory = (unit.townVeterancy ??= {});
  const used = memory.snowElfRuneRound === round ? (memory.snowElfRuneUses ?? 0) : 0;
  if (used >= 2) return;
  memory.snowElfRuneRound = round;
  memory.snowElfRuneUses = used + 1;
  gainRunes(state, unit.controllerId, 1);
  veteranTrigger(state, unit, "town-snow-elf-rune-strike", unit, `${unit.cardName}'s Rune-Tipped Strike: +1 Rune (${used + 1}/2 this round).`);
}
function sharedDrawCount(
  state: GameState,
  controllerId: string,
  mechanic: TownVeterancyMechanic,
): number {
  return Object.values(state.combat?.units ?? {}).reduce(
    (total, unit) =>
      unit.controllerId === controllerId && townVeterancy(unit, mechanic)
        ? total + (unit.townVeterancy?.draws ?? 0)
        : total,
    0,
  );
}

export function townAttackBonus(
  state: GameState,
  attacker: CombatUnitState,
  defender: CombatUnitState,
  retaliation: boolean,
  currentDefense = defender.defense,
): number {
  return (
    (attacker.townVeterancy?.attack ?? 0) +
    (townVeterancy(attacker, "halberd-hunter") &&
    (defender.type === "flying" ||
      /^(dread knights?|champions?|nomads?|boars?)$/i.test(
        coreUnitDefinitions[defender.unitDefId ?? ""]?.name ?? defender.name,
      ))
      ? 1
      : 0) +
    (townVeterancy(attacker, "crusader-undead") && isUndeadUnit(defender)
      ? 1
      : 0) -
    (townVeterancy(defender, "crusader-undead") && isUndeadUnit(attacker)
      ? 1
      : 0) +
    (townVeterancy(attacker, "dragon-hunter") && ["ground", "flying"].includes(defender.type)
      ? 1
      : 0) +
    (townVeterancy(attacker, "gold-dragon-dominion") &&
    (defender.type === "ground" || (retaliation && defender.type === "flying"))
      ? 1
      : 0) +
    (townVeterancy(attacker, "gorgon-armored-prey") && currentDefense >= 2
      ? 1
      : 0) +
    (townVeterancy(attacker, "mammoth-hunter") && ["ground", "ranged"].includes(defender.type)
      ? 1
      : 0) +
    (townVeterancy(attacker, "kobold-armored-prey") && currentDefense >= 2 ? 2 : 0) +
    // Wyverns R3 Venom Hunter: +1 into poisoned prey; a poisoned enemy strikes
    // the Wyvern at -1 (attacks and Retaliation Attacks alike).
    (townVeterancy(attacker, "wyvern-venom-hunter") && (defender.poisonCubes ?? 0) > 0 ? 1 : 0) -
    (attacker.controllerId !== defender.controllerId && (attacker.poisonCubes ?? 0) > 0 && townVeterancy(defender, "wyvern-venom-hunter") ? 1 : 0) -
    (retaliation && townVeterancy(defender, "efreet-mend") ? 1 : 0) -
    (retaliation && attacker.controllerId !== defender.controllerId && townVeterancy(defender, "angel-safe") ? 3 : 0) +
    (!retaliation && townVeterancy(attacker, "haspid-aggressive-drill") ? 1 : 0) +
    // Bulwark Shamans R4 Runecharged Step: a teleport readies +1 Attack for the
    // next OWN attack only (consumed in townAfterAttack; never on retaliation).
    (!retaliation && attacker.townVeterancy?.runechargedStrikeReady ? 1 : 0) +
    (townVeterancy(attacker, "pit-demon-bond") &&
    Object.values(state.combat?.units ?? {}).some(
      (unit) =>
        alive(unit) &&
        unit.id !== attacker.id &&
        unit.controllerId === attacker.controllerId &&
        unitsAdjacent(state.combat, unit, attacker) &&
        (unit.unitDefId?.endsWith(".demons") || /^(demons?)$/i.test(unit.name)),
    )
      ? 1
      : 0)
  );
}

export function townDefenseBonus(
  state: GameState,
  attacker: CombatUnitState,
  defender: CombatUnitState,
  isRetaliation = false,
): number {
  return (
    forgeDefenseBonus(state, attacker, defender) +
    (!isRetaliation && state.combat?.round !== undefined && state.combat.round % 2 === 1 && townVeterancy(defender, "behemoth-odd-defense") ? 1 : 0) +
    (!isRetaliation && state.combat?.round !== undefined && state.combat.round % 2 === 1 && townVeterancy(defender, "black-dragon-guard") ? 1 : 0) +
    (townVeterancy(defender, "elf-guard") &&
    ["ranged", "flying"].includes(attacker.type)
      ? 1
      : 0) +
    (townVeterancy(defender, "grenadier-guard-heal") && ["ranged", "flying"].includes(attacker.type) ? 1 : 0) +
    (townVeterancy(defender, "pegasus-guard") &&
    Object.values(state.combat?.units ?? {}).some(
      (t) =>
        alive(t) &&
        t.id !== defender.id &&
        t.controllerId === defender.controllerId &&
        unitsAdjacent(state.combat, t, defender),
    )
      ? 1
      : 0) -
    (townVeterancy(attacker, "marksman-mark") &&
    attacker.townVeterancy?.markedTargets?.includes(defender.id)
      ? 1
      : 0)
  );
}

export function townDefenseToken(
  state: GameState,
  defender: CombatUnitState,
): boolean {
  return (
    forgeDefenseToken(state, defender) ||
    townVeterancy(defender, "golem-shield") ||
    townVeterancy(defender, "nix-guarded") ||
    Object.values(state.combat?.units ?? {}).some(
      (t) =>
        alive(t) &&
        t.id !== defender.id &&
        unitsAdjacent(state.combat, t, defender) &&
        townVeterancy(t, "halberd-aura"),
    )
  );
}

export function townBound(
  state: GameState | undefined,
  unit: CombatUnitState,
): boolean {
  return (unit.townVeterancy?.boundBy ?? []).some((id) => {
    const source = state?.combat?.units[id];
    return (
      source && alive(source) && unitsAdjacent(state?.combat, source, unit)
    );
  });
}

export function townSpellCast(state: GameState, casterId: string, fromHand = false): void {
  for (const source of Object.values(state.combat?.units ?? {})) {
    if (!alive(source)) continue;
    if (
      source.controllerId === casterId &&
      townVeterancy(source, "ram-spell-draw") &&
      sharedDrawCount(state, casterId, "ram-spell-draw") < 2
    ) {
      const memory = (source.townVeterancy ??= {});
      memory.draws = (memory.draws ?? 0) + 1;
      drawCardsForPlayer(state, casterId, 1);
      veteranTrigger(state, source, "town-ram-spell-draw");
    }
    if (source.controllerId === casterId) continue;
    if (
      fromHand &&
      townVeterancy(source, "lizard-spell-draw") &&
      sharedDrawCount(state, source.controllerId, "lizard-spell-draw") < 2
    ) {
      const memory = (source.townVeterancy ??= {});
      memory.draws = (memory.draws ?? 0) + 1;
      drawCardsForPlayer(state, source.controllerId, 1);
      veteranTrigger(state, source, "town-lizard-spell-draw");
    }
    const mechanic = townVeterancy(source, "dwarf-backlash")
      ? "dwarf-backlash"
      : townVeterancy(source, "familiar-backlash")
        ? "familiar-backlash"
        : undefined;
    if (!mechanic) continue;
    const target = veteranRandom(
      state,
      Object.values(state.combat!.units).filter(
        (t) =>
          alive(t) &&
          (mechanic === "dwarf-backlash" || t.controllerId === casterId),
      ),
      source.id + mechanic,
    );
    if (target) veteranDamage(state, source, target, 1, `town-${mechanic}`);
  }
}

export function townAfterAttack(
  state: GameState,
  attacker: CombatUnitState,
  defender: CombatUnitState,
  retaliation: boolean,
  roll: number,
  dieCancelled: boolean,
  kind: "melee" | "ranged",
): void {
  forgeAfterAttack(state, attacker, defender, retaliation, roll, dieCancelled);
  // Hydras R4 Venom Ward: the -1 itself is folded into the resolved damage
  // (reducer.ts attack-damage calculation); this only announces it. Read before any cube is
  // added below, so it matches the cubes the attacker carried into the hit.
  if (attacker.controllerId !== defender.controllerId && (attacker.poisonCubes ?? 0) > 0 && alive(defender) && townVeterancy(defender, "hydra-venom-ward")) {
    veteranTrigger(state, defender, "town-hydra-venom-ward", attacker, `${defender.cardName}'s Venom Ward: poisoned ${attacker.cardName} deals 1 less damage.`);
  }
  const enemyTarget = attacker.controllerId !== defender.controllerId;
  // Hydras R3 Venomous Heads: own attack, 0 or +1 face -> 1 poison cube (the
  // shared cube pool, so it stacks with Wyvern / Haspid cubes).
  if (!retaliation && !dieCancelled && (roll === 0 || roll === 1) && enemyTarget && alive(defender) && townVeterancy(attacker, "hydra-venom-bite")) {
    defender.poisonCubes = (defender.poisonCubes ?? 0) + 1;
    veteranTrigger(state, attacker, "town-hydra-venom-bite", defender, `${attacker.cardName}'s venomous heads leave 1 poison cube on ${defender.cardName}.`);
  }
  // Arch Devils R3 Petrifying Curse: own attack, -1 face -> Paralysis (the
  // 0 face's +1 Attack is part of getAttackBonusOnAttackDie).
  if (!retaliation && !dieCancelled && roll === -1 && enemyTarget && alive(defender) && townVeterancy(attacker, "devil-petrify") &&
      !hasToken(defender, "paralysis") && !unitImmuneToParalysis(state, defender)) {
    placeCombatToken(state, defender, "paralysis", 0, PETRIFYING_CURSE_SOURCE);
    veteranTrigger(state, attacker, "town-devil-petrify", defender, `${attacker.cardName}'s Petrifying Curse turns ${defender.cardName} to stone (Paralyzed).`);
  }
  // Black Dragons R3 Wheeling Retreat: queued now, but a "return-origin" pick
  // is only opened once the whole attack sequence (including the enemy's
  // Retaliation Attack) has resolved, so the Dragon is retaliated first.
  // A MOVE_UNIT records the origin in the town memory; a combined
  // MOVE_AND_ATTACK_UNIT (Berserk / Werewolf frenzy) does not, so fall back to
  // the space this activation began on.
  const memoryOrigin = (attacker.townVeterancy as Record<string, unknown> | undefined)?.activationOrigin;
  const origin = typeof memoryOrigin === "number"
    ? memoryOrigin
    : attacker.movedThisActivation ? attacker.activationStartPosition : undefined;
  if (!retaliation && typeof origin === "number" && origin !== attacker.position && alive(attacker) && townVeterancy(attacker, "black-dragon-return")) {
    queueElementalChoice(state, { kind: "return-origin", unitId: attacker.id, abilityId: "town-black-dragon-return", position: origin, optional: true });
  }
  if (attacker.controllerId !== defender.controllerId && !dieCancelled && roll >= 0 &&
      alive(defender) && townVeterancy(defender, "grenadier-guard-heal")) {
    veteranHeal(state, defender, 1, "factory-grenadier-guard-heal");
  }
  if (!retaliation && alive(attacker) && townVeterancy(attacker, "sandworm-burrow")) {
    const memory = (attacker.townVeterancy ??= {});
    if ((memory.sandwormBurrowUses ?? 0) < 2) {
      memory.sandwormBurrowUses = (memory.sandwormBurrowUses ?? 0) + 1;
      memory.sandwormInitiativeBonus = (memory.sandwormInitiativeBonus ?? 0) + 3;
      attacker.initiative += 3;
      veteranTrigger(state, attacker, "factory-sandworm-burrow", attacker, `${attacker.cardName} gains +3 Initiative (${memory.sandwormBurrowUses}/2).`);
    }
    queueElementalChoice(state, { kind: "veteran-teleport", unitId: attacker.id, abilityId: "factory-sandworm-burrow", maxDistance: 2, optional: true });
  }
  if (!retaliation && attacker.movedThisActivation && getUnitAbilityDefinitions(attacker).some(a => a.id === "veteran-magma-attack-after-move")) {
    (attacker.townVeterancy ??= {}).attackAfterMoveUsed = true;
  }
  if (retaliation && townVeterancy(attacker, "centaur-retaliation") && alive(attacker)) {
    const memory = (attacker.townVeterancy ??= {});
    memory.attack = Math.min(3, (memory.attack ?? 0) + 1);
    veteranTrigger(state, attacker, "veteran-centaur-retaliation", attacker, `${attacker.cardName} gains +1 Attack after retaliating.`);
  }
  if (townVeterancy(attacker, "gnoll-gold") && (attacker.townVeterancy?.goldEarned ?? 0) < 3) {
    const owner = state.players[attacker.controllerId];
    if (owner) {
      const memory = (attacker.townVeterancy ??= {});
      memory.goldEarned = (memory.goldEarned ?? 0) + 1;
      owner.resources.gold += 1;
      appendEvent(state, { type: "RESOURCES_GAINED", playerId: owner.id, gold: 1, buildingMaterials: 0, valuables: 0, reason: "Raiders' Pay" });
      veteranTrigger(state, attacker, "town-gnoll-gold", attacker, `${attacker.cardName} earns 1 Gold.`);
    }
  }
  if (!retaliation && townVeterancy(attacker, "haspid-aggressive-drill") && (defender.poisonCubes ?? 0) > 0) {
    veteranHeal(state, attacker, 1, "town-haspid-aggressive-drill");
  }
  if (!retaliation && attacker.townVeterancy?.runechargedStrikeReady) {
    attacker.townVeterancy.runechargedStrikeReady = false;
  }
  if (!retaliation && townVeterancy(attacker, "snow-elf-rune-strike")) {
    snowElfRuneStrike(state, attacker);
  }
  if (!retaliation && enemyTarget && townVeterancy(defender, "snow-elf-rune-strike")) {
    snowElfRuneStrike(state, defender);
  }
  // Snow Elves R3 Frostbite Bleed: a 0 or -1 on any of the elf's attacks makes
  // the surviving enemy lose 1 HP at the start of the next combat round. A unit
  // already bleeding is not bled again (no stacking).
  if (!dieCancelled && (roll === 0 || roll === -1) && enemyTarget && alive(defender) &&
      townVeterancy(attacker, "snow-elf-bleed") && defender.townVeterancy?.bleedRound === undefined) {
    const memory = (defender.townVeterancy ??= {});
    memory.bleedRound = (state.combat?.round ?? 0) + 1;
    memory.bleedSourceId = attacker.id;
    veteranTrigger(state, attacker, "town-snow-elf-bleed", defender, `${attacker.cardName}'s Frostbite Bleed: ${defender.cardName} will lose 1 HP at the start of the next combat round.`);
  }
  if (!retaliation && townVeterancy(attacker, "ayssid-slow") && alive(defender)) {
    const effect = makeActiveEffect(state, { name: "Raking Assault", scope: "unit", duration: { type: "combat" }, polarity: "negative", removable: true, modifiers: [{ type: "INITIATIVE_BONUS", amount: -1 }] },
      { type: "unit", unitId: attacker.id, controllerId: attacker.controllerId }, attacker.controllerId, { type: "unit", unitId: defender.id });
    if (effectAppliesToUnit(effect, defender, true)) state.activeEffects.push(effect);
    veteranTrigger(state, attacker, "town-ayssid-slow", defender);
  }
  for (const observer of Object.values(state.combat?.units ?? {})) {
    if (alive(observer) && observer.controllerId !== attacker.controllerId && kind === "ranged" && townVeterancy(observer, "sorceress-ranged-mend")) {
      veteranHeal(state, observer, 1, "town-sorceress-ranged-mend");
    }
  }
  if (
    attacker.controllerId !== defender.controllerId &&
    townVeterancy(defender, "jotunn-rune-hide")
  ) {
    gainRunes(state, defender.controllerId, 2);
    veteranTrigger(state, defender, "town-jotunn-rune-hide", attacker);
  }
  if (
    attacker.controllerId !== defender.controllerId &&
    townVeterancy(defender, "haspid-toxic-hide") &&
    ["ground", "flying"].includes(attacker.type) &&
    alive(attacker)
  ) {
    attacker.poisonCubes = (attacker.poisonCubes ?? 0) + 1;
    veteranTrigger(state, defender, "town-haspid-toxic-hide", attacker, `${attacker.cardName} receives 1 poison cube from ${defender.cardName}.`);
  }
  if (
    townVeterancy(attacker, "marksman-mark") &&
    attacker.controllerId !== defender.controllerId
  ) {
    const marks = ((attacker.townVeterancy ??= {}).markedTargets ??= []);
    if (!marks.includes(defender.id)) marks.push(defender.id);
  }
  if (
    townVeterancy(attacker, "devil-slow") &&
    alive(defender) &&
    attacker.controllerId !== defender.controllerId
  ) {
    const effect = makeActiveEffect(
      state,
      {
        name: "Crippling Strike",
        scope: "unit",
        duration: { type: "next-activation" },
        polarity: "negative",
        removable: true,
        modifiers: [{ type: "TOWN_MOVE_LIMIT", amount: 2 }],
      },
      {
        type: "unit",
        unitId: attacker.id,
        controllerId: attacker.controllerId,
      },
      attacker.controllerId,
      { type: "unit", unitId: defender.id },
    );
    // A retaliation can hit the currently active unit; retain the limit through its next activation.
    if (state.combat?.activeUnitId === defender.id)
      effect.activationsRemaining = 2;
    if (effectAppliesToUnit(effect, defender, true)) state.activeEffects.push(effect);
    veteranTrigger(state, attacker, "town-devil-slow", defender);
  }
  if (alive(attacker)) {
    if (
      !retaliation &&
      !dieCancelled &&
      (roll === -1 || roll === 0) &&
      townVeterancy(attacker, "magi-recover") &&
      (attacker.townVeterancy?.magiRecoveryUses ?? 0) +
        (state.combat?.elementalChoices ?? []).filter((choice) =>
          choice.kind === "town-recover" && choice.unitId === attacker.id && choice.abilityId === "town-magi-recover"
        ).length < 2
    )
      queueElementalChoice(state, {
        kind: "town-recover",
        unitId: attacker.id,
        abilityId: "town-magi-recover",
      });
    if (kind === "ranged" && townVeterancy(attacker, "cyclops-splash"))
      queueElementalChoice(state, {
        kind: "veteran-cleave",
        unitId: attacker.id,
        targetId: defender.id,
        abilityId: "town-cyclops-splash",
        amount: 1,
      });
    if (
      townVeterancy(attacker, "orc-discard") &&
      attacker.controllerId !== defender.controllerId
    ) {
      const owner = state.players[defender.controllerId];
      const index = veteranRandom(
        state,
        (owner?.hand ?? []).map((_, i) => i),
        attacker.id + "-plunder",
      );
      if (owner && index !== undefined) {
        owner.discard.push(owner.hand.splice(index, 1)[0]);
        veteranTrigger(state, attacker, "town-orc-discard", defender);
      }
    }
  }
  townNagaMend(state, defender);
  if (retaliation && townVeterancy(defender, "efreet-mend"))
    veteranHeal(state, defender, 1, "town-efreet-mend");
  if (unitsAdjacent(state.combat, attacker, defender)) {
    if (
      !dieCancelled &&
      roll === 1 &&
      townVeterancy(defender, "demon-paralyze") &&
      alive(attacker) && !unitImmuneToParalysis(state, attacker)
    ) {
      placeCombatToken(state, attacker, "paralysis", 0, "Petrifying Hide");
      veteranTrigger(state, defender, "town-demon-paralyze", attacker);
    }
    if (!retaliation && townVeterancy(defender, "dragon-snare") && alive(attacker)) {
      const roots = ((attacker.townVeterancy ??= {}).boundBy ??= []);
      if (alive(defender) && !roots.includes(defender.id))
        roots.push(defender.id);
      veteranDamage(state, defender, attacker, 1, "town-dragon-snare");
    }
  }
}

/** Renewing Coils shares one round budget between attacks and damaging Spells. */
export function townNagaMend(state: GameState, unit: CombatUnitState): void {
  const round = state.combat?.round;
  if (round === undefined || !alive(unit) || !townVeterancy(unit, "naga-mend") || unit.townVeterancy?.nagaMendRound === round) return;
  if (unit.damage <= 0) return;
  (unit.townVeterancy ??= {}).nagaMendRound = round;
  veteranHeal(state, unit, 1, "town-naga-mend");
}

export function townCombatStart(state: GameState): void {
  townCombatRoundStart(state);
  for (const unit of Object.values(state.combat?.units ?? {})) {
    if (
      alive(unit) &&
      townVeterancy(unit, "gremlin-recover") &&
      !unit.townVeterancy?.startUsed
    ) {
      (unit.townVeterancy ??= {}).startUsed = true;
      queueElementalChoice(state, {
        kind: "town-recover",
        unitId: unit.id,
        abilityId: "town-gremlin-recover",
        optional: true,
      });
    }
  }
}

export function townCombatRoundStart(state: GameState): void {
  const round = state.combat?.round ?? 0;
  for (const unit of Object.values(state.combat?.units ?? {})) {
    // Snow Elves R3 Frostbite Bleed resolves first: the bled unit loses 1 HP.
    const bleedRound = unit.townVeterancy?.bleedRound;
    if (bleedRound !== undefined && round >= bleedRound) {
      const sourceId = unit.townVeterancy!.bleedSourceId;
      delete unit.townVeterancy!.bleedRound;
      delete unit.townVeterancy!.bleedSourceId;
      const source = (sourceId && state.combat?.units[sourceId]) || unit;
      if (alive(unit)) veteranDamage(state, source, unit, 1, "town-snow-elf-bleed", true);
    }
    if (alive(unit) && townVeterancy(unit, "hydra-round-mend")) {
      veteranHeal(state, unit, 2, "town-hydra-round-mend");
    }
    if (alive(unit) && townVeterancy(unit, "automaton-round-blast")) {
      queueElementalChoice(state, { kind: "damage", unitId: unit.id, abilityId: "factory-automaton-round-blast", amount: 1, adjacent: true });
    }
  }
}

export function townMovement(
  state: GameState,
  unit: CombatUnitState,
  from: number,
  to: number,
): void {
  if (!alive(unit) || from === to) return;
  if (townVeterancy(unit, "dragon-fly-landing")) {
    queueElementalChoice(state, { kind: "damage", unitId: unit.id, abilityId: "town-dragon-fly-landing", amount: 1, adjacent: true });
  }
  if (townVeterancy(unit, "kobold-rune-step")) {
    gainRunes(state, unit.controllerId, 2);
    veteranTrigger(state, unit, "town-kobold-rune-step");
  }
  if (townVeterancy(unit, "ram-trample")) {
    queueElementalChoice(state, { kind: "damage", unitId: unit.id, abilityId: "town-ram-trample", amount: 1, adjacent: true });
  }
  // Runecharged Step replaces this unit's regular movement with teleportation,
  // including short teleports. A teleport readies +1 Attack for the next own
  // attack; it does not stack and is spent by that attack (townAfterAttack).
  if (from !== to && getUnitAbilityDefinitions(unit).some((a) => a.id === "town-shaman-teleport-charge")) {
    const mem = (unit.townVeterancy ??= {});
    if (!mem.runechargedStrikeReady) {
      mem.runechargedStrikeReady = true;
      veteranTrigger(state, unit, "town-shaman-teleport-charge", unit, `${unit.cardName}'s Runecharged Step: +1 Attack on its next attack.`);
    }
  }
}

export function townActivation(state: GameState, unit: CombatUnitState): void {
  forgeActivation(unit);
  if (townVeterancy(unit, "engineer-attack-support")) {
    queueElementalChoice(state, { kind: "engineer-buff", unitId: unit.id, abilityId: "factory-engineer-attack-support" });
  }
  // Mammoth Rune Mend (user 2026-09-29): no free heal — at activation the
  // player may spend 1 Rune to heal 1 HP (queued below).
  const runes = availableRunes(state, unit.controllerId);
  if (runes <= 0) return;
  if (townVeterancy(unit, "jotunn-rune-bolt")) {
    // Rune Bolt R3 (user 2026-09-29): spend 1 Rune for 1 damage to a chosen unit.
    queueElementalChoice(state, { kind: "damage", unitId: unit.id, abilityId: "town-jotunn-rune-bolt", amount: 1, runeCost: 1, optional: true });
  }
  if (townVeterancy(unit, "mammoth-rune-mend") && unit.damage > 0) {
    queueElementalChoice(state, { kind: "heal-self", unitId: unit.id, abilityId: "town-mammoth-rune-mend", amount: 1, runeCost: 1, optional: true });
  }
}

export function townArtifactUsed(state: GameState, userId: string): void {
  for (const source of Object.values(state.combat?.units ?? {})) {
    if (!alive(source) || source.controllerId === userId || !townVeterancy(source, "sorceress-artifact-tax")) continue;
    const user = state.players[userId];
    const index = veteranRandom(state, (user?.hand ?? []).map((_, i) => i), `${source.id}-artifact-tax`);
    if (!user || index === undefined) continue;
    const [discarded] = user.hand.splice(index, 1);
    if (discarded) user.discard.push(discarded);
    veteranTrigger(state, source, "town-sorceress-artifact-tax", source, `${user.name} discards an additional card to Covetous Curse.`);
  }
}

export function townAllowsRangedRetaliation(unit: CombatUnitState): boolean {
  return townVeterancy(unit, "sea-dog-ranged-retaliation");
}

export function townHasUnstoppableRetaliation(unit: CombatUnitState): boolean {
  return townVeterancy(unit, "haspid-unstoppable-counter") || townVeterancy(unit, "griffin-counter");
}

export function townAllyLost(state: GameState, fallen: CombatUnitState): void {
  const killer = fallen.townVeterancy?.damageSourceId
    ? state.combat?.units[fallen.townVeterancy.damageSourceId]
    : undefined;
  if (
    killer &&
    killer.controllerId !== fallen.controllerId &&
    townVeterancy(killer, "devil-draw") &&
    (killer.townVeterancy?.draws ?? 0) < 3
  ) {
    const memory = (killer.townVeterancy ??= {});
    memory.draws = (memory.draws ?? 0) + 1;
    drawCardsForPlayer(state, killer.controllerId, 1);
    veteranTrigger(state, killer, "town-devil-draw", fallen);
  }
  for (const unit of Object.values(state.combat?.units ?? {})) {
    if (
      unit.id === fallen.id ||
      unit.controllerId !== fallen.controllerId ||
      !alive(unit)
    )
      continue;
    if (
      townVeterancy(unit, "zealot-loss") &&
      (unit.townVeterancy?.zeal ?? 0) < 2
    ) {
      const memory = (unit.townVeterancy ??= {});
      memory.zeal = (memory.zeal ?? 0) + 1;
      memory.attack = (memory.attack ?? 0) + 1;
      veteranTrigger(state, unit, "town-zealot-loss");
    }
    if (townVeterancy(unit, "pit-mend"))
      veteranHeal(state, unit, 1, "town-pit-mend");
  }
}
