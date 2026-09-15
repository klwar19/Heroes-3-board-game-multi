import { townSpellCast, townBound } from "./town-veterancy";
import { neutralTownSpellCast, neutralTownDeepRooted } from "./neutral-town-veterancy";
import { getUnitAbilityDefinitions, isUnitDamageImmune } from "./unit-abilities";
import { factionVeterancy } from "./unit-abilities";
import { veteranHeal, veteranRandom, veteranDamage, veteranTrigger } from "./faction-veterancy";
import {
  isAdjacent,
  BATTLEFIELD_CELL_COUNT,
  getBattlefieldLabel,
} from "./battlefield";
import type {
  CombatUnitState,
  GameState,
  CombatState,
  GameAction,
  TargetRef,
} from "./state";
import { NEUTRAL_PLAYER_ID } from "./state";
import {
  unitAbilities,
  type ElementalVeterancyMechanic,
} from "@/data/units/abilities";
import { cardLibrary } from "@/data/cards/library";
import { balanceCardLibrary } from "./community-balance-cards";
import { effectiveInitiative } from "./active-effects";
import { appendEvent, nextEventNumber } from "./events";
import { applyNeutralDebuff } from "./neutral-veterancy";
import { spendRunes } from "./runes";
import { noteUnitDamagedForTokens } from "./tokens";
import { destroyFortification, defenderOnFortification } from "./siege";

type Request = NonNullable<CombatState["elementalChoices"]>[number];
export function breakCoverTargets(state: GameState, target: CombatUnitState, includeFortifications: boolean): number[] {
  const combat = state.combat;
  if (!combat) return [];
  const siege = combat.siege;
  const positions = [...(combat.obstacles ?? [])];
  if (includeFortifications && siege) {
    positions.push(...siege.walls);
    if (siege.gatePosition !== null) positions.push(siege.gatePosition);
  }
  return [...new Set(positions)].filter(p => isAdjacent(p, target.position) && !(combat.battlefieldTokens ?? []).some(t => t.position === p) &&
    (includeFortifications ? !siege || !defenderOnFortification(combat, siege, p) : !siege?.walls.includes(p) && siege?.gatePosition !== p));
}
export type ElementalHooks = {
  returnFire?(state: GameState, unit: CombatUnitState, targetId: string, accept: boolean): void;
  chainLightning?(state: GameState, unit: CombatUnitState, target: CombatUnitState): void;
  townBolt?(state: GameState, unit: CombatUnitState, target: CombatUnitState): boolean;
  damage(
    state: GameState,
    source: CombatUnitState,
    targetId: string,
    abilityId: string,
    name: string,
    amount: number,
  ): void;
  chooser(
    state: GameState,
    combat: CombatState,
    unit: CombatUnitState,
  ): string | null;
  targets(
    state: GameState,
    unit: CombatUnitState,
    cardId: string,
  ): Array<{
    target?: TargetRef;
    optionIndex?: number;
    label?: string;
    saveEcho?: boolean;
  }>;
  copy(
    state: GameState,
    unit: CombatUnitState,
    cardId: string,
    target: TargetRef,
    optionIndex?: number,
  ): void;
  copyBolt(
    state: GameState,
    unit: CombatUnitState,
    targetId: string,
    abilityId: string,
    amount: number,
  ): void;
  dispelAttack(
    state: GameState,
    attack: NonNullable<Request["attack"]>,
    dispel: boolean,
  ): void;
};
const alive = (u: CombatUnitState) => u.damage < u.maxHealth;
const enemies = (s: GameState, u: CombatUnitState) =>
  Object.values(s.combat!.units).filter(
    (t) => alive(t) && t.controllerId !== u.controllerId,
  );

export function queueElementalChoice(state: GameState, request: Request): void {
  if (state.combat && !state.combat.outcome)
    (state.combat.elementalChoices ??= []).push(request);
}

/** Called once for the spell's real cast, including instant spells, never for Power discards. */
export function noteElementalSpellCast(
  state: GameState,
  casterId: string,
  cardId: string,
  allowCopy = true,
  fromHand = false,
): void {
  if (
    state.activeEffects.some((effect) =>
      effect.modifiers.some((m) => m.type === "SUPPRESS_SPELL_ABILITIES"),
    )
  )
    return;
  townSpellCast(state, casterId, fromHand);
  neutralTownSpellCast(state, casterId);
  const card = balanceCardLibrary(state, cardLibrary)[cardId];
  const schools = card?.spellSchools ?? [];
  for (const unit of Object.values(state.combat?.units ?? {})) {
    if (!alive(unit) || unit.controllerId === casterId) continue;
    if (factionVeterancy(unit, "spell-heal")) veteranHeal(state, unit, 1, "veteran-wraith-magic");
    if (
      elementalVeterancy(unit, "fire-heal") &&
      (schools.includes("fire") || schools.includes("any"))
    ) {
      const healed = Math.min(2, unit.damage);
      unit.damage -= healed;
      appendEvent(state, {
        type: "UNIT_ABILITY_TRIGGERED",
        unitId: unit.id,
        targetUnitId: unit.id,
        abilityId: "veteran-energy-fire-heal",
        message: `${unit.cardName} heals ${healed} HP from enemy fire magic.`,
      });
      appendEvent(state, {
        type: "DAMAGE_HEALED",
        source: {
          type: "unit",
          unitId: unit.id,
          controllerId: unit.controllerId,
        },
        target: { type: "unit", unitId: unit.id },
        amount: healed,
      });
    }
    if (allowCopy && elementalVeterancy(unit, "spell-copy")) {
      // Trigger-bound instants keep their original timing. Storing the copy avoids a silent no-op cast outside an attack/spell window.
      if (card?.trigger) {
        ((unit.elementalVeterancy ??= {}).echoSpells ??= []).push(cardId);
        appendEvent(state, {
          type: "UNIT_ABILITY_TRIGGERED",
          unitId: unit.id,
          abilityId: "veteran-magic-copy",
          message: `${unit.cardName} can echo ${card.name} at Power 0 when its normal timing is legal.`,
        });
      } else
        queueElementalChoice(state, {
          kind: "copy",
          unitId: unit.id,
          abilityId: "veteran-magic-copy",
          cardId,
        });
    }
  }
}

export function elementalActivation(
  state: GameState,
  unit: CombatUnitState,
): void {
  const combat = state.combat;
  if (!combat || !alive(unit)) return;
  const risingNest = getUnitAbilityDefinitions(unit).some(a => ["veteran-phoenix-rising-nest", "veteran-phoenix-rising-nest-heal"].includes(a.id));
  for (const nest of Object.values(combat.units)) {
    if (
      nest.elementalVeterancy?.nestOwnerId !== unit.id ||
      !alive(nest) ||
      (nest.elementalVeterancy.nestRound ?? combat.round) >= combat.round
    )
      continue;
    if (!elementalVeterancy(unit, "nest")) continue;
    if (risingNest && (townBound(state, unit) || neutralTownDeepRooted(state, unit))) continue;
    const from = unit.position;
    unit.position = nest.position;
    nest.damage = nest.maxHealth;
    const healed = Math.min(1, Math.max(0, unit.damage));
    unit.damage -= healed;
    if (risingNest) (unit.elementalVeterancy ??= {}).nestAttackBonus = Math.min(2, (unit.elementalVeterancy?.nestAttackBonus ?? 0) + 1);
    appendEvent(state, {
      type: "UNIT_MOVED",
      playerId: unit.controllerId,
      unitId: unit.id,
      from,
      to: unit.position,
    });
    if (healed > 0) appendEvent(state, {
      type: "DAMAGE_HEALED",
      source: {
        type: "unit",
        unitId: unit.id,
        controllerId: unit.controllerId,
      },
      target: { type: "unit", unitId: unit.id },
      amount: healed,
    });
    appendEvent(state, {
      type: "UNIT_ABILITY_TRIGGERED",
      unitId: unit.id,
      targetUnitId: unit.id,
      abilityId: risingNest ? "veteran-phoenix-rising-nest-return" : "veteran-phoenix-nest",
      message: `${unit.cardName} returns to its Nest.`,
    });
  }
  if (elementalVeterancy(unit, "activation-burn"))
    queueElementalChoice(state, {
      kind: "damage",
      unitId: unit.id,
      abilityId: "veteran-phoenix-activation",
      amount: 1,
      adjacent: true,
    });
  if (elementalVeterancy(unit, "move-obstacle"))
    queueElementalChoice(state, {
      kind: "obstacle",
      unitId: unit.id,
      abilityId: "veteran-sprite-obstacle",
    });
  if (elementalVeterancy(unit, "nest"))
    queueElementalChoice(state, {
      kind: "nest",
      unitId: unit.id,
      abilityId: risingNest ? "veteran-phoenix-rising-nest" : "veteran-phoenix-nest",
    });
}

/** Only call for voluntary movement; spell teleports, returns and knockback do not break links. */
export function elementalMovement(
  state: GameState,
  unit: CombatUnitState,
  hooks: ElementalHooks,
): void {
  const combat = state.combat;
  if (!combat || !alive(unit)) return;
  for (const link of [...(combat.elementalLinks ?? [])]) {
    if (
      link.round !== combat.round ||
      (link.left !== unit.id && link.right !== unit.id)
    )
      continue;
    const other = combat.units[link.left === unit.id ? link.right : link.left];
    if (!other || !alive(other) || isAdjacent(unit.position, other.position))
      continue;
    combat.elementalLinks = combat.elementalLinks!.filter((l) => l !== link);
    const source = combat.units[link.source];
    if (source) {
      // The linking unit's own rank ability sets the jolt size: the Conflux
      // Storm Elemental's R4 (`veteran-storm-link-2`) hits for 2, every other
      // Lightning Link carrier for 1.
      const linkAbility = getUnitAbilityDefinitions(source).find(
        (a) =>
          a.effect?.type === "ELEMENTAL_VETERANCY" &&
          a.effect.mechanic === "link",
      );
      hooks.damage(
        state,
        source,
        unit.id,
        linkAbility?.id ?? "veteran-storm-link",
        linkAbility?.name ?? "Lightning Link",
        linkAbility?.id === "veteran-storm-link-2" ? 2 : 1,
      );
    }
  }
  if (unit.elementalVeterancy) unit.elementalVeterancy.solidifyCanMove = false;
  if (alive(unit) && elementalVeterancy(unit, "landing"))
    queueElementalChoice(state, {
      kind: "damage",
      unitId: unit.id,
      abilityId: "veteran-sprite-landing",
      amount: 1,
      adjacent: true,
    });
}

export function elementalAfterAttack(
  state: GameState,
  unit: CombatUnitState,
  target: CombatUnitState,
  damage: number,
): void {
  if (!state.combat || !alive(unit)) return;
  if (elementalVeterancy(unit, "activated-target") && target.activatedThisRound)
    queueElementalChoice(state, {
      kind: "damage",
      unitId: unit.id,
      abilityId: "veteran-arcane-echo",
      amount: 2,
    });
  if (
    elementalVeterancy(unit, "link") &&
    damage > 0 &&
    !isAdjacent(unit.position, target.position) &&
    !unit.elementalVeterancy?.linkUsed &&
    alive(target)
  ) {
    queueElementalChoice(state, {
      kind: "link",
      unitId: unit.id,
      targetId: target.id,
      abilityId:
        getUnitAbilityDefinitions(unit).find(
          (a) =>
            a.effect?.type === "ELEMENTAL_VETERANCY" &&
            a.effect.mechanic === "link",
        )?.id ?? "veteran-storm-link",
    });
  }
  if (
    unit.elementalVeterancy?.solidifyUntilRound !== undefined &&
    state.combat.round >= unit.elementalVeterancy.solidifyUntilRound
  ) {
    unit.elementalVeterancy.solidifyUntilRound = undefined;
    unit.elementalVeterancy.solidifyCanMove = true;
    unit.movedThisActivation = false;
  }
}

export function elementalFinishActivation(
  state: GameState,
  unit: CombatUnitState,
): void {
  if (
    alive(unit) &&
    elementalVeterancy(unit, "solidify") &&
    !unit.elementalVeterancy?.solidifyUsed &&
    unit.elementalVeterancy?.solidifyOfferedRound !== state.combat?.round
  ) {
    (unit.elementalVeterancy ??= {}).solidifyOfferedRound = state.combat!.round;
    queueElementalChoice(state, {
      kind: "solidify",
      unitId: unit.id,
      abilityId: "veteran-magma-solidify",
    });
  }
}

export function openElementalChoice(
  state: GameState,
  hooks: ElementalHooks,
): boolean {
  const combat = state.combat;
  if (
    !combat ||
    combat.outcome ||
    state.pendingChoice ||
    state.reactionWindow ||
    state.stack.length
  )
    return false;
  while (combat.elementalChoices?.length) {
    const request = combat.elementalChoices.shift()!;
    const unit = combat.units[request.unitId];
    if (!unit || !alive(unit)) continue;
    if (request.kind === "town-bolt") {
      const target = combat.units[request.targetId!];
      if (target && alive(target) && hooks.townBolt?.(state, unit, target)) return true;
      if (combat.outcome) return false;
      continue;
    }
    if (request.valuablesCost && (unit.controllerId === NEUTRAL_PLAYER_ID || (state.players[unit.controllerId]?.resources.valuables ?? 0) < request.valuablesCost)) continue;
    if (request.runeCost && (combat.runes?.[unit.controllerId]?.count ?? 0) < request.runeCost) continue;
    const picks: NonNullable<
      Extract<
        NonNullable<GameState["pendingChoice"]>,
        { type: "OPTION_CHOICE" }
      >["elementalChoice"]
    >["picks"] = [];
    const labels: string[] = [];
    const empty = Array.from(
      { length: BATTLEFIELD_CELL_COUNT },
      (_, i) => i,
    ).filter(
      (p) =>
        !(combat.obstacles ?? []).includes(p) &&
        !(combat.battlefieldTokens ?? []).some((t) => t.position === p) &&
        !combat.siege?.walls.includes(p) &&
        combat.siege?.gatePosition !== p &&
        !Object.values(combat.units).some((t) => alive(t) && t.position === p),
    );
    if (request.kind === "break-cover" || request.kind === "blood-price") {
      const target = combat.units[request.targetId!];
      if (!target || !alive(target) || isUnitDamageImmune(target) || target.controllerId === unit.controllerId || unit.customVeterancyRounds?.[request.kind] !== undefined) continue;
      if (request.kind === "break-cover") {
        for (const obstacle of breakCoverTargets(state, target, request.abilityId === "ctv-mountain-break")) {
          const kind = combat.siege?.gatePosition === obstacle ? "gate" : combat.siege?.walls.includes(obstacle) ? "wall" : "obstacle";
          picks.push({ obstacle }); labels.push(`Destroy ${kind} at ${getBattlefieldLabel(obstacle)}; deal 1 damage to ${target.cardName}`);
        }
      } else if (unit.maxHealth - unit.damage >= 2) {
        picks.push({ targetId: target.id }); labels.push(`Pay 1 HP; deal 2 damage to ${target.cardName}`);
      }
    } else if (request.kind === "return-fire") {
      picks.push({ targetId: request.targetId }); labels.push("Retaliate");
    } else if (request.kind === "town-recover") {
      const cards = balanceCardLibrary(state, cardLibrary);
      for (const cardId of state.players[unit.controllerId]?.discard ?? []) {
        if (request.abilityId === "town-gremlin-recover" && cards[cardId]?.kind !== "spell") continue;
        picks.push({ targetId: cardId }); labels.push(cards[cardId]?.name ?? cardId);
      }
    } else if (request.kind === "town-buff") {
      for (const target of Object.values(combat.units)) if (alive(target)) { picks.push({ targetId: target.id }); labels.push(target.cardName); }
    } else if (request.kind === "move-one") {
      if (townBound(state, unit) || neutralTownDeepRooted(state, unit)) continue;
      for (const position of empty.filter(p => isAdjacent(p, unit.position))) {
        picks.push({ position }); labels.push(`Move to ${getBattlefieldLabel(position)}`);
      }
    } else if (request.kind === "move-ally-one") {
      for (const target of Object.values(combat.units)) {
        if (!alive(target) || target.id === unit.id || target.controllerId !== unit.controllerId || townBound(state, target) || neutralTownDeepRooted(state, target)) continue;
        if (request.adjacent && !isAdjacent(unit.position, target.position)) continue;
        if (request.engagedOnly && !Object.values(combat.units).some(e => alive(e) && e.controllerId !== target.controllerId && isAdjacent(e.position, target.position))) continue;
        for (const position of empty.filter(p => isAdjacent(p, target.position))) {
          picks.push({ targetId: target.id, position });
          labels.push(`Move ${target.cardName} to ${getBattlefieldLabel(position)}`);
        }
      }
    } else if (request.kind === "return-origin") {
      if (townBound(state, unit) || neutralTownDeepRooted(state, unit)) continue;
      if (request.position !== undefined && empty.includes(request.position)) {
        picks.push({ position: request.position }); labels.push(`Return to ${getBattlefieldLabel(request.position)}`);
      }
    } else if (request.kind === "heal") {
      for (const target of Object.values(combat.units)) {
        if (!alive(target) || target.damage <= 0 || (request.alliesOnly && target.controllerId !== unit.controllerId)) continue;
        if (request.adjacent && !isAdjacent(unit.position, target.position)) continue;
        if (request.adjacentOrSelf && target.id !== unit.id && !isAdjacent(unit.position, target.position)) continue;
        picks.push({ targetId: target.id }); labels.push(target.cardName);
      }
    } else if (request.kind === "veteran-teleport") {
      if (townBound(state, unit) || neutralTownDeepRooted(state, unit)) continue;
      for (const position of empty) {
        picks.push({ position });
        labels.push(`Teleport to ${getBattlefieldLabel(position)}`);
      }
    } else if (request.kind === "veteran-cleave") {
      const anchor = combat.units[request.targetId!];
      if (anchor) for (const target of Object.values(combat.units)) {
        if (alive(target) && target.id !== anchor.id && target.id !== unit.id && isAdjacent(anchor.position, target.position)) {
          picks.push({ targetId: target.id });
          labels.push(target.cardName);
        }
      }
    } else if (request.kind === "veteran-tribute") {
      const enemyId = unit.controllerId === combat.attackerPlayerId ? combat.defenderPlayerId : combat.attackerPlayerId;
      const cards = balanceCardLibrary(state, cardLibrary);
      for (const cardId of state.players[enemyId]?.hand ?? []) {
        if ((cards[cardId]?.power ?? 0) > 0) {
          picks.push({ targetId: cardId });
          labels.push(`Discard ${cards[cardId].name}`);
        }
      }
      picks.push({});
      labels.push("Take 1 damage on a random unit");
    } else if (request.kind === "copy") {
      for (const option of hooks.targets(state, unit, request.cardId!)) {
        const target = option.target;
        picks.push(option);
        labels.push(
          option.label ??
            (target?.type === "unit"
              ? (combat.units[target.unitId]?.cardName ?? target.unitId)
              : JSON.stringify(target)),
        );
      }
    } else if (request.kind === "dispel") {
      picks.push({});
      labels.push("Attack with −2 Attack and remove one ongoing effect");
    } else if (request.kind === "heal-self") {
      if (unit.damage > 0) {
        picks.push({ targetId: unit.id });
        labels.push(`Heal ${request.amount ?? 1} HP`);
      }
    } else if (
      request.kind === "damage" ||
      request.kind === "chain-lightning" ||
      request.kind === "blind-dust" ||
      request.kind === "troll-snare" ||
      request.kind === "link" ||
      request.kind === "copy-bolt"
    ) {
      const anchor = request.kind === "link" ? combat.units[request.targetId!] : request.anchorId ? combat.units[request.anchorId] : unit;
      const candidates =
          request.abilityId === "veteran-arcane-echo" ||
          request.abilityId === "veteran-cyber-splash" ||
          request.abilityId === "town-jotunn-rune-bolt" ||
          request.abilityId === "town-dragon-fly-landing"
          ? [
              ...enemies(state, unit),
              ...Object.values(combat.units).filter(
                (t) => alive(t) && t.controllerId === unit.controllerId,
              ),
            ]
          : enemies(state, unit);
      // Splash keeps the struck space as its anchor even when the hit was lethal.
      if (anchor && (request.anchorId !== undefined || alive(anchor)))
        for (const target of candidates) {
          if (request.kind === "link" && target.id === anchor.id) continue;
          if (request.excludeTargetId && target.id === request.excludeTargetId) continue;
          if (request.enemiesOnly && target.controllerId === unit.controllerId) continue;
          if (request.alliesOnly && target.controllerId !== unit.controllerId) continue;
          if (
            (request.adjacent || request.kind === "link") &&
            !isAdjacent(anchor.position, target.position)
          )
            continue;
          if (request.runeScaling) {
            // Jotunn Rune Bolt: 1 Rune → 1 damage, or (if affordable) 2 Runes → 2 damage.
            picks.push({ targetId: target.id, amount: 1, runeCost: 1 });
            labels.push(`${target.cardName} — 1 damage (1 Rune)`);
            if ((combat.runes?.[unit.controllerId]?.count ?? 0) >= 2) {
              picks.push({ targetId: target.id, amount: 2, runeCost: 2 });
              labels.push(`${target.cardName} — 2 damage (2 Runes)`);
            }
          } else {
            picks.push({ targetId: target.id });
            labels.push(target.cardName);
          }
        }
    } else if (request.kind === "debuff-attack") {
      for (const target of enemies(state, unit)) if ((!request.adjacent || isAdjacent(unit.position, target.position))) {
        picks.push({ targetId: target.id }); labels.push(target.cardName);
      }
    } else if (request.kind === "obstacle") {
      for (const obstacle of combat.obstacles ?? [])
        for (const position of empty) {
          picks.push({ obstacle, position });
          labels.push(
            `Move ${getBattlefieldLabel(obstacle)} obstacle to ${getBattlefieldLabel(position)}`,
          );
        }
    } else if (request.kind === "nest") {
      for (const position of empty.filter((p) =>
        isAdjacent(p, unit.position),
      )) {
        picks.push({ position });
        labels.push(`Nest at ${getBattlefieldLabel(position)}`);
      }
    } else if (!unit.elementalVeterancy?.solidifyUsed) {
      picks.push({});
      labels.push(
        "Solidify: immobilize next round and reduce damage by 1 until attacking",
      );
    }
    if (!picks.length) continue;
    if (request.optional || (request.kind !== "damage" && request.kind !== "nest" && request.kind !== "blind-dust" && request.kind !== "veteran-cleave" && request.kind !== "veteran-tribute" && request.kind !== "town-recover")) {
      picks.push({ skip: true });
      labels.push("Skip");
    }
    const chooser = request.kind === "veteran-tribute"
      ? (unit.controllerId === combat.attackerPlayerId ? combat.defenderPlayerId : combat.attackerPlayerId)
      : hooks.chooser(state, combat, unit);
    if (!chooser || chooser === NEUTRAL_PLAYER_ID) {
      executeElementalPick(state, request, picks[0], hooks);
      // An automatic damage pick can end combat. Do not open another queued
      // choice after that; the attack caller will stop its continuation.
      if (combat.outcome) return false;
      if (state.pendingChoice || state.stack.length || state.reactionWindow)
        return true;
      continue;
    }
    state.pendingChoice = {
      id: `choice_${nextEventNumber(state)}`,
      type: "OPTION_CHOICE",
      playerId: chooser,
      prompt: `${unit.cardName}: ${unitAbilities[request.abilityId]?.name ?? request.kind}${request.kind === "damage" && !request.runeScaling ? ` — choose a target for ${request.amount} damage` : ""}${request.kind === "damage" && request.runeScaling ? " — choose a target and Rune amount" : ""}${request.valuablesCost ? ` (spend ${request.valuablesCost} Valuables)` : ""}${request.runeCost && !request.runeScaling ? ` (spend ${request.runeCost} Rune)` : ""}`,
      options: labels.map((label) => ({ label })),
      context: "elemental-veterancy",
      elementalChoice: { request, picks },
      returnPhase: "combat",
    };
    state.phase = "choice";
    state.priorityPlayerId = chooser;
    return true;
  }
  return false;
}

function executeElementalPick(
  state: GameState,
  request: Request,
  pick: {
    targetId?: string;
    position?: number;
    obstacle?: number;
    skip?: boolean;
    target?: TargetRef;
    optionIndex?: number;
    saveEcho?: boolean;
    amount?: number;
    runeCost?: number;
  },
  hooks: ElementalHooks,
): void {
  const combat = state.combat!;
  const unit = combat.units[request.unitId];
  if (!unit || !alive(unit)) return;
  if (request.kind === "dispel") {
    hooks.dispelAttack(state, request.attack!, !pick.skip);
    return;
  }
  if (request.kind === "return-fire") {
    hooks.returnFire?.(state, unit, request.targetId!, !pick.skip);
    return;
  }
  if (pick.skip) return;
  if (request.kind === "break-cover" || request.kind === "blood-price") {
    const target = combat.units[request.targetId!];
    if (!target || !alive(target) || isUnitDamageImmune(target) || target.controllerId === unit.controllerId || unit.customVeterancyRounds?.[request.kind] !== undefined || !getUnitAbilityDefinitions(unit).some(a => a.id === request.abilityId)) throw new Error("That combat ability is no longer available.");
    if (request.kind === "break-cover") {
      if (pick.obstacle === undefined || !breakCoverTargets(state, target, request.abilityId === "ctv-mountain-break").includes(pick.obstacle)) throw new Error("Choose eligible cover adjacent to the enemy.");
      if (combat.siege?.walls.includes(pick.obstacle) || combat.siege?.gatePosition === pick.obstacle) destroyFortification(state, unit, combat.siege.gatePosition === pick.obstacle ? "gate" : "wall", pick.obstacle);
      combat.obstacles = (combat.obstacles ?? []).filter(p => p !== pick.obstacle);
    } else {
      if (unit.maxHealth - unit.damage < 2) throw new Error("Blood Price requires at least 2 remaining HP.");
      unit.damage += 1;
      const cost = appendEvent(state, { type: "DAMAGE_ASSIGNED", source: { type: "unit", unitId: unit.id, controllerId: unit.controllerId }, target: { type: "unit", unitId: unit.id }, amount: 1, damageKind: "effect" });
      noteUnitDamagedForTokens(state, unit, cost.amount);
    }
    (unit.customVeterancyRounds ??= {})[request.kind] = combat.round;
    hooks.damage(state, unit, target.id, request.abilityId, unitAbilities[request.abilityId]!.name, request.kind === "break-cover" ? 1 : 2);
    return;
  }
  if ((request.kind === "move-one" || request.kind === "return-origin" || request.kind === "veteran-teleport") && townBound(state, unit)) throw new Error("This unit is bound and cannot move.");
  if ((request.kind === "veteran-teleport" || request.kind === "move-one" || request.kind === "return-origin") && neutralTownDeepRooted(state, unit)) throw new Error("Deep Roots prevents bonus movement and teleportation.");
  const runeScaled = request.runeScaling
    ? (pick.amount === 1 && pick.runeCost === 1) ||
      (pick.amount === 2 && pick.runeCost === 2)
    : false;
  if (request.runeScaling && !runeScaled) {
    throw new Error("Choose a listed Rune Bolt amount.");
  }
  const runeCost = request.runeScaling ? pick.runeCost : request.runeCost;
  if (runeCost && !spendRunes(state, unit.controllerId, runeCost)) {
    throw new Error(`That ability needs ${runeCost} Rune${runeCost === 1 ? "" : "s"}.`);
  }
  if (request.kind === "town-recover") {
    const owner = state.players[unit.controllerId];
    const cardId = pick.targetId!;
    const index = owner?.discard.indexOf(cardId) ?? -1;
    if (!owner || index < 0 || (request.abilityId === "town-gremlin-recover" && balanceCardLibrary(state, cardLibrary)[cardId]?.kind !== "spell")) throw new Error("Choose an eligible card from your discard pile.");
    owner.discard.splice(index, 1); owner.hand.push(cardId);
    veteranTrigger(state, unit, request.abilityId);
    return;
  }
  if (request.kind === "town-buff") {
    const target = combat.units[pick.targetId!];
    if (!target || !alive(target)) throw new Error("Choose a living unit.");
    const memory = (target.townVeterancy ??= {}); memory.attack = (memory.attack ?? 0) + 1;
    veteranTrigger(state, unit, request.abilityId, target);
    return;
  }
  if (request.kind === "move-one" || request.kind === "return-origin") {
    const position = pick.position!;
    const blocked = !Number.isInteger(position) || position < 0 || position >= BATTLEFIELD_CELL_COUNT ||
      (request.kind === "move-one" && !isAdjacent(unit.position, position)) ||
      (request.kind === "return-origin" && position !== request.position) ||
      (combat.obstacles ?? []).includes(position) || (combat.battlefieldTokens ?? []).some(t => t.position === position) ||
      Boolean(combat.siege?.walls.includes(position)) || combat.siege?.gatePosition === position ||
      Object.values(combat.units).some(t => alive(t) && t.position === position);
    if (blocked) throw new Error("That movement space is not available.");
    const from = unit.position; unit.position = position;
    veteranTrigger(state, unit, request.abilityId);
    appendEvent(state, { type: "UNIT_MOVED", playerId: unit.controllerId, unitId: unit.id, from, to: position });
    return;
  }
  if (request.kind === "move-ally-one") {
    const target = combat.units[pick.targetId!];
    const position = pick.position!;
    const blocked = !target || !alive(target) || target.id === unit.id || target.controllerId !== unit.controllerId || townBound(state, target) || neutralTownDeepRooted(state, target) ||
      (request.adjacent && !isAdjacent(unit.position, target.position)) ||
      (request.engagedOnly && !Object.values(combat.units).some(e => alive(e) && e.controllerId !== target.controllerId && isAdjacent(e.position, target.position))) ||
      !Number.isInteger(position) || position < 0 || position >= BATTLEFIELD_CELL_COUNT || !isAdjacent(target.position, position) ||
      (combat.obstacles ?? []).includes(position) || (combat.battlefieldTokens ?? []).some(t => t.position === position) ||
      Boolean(combat.siege?.walls.includes(position)) || combat.siege?.gatePosition === position ||
      Object.values(combat.units).some(t => alive(t) && t.position === position);
    if (blocked) throw new Error("Choose an allied unit and an adjacent empty space.");
    const from = target.position; target.position = position;
    veteranTrigger(state, unit, request.abilityId === "ntv-victory-command" ? "ntv-victory-command-move" : request.abilityId, target);
    appendEvent(state, { type: "UNIT_MOVED", playerId: target.controllerId, unitId: target.id, from, to: position });
    return;
  }
  if (request.kind === "heal") {
    const target = combat.units[pick.targetId!];
    if (!target || !alive(target) || target.damage <= 0 || target.controllerId !== unit.controllerId ||
      (request.adjacent && !isAdjacent(unit.position, target.position)) ||
      (request.adjacentOrSelf && target.id !== unit.id && !isAdjacent(unit.position, target.position))) throw new Error("Choose a damaged allied unit in range.");
    veteranHeal(state, target, request.amount ?? 1, request.abilityId, unit); return;
  }
  if (request.kind === "debuff-attack") {
    const target = combat.units[pick.targetId!];
    if (!target || !alive(target) || target.controllerId === unit.controllerId || request.adjacent && !isAdjacent(unit.position, target.position)) throw new Error("Choose an eligible enemy.");
    applyNeutralDebuff(state, unit, target, request.abilityId, unitAbilities[request.abilityId]?.name ?? "Disoriented", { type: "ATTACK_BONUS", amount: -(request.amount ?? 1) }); return;
  }
  if (request.kind === "veteran-teleport") {
    const position = pick.position!;
    if (position < 0 || position >= BATTLEFIELD_CELL_COUNT || (combat.obstacles ?? []).includes(position) ||
        combat.siege?.walls.includes(position) || combat.siege?.gatePosition === position ||
        (combat.battlefieldTokens ?? []).some(t => t.position === position) ||
        Object.values(combat.units).some(t => alive(t) && t.position === position)) throw new Error("That teleport space is occupied.");
    const from = unit.position;
    unit.position = position;
    veteranTrigger(state, unit, request.abilityId);
    appendEvent(state, { type: "UNIT_MOVED", playerId: unit.controllerId, unitId: unit.id, from, to: position });
    return;
  }
  if (request.kind === "veteran-cleave") {
    const target = combat.units[pick.targetId!];
    const anchor = combat.units[request.targetId!];
    if (!target || !anchor || !alive(target) || target.id === unit.id || target.id === anchor.id || !isAdjacent(anchor.position, target.position)) throw new Error("Choose a unit adjacent to the attack target.");
    veteranDamage(state, unit, target, 1, request.abilityId);
    return;
  }
  if (request.kind === "veteran-tribute") {
    const enemyId = unit.controllerId === combat.attackerPlayerId ? combat.defenderPlayerId : combat.attackerPlayerId;
    const enemy = state.players[enemyId];
    if (pick.targetId) {
      const index = enemy?.hand.indexOf(pick.targetId) ?? -1;
      if (!enemy || index < 0 || (balanceCardLibrary(state, cardLibrary)[pick.targetId]?.power ?? 0) <= 0) throw new Error("Choose a card with Power in your hand.");
      enemy.hand.splice(index, 1);
      enemy.discard.push(pick.targetId);
      veteranTrigger(state, unit, request.abilityId, unit, "Blood Tribute: the enemy discards a card with Power.");
    } else {
      const target = veteranRandom(state, Object.values(combat.units).filter(t => alive(t) && t.controllerId === enemyId), unit.id + "-tribute");
      if (target) veteranDamage(state, unit, target, 1, request.abilityId);
    }
    return;
  }
  if (request.valuablesCost) {
    const player = state.players[unit.controllerId];
    const target = combat.units[pick.targetId!];
    if (unit.controllerId === NEUTRAL_PLAYER_ID || !player || player.resources.valuables < request.valuablesCost || !target || !alive(target) || target.controllerId === unit.controllerId) return;
    player.resources.valuables -= request.valuablesCost;
  }
  if (request.kind === "blind-dust" || request.kind === "troll-snare") {
    const target = combat.units[pick.targetId!];
    if (target && alive(target) && target.controllerId !== unit.controllerId) applyNeutralDebuff(state, unit, target, request.abilityId,
      request.kind === "blind-dust" ? "Blind Dust" : "Crippling Snare",
      request.kind === "blind-dust" ? { type: "NEUTRAL_BLIND_DUST" } : { type: "NEUTRAL_MOVE_LIMIT", amount: 1 });
    return;
  }
  if (request.kind === "copy") {
    if (pick.saveEcho)
      ((unit.elementalVeterancy ??= {}).echoSpells ??= []).push(
        request.cardId!,
      );
    else
      hooks.copy(state, unit, request.cardId!, pick.target!, pick.optionIndex);
    return;
  }
  if (request.kind === "copy-bolt") {
    hooks.copyBolt(
      state,
      unit,
      pick.targetId!,
      request.abilityId,
      request.runeScaling ? pick.amount! : request.amount!,
    );
    return;
  }
  if (request.kind === "chain-lightning") {
    const target = combat.units[pick.targetId!];
    if (target && alive(target) && target.controllerId !== unit.controllerId)
      hooks.chainLightning?.(state, unit, target);
    return;
  }
  if (request.kind === "heal-self") {
    veteranHeal(state, unit, request.amount ?? 1, request.abilityId);
  } else if (request.kind === "damage")
    hooks.damage(
      state,
      unit,
      pick.targetId!,
      request.abilityId,
      unitAbilities[request.abilityId]?.name ?? "Elemental ability",
      request.amount!,
    );
  else if (request.kind === "solidify") {
    Object.assign((unit.elementalVeterancy ??= {}), {
      solidifyUsed: true,
      solidifyUntilRound: combat.round + 1,
    });
  } else if (request.kind === "link") {
    (unit.elementalVeterancy ??= {}).linkUsed = true;
    (combat.elementalLinks ??= []).push({
      left: request.targetId!,
      right: pick.targetId!,
      source: unit.id,
      round: combat.round,
    });
  } else if (request.kind === "obstacle") {
    combat.obstacles = (combat.obstacles ?? []).map((p) =>
      p === pick.obstacle ? pick.position! : p,
    );
  } else if (request.kind === "nest") {
    const id = `phoenix_nest_${nextEventNumber(state)}`;
    combat.units[id] = {
      id,
      controllerId: unit.controllerId,
      name: "Phoenix Nest",
      cardName: "Phoenix Nest",
      variant: "neutral",
      grade: "bronze",
      type: "ground",
      attack: 0,
      defense: 0,
      maxHealth: 1,
      damage: 0,
      initiative: 0,
      position: pick.position!,
      abilities: [],
      activatedThisRound: true,
      movedThisActivation: true,
      summoned: true,
      retaliatedThisRound: false,
      defenseToken: false,
      assets: { cardImage: "/game-tokens/phoenix-nest.webp" },
      elementalVeterancy: { nestOwnerId: unit.id, nestRound: combat.round },
    };
  }
  if (request.kind !== "damage")
    appendEvent(state, {
      type: "UNIT_ABILITY_TRIGGERED",
      unitId: unit.id,
      targetUnitId: pick.targetId ?? unit.id,
      abilityId: request.abilityId,
      message: `${unit.cardName} uses ${request.kind}.`,
    });
}

export function resolveElementalChoice(
  state: GameState,
  action: Extract<GameAction, { type: "CHOOSE_OPTION" }>,
  hooks: ElementalHooks,
): void {
  const choice = state.pendingChoice;
  if (
    choice?.type !== "OPTION_CHOICE" ||
    choice.context !== "elemental-veterancy" ||
    !choice.elementalChoice ||
    choice.id !== action.choiceId ||
    choice.playerId !== action.playerId
  )
    throw new Error("That elemental choice is not available.");
  const pick = choice.elementalChoice.picks[action.optionIndex];
  if (!pick) throw new Error("Choose a listed elemental option.");
  state.pendingChoice = null;
  state.phase = "combat";
  state.priorityPlayerId = null;
  executeElementalPick(state, choice.elementalChoice.request, pick, hooks);
}

/** Read through suppression and cancellation gates, including copied rank abilities. */
export function elementalVeterancy(
  unit: CombatUnitState,
  mechanic: ElementalVeterancyMechanic,
): boolean {
  return getUnitAbilityDefinitions(unit).some(
    (a) =>
      a.implementationStatus === "implemented" &&
      a.effect?.type === "ELEMENTAL_VETERANCY" &&
      a.effect.mechanic === mechanic,
  );
}

export function elementalAttackBonus(
  state: GameState,
  attacker: CombatUnitState,
  defender: CombatUnitState,
  retaliation: boolean,
): number {
  let bonus = getUnitAbilityDefinitions(attacker).some(a => ["veteran-phoenix-rising-nest", "veteran-phoenix-rising-nest-heal"].includes(a.id)) ? Math.min(2, attacker.elementalVeterancy?.nestAttackBonus ?? 0) : 0;
  if (retaliation) return bonus;
  if (
    elementalVeterancy(attacker, "distant-attack") &&
    !isAdjacent(attacker.position, defender.position)
  )
    bonus++;
  if (
    elementalVeterancy(attacker, "faster-target") &&
    effectiveInitiative(
      defender,
      state.activeEffects,
      state.combat ?? undefined,
    ) >
      effectiveInitiative(
        attacker,
        state.activeEffects,
        state.combat ?? undefined,
      )
  )
    bonus++;
  return bonus;
}

/** All-source accumulated damage ceiling; healing can reopen the four-damage budget. */
export function elementalDamageCeiling(
  unit: CombatUnitState,
  incoming: number,
): number {
  if (!elementalVeterancy(unit, "earth-shield")) return incoming;
  return Math.min(incoming, Math.max(0, 4 - unit.damage));
}
