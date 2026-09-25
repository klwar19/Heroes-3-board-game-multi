import { townSpellCast, townBound } from "./town-veterancy";
import { neutralTownSpellCast, neutralTownDeepRooted } from "./neutral-town-veterancy";
import { getUnitAbilityDefinitions, isUnitDamageImmune } from "./unit-abilities";
import { factionVeterancy } from "./unit-abilities";
import { veteranHeal, veteranRandom, veteranDamage, veteranTrigger } from "./faction-veterancy";
import {
  isAdjacent,
  combatGeometry,
  getBattlefieldLabel,
  getBattlefieldDistance,
  getBattlefieldPositions,
  getOrthogonalNeighbors,
  hexTranslate,
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
import { effectiveInitiative, makeActiveEffect } from "./active-effects";
import { appendEvent, nextEventNumber } from "./events";
import { applyNeutralDebuff } from "./neutral-veterancy";
import { availableRunes, spendRunes } from "./runes";
import { noteUnitDamagedForTokens } from "./tokens";
import {
  battlefieldTokenCovers,
  footprintAt,
  unitAdjacentToCell,
  unitOccupiesCell,
  unitsAdjacent,
  unitTailOffset,
} from "./hex-footprint";
import { isHexSeaCell, movableObstacleCells } from "./hex-battlefield";
import {
  destroyFortification,
  defenderOnFortification,
  fortificationKindAt,
  intactFortificationPositions,
  isFortificationPosition,
} from "./siege";

/** Whether `position` is a space of this combat's board (4×5 or hex). */
function onCombatBoard(combat: CombatState, position: number): boolean {
  return getBattlefieldPositions(combatGeometry(combat)).includes(position);
}

/**
 * Whether `mover` may land with its head on `position`: a space of this board
 * with no obstacle, spell token, fortification or other living unit. A
 * double-wide mover (hex board) needs its whole footprint free, its own hexes
 * excepted. Grid / one-hex: exactly the single-space test.
 */
function elementalLandingFree(combat: CombatState, mover: CombatUnitState, position: number): boolean {
  const cells = footprintAt(combat, mover, position);
  if (!cells) return false;
  const wide = cells.length > 1;
  if (wide && position === mover.position) return false;
  return cells.every((cell) =>
    onCombatBoard(combat, cell) &&
    !(combat.obstacles ?? []).includes(cell) &&
    !(combat.battlefieldTokens ?? []).some((t) => battlefieldTokenCovers(t, cell)) &&
    !isFortificationPosition(combat.siege, cell) &&
    !Object.values(combat.units).some((t) => alive(t) && (!wide || t.id !== mover.id) && unitOccupiesCell(combat, t, cell))
  );
}

/** Tank Counterdrive walks at most two open steps; its landing cannot jump over a unit. */
function tankCounterdriveReachable(combat: CombatState, tank: CombatUnitState, position: number): boolean {
  return getOrthogonalNeighbors(tank.position).some(first =>
    elementalLandingFree(combat, tank, first) &&
    (first === position || getOrthogonalNeighbors(first).includes(position) && elementalLandingFree(combat, tank, position)));
}

type Request = NonNullable<CombatState["elementalChoices"]>[number];
export function breakCoverTargets(state: GameState, target: CombatUnitState, includeFortifications: boolean): number[] {
  const combat = state.combat;
  if (!combat) return [];
  const siege = combat.siege;
  // A hex ship battle's sea hexes are the water, not cover to break.
  const positions = [...movableObstacleCells(combat)];
  if (includeFortifications && siege) {
    positions.push(...intactFortificationPositions(siege));
  }
  return [...new Set(positions)].filter(p => unitAdjacentToCell(combat, target, p) && !(combat.battlefieldTokens ?? []).some(t => battlefieldTokenCovers(t, p)) &&
    (includeFortifications ? !siege || !defenderOnFortification(combat, siege, p) : !isFortificationPosition(siege, p)));
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
  // Scorch belongs to the start of the Phoenix's activation. Queue it before
  // Rising Nest moves the Phoenix so its legal targets, event, FX and sound all
  // come from the square where the activation actually began.
  if (elementalVeterancy(unit, "activation-burn"))
    queueElementalChoice(state, {
      kind: "damage",
      unitId: unit.id,
      abilityId: "veteran-phoenix-activation",
      amount: 1,
      adjacent: true,
    });
  for (const nest of Object.values(combat.units)) {
    if (
      nest.elementalVeterancy?.nestOwnerId !== unit.id ||
      !alive(nest) ||
      (nest.elementalVeterancy.nestRound ?? combat.round) >= combat.round
    )
      continue;
    if (!elementalVeterancy(unit, "nest")) continue;
    if (risingNest && (townBound(state, unit) || neutralTownDeepRooted(state, unit))) {
      nest.damage = nest.maxHealth;
      continue;
    }
    queueElementalChoice(state, {
      kind: "nest-return",
      unitId: unit.id,
      abilityId: risingNest ? "veteran-phoenix-rising-nest-return" : "veteran-phoenix-nest-return",
      targetId: nest.id,
    });
  }
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
    if (!other || !alive(other) || unitsAdjacent(combat, unit, other))
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
    !unitsAdjacent(state.combat, unit, target) &&
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
    const postDetonationRepair = request.abilityId === "factory-automaton-detonation-repair";
    if (!unit || (!alive(unit) && !postDetonationRepair && request.kind !== "forge-death-burst" && request.abilityId !== "dace-minotaurs-pack-break" && request.abilityId !== "forge-vet-cyberbrute-shock")) continue;
    if (request.kind === "nest-return") {
      const nest = combat.units[request.targetId!];
      if (!nest || !alive(nest) || nest.elementalVeterancy?.nestOwnerId !== unit.id) continue;
      const risingNest = request.abilityId === "veteran-phoenix-rising-nest-return";
      if (risingNest && (townBound(state, unit) || neutralTownDeepRooted(state, unit))) {
        nest.damage = nest.maxHealth;
        continue;
      }
      const chooser = hooks.chooser(state, combat, unit);
      if (!chooser || chooser === NEUTRAL_PLAYER_ID) {
        executeElementalPick(state, request, { targetId: nest.id }, hooks);
        continue;
      }
      state.pendingChoice = {
        id: `choice_${nextEventNumber(state)}`,
        type: "OPTION_CHOICE",
        playerId: chooser,
        prompt: `${unit.cardName}: ${unitAbilities[request.abilityId]?.name ?? "Phoenix Nest"} — fly to the Nest?`,
        options: [{ label: `Fly to Nest at ${getBattlefieldLabel(nest.position)}` }, { label: "Stay here" }],
        context: "elemental-veterancy",
        elementalChoice: { request, picks: [{ targetId: nest.id }, { targetId: nest.id, skip: true }] },
        returnPhase: "combat",
      };
      state.phase = "choice";
      state.priorityPlayerId = chooser;
      return true;
    }
    if (request.kind === "town-bolt") {
      const target = combat.units[request.targetId!];
      if (target && alive(target) && hooks.townBolt?.(state, unit, target)) return true;
      if (combat.outcome) return false;
      continue;
    }
    if (request.valuablesCost && (unit.controllerId === NEUTRAL_PLAYER_ID || (state.players[unit.controllerId]?.resources.valuables ?? 0) < request.valuablesCost)) continue;
    if (request.runeCost && availableRunes(state, unit.controllerId) < request.runeCost) continue;
    const picks: NonNullable<
      Extract<
        NonNullable<GameState["pendingChoice"]>,
        { type: "OPTION_CHOICE" }
      >["elementalChoice"]
    >["picks"] = [];
    const labels: string[] = [];
    const empty = getBattlefieldPositions(combatGeometry(combat)).filter(
      (p) =>
        !(combat.obstacles ?? []).includes(p) &&
        !(combat.battlefieldTokens ?? []).some((t) => battlefieldTokenCovers(t, p)) &&
        !isFortificationPosition(combat.siege, p) &&
        !Object.values(combat.units).some((t) => alive(t) && unitOccupiesCell(combat, t, p)),
    );
    // Landing heads for a mover: a double-wide one (hex board) may put its head
    // on a hex its own tail covers now (elementalLandingFree checks the whole
    // footprint); a one-hex unit / the 4×5 grid keeps the empty spaces.
    const landingHeads = (mover: CombatUnitState): number[] =>
      unitTailOffset(combat, mover) !== 0 ? getBattlefieldPositions("hex") : empty;
    if (request.kind === "forge-grunt-tempo") {
      if (request.round !== combat.round) continue;
      for (const target of Object.values(combat.units).sort((a, b) =>
        Number(b.controllerId === unit.controllerId) - Number(a.controllerId === unit.controllerId) || a.id.localeCompare(b.id))) {
        if (!alive(target) || target.position < 0 || target.id === unit.id || !unitsAdjacent(combat, unit, target)) continue;
        picks.push({ targetId: target.id });
        labels.push(`Give ${target.cardName} +1 Initiative this round`);
      }
    } else if (request.kind === "forge-jump-round") {
      if (request.round !== combat.round || (request.amount !== -1 && request.amount !== 1)) continue;
      for (const target of Object.values(combat.units)) {
        if (!alive(target) || target.position < 0 || target.id === unit.id) continue;
        if (request.amount === -1 && target.controllerId === unit.controllerId) continue;
        if (request.amount === 1 && target.controllerId !== unit.controllerId) continue;
        picks.push({ targetId: target.id });
        labels.push(`${target.cardName}: ${request.amount === -1 ? "-1 Defense" : "+6 Initiative"} this round`);
      }
    } else if (request.kind === "forge-death-burst") {
      for (const target of Object.values(combat.units)) {
        if (!alive(target) || target.controllerId === unit.controllerId || request.excludedTargetIds?.includes(target.id)) continue;
        picks.push({ targetId: target.id }); labels.push(target.cardName);
      }
    } else if (request.kind === "break-cover" || request.kind === "blood-price") {
      const target = combat.units[request.targetId!];
      if (!target || !alive(target) || isUnitDamageImmune(target) || target.controllerId === unit.controllerId || unit.customVeterancyRounds?.[request.kind] !== undefined) continue;
      if (request.kind === "break-cover") {
        for (const obstacle of breakCoverTargets(state, target, request.abilityId === "ctv-mountain-break")) {
          const kind = fortificationKindAt(combat.siege, obstacle) ?? "obstacle";
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
    } else if (request.kind === "engineer-buff") {
      for (const target of Object.values(combat.units)) {
        if (alive(target) && target.id !== unit.id && target.controllerId === unit.controllerId && unitsAdjacent(combat, unit, target)) {
          picks.push({ targetId: target.id }); labels.push(`${target.cardName}: +1 Attack on its next attack`);
        }
      }
    } else if (request.kind === "move-one") {
      if (townBound(state, unit) || neutralTownDeepRooted(state, unit)) continue;
      const maxDistance = request.maxDistance ?? 1;
      for (const position of landingHeads(unit).filter(p => getBattlefieldDistance(p, unit.position) <= maxDistance && elementalLandingFree(combat, unit, p) &&
        (request.abilityId !== "forge-vet-tank-reposition" || tankCounterdriveReachable(combat, unit, p)))) {
        picks.push({ position }); labels.push(`Move to ${getBattlefieldLabel(position)}`);
      }
    } else if (request.kind === "move-ally-one") {
      for (const target of Object.values(combat.units)) {
        if (!alive(target) || target.id === unit.id || target.controllerId !== unit.controllerId || townBound(state, target) || neutralTownDeepRooted(state, target)) continue;
        if (request.adjacent && !unitsAdjacent(combat, unit, target)) continue;
        if (request.engagedOnly && !Object.values(combat.units).some(e => alive(e) && e.controllerId !== target.controllerId && unitsAdjacent(combat, e, target))) continue;
        for (const position of landingHeads(target).filter(p => isAdjacent(p, target.position) && elementalLandingFree(combat, target, p))) {
          picks.push({ targetId: target.id, position });
          labels.push(`Move ${target.cardName} to ${getBattlefieldLabel(position)}`);
        }
      }
    } else if (request.kind === "return-origin") {
      if (townBound(state, unit) || neutralTownDeepRooted(state, unit)) continue;
      if (request.position !== undefined && landingHeads(unit).includes(request.position) && elementalLandingFree(combat, unit, request.position)) {
        picks.push({ position: request.position }); labels.push(`Return to ${getBattlefieldLabel(request.position)}`);
      }
    } else if (request.kind === "heal") {
      for (const target of Object.values(combat.units)) {
        if (!alive(target) || target.damage <= 0 || (request.alliesOnly && target.controllerId !== unit.controllerId)) continue;
        if (request.adjacent && !unitsAdjacent(combat, unit, target)) continue;
        if (request.adjacentOrSelf && target.id !== unit.id && !unitsAdjacent(combat, unit, target)) continue;
        picks.push({ targetId: target.id }); labels.push(target.cardName);
      }
    } else if (request.kind === "veteran-teleport") {
      if (townBound(state, unit) || neutralTownDeepRooted(state, unit)) continue;
      for (const position of landingHeads(unit).filter(p => (request.maxDistance === undefined || getBattlefieldDistance(p, unit.position) <= request.maxDistance) && elementalLandingFree(combat, unit, p))) {
        picks.push({ position });
        labels.push(`Teleport to ${getBattlefieldLabel(position)}`);
      }
    } else if (request.kind === "veteran-cleave") {
      const anchor = combat.units[request.targetId!];
      if (anchor) for (const target of Object.values(combat.units)) {
        if (alive(target) && target.id !== anchor.id && target.id !== unit.id && unitsAdjacent(combat, anchor, target)) {
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
      // Dace's Minotaurs IV still resolves when the attacker fell in the exchange
      // (the unit-alive gate above exempts it for the same reason).
      if (anchor && (request.anchorId !== undefined || alive(anchor) || request.abilityId === "dace-minotaurs-pack-break"))
        for (const target of candidates) {
          if (request.kind === "link" && target.id === anchor.id) continue;
          if (request.excludeTargetId && target.id === request.excludeTargetId) continue;
          if (request.enemiesOnly && target.controllerId === unit.controllerId) continue;
          if (request.alliesOnly && target.controllerId !== unit.controllerId) continue;
          if (
            (request.adjacent || request.kind === "link") &&
            !unitsAdjacent(combat, anchor, target)
          )
            continue;
          if (request.runeScaling) {
            // Jotunn Rune Bolt: 1 Rune → 1 damage, or (if affordable) 2 Runes → 2 damage.
            picks.push({ targetId: target.id, amount: 1, runeCost: 1 });
            labels.push(`${target.cardName} — 1 damage (1 Rune)`);
            if (availableRunes(state, unit.controllerId) >= 2) {
              picks.push({ targetId: target.id, amount: 2, runeCost: 2 });
              labels.push(`${target.cardName} — 2 damage (2 Runes)`);
            }
          } else {
            picks.push({ targetId: target.id });
            labels.push(target.cardName);
          }
        }
    } else if (request.kind === "debuff-attack") {
      for (const target of enemies(state, unit)) if ((!request.adjacent || unitsAdjacent(combat, unit, target))) {
        picks.push({ targetId: target.id }); labels.push(target.cardName);
      }
    } else if (request.kind === "obstacle" && combatGeometry(combat) === "hex") {
      // Hex: an obstacle token is one piece (as Break Cover / Remove Obstacle
      // read it) — it moves whole, every hex shifted by the same step, listed
      // once by its first hex; a loose obstacle hex moves alone.
      const emptySet = new Set(empty);
      const listed = new Set<string>();
      // A ship battle's sea hexes are the water, never a movable obstacle.
      for (const obstacle of movableObstacleCells(combat)) {
        const token = combat.hexObstacleTokens?.find((candidate) => candidate.cells.includes(obstacle));
        if (token) {
          if (listed.has(token.id)) continue;
          listed.add(token.id);
        }
        const cells = token ? token.cells : [obstacle];
        for (const position of getBattlefieldPositions("hex")) {
          if (position === obstacle || (token && hexTranslate(token.anchor, obstacle, position) === null)) continue;
          const moved = cells.map((cell) => hexTranslate(cell, obstacle, position));
          if (moved.every((cell) => cell !== null && (emptySet.has(cell) || cells.includes(cell)))) {
            picks.push({ obstacle, position });
            labels.push(
              `Move ${getBattlefieldLabel(obstacle)} obstacle to ${getBattlefieldLabel(position)}`,
            );
          }
        }
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
        unitAdjacentToCell(combat, unit, p),
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
    if (request.optional || (request.kind !== "damage" && request.kind !== "forge-death-burst" && request.kind !== "forge-jump-round" && request.kind !== "forge-grunt-tempo" && request.kind !== "nest" && request.kind !== "blind-dust" && request.kind !== "veteran-cleave" && request.kind !== "veteran-tribute" && request.kind !== "town-recover")) {
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
      prompt: `${unit.cardName}: ${request.abilityId === "dace-minotaurs-pack-break" ? "Minotaurs IV" : unitAbilities[request.abilityId]?.name ?? request.kind}${request.kind === "damage" && !request.runeScaling ? ` — choose a target for ${request.amount} damage` : ""}${request.kind === "damage" && request.runeScaling ? " — choose a target and Rune amount" : ""}${request.valuablesCost ? ` (spend ${request.valuablesCost} Valuables)` : ""}${request.runeCost && !request.runeScaling ? ` (spend ${request.runeCost} Rune)` : ""}`,
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
  const postDetonationRepair = request.abilityId === "factory-automaton-detonation-repair";
  if (!unit || (!alive(unit) && !postDetonationRepair && request.kind !== "forge-death-burst" && request.abilityId !== "forge-vet-cyberbrute-shock")) return;
  if (request.kind === "forge-grunt-tempo") {
    const target = combat.units[pick.targetId!];
    if (request.round !== combat.round || !target || !alive(target) || target.position < 0 || target.id === unit.id || !unitsAdjacent(combat, unit, target)) {
      throw new Error("Choose a unit adjacent to the Grunt for Tempo Field.");
    }
    (unit.townVeterancy ??= {}).forgeTempoTargetId = target.id;
    veteranTrigger(state, unit, request.abilityId, target, `${unit.cardName} and ${target.cardName} gain +1 Initiative in round ${combat.round}.`);
    return;
  }
  if (request.kind === "forge-jump-round") {
    const target = combat.units[pick.targetId!];
    if (request.round !== combat.round || (request.amount !== -1 && request.amount !== 1) || !target || !alive(target) || target.position < 0 || target.id === unit.id ||
        (request.amount === -1 && target.controllerId === unit.controllerId) ||
        (request.amount === 1 && target.controllerId !== unit.controllerId)) throw new Error("Choose a valid Combat Calibration target.");
    const negative = request.amount === -1;
    const effect = makeActiveEffect(state, {
      name: "Combat Calibration", scope: "unit",
      modifiers: [{ type: negative ? "DEFENSE_BONUS" : "INITIATIVE_BONUS", amount: negative ? -1 : 6 }],
      duration: { type: "current-combat-round" }, polarity: negative ? "negative" : "positive", removable: true,
    }, { type: "unit", unitId: unit.id, controllerId: unit.controllerId }, unit.controllerId, { type: "unit", unitId: target.id });
    state.activeEffects.push(effect);
    appendEvent(state, { type: "ACTIVE_EFFECT_CREATED", effectId: effect.id, controllerId: effect.controllerId, name: effect.name, duration: effect.duration });
    veteranTrigger(state, unit, request.abilityId, target, `${target.cardName} ${negative ? "loses 1 Defense" : "gains 6 Initiative"} for this combat round.`);
    return;
  }
  if (request.kind === "forge-death-burst") {
    const target = combat.units[pick.targetId!];
    if (!target || !alive(target) || target.controllerId === unit.controllerId || request.excludedTargetIds?.includes(target.id)) throw new Error("Choose an unhit enemy for Death Burst.");
    veteranDamage(state, unit, target, 1, request.abilityId);
    if ((request.remaining ?? 1) > 1) queueElementalChoice(state, { ...request, remaining: (request.remaining ?? 1) - 1, excludedTargetIds: [...(request.excludedTargetIds ?? []), target.id] });
    return;
  }
  if (request.kind === "dispel") {
    hooks.dispelAttack(state, request.attack!, !pick.skip);
    return;
  }
  if (request.kind === "return-fire") {
    hooks.returnFire?.(state, unit, request.targetId!, !pick.skip);
    return;
  }
  if (request.kind === "nest-return") {
    const nest = combat.units[request.targetId!];
    if (!nest || !alive(nest) || nest.elementalVeterancy?.nestOwnerId !== unit.id) return;
    // The old Nest expires at this scheduled activation even when its owner
    // stays. It cannot offer another return on a later round.
    nest.damage = nest.maxHealth;
    if (pick.skip || (request.abilityId === "veteran-phoenix-rising-nest-return" &&
      (townBound(state, unit) || neutralTownDeepRooted(state, unit)))) return;
    // A double-wide owner (hex board) returns only when its whole footprint fits.
    if (unitTailOffset(combat, unit) !== 0 && !elementalLandingFree(combat, unit, nest.position)) return;
    const from = unit.position;
    unit.position = nest.position;
    const canHeal = request.abilityId !== "veteran-phoenix-rising-nest-return" ||
      getUnitAbilityDefinitions(unit).some(a => a.id === "veteran-phoenix-rising-nest-heal");
    const healed = canHeal ? Math.min(1, Math.max(0, unit.damage)) : 0;
    unit.damage -= healed;
    if (request.abilityId === "veteran-phoenix-rising-nest-return")
      (unit.elementalVeterancy ??= {}).nestAttackBonus = Math.min(2, (unit.elementalVeterancy?.nestAttackBonus ?? 0) + 1);
    appendEvent(state, { type: "UNIT_MOVED", playerId: unit.controllerId, unitId: unit.id, from, to: unit.position, sourceAbilityId: request.abilityId });
    if (healed > 0) appendEvent(state, {
      type: "DAMAGE_HEALED",
      source: { type: "unit", unitId: unit.id, controllerId: unit.controllerId },
      target: { type: "unit", unitId: unit.id }, amount: healed,
    });
    appendEvent(state, {
      type: "UNIT_ABILITY_TRIGGERED", unitId: unit.id, targetUnitId: unit.id,
      abilityId: request.abilityId, message: `${unit.cardName} flies to its Nest.`,
    });
    return;
  }
  if (pick.skip) return;
  if (request.kind === "break-cover" || request.kind === "blood-price") {
    const target = combat.units[request.targetId!];
    if (!target || !alive(target) || isUnitDamageImmune(target) || target.controllerId === unit.controllerId || unit.customVeterancyRounds?.[request.kind] !== undefined || !getUnitAbilityDefinitions(unit).some(a => a.id === request.abilityId)) throw new Error("That combat ability is no longer available.");
    if (request.kind === "break-cover") {
      if (pick.obstacle === undefined || !breakCoverTargets(state, target, request.abilityId === "ctv-mountain-break").includes(pick.obstacle)) throw new Error("Choose eligible cover adjacent to the enemy.");
      const fortKind = fortificationKindAt(combat.siege, pick.obstacle);
      if (fortKind) destroyFortification(state, unit, fortKind, pick.obstacle);
      // Hex: an obstacle token is one piece — breaking any hex clears all of it.
      const hexToken = combat.hexObstacleTokens?.find(token => token.cells.includes(pick.obstacle!));
      if (hexToken) combat.hexObstacleTokens = combat.hexObstacleTokens!.filter(token => token !== hexToken);
      combat.obstacles = (combat.obstacles ?? []).filter(p => p !== pick.obstacle && !hexToken?.cells.includes(p));
    } else {
      if (unit.maxHealth - unit.damage < 2) throw new Error("Blood Price requires at least 2 remaining HP.");
      unit.damage += 1;
      const cost = appendEvent(state, { type: "DAMAGE_ASSIGNED", source: { type: "unit", unitId: unit.id, controllerId: unit.controllerId }, target: { type: "unit", unitId: unit.id }, amount: 1, damageKind: "effect" });
      noteUnitDamagedForTokens(state, unit, cost.amount);
    }
    (unit.customVeterancyRounds ??= {})[request.kind] = combat.round;
    // A Toxic Moat can kill the unit while it fells a Wall/Gate; a dead unit deals no damage.
    if (alive(unit)) hooks.damage(state, unit, target.id, request.abilityId, unitAbilities[request.abilityId]!.name, request.kind === "break-cover" ? 1 : 2);
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
    if (request.abilityId === "town-magi-recover") {
      const memory = (unit.townVeterancy ??= {});
      if ((memory.magiRecoveryUses ?? 0) >= 2) throw new Error("Arcane Recovery has reached its twice-per-combat limit.");
      memory.magiRecoveryUses = (memory.magiRecoveryUses ?? 0) + 1;
    }
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
  if (request.kind === "engineer-buff") {
    const target = combat.units[pick.targetId!];
    if (!target || !alive(target) || target.id === unit.id || target.controllerId !== unit.controllerId || !unitsAdjacent(combat, unit, target)) {
      throw new Error("Choose an adjacent allied unit.");
    }
    target.engineerNextAttackBonus = (target.engineerNextAttackBonus ?? 0) + (request.amount ?? 1);
    veteranTrigger(state, unit, request.abilityId, target, `${target.cardName} gains +1 Attack for its next attack.`);
    return;
  }
  if (request.kind === "move-one" || request.kind === "return-origin") {
    const position = pick.position!;
    const blocked = !onCombatBoard(combat, position) ||
      (request.kind === "move-one" && getBattlefieldDistance(unit.position, position) > (request.maxDistance ?? 1)) ||
      (request.kind === "return-origin" && position !== request.position) ||
      !elementalLandingFree(combat, unit, position) ||
      (request.abilityId === "forge-vet-tank-reposition" && !tankCounterdriveReachable(combat, unit, position));
    if (blocked) throw new Error("That movement space is not available.");
    const from = unit.position; unit.position = position;
    veteranTrigger(state, unit, request.abilityId);
    appendEvent(state, { type: "UNIT_MOVED", playerId: unit.controllerId, unitId: unit.id, from, to: position, sourceAbilityId: request.abilityId });
    return;
  }
  if (request.kind === "move-ally-one") {
    const target = combat.units[pick.targetId!];
    const position = pick.position!;
    const blocked = !target || !alive(target) || target.id === unit.id || target.controllerId !== unit.controllerId || townBound(state, target) || neutralTownDeepRooted(state, target) ||
      (request.adjacent && !unitsAdjacent(combat, unit, target)) ||
      (request.engagedOnly && !Object.values(combat.units).some(e => alive(e) && e.controllerId !== target.controllerId && unitsAdjacent(combat, e, target))) ||
      !onCombatBoard(combat, position) || !isAdjacent(target.position, position) ||
      !elementalLandingFree(combat, target, position);
    if (blocked) throw new Error("Choose an allied unit and an adjacent empty space.");
    const from = target.position; target.position = position;
    veteranTrigger(state, unit, request.abilityId === "ntv-victory-command" ? "ntv-victory-command-move" : request.abilityId, target);
    appendEvent(state, { type: "UNIT_MOVED", playerId: target.controllerId, unitId: target.id, from, to: position });
    return;
  }
  if (request.kind === "heal") {
    const target = combat.units[pick.targetId!];
    if (!target || !alive(target) || target.damage <= 0 || (!postDetonationRepair && target.controllerId !== unit.controllerId) ||
      (request.adjacent && !unitsAdjacent(combat, unit, target)) ||
      (request.adjacentOrSelf && target.id !== unit.id && !unitsAdjacent(combat, unit, target))) throw new Error("Choose a damaged allied unit in range.");
    veteranHeal(state, target, request.amount ?? 1, request.abilityId, unit); return;
  }
  if (request.kind === "debuff-attack") {
    const target = combat.units[pick.targetId!];
    if (!target || !alive(target) || target.controllerId === unit.controllerId || request.adjacent && !unitsAdjacent(combat, unit, target)) throw new Error("Choose an eligible enemy.");
    applyNeutralDebuff(state, unit, target, request.abilityId, unitAbilities[request.abilityId]?.name ?? "Disoriented", { type: "ATTACK_BONUS", amount: -(request.amount ?? 1) }); return;
  }
  if (request.kind === "veteran-teleport") {
    const position = pick.position!;
    if (!onCombatBoard(combat, position) ||
        (request.maxDistance !== undefined && getBattlefieldDistance(position, unit.position) > request.maxDistance) ||
        !elementalLandingFree(combat, unit, position)) throw new Error("That teleport space is occupied.");
    const from = unit.position;
    unit.position = position;
    veteranTrigger(state, unit, request.abilityId);
    appendEvent(state, { type: "UNIT_MOVED", playerId: unit.controllerId, unitId: unit.id, from, to: position });
    return;
  }
  if (request.kind === "veteran-cleave") {
    const target = combat.units[pick.targetId!];
    const anchor = combat.units[request.targetId!];
    if (!target || !anchor || !alive(target) || target.id === unit.id || target.id === anchor.id || !unitsAdjacent(combat, anchor, target)) throw new Error("Choose a unit adjacent to the attack target.");
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
      request.abilityId === "dace-minotaurs-pack-break" ? "Minotaurs IV" : unitAbilities[request.abilityId]?.name ?? "Elemental ability",
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
  } else if (request.kind === "obstacle" && isHexSeaCell(combat, pick.obstacle!)) {
    // The hex ship battle's sea is not an obstacle token (the offer never lists it).
    throw new Error("The sea cannot be moved.");
  } else if (
    request.kind === "obstacle" &&
    combatGeometry(combat) === "hex" &&
    combat.hexObstacleTokens?.some((token) => token.cells.includes(pick.obstacle!))
  ) {
    // Hex: the whole obstacle token moves (the offer only lists fitting shifts).
    const tokens = combat.hexObstacleTokens ?? [];
    const token = tokens.find((candidate) => candidate.cells.includes(pick.obstacle!))!;
    const shift = (cell: number): number => hexTranslate(cell, pick.obstacle!, pick.position!) ?? cell;
    const cells = token.cells.map(shift).sort((a, b) => a - b);
    combat.obstacles = [
      ...(combat.obstacles ?? []).filter((p) => !token.cells.includes(p)),
      ...cells,
    ].sort((a, b) => a - b);
    combat.hexObstacleTokens = tokens.map((candidate) =>
      candidate === token ? { ...candidate, cells, anchor: shift(candidate.anchor) } : candidate,
    );
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
    appendEvent(state, {
      type: "UNIT_ABILITY_TRIGGERED", unitId: unit.id, targetUnitId: id,
      abilityId: request.abilityId, message: `${unit.cardName} places a Nest.`,
    });
    return;
  }
  if (request.kind !== "damage")
    appendEvent(state, {
      type: "UNIT_ABILITY_TRIGGERED",
      unitId: unit.id,
      targetUnitId: pick.targetId ?? unit.id,
      ...(request.kind === "link" ? { linkFromUnitId: request.targetId! } : {}),
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
    !unitsAdjacent(state.combat, attacker, defender)
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
