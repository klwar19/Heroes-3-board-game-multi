import type { TownVeterancyMechanic } from "@/data/units/abilities";
import type { CombatUnitState, GameState } from "./state";
import { getUnitAbilityDefinitions, isUndeadUnit } from "./unit-abilities";
import { isAdjacent } from "./battlefield";
import {
  veteranDamage,
  veteranHeal,
  veteranRandom,
  veteranTrigger,
} from "./faction-veterancy";
import { queueElementalChoice } from "./elemental-veterancy";
import { makeActiveEffect, effectAppliesToUnit, unitImmuneToParalysis } from "./active-effects";
import { placeCombatToken } from "./tokens";
import { drawCardsForPlayer } from "./decks";
import { coreUnitDefinitions } from "@/data/factions/units";
import { availableRunes, gainRunes } from "./runes";
import { appendEvent } from "./events";

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
    (townVeterancy(attacker, "dragon-hunter") &&
    ["ground", "flying"].includes(defender.type)
      ? 1
      : 0) +
    (townVeterancy(attacker, "gorgon-armored-prey") && currentDefense >= 2
      ? 1
      : 0) +
    (townVeterancy(attacker, "mammoth-hunter") && ["ground", "ranged"].includes(defender.type)
      ? 1
      : 0) +
    (townVeterancy(attacker, "kobold-armored-prey") && currentDefense >= 2 ? 2 : 0) -
    (retaliation && townVeterancy(defender, "efreet-mend") ? 1 : 0) +
    (!retaliation && townVeterancy(attacker, "haspid-aggressive-drill") ? 1 : 0) +
    (townVeterancy(attacker, "pit-demon-bond") &&
    Object.values(state.combat?.units ?? {}).some(
      (unit) =>
        alive(unit) &&
        unit.id !== attacker.id &&
        unit.controllerId === attacker.controllerId &&
        isAdjacent(unit.position, attacker.position) &&
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
    (!isRetaliation && state.combat?.round !== undefined && state.combat.round % 2 === 1 && townVeterancy(defender, "behemoth-odd-defense") ? 1 : 0) +
    (townVeterancy(defender, "elf-guard") &&
    ["ranged", "flying"].includes(attacker.type)
      ? 1
      : 0) +
    (townVeterancy(defender, "pegasus-guard") &&
    Object.values(state.combat?.units ?? {}).some(
      (t) =>
        alive(t) &&
        t.id !== defender.id &&
        t.controllerId === defender.controllerId &&
        isAdjacent(t.position, defender.position),
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
    townVeterancy(defender, "golem-shield") ||
    townVeterancy(defender, "nix-guarded") ||
    Object.values(state.combat?.units ?? {}).some(
      (t) =>
        alive(t) &&
        t.id !== defender.id &&
        isAdjacent(t.position, defender.position) &&
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
      source && alive(source) && isAdjacent(source.position, unit.position)
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
  if (!retaliation && alive(attacker) && townVeterancy(attacker, "sandworm-burrow")) {
    const memory = (attacker.townVeterancy ??= {});
    if ((memory.sandwormBurrowUses ?? 0) < 2) {
      memory.sandwormBurrowUses = (memory.sandwormBurrowUses ?? 0) + 1;
      memory.sandwormInitiativeBonus = (memory.sandwormInitiativeBonus ?? 0) + 3;
      attacker.initiative += 3;
      veteranTrigger(state, attacker, "factory-sandworm-burrow", attacker, `${attacker.cardName} gains +3 Initiative (${memory.sandwormBurrowUses}/2).`);
    }
    queueElementalChoice(state, { kind: "veteran-teleport", unitId: attacker.id, abilityId: "factory-sandworm-burrow", optional: true });
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
  if (!retaliation && townVeterancy(attacker, "snow-elf-rune-strike")) {
    gainRunes(state, attacker.controllerId, 2);
    veteranTrigger(state, attacker, "town-snow-elf-rune-strike");
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
  if (townVeterancy(defender, "naga-mend"))
    veteranHeal(state, defender, 1, "town-naga-mend");
  if (retaliation && townVeterancy(defender, "efreet-mend"))
    veteranHeal(state, defender, 1, "town-efreet-mend");
  if (isAdjacent(attacker.position, defender.position)) {
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
  for (const unit of Object.values(state.combat?.units ?? {})) {
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
  // including short teleports. Each movement therefore banks the bonus once.
  if (from !== to && getUnitAbilityDefinitions(unit).some((a) => a.id === "town-shaman-teleport-charge")) {
    const mem = (unit.townVeterancy ??= {});
    if ((mem.teleportCharges ?? 0) < 2) {
      mem.teleportCharges = (mem.teleportCharges ?? 0) + 1;
      mem.attack = (mem.attack ?? 0) + 1;
      veteranTrigger(state, unit, "town-shaman-teleport-charge");
    }
  }
}

export function townActivation(state: GameState, unit: CombatUnitState): void {
  if (townVeterancy(unit, "engineer-attack-support")) {
    queueElementalChoice(state, { kind: "engineer-buff", unitId: unit.id, abilityId: "factory-engineer-attack-support" });
  }
  // Mammoth Rune Mend heals 1 HP FREE on activation, then (below, if Runes remain)
  // offers 1 more HP for 1 Rune.
  if (townVeterancy(unit, "mammoth-rune-mend") && unit.damage > 0) {
    veteranHeal(state, unit, 1, "town-mammoth-rune-mend");
  }
  const runes = availableRunes(state, unit.controllerId);
  if (runes <= 0) return;
  if (townVeterancy(unit, "jotunn-rune-bolt")) {
    // Rune Bolt R3: spend 1 Rune for 1 damage, or 2 Runes for 2 damage (per-target tiers).
    queueElementalChoice(state, { kind: "damage", unitId: unit.id, abilityId: "town-jotunn-rune-bolt", amount: 1, runeCost: 1, optional: true, runeScaling: true });
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
