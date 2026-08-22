import { cardLibrary } from "@/data/cards/library";
import { allTileDefinitions } from "@/data/map/tiles";
import { countExtraBallistas, effectiveInitiative, hasBallistaChooseTarget, makeActiveEffect } from "./active-effects";
import {
  gainResources,
  getActiveAstrologersCard,
  hasResources,
  processPendingVisit,
  removePandoraIncomeProductionBonus,
  rollPandoraIncomePermanentDie,
  spendResources
} from "./adventure";
import { isAdjacent } from "./battlefield";
import { finishCombatIfNeeded, markUnitRemovedIfNeeded } from "./combat-units";
import { defenderOnFortification, destroyFortification, fortificationTargets, parseFortificationTargetId } from "./siege";
import { noteUnitDamagedForTokens } from "./tokens";
import { abilityExpertIsCrownFree, canPlayExpertMode, expertUsesAvailable } from "./ruleset";
import { houseRuleEnabled } from "./house-rules";
import { balanceCard } from "./community-balance-cards";
import { drawCardsForPlayer } from "./decks";
import { appendEvent, nextEventNumber } from "./events";
import type {
  CardDefinition,
  CardId,
  CombatUnitState,
  GameAction,
  GameState,
  PlayerId,
  SpellSchool,
  UnitId,
  WarMachineRoundStartDefinition
} from "./state";

/** The four elemental Magic schools (Magic Arrow's "any" picks among these). */
export type ElementalSchool = Exclude<SpellSchool, "any">;

export const ELEMENTAL_SCHOOLS: readonly ElementalSchool[] = ["air", "earth", "fire", "water"];

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

/**
 * Hand-limit bonus granted by in-play permanents (Pandora "hand +1").
 *
 * This sums `permanentEffect.handLimitBonus` — the same term `effectiveHandLimit`
 * (adventure.ts) inlines (they can't share: permanents.ts imports adventure.ts,
 * so the cycle forces the duplicate). The anime Cultivation Foundation hand-limit
 * bonus is NOT added here on purpose: this helper is PERMANENT-only, and the sole
 * effective-hand-limit computation live code reads is `effectiveHandLimit`, where
 * the cultivation bonus is folded (a Foundation realm is not a permanent card).
 */
export function permanentHandLimitBonus(state: GameState, playerId: PlayerId): number {
  return getPermanentDefinitions(state, playerId).reduce(
    (total, card) => total + (card.permanentEffect?.handLimitBonus ?? 0),
    0
  );
}

/**
 * Flat Power added to EVERY spell the player casts by in-play permanents
 * (Pandora's Bargain: Power, +1). Folded into both the affordability/preview
 * power (standingSpellPower) and the cast-time power (getCurrentSpellPower) so
 * the bonus actually changes spell outcomes rather than being display-only.
 */
export function permanentSpellPowerBonus(state: GameState, playerId: PlayerId): number {
  return getPermanentDefinitions(state, playerId).reduce(
    (total, card) => total + (card.permanentEffect?.spellPowerBonus ?? 0),
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
 * Conflux Elemental terrain (N14–N21): the Magic school a combat field's TILE
 * boosts, or null. Combat on ANY hex of an Elemental tile grants +1 Power to
 * Spells of that school (wiki tile terrain: Elemental Fire/Water/Air/Earth).
 * Sandbox fights and missing map context never grant a bonus.
 */
export function combatElementalSchool(state: GameState): ElementalSchool | null {
  const combat = state.combat;
  if (!combat || combat.context.kind === "sandbox") {
    return null;
  }
  const field = state.adventure?.fields[combat.context.fieldId];
  if (!field) {
    return null;
  }
  const tile = state.adventure?.tiles[field.tileInstanceId];
  if (!tile) {
    return null;
  }
  const terrain = allTileDefinitions[tile.tileDefId]?.terrain;
  if (terrain === "elemental_fire") {
    return "fire";
  }
  if (terrain === "elemental_water") {
    return "water";
  }
  if (terrain === "elemental_air") {
    return "air";
  }
  if (terrain === "elemental_earth") {
    return "earth";
  }
  return null;
}

/** +1 Power when the open combat sits on a matching Elemental terrain tile. */
export function elementalTileSpellPowerBonus(state: GameState, school: ElementalSchool): number {
  return combatElementalSchool(state) === school ? 1 : 0;
}

/**
 * School-scoped specialty Power (e.g. Adrienne's Fire Magic SPELL_SCHOOL_POWER_BONUS)
 * for ONE named school — never for Magic Arrow's "any" catch-all (callers pick a
 * school first). Sums every matching active-effect amount for that school.
 */
export function specialtySchoolPowerBonus(
  state: GameState,
  playerId: PlayerId,
  school: ElementalSchool
): number {
  let bonus = 0;
  for (const effect of state.activeEffects) {
    if (effect.controllerId !== playerId) {
      continue;
    }
    for (const modifier of effect.modifiers) {
      if (modifier.type === "SPELL_SCHOOL_POWER_BONUS" && modifier.school === school) {
        bonus += modifier.amount;
      }
    }
  }
  return bonus;
}

/**
 * School-scoped Orb double (SPELL_POWER_DOUBLE) for ONE school. Returns 2 when an
 * orb of that school is in play for the caster, else 1.
 */
export function schoolPowerMultiplierForSchool(
  state: GameState,
  playerId: PlayerId,
  school: ElementalSchool
): number {
  for (const effect of state.activeEffects) {
    if (effect.controllerId !== playerId) {
      continue;
    }
    for (const modifier of effect.modifiers) {
      if (modifier.type === "SPELL_POWER_DOUBLE" && modifier.school === school) {
        return 2;
      }
    }
  }
  return 1;
}

function permanentSchoolBonusForSchool(
  state: GameState,
  playerId: PlayerId,
  school: ElementalSchool
): { card: CardDefinition; basicPower: number; expertPower: number } | null {
  for (const card of getPermanentDefinitions(state, playerId)) {
    const bonus = card.permanentEffect?.schoolBonus;
    if (bonus && bonus.school === school) {
      return { card, basicPower: bonus.basicPower, expertPower: bonus.expertPower };
    }
  }
  return null;
}

/**
 * Magic Arrow wiki: "can benefit from spell power bonus to any school of magic,
 * but it can only be affected by a single school of magic at a time." Pick the
 * school whose permanent + Elemental-tile + specialty (and Orb double preference)
 * package is strongest. Fixed-school spells return their printed school.
 */
export function pickSpellSchoolForPower(
  state: GameState,
  playerId: PlayerId,
  spellCard: CardDefinition | undefined
): ElementalSchool | null {
  if (!spellCard || spellCard.kind !== "spell") {
    return null;
  }
  const schools = spellCard.spellSchools ?? [];
  if (!schools.includes("any")) {
    return ELEMENTAL_SCHOOLS.find((school) => schools.includes(school)) ?? null;
  }

  // Magic Arrow: auto-select the school with the highest Power package.
  let bestSchool: ElementalSchool | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const school of ELEMENTAL_SCHOOLS) {
    const permanent = permanentSchoolBonusForSchool(state, playerId, school);
    const additive =
      (permanent?.basicPower ?? 0) +
      elementalTileSpellPowerBonus(state, school) +
      specialtySchoolPowerBonus(state, playerId, school);
    // Prefer a school that also doubles (Orb) when additive totals tie — the
    // double multiplies the whole cast, so it is always the stronger package.
    const mult = schoolPowerMultiplierForSchool(state, playerId, school);
    const score = additive * 10 + (mult > 1 ? 1 : 0);
    if (score > bestScore) {
      bestScore = score;
      bestSchool = school;
    }
  }
  return bestSchool;
}

/**
 * The School of Magic permanent that can boost this spell (for the basic +1
 * while in play, and for the expert discard +3). Fixed-school spells need a
 * matching permanent. Magic Arrow (school "any") may use ANY school permanent
 * (wiki: any school, one at a time) — when several exist, prefer the permanent
 * in the strongest package so expert discards the best option.
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
  if (schools.includes("any")) {
    let best: { card: CardDefinition; basicPower: number; expertPower: number } | null = null;
    let bestScore = Number.NEGATIVE_INFINITY;
    for (const school of ELEMENTAL_SCHOOLS) {
      const permanent = permanentSchoolBonusForSchool(state, playerId, school);
      if (!permanent) {
        continue;
      }
      const score =
        permanent.basicPower +
        elementalTileSpellPowerBonus(state, school) +
        specialtySchoolPowerBonus(state, playerId, school);
      if (score > bestScore) {
        bestScore = score;
        best = permanent;
      }
    }
    return best;
  }

  const chosen = ELEMENTAL_SCHOOLS.find((school) => schools.includes(school));
  if (!chosen) {
    return null;
  }
  return permanentSchoolBonusForSchool(state, playerId, chosen);
}

/**
 * Standing / cast-time school-scoped additive Power from (a) the matching
 * School-of-Magic permanent's basic +1 and (b) the Conflux Elemental terrain
 * tile +1. Magic Arrow auto-picks the single school with the highest package
 * (wiki: one school at a time), so Water Magic never stacks with a Fire tile.
 * Expert (+3) is applied separately at cast (and replaces the permanent basic).
 */
export function schoolScopedStandingPower(
  state: GameState,
  playerId: PlayerId,
  spellCard: CardDefinition
): number {
  if (spellCard.kind !== "spell") {
    return 0;
  }
  const chosen = pickSpellSchoolForPower(state, playerId, spellCard);
  if (!chosen) {
    return 0;
  }
  const permanent = permanentSchoolBonusForSchool(state, playerId, chosen);
  return (permanent?.basicPower ?? 0) + elementalTileSpellPowerBonus(state, chosen);
}

function playerIsInCombat(state: GameState, playerId: PlayerId): boolean {
  return Boolean(
    state.combat &&
      !state.combat.outcome &&
      (state.combat.attackerPlayerId === playerId || state.combat.defenderPlayerId === playerId)
  );
}

/**
 * Instantiates the in-play permanents' combat presence for their owner: the
 * card-scoped active effects (First Aid Tent heal, Ammo Cart penalty waiver)
 * and the ranged initiative bonuses. Idempotent — each active effect doubles
 * as its card's "already applied" marker, so this may run at combat start, on
 * every round start and when a permanent enters play mid-combat. (A
 * rangedInitiativeBonus therefore needs a combatEffect on the same card.)
 *
 * A permanent's `rangedInitiativeBonus` (the Ammo Cart's printed "+2 [speed] to
 * your [ranged] units") rides the SAME player-scoped effect as a
 * `RANGED_INITIATIVE_BONUS` modifier — the arm Expert Archery already uses,
 * folded live by `effectiveInitiative` and therefore by `getActivationOrder`.
 * It must NOT be added straight onto `unit.initiative`: that field is a DERIVED
 * cache of the printed side, recomputed from scratch by `applyUnitCurrentSide`
 * (a Pack→Few flip, a Stack-Token absorb, a Polish Stack layer lost, a
 * specialty cover placed or defeated, a mid-combat Few→Pack reinforce), so a
 * baked-in bonus silently vanished mid-fight and the boosted shooter dropped
 * back down the activation order. Reading it live also means a unit summoned
 * AFTER combat start gets it, and a Pack shooter that flips to a melee Few
 * loses it — both what the printed card says.
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

    // The printed ranged initiative bonus joins the same effect (see the header):
    // a live modifier, never a write into the derived `unit.initiative` field.
    if (rangedInitiativeBonus) {
      effectDefinition = {
        ...effectDefinition,
        modifiers: [
          ...effectDefinition.modifiers,
          { type: "RANGED_INITIATIVE_BONUS", amount: rangedInitiativeBonus }
        ]
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
 * Removes a leaving permanent's combat presence so a mid-combat replacement
 * does not leave bonuses behind. Dropping the card's active effect is enough:
 * the ranged initiative bonus rides that effect as a RANGED_INITIATIVE_BONUS
 * modifier (see applyPermanentCombatEffectsForPlayer), so it stops being read
 * the moment the effect is gone — no reverse arithmetic to keep in sync.
 */
function removePermanentCombatEffects(state: GameState, playerId: PlayerId, card: CardDefinition): void {
  state.activeEffects = state.activeEffects.filter(
    (effect) => !(effect.source.type === "card" && effect.source.cardId === card.id && effect.controllerId === playerId)
  );
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
  if (discardId === "pandora.resource_income") {
    removePandoraIncomeProductionBonus(state, playerId);
  }
  setPermanentCardIds(
    state,
    playerId,
    inPlay.filter((candidate) => candidate !== discardId)
  );
  // Pandora's Box permanents are one-time use — like the Pandora one-shots, they
  // come from the Pandora deck, so when they leave play (replaced over the limit,
  // discarded voluntarily, or squeezed out by a shrinking limit) they leave the
  // GAME rather than the discard pile (which reshuffles into the player's deck).
  if (card?.kind === "pandora") {
    player.removed.push(discardId);
  } else {
    player.discard.push(discardId);
  }
  return discardId;
}

/**
 * Astrologers "Destruction": send one in-play permanent OUT OF THE GAME (the
 * removed pile, per the rulebook keyword "Remove" — NOT the discard pile) and
 * clean its combat presence up, then re-enforce the permanent limit in case the
 * removed card was itself raising it (Pandora's Box). Without an explicit id the
 * oldest permanent leaves (the card's singular "it"). Returns the removed card
 * id, or null when the player has no permanent in play.
 */
export function removePermanentFromPlayToRemoved(
  state: GameState,
  playerId: PlayerId,
  cardId?: CardId
): CardId | null {
  const player = state.players[playerId];
  const inPlay = getPermanentCardIds(state, playerId);
  const removeId = cardId ?? inPlay[0] ?? null;
  if (!player || !removeId || !inPlay.includes(removeId)) {
    return null;
  }

  const card = cardLibrary[removeId];
  if (card) {
    removePermanentCombatEffects(state, playerId, card);
  }
  if (removeId === "pandora.resource_income") {
    removePandoraIncomeProductionBonus(state, playerId);
  }
  setPermanentCardIds(
    state,
    playerId,
    inPlay.filter((candidate) => candidate !== removeId)
  );
  // "Remove" leaves the GAME (removed pile), not the discard — matching the
  // income-permanent "crack open" side and the rulebook keyword.
  player.removed.push(removeId);
  enforcePermanentLimit(state, playerId);
  return removeId;
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
 * May this card occupy a permanent slot at all? Either the card-wide
 * `permanent` flag (war machines, School of Magic, income artifacts) or a
 * printed `ENTER_PLAY` side on a hybrid card.
 */
export function cardMayEnterPlay(card: CardDefinition): boolean {
  if (card.permanent) {
    return true;
  }
  return (
    card.effect.type === "CHOOSE_ONE" && card.effect.options.some((option) => option.effect.type === "ENTER_PLAY")
  );
}

/**
 * Puts a hand card into play as one of the player's permanents. At the
 * limit — 1 as printed, up to 3 with the Pandora's Box exception — the
 * oldest permanent goes to the discard pile first ("playing another
 * discards the first").
 */
export function putPermanentIntoPlay(state: GameState, playerId: PlayerId, cardId: CardId): void {
  const player = state.players[playerId];
  // Balance packs: the COMMUNITY Endless Sack of Gold turns its instant "gain 5
  // gold" side into "♾️ At the beginning of each Resource round, gain 4 gold",
  // so the printed definition carries no ENTER_PLAY option and `cardMayEnterPlay`
  // would refuse the very play the reprint offers. Read the definition the rest
  // of the engine resolves with. With every pack off this is `cardLibrary[cardId]`.
  const card = balanceCard(state, cardId);
  if (!player || !card || !cardMayEnterPlay(card)) {
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

  // The replaced (oldest) card may have been the Pandora "up to 3" card that was
  // itself holding the door open — the limit is back to 1 the moment it leaves,
  // so the extras must go too. The just-played card is the newest and the
  // enforcement discards oldest-first, so it always survives.
  enforcePermanentLimit(state, playerId);

  // Pandora's Gift: Income — the ∞ permanent rolls its Resource die and raises
  // the selected production track while it stays in play.
  if (card.permanentEffect?.incomeTierDieOnEnter) {
    rollPandoraIncomePermanentDie(state, playerId);
  }

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

/**
 * The "crack open" instant of an income permanent (Eversmoking Ring of Sulfur,
 * Inexhaustible Cart of Ore): the card's CHOOSE_ONE option that REMOVES the card
 * from the game (`cost.removeSelf`) for a one-off resource gain. Returns that
 * option's gain, or null for a permanent with no such side (war machines,
 * Schools of Magic, Pandora's permanents). This is the side a player normally
 * picks at play time INSTEAD of entering play; exposing it here lets it be used
 * later, once the income side is already in the permanent slot.
 */
export function permanentCrackOpenGain(
  cardId: CardId
): { gold?: number; buildingMaterials?: number; valuables?: number } | null {
  const card = cardLibrary[cardId];
  if (card?.effect.type !== "CHOOSE_ONE") {
    return null;
  }
  for (const option of card.effect.options) {
    if (option.cost?.removeSelf && option.effect.type === "GAIN_RESOURCES" && !option.effect.goldCost) {
      return option.effect.gain;
    }
  }
  return null;
}

/**
 * Crack an in-play income permanent open for its instant gain: remove the card
 * from the game (the "Remove this card" cost) and grant the one-off resources.
 * This is the fix for "can't use its instant effect when it's in the permanent
 * slot" — the instant side was previously reachable only from hand, so once the
 * income side had been chosen the burst gain was lost forever.
 */
export function crackPermanentForInstant(
  state: GameState,
  action: Extract<GameAction, { type: "CRACK_PERMANENT" }>
): void {
  const player = state.players[action.playerId];
  const inPlay = getPermanentCardIds(state, action.playerId);
  if (!player || !inPlay.includes(action.cardId)) {
    throw new Error("That permanent is not in play.");
  }

  const gain = permanentCrackOpenGain(action.cardId);
  if (!gain) {
    throw new Error("That permanent has no instant effect to use.");
  }

  const card = cardLibrary[action.cardId];
  if (card) {
    removePermanentCombatEffects(state, action.playerId, card);
  }
  setPermanentCardIds(
    state,
    action.playerId,
    inPlay.filter((candidate) => candidate !== action.cardId)
  );
  // "Remove this card": it leaves the GAME (removed pile), not the discard, so
  // it can neither be re-drawn nor return to play — matching the from-hand side.
  player.removed.push(action.cardId);

  gainResources(state, action.playerId, gain, `cracked open ${card?.name ?? action.cardId}`);

  appendEvent(state, {
    type: "PERMANENT_DISCARDED",
    playerId: action.playerId,
    cardId: action.cardId,
    reason: "cracked"
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

  if (head.openingBallistics) {
    return { cardId: head.cardId, roundStart: { kind: "pay-to-splash", cost: { buildingMaterials: 1 }, amount: 1 } };
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
  const lowest = Math.min(...enemies.map((unit) => effectiveInitiative(unit, state.activeEffects, state.combat)));
  return enemies.filter((unit) => effectiveInitiative(unit, state.activeEffects, state.combat) === lowest);
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
  const combat = state.combat;
  const siege = combat?.siege;
  if (combat && siege) {
    for (const fort of fortificationTargets(siege)) {
      // A defender standing on the Gate shields it — it cannot be battered while
      // occupied, so leave it out of the Catapult's target list (the defender
      // unit on it is still targetable as an ordinary unit).
      if (defenderOnFortification(combat, siege, fort.position)) {
        continue;
      }
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

/**
 * Cannon targets: enemy units plus the defender's standing fortifications when
 * the Cannon owner is the besieger. A town defender can never shoot down their
 * own Walls/Gate.
 */
function cannonTargetIds(state: GameState, playerId: PlayerId): UnitId[] {
  const targets: UnitId[] = enemiesOf(state, playerId).map((unit) => unit.id);
  const combat = state.combat;
  const siege = combat?.siege;
  if (combat && siege && playerId !== siege.townPlayerId) {
    // Skip a Gate a defender is standing on — it is shielded and cannot be shot
    // down while occupied.
    targets.push(
      ...fortificationTargets(siege)
        .filter((target) => !defenderOnFortification(combat, siege, target.position))
        .map((target) => target.id)
    );
  }
  return targets;
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
      // An EMPOWERED Artillery plays its Expert volley with no crown, so it must
      // be offered at 0 crowns too (canPlayExpertMode is the shared read).
      canPlayExpertMode(player, ARTILLERY_ABILITY_ID) &&
      artilleryVolleyShots() > 1
  );
}

const BALLISTA_CARD_ID = "war_machine.ballista" as CardId;
const BALLISTICS_ABILITY_ID = "ability.ballistics" as CardId;
/** Polish Balance Pack: the reprinted Ballistics EXPERT doubles a Catapult volley. */
export const BALLISTICS_CATAPULT_SHOTS = 2;

/**
 * Polish Balance Pack — the reprinted BALLISTICS EXPERT: "When using the Catapult
 * use it effect twice on the same targets WITHOUT PAYING ITS COST." Offered at the
 * Catapult's own round-start prompt (the Artillery-volley pattern): the holder
 * needs the card in hand and a free crown (an Empowered Ballistics pays none).
 */
export function playerCanUseBallisticsCatapultDouble(state: GameState, playerId: PlayerId): boolean {
  const player = state.players[playerId];
  return Boolean(
    // The Community Balance Change reprints the SAME expert clause ("When using
    // the catapult, resolve its effect twice ignoring the stone cost"), so its
    // rule opens the identical offer. Either pack alone is enough.
    (houseRuleEnabled(state, "polish-card-balance") || houseRuleEnabled(state, "community-card-balance")) &&
      player &&
      player.hand.includes(BALLISTICS_ABILITY_ID) &&
      canPlayExpertMode(player, BALLISTICS_ABILITY_ID)
  );
}

/** Pays the Ballistics expert cost: a crown (unless Empowered) and the card. */
function spendBallisticsExpert(state: GameState, playerId: PlayerId): void {
  const player = state.players[playerId];
  if (!player) {
    return;
  }
  if (!abilityExpertIsCrownFree(player, BALLISTICS_ABILITY_ID)) {
    player.combatStats.expertUsesSpentThisRound += 1;
  }
  const handIndex = player.hand.indexOf(BALLISTICS_ABILITY_ID);
  if (handIndex !== -1) {
    player.hand.splice(handIndex, 1);
    player.discard.push(BALLISTICS_ABILITY_ID);
  }
  appendEvent(state, {
    type: "CARD_PLAYED",
    playerId,
    cardId: BALLISTICS_ABILITY_ID,
    timing: cardLibrary[BALLISTICS_ABILITY_ID]?.timing ?? "instant",
    mode: "expert",
    optionLabel: "Ballistics: resolve the Catapult twice on the same targets, free"
  });
}

/**
 * Polish Balance Pack (`polish-card-balance`) — Artillery's ongoing rider, on
 * BOTH printed sides: "If you have a Balista card played, until the end of this
 * combat you can choose its targets."
 *
 * REUSE, not a new arm: it pushes the very same `BALLISTA_CHOOSE_TARGET` effect
 * Gerwulf's Ballista VI grants, so every downstream read (the round-start target
 * offer via `hasBallistaChooseTarget`) picks it up unchanged. Conditions, all
 * from the printed line: the rule is on, a combat is open, the player really has
 * a Ballista in play, and they are not already aiming it (a second copy of the
 * effect would be noise). Returns whether the freedom was granted.
 *
 * Note the printed timing consequence: a Ballista fires at ROUND START, so the
 * aim this grants first bites on the NEXT combat round — exactly what "until the
 * end of this combat" buys.
 */
export function grantBalanceBallistaAim(state: GameState, playerId: PlayerId): boolean {
  // The Community Balance Change prints the aim on its EXPERT side only ("…
  // resolve its effect against the same target 3 times. You may select the
  // target."), which is exactly the call from `spendArtilleryExpert`. Its BASIC
  // side is a plain DEAL_DAMAGE and never reaches the other call site (the
  // printed `DAMAGE_LOWEST_INITIATIVE_ENEMY` branch, which only the classic /
  // Polish Artillery resolves).
  if (
    (!houseRuleEnabled(state, "polish-card-balance") && !houseRuleEnabled(state, "community-card-balance")) ||
    !state.combat
  ) {
    return false;
  }
  if (!getPermanentCardIds(state, playerId).includes(BALLISTA_CARD_ID)) {
    return false;
  }
  if (hasBallistaChooseTarget(state, playerId)) {
    return false;
  }
  state.activeEffects.push(
    makeActiveEffect(
      state,
      {
        name: "Artillery (aim your Ballista)",
        scope: "player",
        duration: { type: "combat" },
        polarity: "positive",
        removable: false,
        modifiers: [{ type: "BALLISTA_CHOOSE_TARGET" }]
      },
      { type: "card", cardId: ARTILLERY_ABILITY_ID, controllerId: playerId },
      playerId
    )
  );
  return true;
}

/** Pays the Artillery expert cost: spend a crown (unless Empowered) and play (discard) the card. */
function spendArtilleryExpert(state: GameState, playerId: PlayerId): void {
  const player = state.players[playerId];
  if (!player) {
    return;
  }
  if (!abilityExpertIsCrownFree(player, ARTILLERY_ABILITY_ID)) {
    player.combatStats.expertUsesSpentThisRound += 1;
  }
  // Balance Pack: the reprinted EXPERT side also carries the aim rider
  // ("Until the end of this combat you can choose the targets of your Balista").
  grantBalanceBallistaAim(state, playerId);
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
/**
 * Polish Balance Pack: the reprinted First Aid moves the Tent triple-volley off
 * the crown — it is the BASIC side's OR arm (the card's own
 * `expertUnlessHouseRule: "polish-card-balance"`), so no crown is needed or spent.
 */
function firstAidVolleyIsBasic(state: GameState): boolean {
  // COMMUNITY WINS over Polish for a card both packs reprint: the Community
  // Balance Change keeps the Tent volley on the EXPERT side (⚡, crown) and only
  // adds "Draw a card." — so with both rules on the volley costs a crown again.
  if (houseRuleEnabled(state, "community-card-balance")) {
    return false;
  }
  return houseRuleEnabled(state, "polish-card-balance");
}

/**
 * Cards drawn by the First Aid Tent volley, read off the ACTIVE card definition
 * (the Community Balance Change reprint prints "Draw a card."; the printed and
 * Polish cards print none).
 */
function firstAidVolleyDraws(state: GameState): number {
  const effect = balanceCard(state, FIRST_AID_ABILITY_ID)?.effect;
  if (effect?.type === "CHOOSE_ONE") {
    for (const option of effect.options) {
      if (option.effect.type === "FIRST_AID_TENT_VOLLEY") {
        return option.effect.drawCards ?? 0;
      }
    }
  }
  return 0;
}

export function playerCanUseFirstAidVolley(state: GameState, playerId: PlayerId): boolean {
  const player = state.players[playerId];
  return Boolean(
    player &&
      player.hand.includes(FIRST_AID_ABILITY_ID) &&
      // An EMPOWERED First Aid plays its Expert volley with no crown — and under
      // the Balance Pack the volley is a BASIC side, so no crown at all.
      (firstAidVolleyIsBasic(state) || canPlayExpertMode(player, FIRST_AID_ABILITY_ID)) &&
      firstAidVolleyHeals() > 1
  );
}

/** Pays the First Aid expert cost: spend a crown (unless Empowered) and play (discard) the card. */
export function spendFirstAidExpert(state: GameState, playerId: PlayerId): void {
  const player = state.players[playerId];
  if (!player) {
    return;
  }
  if (!firstAidVolleyIsBasic(state) && !abilityExpertIsCrownFree(player, FIRST_AID_ABILITY_ID)) {
    player.combatStats.expertUsesSpentThisRound += 1;
  }
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
    mode: firstAidVolleyIsBasic(state) ? "basic" : "expert"
  });
  // Community Balance Change: "… resolve its effect against the same target 3
  // times. Draw a card." The draw happens as the card is played (before the
  // heals resolve), and the card itself is already in the discard, so it can
  // never be drawn back by its own rider.
  const draws = firstAidVolleyDraws(state);
  if (draws > 0) {
    drawCardsForPlayer(state, playerId, draws);
  }
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
  skipLabel = "Skip",
  // Extra options APPENDED after fire/skip, so every pre-existing index keeps its
  // meaning (index 0 fires, 1 skips) — the Balance Pack's Ballistics double is
  // index 2. Same convention the Diplomacy Legion offers use.
  extraLabels: string[] = []
): void {
  const choiceId = `choice_${nextEventNumber(state)}`;
  state.pendingChoice = {
    id: choiceId,
    type: "OPTION_CHOICE",
    playerId,
    prompt,
    options: [{ label: fireLabel }, { label: skipLabel }, ...extraLabels.map((label) => ({ label }))],
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

export function ballisticsOpeningBombardAvailable(state: GameState): boolean {
  return splashFirstTargets(state).length > 0;
}

/** Starts the balance Ballistics basic shot after its card/resource cost is paid. */
export function openBallisticsOpeningBombard(state: GameState, playerId: PlayerId, amount = 1): void {
  const combat = state.combat;
  const candidates = splashFirstTargets(state);
  if (!combat || candidates.length === 0) {
    throw new Error("Ballistics requires two adjacent targets (units, Walls, or the Gate).");
  }
  combat.warMachineRound = {
    pending: [{ playerId, cardId: BALLISTICS_ABILITY_ID, openingBallistics: true }],
    firstTargetUnitId: null
  };
  openWarMachineTargetChoice(
    state,
    playerId,
    "Ballistics: choose the first of two adjacent targets — a unit, Wall or the Gate.",
    candidates.map((target) => target.id),
    amount
  );
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
      // Balance Pack: the Ballistics expert fires this WITHOUT paying, so a broke
      // owner still gets the offer when they hold it.
      const ballistics = playerCanUseBallisticsCatapultDouble(state, playerId);
      const canPay = Boolean(player && hasResources(player, roundStart.cost));
      if (!player || (!canPay && !ballistics) || splashFirstTargets(state).length === 0) {
        queue.pending.shift();
        continue;
      }

      openWarMachineOffer(
        state,
        playerId,
        `${name}: pay 1 building material to hit 2 adjacent targets for ${roundStart.amount} damage each?`,
        // The Catapult keeps its printed wording; the Balance Pack's in-play
        // Ballistics reprint drives the SAME offer and must name itself.
        entry.cardId === "war_machine.catapult" ? "Fire the Catapult" : `Fire ${name}`,
        "Skip",
        ballistics
          ? [
              `Play Ballistics (expert): resolve the Catapult ${BALLISTICS_CATAPULT_SHOTS}× on the same targets, free`
            ]
          : []
      );
      return;
    }

    // expert-shot (Cannon)
    if (!hasExpertUseLeft(state, playerId) || cannonTargetIds(state, playerId).length === 0) {
      queue.pending.shift();
      continue;
    }

    openWarMachineOffer(
      state,
      playerId,
      `${name}: spend 1 expert use to hit one enemy unit, Wall or Gate?`,
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
      const candidates = hasBallistaChooseTarget(state, playerId)
        ? Object.values(state.combat?.units ?? {}).filter(
            (unit) => unit.controllerId !== playerId && isAlive(unit)
          )
        : lowestInitiativeEnemies(state, playerId);
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

  // Balance Pack: option 2 on a Catapult offer is the Ballistics expert double.
  const ballisticsDouble =
    roundStart.kind === "pay-to-splash" &&
    optionIndex === 2 &&
    playerCanUseBallisticsCatapultDouble(state, playerId);

  if (optionIndex !== 0 && !ballisticsDouble) {
    queue.pending.shift();
    processWarMachineRound(state);
    return;
  }

  const name = warMachineName(state, playerId);

  if (roundStart.kind === "pay-to-splash") {
    const player = state.players[playerId];
    if (!player || (!ballisticsDouble && !hasResources(player, roundStart.cost))) {
      throw new Error("Not enough resources to fire.");
    }
    if (splashFirstTargets(state).length === 0) {
      throw new Error("Catapult requires two adjacent targets (units, Walls, or the Gate).");
    }
    if (ballisticsDouble) {
      // "…twice on the same targets WITHOUT PAYING ITS COST": no building
      // material, and both chosen targets are hit BALLISTICS_CATAPULT_SHOTS times
      // (the same `volleyShots` slot the Artillery volley rides).
      spendBallisticsExpert(state, playerId);
      queue.volleyShots = BALLISTICS_CATAPULT_SHOTS;
    } else {
      spendResources(state, playerId, roundStart.cost, `${name} shot`);
    }
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
    `${name}: choose the enemy unit, Wall or Gate to hit.`,
    cannonTargetIds(state, playerId),
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
    // `volleyShots` is 1 for every ordinary Catapult shot; the Balance Pack's
    // Ballistics expert sets 2, so BOTH chosen targets take the doubled hit (the
    // second target reads the same slot at the tail of this function).
    for (let shot = 0; shot < (queue.volleyShots ?? 1); shot += 1) {
      applyCatapultHit(state, playerId, targetUnitId, amount);
    }

    const neighbors =
      firstPosition === null
        ? []
        : splashTargets(state).filter(
            (target) => target.id !== targetUnitId && isAdjacent(target.position, firstPosition)
          );

    if (neighbors.length === 0) {
      queue.volleyShots = null;
      queue.firstTargetUnitId = null;
      queue.pending.shift();
      processWarMachineRound(state);
      return;
    }

    if (neighbors.length === 1) {
      // The lone second target takes the same doubled hit a chosen one would.
      for (let shot = 0; shot < (queue.volleyShots ?? 1); shot += 1) {
        applyCatapultHit(state, playerId, neighbors[0].id, amount);
      }
      queue.volleyShots = null;
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

/**
 * Whether `playerId` already owns a copy of the war machine `cardId` — in hand,
 * deck, discard, or in play as a permanent. HOUSE RULE: the War Machine supply
 * is NOT a shared single-copy pool that empties for the whole table when one
 * player buys a machine ("1 player buys the Tent → nobody else ever can" was the
 * bug). Each player may buy every machine ONCE; the only limit is that a player
 * never holds two copies of the SAME machine. A removed (out-of-game) copy does
 * not count, so a player who removed their Tent may buy another. Buying never
 * depletes the catalog, so another player is never shut out.
 */
export function playerOwnsWarMachine(state: GameState, playerId: PlayerId, cardId: CardId): boolean {
  const player = state.players[playerId];
  if (!player) {
    return false;
  }
  return (
    player.hand.includes(cardId) ||
    player.deck.includes(cardId) ||
    player.discard.includes(cardId) ||
    getPermanentCardIds(state, playerId).includes(cardId)
  );
}

/**
 * Machines this player may still buy at this shop, with the shop's price. The
 * catalog (`warMachineSupply`) never depletes; a machine drops out only when
 * THIS player already owns a copy (per-player uniqueness), so one buyer can
 * never remove a machine from everyone else's menu.
 */
export function warMachinesForSale(
  state: GameState,
  pricing: "factory" | "trading-post",
  playerId?: PlayerId
): { cardId: CardId; card: CardDefinition; cost: NonNullable<CardDefinition["warMachineCosts"]>["factory"] }[] {
  const supply = state.adventure?.warMachineSupply ?? [];
  // Artificer commander ("Tinkerer"): war machines cost this player 5 less
  // gold, to a minimum of 0, at both shops. Applied here so the displayed
  // price and buyWarMachine (which re-derives the same offer) always agree.
  const tinkerer = playerId ? state.players[playerId]?.commander : undefined;
  const goldDiscount = tinkerer && !tinkerer.dead && tinkerer.slug === "factory" ? 5 : 0;
  return supply.flatMap((cardId) => {
    // Community Balance Change: the sheet re-prices the Ammo Cart, the Ballista
    // and the First Aid Tent at BOTH shops, so this shop menu must read the
    // BALANCE definition — a raw `cardLibrary` read would show (and charge) the
    // printed price while the pack is on. `buyWarMachine` re-derives its price
    // from this very function, so the label and the spend can never disagree.
    const card = balanceCard(state, cardId);
    const costs = card?.warMachineCosts;
    if (!card || !costs) {
      return [];
    }
    if (playerId && playerOwnsWarMachine(state, playerId, cardId)) {
      return [];
    }
    const printed = pricing === "factory" ? costs.factory : costs.tradingPost;
    const cost = goldDiscount
      ? { ...printed, gold: Math.max(0, (printed.gold ?? 0) - goldDiscount) }
      : printed;
    return [{ cardId, card, cost }];
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

  // A Marketplace-Event trading step (tradesOnly) is the resource exchange
  // alone — war machines are not on offer there.
  const pricing =
    step?.type === "WAR_MACHINE_SHOP"
      ? "factory"
      : step?.type === "TRADING_POST" && !step.traded && !step.tradesOnly
        ? "trading-post"
        : null;
  if (!pricing) {
    throw new Error("This visit cannot buy a war machine any more.");
  }

  const offer = warMachinesForSale(state, pricing, action.playerId).find(
    (candidate) => candidate.cardId === action.cardId
  );
  const player = state.players[action.playerId];
  if (!offer || !player) {
    throw new Error("That war machine is not available to buy.");
  }

  if (!hasResources(player, offer.cost)) {
    throw new Error("Not enough gold for that war machine.");
  }

  spendResources(state, action.playerId, offer.cost, `bought the ${offer.card.name}`);
  // The catalog is NOT depleted (each player may buy each machine once — see
  // playerOwnsWarMachine); the card goes to the buyer's hand.
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
  // An EMPOWERED School of Magic ability discards for its expert bonus without a
  // crown — the same waiver every other Expert side of an ability gets.
  if (!player || !match || !canPlayExpertMode(player, match.card.id)) {
    return null;
  }

  if (!abilityExpertIsCrownFree(player, match.card.id)) {
    player.combatStats.expertUsesSpentThisRound += 1;
  }
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
