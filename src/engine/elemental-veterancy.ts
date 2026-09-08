import { getUnitAbilityDefinitions } from "./unit-abilities";
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

type Request = NonNullable<CombatState["elementalChoices"]>[number];
export type ElementalHooks = {
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
): void {
  if (
    state.activeEffects.some((effect) =>
      effect.modifiers.some((m) => m.type === "SUPPRESS_SPELL_ABILITIES"),
    )
  )
    return;
  const card = balanceCardLibrary(state, cardLibrary)[cardId];
  const schools = card?.spellSchools ?? [];
  for (const unit of Object.values(state.combat?.units ?? {})) {
    if (!alive(unit) || unit.controllerId === casterId) continue;
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
  for (const nest of Object.values(combat.units)) {
    if (
      nest.elementalVeterancy?.nestOwnerId !== unit.id ||
      !alive(nest) ||
      (nest.elementalVeterancy.nestRound ?? combat.round) >= combat.round
    )
      continue;
    const from = unit.position;
    unit.position = nest.position;
    nest.damage = nest.maxHealth;
    const healed = Math.min(1, unit.damage);
    unit.damage -= healed;
    appendEvent(state, {
      type: "UNIT_MOVED",
      playerId: unit.controllerId,
      unitId: unit.id,
      from,
      to: unit.position,
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
    appendEvent(state, {
      type: "UNIT_ABILITY_TRIGGERED",
      unitId: unit.id,
      targetUnitId: unit.id,
      abilityId: "veteran-phoenix-nest",
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
      abilityId: "veteran-phoenix-nest",
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
    if (source)
      hooks.damage(
        state,
        source,
        unit.id,
        "veteran-storm-link",
        "Lightning Link",
        1,
      );
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
      abilityId: "veteran-storm-link",
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
    if (request.kind === "copy") {
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
    } else if (
      request.kind === "damage" ||
      request.kind === "link" ||
      request.kind === "copy-bolt"
    ) {
      const anchor =
        request.kind === "link" ? combat.units[request.targetId!] : unit;
      const candidates =
        request.abilityId === "veteran-arcane-echo"
          ? [
              ...enemies(state, unit),
              ...Object.values(combat.units).filter(
                (t) => alive(t) && t.controllerId === unit.controllerId,
              ),
            ]
          : enemies(state, unit);
      if (anchor && alive(anchor))
        for (const target of candidates) {
          if (request.kind === "link" && target.id === anchor.id) continue;
          if (
            (request.adjacent || request.kind === "link") &&
            !isAdjacent(anchor.position, target.position)
          )
            continue;
          picks.push({ targetId: target.id });
          labels.push(target.cardName);
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
    if (request.kind !== "damage" && request.kind !== "nest") {
      picks.push({ skip: true });
      labels.push("Skip");
    }
    const chooser = hooks.chooser(state, combat, unit);
    if (!chooser || chooser === NEUTRAL_PLAYER_ID) {
      executeElementalPick(state, request, picks[0], hooks);
      if (state.pendingChoice || state.stack.length || state.reactionWindow)
        return true;
      continue;
    }
    state.pendingChoice = {
      id: `choice_${nextEventNumber(state)}`,
      type: "OPTION_CHOICE",
      playerId: chooser,
      prompt: `${unit.cardName}: ${unitAbilities[request.abilityId]?.name ?? request.kind}${request.kind === "damage" ? ` — choose a target for ${request.amount} damage` : ""}`,
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
  if (pick.skip) return;
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
      request.amount!,
    );
    return;
  }
  if (request.kind === "damage")
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
      assets: { cardImage: "/game-tokens/phoenix-nest.png" },
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
  if (retaliation) return 0;
  let bonus = 0;
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
