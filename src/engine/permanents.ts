import { cardLibrary } from "@/data/cards/library";
import { countExtraBallistas, effectiveInitiative, hasBallistaChooseTarget, makeActiveEffect } from "./active-effects";
import { getActiveAstrologersCard, hasResources, processPendingVisit, spendResources } from "./adventure";
import { isAdjacent } from "./battlefield";
import { finishCombatIfNeeded, markUnitRemovedIfNeeded } from "./combat-units";
import { destroyFortification, fortificationTargets, parseFortificationTargetId } from "./siege";
import { noteUnitDamagedForTokens } from "./tokens";
import { expertUsesAvailable } from "./ruleset";
import { appendEvent, nextEventNumber } from "./events";
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

/**
 * Every permanent the player has in play, oldest first. Reads the modern
 * `permanents` array and falls back to the deprecated single `permanent`
 * slot so snapshots from before the multi-slot rule keep working.
 */
export function getPermanentCardIds(state: GameState, playerId: PlayerId): CardId[] {
  const player = state.players[playerId];
  if (!player) {
    return [];
  }

  if (player.permanents) {
    return player.permanents;
  }

  return player.permanent ? [player.permanent] : [];
}

export function getPermanentDefinitions(state: GameState, playerId: PlayerId): CardDefinition[] {
  return getPermanentCardIds(state, playerId).flatMap((cardId) => {
    const card = cardLibrary[cardId];
    return card ? [card] : [];
  });
}

/**
 * How many permanents the player may keep in play: 1 as printed ("You may
 * only have one permanent card at a time"), unless an in-play Pandora's Box
 * permanent raises it ("You can have up to 3 permanent cards played at a
 * time, including this one").
 */
export function permanentLimitFor(state: GameState, playerId: PlayerId): number {
  return getPermanentDefinitions(state, playerId).reduce(
    (limit, card) => Math.max(limit, card.permanentEffect?.permanentLimitOverride ?? 1),
    1
  );
}

/** Hand-limit bonus granted by in-play permanents (Pandora "hand +1"). */
export function permanentHandLimitBonus(state: GameState, playerId: PlayerId): number {
  return getPermanentDefinitions(state, playerId).reduce(
    (total, card) => total + (card.permanentEffect?.handLimitBonus ?? 0),
    0
  );
}

function setPermanentCardIds(state: GameState, playerId: PlayerId, cardIds: CardId[]): void {
  const player = state.players[playerId];
  if (!player) {
    return;
  }

  player.permanents = cardIds;
  // Clear the deprecated single slot so legacy reads cannot disagree.
  player.permanent = null;
}

/**
 * The School of Magic bonus an in-play permanent grants a spell, with the
 * granting card — or null when no in-play permanent matches the spell's
 * school. Spells of the "any" school (Magic Arrow) belong to every school.
 */
export function getPermanentSchoolBonus(
  state: GameState,
  playerId: PlayerId,
  spellCard: CardDefinition
): { card: CardDefinition; basicPower: number; expertPower: number } | null {
  if (spellCard.kind !== "spell") {
    return null;
  }

  const schools = spellCard.spellSchools ?? [];
  for (const card of getPermanentDefinitions(state, playerId)) {
    const bonus = card.permanentEffect?.schoolBonus;
    if (bonus && (schools.includes(bonus.school) || schools.includes("any"))) {
      return { card, basicPower: bonus.basicPower, expertPower: bonus.expertPower };
    }
  }

  return null;
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
 * Instantiates the in-play permanents' combat presence for their owner: the
 * card-scoped active effects (First Aid Tent heal, Ammo Cart penalty waiver)
 * and the ranged initiative bonuses. Idempotent — each active effect doubles
 * as its card's "already applied" marker, so this may run at combat start, on
 * every round start and when a permanent enters play mid-combat. (A
 * rangedInitiativeBonus therefore needs a combatEffect on the same card.)
 */
export function applyPermanentCombatEffectsForPlayer(state: GameState, playerId: PlayerId): void {
  if (!playerIsInCombat(state, playerId)) {
    return;
  }

  for (const card of getPermanentDefinitions(state, playerId)) {
    const { combatEffect, rangedInitiativeBonus } = card.permanentEffect ?? {};
    if (!combatEffect) {
      continue;
    }

    const alreadyActive = state.activeEffects.some(
      (effect) => effect.source.type === "card" && effect.source.cardId === card.id && effect.controllerId === playerId
    );
    if (alreadyActive) {
      continue;
    }

    // Ammo Cart (Astrologers): every First Aid Tent heals +firstAidHealBonus while
    // the proclamation is face up. Clone the modifier — makeActiveEffect only
    // shallow-copies, so mutating it would corrupt the shared card definition.
    let effectDefinition = combatEffect;
    const healBonus = card.id === FIRST_AID_TENT_CARD_ID ? (ammoCartBuff(state)?.firstAidHealBonus ?? 0) : 0;
    if (healBonus > 0) {
      effectDefinition = {
        ...combatEffect,
        modifiers: combatEffect.modifiers.map((modifier) =>
          modifier.type === "HEAL_ONCE_PER_COMBAT_ROUND"
            ? { ...modifier, amount: modifier.amount + healBonus }
            : modifier
        )
      };
    }

    const activeEffect = makeActiveEffect(
      state,
      effectDefinition,
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
 * Sends one in-play permanent to its owner's discard pile (expert effect
 * used, replaced over the limit, or discarded voluntarily) and cleans its
 * combat presence up. Without an explicit card id the oldest one leaves.
 */
export function discardPermanentFromPlay(
  state: GameState,
  playerId: PlayerId,
  cardId?: CardId
): CardId | null {
  const player = state.players[playerId];
  const inPlay = getPermanentCardIds(state, playerId);
  const discardId = cardId ?? inPlay[0] ?? null;
  if (!player || !discardId || !inPlay.includes(discardId)) {
    return null;
  }

  const card = cardLibrary[discardId];
  if (card) {
    removePermanentCombatEffects(state, playerId, card);
  }
  setPermanentCardIds(
    state,
    playerId,
    inPlay.filter((candidate) => candidate !== discardId)
  );
  player.discard.push(discardId);
  return discardId;
}

/**
 * Discards extra permanents (oldest first) whenever the limit shrinks below
 * what is in play — e.g. when the Pandora's Box "up to 3 permanents" card
 * itself leaves play while it was holding the door open.
 */
export function enforcePermanentLimit(state: GameState, playerId: PlayerId): void {
  let safety = 8;
  while (safety > 0 && getPermanentCardIds(state, playerId).length > permanentLimitFor(state, playerId)) {
    safety -= 1;
    const discarded = discardPermanentFromPlay(state, playerId);
    if (!discarded) {
      return;
    }
    appendEvent(state, {
      type: "PERMANENT_DISCARDED",
      playerId,
      cardId: discarded,
      reason: "limit"
    });
  }
}

/**
 * Puts a hand card into play as one of the player's permanents. At the
 * limit — 1 as printed, up to 3 with the Pandora's Box exception — the
 * oldest permanent goes to the discard pile first ("playing another
 * discards the first").
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

  const limit = permanentLimitFor(state, playerId);
  const replacedCardId =
    getPermanentCardIds(state, playerId).length >= limit ? discardPermanentFromPlay(state, playerId) : null;
  player.hand.splice(handIndex, 1);
  setPermanentCardIds(state, playerId, [...getPermanentCardIds(state, playerId), cardId]);

  appendEvent(state, {
    type: "PERMANENT_PLAYED",
    playerId,
    cardId,
    replacedCardId
  });

  applyPermanentCombatEffectsForPlayer(state, playerId);
}

/**
 * Rulebook voluntary removal: "The player may decide to put an active
 * permanent card into their discard pile. This stops the card effect
 * immediately." Dropping the Pandora limit card may discard extras too.
 */
export function discardPermanentVoluntarily(
  state: GameState,
  action: Extract<GameAction, { type: "DISCARD_PERMANENT" }>
): void {
  const inPlay = getPermanentCardIds(state, action.playerId);
  if (!inPlay.includes(action.cardId)) {
    throw new Error("That permanent is not in play.");
  }

  const discarded = discardPermanentFromPlay(state, action.playerId, action.cardId);
  if (!discarded) {
    throw new Error("That permanent could not be discarded.");
  }

  appendEvent(state, {
    type: "PERMANENT_DISCARDED",
    playerId: action.playerId,
    cardId: discarded,
    reason: "voluntary"
  });

  enforcePermanentLimit(state, action.playerId);
}

// ---------------------------------------------------------------------------
// War machine round-start triggers
// ---------------------------------------------------------------------------

function getRoundStartDefinitionForCard(cardId: CardId): WarMachineRoundStartDefinition | null {
  return cardLibrary[cardId]?.permanentEffect?.roundStart ?? null;
}

const FIRST_AID_TENT_CARD_ID = "war_machine.first_aid_tent" as CardId;

/**
 * The Ammo Cart Astrologers proclamation's war-machine buff while it is face up,
 * or null. Global (it buffs every player's machines), so callers gate by what
 * the firing player actually fields, not by who is "in" the proclamation.
 */
function ammoCartBuff(
  state: GameState
): { ballistaDamageBonus: number; firstAidHealBonus: number; rangedAttackReroll: boolean } | null {
  const effect = getActiveAstrologersCard(state)?.effect;
  return effect?.type === "WAR_MACHINE_BUFF" ? effect : null;
}

/** The war machine entry currently at the head of the round-start queue. */
function activeWarMachineEntry(
  state: GameState,
  playerId: PlayerId
): { cardId: CardId; roundStart: WarMachineRoundStartDefinition } | null {
  const head = state.combat?.warMachineRound?.pending[0];
  if (!head || head.playerId !== playerId) {
    return null;
  }

  // Ammo Cart (Astrologers): every Ballista deals +ballistaDamageBonus while the
  // proclamation is face up (folded into the round-start shot's amount here, so
  // every consumer — auto-fire, tie-break and Artillery volley — sees it).
  const ballistaBonus = ammoCartBuff(state)?.ballistaDamageBonus ?? 0;

  // Torosar's granted Ballistas have no permanent card: they fire a plain basic
  // shot (no expert volley) and skip the in-play check.
  if (head.granted) {
    return { cardId: head.cardId, roundStart: { kind: "damage-lowest-initiative", amount: 1 + ballistaBonus } };
  }

  // The machine must still be in play (its expert/discard may have removed it).
  if (!getPermanentCardIds(state, playerId).includes(head.cardId)) {
    return null;
  }

  const roundStart = getRoundStartDefinitionForCard(head.cardId);
  if (!roundStart) {
    return null;
  }
  if (roundStart.kind === "damage-lowest-initiative" && ballistaBonus > 0) {
    return { cardId: head.cardId, roundStart: { ...roundStart, amount: roundStart.amount + ballistaBonus } };
  }
  return { cardId: head.cardId, roundStart };
}

/** Whether an in-play permanent is a Ballista (a round-start single-shot machine). */
function isBallistaCard(cardId: CardId): boolean {
  return getRoundStartDefinitionForCard(cardId)?.kind === "damage-lowest-initiative";
}

/**
 * How many Ballistas a player fields: every in-play war-machine Ballista plus
 * each of Torosar's temporary grants ("this card counts as a Ballista").
 */
export function countBallistas(state: GameState, playerId: PlayerId): number {
  const permanentBallistas = getPermanentCardIds(state, playerId).filter(isBallistaCard).length;
  return permanentBallistas + countExtraBallistas(state, playerId);
}

function livingUnits(state: GameState): CombatUnitState[] {
  return Object.values(state.combat?.units ?? {}).filter(isAlive);
}

function enemiesOf(state: GameState, playerId: PlayerId): CombatUnitState[] {
  return livingUnits(state).filter((unit) => unit.controllerId !== playerId);
}

/**
 * The living enemy unit(s) of `playerId` with the lowest effective initiative —
 * the Ballista's and Artillery's legal targets. Empty when no enemy is alive; a
 * single entry is the forced target, several mean a tie the owner breaks.
 */
export function lowestInitiativeEnemies(state: GameState, playerId: PlayerId): CombatUnitState[] {
  const enemies = enemiesOf(state, playerId);
  if (enemies.length === 0) {
    return [];
  }
  const lowest = Math.min(...enemies.map((unit) => effectiveInitiative(unit, state.activeEffects)));
  return enemies.filter((unit) => effectiveInitiative(unit, state.activeEffects) === lowest);
}

/** Whether `unit` is currently one of `playerId`'s lowest-initiative living enemies. */
export function isLowestInitiativeEnemy(state: GameState, playerId: PlayerId, unit: CombatUnitState): boolean {
  return lowestInitiativeEnemies(state, playerId).some((candidate) => candidate.id === unit.id);
}

/**
 * Everything the Catapult may bombard right now: every living unit ON the board
 * (the off-board Arrow Tower, position -1, is excluded — the card hits "units,
 * Walls and the Gate", not the Tower) plus, during a siege, every standing Wall
 * and the Gate. Each target is reduced to an id + board position so adjacency is
 * uniform across units and fortifications.
 */
type SplashTarget = { id: UnitId; position: number };

function splashTargets(state: GameState): SplashTarget[] {
  const targets: SplashTarget[] = livingUnits(state)
    .filter((unit) => unit.position >= 0)
    .map((unit) => ({ id: unit.id, position: unit.position }));
  const siege = state.combat?.siege;
  if (siege) {
    for (const fort of fortificationTargets(siege)) {
      targets.push({ id: fort.id, position: fort.position });
    }
  }
  return targets;
}

/** Catapult first targets: any unit/Wall/Gate with at least one adjacent target. */
function splashFirstTargets(state: GameState): SplashTarget[] {
  const targets = splashTargets(state);
  return targets.filter((target) =>
    targets.some((other) => other.id !== target.id && isAdjacent(other.position, target.position))
  );
}

/** Board position of a Catapult target id (a unit id, or a Wall/Gate pseudo-id). */
function splashTargetPosition(state: GameState, targetId: UnitId): number | null {
  const fort = parseFortificationTargetId(targetId);
  if (fort) {
    return fort.position;
  }
  return state.combat?.units[targetId]?.position ?? null;
}

/**
 * Resolves one Catapult hit on a target id. A Wall or the Gate is battered down
 * (a fortification has no HP — one hit fells it, the rulebook's auto-success);
 * a unit takes `amount` effect damage. Either way the Catapult "fires", so a
 * WAR_MACHINE_TRIGGERED event is logged so the shot's sound/animation plays.
 */
function applyCatapultHit(state: GameState, playerId: PlayerId, targetId: UnitId, amount: number): void {
  const fort = parseFortificationTargetId(targetId);
  if (!fort) {
    applyWarMachineDamage(state, playerId, targetId, amount);
    return;
  }
  const combat = state.combat;
  const siege = combat?.siege;
  const standing = fort.kind === "wall" ? siege?.walls.includes(fort.position) : siege?.gatePosition === fort.position;
  if (!combat || !siege || !standing) {
    // Already gone (e.g. a shared piece felled by the first shot): nothing to do.
    return;
  }
  const cardId = combat.warMachineRound?.pending[0]?.cardId ?? null;
  if (cardId) {
    appendEvent(state, {
      type: "WAR_MACHINE_TRIGGERED",
      playerId,
      cardId,
      message: `${warMachineName(state, playerId)} batters the ${fort.kind === "gate" ? "Gate" : "Wall"}.`
    });
  }
  destroyFortification(state, null, fort.kind, fort.position);
  finishCombatIfNeeded(state);
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

  const pending = [combat.attackerPlayerId, combat.defenderPlayerId].flatMap((playerId) => [
    ...getPermanentCardIds(state, playerId)
      .filter((cardId) => getRoundStartDefinitionForCard(cardId))
      .map((cardId) => ({ playerId, cardId })),
    // Torosar's granted Ballistas each fire their own basic shot at round start.
    ...Array.from({ length: countExtraBallistas(state, playerId) }, () => ({
      playerId,
      cardId: "war_machine.ballista" as CardId,
      granted: true
    }))
  ]);
  combat.warMachineRound = pending.length > 0 ? { pending, firstTargetUnitId: null } : null;
  processWarMachineRound(state);
}

function warMachineName(state: GameState, playerId: PlayerId): string {
  const head = state.combat?.warMachineRound?.pending[0];
  if (head && head.playerId === playerId) {
    return cardLibrary[head.cardId]?.name ?? "War machine";
  }
  return "War machine";
}

/** Applies war machine damage with the card as the damage source. */
export function applyWarMachineDamage(
  state: GameState,
  playerId: PlayerId,
  targetUnitId: UnitId,
  amount: number,
  message?: string,
  sourceCardId?: CardId
): void {
  const combat = state.combat;
  const target = combat?.units[targetUnitId];
  const cardId =
    sourceCardId ??
    (combat?.warMachineRound?.pending[0]?.playerId === playerId
      ? combat.warMachineRound.pending[0].cardId
      : (getPermanentCardIds(state, playerId)[0] ?? null));
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
  noteUnitDamagedForTokens(state, target, amount);
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

/**
 * Independent Ballista shots: fire `shots` times, each re-picking the
 * lowest-initiative living enemy (ties broken deterministically), stopping
 * early if combat ends. Used by Torosar's "activate all your Ballistas", where
 * each shot is a separate Ballista choosing its own slowest target — NOT the
 * Artillery volley (which keeps the same target; see fireShotsAtUnit).
 */
function fireBallistaShots(
  state: GameState,
  playerId: PlayerId,
  amount: number,
  shots: number,
  sourceCardId?: CardId
): void {
  for (let shot = 0; shot < shots; shot += 1) {
    if (state.combat?.outcome) {
      return;
    }
    const candidates = lowestInitiativeEnemies(state, playerId);
    if (candidates.length === 0) {
      return;
    }
    const target = [...candidates].sort((left, right) => left.id.localeCompare(right.id))[0];
    applyWarMachineDamage(state, playerId, target.id, amount, undefined, sourceCardId);
  }
}

/**
 * Artillery expert volley: hit one chosen target `shots` times for `amount`
 * each. The target is fixed (no re-picking); a shot that defeats it makes the
 * rest fizzle, since applyWarMachineDamage no-ops on a dead unit.
 */
function fireShotsAtUnit(
  state: GameState,
  playerId: PlayerId,
  unitId: UnitId,
  amount: number,
  shots: number
): void {
  for (let shot = 0; shot < shots; shot += 1) {
    if (state.combat?.outcome) {
      return;
    }
    applyWarMachineDamage(state, playerId, unitId, amount);
  }
}

const ARTILLERY_ABILITY_ID = "ability.artillery" as CardId;

/** How many shots the Artillery expert side resolves, read from its card. */
function artilleryVolleyShots(): number {
  const effect = cardLibrary[ARTILLERY_ABILITY_ID]?.effect;
  if (effect?.type === "CHOOSE_ONE") {
    for (const option of effect.options) {
      if (option.effect.type === "ARTILLERY_BALLISTA_VOLLEY") {
        return option.effect.shots;
      }
    }
  }
  return 1;
}

/**
 * Whether `playerId` may turn a Ballista's round-start shot into the Artillery
 * same-target volley: they hold the Artillery ability card and have a free
 * expert use (crown). Playing it consumes the card — one volley per card.
 */
export function playerCanUseArtilleryVolley(state: GameState, playerId: PlayerId): boolean {
  const player = state.players[playerId];
  return Boolean(
    player &&
      player.hand.includes(ARTILLERY_ABILITY_ID) &&
      hasExpertUseLeft(state, playerId) &&
      artilleryVolleyShots() > 1
  );
}

/** Pays the Artillery expert cost: spend a crown and play (discard) the card. */
function spendArtilleryExpert(state: GameState, playerId: PlayerId): void {
  const player = state.players[playerId];
  if (!player) {
    return;
  }
  player.combatStats.expertUsesSpentThisRound += 1;
  const handIndex = player.hand.indexOf(ARTILLERY_ABILITY_ID);
  if (handIndex !== -1) {
    player.hand.splice(handIndex, 1);
    player.discard.push(ARTILLERY_ABILITY_ID);
  }
  appendEvent(state, {
    type: "CARD_PLAYED",
    playerId,
    cardId: ARTILLERY_ABILITY_ID,
    timing: cardLibrary[ARTILLERY_ABILITY_ID]?.timing ?? "instant",
    mode: "expert"
  });
}

const FIRST_AID_ABILITY_ID = "ability.first_aid" as CardId;

/** How many times the First Aid expert side resolves the Tent heal, read from its card. */
export function firstAidVolleyHeals(): number {
  const effect = cardLibrary[FIRST_AID_ABILITY_ID]?.effect;
  if (effect?.type === "CHOOSE_ONE") {
    for (const option of effect.options) {
      if (option.effect.type === "FIRST_AID_TENT_VOLLEY") {
        return option.effect.heals;
      }
    }
  }
  return 1;
}

/**
 * Whether `playerId` may turn their First Aid Tent's heal into the expert
 * same-target volley: they hold the First Aid ability card and have a free
 * expert use (crown). Playing it consumes the card — one volley per card. The
 * Tent itself must already be in play for the heal to exist at all.
 */
export function playerCanUseFirstAidVolley(state: GameState, playerId: PlayerId): boolean {
  const player = state.players[playerId];
  return Boolean(
    player &&
      player.hand.includes(FIRST_AID_ABILITY_ID) &&
      hasExpertUseLeft(state, playerId) &&
      firstAidVolleyHeals() > 1
  );
}

/** Pays the First Aid expert cost: spend a crown and play (discard) the card. */
export function spendFirstAidExpert(state: GameState, playerId: PlayerId): void {
  const player = state.players[playerId];
  if (!player) {
    return;
  }
  player.combatStats.expertUsesSpentThisRound += 1;
  const handIndex = player.hand.indexOf(FIRST_AID_ABILITY_ID);
  if (handIndex !== -1) {
    player.hand.splice(handIndex, 1);
    player.discard.push(FIRST_AID_ABILITY_ID);
  }
  appendEvent(state, {
    type: "CARD_PLAYED",
    playerId,
    cardId: FIRST_AID_ABILITY_ID,
    timing: cardLibrary[FIRST_AID_ABILITY_ID]?.timing ?? "instant",
    mode: "expert"
  });
}

/**
 * Torosar's "Activate your Ballista(s)": fire `count` extra Ballista shots
 * immediately (each = 1 damage to the lowest-initiative enemy). Ties resolve
 * deterministically; each shot re-picks, as separate Ballistas would.
 */
export function activateBallistas(state: GameState, playerId: PlayerId, count: number): void {
  if (count <= 0) {
    return;
  }
  // Ammo Cart (Astrologers): each Ballista shot deals +ballistaDamageBonus, the
  // same buff the round-start shot gets, so Torosar's activated Ballistas match.
  const amount = 1 + (ammoCartBuff(state)?.ballistaDamageBonus ?? 0);
  fireBallistaShots(state, playerId, amount, count, "war_machine.ballista");
}

function openWarMachineTargetChoice(
  state: GameState,
  playerId: PlayerId,
  prompt: string,
  candidateUnitIds: UnitId[],
  amount: number
): void {
  const choiceId = `choice_${nextEventNumber(state)}`;
  state.pendingChoice = {
    id: choiceId,
    type: "ABILITY_TARGET_CHOICE",
    playerId,
    kind: "war-machine",
    abilityId: state.combat?.warMachineRound?.pending[0]?.cardId ?? null,
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

function openWarMachineOffer(
  state: GameState,
  playerId: PlayerId,
  prompt: string,
  fireLabel: string,
  skipLabel = "Skip"
): void {
  const choiceId = `choice_${nextEventNumber(state)}`;
  state.pendingChoice = {
    id: choiceId,
    type: "OPTION_CHOICE",
    playerId,
    prompt,
    options: [{ label: fireLabel }, { label: skipLabel }],
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
  return Boolean(player && expertUsesAvailable(player) > 0);
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
    const head = queue?.pending[0];
    if (!queue || !head) {
      combat.warMachineRound = null;
      return;
    }

    const playerId = head.playerId;
    const entry = activeWarMachineEntry(state, playerId);
    if (!entry) {
      queue.pending.shift();
      continue;
    }
    const roundStart = entry.roundStart;

    const name = warMachineName(state, playerId);

    if (roundStart.kind === "damage-lowest-initiative") {
      // Gerwulf's Ballista VI (ongoing): while held, the owner aims their
      // Ballista at any enemy they choose instead of the forced slowest one.
      const chooseTarget = hasBallistaChooseTarget(state, playerId);
      const candidates = chooseTarget ? enemiesOf(state, playerId) : lowestInitiativeEnemies(state, playerId);
      if (candidates.length === 0) {
        queue.pending.shift();
        continue;
      }

      // Artillery (expert): a Ballista owner holding the Artillery ability may
      // play it for one expert use, resolving this shot against the SAME target
      // 3×. Offered only with both the card and a free crown in hand.
      if (playerCanUseArtilleryVolley(state, playerId)) {
        const shots = artilleryVolleyShots();
        openWarMachineOffer(
          state,
          playerId,
          `${name}: play Artillery (expert) to resolve it against the same target ${shots}×, or fire once?`,
          `Artillery: hit the same target ${shots}× (expert)`,
          "Fire once"
        );
        return;
      }

      // No Artillery: one basic shot at the slowest enemy (the owner breaks a tie).
      if (candidates.length === 1) {
        applyWarMachineDamage(state, playerId, candidates[0].id, roundStart.amount);
        queue.pending.shift();
        continue;
      }

      openWarMachineTargetChoice(
        state,
        playerId,
        chooseTarget
          ? `${name}: choose which enemy unit takes ${roundStart.amount} damage.`
          : `${name}: ${roundStart.amount} damage to the enemy unit with the lowest initiative — break the tie.`,
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
  if (!combat || !queue || queue.pending[0]?.playerId !== playerId) {
    throw new Error("No war machine is waiting for that player.");
  }

  const roundStart = activeWarMachineEntry(state, playerId)?.roundStart ?? null;
  if (!roundStart) {
    throw new Error("That war machine has no offer to resolve.");
  }

  // Ballista offer: option 0 plays Artillery (expert) for the same-target volley
  // — spend a crown and discard the card — any other option fires one basic
  // shot. Either may need a tie-break choice before the Ballista is done.
  if (roundStart.kind === "damage-lowest-initiative") {
    const name = warMachineName(state, playerId);
    if (optionIndex === 0 && playerCanUseArtilleryVolley(state, playerId)) {
      const shots = artilleryVolleyShots();
      spendArtilleryExpert(state, playerId);
      const candidates = lowestInitiativeEnemies(state, playerId);
      if (candidates.length > 1) {
        // A tie: the owner picks the single target the whole volley lands on.
        queue.volleyShots = shots;
        openWarMachineTargetChoice(
          state,
          playerId,
          `${name} (Artillery): hit the same target ${shots}× — break the tie.`,
          candidates.map((unit) => unit.id),
          roundStart.amount
        );
        return;
      }
      if (candidates.length === 1) {
        fireShotsAtUnit(state, playerId, candidates[0].id, roundStart.amount, shots);
      }
    } else {
      // Fire once at the slowest enemy; a tie asks the owner to break it.
      const candidates = lowestInitiativeEnemies(state, playerId);
      if (candidates.length > 1) {
        openWarMachineTargetChoice(
          state,
          playerId,
          `${name}: ${roundStart.amount} damage to the enemy unit with the lowest initiative — break the tie.`,
          candidates.map((unit) => unit.id),
          roundStart.amount
        );
        return;
      }
      if (candidates.length === 1) {
        applyWarMachineDamage(state, playerId, candidates[0].id, roundStart.amount);
      }
    }
    queue.pending.shift();
    processWarMachineRound(state);
    return;
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
      `${name}: choose the first of two adjacent targets — a unit, Wall or the Gate (${roundStart.amount} damage each).`,
      splashFirstTargets(state).map((target) => target.id),
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
  if (!combat || !queue || queue.pending[0]?.playerId !== playerId) {
    throw new Error("No war machine is waiting for that player.");
  }

  const roundStart = activeWarMachineEntry(state, playerId)?.roundStart ?? null;
  const isSplash = roundStart?.kind === "pay-to-splash";

  if (isSplash && !queue.firstTargetUnitId) {
    // First Catapult target (a unit, Wall or the Gate): note its position
    // BEFORE the hit (the piece may be felled / the unit removed), strike it,
    // then offer the second target adjacent to that same spot.
    const firstPosition = splashTargetPosition(state, targetUnitId);
    queue.firstTargetUnitId = targetUnitId;
    applyCatapultHit(state, playerId, targetUnitId, amount);

    const neighbors =
      firstPosition === null
        ? []
        : splashTargets(state).filter(
            (target) => target.id !== targetUnitId && isAdjacent(target.position, firstPosition)
          );

    if (neighbors.length === 0) {
      queue.firstTargetUnitId = null;
      queue.pending.shift();
      processWarMachineRound(state);
      return;
    }

    if (neighbors.length === 1) {
      applyCatapultHit(state, playerId, neighbors[0].id, amount);
      queue.firstTargetUnitId = null;
      queue.pending.shift();
      processWarMachineRound(state);
      return;
    }

    openWarMachineTargetChoice(
      state,
      playerId,
      `${warMachineName(state, playerId)}: choose the second target, adjacent to the first.`,
      neighbors.map((target) => target.id),
      amount
    );
    return;
  }

  // Second Catapult target (may be a Wall/Gate), Cannon shot, or a Ballista
  // tie-break. An Artillery volley lands all of its shots on the one chosen
  // target (volleyShots); every other case is a single hit (volleyShots → 1).
  const shots = queue.volleyShots ?? 1;
  if (parseFortificationTargetId(targetUnitId)) {
    applyCatapultHit(state, playerId, targetUnitId, amount);
  } else {
    fireShotsAtUnit(state, playerId, targetUnitId, amount, shots);
  }
  queue.volleyShots = null;
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
 * Schools of Magic, cast-time expert: when the caster chose (as part of the
 * cast) to discard the matching in-play permanent for its expert power bonus,
 * this spends one expert use, removes the permanent and logs the play. Returns
 * the discarded School card and its expert power so the caster's spell can take
 * +3 instead of the standing +1 — or null when there is no matching permanent
 * in play or no expert use is left, so the cast just keeps its basic bonus.
 */
export function discardSchoolPermanentForExpert(
  state: GameState,
  playerId: PlayerId,
  spellCard: CardDefinition
): { cardId: CardId; expertPower: number } | null {
  const player = state.players[playerId];
  const match = player ? getPermanentSchoolBonus(state, playerId, spellCard) : null;
  if (!player || !match || expertUsesAvailable(player) <= 0) {
    return null;
  }

  player.combatStats.expertUsesSpentThisRound += 1;
  discardPermanentFromPlay(state, playerId, match.card.id);
  enforcePermanentLimit(state, playerId);

  appendEvent(state, {
    type: "CARD_PLAYED",
    playerId,
    cardId: match.card.id,
    timing: match.card.timing,
    mode: "expert",
    effectAmount: match.expertPower
  });

  return { cardId: match.card.id, expertPower: match.expertPower };
}
