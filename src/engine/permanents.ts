import { cardLibrary } from "@/data/cards/library";
import { makeActiveEffect } from "./active-effects";
import { hasResources, processPendingVisit, spendResources } from "./adventure";
import { isAdjacent } from "./battlefield";
import { finishCombatIfNeeded, markUnitRemovedIfNeeded } from "./combat-units";
import { appendEvent } from "./events";
import type {
  CardDefinition,
  CardId,
  CombatUnitState,
  GameAction,
  GameState,
  PlayerId,
  UnitId,
  WarMachineRoundStartDefinition
} from "./state";

// Local liveness check, so this module never pulls in legal-actions (which
// imports the reducers that import this module).
function isAlive(unit: CombatUnitState): boolean {
  return unit.damage < unit.maxHealth;
}

export function getPermanentCardId(state: GameState, playerId: PlayerId): CardId | null {
  return state.players[playerId]?.permanent ?? null;
}

export function getPermanentDefinition(state: GameState, playerId: PlayerId): CardDefinition | null {
  const cardId = getPermanentCardId(state, playerId);
  return cardId ? (cardLibrary[cardId] ?? null) : null;
}

/**
 * The School of Magic bonus the player's in-play permanent grants a spell, or
 * null when the permanent (if any) does not match the spell's school. Spells
 * of the "any" school (Magic Arrow) belong to every school.
 */
export function getPermanentSchoolBonus(
  state: GameState,
  playerId: PlayerId,
  spellCard: CardDefinition
): { basicPower: number; expertPower: number } | null {
  const bonus = getPermanentDefinition(state, playerId)?.permanentEffect?.schoolBonus;
  if (!bonus || spellCard.kind !== "spell") {
    return null;
  }

  const schools = spellCard.spellSchools ?? [];
  if (!schools.includes(bonus.school) && !schools.includes("any")) {
    return null;
  }

  return { basicPower: bonus.basicPower, expertPower: bonus.expertPower };
}

function playerIsInCombat(state: GameState, playerId: PlayerId): boolean {
  return Boolean(
    state.combat &&
      !state.combat.outcome &&
      (state.combat.attackerPlayerId === playerId || state.combat.defenderPlayerId === playerId)
  );
}

function adjustRangedInitiative(state: GameState, playerId: PlayerId, delta: number): void {
  if (!state.combat || delta === 0) {
    return;
  }

  for (const unit of Object.values(state.combat.units)) {
    if (unit.controllerId === playerId && unit.type === "ranged" && isAlive(unit)) {
      unit.initiative += delta;
    }
  }
}

/**
 * Instantiates the in-play permanent's combat presence for its owner: the
 * card-scoped active effect (First Aid Tent heal, Ammo Cart penalty waiver)
 * and the ranged initiative bonus. Idempotent — the active effect doubles as
 * the "already applied" marker, so this may run at combat start, on every
 * round start and when a permanent enters play mid-combat. (A
 * rangedInitiativeBonus therefore needs a combatEffect on the same card.)
 */
export function applyPermanentCombatEffectsForPlayer(state: GameState, playerId: PlayerId): void {
  const card = getPermanentDefinition(state, playerId);
  if (!card?.permanentEffect || !playerIsInCombat(state, playerId)) {
    return;
  }

  const { combatEffect, rangedInitiativeBonus } = card.permanentEffect;
  if (!combatEffect) {
    return;
  }

  const alreadyActive = state.activeEffects.some(
    (effect) => effect.source.type === "card" && effect.source.cardId === card.id && effect.controllerId === playerId
  );
  if (alreadyActive) {
    return;
  }

  const activeEffect = makeActiveEffect(
    state,
    combatEffect,
    { type: "card", cardId: card.id, controllerId: playerId },
    playerId
  );
  state.activeEffects.push(activeEffect);
  appendEvent(state, {
    type: "ACTIVE_EFFECT_CREATED",
    effectId: activeEffect.id,
    controllerId: playerId,
    name: activeEffect.name,
    duration: activeEffect.duration
  });

  if (rangedInitiativeBonus) {
    adjustRangedInitiative(state, playerId, rangedInitiativeBonus);
  }
}

/** Both combatants bring their in-play permanents when a combat begins. */
export function applyPermanentCombatEffects(state: GameState): void {
  const combat = state.combat;
  if (!combat) {
    return;
  }

  for (const playerId of [combat.attackerPlayerId, combat.defenderPlayerId]) {
    applyPermanentCombatEffectsForPlayer(state, playerId);
  }
}

/**
 * Removes a leaving permanent's combat presence (active effects and ranged
 * initiative) so a mid-combat replacement does not leave bonuses behind.
 */
function removePermanentCombatEffects(state: GameState, playerId: PlayerId, card: CardDefinition): void {
  state.activeEffects = state.activeEffects.filter(
    (effect) => !(effect.source.type === "card" && effect.source.cardId === card.id && effect.controllerId === playerId)
  );

  if (card.permanentEffect?.rangedInitiativeBonus && playerIsInCombat(state, playerId)) {
    adjustRangedInitiative(state, playerId, -card.permanentEffect.rangedInitiativeBonus);
  }
}

/**
 * Sends the in-play permanent to its owner's discard pile (expert effect used
 * or another permanent played) and cleans its combat presence up.
 */
export function discardPermanentFromPlay(state: GameState, playerId: PlayerId): CardId | null {
  const player = state.players[playerId];
  const cardId = player?.permanent ?? null;
  if (!player || !cardId) {
    return null;
  }

  const card = cardLibrary[cardId];
  if (card) {
    removePermanentCombatEffects(state, playerId, card);
  }
  player.permanent = null;
  player.discard.push(cardId);
  return cardId;
}

/**
 * Puts a hand card into play as the player's permanent. The previous
 * permanent (if any) goes to the discard pile, as printed: "You may only
 * have one permanent card at a time; playing another discards the first."
 */
export function putPermanentIntoPlay(state: GameState, playerId: PlayerId, cardId: CardId): void {
  const player = state.players[playerId];
  const card = cardLibrary[cardId];
  if (!player || !card?.permanent) {
    throw new Error("That card is not a permanent.");
  }

  const handIndex = player.hand.indexOf(cardId);
  if (handIndex === -1) {
    throw new Error("That card is not in hand.");
  }

  const replacedCardId = discardPermanentFromPlay(state, playerId);
  player.hand.splice(handIndex, 1);
  player.permanent = cardId;

  appendEvent(state, {
    type: "PERMANENT_PLAYED",
    playerId,
    cardId,
    replacedCardId
  });

  applyPermanentCombatEffectsForPlayer(state, playerId);
}

// ---------------------------------------------------------------------------
// War machine round-start triggers
// ---------------------------------------------------------------------------

function getRoundStartDefinition(state: GameState, playerId: PlayerId): WarMachineRoundStartDefinition | null {
  return getPermanentDefinition(state, playerId)?.permanentEffect?.roundStart ?? null;
}

function livingUnits(state: GameState): CombatUnitState[] {
  return Object.values(state.combat?.units ?? {}).filter(isAlive);
}

function enemiesOf(state: GameState, playerId: PlayerId): CombatUnitState[] {
  return livingUnits(state).filter((unit) => unit.controllerId !== playerId);
}

/** Catapult first targets: units that have at least one living neighbor. */
function splashFirstTargets(state: GameState): CombatUnitState[] {
  const units = livingUnits(state);
  return units.filter((unit) => units.some((other) => other.id !== unit.id && isAdjacent(other.position, unit.position)));
}

/**
 * Queues both players' round-start war machines (attacker first) at the
 * start of every combat round, then resolves what it can.
 */
export function startWarMachineRound(state: GameState): void {
  const combat = state.combat;
  if (!combat || combat.outcome) {
    return;
  }

  const pending = [combat.attackerPlayerId, combat.defenderPlayerId].filter((playerId) =>
    getRoundStartDefinition(state, playerId)
  );
  combat.warMachineRound = pending.length > 0 ? { pending, firstTargetUnitId: null } : null;
  processWarMachineRound(state);
}

function warMachineName(state: GameState, playerId: PlayerId): string {
  return getPermanentDefinition(state, playerId)?.name ?? "War machine";
}

/** Applies war machine damage with the card as the damage source. */
export function applyWarMachineDamage(
  state: GameState,
  playerId: PlayerId,
  targetUnitId: UnitId,
  amount: number,
  message?: string
): void {
  const combat = state.combat;
  const target = combat?.units[targetUnitId];
  const cardId = getPermanentCardId(state, playerId);
  if (!combat || !target || !isAlive(target) || !cardId) {
    return;
  }

  appendEvent(state, {
    type: "WAR_MACHINE_TRIGGERED",
    playerId,
    cardId,
    targetUnitId,
    message: message ?? `${warMachineName(state, playerId)} hits ${target.cardName} for ${amount} damage.`
  });

  target.damage += amount;
  appendEvent(state, {
    type: "DAMAGE_ASSIGNED",
    source: { type: "card", cardId, controllerId: playerId },
    target: { type: "unit", unitId: target.id },
    amount,
    damageKind: "effect"
  });
  markUnitRemovedIfNeeded(state, target);
  // A shot may wipe the last enemy unit — even at round start, before any
  // activation, so the outcome check cannot wait for the next attack.
  finishCombatIfNeeded(state);
}

function openWarMachineTargetChoice(
  state: GameState,
  playerId: PlayerId,
  prompt: string,
  candidateUnitIds: UnitId[],
  amount: number
): void {
  const choiceId = `choice_${state.eventLog.length + 1}`;
  state.pendingChoice = {
    id: choiceId,
    type: "ABILITY_TARGET_CHOICE",
    playerId,
    kind: "war-machine",
    abilityId: getPermanentCardId(state, playerId),
    abilityName: warMachineName(state, playerId),
    prompt,
    sourceUnitId: null,
    anchorUnitId: null,
    candidateUnitIds,
    amount
  };
  state.phase = "choice";
  state.priorityPlayerId = playerId;

  appendEvent(state, {
    type: "PENDING_CHOICE_CREATED",
    choiceId,
    choiceType: "ABILITY_TARGET_CHOICE",
    playerId,
    sourceEffectIds: [],
    message: `${state.players[playerId]?.name ?? playerId} aims the ${warMachineName(state, playerId)}.`
  });
}

function openWarMachineOffer(state: GameState, playerId: PlayerId, prompt: string, fireLabel: string): void {
  const choiceId = `choice_${state.eventLog.length + 1}`;
  state.pendingChoice = {
    id: choiceId,
    type: "OPTION_CHOICE",
    playerId,
    prompt,
    options: [{ label: fireLabel }, { label: "Skip" }],
    context: "war-machine",
    returnPhase: "combat"
  };
  state.phase = "choice";
  state.priorityPlayerId = playerId;

  appendEvent(state, {
    type: "PENDING_CHOICE_CREATED",
    choiceId,
    choiceType: "ABILITY_TARGET_CHOICE",
    playerId,
    sourceEffectIds: [],
    message: prompt
  });
}

function hasExpertUseLeft(state: GameState, playerId: PlayerId): boolean {
  const player = state.players[playerId];
  return Boolean(player && player.combatStats.expertUsesSpentThisRound < player.limits.expertUses);
}

/**
 * Resolves queued round-start war machines until one needs the owner's
 * input (or the queue empties). Mandatory triggers with a single legal
 * target resolve on their own.
 */
export function processWarMachineRound(state: GameState): void {
  const combat = state.combat;
  if (!combat?.warMachineRound) {
    return;
  }

  while (!state.pendingChoice && !combat.outcome && state.combat === combat) {
    const queue = combat.warMachineRound;
    const playerId = queue?.pending[0];
    if (!queue || !playerId) {
      combat.warMachineRound = null;
      return;
    }

    const roundStart = getRoundStartDefinition(state, playerId);
    if (!roundStart) {
      queue.pending.shift();
      continue;
    }

    const name = warMachineName(state, playerId);

    if (roundStart.kind === "damage-lowest-initiative") {
      const enemies = enemiesOf(state, playerId);
      if (enemies.length === 0) {
        queue.pending.shift();
        continue;
      }

      const lowest = Math.min(...enemies.map((unit) => unit.initiative));
      const candidates = enemies.filter((unit) => unit.initiative === lowest);
      if (candidates.length === 1) {
        applyWarMachineDamage(state, playerId, candidates[0].id, roundStart.amount);
        queue.pending.shift();
        continue;
      }

      openWarMachineTargetChoice(
        state,
        playerId,
        `${name}: ${roundStart.amount} damage to the enemy unit with the lowest initiative — break the tie.`,
        candidates.map((unit) => unit.id),
        roundStart.amount
      );
      return;
    }

    if (roundStart.kind === "pay-to-splash") {
      const player = state.players[playerId];
      if (!player || !hasResources(player, roundStart.cost) || splashFirstTargets(state).length === 0) {
        queue.pending.shift();
        continue;
      }

      openWarMachineOffer(
        state,
        playerId,
        `${name}: pay 1 building material to hit 2 adjacent targets for ${roundStart.amount} damage each?`,
        "Fire the Catapult"
      );
      return;
    }

    // expert-shot (Cannon)
    if (!hasExpertUseLeft(state, playerId) || enemiesOf(state, playerId).length === 0) {
      queue.pending.shift();
      continue;
    }

    openWarMachineOffer(
      state,
      playerId,
      `${name}: spend 1 expert use to deal ${roundStart.amount} damage to one enemy unit?`,
      "Fire the Cannon"
    );
    return;
  }
}

/**
 * Resolves the fire/skip offer of an optional war machine (Catapult,
 * Cannon). Firing pays the cost and opens the target choice.
 */
export function resolveWarMachineOption(state: GameState, playerId: PlayerId, optionIndex: number): void {
  const combat = state.combat;
  const queue = combat?.warMachineRound;
  if (!combat || !queue || queue.pending[0] !== playerId) {
    throw new Error("No war machine is waiting for that player.");
  }

  const roundStart = getRoundStartDefinition(state, playerId);
  if (!roundStart || roundStart.kind === "damage-lowest-initiative") {
    throw new Error("That war machine has no offer to resolve.");
  }

  if (optionIndex !== 0) {
    queue.pending.shift();
    processWarMachineRound(state);
    return;
  }

  const name = warMachineName(state, playerId);

  if (roundStart.kind === "pay-to-splash") {
    const player = state.players[playerId];
    if (!player || !hasResources(player, roundStart.cost)) {
      throw new Error("Not enough resources to fire.");
    }
    spendResources(state, playerId, roundStart.cost, `${name} shot`);
    openWarMachineTargetChoice(
      state,
      playerId,
      `${name}: choose the first of two adjacent targets (${roundStart.amount} damage each).`,
      splashFirstTargets(state).map((unit) => unit.id),
      roundStart.amount
    );
    return;
  }

  // expert-shot (Cannon)
  const player = state.players[playerId];
  if (!player || !hasExpertUseLeft(state, playerId)) {
    throw new Error("No expert uses are available this combat round.");
  }
  player.combatStats.expertUsesSpentThisRound += 1;
  openWarMachineTargetChoice(
    state,
    playerId,
    `${name}: choose the enemy unit that takes ${roundStart.amount} damage.`,
    enemiesOf(state, playerId).map((unit) => unit.id),
    roundStart.amount
  );
}

/**
 * Resolves a war machine target click. The Catapult chains a second choice
 * (a unit adjacent to the first target); everything else finishes the
 * machine and moves the queue along. Returns true when combat may need its
 * end-of-combat check.
 */
export function resolveWarMachineTarget(state: GameState, playerId: PlayerId, targetUnitId: UnitId, amount: number): void {
  const combat = state.combat;
  const queue = combat?.warMachineRound;
  if (!combat || !queue || queue.pending[0] !== playerId) {
    throw new Error("No war machine is waiting for that player.");
  }

  const roundStart = getRoundStartDefinition(state, playerId);
  const isSplash = roundStart?.kind === "pay-to-splash";

  if (isSplash && !queue.firstTargetUnitId) {
    // First Catapult target: remember it, damage it, ask for the neighbor.
    const first = combat.units[targetUnitId];
    queue.firstTargetUnitId = targetUnitId;
    applyWarMachineDamage(state, playerId, targetUnitId, amount);

    const neighbors = first
      ? livingUnits(state).filter(
          (unit) => unit.id !== targetUnitId && isAdjacent(unit.position, first.position)
        )
      : [];

    if (neighbors.length === 0) {
      queue.firstTargetUnitId = null;
      queue.pending.shift();
      processWarMachineRound(state);
      return;
    }

    if (neighbors.length === 1) {
      applyWarMachineDamage(state, playerId, neighbors[0].id, amount);
      queue.firstTargetUnitId = null;
      queue.pending.shift();
      processWarMachineRound(state);
      return;
    }

    openWarMachineTargetChoice(
      state,
      playerId,
      `${warMachineName(state, playerId)}: choose the second target, adjacent to the first.`,
      neighbors.map((unit) => unit.id),
      amount
    );
    return;
  }

  // Second Catapult target, Ballista tie-break or Cannon shot.
  applyWarMachineDamage(state, playerId, targetUnitId, amount);
  queue.firstTargetUnitId = null;
  queue.pending.shift();
  processWarMachineRound(state);
}

// ---------------------------------------------------------------------------
// Buying war machines / school expert discard
// ---------------------------------------------------------------------------

/** Machines still in the shared supply, with their price at this shop. */
export function warMachinesForSale(
  state: GameState,
  pricing: "factory" | "trading-post"
): { cardId: CardId; card: CardDefinition; cost: NonNullable<CardDefinition["warMachineCosts"]>["factory"] }[] {
  const supply = state.adventure?.warMachineSupply ?? [];
  return supply.flatMap((cardId) => {
    const card = cardLibrary[cardId];
    const costs = card?.warMachineCosts;
    if (!card || !costs) {
      return [];
    }
    return [{ cardId, card, cost: pricing === "factory" ? costs.factory : costs.tradingPost }];
  });
}

/**
 * Buys a war machine during an open Trading Post or War Machine Factory
 * visit. The card goes to the buyer's hand ("gained cards go to your hand")
 * and the purchase uses up the visit — at the Trading Post it replaces the
 * other options, as printed.
 */
export function buyWarMachine(state: GameState, action: Extract<GameAction, { type: "BUY_WAR_MACHINE" }>): void {
  const adventure = state.adventure;
  const visit = adventure?.pendingVisit;
  const step = visit?.steps[0];
  if (!adventure || !visit || visit.playerId !== action.playerId) {
    throw new Error("Buying a war machine needs an open shop visit.");
  }

  const pricing =
    step?.type === "WAR_MACHINE_SHOP" ? "factory" : step?.type === "TRADING_POST" && !step.traded ? "trading-post" : null;
  if (!pricing) {
    throw new Error("This visit cannot buy a war machine any more.");
  }

  const offer = warMachinesForSale(state, pricing).find((candidate) => candidate.cardId === action.cardId);
  const player = state.players[action.playerId];
  if (!offer || !player) {
    throw new Error("That war machine is not in the supply.");
  }

  if (!hasResources(player, offer.cost)) {
    throw new Error("Not enough gold for that war machine.");
  }

  spendResources(state, action.playerId, offer.cost, `bought the ${offer.card.name}`);
  adventure.warMachineSupply = (adventure.warMachineSupply ?? []).filter((cardId) => cardId !== action.cardId);
  player.hand.push(action.cardId);

  appendEvent(state, {
    type: "WAR_MACHINE_BOUGHT",
    playerId: action.playerId,
    cardId: action.cardId,
    cost: offer.cost,
    at: pricing
  });

  // The purchase is the visit's one action: close the step.
  visit.steps.shift();
  processPendingVisit(state);
}

/**
 * School of Magic expert effect from the field: while one of the owner's
 * matching spells is on the stack, discard the in-play permanent and spend
 * one expert use to replace the basic +1 with the expert power bonus.
 */
export function applyPermanentExpert(state: GameState, action: Extract<GameAction, { type: "USE_PERMANENT_EXPERT" }>): void {
  const player = state.players[action.playerId];
  const card = getPermanentDefinition(state, action.playerId);
  const bonus = card?.permanentEffect?.schoolBonus;
  if (!player || !card || !bonus) {
    throw new Error("No School of Magic permanent is in play.");
  }

  const stackItem = state.stack.at(-1);
  if (!stackItem || stackItem.action.type !== "CAST_SPELL" || stackItem.action.playerId !== action.playerId) {
    throw new Error("The expert effect needs one of your spells being cast.");
  }

  const spellCard = cardLibrary[stackItem.action.cardId];
  if (!spellCard || !getPermanentSchoolBonus(state, action.playerId, spellCard)) {
    throw new Error(`${card.name} does not match that spell's school.`);
  }

  if ((stackItem.modifiers.schoolPowerBonus ?? 0) >= bonus.expertPower) {
    throw new Error("The expert school bonus is already applied.");
  }

  if (player.combatStats.expertUsesSpentThisRound >= player.limits.expertUses) {
    throw new Error("No expert uses are available this combat round.");
  }

  player.combatStats.expertUsesSpentThisRound += 1;
  stackItem.modifiers.schoolPowerBonus = bonus.expertPower;
  stackItem.modifiers.playedCardIds.push(card.id);
  discardPermanentFromPlay(state, action.playerId);

  appendEvent(state, {
    type: "CARD_PLAYED",
    playerId: action.playerId,
    cardId: card.id,
    timing: card.timing,
    mode: "expert",
    effectAmount: bonus.expertPower
  });
}
