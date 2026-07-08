import { cardLibrary } from "@/data/cards/library";
import { REROLL_REACTION_ARTIFACT_IDS } from "@/data/cards/artifacts";
import { sampleBuildings } from "@/data/towns/buildings";
import { coreUnitDefinitions } from "@/data/factions/units";
import {
  addArmyUnit,
  changeMorale,
  commitPopulationOnMove,
  ensureUniqueArmyUnitIds,
  gainResources,
  getActiveAstrologersCard,
  getMainHero,
  getUnitSide,
  hasDuplicateArmyUnitIds,
  healLegacyPlayerFields,
  isSeaField,
  liftSeaHaltForWaterWalk,
  makeCombatUnitFromArmy,
  NEUTRAL_DECK_IDS,
  openNeutralRecruitOffer,
  queueLegionDiscountChoice,
  queueNecromancyReinforce,
  raiseIncomeByResourceDie
} from "./adventure";
import {
  applyUnitCurrentSide,
  canPlaceTransformOn,
  insertUnitTransform,
  makeUnitTransformState
} from "./unit-transforms";
import {
  blacksmithAction,
  magicUniversityAction,
  buildStructureAdventure,
  chooseOption,
  continueNeutralCombat,
  discoverTile,
  finalizeAdventureCombat,
  finishCombatPlacement,
  acceptCombat,
  finishTactics,
  giveUpAdventure,
  hallOfValhallaBoost,
  resolveAfkDrop,
  openDiplomacyRecruit,
  openVisionsScry,
  openSiegeDemolishChoice,
  openRemoveObstacleChoice,
  openSkeletonReinforceChoice,
  moveHeroAdventure,
  moveHeroPathAdventure,
  openDimensionDoorChoice,
  openViewEarthChoice,
  openMarket,
  openSharedDeckSearch,
  openFortuneBoostStep,
  hireSecondaryHero,
  placeCombatUnit,
  swapCombatUnits,
  placeTile,
  placeObservatoryTile,
  populationAction,
  pumpAdventureQueues,
  openDiscardPickChoice,
  giveUpCombat,
  refreshHand,
  resolveVisitStep,
  retreatFromCombat,
  surrenderFromCombat,
  revisitField,
  roguesScoutDeck,
  satyrMoraleRoll,
  thievesGuildAction,
  setTileRotation,
  skipNecromancy,
  commanderGradeUp,
  reviveCommander,
  resolveCommanderFirstAid,
  commanderSetStance,
  spellBookAction,
  spendMorale,
  spendTownCube,
  activateTownBuilding,
  astrologersHeroEmpower,
  tradeResources,
  sellScrollSpell,
  unplaceCombatUnit,
  endTurnAdventure
} from "./adventure-reducer";
import {
  banHero,
  cancelStartAdventure,
  chooseFaction,
  chooseTown,
  confirmStartAdventure,
  randomAssignSeat,
  resetSeatDraft,
  rollHeroOptions,
  rollTownOptions,
  setDraftFormat,
  setGameOptions,
  startAdventureFromLobby
} from "./adventure-setup";
import {
  assignSeat,
  joinRoom,
  kickMember,
  leaveRoom,
  roomActionGuard,
  setRoomHosted,
  setRoomName,
  setRoomRanked,
  setRoomRequireAuth,
  transferHost
} from "./room";
import { sendTableReaction } from "./table-reactions";
import { sendChat } from "./chat";
import {
  hasOpenAdventureTurn,
  isRoundStartEventBarrierActive,
  parallelInteractionBlocker,
  parallelSlotSignature,
  parallelWaitMessage,
  roundStartEventResolver
} from "./parallel-turns";
import {
  ATTACK_DIE_FACES,
  BATTLEFIELD_CELL_COUNT,
  BATTLEFIELD_COLUMNS,
  BATTLEFIELD_ROWS,
  getBattlefieldCoordinates,
  getBattlefieldDistance,
  getBattlefieldLabel,
  getOrthogonalNeighbors,
  isBattlefieldPosition,
  planMovePath
} from "./battlefield";
import { appendExpiredEffectEvents, finishCombatIfNeeded, markUnitRemovedIfNeeded } from "./combat-units";
import { isNeutralUnit, pickNeutralTarget, planNeutralActivation, sortNeutralTargetCandidates } from "./neutral-ai";
import {
  activateBallistas,
  applyPermanentCombatEffectsForPlayer,
  applyWarMachineDamage,
  buyWarMachine,
  countBallistas,
  crackPermanentForInstant,
  discardPermanentFromPlay,
  discardPermanentVoluntarily,
  discardSchoolPermanentForExpert,
  firstAidVolleyHeals,
  getPermanentCardIds,
  getPermanentSchoolBonus,
  isLowestInitiativeEnemy,
  playerCanUseFirstAidVolley,
  playerOwnsWarMachine,
  putPermanentIntoPlay,
  resolveWarMachineTarget,
  spendFirstAidExpert,
  startWarMachineRound
} from "./permanents";
import { createSeededRandom, setActiveEntropy } from "./random";
import { hexDistance, parseHexSpaceId } from "./hex";
import {
  abilityExpertIsCrownFree,
  activeSchoolFetches,
  canAcquireSharedDeckCard,
  discardPickAllowedInCombat,
  estatesGold,
  getRuleset,
  spellBookPowerAvailable,
  spellBookRuleEnabled,
  spellCanEnterSpellBook,
  spellLimitFor,
  unitSideRuleOverrides,
  SPELL_DECK_BASIC,
  SPELL_DECK_EXPERT
} from "./ruleset";
import { houseRuleEnabled } from "./house-rules";
import { consumeHeldMoraleCard, playerHoldsMoraleCard, returnHeldMoraleCardToDeckBottom } from "./morale-cards";
import { MORALE_CARD_IDS } from "@/data/cards/morale";
import {
  destroyFortification,
  getDemolishAbility,
  intactFortificationPositions,
  isArrowTowerUnit,
  removeArrowTower,
  siegeRangedDamageReduction
} from "./siege";
import {
  expireTokensAtRoundEnd,
  hasToken,
  noteUnitDamagedForTokens,
  placeCombatToken,
  removeToken,
  tokenAttackBonus,
  tokenDefenseDelta
} from "./tokens";
import {
  attackRerollsBlocked,
  cardDamageNullified,
  effectAppliesToUnit,
  effectiveInitiative,
  unitAttackRollDisadvantaged,
  unitImmuneToSpellSchoolsByEffect,
  expireEffectsForActivationEnd,
  expireEffectsForCombatRoundEnd,
  expireEffectsForTurnEnd,
  getActiveAttackBonus,
  getActiveDefenseBonus,
  getAttackerTypeDefenseBonus,
  getAttackRerollEffects,
  getConditionalAttackBonus,
  getConditionalDefenseBonus,
  hasActiveIgnoresDefense,
  hasActiveRetaliationDisadvantage,
  getSchoolPowerBonus,
  makeActiveEffect,
  releaseEndedOngoingCards,
  spellNullifiedByRestriction,
  syncAbilitySuppression,
  unitDealsElementalDamage,
  unitHasUnlimitedRetaliationEffect,
  unitImmuneToParalysis
} from "./active-effects";
import { applyAfkBookkeeping, castAfkVote, forceAfkKick, startAfkVote } from "./afk";
import { appendEvent, eventSeedNumber, nextEventNumber } from "./events";
import { gainRunes, gainRunesForAttack, gainRunesForDefend, grantStartingRunes, spendRunes } from "./runes";
import { commanderCastTierIndex } from "@/data/commanders";
import {
  applyCommanderRuneRitual,
  commanderCastCandidates,
  commanderCastOf,
  commanderCastPower,
  commanderCastRuneCost,
  commanderCastUsedThisRound,
  commanderRunePool
} from "./commanders";
import { drawCardsForPlayer, isSharedDeckId, shuffleCards } from "./decks";
import {
  cancelSpellAllowsSchoolAndLevel,
  cardCanBoostPower,
  getEffectAmount,
  getEffectDamageAmount,
  getEffectiveCardEffect,
  getSpellDamageAmount,
  spellPowerSourceDrawCards,
  spellPowerValueOfCard
} from "./effects";
import {
  canUnitAttack,
  canUnitMoveAndAttack,
  canUnitMoveTo,
  canPlayerBuildStructure,
  getAttackKind,
  getAttackRollMode,
  getBlockedSpaces,
  getLegalActions,
  getLegalMoveDestinations,
  getUnitMoveRange,
  combatEnemyImposesPowerTax,
  combatEnemyLocksSpells,
  getActivationStep,
  getLegalReactionsForTrigger,
  getOffTurnCombatReactions,
  isAdjacent,
  isHandLockedInCombat,
  isUnitAlive,
  payablePowerCardIds,
  playerHasAttackInstantOfSchool,
  reflectableAttackInstantForPlayer,
  resolvedSpellPowerForStackItem,
  rerollSourceAvailableFor,
  spellAbilitiesSuppressed,
  spellRedirectTargets,
  standingSpellPower
} from "./legal-actions";
import {
  getActivationAbilities,
  getActivationDamageSpellAbility,
  getActivationSpellPowerBoost,
  getAfterRetaliationAttackAbility,
  getAttackBonusAfterMove,
  getAttackBonusIfFlipped,
  getAttackBonusOnAttackDie,
  getAttackBonusVsDefenderName,
  getAttackBonusVsMarked,
  getAttackDefenseReductionAbility,
  getBonusDamageOnHit,
  getDamageCapPerAttack,
  getOnKillResourceGain,
  getAttackDieDamageFollowUps,
  getAttackDieResultBonus,
  getDeathStareFollowUps,
  getDefenseBonusOnAttackDie,
  getDefenseBonusWhenRetaliated,
  getDefenseDieDamageReduction,
  getDoubleAttackAbility,
  getCardNegateOnDie,
  getDeckDiscardTakeSpell,
  getEnchanterActivationAbility,
  getEnemyDiscardAbility,
  getFlatAttackBonus,
  getOwnAttackFlatBonus,
  getInvulnerabilityActivation,
  isUnitDamageImmune,
  getSplashAllocationAttack,
  getPlaceFactionCubeActivation,
  getGainFactionCubeOnKill,
  getSpendCubeAttackAgain,
  getPreemptiveRetaliation,
  getUnitsAdjacentTo,
  getAstrologersRoundFrenzy,
  getMinimumAttackDie,
  getOnAttackFireWallDamage,
  getOnKillHealthHarvest,
  getOnKillWeakCopy,
  isMechanicalUnit,
  getOnAttackEnemyDiscard,
  getOnAttackParalysis,
  hasSelfDefenseToken,
  getFlatDamageFollowUps,
  getForcedAttackerDie,
  getDiscardToIgnoreAttackDieAbility,
  getIgnoreTargetCardDefenseAbility,
  getKnockbackAbility,
  getLethalSaveUnitAbility,
  getLineAttackAbility,
  getOnAttackDieDraw,
  getOnAttackDieTokens,
  getOnAttackPoisonCubes,
  getOnAttackSelfHeal,
  getParalysisFollowUps,
  getPostAttackAbilityDamageEffects,
  getRetaliationAgainstAttackPenalty,
  getRetaliationParalysis,
  getRollTwoDiceApplyBoth,
  getReturnAfterAttackAbility,
  getSecondAttackAbility,
  getSecondAttackCandidates,
  getSelfAdjacentSecondAttackAbility,
  getSpecialtyDamageReduction,
  getSpellDamageReduction,
  getSpellSchoolDamageReduction,
  getSpellDamageReductionAura,
  getTriggeredAttackDieBonusAbilities,
  getUnitAbilityDefinitions,
  getUnitAttackRerollSources,
  hasBindAdjacentEnemies,
  hasInnateMagicMirror,
  getDefendBonus,
  getSelfAttackerTypeDefenseBonus,
  hasDefenseTokenAura,
  hasIgnoreOwnAttackDie,
  hasImmuneToSpecialtyDamage,
  hasRetaliationAgainstDisadvantage,
  hasSpellCastHandTax,
  hasSpellCastPowerTax,
  hasUnitAbilityEffect,
  isUndeadUnit,
  unitImmuneToSpellSchools
} from "./unit-abilities";
import type {
  ActiveEffectDefinition,
  ActiveEffectModifier,
  ActiveEffectState,
  AttackRerollSource,
  AttackRollCandidate,
  AttackRollMode,
  BuildingLibrary,
  BattlefieldTokenKind,
  BattlefieldTokenState,
  CardDefinition,
  EffectDurationDefinition,
  CardId,
  CardLibrary,
  CardOptionDefinition,
  CardPlayCost,
  CardPlayMode,
  CombatState,
  DeckId,
  CombatUnitState,
  EffectDefinition,
  EngineResult,
  GameAction,
  GameEvent,
  GameState,
  LegalAction,
  PlayerId,
  PlayerState,
  PendingChoice,
  ResourceCost,
  ResourceKind,
  ResolutionStackItem,
  RulesError,
  SpellSchool,
  TargetRef,
  UnitGrade,
  UnitId,
  VisitStep
} from "./state";
import { NEUTRAL_PLAYER_ID } from "./state";

type ReducerOptions = {
  cards?: CardLibrary;
  buildings?: BuildingLibrary;
  /**
   * Stable id of the client submitting this action (attached by the transport
   * layer). The value the client *claims* — used to enforce seat ownership for a
   * GUEST in a hosted room (see `roomActionGuard`). Omitted by engine tests and
   * the open-table path.
   */
  actorClientId?: string;
  /**
   * The VERIFIED account id of the client submitting this action, resolved by
   * the SERVER from an authenticated session (Phase 2 — verified-identity
   * seats). When present it is authoritative: `roomActionGuard` binds the actor
   * to the member holding this id and ignores a spoofed `actorClientId`, and
   * `joinRoom` stamps it onto the member. Undefined for guests, keeping the
   * engine isomorphic and network-free for tests.
   */
  actorUserId?: string;
  /**
   * Fresh per-action crypto entropy minted by the authoritative server
   * (party/index.ts and submitRoomAction). While an action runs this salts every
   * seeded RNG draw (see random.ts), so live play is genuinely unpredictable and
   * non-reproducible from the game seed. Omitted by the engine test suite, which
   * keeps the seeded behaviour deterministic.
   */
  entropy?: string;
  /**
   * Server wall-clock (ms) at which this action is applied, stamped by the
   * transports (party/index.ts and submitRoomAction). The ONLY clock the AFK
   * vote-kick reads: it timestamps each seat's last action and gates the
   * 10-minute idle / re-ask windows (src/engine/afk.ts). Omitted by engine
   * tests (which pass explicit values) — never read anywhere else, so the
   * engine stays deterministic.
   */
  now?: number;
};

type ConcreteEffect = Exclude<EffectDefinition, { type: "CHOOSE_ONE" }>;
type CreateActiveEffectCardEffect = Extract<ConcreteEffect, { type: "CREATE_ACTIVE_EFFECT" }>;

function cloneState(state: GameState): GameState {
  return JSON.parse(JSON.stringify(state)) as GameState;
}

function ok(state: GameState, startEventNumber: number): EngineResult {
  // The log is a capped rolling window, so "new since the action started" is
  // decided by the monotonic event number, not by array position.
  return {
    state,
    events: state.eventLog.filter((event) => Number(event.id.slice(4)) > startEventNumber),
    errors: []
  };
}

function fail(state: GameState, error: RulesError): EngineResult {
  return {
    state,
    events: [],
    errors: [error]
  };
}

function normalizeActionForMatch(action: GameAction): GameAction {
  if (action.type === "PLAY_REACTION") {
    // costCardIds are the player's chosen payment — validated by the play
    // handler, not by the legality match.
    return {
      type: "PLAY_REACTION",
      playerId: action.playerId,
      cardId: action.cardId,
      mode: action.mode ?? "basic",
      ...(action.optionIndex !== undefined ? { optionIndex: action.optionIndex } : {}),
      ...(action.target ? { target: action.target } : {}),
      ...(action.asPowerBoost ? { asPowerBoost: true } : {}),
      ...(action.fromSpellBook ? { fromSpellBook: true } : {}),
      ...(action.fromScroll ? { fromScroll: action.fromScroll } : {})
    };
  }

  if (action.type === "PLAY_CARD") {
    return {
      type: "PLAY_CARD",
      playerId: action.playerId,
      cardId: action.cardId,
      mode: action.mode ?? "basic",
      ...(action.optionIndex !== undefined ? { optionIndex: action.optionIndex } : {}),
      ...(action.target ? { target: action.target } : {}),
      ...(action.fromSpellBook ? { fromSpellBook: true } : {})
    };
  }

  if (action.type === "MOVE_UNIT") {
    // The optional `path` is the player's chosen route, validated by moveUnit
    // itself (isLegalExplicitMovePath), not by the legality match — so match on
    // the destination only.
    return { type: "MOVE_UNIT", playerId: action.playerId, unitId: action.unitId, destination: action.destination };
  }

  return action;
}

function actionsMatch(left: GameAction, right: GameAction): boolean {
  return JSON.stringify(normalizeActionForMatch(left)) === JSON.stringify(normalizeActionForMatch(right));
}

function assertLegal(
  state: GameState,
  action: GameAction,
  cards: CardLibrary,
  buildings: BuildingLibrary
): RulesError | null {
  if (action.type === "PLAY_REACTIONS") {
    return assertBatchReactionLegal(state, action, cards, buildings);
  }

  // Membership actions are keyed by clientId (no seat playerId) and validate
  // themselves in their handlers (HANDLER_VALIDATED_ACTIONS), so they never
  // reach this getLegalActions check.
  if (!("playerId" in action)) {
    return null;
  }

  const legalActions = getLegalActions(state, action.playerId, cards, buildings);
  const isLegal = legalActions.some((legal) => actionsMatch(legal.action, action));

  if (isLegal) {
    return null;
  }

  if (state.reactionWindow && state.reactionWindow.priorityPlayerId !== action.playerId) {
    return {
      code: "NOT_PRIORITY_PLAYER",
      message: "Only the priority player can act during the current reaction window."
    };
  }

  return {
    code: "ACTION_NOT_LEGAL",
    message: "That action is not legal in the current game state."
  };
}

/**
 * Batched instants resolve as one declaration, so legality is checked against
 * the single-card reactions currently on offer: every play must be available,
 * card copies and crowns must cover the batch, and window-ending effects
 * (spell cancel/recall) must be played alone.
 */
function assertBatchReactionLegal(
  state: GameState,
  action: Extract<GameAction, { type: "PLAY_REACTIONS" }>,
  cards: CardLibrary,
  buildings: BuildingLibrary
): RulesError | null {
  if (!state.reactionWindow) {
    return { code: "NO_REACTION_WINDOW", message: "No reaction window is open." };
  }

  if (state.reactionWindow.priorityPlayerId !== action.playerId) {
    return {
      code: "NOT_PRIORITY_PLAYER",
      message: "Only the priority player can act during the current reaction window."
    };
  }

  if (action.plays.length === 0) {
    return { code: "ACTION_NOT_LEGAL", message: "A reaction batch needs at least one card." };
  }

  const legalActions = getLegalActions(state, action.playerId, cards, buildings);
  const player = state.players[action.playerId];
  const handCounts = new Map<string, number>();
  for (const cardId of player?.hand ?? []) {
    handCounts.set(cardId, (handCounts.get(cardId) ?? 0) + 1);
  }

  let expertUsesNeeded = 0;
  let spellPlays = 0;
  let powerOnlyPlays = 0;

  for (const play of action.plays) {
    const singleAction: GameAction = {
      type: "PLAY_REACTION",
      playerId: action.playerId,
      cardId: play.cardId,
      mode: play.mode ?? "basic",
      ...(play.optionIndex !== undefined ? { optionIndex: play.optionIndex } : {}),
      ...(play.asPowerBoost ? { asPowerBoost: true } : {})
    };

    if (!legalActions.some((legal) => actionsMatch(legal.action, singleAction))) {
      return {
        code: "ACTION_NOT_LEGAL",
        message: `${cards[play.cardId]?.name ?? play.cardId} is not a legal reaction right now.`
      };
    }

    const card = cards[play.cardId];

    const copiesLeft = handCounts.get(play.cardId) ?? 0;
    if (copiesLeft <= 0) {
      return {
        code: "CARD_NOT_IN_HAND",
        message: `Not enough copies of ${card?.name ?? play.cardId} in hand for that batch.`
      };
    }
    handCounts.set(play.cardId, copiesLeft - 1);

    if (play.asPowerBoost) {
      powerOnlyPlays += 1;
      continue;
    }

    const effect = card ? getEffectiveCardEffect(card, play.optionIndex) : null;
    if (!effect || effect.type === "CANCEL_SPELL" || effect.type === "RECALL_SPELL" || effect.type === "REDIRECT_SPELL") {
      return {
        code: "ACTION_NOT_LEGAL",
        message: "Spell-ending, recall and redirect cards must be played on their own."
      };
    }

    if (card?.kind === "spell") {
      spellPlays += 1;
    }
    if (effect.type === "ADD_SPELL_POWER") {
      powerOnlyPlays += 1;
    }

    // An Empowered ability's Expert side costs no crown, so it never counts
    // against the batch's Expert-use budget.
    if ((play.mode ?? "basic") === "expert" && !abilityExpertIsCrownFree(player, play.cardId)) {
      expertUsesNeeded += 1;
    }
  }

  // Power "dissipates" when no spell consumes it: inside an attack window,
  // Power plays must accompany a spell instant in the same declaration — UNLESS
  // this player already has a power-scaling instant on the pending attack (their
  // own Bloodlust/Slayer/Weakness played in an earlier window step). Then they
  // keep empowering it, so a lone Power batch is legal — mirroring the single
  // PLAY_REACTION path (see applyReactionPlayCore's `empowerable`) so the batch
  // and single-play routes agree. Without this the UI (whose `powerNeedsSpell`
  // gate already allows it once empowered) let the player Confirm a batch the
  // engine then rejected.
  if (
    state.reactionWindow.triggerEvent.type === "UNIT_ATTACK_DECLARED" &&
    powerOnlyPlays > 0 &&
    spellPlays === 0
  ) {
    const stackItem = state.stack.at(-1);
    const attackOwner =
      stackItem?.action.type === "ATTACK_UNIT" || stackItem?.action.type === "MOVE_AND_ATTACK_UNIT"
        ? stackItem.action.playerId
        : undefined;
    const empowerable =
      (stackItem?.modifiers.powerScaledAttackInstants ?? []).some((record) => record.playerId === action.playerId) ||
      (attackOwner === action.playerId && stackItem?.modifiers.slayerRollsByPower !== undefined) ||
      stackItem?.modifiers.ignoreDefenseCasterId === action.playerId;
    if (!empowerable) {
      return {
        code: "ACTION_NOT_LEGAL",
        message: "Power can only be played into an attack together with a Spell card."
      };
    }
  }

  // One Spell card per combat round (Knowledge/Necklace raise the limit). Hand
  // and Book casts share this single limit.
  if (player && spellPlays > 0) {
    const remaining = spellLimitFor(state, player) - player.combatStats.spellsCastThisRound;
    if (spellPlays > remaining) {
      return {
        code: "ACTION_NOT_LEGAL",
        message: "Spell limit reached for this combat round."
      };
    }
  }

  const expertUsesLeft = player
    ? player.limits.expertUses +
      (player.combatStats.expertUseBonusThisRound ?? 0) -
      player.combatStats.expertUsesSpentThisRound
    : 0;
  if (expertUsesNeeded > expertUsesLeft) {
    return {
      code: "ACTION_NOT_LEGAL",
      message: "Not enough crowns for that many expert plays this combat round."
    };
  }

  return null;
}

function moveCardFromHandToDiscard(
  state: GameState,
  playerId: PlayerId,
  cardId: string,
  destination: "discard" | "removed" = "discard"
): RulesError | null {
  const player = state.players[playerId];
  const cardIndex = player?.hand.indexOf(cardId) ?? -1;

  if (!player || cardIndex === -1) {
    return {
      code: "CARD_NOT_IN_HAND",
      message: "The selected card is not in that player's hand.",
      path: `players.${playerId}.hand`
    };
  }

  player.hand.splice(cardIndex, 1);
  if (destination === "removed") {
    // "Remove this card": it leaves the game instead of cycling back.
    player.removed.push(cardId);
  } else {
    player.discard.push(cardId);
  }
  return null;
}

/**
 * Spell Book (house rule): move a Spell from the player's Spell Book to the
 * discard pile (a Book cast/instant/Power discard always cycles to discard, never
 * "removed"). Mirrors moveCardFromHandToDiscard but reads the Book zone, so every
 * Book play has exactly one card-removal chokepoint.
 */
function moveSpellFromSpellBookToDiscard(
  state: GameState,
  playerId: PlayerId,
  cardId: string,
  destination: "discard" | "removed" = "discard"
): RulesError | null {
  const player = state.players[playerId];
  const cardIndex = player?.spellBook.indexOf(cardId) ?? -1;

  if (!player || cardIndex === -1) {
    return {
      code: "CARD_NOT_IN_SPELL_BOOK",
      message: "The selected Spell is not in that player's Spell Book.",
      path: `players.${playerId}.spellBook`
    };
  }

  player.spellBook.splice(cardIndex, 1);
  if (destination === "removed") {
    player.removed.push(cardId);
  } else {
    player.discard.push(cardId);
  }
  return null;
}

/**
 * The start-of-turn draw is MANDATORY (house rule): on your own quiet map turn
 * you must take it (REFRESH_HAND — "draw new" or "discard and draw new") BEFORE
 * playing, casting or stashing a card, so it can never be forgotten. This is the
 * resolution backstop; legal-actions also withholds every card offer while the
 * draw is unspent (so a UI submission is rejected as not-legal first). A no-op in
 * combat and on anyone else's turn, where the start-of-turn draw is not in play.
 */
function assertStartOfTurnDrawTaken(state: GameState, playerId: PlayerId): void {
  // Parallel turns: every open parallel turn owes its start-of-turn draw too.
  if (state.combat || !hasOpenAdventureTurn(state, playerId)) {
    return;
  }
  const player = state.players[playerId];
  if (player?.canMulligan) {
    throw new Error("Take your start-of-turn draw first (draw new, or discard and draw new).");
  }
}

/**
 * Spell Book (house rule): move a Spell from hand into the Spell Book, freeing
 * the hand slot WITHOUT drawing a replacement. Legality (rule on, own map turn,
 * Spell in hand) is enforced by getLegalActions; these throws are the resolution
 * backstops so a fabricated action can never stash a non-Spell or empty card.
 */
function moveSpellToSpellBook(
  state: GameState,
  action: Extract<GameAction, { type: "MOVE_SPELL_TO_SPELL_BOOK" }>,
  cards: CardLibrary
): void {
  if (!spellBookRuleEnabled(state)) {
    throw new Error("The Spell Book house rule is off in this game.");
  }
  // Stashing is a card use: the mandatory start-of-turn draw must be taken first
  // (the player draws, THEN stashes), so the freed slot is never drawn back up.
  assertStartOfTurnDrawTaken(state, action.playerId);
  const player = state.players[action.playerId];
  if (!player) {
    throw new Error("Unknown player.");
  }
  const card = cards[action.cardId];
  if (!card || card.kind !== "spell") {
    throw new Error("Only Spell cards can go into the Spell Book.");
  }
  // Magic Arrow (any starting-only Spell) is castable from hand but has no Spell
  // Book home — reject a fabricated stash so the rule holds at resolution too.
  if (!spellCanEnterSpellBook(action.cardId)) {
    throw new Error(`${card.name} cannot be set aside in the Spell Book.`);
  }
  const index = player.hand.indexOf(action.cardId);
  if (index === -1) {
    throw new Error("That Spell is not in your hand.");
  }
  player.hand.splice(index, 1);
  player.spellBook.push(action.cardId);
  appendEvent(state, {
    type: "SPELL_MOVED_TO_SPELL_BOOK",
    playerId: action.playerId,
    cardId: action.cardId,
    message: `${player.name} sets ${card.name} aside in their Spell Book.`
  });
}

/**
 * Spell Scroll consumption: a used scroll spell leaves the scroll (and the
 * game — it never returns to a deck, hand or discard). An emptied scroll is
 * removed. Returns whether the spell was found and consumed.
 */
function consumeScrollSpell(
  state: GameState,
  playerId: PlayerId,
  scrollId: string,
  cardId: string
): boolean {
  const player = state.players[playerId];
  const scroll = player?.scrolls?.find((candidate) => candidate.id === scrollId);
  const cardIndex = scroll?.spellCardIds.indexOf(cardId) ?? -1;
  if (!player || !scroll || cardIndex === -1) {
    return false;
  }

  scroll.spellCardIds.splice(cardIndex, 1);
  player.removed.push(cardId);
  if (scroll.spellCardIds.length === 0) {
    player.scrolls = player.scrolls?.filter((candidate) => candidate.id !== scrollId);
  }
  return true;
}

function nextPlayerId(state: GameState, playerId: PlayerId): PlayerId {
  const currentIndex = state.turnOrder.indexOf(playerId);
  const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % state.turnOrder.length;
  return state.turnOrder[nextIndex];
}

function makeStackItem(state: GameState, action: GameAction): ResolutionStackItem {
  return {
    id: `stack_${state.stack.length + 1}`,
    source:
      action.type === "CAST_SPELL"
        ? { type: "card", cardId: action.cardId, controllerId: action.playerId }
        : action.type === "ATTACK_UNIT" || action.type === "MOVE_AND_ATTACK_UNIT"
          ? { type: "unit", unitId: action.attackerId, controllerId: action.playerId }
        : { type: "system" },
    action,
    status: "pending",
    triggerEventIds: [],
    modifiers: {
      spellPowerBonus: 0,
      attackBonus: 0,
      defenseBonus: 0,
      playedCardIds: []
    }
  };
}

function reactionPlayerOrder(
  state: GameState,
  legalReactions: Record<PlayerId, LegalAction[]>,
  triggerEvent?: GameEvent
): PlayerId[] {
  // The neutral side is not in turnOrder, but a NEUTRAL unit's innate reaction
  // (the War Zealot's always-on Magic Mirror) must still be offered so the AI can
  // reflect — otherwise a spell cast at a neutral War Zealot resolves against it
  // untouched. Append it only when it actually holds a reaction (the neutral has
  // no hand, so this is empty in every other fight), and let the pump auto-use it.
  const order =
    (legalReactions[NEUTRAL_PLAYER_ID] ?? []).length > 0 && !state.turnOrder.includes(NEUTRAL_PLAYER_ID)
      ? [...state.turnOrder, NEUTRAL_PLAYER_ID]
      : state.turnOrder;
  const eligible = order.filter((playerId) => (legalReactions[playerId] ?? []).length > 0);

  // The initiator of a cast or attack acts FIRST so they can finish empowering
  // (paying Power into a spell / attack) before the opponent decides Resistance
  // or Magic Mirror against the FINAL power — the board-game order. Only the
  // caster/attacker may add Power, so without this an opponent earlier in turn
  // order could Resist a power-0 spell before it was ever empowered, and
  // "cast at the power you used" could never happen. Their playerId is the
  // initiator for both windows (the retaliating unit's controller for a
  // retaliation). Other windows (Sorrow activation-skip, lethal saves) keep
  // plain turn order.
  const initiator =
    triggerEvent && (triggerEvent.type === "SPELL_CAST_STARTED" || triggerEvent.type === "UNIT_ATTACK_DECLARED")
      ? triggerEvent.playerId
      : null;
  if (initiator && eligible.includes(initiator)) {
    return [initiator, ...eligible.filter((playerId) => playerId !== initiator)];
  }
  return eligible;
}

function rollAttackDie(combat: CombatState): number {
  const dice = combat.dice;
  const rollIndex = dice.rollCount;
  dice.rollCount += 1;

  if (dice.scriptedRolls && rollIndex < dice.scriptedRolls.length) {
    return dice.scriptedRolls[rollIndex] ?? 0;
  }

  const faces = dice.faces.length > 0 ? dice.faces : ATTACK_DIE_FACES;
  // Derive each roll from the combat seed and the roll index so the sequence is
  // deterministic for every client (server-authoritative) yet unpredictable to
  // players, who cannot peek at future rolls. `salt: false` keeps roll index i a
  // stable function of `dice.seed` regardless of which action consumes it — the
  // per-game true randomness is baked into `dice.seed` once, at combat creation.
  const random = createSeededRandom(`${dice.seed}#${rollIndex}`, { salt: false });
  return faces[random.nextInt(0, faces.length - 1)] ?? 0;
}

function rollAttackDice(combat: CombatState, rollMode: AttackRollMode): { rolls: number[]; selectedRoll: number } {
  const rollCount = rollMode === "normal" ? 1 : 2;
  const rolls = Array.from({ length: rollCount }, () => rollAttackDie(combat));

  if (rollMode === "advantage") {
    return {
      rolls,
      selectedRoll: Math.max(...rolls)
    };
  }

  if (rollMode === "disadvantage") {
    return {
      rolls,
      selectedRoll: Math.min(...rolls)
    };
  }

  return {
    rolls,
    selectedRoll: rolls[0] ?? 0
  };
}

/**
 * Neutral Champions' "roll 2 Attack dice and apply both outcomes": roll two
 * dice, reroll each "-1" once when `rerollMinusOnce`, then sum both faces into a
 * single resolved roll. The reroll is built in, so no reroll choice is opened.
 */
function rollApplyBothCandidate(combat: CombatState, rerollMinusOnce: boolean): AttackRollCandidate {
  const rollOne = () => {
    const value = rollAttackDie(combat);
    return rerollMinusOnce && value === -1 ? rollAttackDie(combat) : value;
  };
  const first = rollOne();
  const second = rollOne();
  // Both faces are summed into the outcome, so the overlay keeps both lit.
  return { rolls: [first, second], roll: first + second, sumAllDice: true };
}

// ---------------------------------------------------------------------------
// Morale Cards on the Attack die (optional rule; drawn cards resolve when the
// printed situation occurs, then return under their deck)
// ---------------------------------------------------------------------------

/**
 * How a candidate's dice fold into its outcome: the three roll modes, the
 * apply-both sum, and Slayer's count-the-"+1"s.
 */
type MoraleDiceAggregation = AttackRollMode | "sum" | "count-plus";

function aggregateCandidateRoll(rolls: number[], aggregation: MoraleDiceAggregation): number {
  if (rolls.length === 0) {
    return 0;
  }
  switch (aggregation) {
    case "sum":
      return rolls.reduce((total, roll) => total + roll, 0);
    case "count-plus":
      return rolls.filter((roll) => roll === 1).length;
    case "advantage":
      return Math.max(...rolls);
    case "disadvantage":
      return Math.min(...rolls);
    default:
      return rolls[0] ?? 0;
  }
}

/**
 * Negative Morale on the holder's just-rolled Attack dice, in resolve order:
 * - "set one of the dice to the -1 side" flips the die whose flip lowers the
 *   outcome the most (a curse resolves against its holder), once;
 * - "on a +1 on an Attack die, reroll the die" forcibly rerolls the first "+1"
 *   still showing, once.
 * Each resolved card returns under its deck (MORALE_CARD_USED feed line).
 * Mutates and returns the candidate; a no-op for neutral controllers, with the
 * rule off, or when neither card is held. Also run on window rerolls and the
 * set-die result, so a "+1" that only appears later still triggers the curse.
 */
function applyMoraleDiceCurses(
  state: GameState,
  controllerId: PlayerId,
  candidate: AttackRollCandidate,
  aggregation: MoraleDiceAggregation
): AttackRollCandidate {
  const combat = state.combat;
  if (!combat || !state.adventure?.moraleCards) {
    return candidate;
  }

  if (playerHoldsMoraleCard(state, controllerId, MORALE_CARD_IDS.setAttackDieMinus)) {
    let flipIndex = -1;
    let flippedOutcome = Number.POSITIVE_INFINITY;
    candidate.rolls.forEach((_, index) => {
      const flipped = candidate.rolls.map((roll, at) => (at === index ? -1 : roll));
      const outcome = aggregateCandidateRoll(flipped, aggregation);
      if (outcome < flippedOutcome) {
        flippedOutcome = outcome;
        flipIndex = index;
      }
    });
    if (flipIndex >= 0) {
      consumeHeldMoraleCard(state, controllerId, MORALE_CARD_IDS.setAttackDieMinus);
      candidate.rolls[flipIndex] = -1;
      candidate.roll = aggregateCandidateRoll(candidate.rolls, aggregation);
    }
  }

  // One copy exists, so this fires at most once — but a rerolled "+1" would be
  // a fresh trigger if another copy were ever held, hence the loop.
  while (
    candidate.rolls.includes(1) &&
    playerHoldsMoraleCard(state, controllerId, MORALE_CARD_IDS.rerollPlusOne)
  ) {
    consumeHeldMoraleCard(state, controllerId, MORALE_CARD_IDS.rerollPlusOne);
    const index = candidate.rolls.indexOf(1);
    candidate.rolls[index] = rollAttackDie(combat);
    candidate.roll = aggregateCandidateRoll(candidate.rolls, aggregation);
  }

  return candidate;
}

/**
 * Negative Morale "when you are about to roll at least 2 Attack dice, roll 1
 * die less": resolves the held card and reports the reduced count. Applies to
 * every ≥2-dice Attack roll the holder makes — advantage AND disadvantage
 * both collapse to a single straight die (the printed reduction is mandatory,
 * even where it helps), apply-both rolls one die, Slayer rolls N-1.
 */
function takeMoraleRollOneLess(state: GameState, controllerId: PlayerId, diceCount: number): number {
  if (diceCount < 2 || !state.adventure?.moraleCards) {
    return diceCount;
  }
  if (!consumeHeldMoraleCard(state, controllerId, MORALE_CARD_IDS.rollOneLess)) {
    return diceCount;
  }
  return diceCount - 1;
}

/**
 * Negative Morale "-1 to your next Attack, Defense, or Combat Power roll" —
 * the Attack-roll half. Latches onto the attack whose die actually rolls
 * (never a Mummy-forced or Bless-suppressed die), resolves the card, and
 * mutates the already-derived details so the pending window and the final
 * damage agree; recomputes read stackItem.modifiers.moraleRollPenalty. The
 * Defense-roll half lives in resolveDefendBonus; a Combat Power roll is a
 * Battlefield-expansion-mode concept that never occurs in regular games.
 */
function applyMoraleAttackRollPenalty(
  state: GameState,
  stackItem: ResolutionStackItem,
  details: { attacker: CombatUnitState; attackBonus: number }
): void {
  if (stackItem.modifiers.moraleRollPenalty) {
    return;
  }
  if (!consumeHeldMoraleCard(state, details.attacker.controllerId, MORALE_CARD_IDS.nextRollMinusOne)) {
    return;
  }
  stackItem.modifiers.moraleRollPenalty = 1;
  details.attackBonus -= 1;
}

function hasExpertUseAvailable(state: GameState, playerId: PlayerId): boolean {
  const player = state.players[playerId];
  return Boolean(
    player &&
      player.combatStats.expertUsesSpentThisRound <
        player.limits.expertUses + (player.combatStats.expertUseBonusThisRound ?? 0)
  );
}

// markUnitRemovedIfNeeded (pack flip + removal) lives in combat-units.ts so
// the war machine module can finalize its damage the same way.

// appendExpiredEffectEvents / finishCombatIfNeeded / livingControllerIds
// moved to combat-units.ts so the war machine module can finish combats.

function appendActiveEffectCreatedEvent(state: GameState, activeEffect: ActiveEffectState): void {
  appendEvent(state, {
    type: "ACTIVE_EFFECT_CREATED",
    effectId: activeEffect.id,
    controllerId: activeEffect.controllerId,
    name: activeEffect.name,
    duration: activeEffect.duration
  });
}

function createActiveEffect(
  state: GameState,
  effectDefinition: ActiveEffectDefinition,
  source: ActiveEffectState["source"],
  controllerId: PlayerId,
  target?: { type: "unit"; unitId: UnitId }
): ActiveEffectState {
  const activeEffect = makeActiveEffect(state, effectDefinition, source, controllerId, target);
  state.activeEffects.push(activeEffect);
  appendActiveEffectCreatedEvent(state, activeEffect);
  return activeEffect;
}

function createActiveEffectFromCard(
  state: GameState,
  card: CardDefinition,
  effect: CreateActiveEffectCardEffect,
  playerId: PlayerId,
  mode: "basic" | "expert",
  target?: { type: "unit"; unitId: UnitId }
): void {
  const effectDefinition = mode === "expert" ? (effect.expertEffect ?? effect.effect) : effect.effect;
  createActiveEffect(
    state,
    effectDefinition,
    {
      type: "card",
      cardId: card.id,
      controllerId: playerId
    },
    playerId,
    target
  );
  // Expert Pathfinding's effect grants Water Walk: if its controller already
  // waded onto the sea this turn (and was halted), that halt no longer applies.
  liftSeaHaltForWaterWalk(state, playerId);
}

/** Ranks unit grades for tier-gated effects (Anti-Magic, Counterstrike…). */
function gradeRank(grade: CombatUnitState["grade"]): number {
  return grade === "bronze" ? 0 : grade === "silver" ? 1 : grade === "gold" ? 2 : 3;
}

/**
 * Tier-gate rank of a UNIT. A Creature Bank defender has NO tier (rulebook
 * p.66), so it ranks above every grade and fails every "grade ≤ reached" /
 * "grade === X" gate — a tier-specific spell or specialty can never affect it.
 * Every other unit ranks by its printed grade. Use this (never gradeRank on the
 * raw grade) whenever the value being gated is a unit's own tier.
 */
function gradeRankOfUnit(unit: CombatUnitState): number {
  // Creature Bank defenders and WOG commanders carry no tier in play, so they
  // sit above every grade gate (a tier-gated cast at them always fizzles).
  return unit.bankUnit || unit.commanderSlug ? Number.POSITIVE_INFINITY : gradeRank(unit.grade);
}

/** Highest grade unlocked by the paid power (e.g. {0:bronze,2:silver,4:gold}). */
function gradeAtPower(
  gradeByPower: Record<number, CombatUnitState["grade"]>,
  power: number
): CombatUnitState["grade"] | null {
  const thresholds = Object.keys(gradeByPower)
    .map(Number)
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);
  const matched = thresholds.filter((value) => value <= power).at(-1);
  return matched === undefined ? null : (gradeByPower[matched] ?? null);
}

/** Mirth: the reroll's duration unlocked by the paid Power. */
function durationAtPower(
  durationByPower: Record<number, EffectDurationDefinition>,
  power: number
): EffectDurationDefinition | null {
  const thresholds = Object.keys(durationByPower)
    .map(Number)
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);
  const matched = thresholds.filter((value) => value <= power).at(-1);
  return matched === undefined ? null : (durationByPower[matched] ?? null);
}

/** Chain Lightning Spell: the damage allocation unlocked by the paid Power. */
function chainDamagesAtPower(
  damagesByPower: Record<number, number[]>,
  power: number
): number[] | null {
  const thresholds = Object.keys(damagesByPower)
    .map(Number)
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);
  const matched = thresholds.filter((value) => value <= power).at(-1);
  return matched === undefined ? null : (damagesByPower[matched] ?? null);
}

/** Resolves a CHAIN_LIGHTNING effect's allocation array for the paid Power. */
function chainLightningDamages(
  effect: Extract<EffectDefinition, { type: "CHAIN_LIGHTNING" }>,
  power: number
): number[] {
  if (effect.damagesByPower) {
    return chainDamagesAtPower(effect.damagesByPower, power) ?? effect.damages ?? [];
  }
  return effect.damages ?? [];
}

/**
 * Whether the unit's controller could play Alamar's Resurrection to save it
 * right now — exactly the reactions the lethal-save window would offer.
 */
function playerHasLethalSave(state: GameState, defenderId: UnitId, cards: CardLibrary): boolean {
  const reactions = getLegalReactionsForTrigger(
    state,
    { id: "lethal-check", type: "UNIT_LETHAL_HIT", attackerId: "", defenderId },
    cards
  );
  return Object.values(reactions).some((list) => list.length > 0);
}

function getAmountByPower(amountByPower: Record<number, number> | undefined, fallback: number, power: number): number {
  if (!amountByPower) {
    return fallback;
  }

  const powerBreakpoints = Object.keys(amountByPower)
    .map(Number)
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);
  const matchingPower = powerBreakpoints.filter((value) => value <= power).at(-1) ?? powerBreakpoints[0];

  return matchingPower === undefined ? fallback : (amountByPower[matchingPower] ?? fallback);
}

/**
 * The spell Power a hero-specialty PLAY_CARD brings to a power-scaled effect
 * (Deemer's Meteor Shower) — the player's standing spell Power PLUS the full
 * printed Power VALUE of each power-source card discarded as the play's cost (a
 * +2 source counts as 2, not as a single card). Mirrors how a Spell's
 * `amountByPower` reads getCurrentSpellPower, so a Specialty "scales directly
 * with spell power, similar to standard spells" (wiki) rather than counting raw
 * discards.
 */
function playCardSpellPower(
  state: GameState,
  playerId: PlayerId,
  card: CardDefinition,
  costCardIds: CardId[] | undefined,
  cards: CardLibrary
): number {
  const schools = card.spellSchools ?? [];
  const fromCards = (costCardIds ?? []).reduce(
    (sum, id) => sum + spellPowerValueOfCard(cards[id], schools),
    0
  );
  return standingSpellPower(state, playerId, card) + fromCards;
}

/** Whether a stack item is a pending attack (its Power pool is split per side). */
function isAttackStackItem(stackItem: ResolutionStackItem | undefined): boolean {
  return stackItem?.action.type === "ATTACK_UNIT" || stackItem?.action.type === "MOVE_AND_ATTACK_UNIT";
}

/** The Power one player has paid into an attack window (statistics, +1s, standing). */
function attackPowerFor(stackItem: ResolutionStackItem, playerId: PlayerId): number {
  return stackItem.modifiers.attackPowerByPlayer?.[playerId] ?? 0;
}

/** Add Power to one player's attack-window pool (per caster, never shared). */
function addAttackPower(stackItem: ResolutionStackItem, playerId: PlayerId, amount: number): void {
  const pool = (stackItem.modifiers.attackPowerByPlayer ??= {});
  pool[playerId] = (pool[playerId] ?? 0) + amount;
}

/**
 * Whether a Power-scaled Frenzy on this attack pierces the defender's Defense:
 * the pierced grade is re-derived from the caster's FINAL pooled attack-window
 * Power (so Power paid after Frenzy still counts), then compared to the
 * defender's grade. Fixed-grade Frenzy sets ignoreDefense outright and is not
 * handled here.
 */
function frenzyPierces(stackItem: ResolutionStackItem, defender: CombatUnitState): boolean {
  const table = stackItem.modifiers.ignoreDefenseGradeByPower;
  if (!table) {
    return false;
  }
  const caster =
    stackItem.modifiers.ignoreDefenseCasterId ??
    (stackItem.action.type === "ATTACK_UNIT" || stackItem.action.type === "MOVE_AND_ATTACK_UNIT"
      ? stackItem.action.playerId
      : undefined);
  if (!caster) {
    return false;
  }
  const reached = gradeAtPower(
    table,
    attackPowerFor(stackItem, caster) + (stackItem.modifiers.ignoreDefenseSchoolPowerBonus ?? 0)
  );
  return reached !== null && gradeRankOfUnit(defender) <= gradeRank(reached);
}

/**
 * Whether a spell instant's effect draws from the attack-window Power pool —
 * the Power-scaling buffs/debuffs (Bloodlust, Curse, Weakness, Precision, the
 * scaled Bless bonus, Slayer's roll count and Frenzy's pierced grade). A plain
 * (unscaled) Bless does not, so it is never credited standing Power.
 */
function effectScalesWithAttackPool(effect: ReturnType<typeof getEffectiveCardEffect>): boolean {
  if (!effect) {
    return false;
  }
  if (effect.type === "SLAYER_ATTACK") {
    return true;
  }
  if (effect.type === "ADD_COMBAT_STAT") {
    return Boolean(effect.amountByPower);
  }
  if (effect.type === "IGNORE_ATTACK_DIE") {
    return Boolean(effect.attackBonusByPower);
  }
  if (effect.type === "IGNORE_DEFENSE") {
    return Boolean(effect.gradeByPower);
  }
  return false;
}

/**
 * Re-derive every Power-scaling attack/defense instant recorded on an attack
 * stack item against its CASTER's attack-window Power pool, folding the delta
 * into attackBonus/defenseBonus. Called whenever fresh Power is paid into the
 * attack window so a Bloodlust/Bless/Precision/Curse/Weakness cast earlier keeps
 * growing instead of being frozen at the Power it had when first played.
 */
function recomputePowerScaledAttackInstants(stackItem: ResolutionStackItem): void {
  const attackerId =
    stackItem.action.type === "ATTACK_UNIT" || stackItem.action.type === "MOVE_AND_ATTACK_UNIT"
      ? stackItem.action.playerId
      : undefined;

  // Slayer (always the attacker's): re-derive its roll count from the attacker's
  // Power so Power paid AFTER Slayer was played (the caster keeps priority and
  // keeps empowering) lifts it from 2 → 4 → 6 instead of freezing at cast time.
  if (stackItem.modifiers.slayerRollsByPower && attackerId) {
    stackItem.modifiers.slayerRolls = getAmountByPower(
      stackItem.modifiers.slayerRollsByPower,
      2,
      attackPowerFor(stackItem, attackerId) + (stackItem.modifiers.slayerSchoolPowerBonus ?? 0)
    );
  }

  const records = stackItem.modifiers.powerScaledAttackInstants;
  if (!records || records.length === 0) {
    return;
  }
  for (const record of records) {
    const scaled = getAmountByPower(
      record.amountByPower,
      record.baseAmount,
      attackPowerFor(stackItem, record.playerId) + (record.schoolPowerBonus ?? 0)
    );
    const newApplied = (scaled + record.fixedBonus) * record.doubleFactor;
    const delta = newApplied - record.appliedAmount;
    if (delta === 0) {
      continue;
    }
    if (record.stat === "attack") {
      stackItem.modifiers.attackBonus += delta;
    } else {
      stackItem.modifiers.defenseBonus += delta;
    }
    record.appliedAmount = newApplied;
  }
}

/**
 * Resistance ending an instant Spell buff already played into an attack: undo
 * that one spell's contribution so the attack resolves as if it were never cast.
 * Pulls its power-scaled attack/defense record back out (subtracting the bonus
 * it currently contributes), then clears the per-card flags it set — Bless's
 * ignored die, Precision's ranged-penalty waiver, and Slayer's extra rolls/draw.
 */
function reverseCancelledInstantSpell(stackItem: ResolutionStackItem, cardId: CardId, cards: CardLibrary): void {
  const records = stackItem.modifiers.powerScaledAttackInstants;
  if (records) {
    for (let index = records.length - 1; index >= 0; index -= 1) {
      if (records[index].cardId !== cardId) {
        continue;
      }
      const record = records[index];
      if (record.stat === "attack") {
        stackItem.modifiers.attackBonus -= record.appliedAmount;
      } else {
        stackItem.modifiers.defenseBonus -= record.appliedAmount;
      }
      records.splice(index, 1);
      break;
    }
  }

  const effect = cards[cardId]?.effect;
  if (effect?.type === "IGNORE_ATTACK_DIE") {
    stackItem.modifiers.ignoreAttackDie = false;
  }
  if (effect?.type === "ADD_COMBAT_STAT" && effect.ignoreRangedPenalty) {
    stackItem.modifiers.ignoreRangedPenalty = false;
  }
  if (effect?.type === "SLAYER_ATTACK") {
    stackItem.modifiers.slayerRolls = undefined;
    stackItem.modifiers.slayerRollsByPower = undefined;
    stackItem.modifiers.slayerDraw = undefined;
  }
}

/**
 * The signed stat penalty an instant ADD_COMBAT_STAT Spell currently contributes
 * to an attack — what Magic Mirror carries onto its new target as a token. Read
 * from the power-scaled record (so Power paid into the attack window is honoured)
 * but WITHOUT the original target's hero-specialty doubling, since the malus is
 * moving to a different unit. A Scroll cast (locked to Power 0, never recorded)
 * falls back to the card's printed base amount.
 */
function attackInstantSignedAmount(stackItem: ResolutionStackItem, cardId: CardId, cards: CardLibrary): number {
  const records = stackItem.modifiers.powerScaledAttackInstants ?? [];
  // Match reverseCancelledInstantSpell, which pulls the LAST record for the card.
  for (let index = records.length - 1; index >= 0; index -= 1) {
    const record = records[index];
    if (record.cardId === cardId) {
      // Re-derive against the CASTER's attack-Power pool (the same source
      // recomputePowerScaledAttackInstants scales by), without the original
      // target's hero-specialty doubling — the malus is moving to a new unit.
      return (
        getAmountByPower(
          record.amountByPower,
          record.baseAmount,
          attackPowerFor(stackItem, record.playerId) + (record.schoolPowerBonus ?? 0)
        ) + record.fixedBonus
      );
    }
  }
  const effect = cards[cardId]?.effect;
  return effect?.type === "ADD_COMBAT_STAT" ? effect.amount : 0;
}

/**
 * Whether a combat unit is the signature unit a hero specialty doubles for.
 * Most specialties name one exact unit (Crusaders, Efreet…); Mutare's
 * signature is the whole Dragons family ("a Dragons unit"), which matches
 * every unit whose name ends in "Dragons" (Black/Gold/Ghost/Azure/Crystal/
 * Faerie/Rust Dragons) but not Dragon Flies.
 */
export function unitMatchesSpecialtyName(unitName: string | undefined, target: string | undefined): boolean {
  if (!unitName || !target) {
    return false;
  }
  // Multi-unit descriptors ("Elves and Sharpshooters", "X or Y" — Gelu's
  // specialty doubles for two unit types): match when the unit is any of them.
  if (/\s+(?:and|or)\s+/i.test(target)) {
    return target
      .split(/\s+(?:and|or)\s+/i)
      .some((part) => unitMatchesSpecialtyName(unitName, part.trim()));
  }
  if (unitName === target) {
    return true;
  }
  // Family descriptors like "a Dragons unit": strip the "a … unit" wrapper and
  // match any unit whose name ends with the remaining creature family word.
  const family = target.replace(/^an?\s+/i, "").replace(/\s+units?$/i, "").trim();
  return family.length > 0 && family !== target && unitName.toLowerCase().endsWith(family.toLowerCase());
}

function doubleAmountForUnitName(amount: number, unit: CombatUnitState | undefined, unitName: string | undefined): number {
  return unitMatchesSpecialtyName(unit?.name, unitName) ? amount * 2 : amount;
}

/**
 * Records that `player` cast a Spell this combat round/turn (the printed
 * one-Spell-per-round accounting) and fires any ongoing "after casting a Spell,
 * draw N cards" effects (Zydar's Sorcery VI).
 */
function noteSpellCast(state: GameState, player: PlayerState, countsTowardLimit = true): void {
  // Helm of the Alabaster Unicorn's Spell-deck cast is a free bonus cast: it does
  // not consume the one-Spell-per-combat-round limit (spellsCastThisRound), so a
  // later normal Spell is still allowed. It still counts as a Spell cast this turn
  // and fires "on Spell cast" draw effects.
  if (countsTowardLimit) {
    player.combatStats.spellsCastThisRound += 1;

    // Temple Guardian commander ("Mana Magician"): a cast that lands ABOVE the
    // charge-free limit burns one of the two per-combat charges. The burned
    // charge converts into this round's spellLimitBonusThisRound so the cast
    // it just paid for stays covered (the limit must not shrink under the
    // count); the per-round bonus reset then naturally re-arms nothing — only
    // UNSPENT charges carry to later rounds.
    const charges = state.combat ? (player.combatStats.commanderManaCharges ?? 0) : 0;
    if (charges > 0) {
      const limitWithCharges = spellLimitFor(state, player);
      if (
        Number.isFinite(limitWithCharges) &&
        player.combatStats.spellsCastThisRound > limitWithCharges - charges
      ) {
        player.combatStats.commanderManaCharges = charges - 1;
        player.combatStats.spellLimitBonusThisRound += 1;
      }
    }
  }
  player.combatStats.spellsCastThisTurn = (player.combatStats.spellsCastThisTurn ?? 0) + 1;
  // The "first spell this round" Power gate (Tower Magi Pack) closes on the first
  // cast through ANY path — hand cast, reaction, or a free Helm cast — so the
  // bonus lands on whichever spell is genuinely cast first, exactly once.
  player.combatStats.anySpellCastThisRound = true;

  let draws = 0;
  for (const effect of state.activeEffects) {
    if (effect.controllerId !== player.id) {
      continue;
    }
    for (const modifier of effect.modifiers) {
      if (modifier.type === "DRAW_ON_SPELL_CAST") {
        draws += modifier.amount;
      }
    }
  }
  if (draws > 0) {
    drawCardsForPlayer(state, player.id, draws);
  }
}

function createAttackBuffFromCard(
  state: GameState,
  card: CardDefinition,
  // Passed in (not read off card.effect) so it also works as a CHOOSE_ONE
  // option (Moandor's "+2 attack"), where card.effect is the "OR" wrapper.
  effect: Extract<EffectDefinition, { type: "CREATE_ATTACK_BUFF" }>,
  playerId: PlayerId,
  power: number,
  target: { type: "unit"; unitId: UnitId }
): void {
  const targetUnit = state.combat?.units[target.unitId];
  const amount = doubleAmountForUnitName(
    getAmountByPower(effect.amountByPower, effect.amount ?? 0, power),
    targetUnit,
    effect.doubleForUnitName
  );
  createActiveEffect(
    state,
    {
      name: effect.name,
      scope: "unit",
      duration: effect.duration,
      polarity: effect.polarity ?? "positive",
      removable: effect.removable ?? true,
      modifiers: [
        {
          type: "ATTACK_BONUS",
          amount
        }
      ]
    },
    {
      type: "card",
      cardId: card.id,
      controllerId: playerId
    },
    playerId,
    target
  );
}

function createDefenseBuffFromCard(
  state: GameState,
  card: CardDefinition,
  playerId: PlayerId,
  power: number,
  target: { type: "unit"; unitId: UnitId }
): void {
  if (card.effect.type !== "CREATE_DEFENSE_BUFF") {
    return;
  }

  const amount = getAmountByPower(card.effect.amountByPower, card.effect.amount ?? 0, power);
  // Shield / Air Shield carry `vsAttackerType`, so their Defense is conditional
  // (read in getAttackerTypeDefenseBonus); a plain buff emits an always-on bonus.
  const modifier: ActiveEffectModifier = card.effect.vsAttackerType
    ? { type: "DEFENSE_VS_ATTACKER_TYPE", attackerType: card.effect.vsAttackerType, amount }
    : { type: "DEFENSE_BONUS", amount };
  createActiveEffect(
    state,
    {
      name: card.effect.name,
      scope: "unit",
      duration: card.effect.duration,
      polarity: card.effect.polarity ?? "positive",
      removable: card.effect.removable ?? true,
      modifiers: [modifier]
    },
    {
      type: "card",
      cardId: card.id,
      controllerId: playerId
    },
    playerId,
    target
  );
}

/**
 * Fire Shield active effect: the Fire Shield spell scales with `power`
 * (`amountByPower`); hero specialties (Rashka) pass a flat `amount`, doubled
 * when the shield lands on the specialty's signature unit (his Efreet at VI).
 */
function createFireShieldFromCard(
  state: GameState,
  card: CardDefinition,
  effect: Extract<EffectDefinition, { type: "CREATE_FIRE_SHIELD" }>,
  playerId: PlayerId,
  power: number,
  target: { type: "unit"; unitId: UnitId }
): void {
  const targetUnit = state.combat?.units[target.unitId];
  const base = effect.amountByPower
    ? getAmountByPower(effect.amountByPower, effect.amount ?? 1, power)
    : (effect.amount ?? 0);
  const amount = doubleAmountForUnitName(base, targetUnit, effect.doubleForUnitName);
  if (amount <= 0) {
    return;
  }
  createActiveEffect(
    state,
    {
      name: card.name,
      scope: "unit",
      duration: effect.duration,
      polarity: "positive",
      removable: effect.removable ?? true,
      modifiers: [{ type: "FIRE_SHIELD", amount }]
    },
    { type: "card", cardId: card.id, controllerId: playerId },
    playerId,
    target
  );
}

/**
 * Spell Ward active effect (Clancy's Unicorns specialty VI): the chosen unit
 * reduces the damage it takes from Spells/Specialties by `amount`, doubled when
 * the ward lands on the specialty's signature unit (his Unicorns).
 */
function createSpellWardFromCard(
  state: GameState,
  card: CardDefinition,
  effect: Extract<EffectDefinition, { type: "CREATE_SPELL_WARD" }>,
  playerId: PlayerId,
  target: { type: "unit"; unitId: UnitId }
): void {
  const targetUnit = state.combat?.units[target.unitId];
  const amount = doubleAmountForUnitName(effect.amount, targetUnit, effect.doubleForUnitName);
  if (amount <= 0) {
    return;
  }
  createActiveEffect(
    state,
    {
      name: card.name,
      scope: "unit",
      duration: effect.duration,
      polarity: "positive",
      removable: effect.removable ?? true,
      modifiers: [{ type: "SPELL_DAMAGE_REDUCTION", amount }]
    },
    { type: "card", cardId: card.id, controllerId: playerId },
    playerId,
    target
  );
}

function createAttackRerollEffectFromCard(
  state: GameState,
  card: CardDefinition,
  playerId: PlayerId,
  mode: "basic" | "expert",
  power?: number
): void {
  if (card.effect.type !== "CREATE_ATTACK_DIE_REROLL") {
    return;
  }

  const maxUsesPerRoll =
    power === undefined
      ? mode === "expert"
        ? (card.effect.expertRerolls ?? card.effect.basicRerolls)
        : card.effect.basicRerolls
      : getAmountByPower(card.effect.rerollsByPower, card.effect.basicRerolls, power);

  if (maxUsesPerRoll <= 0) {
    return;
  }

  // Mirth scales its DURATION with Power (this Activation / Combat round /
  // Combat) rather than the reroll count; durationByPower overrides the flat
  // duration at the matched breakpoint.
  const duration =
    power !== undefined && card.effect.durationByPower
      ? (durationAtPower(card.effect.durationByPower, power) ?? card.effect.duration)
      : card.effect.duration;

  const modifiers: ActiveEffectDefinition["modifiers"] = [
    {
      type: "ATTACK_DIE_REROLL",
      maxUsesPerRoll,
      consumeEffectOnUse: card.effect.consumeEffectOnUse
    }
  ];
  // Fortune also rerolls the adventure-map Treasure and Resource dice, sharing
  // a single budget equal to the reroll count (Power 0/1/2 -> 1/2/3). Both die
  // types draw from the same `rerolls` budget on the effect.
  if (card.effect.adventureDice) {
    modifiers.push(
      { type: "ADVENTURE_DIE_REROLL", dice: "treasure", rerolls: maxUsesPerRoll },
      { type: "ADVENTURE_DIE_REROLL", dice: "resource", rerolls: maxUsesPerRoll }
    );
  }

  createActiveEffect(
    state,
    {
      name: card.effect.name,
      scope: "player",
      duration,
      polarity: "positive",
      removable: false,
      modifiers
    },
    {
      type: "card",
      cardId: card.id,
      controllerId: playerId
    },
    playerId
  );
}

function removeEffectsFromTarget(
  state: GameState,
  source: ActiveEffectState["source"],
  target: { type: "unit"; unitId: UnitId },
  removePolarity: "negative" | "any-removable"
): void {
  const removed = state.activeEffects.filter((effect) => {
    if (effect.target?.type !== "unit" || effect.target.unitId !== target.unitId || effect.removable === false) {
      return false;
    }

    if (removePolarity === "any-removable") {
      return true;
    }

    return effect.polarity === "negative";
  });

  if (removed.length === 0) {
    return;
  }

  const removedIds = new Set(removed.map((effect) => effect.id));
  state.activeEffects = state.activeEffects.filter((effect) => !removedIds.has(effect.id));

  appendEvent(state, {
    type: "ACTIVE_EFFECTS_REMOVED",
    source,
    target,
    effectIds: [...removedIds]
  });
}

/**
 * Boots of Polarity (option B): strip exactly ONE removable ongoing effect from
 * the chosen unit — the most recently applied one (the last pushed). Returns
 * whether anything was removed. Honours `removable === false` (permanent
 * effects stay), and only touches unit-scoped effects (the global relic locks
 * are not unit-targeted). Narrower than Cure/Dispel, which clear several.
 */
function removeOneEffectFromTarget(
  state: GameState,
  source: ActiveEffectState["source"],
  target: { type: "unit"; unitId: UnitId }
): boolean {
  for (let index = state.activeEffects.length - 1; index >= 0; index -= 1) {
    const effect = state.activeEffects[index];
    if (
      effect.target?.type === "unit" &&
      effect.target.unitId === target.unitId &&
      effect.removable !== false
    ) {
      state.activeEffects.splice(index, 1);
      appendEvent(state, {
        type: "ACTIVE_EFFECTS_REMOVED",
        source,
        target,
        effectIds: [effect.id]
      });
      return true;
    }
  }
  return false;
}

function healUnitDamage(
  state: GameState,
  source: ActiveEffectState["source"],
  target: { type: "unit"; unitId: UnitId },
  amount: number
): void {
  const unit = state.combat?.units[target.unitId];
  if (!unit) {
    return;
  }

  const healedAmount = Math.min(amount, unit.damage);
  unit.damage = Math.max(0, unit.damage - amount);

  appendEvent(state, {
    type: "DAMAGE_HEALED",
    source,
    target,
    amount: healedAmount
  });
}

/**
 * Spell damage actually dealt to a unit after its "Reduce any damage from
 * spells by N" passive (Iron/Gold/Diamond Golems, neutral Black Dragons),
 * floored at 0. Applied at every Spell-damage site (direct, area and the
 * Faerie Dragon's bolt).
 */
function totalSpellDamageReduction(state: GameState, target: CombatUnitState): number {
  // Orb of Vulnerability switches off every "reduce Spell damage" passive, so
  // the magic-resistant creature takes the spell's full damage.
  if (spellAbilitiesSuppressed(state)) {
    return 0;
  }
  let total = getSpellDamageReduction(target);

  // Interference: a unit-scoped Defense bonus that also blunts Spell damage.
  // Sum every SPELL_DAMAGE_REDUCTION modifier on an effect that applies to the
  // target (Titans/Gargoyles' ignore-ongoing-effects passives are honoured by
  // effectAppliesToUnit, exactly as they are for any other ongoing effect).
  for (const effect of state.activeEffects) {
    if (!effectAppliesToUnit(effect, target)) {
      continue;
    }
    for (const modifier of effect.modifiers) {
      if (modifier.type === "SPELL_DAMAGE_REDUCTION") {
        total += modifier.amount;
      }
    }
  }

  const combat = state.combat;
  if (combat) {
    // Aura sources (Rampart Unicorns Pack) shield themselves and adjacent
    // friendly units — sum every friendly aura on or beside the target.
    for (const unit of Object.values(combat.units)) {
      if (!isUnitAlive(unit) || unit.controllerId !== target.controllerId) {
        continue;
      }
      if (unit.id !== target.id && !isAdjacent(unit.position, target.position)) {
        continue;
      }
      total += getSpellDamageReductionAura(unit);
    }
  }
  return total;
}

function reducedSpellDamage(
  state: GameState,
  target: CombatUnitState,
  amount: number,
  schools: readonly SpellSchool[] = []
): number {
  return Math.max(
    0,
    amount - totalSpellDamageReduction(state, target) - getSpellSchoolDamageReduction(target, schools)
  );
}

/**
 * Azure Dragons / Black Dragons (Pack): a unit that takes NO damage from this
 * card — "immune to all Spells" blocks every Spell, "immune to Specialty
 * damage" blocks Hero Specialty cards. Non-damage Specialty effects are applied
 * elsewhere and are unaffected. The Spell-targeting filter already keeps an
 * all-school-immune unit from being targeted/splashed; this closes the
 * remaining area-damage paths that bypass that filter.
 */
function unitIgnoresCardDamage(state: GameState, unit: CombatUnitState, card: CardDefinition | undefined): boolean {
  if (!card) {
    return false;
  }
  // Orb of Inhibition (option A): for the rest of the Combat every Spell and
  // Hero-Specialty CARD deals 0 damage to every unit. Checked at this shared
  // card-damage predicate so the direct, area, Xyron and Chain Lightning paths
  // (all of which gate on this function) are covered for both armies at once.
  if (cardDamageNullified(state) && (card.kind === "spell" || card.kind === "hero-specialty")) {
    return true;
  }
  if (card.kind === "hero-specialty") {
    return hasImmuneToSpecialtyDamage(unit);
  }
  if (card.kind === "spell") {
    // Pendant of Negativity (option B): an artifact-granted school immunity also
    // turns the spell aside. Unlike printed immunity it is NOT lifted by Orb of
    // Vulnerability (an artifact effect, like Anti-Magic).
    if (unitImmuneToSpellSchoolsByEffect(state, unit, card.spellSchools)) {
      return true;
    }
    // Orb of Vulnerability negates printed spell-school immunity, so the unit
    // takes the spell like any other.
    return !spellAbilitiesSuppressed(state) && unitImmuneToSpellSchools(unit, card.spellSchools);
  }
  return false;
}

/**
 * Rampart Dwarves "Magic Resistance": when a Spell or Specialty card targets a
 * single Dwarf unit, it rolls one Attack die; on the printed face ("+1") the
 * card has no effect on it. The roll happens whether the card is friendly or
 * hostile. Returns true when the card is negated (the caller skips the effect).
 * Rolls at most once, and only when the target is a living Dwarf carrying the
 * ability — otherwise it is a no-op that never touches the dice.
 */
function negatesCardOnDwarfRoll(state: GameState, target: TargetRef | undefined, cardName: string): boolean {
  const combat = state.combat;
  if (!combat || !target || target.type !== "unit") {
    return false;
  }
  // Orb of Vulnerability negates the Dwarves' Magic Resistance — no roll, the
  // card simply takes hold.
  if (spellAbilitiesSuppressed(state)) {
    return false;
  }
  const unit = combat.units[target.unitId];
  const negate = unit ? getCardNegateOnDie(unit) : null;
  if (!unit || !isUnitAlive(unit) || !negate) {
    return false;
  }

  const roll = rollAttackDie(combat);
  const negated = roll === negate.onRoll;
  appendEvent(state, {
    type: "UNIT_ABILITY_TRIGGERED",
    unitId: unit.id,
    abilityId: negate.abilityId,
    targetUnitId: unit.id,
    message: negated
      ? `${unit.cardName} rolls ${roll} and shrugs off ${cardName} (${negate.abilityName}).`
      : `${unit.cardName} rolls ${roll} for ${negate.abilityName}; ${cardName} takes hold.`
  });
  return negated;
}

/**
 * Boots of Polarity: roll `count` Attack dice against a pending Spell and keep
 * the best ("choose one"). The cancel succeeds when at least one kept die shows
 * the success face (the "+1", value 1). Logged as a SPELL_DICE_ROLLED so the
 * client shows the dice tumbling on the spell; `hits` is the number of success
 * faces. Returns whether the spell is ignored.
 */
function rollSpellCancelDice(
  state: GameState,
  diceRoll: { count: number; successFace: number },
  pendingSpellCardId: CardId,
  rollerId: PlayerId
): boolean {
  const combat = state.combat;
  if (!combat) {
    return false;
  }
  const rolls = Array.from({ length: Math.max(1, diceRoll.count) }, () => rollAttackDie(combat));
  const hits = rolls.filter((value) => value === diceRoll.successFace).length;
  appendEvent(state, {
    type: "SPELL_DICE_ROLLED",
    spellCardId: pendingSpellCardId,
    playerId: rollerId,
    rolls,
    hits
  });
  return hits > 0;
}

/**
 * Damage actually dealt to a unit by a card, after immunity and the golems'
 * damage-reduction passives, floored at 0. The source card's kind decides which
 * reduction applies: Spell cards are softened by "reduce Spell damage" (Iron/
 * Gold/Diamond Golems, Steel Golems, Black Dragons), Hero-Specialty cards only
 * by the Steel Golems' "spell or Specialty" passive. Used at every
 * card-sourced combat-damage site (direct, area, Xyron's Inferno, Chain
 * Lightning); non-card Spell damage (Earthquake, the Faerie bolt) stays on
 * reducedSpellDamage.
 */
function reducedCardDamage(
  state: GameState,
  unit: CombatUnitState,
  card: CardDefinition | undefined,
  amount: number
): number {
  if (unitIgnoresCardDamage(state, unit, card)) {
    return 0;
  }
  const reduction =
    card?.kind === "hero-specialty"
      ? getSpecialtyDamageReduction(unit)
      : card?.kind === "spell"
        ? // Spell-kind: include the Rampart Unicorns' adjacency aura and any
          // WOG Messenger protection matching this spell's school.
          totalSpellDamageReduction(state, unit) +
          getSpellSchoolDamageReduction(unit, card.spellSchools ?? [])
        : 0;
  return Math.max(0, amount - reduction);
}

// (finishCombatIfNeeded lives in combat-units.ts.)

/**
 * Inferno: roll the Attack die `rollCount` times, count the "+1" faces, then
 * deal that many points of spell damage to every living unit standing on the
 * targeted space or an orthogonally adjacent one (friend or foe). Spell-damage
 * reduction and spell immunity apply per unit, just like any other spell hit.
 */
function resolveInfernoSpell(
  state: GameState,
  playerId: PlayerId,
  card: CardDefinition,
  position: number,
  rollCount: number
): void {
  const combat = state.combat;
  if (!combat) {
    return;
  }

  const rolls = Array.from({ length: Math.max(1, rollCount) }, () => rollAttackDie(combat));
  const damage = rolls.filter((roll) => roll === 1).length;

  // Show the dice first: the client animates them tumbling and reading out (with
  // the dice clatter + Inferno's roar), and only then does the burst land and the
  // damage float. Logged even on a whiff so the player always sees the roll.
  appendEvent(state, {
    type: "SPELL_DICE_ROLLED",
    spellCardId: card.id,
    playerId,
    rolls,
    hits: damage,
    position
  });

  if (damage <= 0) {
    return;
  }

  const blastArea = new Set<number>([position, ...getOrthogonalNeighbors(position)]);
  // Snapshot the targets first so removals during the loop never shift it.
  const targets = Object.values(combat.units).filter(
    (unit) => isUnitAlive(unit) && blastArea.has(unit.position)
  );

  for (const unit of targets) {
    const dealt = reducedCardDamage(state, unit, card, damage);
    if (dealt <= 0) {
      continue;
    }
    unit.damage += dealt;
    noteUnitDamagedForTokens(state, unit, dealt);
    appendEvent(state, {
      type: "DAMAGE_ASSIGNED",
      source: { type: "card", cardId: card.id, controllerId: playerId },
      target: { type: "unit", unitId: unit.id },
      amount: dealt,
      damageKind: "spell"
    });
    markUnitRemovedIfNeeded(state, unit);
  }
}

/**
 * Deals `amount` card-sourced spell damage to a single unit for the area blasts
 * (Frost Ring, Meteor Shower, Xyron's Inferno). Per-unit spell/Specialty immunity
 * and damage reduction (reducedCardDamage) apply; the hit is logged and the unit
 * flipped/removed. The caller checks finishCombatIfNeeded once the blast is done.
 */
function dealAreaCardDamage(
  state: GameState,
  playerId: PlayerId,
  card: CardDefinition | undefined,
  unit: CombatUnitState,
  amount: number
): void {
  const dealt = reducedCardDamage(state, unit, card, amount);
  if (dealt <= 0) {
    return;
  }
  unit.damage += dealt;
  noteUnitDamagedForTokens(state, unit, dealt);
  appendEvent(state, {
    type: "DAMAGE_ASSIGNED",
    source: card ? { type: "card", cardId: card.id, controllerId: playerId } : { type: "system" },
    target: { type: "unit", unitId: unit.id },
    amount: dealt,
    damageKind: "spell"
  });
  markUnitRemovedIfNeeded(state, unit);
}

/**
 * Merist's Stone Skin IV / VI: give every living unit the player controls a
 * Defense token (the Defend shield) for the rest of the combat. A unit already
 * holding one is unchanged; the tokens render straight from unit state, and the
 * card-played event already records the play.
 */
function grantDefenseTokensToAll(state: GameState, playerId: PlayerId): void {
  const combat = state.combat;
  if (!combat) {
    return;
  }
  for (const unit of Object.values(combat.units)) {
    if (unit.controllerId === playerId && isUnitAlive(unit)) {
      unit.defenseToken = true;
    }
  }
}

/**
 * Opens the "area-pick" choice: the caster picks one of `candidateUnitIds`,
 * which takes `amount` damage, then the choice re-opens (picksRemaining - 1)
 * until the picks are spent or the candidates run out. Used when more units are
 * adjacent to a blast's centre than the spell/specialty may hit.
 */
function openAreaPickChoice(
  state: GameState,
  playerId: PlayerId,
  card: CardDefinition | undefined,
  candidateUnitIds: UnitId[],
  picksRemaining: number,
  amount: number
): void {
  const choiceId = `choice_${nextEventNumber(state)}`;
  state.pendingChoice = {
    id: choiceId,
    type: "ABILITY_TARGET_CHOICE",
    playerId,
    kind: "area-pick",
    abilityId: card?.id ?? null,
    abilityName: card?.name ?? "Area blast",
    prompt: `${card?.name ?? "Area blast"}: pick ${picksRemaining} more adjacent unit${
      picksRemaining === 1 ? "" : "s"
    } to take ${amount} damage (friend or foe).`,
    sourceUnitId: null,
    anchorUnitId: null,
    candidateUnitIds,
    amount,
    picksRemaining,
    sourceCardId: card?.id
  };
  state.phase = "choice";
  state.priorityPlayerId = playerId;
  appendEvent(state, {
    type: "PENDING_CHOICE_CREATED",
    choiceId,
    choiceType: "ABILITY_TARGET_CHOICE",
    playerId,
    sourceEffectIds: [],
    message: `${card?.name ?? "An area blast"} may scorch ${picksRemaining} of the adjacent units.`
  });
}

/**
 * Hits `picks` of `candidateUnitIds` for `amount` damage each. When that many or
 * fewer are still alive, all of them are hit at once; otherwise the caster
 * chooses which via the area-pick choice.
 */
function applyAdjacentPicks(
  state: GameState,
  playerId: PlayerId,
  card: CardDefinition | undefined,
  candidateUnitIds: UnitId[],
  picks: number,
  amount: number
): void {
  const combat = state.combat;
  if (!combat || picks <= 0) {
    return;
  }
  const alive = candidateUnitIds.filter((id) => isUnitAlive(combat.units[id]));
  if (alive.length === 0) {
    return;
  }
  if (alive.length <= picks) {
    for (const id of alive) {
      dealAreaCardDamage(state, playerId, card, combat.units[id], amount);
    }
    return;
  }
  openAreaPickChoice(state, playerId, card, alive, picks, amount);
}

/**
 * Frost Ring / Meteor Shower I & VI: deal `amount` to up to `adjacentPicks` units
 * orthogonally adjacent to `centerPosition` (and the unit on the centre space too
 * when `includeCenter`), friend or foe. A unit that fully ignores this card's
 * damage is never a pick candidate (its slot is not wasted). When more eligible
 * units are adjacent than may be hit, the caster picks which.
 */
function resolveAreaPickDamage(
  state: GameState,
  playerId: PlayerId,
  card: CardDefinition | undefined,
  centerPosition: number,
  amount: number,
  includeCenter: boolean,
  adjacentPicks: number
): void {
  const combat = state.combat;
  if (!combat) {
    return;
  }

  if (includeCenter) {
    const centre = Object.values(combat.units).find(
      (unit) => isUnitAlive(unit) && unit.position === centerPosition
    );
    if (centre) {
      dealAreaCardDamage(state, playerId, card, centre, amount);
    }
  }

  const neighbours = new Set(getOrthogonalNeighbors(centerPosition));
  const candidates = Object.values(combat.units).filter(
    (unit) =>
      isUnitAlive(unit) && neighbours.has(unit.position) && !unitIgnoresCardDamage(state, unit, card)
  );
  applyAdjacentPicks(
    state,
    playerId,
    card,
    candidates.map((unit) => unit.id),
    adjacentPicks,
    amount
  );
}

function rollAttackCandidate(combat: CombatState, rollMode: AttackRollMode): AttackRollCandidate {
  const { rolls, selectedRoll } = rollAttackDice(combat, rollMode);
  return {
    rolls,
    roll: selectedRoll
  };
}

function getAttackDamagePreview(
  attacker: CombatUnitState,
  defender: CombatUnitState,
  roll: number,
  attackBonus: number,
  defenseBonus: number,
  defendBonus: number,
  dieMultiplier = 1,
  baseAttackOverride?: number,
  damageReduction = 0,
  ignoreDefense = false,
  dieCancelled = false
): { attackValue: number; defenseValue: number; damage: number; dieAttackBonus: number; dieDefenseBonus: number } {
  // Attack-die-face conditioned modifiers, resolved here so the actual hit and
  // the lethal-save preview always agree: Dread Knights' "Death Blow" adds to
  // the attacker's value on 0/+1, Zombies'/Manticores' resilience adds Defense
  // for the defender on the attacker's 0/+1. Shield of the Dwarven Lords ignores
  // the die "and any additional effects it triggered", so a cancelled die fires
  // none of these face-conditioned bonuses.
  const dieAttackBonus = dieCancelled ? 0 : getAttackBonusOnAttackDie(attacker, roll);
  const dieDefenseBonus = dieCancelled ? 0 : getDefenseBonusOnAttackDie(defender, roll);
  const baseAttack = baseAttackOverride ?? attacker.attack;
  const attackValue = Math.max(0, baseAttack + attackBonus + dieAttackBonus + roll * dieMultiplier);
  // Elemental damage ignores Defense outright; otherwise sum printed Defense,
  // the Defend roll's bonus (0 or +1, rolled per attack by the caller), played
  // Defense buffs and any die-face Defense bonus.
  //
  // Curse / Weakness-style debuffs print "(to a minimum of 0)": a negative
  // `defenseBonus` (e.g. a Power-2 Curse of -3) may lower a unit's Defense to 0
  // but never below. Floor the printed-Defense-plus-buffs subtotal at 0 — exactly
  // like the ability-reduction clamp at `currentDefenseValue` above and the
  // Corrosion-token sibling (`-Math.min(unit.defense, reduction)`) — so a strike
  // can never land for MORE than the attacker's full Attack. The Defend roll and
  // any die-face Defense bonus are separate shields added on top of the floor.
  const defenseValue = ignoreDefense
    ? 0
    : Math.max(0, defender.defense + defenseBonus) + defendBonus + dieDefenseBonus;
  // Siege wall cover: "reduce the attack's damage by 1" comes off the damage,
  // not the defense.
  const rawDamage = Math.max(0, Math.max(0, attackValue - defenseValue) - damageReduction);
  // WOG commander Damage grade ("Might"): a hit that deals at least 1 damage
  // deals the bonus on top — a fully-blocked attack (0 damage) gains nothing.
  // Resolved here so the actual hit and the lethal-save preview agree.
  const onHitBonus = rawDamage > 0 ? getBonusDamageOnHit(attacker) : 0;
  // Cove Nix (Pack): "cannot take more than N damage from a single attack." The
  // cap clamps the resolved damage of this one attack — Might included — and is
  // reflected in the lethal-save preview too (both go through here), so a
  // capped blow correctly reads as non-lethal.
  const cap = getDamageCapPerAttack(defender);
  const damage = cap ? Math.min(rawDamage + onHitBonus, cap.amount) : rawDamage + onHitBonus;

  return {
    attackValue,
    defenseValue,
    damage,
    dieAttackBonus,
    dieDefenseBonus
  };
}

function applyAttackDamageFromCandidate(
  state: GameState,
  attacker: CombatUnitState,
  defender: CombatUnitState,
  isRetaliation: boolean,
  rollMode: AttackRollMode,
  attackBonus: number,
  defenseBonus: number,
  defendBonus: number,
  defendRoll: number | undefined,
  candidate: AttackRollCandidate,
  dieMultiplier = 1,
  baseAttackOverride?: number,
  damageReduction = 0,
  lethalCancel?: { grade: UnitGrade },
  ignoreDefense = false,
  noDie = false,
  dieCancelled = false
): { damage: number; roll: number; cancelled: boolean } {
  if (!state.combat) {
    return { damage: 0, roll: 0, cancelled: false };
  }

  const preview = getAttackDamagePreview(
    attacker,
    defender,
    candidate.roll,
    attackBonus,
    defenseBonus,
    defendBonus,
    dieMultiplier,
    baseAttackOverride,
    damageReduction,
    ignoreDefense,
    dieCancelled
  );
  const { attackValue, defenseValue, dieAttackBonus, dieDefenseBonus } = preview;
  let damage = preview.damage;
  const defensiveRoll = getDefenseDieDamageReduction(defender);
  if (defensiveRoll && damage > 0) {
    const roll = rollAttackDie(state.combat);
    if (roll === defensiveRoll.onRoll) {
      const reduced = Math.min(damage, defensiveRoll.amount);
      damage -= reduced;
      appendEvent(state, {
        type: "UNIT_ABILITY_TRIGGERED",
        unitId: defender.id,
        abilityId: defensiveRoll.abilityId,
        targetUnitId: defender.id,
        message: `${defender.cardName} rolls ${roll} and reduces the attack's damage by ${reduced}.`
      });
    }
  }
  // Factory Couatls' activated invulnerability: while it "ignores all damage",
  // the blow still lands (die rolls, event fires, the Couatl may still
  // retaliate) but for 0 damage — nothing is added and it is never removed.
  if (isUnitDamageImmune(defender) && damage > 0) {
    damage = 0;
    const ward = getInvulnerabilityActivation(defender);
    appendEvent(state, {
      type: "UNIT_ABILITY_TRIGGERED",
      unitId: defender.id,
      abilityId: ward?.abilityId ?? "couatl-invulnerability",
      targetUnitId: defender.id,
      message: `${defender.cardName} is invulnerable and shrugs off the attack.`
    });
  }
  // Reported bonuses fold in the die-face-conditioned deltas so the event's
  // numbers reconcile with the resolved attack/defense values.
  const reportedAttackBonus = attackBonus + dieAttackBonus;
  const reportedDefenseBonus = defenseBonus + dieDefenseBonus;
  // A cancelled die (Shield of the Dwarven Lords) is reported like an unrolled
  // die so the client skips the rolling-dice cinematic.
  const skipDieCinematic = noDie || dieCancelled;

  // Alamar's Resurrection: if this blow would reduce the defender to 0 HP and
  // its grade is within reach, the whole attack is cancelled — no damage, and
  // (handled by the caller) no Retaliation Attack either.
  if (
    lethalCancel &&
    damage > 0 &&
    defender.damage + damage >= defender.maxHealth &&
    gradeRankOfUnit(defender) <= gradeRank(lethalCancel.grade)
  ) {
    appendEvent(state, {
      type: "ATTACK_ROLLED",
      attackerId: attacker.id,
      defenderId: defender.id,
      rolls: candidate.rolls,
      roll: candidate.roll,
      ...(dieMultiplier !== 1 ? { dieMultiplier } : {}),
      ...(skipDieCinematic ? { noDie: true } : {}),
      ...(candidate.sumAllDice ? { sumAllDice: true } : {}),
      ...(defendRoll !== undefined ? { defendRoll } : {}),
      rollMode,
      attackBonus: reportedAttackBonus,
      defenseBonus: reportedDefenseBonus,
      attackValue,
      defenseValue,
      damage: 0,
      isRetaliation
    });
    appendEvent(state, {
      type: "UNIT_ABILITY_TRIGGERED",
      unitId: defender.id,
      abilityId: "resurrection",
      message: `Resurrection cancels the attack that would have destroyed ${defender.cardName}.`
    });
    return { damage: 0, roll: candidate.roll, cancelled: true };
  }

  // Remember whether the defender was on the board before this hit, so Cove
  // Seamen's "removes a unit from Combat" reward can tell a real kill from a
  // Pack→Few flip (which leaves the unit alive) below.
  const defenderWasAlive = isUnitAlive(defender);

  // Damage is not capped at the pack's health: the rulebook carries any
  // excess over onto the Few side when the pack flips.
  defender.damage += damage;

  appendEvent(state, {
    type: "ATTACK_ROLLED",
    attackerId: attacker.id,
    defenderId: defender.id,
    rolls: candidate.rolls,
    roll: candidate.roll,
    ...(dieMultiplier !== 1 ? { dieMultiplier } : {}),
    ...(skipDieCinematic ? { noDie: true } : {}),
    ...(candidate.sumAllDice ? { sumAllDice: true } : {}),
    ...(defendRoll !== undefined ? { defendRoll } : {}),
    rollMode,
    attackBonus: reportedAttackBonus,
    defenseBonus: reportedDefenseBonus,
    attackValue,
    defenseValue,
    damage,
    isRetaliation
  });

  // Cove Nix (Pack): announce when its per-attack damage cap actually softened
  // this hit so the log/FX fire (the clamp itself happened in the preview).
  const uncappedDamage = Math.max(0, Math.max(0, attackValue - defenseValue) - damageReduction);
  if (uncappedDamage > damage) {
    const cap = getDamageCapPerAttack(defender);
    if (cap) {
      appendEvent(state, {
        type: "UNIT_ABILITY_TRIGGERED",
        unitId: defender.id,
        abilityId: cap.abilityId,
        message: `${defender.cardName} shrugs it off — ${cap.abilityName} caps the hit at ${cap.amount} damage.`
      });
    }
  }

  // Dread Knights' "Death Blow": announce the die-triggered Attack bonus so the
  // log and the FX/sound fire (the bonus itself is already folded into damage).
  if (dieAttackBonus > 0) {
    for (const ability of getTriggeredAttackDieBonusAbilities(attacker, candidate.roll)) {
      appendEvent(state, {
        type: "UNIT_ABILITY_TRIGGERED",
        unitId: attacker.id,
        abilityId: ability.abilityId,
        targetUnitId: defender.id,
        message: `${attacker.cardName} lands a ${ability.abilityName} (+${ability.amount} Attack).`
      });
    }
  }

  if (damage > 0) {
    appendEvent(state, {
      type: "DAMAGE_ASSIGNED",
      source: {
        type: "unit",
        unitId: attacker.id,
        controllerId: attacker.controllerId
      },
      target: { type: "unit", unitId: defender.id },
      amount: damage,
      damageKind: "attack"
    });
  }

  noteUnitDamagedForTokens(state, defender, damage);
  markUnitRemovedIfNeeded(state, defender);

  // Clone Spell: "If the Clone takes at least 1 damage from any source, OR is
  // attacked (even if that attack inflicts 0 damage), destroy the Clone." Any
  // damage already removed it above (a Clone has 1 Health); this covers the
  // 0-damage case — it is destroyed for having been attacked, so it never lives
  // to retaliate. (Spells/abilities that deal 0 damage are NOT attacks and do
  // not trigger this — only an attack does.)
  if (defender.cloneOfUnitId && isUnitAlive(defender)) {
    defender.damage = defender.maxHealth;
    markUnitRemovedIfNeeded(state, defender);
  }

  // Cove Seamen (Pack): "Once per Combat, when this unit removes a unit from
  // Combat, gain 2 gold." Paid only on a real removal (alive → off the board),
  // never on a Pack→Few flip, and only once per fight per Seamen stack. Works on
  // a Retaliation Attack kill too, since every attack funnels through here.
  if (defenderWasAlive && !isUnitAlive(defender) && !attacker.gainedKillGoldThisCombat) {
    const reward = getOnKillResourceGain(attacker);
    const player = reward ? state.players[attacker.controllerId] : undefined;
    if (reward && player) {
      attacker.gainedKillGoldThisCombat = true;
      player.resources[reward.resource] += reward.amount;
      appendEvent(state, {
        type: "UNIT_ABILITY_TRIGGERED",
        unitId: attacker.id,
        abilityId: reward.abilityId,
        targetUnitId: defender.id,
        message: `${attacker.cardName} plunders ${reward.amount} ${reward.resource} for removing ${defender.cardName}.`
      });
    }
  }
  if (defenderWasAlive && !isUnitAlive(defender)) {
    applyWogOnKillEffects(state, attacker, defender);
  }
  // Factory Sandworms (Pack): "Place a faction cube on this unit whenever it
  // defeats an enemy unit." A real removal (not a Pack→Few flip) banks a cube;
  // it may later be spent to attack again (SPEND_FACTION_CUBE_ATTACK_AGAIN).
  if (defenderWasAlive && !isUnitAlive(defender)) {
    const cubeGain = getGainFactionCubeOnKill(attacker);
    if (cubeGain) {
      attacker.factionCubes = (attacker.factionCubes ?? 0) + 1;
      appendEvent(state, {
        type: "UNIT_ABILITY_TRIGGERED",
        unitId: attacker.id,
        abilityId: cubeGain.abilityId,
        targetUnitId: defender.id,
        message: `${attacker.cardName} devours ${defender.cardName} and banks a faction cube (${attacker.factionCubes}).`
      });
    }
  }
  return { damage, roll: candidate.roll, cancelled: false };
}

/** WOG kill-triggered passives shared by normal attacks and retaliations. */
function applyWogOnKillEffects(
  state: GameState,
  attacker: CombatUnitState,
  defender: CombatUnitState
): void {
  if (!state.combat || isUnitAlive(defender) || !isUnitAlive(attacker)) {
    return;
  }

  const harvest = getOnKillHealthHarvest(attacker);
  if (harvest && (!harvest.requiresNonUndead || !isUndeadUnit(defender))) {
    const healed = attacker.damage;
    attacker.damage = 0;
    const currentBonus = attacker.permanentHealthBonus ?? 0;
    const gained = Math.min(harvest.amount, Math.max(0, harvest.maxBonus - currentBonus));
    if (gained > 0) {
      attacker.permanentHealthBonus = currentBonus + gained;
      attacker.maxHealth += gained;
      const armyUnit = state.players[attacker.controllerId]?.army.find(
        (candidate) => candidate.id === attacker.armyUnitId
      );
      if (armyUnit) {
        armyUnit.permanentHealthBonus = attacker.permanentHealthBonus;
      }
    }
    appendEvent(state, {
      type: "UNIT_ABILITY_TRIGGERED",
      unitId: attacker.id,
      abilityId: harvest.abilityId,
      targetUnitId: defender.id,
      message: `${attacker.cardName} harvests ${defender.cardName}'s soul, heals all damage${gained > 0 ? ` and gains +${gained} Health` : ""}.`
    });
    if (healed > 0) {
      appendEvent(state, {
        type: "DAMAGE_HEALED",
        source: { type: "unit", unitId: attacker.id, controllerId: attacker.controllerId },
        target: { type: "unit", unitId: attacker.id },
        amount: healed
      });
    }
  }

  const weakCopy = getOnKillWeakCopy(attacker);
  if (!weakCopy || (weakCopy.oncePerCombat && attacker.weakCopySummonedThisCombat) || !attacker.unitDefId) {
    return;
  }
  const summoned = makeCombatUnitFromArmy(
    { id: `wog_weak_${nextEventNumber(state)}`, unitDefId: attacker.unitDefId, side: attacker.variant },
    attacker.controllerId,
    `unit_${attacker.controllerId}_wog_weak_${nextEventNumber(state)}`,
    defender.position,
    getRuleset(state),
    unitSideRuleOverrides(state)
  );
  if (!summoned) {
    return;
  }
  summoned.attack = Math.max(0, summoned.attack - weakCopy.statPenalty);
  summoned.defense = Math.max(0, summoned.defense - weakCopy.statPenalty);
  summoned.maxHealth = Math.max(1, summoned.maxHealth - weakCopy.statPenalty);
  summoned.initiative = Math.max(0, summoned.initiative - weakCopy.statPenalty);
  summoned.abilities = [];
  summoned.cardName = `Weak ${attacker.name}`;
  summoned.summoned = true;
  summoned.temporary = true;
  delete summoned.armyUnitId;
  state.combat.units[summoned.id] = summoned;
  attacker.weakCopySummonedThisCombat = true;
  appendEvent(state, {
    type: "UNIT_ABILITY_TRIGGERED",
    unitId: attacker.id,
    abilityId: weakCopy.abilityId,
    targetUnitId: summoned.id,
    message: `${attacker.cardName} summons a temporary Weak ${attacker.name}.`
  });
}

function applyPostAttackAbilityDamage(
  state: GameState,
  attacker: CombatUnitState,
  defender: CombatUnitState,
  attackKind: "melee" | "ranged",
  roll: number,
  damage: number
): void {
  const combat = state.combat;
  if (!combat) {
    return;
  }

  const damageEffects = getPostAttackAbilityDamageEffects(combat, {
    attacker,
    defender,
    attackKind,
    roll,
    damage
  });

  for (const effect of damageEffects) {
    const target = combat.units[effect.targetUnitId];
    if (!target || !isUnitAlive(target)) {
      continue;
    }
    // Factory Couatls' invulnerability ignores this post-attack ability damage.
    if (isUnitDamageImmune(target)) {
      continue;
    }

    appendEvent(state, {
      type: "UNIT_ABILITY_TRIGGERED",
      unitId: effect.sourceUnitId,
      abilityId: effect.abilityId,
      targetUnitId: effect.targetUnitId,
      message: effect.message
    });

    const assignedDamage = Math.min(effect.amount, Math.max(0, target.maxHealth - target.damage));
    target.damage += effect.amount;
    noteUnitDamagedForTokens(state, target, effect.amount);

    if (assignedDamage > 0) {
      appendEvent(state, {
        type: "DAMAGE_ASSIGNED",
        source: {
          type: "unit",
          unitId: effect.sourceUnitId,
          controllerId: attacker.controllerId
        },
        target: { type: "unit", unitId: target.id },
        amount: assignedDamage,
        damageKind: effect.damageKind
      });
    }

    markUnitRemovedIfNeeded(state, target);
  }
}

function getAttackStackDetails(
  state: GameState,
  stackItem: ResolutionStackItem
):
  | {
      attacker: CombatUnitState;
      defender: CombatUnitState;
      isRetaliation: boolean;
      attackKind: "melee" | "ranged";
      rollMode: AttackRollMode;
      attackBonus: number;
      defenseBonus: number;
      dieMultiplier: number;
      /** Bless / Elemental damage: the Attack die is skipped and counts as 0. */
      ignoreAttackDie: boolean;
      /**
       * Elemental damage: the defender's Defense is ignored entirely (printed
       * Defense, Defense token, and any Defense buffs), so the hit lands for the
       * attacker's full Attack value.
       */
      ignoreDefense: boolean;
      /** Siege wall cover: damage knocked off a ranged hit (0 or 1). */
      damageReduction: number;
      /** Behemoths: the announced defense reduction applied to this attack. */
      defenseReductionAbility?: { abilityId: string; abilityName: string; amount: number };
      /** Printed-ability follow-up (Death Cloud): replacement base attack. */
      abilityAttack?: { abilityId: string; baseAttack: number };
    }
  | null {
  const combat = state.combat;
  if (!combat || (stackItem.action.type !== "ATTACK_UNIT" && stackItem.action.type !== "MOVE_AND_ATTACK_UNIT")) {
    return null;
  }

  const attacker = combat.units[stackItem.action.attackerId];
  const defender = combat.units[stackItem.action.defenderId];
  if (!attacker || !defender) {
    return null;
  }

  const triggerEvent = stackItem.triggerEventIds
    .map((eventId) => state.eventLog.find((event) => event.id === eventId))
    .find((event): event is Extract<GameEvent, { type: "UNIT_ATTACK_DECLARED" }> => event?.type === "UNIT_ATTACK_DECLARED");
  const isRetaliation = triggerEvent?.isRetaliation ?? false;
  const attackKind = triggerEvent?.attackKind ?? getAttackKind(attacker, defender);
  // The Ammo Cart waiver applies inside getAttackRollMode (state param). The
  // "[unit_attack] Ignore the combat penalties" ability waives penalties only on
  // the unit's OWN attack, so pass isRetaliation so a retaliating Sharpshooter /
  // Magi / Halfling still suffers the adjacent/long-range penalty.
  let rollMode = triggerEvent?.rollMode ?? getAttackRollMode(attacker, defender, state, isRetaliation);

  // Precision (this attack) and Golden Bow (whole combat) lift the ranged
  // back-row penalty after the attack was declared.
  if (
    rollMode === "disadvantage" &&
    attacker.type === "ranged" &&
    (stackItem.modifiers.ignoreRangedPenalty ||
      state.activeEffects.some(
        (effect) =>
          effect.controllerId === attacker.controllerId &&
          effect.modifiers.some((modifier) => modifier.type === "RANGED_IGNORE_PENALTY")
      ))
  ) {
    rollMode = "normal";
  }

  // Shaman's Puppet (option A) forces the attacker to roll two dice and keep the
  // lower. That is not a ranged penalty, so the Precision/Golden Bow waiver above
  // must never lift it — re-assert disadvantage here for a puppeted attacker.
  if (unitAttackRollDisadvantaged(state, attacker)) {
    rollMode = "disadvantage";
  }

  const activeAttackBonus = getActiveAttackBonus(state, {
    attacker,
    defender,
    attackKind
  });
  // Cyra's Haste VI: +Defense only against an attacker slower than the defender.
  const conditionalDefenseBonus = getConditionalDefenseBonus(state, defender, attacker);
  // Shield / Air Shield: +Defense only against a ground-or-flying / ranged attacker.
  const attackerTypeDefenseBonus =
    getAttackerTypeDefenseBonus(state, defender, attacker) +
    // Shamans' innate Air Shield is a unit passive, not an active effect.
    getSelfAttackerTypeDefenseBonus(defender, attacker);
  const activeDefenseBonus =
    getActiveDefenseBonus(state, defender) + conditionalDefenseBonus + attackerTypeDefenseBonus;
  const abilityAttack = stackItem.action.type === "ATTACK_UNIT" ? stackItem.action.abilityAttack : undefined;

  // Combat tokens: Attack/Weakness tokens shift the attacker, Corrosion the
  // defender (already floored so printed defense never drops below 0).
  const tokenAttack = tokenAttackBonus(attacker);
  const tokenDefense = tokenDefenseDelta(defender);

  // Magic Mirror bounced an instant Curse/Weakness onto a unit: a one-shot stat
  // delta that applies to this exact attack (and its retaliation, carried on the
  // attackSequence) — read straight off the stack item like the instant it is.
  const redirectedInstants = stackItem.modifiers.redirectedInstants ?? [];
  const redirectedAttackDelta = redirectedInstants.reduce(
    (sum, entry) => (entry.stat === "attack" && entry.unitId === attacker.id ? sum + entry.amount : sum),
    0
  );
  const redirectedDefenseDelta = redirectedInstants.reduce(
    (sum, entry) => (entry.stat === "defense" && entry.unitId === defender.id ? sum + entry.amount : sum),
    0
  );

  // Attack-card "ability lowers the target's defense" sources, applied after
  // corrosion, never on retaliations or printed follow-up attacks: Behemoths'
  // flat crush, and the Manticore "ignore the target's printed Defense" (which
  // subtracts the defender's printed Defense value). Both are floored together
  // so the effective Defense never drops below 0.
  const defenseBonusBeforeAbility =
    stackItem.modifiers.defenseBonus + activeDefenseBonus + tokenDefense + redirectedDefenseDelta;
  const defenseReductionSource =
    !isRetaliation && !abilityAttack ? getAttackDefenseReductionAbility(attacker) : null;
  const ignoreCardDefenseSource =
    !isRetaliation && !abilityAttack ? getIgnoreTargetCardDefenseAbility(attacker) : null;
  // The Defend roll's +1 is a separate per-attack shield resolved at damage
  // time, not part of the printed/buffed Defense an ability (Behemoth crush,
  // Manticore "ignore printed Defense") can reduce — so it stays out of this
  // clamp and is simply added on top afterwards.
  const currentDefenseValue = Math.max(0, defender.defense + defenseBonusBeforeAbility);
  const requestedDefenseReduction =
    (defenseReductionSource?.amount ?? 0) + (ignoreCardDefenseSource ? defender.defense : 0);
  const defenseReductionAmount = Math.min(requestedDefenseReduction, currentDefenseValue);
  const reductionAbilitySource = defenseReductionSource ?? ignoreCardDefenseSource;
  const defenseReductionAbility =
    reductionAbilitySource && defenseReductionAmount > 0
      ? {
          abilityId: reductionAbilitySource.abilityId,
          abilityName: reductionAbilitySource.abilityName,
          amount: defenseReductionAmount
        }
      : undefined;

  // Ghost Dragons (Pack): "Add +1 to your Attack die result" on every attack
  // and Retaliation Attack this unit makes.
  const attackDieResultBonus = getAttackDieResultBonus(attacker);

  // "Hatred" grudge bonus (Archangels ↔ Arch Devils, Genies → Efreet, Titans →
  // Black Dragons): extra Attack when this unit attacks the named creature.
  const hatredAttackBonus = getAttackBonusVsDefenderName(attacker, defender.name);

  // Factory Bounty Hunters: +1/+2 Attack when striking a Marked enemy. An innate
  // ability bonus, added unclamped like Hatred (elemental clamps don't apply).
  const markAttackBonus = getAttackBonusVsMarked(attacker, defender);

  // Cove Haspids (Few) "Vengeance": +2 Attack once this unit has been flipped
  // down from its Pack side this combat. An innate ability bonus, so (like
  // Hatred) it is added unclamped even for elemental attackers.
  const flippedAttackBonus = getAttackBonusIfFlipped(attacker);

  // WOG commander Charge combo: +1 Attack when the commander attacks after
  // moving this activation. An innate ability bonus (unclamped, like Hatred);
  // never on a retaliation.
  const chargeAttackBonus =
    !isRetaliation && attacker.movedThisActivation ? getAttackBonusAfterMove(attacker) : 0;

  // WOG commander Haste/Slow riders: signed Attack shift on the buffed/slowed
  // unit when its target is strictly slower/faster (effective Initiative).
  // Spell-borne like Bless, so it rides the elemental clamp with the card bonus.
  const initiativeConditionalAttackBonus = getConditionalAttackBonus(state, attacker, defender);

  // Creature Bank Dragon Utopia Black Dragons: "+3 Attack while Stacked". A
  // flat innate bonus (added unclamped, like Hatred/Vengeance); the Stacked gate
  // is enforced upstream, so it is 0 the moment the Stack Token is discarded.
  const stackedAttackBonus = getFlatAttackBonus(attacker);
  // WoG Lava Sharpshooter / War Zealot: "+1 Attack when this unit attacks." A
  // flat innate bonus on the unit's OWN attack only — never its Retaliation
  // Attack (added unclamped, like Hatred/the Stacked bonus).
  const ownAttackFlatBonus = isRetaliation ? 0 : getOwnAttackFlatBonus(attacker);
  const astrologersRoundAttackBonus = state.round % 2 === 0 ? getAstrologersRoundFrenzy(attacker) : 0;

  // Retaliation-only modifiers keyed off the retaliation's defender — i.e. the
  // original attacker being struck back: Dread Knights gain Defense, Dragon
  // Flies sap the retaliator's Attack.
  const retaliationDefenseBonus = isRetaliation ? getDefenseBonusWhenRetaliated(defender) : 0;
  const retaliationAttackPenalty = isRetaliation ? getRetaliationAgainstAttackPenalty(defender) : 0;

  // Elemental damage (Elemental units, Moandor's Liches VI specialty): the
  // unit's attack value cannot be RAISED by attack cards (Bloodlust, Offense,
  // the Attack statistic, Bless's bonus…) or by Attack tokens — only LOWERED
  // by debuffs such as a Sorceress' Weakness. Clamp the positive card/token
  // contributions to 0 while leaving every negative one (and the printed
  // attack) intact.
  const dealsElemental = unitDealsElementalDamage(state, attacker);
  const cardAttackBonus =
    stackItem.modifiers.attackBonus + activeAttackBonus + redirectedAttackDelta + initiativeConditionalAttackBonus;
  const effectiveCardAttackBonus = dealsElemental ? Math.min(0, cardAttackBonus) : cardAttackBonus;
  const effectiveTokenAttack = dealsElemental ? Math.min(0, tokenAttack) : tokenAttack;

  return {
    attacker,
    defender,
    isRetaliation,
    attackKind,
    rollMode,
    attackBonus:
      // Elemental units clamp card/token buffs to ≤0 (main); innate ability
      // bonuses (Ghost Dragon die result, Hatred) are added unclamped.
      effectiveCardAttackBonus +
      effectiveTokenAttack +
      attackDieResultBonus +
      hatredAttackBonus +
      markAttackBonus +
      flippedAttackBonus +
      chargeAttackBonus +
      stackedAttackBonus +
      ownAttackFlatBonus +
      astrologersRoundAttackBonus -
      retaliationAttackPenalty -
      // Negative Morale "-1 to your next Attack … roll": latched onto this
      // attack when its die rolled (applyMoraleAttackRollPenalty), then folded
      // into every recompute — arithmetically identical to -1 on the die result.
      (stackItem.modifiers.moraleRollPenalty ?? 0),
    defenseBonus: defenseBonusBeforeAbility - defenseReductionAmount + retaliationDefenseBonus,
    dieMultiplier: stackItem.modifiers.attackDieMultiplier ?? 1,
    // Elemental damage never rolls the Attack die and ignores Defense entirely:
    // the hit always lands for the (un-buffable) Attack value.
    // Mummies "ignore the result on the Attack die" — their own attack die is
    // treated as 0, exactly like Bless / Elemental damage.
    ignoreAttackDie: Boolean(stackItem.modifiers.ignoreAttackDie) || dealsElemental || hasIgnoreOwnAttackDie(attacker),
    // Frenzy: legacy fixed-grade sets modifiers.ignoreDefense outright; the
    // Power-scaled form re-derives its pierced grade now from the caster's final
    // pooled Power, so Power paid after Frenzy was played still counts. Elemental
    // damage ignores Defense innately.
    // Ingham's Zealots VI lasting "ignores Defense" reaches every attack the
    // buffed unit makes, the same way Frenzy/elemental damage zero out Defense.
    ignoreDefense:
      dealsElemental ||
      Boolean(stackItem.modifiers.ignoreDefense) ||
      frenzyPierces(stackItem, defender) ||
      hasActiveIgnoresDefense(state, attacker),
    // Lord Haart (Necropolis) Dread Knights I/VI: an instant the defender's
    // controller played in this retaliation's window soaks `amount` less damage
    // off the strike (the ×2 for his Dread Knights is folded in when played).
    damageReduction:
      siegeRangedDamageReduction(combat, attacker, defender, attackKind) +
      (isRetaliation ? (stackItem.modifiers.retaliationDamageReductionInstant ?? 0) : 0),
    defenseReductionAbility,
    abilityAttack
  };
}

function getRerollUsesForEffect(effect: ActiveEffectState): number {
  return effect.modifiers
    .filter((modifier) => modifier.type === "ATTACK_DIE_REROLL")
    .reduce((best, modifier) => Math.max(best, modifier.maxUsesPerRoll), 0);
}

const AMMO_CART_CARD_ID = "war_machine.ammo_cart" as CardId;

/**
 * Builds the spend-ordered reroll pools for one attack roll. Rerolls from
 * different sources stack: unit abilities (e.g. Crusaders) are spent first,
 * then one-shot effects like Fortune, Luck is spent late, and the positive
 * morale token ("Reroll any Die you have thrown") is always kept for last.
 */
function buildRerollSources(
  state: GameState,
  attacker: CombatUnitState,
  rerollEffects: ActiveEffectState[],
  /** Whether the attacker moved this attack — gates Champions' "Charge" reroll. */
  moved = false
): AttackRerollSource[] {
  // Spirit of Oppression (option A): a global combat-scoped lockout removes every
  // Attack-die reroll source for BOTH players — unit abilities, Luck/Fortune/Mirth
  // effects and the positive morale token alike — so no reroll is ever offered
  // while it is in play ("neither player can use the positive morale token or
  // reroll Attack dice").
  if (attackRerollsBlocked(state)) {
    return [];
  }

  const abilitySources: AttackRerollSource[] = getUnitAttackRerollSources(attacker, moved).map((source) => ({
    name: source.name,
    remaining: source.rerolls,
    used: 0,
    ...(source.onlyOnRoll !== undefined ? { onlyOnRoll: source.onlyOnRoll } : {})
  }));

  // Ammo Cart (Astrologers): while the proclamation is face up, an owner of an
  // Ammo Cart war machine may reroll 1 Attack die for each of their ranged units.
  // Ability-style (no backing effect), rebuilt per attack → one reroll per ranged
  // attack; suppressed with everything else by the attackRerollsBlocked gate above.
  const proclamation = getActiveAstrologersCard(state)?.effect;
  const ammoCartSources: AttackRerollSource[] =
    attacker.type === "ranged" &&
    proclamation?.type === "WAR_MACHINE_BUFF" &&
    proclamation.rangedAttackReroll &&
    getPermanentCardIds(state, attacker.controllerId).includes(AMMO_CART_CARD_ID)
      ? [{ name: "Ammo Cart", remaining: 1, used: 0 }]
      : [];

  const orderedEffects = [...rerollEffects].sort(
    (left, right) => Number(left.name.includes("Luck")) - Number(right.name.includes("Luck"))
  );

  const player = state.players[attacker.controllerId];
  // The positive morale token's "reroll any die" use is available in every mode
  // a combat runs in (adventure and the combat sandbox alike).
  const moraleSources: AttackRerollSource[] =
    player && state.adventure?.moraleCards
      ? (player.moraleCards?.positive ?? [])
          .filter((cardId) => cardId === "morale.positive.reroll_die")
          .map((cardId) => ({
            name: cardLibrary[cardId]?.name ?? "Positive Morale: Reroll a Die",
            moraleCardId: cardId,
            remaining: 1,
            used: 0
          }))
    : player && player.morale > 0
      ? [{ name: "Positive morale token", morale: true, remaining: 1, used: 0 }]
      : [];

  // Positive Morale "set one of the dice to the +1 side": offered in the same
  // window but as a SET, spent only by the explicit set-die action (never by a
  // plain reroll press). The attackRerollsBlocked gate above withholds it too —
  // a deliberate reading: the lockout stops every Attack-die manipulation.
  const moraleSetSources: AttackRerollSource[] =
    player && state.adventure?.moraleCards
      ? (player.moraleCards?.positive ?? [])
          .filter((cardId) => cardId === MORALE_CARD_IDS.setAttackDiePlus)
          .map((cardId) => ({
            name: cardLibrary[cardId]?.name ?? "Positive Morale: Set Attack Die +1",
            moraleCardId: cardId,
            setDieFace: 1,
            remaining: 1,
            used: 0
          }))
      : [];

  // Diplomat's Ring / Ambassador's Sash: their "Reroll a die" half is an instant
  // played from hand in reaction to the Attack die — one offer per distinct held
  // copy, blocked when the attacker cannot use their Deck this Combat. Taking the
  // reroll discards the artifact (handled in rerollPendingChoice).
  const artifactSources: AttackRerollSource[] =
    player && !isHandLockedInCombat(state, attacker.controllerId)
      ? REROLL_REACTION_ARTIFACT_IDS.filter((cardId) => player.hand.includes(cardId)).map((cardId) => ({
          name: cardLibrary[cardId]?.name ?? cardId,
          cardId,
          remaining: 1,
          used: 0
        }))
      : [];

  return [
    ...abilitySources,
    ...ammoCartSources,
    ...orderedEffects.map((effect) => ({
      name: effect.name,
      effectId: effect.id,
      remaining: getRerollUsesForEffect(effect),
      used: 0
    })),
    ...artifactSources,
    ...moraleSources,
    ...moraleSetSources
  ].filter((source) => source.remaining > 0);
}

/** Rerolls left to offer, given the roll currently showing. */
function countAvailableRerolls(sources: AttackRerollSource[], currentRoll: number): number {
  return sources.reduce((total, source) => {
    if (!rerollSourceAvailableFor(source, currentRoll)) {
      return total;
    }
    // Face-gated sources never deplete — count them as one offer each.
    return total + (source.onlyOnRoll !== undefined ? 1 : source.remaining);
  }, 0);
}

function openAttackRerollChoice(
  state: GameState,
  stackItem: ResolutionStackItem,
  details: NonNullable<ReturnType<typeof getAttackStackDetails>>,
  candidate: AttackRollCandidate,
  rerollSources: AttackRerollSource[]
): void {
  const choiceId = `choice_${nextEventNumber(state)}`;
  const remainingRerolls = countAvailableRerolls(rerollSources, candidate.roll);
  const sourceEffectIds = rerollSources.flatMap((source) => (source.effectId ? [source.effectId] : []));

  state.pendingChoice = {
    id: choiceId,
    type: "ATTACK_DIE_REROLL",
    playerId: details.attacker.controllerId,
    stackItemId: stackItem.id,
    attackerId: details.attacker.id,
    defenderId: details.defender.id,
    isRetaliation: details.isRetaliation,
    attackKind: details.attackKind,
    rollMode: details.rollMode,
    attackBonus: details.attackBonus,
    defenseBonus: details.defenseBonus,
    candidates: [candidate],
    remainingRerolls,
    rerollSources,
    sourceEffectIds
  };
  state.phase = "choice";
  state.priorityPlayerId = details.attacker.controllerId;

  appendEvent(state, {
    type: "PENDING_CHOICE_CREATED",
    choiceId,
    choiceType: "ATTACK_DIE_REROLL",
    playerId: details.attacker.controllerId,
    sourceEffectIds,
    message: `${details.attacker.name} may reroll the attack die.`
  });
}

function closePendingChoice(
  state: GameState,
  choice: Extract<NonNullable<PendingChoice>, { type: "ATTACK_DIE_REROLL" }>,
  selectedIndex: number
): void {
  // Rerolling is optional: only the sources actually spent are marked used,
  // so declining a reroll keeps one-shot effects like Fortune available.
  const usedEffectIds = new Set(
    choice.rerollSources
      .filter((source) => source.used > 0 && source.effectId)
      .map((source) => source.effectId as string)
  );

  for (const effectId of usedEffectIds) {
    const effect = state.activeEffects.find((candidate) => candidate.id === effectId);
    if (!effect) {
      continue;
    }

    effect.usedChoiceIds.push(choice.id, choice.stackItemId);
    effect.usedRollEventIds.push(choice.id);
  }

  const consumedEffectIds = new Set(
    state.activeEffects
      .filter((effect) => usedEffectIds.has(effect.id))
      .filter((effect) =>
        effect.modifiers.some(
          (modifier) => modifier.type === "ATTACK_DIE_REROLL" && modifier.consumeEffectOnUse
        )
      )
      .map((effect) => effect.id)
  );

  if (consumedEffectIds.size > 0) {
    state.activeEffects = state.activeEffects.filter((effect) => !consumedEffectIds.has(effect.id));
  }

  appendEvent(state, {
    type: "PENDING_CHOICE_RESOLVED",
    choiceId: choice.id,
    playerId: choice.playerId,
    selectedIndex
  });

  state.pendingChoice = null;
}

/**
 * After an attack sequence (including any retaliation) finishes, the attacker
 * may still owe actions: a ranged unit may step 1 space after shooting, and
 * double-attack units strike the same target a second time. Otherwise the
 * activation ends and the next unit comes up.
 */
function concludeAttackerActivation(state: GameState, attacker: CombatUnitState): void {
  const combat = state.combat;

  // Harpies' "Strike and Return": once the attack (and the enemy's Retaliation
  // Attack, if any) has resolved, the harpy may fly back to the space it moved
  // from. A neutral always returns; a player is asked to return or stay.
  if (combat) {
    const origin = harpyReturnOrigin(combat, attacker);
    if (origin !== null) {
      if (isNeutralUnit(attacker)) {
        moveUnitToOrigin(state, attacker, origin);
        // fall through to end the activation
      } else {
        openHarpyReturnChoice(state, attacker, origin);
        return;
      }
    }
  }

  const canRangedReposition =
    Boolean(combat) &&
    combat !== null &&
    attacker.type === "ranged" &&
    isUnitAlive(attacker) &&
    !attacker.movedThisActivation &&
    !attacker.activatedThisRound &&
    getLegalMoveDestinations(combat, attacker, state).length > 0;

  if (canRangedReposition) {
    // Keep the shooter active so the player may move it after firing.
    state.phase = "combat";
    state.priorityPlayerId = null;
    return;
  }

  // Factory Sandworms (Pack): "[activation] You may remove a faction cube from
  // this unit in order to attack again." After its attack, while it still carries
  // a cube, keep it active so the player may spend one for another attack (or hold
  // to end the turn). It banks fresh cubes on kills, so it can chain.
  const canCubeAttackAgain =
    Boolean(combat) &&
    isUnitAlive(attacker) &&
    !attacker.activatedThisRound &&
    Boolean(getSpendCubeAttackAgain(attacker)) &&
    (attacker.factionCubes ?? 0) >= 1;
  if (canCubeAttackAgain) {
    state.phase = "combat";
    state.priorityPlayerId = null;
    return;
  }

  attacker.activatedThisRound = true;
  // Activation-bound effects on the attacker end with its activation (Berserk's
  // "in its activation" forced attack, any "this Activation" buff).
  appendExpiredEffectEvents(state, expireEffectsForActivationEnd(state, attacker.id), "activation-ended");
  advanceActiveUnit(state);
  state.phase = "combat";
  state.priorityPlayerId = null;
}

/**
 * Harpies' fly-back: the space the unit moved from this activation, if it has
 * the "Strike and Return" ability, moved to attack, is still alive, and that
 * origin space is free to land on. Returns null when no return is possible.
 */
function harpyReturnOrigin(combat: CombatState, attacker: CombatUnitState): number | null {
  if (!getReturnAfterAttackAbility(attacker) || !isUnitAlive(attacker)) {
    return null;
  }
  const origin = attacker.activationStartPosition;
  if (origin === undefined || !attacker.movedThisActivation || origin === attacker.position) {
    return null;
  }
  if (combat.obstacles?.includes(origin)) {
    return null;
  }
  const occupied = Object.values(combat.units).some(
    (unit) => unit.id !== attacker.id && isUnitAlive(unit) && unit.position === origin
  );
  return occupied ? null : origin;
}

/** Flies a unit back to its activation's starting space (Harpy return). */
function moveUnitToOrigin(state: GameState, unit: CombatUnitState, origin: number): void {
  const from = unit.position;
  unit.position = origin;
  unit.movedThisActivation = true;
  appendEvent(state, {
    type: "UNIT_MOVED",
    playerId: unit.controllerId,
    unitId: unit.id,
    from,
    to: origin
  });
}

/** Opens the player's "fly back or stay" choice after a Harpy's attack. */
function openHarpyReturnChoice(state: GameState, unit: CombatUnitState, origin: number): void {
  const choiceId = `choice_${nextEventNumber(state)}`;
  state.pendingChoice = {
    id: choiceId,
    type: "OPTION_CHOICE",
    playerId: unit.controllerId,
    prompt: `${unit.cardName}: fly back to ${getBattlefieldLabel(origin)} or hold at ${getBattlefieldLabel(unit.position)}?`,
    options: [
      { label: `Fly back to ${getBattlefieldLabel(origin)}` },
      { label: `Stay at ${getBattlefieldLabel(unit.position)}` }
    ],
    context: "combat-reposition",
    reposition: { unitId: unit.id, originPosition: origin },
    returnPhase: "combat"
  };
  state.phase = "choice";
  state.priorityPlayerId = unit.controllerId;

  appendEvent(state, {
    type: "PENDING_CHOICE_CREATED",
    choiceId,
    choiceType: "ABILITY_TARGET_CHOICE",
    playerId: unit.controllerId,
    sourceEffectIds: [],
    message: `${unit.cardName} may return to ${getBattlefieldLabel(origin)} after its attack.`
  });
}

/**
 * Resolves the Harpy "Strike and Return" choice: option 0 flies the unit back
 * to its origin, option 1 leaves it where it attacked. Either way the
 * activation then ends.
 */
function resolveCombatReposition(
  state: GameState,
  action: Extract<GameAction, { type: "CHOOSE_OPTION" }>
): void {
  const choice = state.pendingChoice;
  if (
    !choice ||
    choice.type !== "OPTION_CHOICE" ||
    choice.context !== "combat-reposition" ||
    choice.id !== action.choiceId ||
    choice.playerId !== action.playerId ||
    !choice.reposition
  ) {
    throw new Error("There is no repositioning choice to resolve.");
  }

  const combat = state.combat;
  const unit = combat?.units[choice.reposition.unitId];
  if (!combat || !unit) {
    throw new Error("Combat is not active.");
  }

  if (action.optionIndex === 0 && harpyReturnOrigin(combat, unit) === choice.reposition.originPosition) {
    moveUnitToOrigin(state, unit, choice.reposition.originPosition);
  }

  appendEvent(state, {
    type: "PENDING_CHOICE_RESOLVED",
    choiceId: choice.id,
    playerId: action.playerId,
    selectedIndex: action.optionIndex
  });

  state.pendingChoice = null;
  unit.activatedThisRound = true;
  advanceActiveUnit(state);
  if (!state.pendingChoice) {
    state.phase = "combat";
    state.priorityPlayerId = null;
  }
}

/**
 * Marksmen/Elves style abilities: after their first attack against a
 * non-adjacent target, attack the same target again — exactly once, so the
 * second attack never triggers a third.
 */
function maybeDeclareDoubleAttack(
  state: GameState,
  attacker: CombatUnitState,
  defender: CombatUnitState,
  attackKind: "melee" | "ranged",
  roll: number,
  cards: CardLibrary
): boolean {
  if (attackKind !== "ranged" || (attacker.attacksThisActivation ?? 0) !== 1) {
    return false;
  }

  const doubleAttack = getDoubleAttackAbility(attacker);
  if (!doubleAttack) {
    return false;
  }

  if (doubleAttack.maxRoll !== undefined && roll > doubleAttack.maxRoll) {
    return false;
  }

  if (!isUnitAlive(attacker) || !isUnitAlive(defender) || isAdjacent(attacker.position, defender.position)) {
    return false;
  }

  appendEvent(state, {
    type: "UNIT_ABILITY_TRIGGERED",
    unitId: attacker.id,
    abilityId: doubleAttack.abilityId,
    targetUnitId: defender.id,
    message: `${attacker.name} attack ${defender.name} a second time.`
  });

  declareAttack(
    state,
    {
      type: "ATTACK_UNIT",
      playerId: attacker.controllerId,
      attackerId: attacker.id,
      defenderId: defender.id
    },
    cards,
    false,
    true
  );
  return true;
}

function getAfterRetaliationAttack(
  attacker: CombatUnitState,
  defender: CombatUnitState
): { abilityId: string; abilityName: string; targetUnitId: UnitId } | undefined {
  if ((attacker.attacksThisActivation ?? 0) !== 1 || !isUnitAlive(attacker) || !isUnitAlive(defender)) {
    return undefined;
  }

  const ability = getAfterRetaliationAttackAbility(attacker);
  return ability ? { ...ability, targetUnitId: defender.id } : undefined;
}

/**
 * The Defend action's per-attack shield: a defending unit rolls one Attack die
 * each time it is struck and only gains +1 Defense on a "+1" face. The roll is
 * taken once and stashed on the stack item, so the lethal-save window resumes
 * on the same outcome and an attacker's reroll never re-rolls it. It is skipped
 * when the attack ignores Defense (Elemental damage), where the shield is moot.
 */
/**
 * Neutral Halberdiers' "Phalanx": a living friendly unit adjacent to the
 * defender lends it a virtual Defense token. The aura never benefits the
 * Halberdiers' enemies and never the defender from itself.
 */
function hasAdjacentDefenseAura(state: GameState, defender: CombatUnitState): boolean {
  const combat = state.combat;
  if (!combat) {
    return false;
  }
  return Object.values(combat.units).some(
    (unit) =>
      unit.id !== defender.id &&
      unit.controllerId === defender.controllerId &&
      isUnitAlive(unit) &&
      isAdjacent(unit.position, defender.position) &&
      hasDefenseTokenAura(unit)
  );
}

function resolveDefendBonus(
  state: GameState,
  stackItem: ResolutionStackItem,
  details: NonNullable<ReturnType<typeof getAttackStackDetails>>
): { roll: number; bonus: number } | null {
  // A real Defense token, a virtual one from an adjacent Halberdier's "Phalanx"
  // aura, or a Creature Bank card's "treated as if it had a Defense token while
  // Stacked" (Dwarven Treasury Dwarves, Dragon Utopia Crystal Dragons) lets the
  // defender roll the Defend die (a "+1" face → +1 Defense). The shield is moot
  // when the attack ignores Defense (Elemental).
  const hasShield =
    details.defender.defenseToken ||
    hasAdjacentDefenseAura(state, details.defender) ||
    hasSelfDefenseToken(details.defender);
  if (!hasShield || details.ignoreDefense) {
    return null;
  }
  const combat = state.combat;
  if (!combat) {
    return null;
  }
  if (stackItem.modifiers.defendRoll === undefined) {
    let defendRoll = rollAttackDie(combat);
    // Morale (defender's own cards, resolved at their Defense roll):
    // - "on a +1 on an Attack die, reroll the die" — the shield face is an
    //   Attack die the defender rolled, so a "+1" is forcibly rerolled;
    // - "-1 to your next Attack, Defense, or Combat Power roll" — the stored
    //   face carries the -1, so a rolled "+1" no longer pays the shield (and
    //   Merist's on-zero variant reads the same penalized value).
    if (
      defendRoll === 1 &&
      playerHoldsMoraleCard(state, details.defender.controllerId, MORALE_CARD_IDS.rerollPlusOne)
    ) {
      consumeHeldMoraleCard(state, details.defender.controllerId, MORALE_CARD_IDS.rerollPlusOne);
      defendRoll = rollAttackDie(combat);
    }
    if (consumeHeldMoraleCard(state, details.defender.controllerId, MORALE_CARD_IDS.nextRollMinusOne)) {
      defendRoll -= 1;
    }
    stackItem.modifiers.defendRoll = defendRoll;
  }
  const roll = stackItem.modifiers.defendRoll;
  // Merist's Stone Skin VI: while the defender's owner has the DEFENSE_TOKEN_ON_ZERO
  // aura, the shield pays out on a "0" as well as the usual "+1" Defense roll.
  const shieldOnZero = state.activeEffects.some(
    (effect) =>
      effect.scope === "player" &&
      effect.controllerId === details.defender.controllerId &&
      effect.modifiers.some((modifier) => modifier.type === "DEFENSE_TOKEN_ON_ZERO")
  );
  const grantsBonus = shieldOnZero ? roll >= 0 : roll === 1;
  // Mammoths' Thick Hide: a flat extra Defense the unit gets while it is
  // defending (holding a Defense token), on top of the Defend die.
  const defendAbilityBonus = getDefendBonus(details.defender);
  return { roll, bonus: (grantsBonus ? 1 : 0) + defendAbilityBonus };
}

/**
 * Vampires: "[unit_attack] …then remove up to N damage from this unit." The
 * self-heal lands after the unit's own attack — never a Retaliation Attack —
 * and is capped at the damage currently on the unit.
 */
function applyOnAttackSelfHeal(state: GameState, attacker: CombatUnitState, isRetaliation: boolean): void {
  if (isRetaliation) {
    return;
  }
  const heal = getOnAttackSelfHeal(attacker);
  // A dead attacker must NOT Life-Drain itself back to life. By this point the
  // defender's Fire Shield may already have burned the attacker down to 0
  // Health — markUnitRemovedIfNeeded has fired UNIT_REMOVED and armed the Pit
  // Lords' "a unit was removed" trigger — so healing here would leave it
  // standing while the event log says it died. Bail unless it survived.
  if (!heal || attacker.damage <= 0 || !isUnitAlive(attacker)) {
    return;
  }
  const healed = Math.min(heal.amount, attacker.damage);
  attacker.damage = Math.max(0, attacker.damage - heal.amount);
  appendEvent(state, {
    type: "UNIT_ABILITY_TRIGGERED",
    unitId: attacker.id,
    abilityId: heal.abilityId,
    message: `${attacker.cardName} drains life and heals ${healed} damage.`
  });
  appendEvent(state, {
    type: "DAMAGE_HEALED",
    source: { type: "unit", unitId: attacker.id, controllerId: attacker.controllerId },
    target: { type: "unit", unitId: attacker.id },
    amount: healed
  });
}

function finishResolvedAttack(
  state: GameState,
  stackItem: ResolutionStackItem,
  details: NonNullable<ReturnType<typeof getAttackStackDetails>>,
  candidate: AttackRollCandidate,
  cards: CardLibrary
): void {
  // A defending defender rolls its Defense die now (once, then reused), so the
  // lethal-save preview and the resolved hit agree on whether the shield held.
  const defend = resolveDefendBonus(state, stackItem, details);
  const defendBonus = defend?.bonus ?? 0;

  // Shield of the Dwarven Lords: the defender ignored the rolled die. The face
  // counts as 0 (so it adds nothing to the attack) and the lethal-save preview,
  // the resolved hit and the die-triggered abilities below all read it the same.
  const dieCancelled = Boolean(stackItem.modifiers.attackDieCancelled);
  const uncappedCandidate: AttackRollCandidate = dieCancelled
    ? { rolls: candidate.rolls, roll: 0 }
    : candidate;
  const minimumAttackDie = getMinimumAttackDie(details.attacker);
  const resolvedCandidate: AttackRollCandidate =
    minimumAttackDie !== null && uncappedCandidate.roll < minimumAttackDie
      ? {
          ...uncappedCandidate,
          rolls: uncappedCandidate.rolls.map((roll) => Math.max(minimumAttackDie, roll)),
          roll: minimumAttackDie
        }
      : uncappedCandidate;
  if (!dieCancelled && resolvedCandidate.roll !== candidate.roll) {
    appendEvent(state, {
      type: "UNIT_ABILITY_TRIGGERED",
      unitId: details.attacker.id,
      abilityId: "wog-no-negative-attack-roll",
      message: `${details.attacker.cardName} treats its ${candidate.roll} Attack die as ${resolvedCandidate.roll}.`
    });
  }

  // Alamar's Resurrection: before a killing normal attack lands, pause once and
  // ask the defender's controller whether to cancel it (only if they can). The
  // rolled die is stashed so the resumed attack uses the same outcome. A Clone is
  // destroyed by any damage by rule and cannot be rescued, so it is never offered
  // a lethal save (the post-damage hook then removes it for being attacked).
  if (
    !details.defender.cloneOfUnitId &&
    !stackItem.modifiers.lethalSaveOffered &&
    playerHasLethalSave(state, details.defender.id, cards)
  ) {
    const preview = getAttackDamagePreview(
      details.attacker,
      details.defender,
      resolvedCandidate.roll,
      details.attackBonus,
      details.defenseBonus,
      defendBonus,
      details.dieMultiplier,
      details.abilityAttack?.baseAttack,
      details.damageReduction,
      details.ignoreDefense,
      dieCancelled
    );
    if (preview.damage > 0 && details.defender.damage + preview.damage >= details.defender.maxHealth) {
      stackItem.modifiers.rolledCandidate = candidate;
      stackItem.modifiers.lethalSaveOffered = true;
      const lethalEvent = appendEvent(state, {
        type: "UNIT_LETHAL_HIT",
        attackerId: details.attacker.id,
        defenderId: details.defender.id
      });
      if (openReactionWindowForTrigger(state, stackItem, lethalEvent, cards)) {
        return;
      }
      stackItem.modifiers.rolledCandidate = undefined;
    }
  }

  if (details.defenseReductionAbility) {
    appendEvent(state, {
      type: "UNIT_ABILITY_TRIGGERED",
      unitId: details.attacker.id,
      abilityId: details.defenseReductionAbility.abilityId,
      targetUnitId: details.defender.id,
      message: `${details.attacker.name} lowers ${details.defender.name}'s defense by ${details.defenseReductionAbility.amount}.`
    });
  }

  const cancelLethal = stackItem.modifiers.cancelLethal;
  const lethalCancel =
    cancelLethal && cancelLethal.unitId === details.defender.id ? { grade: cancelLethal.grade } : undefined;

  // Bulwark "Runes" (Gamefound Update #3): a Bulwark unit's resolved Attack earns
  // its controller +1 Rune, a Retaliation Attack +1 (RUNE_GAIN_*). Credited HERE,
  // BEFORE the blow's damage is computed, so a strike that CROSSES a Rune
  // threshold already carries its new Level's army-wide +Attack on THIS very blow
  // — the user-reported fix ("rune has effect the moment it reaches the
  // threshold"). The crossing buff is a player-scoped ATTACK_BONUS active effect,
  // so we fold its delta into details.attackBonus by re-reading getActiveAttackBonus
  // around the credit (the delta is 0 for a non-crossing strike, +Attack for a
  // crossing one). A blow Alamar's Resurrection is about to lethally cancel still
  // grants NOTHING (the rulebook fizzle): we mirror the cancel test in
  // applyAttackDamageFromCandidate and skip the credit when it holds, so the
  // earned-by-acting loop and a cancelled strike stay exactly as before.
  const willBeLethallyCancelled =
    lethalCancel !== undefined &&
    (() => {
      const preview = getAttackDamagePreview(
        details.attacker,
        details.defender,
        resolvedCandidate.roll,
        details.attackBonus,
        details.defenseBonus,
        defendBonus,
        details.dieMultiplier,
        details.abilityAttack?.baseAttack,
        details.damageReduction,
        details.ignoreDefense,
        dieCancelled
      );
      return (
        preview.damage > 0 &&
        details.defender.damage + preview.damage >= details.defender.maxHealth &&
        gradeRankOfUnit(details.defender) <= gradeRank(lethalCancel.grade)
      );
    })();
  if (!willBeLethallyCancelled) {
    const runeContext = {
      attacker: details.attacker,
      defender: details.defender,
      attackKind: details.attackKind
    };
    const attackBonusBeforeRune = getActiveAttackBonus(state, runeContext);
    gainRunesForAttack(state, details.attacker, details.isRetaliation);
    details.attackBonus += getActiveAttackBonus(state, runeContext) - attackBonusBeforeRune;
  }

  const attackResult = applyAttackDamageFromCandidate(
    state,
    details.attacker,
    details.defender,
    details.isRetaliation,
    details.rollMode,
    details.attackBonus,
    details.defenseBonus,
    defendBonus,
    defend?.roll,
    resolvedCandidate,
    details.dieMultiplier,
    details.abilityAttack?.baseAttack,
    details.damageReduction,
    lethalCancel,
    details.ignoreDefense,
    details.ignoreAttackDie,
    dieCancelled
  );

  // Alamar's Resurrection cancelled the whole attack: the attacker still spent
  // its strike, but no damage, no on-attack abilities, and no Retaliation
  // Attack follow. Conclude the activation straight away.
  if (attackResult.cancelled) {
    if (details.isRetaliation) {
      details.attacker.retaliatedThisRound = true;
    } else {
      details.attacker.attackedThisActivation = true;
      details.attacker.attacksThisActivation = (details.attacker.attacksThisActivation ?? 0) + 1;
    }
    stackItem.status = "resolved";
    state.stack.pop();
    if (finishCombatIfNeeded(state)) {
      return;
    }
    if (details.isRetaliation && state.combat?.attackSequence?.attackerId === details.defender.id) {
      state.combat.attackSequence = null;
    }
    concludeAttackerActivation(state, details.isRetaliation ? details.defender : details.attacker);
    return;
  }

  applyOnAttackTokens(state, details.attacker, details.defender, details.isRetaliation);
  // Great Shamans' Freezing Shot: their attack also slows the target next round.
  applyOnAttackInitiativeDebuff(state, details.attacker, details.defender, details.isRetaliation);
  applyOnAttackPoisonCubes(state, details.attacker, details.defender, details.isRetaliation);
  // (Bulwark "Runes" are credited above, BEFORE the blow's damage, so a strike
  // that crosses a Rune threshold buffs THIS very hit — see gainRunesForAttack
  // before applyAttackDamageFromCandidate.)
  // Creature Bank Crypt/Shipwreck Wraiths: after their own attack, the enemy
  // discards a card. Medusa Stores Medusas (while Stacked): the target is
  // Paralyzed by their own attack.
  applyOnAttackEnemyDiscard(state, details.attacker, details.isRetaliation);
  applyOnAttackParalysis(state, details.attacker, details.defender, details.isRetaliation);
  applyDendroidBindFx(state, details.attacker, details.defender, details.isRetaliation);
  // Shield of the Dwarven Lords ignored the die "and any additional effects it
  // triggered": skip every die-face-conditioned follow-up — the Azure/Basilisk
  // paralysis and die tokens, the Minotaurs' draw, and the ranged low-roll bolt.
  // Tarnum (Fortress) Basilisks VI: the buffed (non-retaliation) attack fires
  // every die-gated after-attack ability regardless of the rolled face.
  const forceAbilityRoll = !details.isRetaliation && Boolean(stackItem.modifiers.forceAbilityRollsThisAttack);
  if (!dieCancelled) {
    applyOnAttackDieTokens(state, details.attacker, details.defender, attackResult.roll, details.isRetaliation, forceAbilityRoll);
    // Dungeon Minotaurs: draw a card when this unit's Attack die resolves "-1".
    applyOnAttackDieDraw(state, details.attacker, attackResult.roll, forceAbilityRoll);
    applyPostAttackAbilityDamage(
      state,
      details.attacker,
      details.defender,
      details.attackKind,
      attackResult.roll,
      attackResult.damage
    );
  }
  applyOnAttackFireWall(state, details.attacker, details.defender, details.isRetaliation);
  applyFireShieldDamage(state, details.attacker, details.defender, details.attackKind, details.isRetaliation);
  // Vampires: drain life back to themselves after their own attack.
  applyOnAttackSelfHeal(state, details.attacker, details.isRetaliation);
  // Rune Keeper commander: +1 Rune the first time it is attacked this combat.
  applyCommanderRuneRitual(state, details.defender, details.isRetaliation);

  if (details.isRetaliation) {
    details.attacker.retaliatedThisRound = true;
    // Medusas: paralysis inflicted by this unit's own Retaliation Attack.
    applyRetaliationParalysis(state, details.attacker, details.defender);
  } else {
    details.attacker.attackedThisActivation = true;
    details.attacker.attacksThisActivation = (details.attacker.attacksThisActivation ?? 0) + 1;
    // Ash's Bloodlust "places a Black cube" on the buffed attacker: it spends its
    // Retaliation for the round (it can no longer perform a Retaliation Attack).
    if (stackItem.modifiers.setRetaliatedOnAttacker) {
      details.attacker.retaliatedThisRound = true;
    }
  }

  stackItem.status = "resolved";
  state.stack.pop();

  if (finishCombatIfNeeded(state)) {
    return;
  }

  if (details.isRetaliation) {
    // Factory Bounty Hunters' Preemptive Shot: this counter fired BEFORE the
    // original attack, which is still parked on the stack beneath it. Resume that
    // attack now — unless the counter felled the attacker, in which case its blow
    // is cancelled. The defender's retaliation is already spent
    // (retaliatedThisRound was set above), so it will not retaliate a second time.
    if (stackItem.modifiers.isPreemptiveRetaliation) {
      const parked = state.stack.at(-1);
      const parkedAttackerId =
        parked && (parked.action.type === "ATTACK_UNIT" || parked.action.type === "MOVE_AND_ATTACK_UNIT")
          ? parked.action.attackerId
          : undefined;
      const parkedAttacker = parkedAttackerId ? state.combat?.units[parkedAttackerId] : undefined;
      if (parked && parkedAttacker && isUnitAlive(parkedAttacker)) {
        // Attacker survived the pre-emptive strike: land its parked blow now.
        resolveTopStack(state, cards);
        return;
      }
      // Pre-emptive strike cancelled the attack (attacker removed): drop it.
      if (parked) {
        parked.status = "resolved";
        state.stack.pop();
      }
      if (state.combat && state.combat.attackSequence?.attackerId === parkedAttackerId) {
        state.combat.attackSequence = null;
      }
      if (parkedAttacker) {
        concludeAttackerActivation(state, parkedAttacker);
      } else {
        state.phase = "combat";
        state.priorityPlayerId = null;
      }
      return;
    }

    // The retaliation has resolved; hand the activation back to the original
    // attacker, who may still owe a post-attack step (ranged units).
    if (declareAfterRetaliationAbilityAttack(state, cards)) {
      return;
    }
    if (state.combat?.attackSequence?.attackerId === details.defender.id) {
      state.combat.attackSequence = null;
    }
    const originalAttacker = details.defender;
    concludeAttackerActivation(state, originalAttacker);
    return;
  }

  if (details.abilityAttack) {
    // Printed follow-up attacks never chain further follow-ups or their own
    // retaliations (wiki FAQ). BINH Cerberi may still owe more queued
    // follow-up attacks; otherwise pick the parked sequence back up — the
    // original target's retaliation fires only now.
    if (declareNextQueuedAbilityAttack(state, cards)) {
      return;
    }
    if (!state.combat?.attackSequence) {
      concludeAttackerActivation(state, details.attacker);
      return;
    }
    resumeAttackSequence(state, cards);
    return;
  }

  const combat = state.combat;
  if (combat) {
    combat.attackSequence = {
      attackerId: details.attacker.id,
      defenderId: details.defender.id,
      attackKind: details.attackKind,
      retaliationPending: shouldRetaliate(
        details.attacker,
        details.defender,
        details.attackKind,
        stackItem.modifiers.ignoresRetaliationThisAttack,
        state
      ),
      afterRetaliationAbilityAttack: getAfterRetaliationAttack(details.attacker, details.defender),
      // A Magic-Mirror-bounced Curse/Weakness on this attack carries to the
      // retaliation so it strikes the new target there too, then is gone.
      ...(stackItem.modifiers.redirectedInstants
        ? { redirectedInstants: stackItem.modifiers.redirectedInstants }
        : {})
    };
  }

  // Printed flat-damage follow-ups (Magog splash, Cerberi second head)
  // resolve before retaliation; a target choice pauses the sequence here.
  if (openFlatDamageFollowUps(state, details.attacker, details.defender, details.attackKind)) {
    return;
  }

  if (applyAttackDieDamageFollowUps(state, details.attacker, details.defender, forceAbilityRoll)) {
    return;
  }

  // Gorgons' Death Stare: roll the extra dice and possibly reduce the target to
  // 0 Health before retaliation.
  if (applyDeathStareFollowUps(state, details.attacker, details.defender, forceAbilityRoll)) {
    return;
  }

  // Azure Dragons / Basilisks: paralyse the target on a matching Attack die.
  applyParalysisFollowUps(state, details.attacker, details.defender, attackResult.roll, forceAbilityRoll);

  // Dragon Flies: dispel the enemy's ongoing buffs on the target.
  applyDispelFollowUps(state, details.attacker, details.defender);

  if (maybeDeclareDoubleAttack(state, details.attacker, details.defender, details.attackKind, attackResult.roll, cards)) {
    return;
  }

  // Liches' Death Cloud: a full second attack against a unit adjacent to the
  // original target, resolved before the original target's retaliation.
  if (openSecondAttackFollowUp(state, details.attacker, details.defender, cards)) {
    return;
  }

  // Gold Dragons' line attack: a separate attack on the unit directly behind
  // the target, resolved before the original target's retaliation.
  if (openGoldDragonLineAttack(state, details.attacker, details.defender, cards)) {
    return;
  }

  // Hydras: one more separate attack against an enemy adjacent to the Hydra.
  if (openHydraSecondAttack(state, details.attacker, details.defender, cards)) {
    return;
  }

  // Cerberi attack-all mechanism (kept for the engine's multi-attack queue;
  // no boxed unit uses it now that Cerberi follow the printed card).
  if (queueAttackAllFollowUps(state, details.attacker, details.defender, cards)) {
    return;
  }

  // Neutral Magi Power Drain: the defending player picks a Power card to
  // discard or takes a random discard. Pauses the parked retaliation when a
  // real choice exists.
  if (openMagiDiscardChoice(state, details.attacker, details.defender, cards)) {
    return;
  }

  // Tower Genies (Pack): after their attack, dig Spells out of the controller's
  // deck. Pauses the parked retaliation when several Spells offer a choice.
  if (openGenieSpellDraw(state, details.attacker, details.isRetaliation)) {
    return;
  }

  // Ghost Dragons (neutral): roll for the knock-back last — moving the target
  // out of reach is what denies its Retaliation Attack, so it must resolve
  // before the parked retaliation. Pauses when the defender has a real choice
  // of empty spaces.
  if (openGhostDragonKnockback(state, details.attacker, details.defender)) {
    return;
  }

  resumeAttackSequence(state, cards);
}

/**
 * Token-on-attack abilities (Pack Sorceresses' Weakness, Pack Behemoths'
 * Corrosion): after this unit's own attack — never a retaliation — the
 * original target gains the printed token, even if the attack dealt 0 damage.
 */
function applyOnAttackInitiativeDebuff(
  state: GameState,
  attacker: CombatUnitState,
  defender: CombatUnitState,
  isRetaliation: boolean
): void {
  if (isRetaliation || !state.combat || !isUnitAlive(defender)) {
    return;
  }
  for (const ability of getUnitAbilityDefinitions(attacker)) {
    if (ability.implementationStatus !== "implemented" || ability.effect?.type !== "ON_ATTACK_INITIATIVE_DEBUFF") {
      continue;
    }
    createActiveEffect(
      state,
      {
        name: ability.name,
        scope: "unit",
        modifiers: [{ type: "INITIATIVE_BONUS", amount: ability.effect.amount }],
        duration: { type: "next-combat-round" },
        polarity: "negative",
        removable: true
      },
      { type: "unit", unitId: attacker.id, controllerId: attacker.controllerId },
      attacker.controllerId,
      { type: "unit", unitId: defender.id }
    );
    appendEvent(state, {
      type: "UNIT_ABILITY_TRIGGERED",
      unitId: attacker.id,
      abilityId: ability.id,
      targetUnitId: defender.id,
      message: `${attacker.cardName}'s ${ability.name} slows ${defender.cardName}.`
    });
  }
}

function applyOnAttackTokens(
  state: GameState,
  attacker: CombatUnitState,
  defender: CombatUnitState,
  isRetaliation: boolean
): void {
  if (isRetaliation || !state.combat || !isUnitAlive(defender)) {
    return;
  }

  for (const ability of getUnitAbilityDefinitions(attacker)) {
    if (ability.implementationStatus !== "implemented" || ability.effect?.type !== "ON_ATTACK_TOKEN") {
      continue;
    }

    placeCombatToken(state, defender, ability.effect.token, ability.effect.amount, ability.name, ability.effect.rounds);
    appendEvent(state, {
      type: "UNIT_ABILITY_TRIGGERED",
      unitId: attacker.id,
      abilityId: ability.id,
      targetUnitId: defender.id,
      message: `${attacker.cardName} marks ${defender.cardName} with a ${ability.name}.`
    });
  }
}

/**
 * Fortress Wyverns' poison: after the Wyvern's own attack (never a retaliation)
 * the still-living target gains the printed faction cubes. They ride the target
 * and bleed it 1 each time it activates (see `applyPoisonCubesAtActivation`).
 * Cubes from repeated Wyvern hits accumulate.
 */
function applyOnAttackPoisonCubes(
  state: GameState,
  attacker: CombatUnitState,
  defender: CombatUnitState,
  isRetaliation: boolean
): void {
  if (isRetaliation || !state.combat || !isUnitAlive(defender)) {
    return;
  }

  const poison = getOnAttackPoisonCubes(attacker);
  if (!poison) {
    return;
  }

  defender.poisonCubes = (defender.poisonCubes ?? 0) + poison.count;
  appendEvent(state, {
    type: "UNIT_ABILITY_TRIGGERED",
    unitId: attacker.id,
    abilityId: poison.abilityId,
    targetUnitId: defender.id,
    message: `${attacker.cardName} plants ${poison.count} poison cube${poison.count === 1 ? "" : "s"} on ${defender.cardName}.`
  });
}

/**
 * Creature Bank Crypt / Shipwreck Wraiths: "Whenever this unit attacks, the
 * enemy must discard N cards from hand (if possible)." Fires after the Wraiths'
 * own attack (never a Retaliation Attack); discards as many of the opposing
 * player's cards as `count` and the hand allow.
 */
function applyOnAttackEnemyDiscard(state: GameState, attacker: CombatUnitState, isRetaliation: boolean): void {
  const combat = state.combat;
  if (isRetaliation || !combat) {
    return;
  }
  const discard = getOnAttackEnemyDiscard(attacker);
  if (!discard) {
    return;
  }
  const enemyId =
    attacker.controllerId === combat.attackerPlayerId ? combat.defenderPlayerId : combat.attackerPlayerId;

  let discarded = 0;
  for (let index = 0; index < discard.count; index += 1) {
    if (!discardRandomCardFromHand(state, enemyId)) {
      break;
    }
    discarded += 1;
  }
  if (discarded === 0) {
    return;
  }
  appendEvent(state, {
    type: "UNIT_ABILITY_TRIGGERED",
    unitId: attacker.id,
    abilityId: discard.abilityId,
    message: `${attacker.cardName} forces the enemy to discard ${discarded} card${discarded === 1 ? "" : "s"}.`
  });
}

/**
 * Creature Bank Medusa Stores Medusas (while Stacked): the Petrifying Gaze only
 * turns a foe to stone at melee range — "paralyze ONLY when attacking adjacent".
 * Fires after the Medusas' own attack (never a Retaliation Attack) on a target
 * that is adjacent, still alive and not immune to Paralysis. A ranged shot at a
 * distant target deals its damage but does NOT paralyze. The Stacked gate lives
 * in the ability chokepoint, so this only triggers while the card keeps its
 * Stack Token; the adjacency gate here keeps a distance shot from petrifying.
 */
function applyOnAttackParalysis(
  state: GameState,
  attacker: CombatUnitState,
  defender: CombatUnitState,
  isRetaliation: boolean
): void {
  if (isRetaliation || !state.combat || !isUnitAlive(defender)) {
    return;
  }
  const ability = getOnAttackParalysis(attacker);
  if (!ability) {
    return;
  }
  // "Only paralyze when attacking adjacent": a ranged Medusa shooting a foe it
  // is not next to inflicts no Paralysis (getAttackKind treats a ranged unit
  // attacking a non-adjacent target as a "ranged" shot — every other attack is
  // adjacent/melee).
  if (!isAdjacent(attacker.position, defender.position)) {
    return;
  }
  if (unitImmuneToParalysis(state, defender)) {
    appendEvent(state, {
      type: "UNIT_ABILITY_TRIGGERED",
      unitId: defender.id,
      abilityId: "ignore-paralysis",
      targetUnitId: defender.id,
      message: `${defender.cardName} is immune to Paralysis.`
    });
    return;
  }
  placeCombatToken(state, defender, "paralysis", 0, ability.abilityName);
  appendEvent(state, {
    type: "UNIT_ABILITY_TRIGGERED",
    unitId: attacker.id,
    abilityId: ability.abilityId,
    targetUnitId: defender.id,
    message: `${attacker.cardName} paralyses ${defender.cardName} with ${ability.abilityName}.`
  });
}

/**
 * Fortress Wyverns' poison tick: at the beginning of the poisoned unit's
 * activation one cube is removed and the unit takes 1 damage. Returns true when
 * the tick removed the unit (so the caller ends its activation). No-op when the
 * unit carries no cubes.
 */
function applyPoisonCubesAtActivation(state: GameState, unit: CombatUnitState): boolean {
  const cubes = unit.poisonCubes ?? 0;
  if (cubes <= 0 || !isUnitAlive(unit)) {
    return false;
  }
  // An invulnerable unit "ignores all damage": the poison tick is skipped and
  // the cube is kept for a later activation.
  if (isUnitDamageImmune(unit)) {
    return false;
  }

  unit.poisonCubes = cubes - 1;
  const assigned = Math.min(1, Math.max(0, unit.maxHealth - unit.damage));
  unit.damage += 1;
  noteUnitDamagedForTokens(state, unit, 1);
  appendEvent(state, {
    type: "UNIT_ABILITY_TRIGGERED",
    unitId: unit.id,
    abilityId: "wyvern-poison-cube",
    targetUnitId: unit.id,
    message: `Poison bleeds ${unit.cardName} for 1 damage (${unit.poisonCubes} cube${unit.poisonCubes === 1 ? "" : "s"} left).`
  });
  if (assigned > 0) {
    appendEvent(state, {
      type: "DAMAGE_ASSIGNED",
      source: { type: "system" },
      target: { type: "unit", unitId: unit.id },
      amount: assigned,
      damageKind: "effect"
    });
  }
  markUnitRemovedIfNeeded(state, unit);
  return !isUnitAlive(unit);
}

/**
 * Rampart Dendroids' Bind: the root mechanic is a passive aura enforced in
 * movement legality, but its visual/sound plays as the Dendroid attacks — roots
 * lash out at the struck target. Cosmetic only: emits the ability event the FX
 * layer keys off (never on a retaliation).
 */
function applyDendroidBindFx(
  state: GameState,
  attacker: CombatUnitState,
  defender: CombatUnitState,
  isRetaliation: boolean
): void {
  if (isRetaliation || !state.combat || !hasBindAdjacentEnemies(attacker) || !isUnitAlive(defender)) {
    return;
  }
  appendEvent(state, {
    type: "UNIT_ABILITY_TRIGGERED",
    unitId: attacker.id,
    abilityId: "dendroid-bind",
    targetUnitId: defender.id,
    message: `${attacker.cardName}'s roots ensnare ${defender.cardName}.`
  });
}

/**
 * Fire Shield: when an adjacent (melee) attack resolves against a shielded
 * unit, the attacker takes the shield's damage before anything else follows.
 *
 * The burn (and the "fire-shield" ability event that animates it) fires ONLY
 * when the shielded unit is genuinely ATTACKED — never as a byproduct of its own
 * Retaliation Attack. So an enemy that strikes a Lava Sharpshooter / Hell Steed
 * burns; but if the shielded unit attacks first and the enemy strikes back, the
 * enemy's retaliation does NOT trip the shield. (`isRetaliation` is the CURRENT
 * blow: true means the shielded `defender` is only being retaliated against.)
 */
function applyFireShieldDamage(
  state: GameState,
  attacker: CombatUnitState,
  defender: CombatUnitState,
  attackKind: "melee" | "ranged",
  isRetaliation: boolean
): void {
  if (isRetaliation || attackKind !== "melee" || !state.combat || !isUnitAlive(attacker)) {
    return;
  }
  // An invulnerable Factory Couatl that strikes a Fire-Shielded unit takes no
  // recoil — it "ignores all damage".
  if (isUnitDamageImmune(attacker)) {
    return;
  }

  let total = 0;
  for (const ability of getUnitAbilityDefinitions(defender)) {
    if (ability.effect?.type === "FIRE_SHIELD_DAMAGE") {
      total += ability.effect.amount;
    }
  }
  for (const effect of state.activeEffects) {
    if (effect.target?.type !== "unit" || effect.target.unitId !== defender.id) {
      continue;
    }
    for (const modifier of effect.modifiers) {
      if (modifier.type === "FIRE_SHIELD") {
        total += modifier.amount;
      }
    }
  }

  if (total <= 0) {
    return;
  }

  // Announce the burn first so the table flares the Fire Shield over the
  // attacker (its fire-shield-hit cue) before the damage number floats — the
  // same trigger-then-damage shape the Wyverns' sting / Thunderbirds' bolt use.
  // `unitId` is the shielded unit whose effect fires; `targetUnitId` is the
  // attacker that takes (and anchors the sprite of) the burn.
  appendEvent(state, {
    type: "UNIT_ABILITY_TRIGGERED",
    unitId: defender.id,
    abilityId: "fire-shield",
    targetUnitId: attacker.id,
    message: `${defender.cardName}'s Fire Shield burns ${attacker.cardName} for ${total}.`
  });

  attacker.damage += total;
  noteUnitDamagedForTokens(state, attacker, total);
  appendEvent(state, {
    type: "DAMAGE_ASSIGNED",
    source: { type: "unit", unitId: defender.id, controllerId: defender.controllerId },
    target: { type: "unit", unitId: attacker.id },
    amount: total,
    damageKind: "effect"
  });
  markUnitRemovedIfNeeded(state, attacker);
}

/** WOG Hell Steed: its own attack leaves a 1-damage Fire Wall on the target space. */
function applyOnAttackFireWall(
  state: GameState,
  attacker: CombatUnitState,
  defender: CombatUnitState,
  isRetaliation: boolean
): void {
  const damage = getOnAttackFireWallDamage(attacker);
  const combat = state.combat;
  if (isRetaliation || !combat || damage <= 0) {
    return;
  }
  const duplicate = (combat.battlefieldTokens ?? []).some(
    (token) =>
      token.kind === "fire_wall" &&
      token.position === defender.position &&
      token.controllerId === attacker.controllerId
  );
  if (duplicate) {
    return;
  }
  addBattlefieldToken(state, {
    kind: "fire_wall",
    position: defender.position,
    controllerId: attacker.controllerId,
    damage
  });
  appendEvent(state, {
    type: "UNIT_ABILITY_TRIGGERED",
    unitId: attacker.id,
    abilityId: "wog-hell-steed-fire-wall",
    targetUnitId: defender.id,
    message: `${attacker.cardName} leaves a Fire Wall at ${getBattlefieldLabel(defender.position)}.`
  });
}

/**
 * Thunderbirds' lightning / Wyverns' sting: roll one extra Attack die after the
 * attack and before the parked retaliation, dealing flat damage when the face
 * falls in the ability's window (Thunderbirds 0/+1, Wyverns exactly 0). The
 * roll is deterministic through the same combat dice stream as normal attacks.
 */
function applyAttackDieDamageFollowUps(
  state: GameState,
  attacker: CombatUnitState,
  defender: CombatUnitState,
  forceRoll = false
): boolean {
  const combat = state.combat;
  if (!combat || !isUnitAlive(attacker) || !isUnitAlive(defender)) {
    return false;
  }

  const followUps = getAttackDieDamageFollowUps(attacker);
  for (const followUp of followUps) {
    if (!isUnitAlive(defender)) {
      break;
    }

    const candidate = rollAttackCandidate(combat, "normal");
    appendEvent(state, {
      type: "UNIT_ABILITY_TRIGGERED",
      unitId: attacker.id,
      abilityId: followUp.abilityId,
      targetUnitId: defender.id,
      message: forceRoll
        ? `${attacker.name} uses ${followUp.abilityName} regardless of the roll (Basilisks VI).`
        : `${attacker.name} rolls ${candidate.roll} for ${followUp.abilityName}.`
    });

    // Tarnum (Fortress) Basilisks VI forces the ability regardless of the face.
    if (!forceRoll && (candidate.roll < followUp.minRoll || (followUp.maxRoll !== undefined && candidate.roll > followUp.maxRoll))) {
      continue;
    }

    const assignedDamage = Math.min(followUp.amount, Math.max(0, defender.maxHealth - defender.damage));
    defender.damage += followUp.amount;
    noteUnitDamagedForTokens(state, defender, followUp.amount);
    if (assignedDamage > 0) {
      appendEvent(state, {
        type: "DAMAGE_ASSIGNED",
        source: { type: "unit", unitId: attacker.id, controllerId: attacker.controllerId },
        target: { type: "unit", unitId: defender.id },
        amount: assignedDamage,
        damageKind: "effect"
      });
    }
    markUnitRemovedIfNeeded(state, defender);
  }

  return finishCombatIfNeeded(state);
}

/**
 * Rust Dragons' Acid Breath: when the unit's own attack resolves on its
 * `onRoll` face, place the printed token on the still-living target (a
 * Corrosion token shaves Defense for the rest of combat). Never on a
 * retaliation or a printed follow-up attack.
 */
function applyOnAttackDieTokens(
  state: GameState,
  attacker: CombatUnitState,
  defender: CombatUnitState,
  attackRoll: number,
  isRetaliation: boolean,
  forceRoll = false
): void {
  if (isRetaliation || !state.combat || !isUnitAlive(defender)) {
    return;
  }
  for (const token of getOnAttackDieTokens(attacker)) {
    // Tarnum (Fortress) Basilisks VI forces the token regardless of the face.
    if (!forceRoll && attackRoll !== token.onRoll) {
      continue;
    }
    placeCombatToken(state, defender, token.token, token.amount, token.abilityName);
    appendEvent(state, {
      type: "UNIT_ABILITY_TRIGGERED",
      unitId: attacker.id,
      abilityId: token.abilityId,
      targetUnitId: defender.id,
      message: `${attacker.cardName} corrodes ${defender.cardName} with ${token.abilityName}.`
    });
  }
}

/**
 * Dungeon Minotaurs: "If you resolve a '-1' on the Attack die, draw a card."
 * Fires after this unit's attack (or Retaliation Attack) resolves on the
 * matching face; the controller draws the printed number of cards. (The neutral
 * Minotaur rerolls the "-1" instead — it never carries this ability.)
 */
function applyOnAttackDieDraw(
  state: GameState,
  attacker: CombatUnitState,
  attackRoll: number,
  forceRoll = false
): void {
  for (const draw of getOnAttackDieDraw(attacker)) {
    // Tarnum (Fortress) Basilisks VI forces the draw regardless of the face.
    if (!forceRoll && attackRoll !== draw.onRoll) {
      continue;
    }
    drawCardsForPlayer(state, attacker.controllerId, draw.amount);
    appendEvent(state, {
      type: "UNIT_ABILITY_TRIGGERED",
      unitId: attacker.id,
      abilityId: draw.abilityId,
      message: `${attacker.name} draws ${draw.amount} card${draw.amount === 1 ? "" : "s"} (${draw.abilityName}).`
    });
  }
}

/**
 * Gorgons' Death Stare: after the attack, roll `diceCount` Attack dice; when
 * every one shows `onRoll`, the still-living target's current side is reduced
 * to 0 Health (a Pack flips to its Few side as usual). Returns true when the
 * combat ended as a result.
 */
function applyDeathStareFollowUps(
  state: GameState,
  attacker: CombatUnitState,
  defender: CombatUnitState,
  forceRoll = false
): boolean {
  const combat = state.combat;
  if (!combat || !isUnitAlive(attacker) || !isUnitAlive(defender)) {
    return false;
  }

  for (const followUp of getDeathStareFollowUps(attacker)) {
    if (!isUnitAlive(defender)) {
      break;
    }
    const rolls = Array.from({ length: Math.max(1, followUp.diceCount) }, () => rollAttackDie(combat));
    // Tarnum (Fortress) Basilisks VI forces the Death Stare regardless of the dice.
    const petrifies = forceRoll || rolls.every((roll) => roll === followUp.onRoll);
    // One ability event per stare; its message carries the outcome so the log
    // reads correctly and tests can assert it. The FX/sound must play only when
    // the stare actually PROCS, so only the landed petrification carries the
    // mapped ability id (which abilityFxPlans keys the death-stare cue off). A
    // failed roll fires an ANNOUNCE-only id (`…-roll`, deliberately unmapped) so
    // the die read-out still logs without flashing the death stare — the same
    // announce-vs-proc split the extra-die paralysis variants use.
    appendEvent(state, {
      type: "UNIT_ABILITY_TRIGGERED",
      unitId: attacker.id,
      abilityId: petrifies ? followUp.abilityId : `${followUp.abilityId}-roll`,
      targetUnitId: defender.id,
      message: petrifies
        ? `${attacker.name}'s ${followUp.abilityName} (rolled ${rolls.join(", ")}) reduces ${defender.cardName} to 0 Health.`
        : `${attacker.name} rolls ${rolls.join(", ")} for ${followUp.abilityName}.`
    });
    if (!petrifies) {
      continue;
    }
    const lethal = Math.max(0, defender.maxHealth - defender.damage);
    defender.damage = defender.maxHealth;
    noteUnitDamagedForTokens(state, defender, lethal);
    if (lethal > 0) {
      appendEvent(state, {
        type: "DAMAGE_ASSIGNED",
        source: { type: "unit", unitId: attacker.id, controllerId: attacker.controllerId },
        target: { type: "unit", unitId: defender.id },
        amount: lethal,
        damageKind: "effect"
      });
    }
    markUnitRemovedIfNeeded(state, defender);
  }

  return finishCombatIfNeeded(state);
}

function declareAfterRetaliationAbilityAttack(state: GameState, cards: CardLibrary): boolean {
  const combat = state.combat;
  const sequence = combat?.attackSequence;
  const followUp = sequence?.afterRetaliationAbilityAttack;
  if (!combat || !sequence || !followUp) {
    return false;
  }

  const attacker = combat.units[sequence.attackerId];
  const target = combat.units[followUp.targetUnitId];
  combat.attackSequence = null;
  if (!attacker || !target || !isUnitAlive(attacker) || !isUnitAlive(target)) {
    return false;
  }

  declareAbilityAttack(
    state,
    attacker,
    target.id,
    { abilityId: followUp.abilityId, abilityName: followUp.abilityName, baseAttack: attacker.attack },
    cards
  );
  return true;
}

/**
 * BINH Cerberi "Three-Headed Assault": collect every other living enemy unit
 * adjacent to the attacker and queue one full follow-up attack per target.
 * Returns true when a follow-up attack was declared.
 */
function queueAttackAllFollowUps(
  state: GameState,
  attacker: CombatUnitState,
  defender: CombatUnitState,
  cards: CardLibrary
): boolean {
  const combat = state.combat;
  if (!combat || !isUnitAlive(attacker) || (attacker.attacksThisActivation ?? 0) !== 1) {
    return false;
  }

  const ability = getUnitAbilityDefinitions(attacker).find(
    (candidate) =>
      candidate.implementationStatus === "implemented" &&
      candidate.effect?.type === "SECOND_ATTACK_ALL_ADJACENT_TO_SELF"
  );
  if (!ability || ability.effect?.type !== "SECOND_ATTACK_ALL_ADJACENT_TO_SELF") {
    return false;
  }

  // Magic Elementals Few ("Attack all adjacent units") also strike friendly
  // units; the Pack ("Attack all adjacent enemy units") and BINH Cerberi hit
  // enemies only. A fixed baseAttack (Cerberi = 3) overrides; otherwise each
  // follow-up uses the attacker's own (buffable) attack value.
  const includeAllies = ability.effect.includeAllies === true;
  const baseAttack = ability.effect.baseAttack ?? attacker.attack;

  const targets = Object.values(combat.units).filter(
    (unit) =>
      unit.id !== defender.id &&
      unit.id !== attacker.id &&
      (includeAllies || unit.controllerId !== attacker.controllerId) &&
      isUnitAlive(unit) &&
      isAdjacent(unit.position, attacker.position)
  );
  if (targets.length === 0) {
    return false;
  }

  if (combat.attackSequence) {
    combat.attackSequence.queuedAbilityAttacks = targets.map((unit) => ({
      abilityId: ability.id,
      abilityName: ability.name,
      baseAttack,
      targetUnitId: unit.id
    }));
  }

  return declareNextQueuedAbilityAttack(state, cards);
}

/** Pops and declares the next queued BINH Cerberi follow-up attack. */
function declareNextQueuedAbilityAttack(state: GameState, cards: CardLibrary): boolean {
  const combat = state.combat;
  const sequence = combat?.attackSequence;
  if (!combat || !sequence?.queuedAbilityAttacks?.length) {
    return false;
  }

  const attacker = combat.units[sequence.attackerId];
  if (!attacker || !isUnitAlive(attacker)) {
    sequence.queuedAbilityAttacks = [];
    return false;
  }

  while (sequence.queuedAbilityAttacks.length > 0) {
    const next = sequence.queuedAbilityAttacks.shift();
    const target = next ? combat.units[next.targetUnitId] : undefined;
    if (!next || !target || !isUnitAlive(target)) {
      continue;
    }

    declareAbilityAttack(
      state,
      attacker,
      next.targetUnitId,
      { abilityId: next.abilityId, abilityName: next.abilityName, baseAttack: next.baseAttack },
      cards
    );
    return true;
  }

  return false;
}

/**
 * Continues an attack after its printed follow-ups finished: fires the parked
 * retaliation when it is still legal, otherwise concludes the activation.
 */
function resumeAttackSequence(state: GameState, cards: CardLibrary): void {
  const combat = state.combat;
  if (!combat) {
    return;
  }

  const sequence = combat.attackSequence;
  if (!sequence) {
    state.phase = "combat";
    state.priorityPlayerId = null;
    return;
  }

  const attacker = combat.units[sequence.attackerId];
  const defender = combat.units[sequence.defenderId];

  if (
    sequence.retaliationPending &&
    attacker &&
    defender &&
    shouldRetaliate(attacker, defender, sequence.attackKind, false, state)
  ) {
    sequence.retaliationPending = false;
    openRetaliationWindow(state, attacker, defender, cards);
    return;
  }

  if (sequence.afterRetaliationAbilityAttack && declareAfterRetaliationAbilityAttack(state, cards)) {
    return;
  }

  combat.attackSequence = null;
  if (attacker) {
    concludeAttackerActivation(state, attacker);
  } else {
    state.phase = "combat";
    state.priorityPlayerId = null;
  }
}

/**
 * Applies the mandatory flat-damage follow-ups of an attack (Magog splash,
 * Cerberi second head). A single candidate is hit immediately; several open
 * an ABILITY_TARGET_CHOICE for the attacker. Returns true when the attack
 * sequence is paused on a choice.
 */
function openFlatDamageFollowUps(
  state: GameState,
  attacker: CombatUnitState,
  defender: CombatUnitState,
  attackKind: "melee" | "ranged"
): boolean {
  const combat = state.combat;
  if (!combat) {
    return false;
  }

  const followUps = getFlatDamageFollowUps(combat, { attacker, defender, attackKind });
  for (const followUp of followUps) {
    const living = followUp.candidateUnitIds.filter((unitId) => {
      const unit = combat.units[unitId];
      return unit && isUnitAlive(unit);
    });
    if (living.length === 0) {
      continue;
    }

    if (living.length === 1) {
      applyFlatAbilityDamage(state, attacker, living[0], followUp.abilityId, followUp.abilityName, followUp.amount);
      if (finishCombatIfNeeded(state)) {
        return true;
      }
      continue;
    }

    const choiceId = `choice_${nextEventNumber(state)}`;
    state.pendingChoice = {
      id: choiceId,
      type: "ABILITY_TARGET_CHOICE",
      playerId: attacker.controllerId,
      kind: "flat-damage",
      abilityId: followUp.abilityId,
      abilityName: followUp.abilityName,
      prompt: `${attacker.name}: ${followUp.abilityName} deals ${followUp.amount} damage — choose the unit it hits.`,
      sourceUnitId: attacker.id,
      anchorUnitId: defender.id,
      candidateUnitIds: living,
      amount: followUp.amount
    };
    state.phase = "choice";
    state.priorityPlayerId = attacker.controllerId;

    appendEvent(state, {
      type: "PENDING_CHOICE_CREATED",
      choiceId,
      choiceType: "ABILITY_TARGET_CHOICE",
      playerId: attacker.controllerId,
      sourceEffectIds: [],
      message: `${attacker.name} chooses the target of ${followUp.abilityName}.`
    });
    return true;
  }

  return false;
}

function applyFlatAbilityDamage(
  state: GameState,
  source: CombatUnitState,
  targetUnitId: UnitId,
  abilityId: string,
  abilityName: string,
  amount: number
): void {
  const combat = state.combat;
  const target = combat?.units[targetUnitId];
  if (!combat || !target || !isUnitAlive(target)) {
    return;
  }

  // Factory Couatls' invulnerability "ignores all damage": flat ability damage
  // (Magog/Cerberi splash, the Dreadnought's allocation) never touches it.
  if (isUnitDamageImmune(target)) {
    return;
  }

  appendEvent(state, {
    type: "UNIT_ABILITY_TRIGGERED",
    unitId: source.id,
    abilityId,
    targetUnitId,
    message: `${source.name} hits ${target.cardName} with ${abilityName} for ${amount} damage.`
  });

  target.damage += amount;
  noteUnitDamagedForTokens(state, target, amount);
  appendEvent(state, {
    type: "DAMAGE_ASSIGNED",
    source: { type: "unit", unitId: source.id, controllerId: source.controllerId },
    target: { type: "unit", unitId: target.id },
    amount,
    damageKind: "effect"
  });
  markUnitRemovedIfNeeded(state, target);
}

/**
 * Factory Dreadnoughts' splash allocation: open (or re-open) the per-pick target
 * choice. The leftmost remaining value is dealt to the next chosen adjacent unit
 * (chooseAbilityTarget → "dreadnought-splash"), then this re-opens with the tail
 * of the values until they (or the adjacent candidates) run out.
 */
function openDreadnoughtSplashChoice(
  state: GameState,
  source: CombatUnitState,
  abilityId: string,
  abilityName: string,
  candidateUnitIds: UnitId[],
  remainingValues: number[]
): void {
  const choiceId = `choice_${nextEventNumber(state)}`;
  const nextValue = remainingValues[0] ?? 0;
  state.pendingChoice = {
    id: choiceId,
    type: "ABILITY_TARGET_CHOICE",
    playerId: source.controllerId,
    kind: "dreadnought-splash",
    abilityId,
    abilityName,
    prompt: `${source.cardName}: ${abilityName} — deal ${nextValue} damage to an adjacent unit (${remainingValues.length} value${remainingValues.length === 1 ? "" : "s"} left).`,
    sourceUnitId: source.id,
    anchorUnitId: null,
    candidateUnitIds,
    chainRemainingDamages: remainingValues,
    optional: true,
    skipLabel: "Stop"
  };
  state.phase = "choice";
  state.priorityPlayerId = source.controllerId;
  appendEvent(state, {
    type: "PENDING_CHOICE_CREATED",
    choiceId,
    choiceType: "ABILITY_TARGET_CHOICE",
    playerId: source.controllerId,
    sourceEffectIds: [],
    message: `${source.cardName} allocates ${nextValue} splash damage.`
  });
}

/** The living unit one space beyond the target, in line away from the attacker. */
function findUnitBehindTarget(
  combat: CombatState,
  attacker: CombatUnitState,
  defender: CombatUnitState
): CombatUnitState | null {
  const from = getBattlefieldCoordinates(attacker.position);
  const at = getBattlefieldCoordinates(defender.position);
  const rowStep = at.row - from.row;
  const columnStep = at.column - from.column;
  // Only a straight orthogonal line counts ("2 spaces in a line"): the dragon
  // must sit directly next to the target.
  if (Math.abs(rowStep) + Math.abs(columnStep) !== 1) {
    return null;
  }
  const behindRow = at.row + rowStep;
  const behindColumn = at.column + columnStep;
  if (behindRow < 0 || behindRow >= BATTLEFIELD_ROWS || behindColumn < 0 || behindColumn >= BATTLEFIELD_COLUMNS) {
    return null;
  }
  const behindPosition = behindRow * BATTLEFIELD_COLUMNS + behindColumn;
  return Object.values(combat.units).find((unit) => unit.position === behindPosition && isUnitAlive(unit)) ?? null;
}

/**
 * Gold Dragons' line attack: a full separate attack against the unit directly
 * behind the target (friend or foe), at the printed replacement attack value.
 * Declared like the Liches' Death Cloud, so it opens instant windows and rolls
 * its own die; that space is never adjacent to the dragon, so it never
 * retaliates and the follow-up never chains. Returns true when it was
 * declared (the attack sequence is parked on it).
 */
function openGoldDragonLineAttack(
  state: GameState,
  attacker: CombatUnitState,
  defender: CombatUnitState,
  cards: CardLibrary
): boolean {
  const combat = state.combat;
  if (!combat || !isUnitAlive(attacker)) {
    return false;
  }
  const ability = getLineAttackAbility(attacker);
  if (!ability || (attacker.attacksThisActivation ?? 0) !== 1) {
    return false;
  }
  const behind = findUnitBehindTarget(combat, attacker, defender);
  if (!behind) {
    return false;
  }
  declareAbilityAttack(state, attacker, behind.id, ability, cards);
  return true;
}

/**
 * Hydras' "up to 2 adjacent enemy units": after the primary attack, strike one
 * more enemy adjacent to the Hydra with a full separate attack at its own
 * attack value. With several candidates the attacker chooses (an
 * ABILITY_TARGET_CHOICE the neutral seat auto-resolves); the follow-up never
 * retaliates or chains. Returns true when paused on the choice or the attack.
 */
function openHydraSecondAttack(
  state: GameState,
  attacker: CombatUnitState,
  defender: CombatUnitState,
  cards: CardLibrary
): boolean {
  const combat = state.combat;
  if (!combat || !isUnitAlive(attacker) || (attacker.attacksThisActivation ?? 0) !== 1) {
    return false;
  }
  const ability = getSelfAdjacentSecondAttackAbility(attacker);
  if (!ability) {
    return false;
  }

  // Cove Ayssids (Pack): the follow-up only fires "if the target is reduced to 0
  // Health" — i.e. the primary attack removed the original target. A target that
  // merely flipped a Pack down to its Few side is still alive and grants nothing.
  // (Hydras leave this flag unset and always follow up.)
  if (ability.requiresTargetRemoved && isUnitAlive(defender)) {
    return false;
  }

  const candidates = Object.values(combat.units).filter(
    (unit) =>
      unit.id !== defender.id &&
      unit.id !== attacker.id &&
      unit.controllerId !== attacker.controllerId &&
      isUnitAlive(unit) &&
      isAdjacent(unit.position, attacker.position)
  );
  if (candidates.length === 0) {
    return false;
  }

  const baseAttack = ability.baseAttack ?? attacker.attack;

  if (candidates.length === 1) {
    declareAbilityAttack(
      state,
      attacker,
      candidates[0].id,
      { abilityId: ability.abilityId, abilityName: ability.abilityName, baseAttack },
      cards
    );
    return true;
  }

  const choiceId = `choice_${nextEventNumber(state)}`;
  state.pendingChoice = {
    id: choiceId,
    type: "ABILITY_TARGET_CHOICE",
    playerId: attacker.controllerId,
    kind: "second-attack",
    abilityId: ability.abilityId,
    abilityName: ability.abilityName,
    prompt: `${attacker.name}: ${ability.abilityName} — choose a second adjacent enemy to attack.`,
    sourceUnitId: attacker.id,
    anchorUnitId: defender.id,
    candidateUnitIds: candidates.map((unit) => unit.id),
    baseAttack
  };
  state.phase = "choice";
  state.priorityPlayerId = attacker.controllerId;
  appendEvent(state, {
    type: "PENDING_CHOICE_CREATED",
    choiceId,
    choiceType: "ABILITY_TARGET_CHOICE",
    playerId: attacker.controllerId,
    sourceEffectIds: [],
    message: `${attacker.name} chooses a second target for ${ability.abilityName}.`
  });
  return true;
}

/**
 * Azure Dragons / Basilisks: paralyse the target on a matching Attack die.
 * "own" reads this attack's resolved roll; "extra" rolls a fresh die through
 * the combat dice stream. The token only lands on a unit still alive.
 */
function applyParalysisFollowUps(
  state: GameState,
  attacker: CombatUnitState,
  defender: CombatUnitState,
  attackRoll: number,
  forceRoll = false
): void {
  const combat = state.combat;
  if (!combat) {
    return;
  }
  for (const followUp of getParalysisFollowUps(attacker)) {
    if (!isUnitAlive(defender)) {
      break;
    }
    let roll = attackRoll;
    if (followUp.source === "extra") {
      const candidate = rollAttackCandidate(combat, "normal");
      roll = candidate.roll;
      appendEvent(state, {
        type: "UNIT_ABILITY_TRIGGERED",
        unitId: attacker.id,
        abilityId: followUp.abilityId,
        targetUnitId: defender.id,
        message: `${attacker.name} rolls ${roll} for ${followUp.abilityName}.`
      });
    }
    // Tarnum (Fortress) Basilisks VI forces the Paralysis regardless of the face.
    if (!forceRoll && roll !== followUp.onRoll) {
      continue;
    }
    if (unitImmuneToParalysis(state, defender)) {
      appendEvent(state, {
        type: "UNIT_ABILITY_TRIGGERED",
        unitId: defender.id,
        abilityId: "ignore-paralysis",
        targetUnitId: defender.id,
        message: `${defender.cardName} is immune to Paralysis.`
      });
      continue;
    }
    placeCombatToken(state, defender, "paralysis", 0, followUp.abilityName);
    appendEvent(state, {
      type: "UNIT_ABILITY_TRIGGERED",
      unitId: attacker.id,
      abilityId: followUp.abilityId,
      targetUnitId: defender.id,
      message: `${attacker.name} paralyses ${defender.cardName} with ${followUp.abilityName}.`
    });
  }
}

/**
 * Dragon Flies: on attack, dispel every ongoing effect the target's own
 * controller placed on it — its unit-targeted buffs (attack/defense/initiative
 * tokens, Anti-Magic immunity) and the enemy's player-scope auras (Archery,
 * …). Effects the attacker placed on the target (debuffs) and global effects
 * are left untouched. Ongoing cards behind the removed effects return to their
 * owner's discard via the central `releaseEndedOngoingCards` pass.
 */
function applyDispelFollowUps(state: GameState, attacker: CombatUnitState, defender: CombatUnitState): void {
  if (!hasUnitAbilityEffect(attacker, "DISPEL_ENEMY_EFFECTS_ON_TARGET")) {
    return;
  }

  const removed = state.activeEffects.filter(
    (effect) =>
      effect.controllerId === defender.controllerId &&
      effect.scope !== "global" &&
      effectAppliesToUnit(effect, defender)
  );
  if (removed.length === 0) {
    return;
  }

  const removedIds = new Set(removed.map((effect) => effect.id));
  state.activeEffects = state.activeEffects.filter((effect) => !removedIds.has(effect.id));

  appendEvent(state, {
    type: "UNIT_ABILITY_TRIGGERED",
    unitId: attacker.id,
    abilityId: "dragon-fly-dispel",
    targetUnitId: defender.id,
    message: `${attacker.name} dispels ${removed.length} ongoing effect(s) on ${defender.name}: ${removed
      .map((effect) => effect.name)
      .join(", ")}.`
  });
}

/**
 * Medusas: after this unit's own Retaliation Attack, the unit it struck back
 * gains Paralysis. The Pack/Neutral cards paralyse automatically; the Few card
 * first rolls one Attack die and only paralyses on its `onRoll` face. The
 * token only lands on a target still alive after the retaliation.
 */
function applyRetaliationParalysis(
  state: GameState,
  retaliator: CombatUnitState,
  target: CombatUnitState
): void {
  const combat = state.combat;
  if (!combat || !isUnitAlive(target)) {
    return;
  }
  const ability = getRetaliationParalysis(retaliator);
  if (!ability) {
    return;
  }

  if (ability.onRoll !== undefined) {
    const candidate = rollAttackCandidate(combat, "normal");
    appendEvent(state, {
      type: "UNIT_ABILITY_TRIGGERED",
      unitId: retaliator.id,
      abilityId: ability.abilityId,
      targetUnitId: target.id,
      message: `${retaliator.name} rolls ${candidate.roll} for ${ability.abilityName}.`
    });
    if (candidate.roll !== ability.onRoll) {
      return;
    }
  }

  if (unitImmuneToParalysis(state, target)) {
    appendEvent(state, {
      type: "UNIT_ABILITY_TRIGGERED",
      unitId: target.id,
      abilityId: "ignore-paralysis",
      targetUnitId: target.id,
      message: `${target.cardName} is immune to Paralysis.`
    });
    return;
  }

  placeCombatToken(state, target, "paralysis", 0, ability.abilityName);
  appendEvent(state, {
    type: "UNIT_ABILITY_TRIGGERED",
    unitId: retaliator.id,
    abilityId: ability.abilityId,
    targetUnitId: target.id,
    message: `${retaliator.name} paralyses ${target.cardName} with ${ability.abilityName}.`
  });
}

/**
 * A card "can boost Power" for the Magi Power Drain — i.e. it shows the
 * [power] symbol. That is any Spell (each may be discarded for "+1 Power") or
 * any card carrying an ADD_SPELL_POWER effect (the Power statistic, the
 * Power-granting Artifacts, and the elemental-Magic Abilities/permanents),
 * including one tucked inside a choose-one option.
 */
/** Discards one named card from a player's hand to their discard pile. */
function discardNamedCardFromHand(state: GameState, playerId: PlayerId, cardId: CardId): boolean {
  const player = state.players[playerId];
  if (!player) {
    return false;
  }
  const index = player.hand.indexOf(cardId);
  if (index === -1) {
    return false;
  }
  const [discarded] = player.hand.splice(index, 1);
  player.discard.push(discarded);
  return true;
}

/** Discards one random card from a player's hand (seeded); returns its id. */
function discardRandomCardFromHand(state: GameState, playerId: PlayerId): CardId | null {
  const player = state.players[playerId];
  if (!player || player.hand.length === 0) {
    return null;
  }
  const random = createSeededRandom(`${state.seed}#magi-drain#${eventSeedNumber(state)}`);
  const index = random.nextInt(0, player.hand.length - 1);
  const [discarded] = player.hand.splice(index, 1);
  player.discard.push(discarded);
  return discarded;
}

/**
 * Neutral Magi "Power Drain". After the Magi's own attack (never a
 * retaliation), the defending player must lose a card: with a Power card in
 * hand they choose which Power card to discard or accept a random discard;
 * with no Power card the random discard is forced and resolves at once.
 * Returns true only when a choice was opened (combat is now parked on it).
 */
function openMagiDiscardChoice(
  state: GameState,
  attacker: CombatUnitState,
  defender: CombatUnitState,
  cards: CardLibrary
): boolean {
  const ability = getEnemyDiscardAbility(attacker);
  if (!ability) {
    return false;
  }

  // The choice belongs to the defender's controller — only a seated player
  // with cards is affected; the neutral seat has no hand.
  const chooserId = defender.controllerId;
  const chooser = state.players[chooserId];
  if (chooserId === NEUTRAL_PLAYER_ID || !chooser || chooser.hand.length === 0) {
    return false;
  }

  const powerCardIds = chooser.hand.filter((cardId) => cardCanBoostPower(cards[cardId]));

  // No Power card to spare: the random discard is forced, no decision to make.
  if (powerCardIds.length === 0) {
    const discarded = discardRandomCardFromHand(state, chooserId);
    if (discarded) {
      appendEvent(state, {
        type: "UNIT_ABILITY_TRIGGERED",
        unitId: attacker.id,
        abilityId: ability.abilityId,
        targetUnitId: defender.id,
        message: `${attacker.name}'s ${ability.abilityName} discards a random card from ${chooser.name}'s hand.`
      });
    }
    return false;
  }

  const choiceId = `choice_${nextEventNumber(state)}`;
  state.pendingChoice = {
    id: choiceId,
    type: "COMBAT_HAND_DISCARD",
    playerId: chooserId,
    kind: "magi-power-or-random",
    abilityId: ability.abilityId,
    abilityName: ability.abilityName,
    sourceUnitId: attacker.id,
    prompt: `${attacker.name}: ${ability.abilityName} — discard a Power card of your choice, or let a random card be discarded.`,
    powerCardIds
  };
  state.phase = "choice";
  state.priorityPlayerId = chooserId;

  appendEvent(state, {
    type: "PENDING_CHOICE_CREATED",
    choiceId,
    choiceType: "COMBAT_HAND_DISCARD",
    playerId: chooserId,
    sourceEffectIds: [],
    message: `${chooser.name} chooses how to answer ${attacker.name}'s ${ability.abilityName}.`
  });
  return true;
}

/**
 * Resolves a COMBAT_HAND_DISCARD. For the Magi Power Drain it discards the chosen
 * (or random) card and unparks the attack; for the Neutral Pegasi "Mystic Toll"
 * it discards the chosen Power card and then casts the deferred Spell.
 */
function resolveCombatHandDiscard(
  state: GameState,
  action: Extract<GameAction, { type: "RESOLVE_COMBAT_DISCARD" }>,
  cards: CardLibrary
): void {
  const choice = state.pendingChoice;
  if (!choice || choice.type !== "COMBAT_HAND_DISCARD" || choice.id !== action.choiceId) {
    throw new Error("There is no card-discard choice to resolve.");
  }
  if (choice.playerId !== action.playerId) {
    throw new Error("Another player resolves this discard.");
  }

  const chooser = state.players[action.playerId];
  if (!chooser) {
    throw new Error("Unknown player.");
  }

  // Neutral Pegasi "Mystic Toll": pay the chosen Power card, then cast the held
  // Spell. No random option — the caster picks which Power card to pay.
  if (choice.kind === "pegasi-toll") {
    if (action.cardId === "random") {
      throw new Error("The Pegasi toll must be paid with a chosen card that has Power.");
    }
    if (!choice.powerCardIds.includes(action.cardId)) {
      throw new Error("That card cannot pay the Pegasi toll.");
    }
    if (!discardNamedCardFromHand(state, action.playerId, action.cardId)) {
      throw new Error("That card is no longer in hand.");
    }
    const toll = choice.tollSpell;
    appendEvent(state, {
      type: "PENDING_CHOICE_RESOLVED",
      choiceId: choice.id,
      playerId: action.playerId,
      selectedIndex: choice.powerCardIds.indexOf(action.cardId)
    });
    appendEvent(state, {
      type: "UNIT_ABILITY_TRIGGERED",
      unitId: choice.sourceUnitId,
      abilityId: choice.abilityId,
      message: `${chooser.name} pays ${cards[action.cardId]?.name ?? action.cardId} to the ${choice.abilityName}.`
    });
    state.pendingChoice = null;
    state.phase = "combat";
    state.priorityPlayerId = null;
    if (toll) {
      performSpellCast(
        state,
        {
          type: "CAST_SPELL",
          playerId: action.playerId,
          cardId: toll.cardId,
          target: toll.target,
          ...(toll.fromScroll ? { fromScroll: toll.fromScroll } : {}),
          ...(toll.fromSpellDeck ? { fromSpellDeck: toll.fromSpellDeck } : {}),
          ...(toll.fromSpellBook ? { fromSpellBook: true } : {}),
          ...(toll.tarnumReturn ? { tarnumReturn: toll.tarnumReturn } : {})
        },
        cards
      );
    }
    return;
  }

  if (action.cardId === "random") {
    const discarded = discardRandomCardFromHand(state, action.playerId);
    appendEvent(state, {
      type: "PENDING_CHOICE_RESOLVED",
      choiceId: choice.id,
      playerId: action.playerId,
      selectedIndex: -1
    });
    if (discarded) {
      appendEvent(state, {
        type: "UNIT_ABILITY_TRIGGERED",
        unitId: choice.sourceUnitId,
        abilityId: choice.abilityId,
        targetUnitId: choice.sourceUnitId,
        message: `${chooser.name} lets ${choice.abilityName} discard a random card.`
      });
    }
  } else {
    if (!choice.powerCardIds.includes(action.cardId)) {
      throw new Error("That card cannot be chosen for the Power Drain.");
    }
    if (!discardNamedCardFromHand(state, action.playerId, action.cardId)) {
      throw new Error("That card is no longer in hand.");
    }
    appendEvent(state, {
      type: "PENDING_CHOICE_RESOLVED",
      choiceId: choice.id,
      playerId: action.playerId,
      selectedIndex: choice.powerCardIds.indexOf(action.cardId)
    });
    appendEvent(state, {
      type: "UNIT_ABILITY_TRIGGERED",
      unitId: choice.sourceUnitId,
      abilityId: choice.abilityId,
      targetUnitId: choice.sourceUnitId,
      message: `${chooser.name} discards ${cards[action.cardId]?.name ?? action.cardId} to ${choice.abilityName}.`
    });
  }

  state.pendingChoice = null;
  state.phase = "combat";
  state.priorityPlayerId = null;
  resumeAttackSequence(state, cards);
  finishCombatIfNeeded(state);
}

/**
 * Ghost Dragons' knock-back destinations: the empty spaces 1 step away from the
 * target that are not adjacent to the Ghost Dragons. Obstacles and other living
 * units block a space; the target's own space is never a candidate (it must
 * move). Sorted by board position so a forced/auto pick is deterministic.
 */
function getKnockbackDestinations(
  combat: CombatState,
  attacker: CombatUnitState,
  defender: CombatUnitState
): number[] {
  const occupied = new Set<number>();
  for (const unit of Object.values(combat.units)) {
    if (unit.id !== defender.id && isUnitAlive(unit) && isBattlefieldPosition(unit.position)) {
      occupied.add(unit.position);
    }
  }
  return getOrthogonalNeighbors(defender.position)
    .filter(
      (position) =>
        !occupied.has(position) &&
        !(combat.obstacles?.includes(position) ?? false) &&
        !isAdjacent(position, attacker.position)
    )
    .sort((left, right) => left - right);
}

/** Shoves a knocked-back unit to the chosen space and logs the move. */
function applyKnockback(
  state: GameState,
  attacker: CombatUnitState,
  defender: CombatUnitState,
  destination: number,
  ability: { abilityId: string; abilityName: string }
): void {
  const from = defender.position;
  defender.position = destination;
  appendEvent(state, {
    type: "UNIT_ABILITY_TRIGGERED",
    unitId: attacker.id,
    abilityId: ability.abilityId,
    targetUnitId: defender.id,
    message: `${attacker.name}'s ${ability.abilityName} shoves ${defender.cardName} to ${getBattlefieldLabel(destination)}.`
  });
  appendEvent(state, {
    type: "UNIT_MOVED",
    playerId: defender.controllerId,
    unitId: defender.id,
    from,
    to: destination
  });
}

/** Opens the defender's "choose where you're knocked back" space picker. */
function openKnockbackChoice(
  state: GameState,
  attacker: CombatUnitState,
  defender: CombatUnitState,
  destinations: number[],
  ability: { abilityId: string; abilityName: string }
): void {
  const choiceId = `choice_${nextEventNumber(state)}`;
  state.pendingChoice = {
    id: choiceId,
    type: "OPTION_CHOICE",
    playerId: defender.controllerId,
    prompt: `${attacker.name}'s ${ability.abilityName}: choose where ${defender.cardName} is pushed.`,
    options: destinations.map((position) => ({ label: `Move to ${getBattlefieldLabel(position)}` })),
    context: "combat-knockback",
    knockback: { unitId: defender.id, attackerId: attacker.id, positions: destinations },
    returnPhase: "combat"
  };
  state.phase = "choice";
  state.priorityPlayerId = defender.controllerId;
  appendEvent(state, {
    type: "PENDING_CHOICE_CREATED",
    choiceId,
    choiceType: "ABILITY_TARGET_CHOICE",
    playerId: defender.controllerId,
    sourceEffectIds: [],
    message: `${defender.cardName} is knocked back — ${state.players[defender.controllerId]?.name ?? defender.controllerId} chooses where.`
  });
}

/**
 * Ghost Dragons (neutral): after their attack, roll 1 Attack die; on the
 * knock-back face the still-living target is shoved one empty space away from
 * the dragon (the defender picks; a neutral target or a single forced space is
 * moved at once). Being pushed out of reach denies the Retaliation Attack — the
 * parked sequence re-checks adjacency. With no valid space the target stays and
 * retaliates as normal. Returns true only when it pauses on the defender's
 * choice.
 */
function openGhostDragonKnockback(
  state: GameState,
  attacker: CombatUnitState,
  defender: CombatUnitState
): boolean {
  const combat = state.combat;
  if (!combat || !isUnitAlive(attacker) || !isUnitAlive(defender)) {
    return false;
  }
  const ability = getKnockbackAbility(attacker);
  if (!ability) {
    return false;
  }

  // "After the attack, roll 1 Attack die."
  const candidate = rollAttackCandidate(combat, "normal");
  appendEvent(state, {
    type: "UNIT_ABILITY_TRIGGERED",
    unitId: attacker.id,
    abilityId: ability.abilityId,
    targetUnitId: defender.id,
    message: `${attacker.name} rolls ${candidate.roll} for ${ability.abilityName}.`
  });
  if (candidate.roll !== ability.onRoll) {
    return false;
  }

  const destinations = getKnockbackDestinations(combat, attacker, defender);
  if (destinations.length === 0) {
    // "If no valid space exists, the unit remains in place and retaliation occurs."
    appendEvent(state, {
      type: "UNIT_ABILITY_TRIGGERED",
      unitId: attacker.id,
      abilityId: ability.abilityId,
      targetUnitId: defender.id,
      message: `${defender.cardName} has nowhere to be pushed and holds its ground.`
    });
    return false;
  }

  // The defending player chooses the destination; a neutral target (no seat to
  // ask) or a single forced space resolves immediately.
  if (isNeutralUnit(defender) || destinations.length === 1) {
    applyKnockback(state, attacker, defender, destinations[0], ability);
    return false;
  }

  openKnockbackChoice(state, attacker, defender, destinations, ability);
  return true;
}

/** Resolves the Ghost Dragon knock-back space pick, then unparks the attack. */
function resolveKnockbackChoice(
  state: GameState,
  action: Extract<GameAction, { type: "CHOOSE_OPTION" }>,
  cards: CardLibrary
): void {
  const choice = state.pendingChoice;
  if (
    !choice ||
    choice.type !== "OPTION_CHOICE" ||
    choice.context !== "combat-knockback" ||
    choice.id !== action.choiceId ||
    choice.playerId !== action.playerId ||
    !choice.knockback
  ) {
    throw new Error("There is no knock-back choice to resolve.");
  }

  const combat = state.combat;
  const defender = combat?.units[choice.knockback.unitId];
  const attacker = combat?.units[choice.knockback.attackerId];
  const destination = choice.knockback.positions[action.optionIndex];
  if (!combat || !defender || !attacker || destination === undefined) {
    throw new Error("That knock-back destination is not available.");
  }

  const ability = getKnockbackAbility(attacker) ?? {
    abilityId: "ghost-dragon-knockback",
    abilityName: "Knock Back"
  };
  applyKnockback(state, attacker, defender, destination, ability);

  appendEvent(state, {
    type: "PENDING_CHOICE_RESOLVED",
    choiceId: choice.id,
    playerId: action.playerId,
    selectedIndex: action.optionIndex
  });

  state.pendingChoice = null;
  state.phase = "combat";
  state.priorityPlayerId = null;
  resumeAttackSequence(state, cards);
  finishCombatIfNeeded(state);
}

/**
 * Teleport Spell: opens the caster's "choose where the unit lands" empty-space
 * picker. Every space free of a living unit, an obstacle and a fortification is
 * a legal destination (distance and intervening obstacles are ignored). With
 * nowhere to land the cast simply fizzles (no choice opened).
 */
function openTeleportChoice(
  state: GameState,
  playerId: PlayerId,
  unit: CombatUnitState,
  abilityId?: string
): boolean {
  const combat = state.combat;
  if (!combat) {
    return false;
  }

  const positions: number[] = [];
  for (let position = 0; position < BATTLEFIELD_CELL_COUNT; position += 1) {
    if (!isSpaceBlockedForSummon(combat, position)) {
      positions.push(position);
    }
  }
  if (positions.length === 0) {
    return false;
  }

  const choiceId = `choice_${nextEventNumber(state)}`;
  state.pendingChoice = {
    id: choiceId,
    type: "OPTION_CHOICE",
    playerId,
    prompt: `Teleport ${unit.cardName} to an empty space.`,
    options: positions.map((position) => ({ label: `Teleport to ${getBattlefieldLabel(position)}` })),
    context: "combat-teleport",
    teleport: { unitId: unit.id, positions, abilityId },
    returnPhase: "combat"
  };
  appendEvent(state, {
    type: "PENDING_CHOICE_CREATED",
    choiceId,
    choiceType: "ABILITY_TARGET_CHOICE",
    playerId,
    sourceEffectIds: [],
    message: `${state.players[playerId]?.name ?? playerId} teleports ${unit.cardName}.`
  });
  return true;
}

/** Resolves the Teleport destination pick: relocate the unit to the chosen space. */
function resolveTeleportChoice(
  state: GameState,
  action: Extract<GameAction, { type: "CHOOSE_OPTION" }>
): void {
  const choice = state.pendingChoice;
  if (
    !choice ||
    choice.type !== "OPTION_CHOICE" ||
    choice.context !== "combat-teleport" ||
    choice.id !== action.choiceId ||
    choice.playerId !== action.playerId ||
    !choice.teleport
  ) {
    throw new Error("There is no teleport choice to resolve.");
  }

  const combat = state.combat;
  const unit = combat?.units[choice.teleport.unitId];
  const destination = choice.teleport.positions[action.optionIndex];
  if (!combat || !unit || destination === undefined || isSpaceBlockedForSummon(combat, destination)) {
    throw new Error("That teleport destination is not available.");
  }

  const from = unit.position;
  unit.position = destination;
  // A unit-ability teleport (the Jotunn Warlord) plays that ability's teleport
  // sound here, just before the card-glide (UNIT_MOVED), so SFX and animation
  // land together — exactly like the Teleport Spell. The Spell sets no abilityId
  // (it already cues its own sound on SPELL_CAST_RESOLVED), so this stays silent
  // for it and never double-plays.
  if (choice.teleport.abilityId) {
    appendEvent(state, {
      type: "UNIT_ABILITY_TRIGGERED",
      unitId: unit.id,
      abilityId: choice.teleport.abilityId,
      targetUnitId: unit.id,
      message: `${unit.cardName} blinks across the battlefield.`
    });
  }
  appendEvent(state, {
    type: "UNIT_MOVED",
    playerId: unit.controllerId,
    unitId: unit.id,
    from,
    to: destination
  });
  appendEvent(state, {
    type: "PENDING_CHOICE_RESOLVED",
    choiceId: choice.id,
    playerId: action.playerId,
    selectedIndex: action.optionIndex
  });

  state.pendingChoice = null;
  state.phase = "combat";
  state.priorityPlayerId = null;
  finishCombatIfNeeded(state);
}

// ---------------------------------------------------------------------------
// Battlefield-obstacle Spells: Force Field, Fire Wall, Quicksand, Land Mine.
// Each places a token on a Combat-board space (see BattlefieldTokenState). The
// trigger logic lives in moveUnit/walkMoveThroughTokens; this block only places
// the tokens, and for Quicksand/Land Mine runs the caster's "place the rest"
// picker.
// ---------------------------------------------------------------------------

/** Adds a battlefield token to the combat board and announces it. */
function addBattlefieldToken(state: GameState, token: Omit<BattlefieldTokenState, "id">): BattlefieldTokenState {
  const combat = state.combat;
  if (!combat) {
    throw new Error("No combat to place a battlefield token in.");
  }
  const placed: BattlefieldTokenState = { ...token, id: `bftoken_${nextEventNumber(state)}` };
  combat.battlefieldTokens = [...(combat.battlefieldTokens ?? []), placed];
  appendEvent(state, {
    type: "BATTLEFIELD_TOKEN_PLACED",
    playerId: placed.controllerId,
    tokenId: placed.id,
    kind: placed.kind,
    position: placed.position
  });
  return placed;
}

/**
 * Lifts every Force Field whose timed duration ends with `finishedRound` (a
 * Power 0 field after this round, a Power 1 field after the next). Fire Wall,
 * Quicksand and Land Mine carry no expiry — they last the whole Combat and go
 * when the combat state does.
 */
function expireBattlefieldTokensAtRoundEnd(state: GameState, finishedRound: number): void {
  const combat = state.combat;
  if (!combat?.battlefieldTokens?.length) {
    return;
  }
  const expiring = combat.battlefieldTokens.filter((token) => token.expiresAtCombatRoundEnd === finishedRound);
  if (expiring.length === 0) {
    return;
  }
  combat.battlefieldTokens = combat.battlefieldTokens.filter((token) => token.expiresAtCombatRoundEnd !== finishedRound);
  for (const token of expiring) {
    appendEvent(state, {
      type: "BATTLEFIELD_TOKEN_EXPIRED",
      tokenId: token.id,
      kind: token.kind,
      position: token.position
    });
  }
}

/** The combat round at whose end a Force Field of the given duration lifts (undefined = whole combat). */
function forceFieldExpiry(combat: CombatState, duration: EffectDurationDefinition): number | undefined {
  if (duration.type === "current-combat-round") {
    return combat.round;
  }
  if (duration.type === "next-combat-round") {
    return combat.round + 1;
  }
  return undefined;
}

/** Empty board spaces a new token may be placed on (no unit, obstacle, fortification or other token). */
function emptyTokenSpaces(combat: CombatState): number[] {
  const positions: number[] = [];
  for (let position = 0; position < BATTLEFIELD_CELL_COUNT; position += 1) {
    if (!isSpaceBlockedForSummon(combat, position)) {
      positions.push(position);
    }
  }
  return positions;
}

/**
 * The shuffled armed/decoy assignment for a Quicksand / Land Mine set: half the
 * `count` tokens are armed and half are decoys, mixed with the combat's seeded
 * RNG so the result is deterministic and server-authoritative (the opponent
 * never sees it — see getPlayerView). Tokens are assigned these flags in
 * placement order.
 */
function makeArmedSlots(state: GameState, count: number): boolean[] {
  const slots: boolean[] = [];
  const armedCount = Math.floor(count / 2);
  for (let index = 0; index < count; index += 1) {
    slots.push(index < armedCount);
  }
  const rng = createSeededRandom(`${state.combat?.dice.seed ?? "tokens"}:armed:${nextEventNumber(state)}`);
  for (let index = slots.length - 1; index > 0; index -= 1) {
    const swap = rng.nextInt(0, index);
    [slots[index], slots[swap]] = [slots[swap], slots[index]];
  }
  return slots;
}

/**
 * Opens (or re-opens) the caster's "place the next Quicksand / Land Mine token"
 * picker. Each pick drops one token on a chosen empty space, taking its
 * armed/decoy flag from `armedSlots[placedCount]`; the picker re-opens until the
 * whole set is down, the player stops, or the board runs out of empty spaces
 * ("discard any leftover Tokens"). Returns false when nothing remains to place.
 */
function openTokenPlacementChoice(
  state: GameState,
  playerId: PlayerId,
  kind: "quicksand" | "land_mine",
  armedSlots: boolean[],
  placedCount: number,
  triggerDamage: number
): boolean {
  const combat = state.combat;
  if (!combat) {
    return false;
  }
  const remaining = armedSlots.length - placedCount;
  const positions = emptyTokenSpaces(combat);
  if (remaining <= 0 || positions.length === 0) {
    return false;
  }

  const spellName = kind === "quicksand" ? "Quicksand" : "Land Mine";
  const choiceId = `choice_${nextEventNumber(state)}`;
  state.pendingChoice = {
    id: choiceId,
    type: "OPTION_CHOICE",
    playerId,
    prompt: `${spellName}: place a token on an empty space (${remaining} left), or stop.`,
    options: [
      ...positions.map((position) => ({ label: `Place at ${getBattlefieldLabel(position)}` })),
      { label: "Stop placing tokens" }
    ],
    context: "place-battlefield-tokens",
    placeTokens: { kind, positions, armedSlots, placedCount, remaining, triggerDamage },
    returnPhase: "combat"
  };
  appendEvent(state, {
    type: "PENDING_CHOICE_CREATED",
    choiceId,
    choiceType: "ABILITY_TARGET_CHOICE",
    playerId,
    sourceEffectIds: [],
    message: `${state.players[playerId]?.name ?? playerId} places ${spellName} tokens.`
  });
  return true;
}

/**
 * Begins a Quicksand / Land Mine cast: shuffle the armed/decoy set, then open
 * the caster's picker for the WHOLE set. Every token — including the first — is
 * placed on a chosen empty space through that one picker (a no-target cast, like
 * Remove Obstacle), so there is no special first-token-on-the-cast-space step.
 */
function beginHiddenTokenPlacement(
  state: GameState,
  playerId: PlayerId,
  kind: "quicksand" | "land_mine",
  count: number,
  triggerDamage: number
): void {
  const combat = state.combat;
  if (!combat || count <= 0) {
    return;
  }
  const armedSlots = makeArmedSlots(state, count);
  openTokenPlacementChoice(state, playerId, kind, armedSlots, 0, triggerDamage);
}

/** Resolves one pick of the Quicksand / Land Mine placement picker. */
function resolvePlaceTokensChoice(state: GameState, action: Extract<GameAction, { type: "CHOOSE_OPTION" }>): void {
  const choice = state.pendingChoice;
  if (
    !choice ||
    choice.type !== "OPTION_CHOICE" ||
    choice.context !== "place-battlefield-tokens" ||
    choice.id !== action.choiceId ||
    choice.playerId !== action.playerId ||
    !choice.placeTokens
  ) {
    throw new Error("There is no token placement to resolve.");
  }

  const combat = state.combat;
  const plan = choice.placeTokens;
  const position = plan.positions[action.optionIndex];

  appendEvent(state, {
    type: "PENDING_CHOICE_RESOLVED",
    choiceId: choice.id,
    playerId: action.playerId,
    selectedIndex: action.optionIndex
  });
  state.pendingChoice = null;

  // A chosen empty space drops the next token; the trailing "stop placing"
  // option (or a now-occupied space) discards the leftover tokens, exactly as
  // the rulebook allows. Either way the picker re-opens only while tokens and
  // empty spaces both remain.
  let reopened = false;
  if (combat && position !== undefined && !isSpaceBlockedForSummon(combat, position)) {
    addBattlefieldToken(state, {
      kind: plan.kind,
      position,
      controllerId: action.playerId,
      armed: plan.armedSlots[plan.placedCount],
      damage: plan.kind === "land_mine" ? plan.triggerDamage : undefined
    });
    reopened = openTokenPlacementChoice(state, action.playerId, plan.kind, plan.armedSlots, plan.placedCount + 1, plan.triggerDamage);
  }

  if (reopened) {
    state.phase = "choice";
    state.priorityPlayerId = action.playerId;
  } else {
    state.phase = "combat";
    state.priorityPlayerId = null;
  }
  finishCombatIfNeeded(state);
}

/**
 * Clone Spell: opens the destination pick — the empty spaces orthogonally
 * adjacent to the cloned unit. Mirrors openTeleportChoice but is restricted to
 * the original's neighbours ("an adjacent empty space"). Returns false (opening
 * nothing) when the original is hemmed in with no empty neighbour, so the caller
 * can refund the cast rather than waste it.
 */
function openCloneChoice(state: GameState, playerId: PlayerId, original: CombatUnitState): boolean {
  const combat = state.combat;
  if (!combat) {
    return false;
  }

  const positions = getOrthogonalNeighbors(original.position).filter(
    (position) => !isSpaceBlockedForSummon(combat, position)
  );
  if (positions.length === 0) {
    return false;
  }

  const choiceId = `choice_${nextEventNumber(state)}`;
  state.pendingChoice = {
    id: choiceId,
    type: "OPTION_CHOICE",
    playerId,
    prompt: `Place the Clone of ${original.cardName} on an adjacent empty space.`,
    options: positions.map((position) => ({ label: `Clone to ${getBattlefieldLabel(position)}` })),
    context: "combat-clone",
    clone: { originalUnitId: original.id, positions },
    returnPhase: "combat"
  };
  appendEvent(state, {
    type: "PENDING_CHOICE_CREATED",
    choiceId,
    choiceType: "ABILITY_TARGET_CHOICE",
    playerId,
    sourceEffectIds: [],
    message: `${state.players[playerId]?.name ?? playerId} clones ${original.cardName}.`
  });
  return true;
}

/** The least Power that a `gradeByPower` ladder needs to reach `grade`. */
function powerRequiredForGrade(
  gradeByPower: Record<number, CombatUnitState["grade"]>,
  grade: CombatUnitState["grade"]
): number | null {
  const match = Object.entries(gradeByPower)
    .map(([power, atGrade]) => ({ power: Number(power), atGrade }))
    .filter((entry) => Number.isFinite(entry.power) && gradeRank(entry.atGrade) >= gradeRank(grade))
    .sort((left, right) => left.power - right.power)[0];
  return match ? match.power : null;
}

/**
 * Clone could not land at the Power paid (the chosen unit's grade was out of
 * reach, or — defensively — no adjacent empty space remained). Rather than
 * silently waste the cast, refund it: the Clone card and every Power-source card
 * spent on it return to the caster's hand, the cast stops counting against the
 * one-Spell-per-round limit, and a notice tells the player nothing was lost.
 * The caster is returned to the battle screen. Mirrors no card/Power leaving
 * play, so re-casting (after paying enough Power) is always possible.
 */
function refundInsufficientCloneCast(
  state: GameState,
  stackItem: ResolutionStackItem,
  target: CombatUnitState,
  reason: string
): void {
  if (stackItem.action.type !== "CAST_SPELL") {
    return;
  }
  const playerId = stackItem.action.playerId;
  const player = state.players[playerId];

  // Return the Power-source cards played into this cast (the "+1 Power" discards
  // and Power statistics) to the caster's hand. A scroll cast pays no such cards.
  if (player && !stackItem.modifiers.scrollLocked) {
    for (const cardId of stackItem.modifiers.playedCardIds) {
      const discardIndex = player.discard.lastIndexOf(cardId);
      if (discardIndex !== -1) {
        player.discard.splice(discardIndex, 1);
        player.hand.push(cardId);
      }
    }
  }

  // Return the Clone card itself (a scroll cast removed the spell from the game,
  // so there is no card to return — only the Power, handled above).
  if (player && !stackItem.modifiers.scrollLocked) {
    const discardIndex = player.discard.lastIndexOf(stackItem.action.cardId);
    if (discardIndex !== -1) {
      player.discard.splice(discardIndex, 1);
      player.hand.push(stackItem.action.cardId);
    }
  }

  // The refunded cast no longer counts as a Spell this round/turn, so it neither
  // burns the one-Spell limit nor the "first spell" Power bonuses.
  if (player) {
    player.combatStats.spellsCastThisRound = Math.max(0, player.combatStats.spellsCastThisRound - 1);
    player.combatStats.spellsCastThisTurn = Math.max(0, (player.combatStats.spellsCastThisTurn ?? 0) - 1);
  }

  appendEvent(state, {
    type: "SPELL_CAST_REFUNDED",
    playerId,
    spellCardId: stackItem.action.cardId,
    reason
  });

  stackItem.status = "cancelled";
  state.stack.pop();
  state.pendingChoice = null;
  if (!finishCombatIfNeeded(state)) {
    state.phase = "combat";
    state.priorityPlayerId = null;
  }
}

/** Resolves the Clone destination pick: drop the 1-Health Clone Token there. */
function resolveCloneChoice(
  state: GameState,
  action: Extract<GameAction, { type: "CHOOSE_OPTION" }>
): void {
  const choice = state.pendingChoice;
  if (
    !choice ||
    choice.type !== "OPTION_CHOICE" ||
    choice.context !== "combat-clone" ||
    choice.id !== action.choiceId ||
    choice.playerId !== action.playerId ||
    !choice.clone
  ) {
    throw new Error("There is no clone choice to resolve.");
  }

  const combat = state.combat;
  const original = combat?.units[choice.clone.originalUnitId];
  const destination = choice.clone.positions[action.optionIndex];
  if (!combat || !original || destination === undefined || isSpaceBlockedForSummon(combat, destination)) {
    throw new Error("That clone destination is not available.");
  }

  const clone = placeCloneUnit(state, action.playerId, original, destination);
  appendEvent(state, {
    type: "PENDING_CHOICE_RESOLVED",
    choiceId: choice.id,
    playerId: action.playerId,
    selectedIndex: action.optionIndex
  });
  if (clone) {
    appendEvent(state, {
      type: "UNIT_ABILITY_TRIGGERED",
      unitId: clone.id,
      abilityId: "spell.clone",
      message: `${original.cardName} is cloned at ${getBattlefieldLabel(destination)} (1 Health).`
    });
  }

  state.pendingChoice = null;
  state.phase = "combat";
  state.priorityPlayerId = null;
  finishCombatIfNeeded(state);
}

/**
 * Necklace of Swiftness (option B): opens the "step one space" destination pick
 * — the empty spaces orthogonally adjacent to the chosen unit (occupied spaces,
 * obstacles, Walls and the Gate are excluded by isSpaceBlockedForSummon). Does
 * nothing when the unit is hemmed in with no empty neighbour. The play already
 * filtered to a unit with at least one empty neighbour, so a choice always opens
 * for a legal play.
 */
function openUnitStepChoice(state: GameState, playerId: PlayerId, unit: CombatUnitState): void {
  const combat = state.combat;
  if (!combat) {
    return;
  }

  const positions = getOrthogonalNeighbors(unit.position).filter(
    (position) => !isSpaceBlockedForSummon(combat, position)
  );
  if (positions.length === 0) {
    return;
  }

  const choiceId = `choice_${nextEventNumber(state)}`;
  state.pendingChoice = {
    id: choiceId,
    type: "OPTION_CHOICE",
    playerId,
    prompt: `Move ${unit.cardName} one space.`,
    options: positions.map((position) => ({ label: `Move to ${getBattlefieldLabel(position)}` })),
    context: "combat-step",
    step: { unitId: unit.id, positions },
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
    message: `${state.players[playerId]?.name ?? playerId} moves ${unit.cardName} one space.`
  });
}

/** Resolves the Necklace of Swiftness step: relocate the unit to the chosen space. */
function resolveUnitStepChoice(
  state: GameState,
  action: Extract<GameAction, { type: "CHOOSE_OPTION" }>
): void {
  const choice = state.pendingChoice;
  if (
    !choice ||
    choice.type !== "OPTION_CHOICE" ||
    choice.context !== "combat-step" ||
    choice.id !== action.choiceId ||
    choice.playerId !== action.playerId ||
    !choice.step
  ) {
    throw new Error("There is no movement choice to resolve.");
  }

  const combat = state.combat;
  const unit = combat?.units[choice.step.unitId];
  const destination = choice.step.positions[action.optionIndex];
  if (!combat || !unit || destination === undefined || isSpaceBlockedForSummon(combat, destination)) {
    throw new Error("That move destination is not available.");
  }

  const from = unit.position;
  unit.position = destination;
  appendEvent(state, {
    type: "UNIT_MOVED",
    playerId: unit.controllerId,
    unitId: unit.id,
    from,
    to: destination
  });
  appendEvent(state, {
    type: "PENDING_CHOICE_RESOLVED",
    choiceId: choice.id,
    playerId: action.playerId,
    selectedIndex: action.optionIndex
  });

  state.pendingChoice = null;
  state.phase = "combat";
  state.priorityPlayerId = null;
  finishCombatIfNeeded(state);
}

/**
 * Liches' Death Cloud: opens the second-attack target choice (or declares
 * the attack straight away when only one unit qualifies). Returns true when
 * the attack sequence is paused on the choice or the follow-up attack.
 */
function openSecondAttackFollowUp(
  state: GameState,
  attacker: CombatUnitState,
  defender: CombatUnitState,
  cards: CardLibrary
): boolean {
  const combat = state.combat;
  if (!combat || !isUnitAlive(attacker)) {
    return false;
  }

  const ability = getSecondAttackAbility(attacker);
  if (!ability || (attacker.attacksThisActivation ?? 0) !== 1) {
    return false;
  }

  const candidates = getSecondAttackCandidates(combat, attacker, defender);
  if (candidates.length === 0) {
    return false;
  }

  if (candidates.length === 1) {
    declareAbilityAttack(state, attacker, candidates[0], ability, cards);
    return true;
  }

  const choiceId = `choice_${nextEventNumber(state)}`;
  state.pendingChoice = {
    id: choiceId,
    type: "ABILITY_TARGET_CHOICE",
    playerId: attacker.controllerId,
    kind: "second-attack",
    abilityId: ability.abilityId,
    abilityName: ability.abilityName,
    prompt: `${attacker.name}: ${ability.abilityName} — choose a unit adjacent to the target for the second attack (attack ${ability.baseAttack}).`,
    sourceUnitId: attacker.id,
    anchorUnitId: defender.id,
    candidateUnitIds: candidates,
    baseAttack: ability.baseAttack
  };
  state.phase = "choice";
  state.priorityPlayerId = attacker.controllerId;

  appendEvent(state, {
    type: "PENDING_CHOICE_CREATED",
    choiceId,
    choiceType: "ABILITY_TARGET_CHOICE",
    playerId: attacker.controllerId,
    sourceEffectIds: [],
    message: `${attacker.name} chooses the target of ${ability.abilityName}.`
  });
  return true;
}

function declareAbilityAttack(
  state: GameState,
  attacker: CombatUnitState,
  targetUnitId: UnitId,
  ability: { abilityId: string; abilityName: string; baseAttack: number },
  cards: CardLibrary
): void {
  appendEvent(state, {
    type: "UNIT_ABILITY_TRIGGERED",
    unitId: attacker.id,
    abilityId: ability.abilityId,
    targetUnitId,
    message: `${attacker.name} unleashes ${ability.abilityName} on ${state.combat?.units[targetUnitId]?.cardName ?? targetUnitId}.`
  });

  declareAttack(
    state,
    {
      type: "ATTACK_UNIT",
      playerId: attacker.controllerId,
      attackerId: attacker.id,
      defenderId: targetUnitId,
      abilityAttack: { abilityId: ability.abilityId, baseAttack: ability.baseAttack }
    },
    cards
  );
}

function setActiveUnit(state: GameState, unitId: UnitId | null): void {
  if (!state.combat) {
    return;
  }

  state.combat.activeUnitId = unitId;

  if (!unitId) {
    state.activePlayerId = state.combat.attackerPlayerId;
    return;
  }

  const activeUnit = state.combat.units[unitId];

  // Paralysis: "If a unit would activate with a Paralysis Token on it, skip
  // its activation and remove the Token instead."
  if (hasToken(activeUnit, "paralysis")) {
    removeToken(state, activeUnit, "paralysis", "activation-skipped");
    activeUnit.activatedThisRound = true;
    appendExpiredEffectEvents(state, expireEffectsForActivationEnd(state, activeUnit.id), "activation-ended");
    appendEvent(state, {
      type: "UNIT_ACTIVATION_ENDED",
      playerId: activeUnit.controllerId,
      unitId: activeUnit.id
    });
    advanceActiveUnit(state);
    return;
  }

  // Negative Morale "roll 1 Attack die before your unit's activation; a -1
  // skips it": checked for every activation of the holder's units while the
  // card is face-up, resolving (and leaving) only when a skip actually
  // happens. The check die is an Attack die the holder rolls, so a "+1" on it
  // still trips the holder's own reroll-the-"+1" curse first.
  if (
    state.adventure?.moraleCards &&
    playerHoldsMoraleCard(state, activeUnit.controllerId, MORALE_CARD_IDS.skipActivation)
  ) {
    let checkRoll = rollAttackDie(state.combat);
    if (
      checkRoll === 1 &&
      playerHoldsMoraleCard(state, activeUnit.controllerId, MORALE_CARD_IDS.rerollPlusOne)
    ) {
      consumeHeldMoraleCard(state, activeUnit.controllerId, MORALE_CARD_IDS.rerollPlusOne);
      checkRoll = rollAttackDie(state.combat);
    }
    const skips = checkRoll === -1;
    appendEvent(state, {
      type: "UNIT_ABILITY_TRIGGERED",
      unitId: activeUnit.id,
      abilityId: "morale-skip-activation-check",
      message: `${activeUnit.cardName} checks Negative Morale before activating and rolls ${
        checkRoll > 0 ? `+${checkRoll}` : checkRoll
      }${skips ? " — the activation is skipped" : ""}.`
    });
    if (skips) {
      consumeHeldMoraleCard(state, activeUnit.controllerId, MORALE_CARD_IDS.skipActivation);
      activeUnit.activatedThisRound = true;
      appendExpiredEffectEvents(state, expireEffectsForActivationEnd(state, activeUnit.id), "activation-ended");
      appendEvent(state, {
        type: "UNIT_ACTIVATION_ENDED",
        playerId: activeUnit.controllerId,
        unitId: activeUnit.id
      });
      advanceActiveUnit(state);
      return;
    }
  }

  state.activePlayerId = activeUnit.controllerId;
  activeUnit.movedThisActivation = false;
  activeUnit.attackedThisActivation = false;
  activeUnit.attacksThisActivation = 0;
  // A fresh activation may open one pre-activation reaction pause for the
  // opposing side (resolved once, then this guards against re-opening it after
  // the reacting player casts/plays during the pause).
  activeUnit.reactionPauseAcked = false;
  activeUnit.preActivationWindowOffered = false;
  // Remember where the unit started this activation (Harpy fly-back) and reset
  // the once-per-activation "[activation]" choice flag (Enchanters/Faeries).
  activeUnit.activationStartPosition = activeUnit.position;
  activeUnit.activationAbilityDone = false;

  if (activeUnit.defenseToken) {
    activeUnit.defenseToken = false;
  }

  appendEvent(state, {
    type: "UNIT_ACTIVATION_STARTED",
    unitId: activeUnit.id,
    playerId: activeUnit.controllerId
  });

  // Fortress Wyverns' poison: a faction cube is removed for 1 damage at the
  // beginning of the unit's activation. A lethal cube ends the activation right
  // away (and may end the combat) — advance to the next unit.
  if (applyPoisonCubesAtActivation(state, activeUnit)) {
    if (finishCombatIfNeeded(state)) {
      return;
    }
    activeUnit.activatedThisRound = true;
    appendExpiredEffectEvents(state, expireEffectsForActivationEnd(state, activeUnit.id), "activation-ended");
    appendEvent(state, {
      type: "UNIT_ACTIVATION_ENDED",
      playerId: activeUnit.controllerId,
      unitId: activeUnit.id
    });
    advanceActiveUnit(state);
    return;
  }

  // A Fire Wall the unit is standing on burns it as its turn opens (the Hell
  // Steed's Fire Wall lands on the target's own space and only bites here). A
  // lethal burn ends the activation at once and may end the combat.
  if (applyFireWallAtActivation(state, activeUnit)) {
    if (finishCombatIfNeeded(state)) {
      return;
    }
    activeUnit.activatedThisRound = true;
    appendExpiredEffectEvents(state, expireEffectsForActivationEnd(state, activeUnit.id), "activation-ended");
    appendEvent(state, {
      type: "UNIT_ACTIVATION_ENDED",
      playerId: activeUnit.controllerId,
      unitId: activeUnit.id
    });
    advanceActiveUnit(state);
    return;
  }

  // Yetis ("recover from negative effects in one round"): shake off negative
  // ongoing effects and Weakness/Corrosion tokens as the unit's turn opens.
  clearOwnDebuffsAtActivation(state, activeUnit);
  // Auto-resolving "[activation]" abilities fire as the unit's turn opens:
  // Wraith/Troll regeneration, Ghost Dragon morale drain and the Wraith-pack
  // enemy hand discard. A paralysed unit (handled above) never reaches here.
  applyActivationStartAbilities(state, activeUnit);
}

/**
 * Applies the auto-resolving "[activation]" abilities of the unit whose turn
 * just began: self-regeneration, discarding the enemy's positive morale token,
 * and the random enemy-hand discard. All resolve without player input.
 */
function clearOwnDebuffsAtActivation(state: GameState, unit: CombatUnitState): void {
  if (!hasUnitAbilityEffect(unit, "CLEAR_OWN_DEBUFFS_ON_ACTIVATION")) {
    return;
  }
  // Recover from every negative ongoing effect placed on this unit...
  removeEffectsFromTarget(
    state,
    { type: "unit", unitId: unit.id, controllerId: unit.controllerId },
    { type: "unit", unitId: unit.id },
    "negative"
  );
  // ...and shake off the negative combat tokens (Weakness / Corrosion).
  for (const kind of ["weakness", "corrosion"] as const) {
    while (hasToken(unit, kind)) {
      removeToken(state, unit, kind, "dispelled");
    }
  }
}

function applyActivationStartAbilities(state: GameState, unit: CombatUnitState): void {
  const combat = state.combat;
  if (!combat) {
    return;
  }

  // Factory Couatls: the activated invulnerability lasts "until its next
  // activation" — so it ends the instant this unit begins that next activation.
  if (unit.invulnerableUntilActivation) {
    unit.invulnerableUntilActivation = false;
    appendEvent(state, {
      type: "UNIT_ABILITY_TRIGGERED",
      unitId: unit.id,
      abilityId: getInvulnerabilityActivation(unit)?.abilityId ?? "couatl-invulnerability",
      targetUnitId: unit.id,
      message: `${unit.cardName}'s invulnerability fades as it activates.`
    });
  }

  const enemyId =
    unit.controllerId === combat.attackerPlayerId ? combat.defenderPlayerId : combat.attackerPlayerId;

  for (const ability of getActivationAbilities(unit)) {
    if (ability.kind === "heal-self") {
      if (unit.damage <= 0) {
        continue;
      }
      const healed = Math.min(ability.amount, unit.damage);
      unit.damage = Math.max(0, unit.damage - ability.amount);
      // Fire the ability event BEFORE the heal so the FX layer can draw the
      // regeneration cue (abilityFxPlans[ability.abilityId]) — Wraith/Troll
      // Regeneration otherwise floated a silent "+N". (A card-sourced heal uses
      // healFxPlans; this unit-sourced one needs the ability event to animate.)
      appendEvent(state, {
        type: "UNIT_ABILITY_TRIGGERED",
        unitId: unit.id,
        abilityId: ability.abilityId,
        targetUnitId: unit.id,
        message: `${unit.name} regenerates ${healed} damage.`
      });
      appendEvent(state, {
        type: "DAMAGE_HEALED",
        source: { type: "unit", unitId: unit.id, controllerId: unit.controllerId },
        target: { type: "unit", unitId: unit.id },
        amount: healed
      });
      continue;
    }

    if (ability.kind === "discard-enemy-morale") {
      const enemy = state.players[enemyId];
      if (!enemy || enemy.morale <= 0) {
        continue;
      }
      enemy.morale = 0;
      appendEvent(state, { type: "MORALE_CHANGED", playerId: enemyId, amount: -1, total: 0 });
      appendEvent(state, {
        type: "UNIT_ABILITY_TRIGGERED",
        unitId: unit.id,
        abilityId: ability.abilityId,
        message: `${unit.name} discards the enemy's positive morale token.`
      });
      continue;
    }

    if (ability.kind === "discard-enemy-card") {
      for (let index = 0; index < ability.amount; index += 1) {
        if (!discardRandomCardFromHand(state, enemyId)) {
          break;
        }
      }
      appendEvent(state, {
        type: "UNIT_ABILITY_TRIGGERED",
        unitId: unit.id,
        abilityId: ability.abilityId,
        message: `${unit.name} drains a card from the enemy's hand.`
      });
      continue;
    }
  }
}

/**
 * Hands the activation slot to the next unit. When several of the acting side's
 * units are tied for that slot (same effective initiative), a human is prompted
 * to choose which goes first. A real player breaks the tie among their own
 * units; the Neutral army cannot answer a prompt, so the player operating the
 * fight (the attacker — the player is always the attacker against guards) breaks
 * it on Neutral's behalf, exactly as the attacker already breaks a Neutral
 * unit's TARGET ties. Cross-side ties are resolved by getActivationStep
 * (alternating, attacker-first), so this only ever prompts for one side at once.
 */
function advanceActiveUnit(state: GameState): void {
  const combat = state.combat;
  if (!combat) {
    return;
  }

  const step = getActivationStep(combat, state.activeEffects);
  if (step && step.candidates.length >= 2) {
    const chooser = step.side === NEUTRAL_PLAYER_ID ? combat.attackerPlayerId : step.side;
    if (chooser === NEUTRAL_PLAYER_ID) {
      // No human operates this tied side (cannot happen in a normal fight — a
      // Neutral combat's attacker is always the player). Fall back to the
      // deterministic first pick so activation can never softlock on a prompt
      // nobody can answer.
      setActiveUnit(state, step.candidates[0]?.id ?? null);
      return;
    }
    // Clear the just-finished unit so nothing reads it as still active while the
    // order choice is open.
    combat.activeUnitId = null;
    openActivationOrderChoice(state, chooser, step.candidates);
    return;
  }

  setActiveUnit(state, step?.candidates[0]?.id ?? null);
}

/**
 * "Steal the turn": a just-applied Initiative buff (Prayer's +initiative arm,
 * cast off-turn as an instant before the enemy unit moves) can vault a friendly
 * unit ahead of the enemy unit that was about to act. If the pending active unit
 * belongs to the OTHER player and has not yet begun its activation, and some
 * still-to-act unit now strictly out-paces it on effective Initiative, re-derive
 * the activation slot from the normal order (advanceActiveUnit) — the faster unit
 * takes the turn now and the pre-empted unit simply resumes in Initiative order
 * later, exactly like Bowstring of the Unicorn's Mane's out-of-order activation.
 *
 * Scoped to an enemy's fresh, not-yet-started activation: it never interrupts the
 * caster's own active unit (an on-turn buff just sets up later ordering), and a
 * unit already mid-move/attack keeps its turn. A tie does NOT steal — the buff
 * must make the unit STRICTLY faster, matching "make your unit faster to cut in".
 */
function maybeStealActivationAfterInitiativeShift(state: GameState, casterId: PlayerId): void {
  const combat = state.combat;
  if (!combat || combat.outcome || combat.setup) {
    return;
  }
  const active = combat.activeUnitId ? combat.units[combat.activeUnitId] : undefined;
  if (
    !active ||
    !isUnitAlive(active) ||
    active.controllerId === casterId ||
    active.activatedThisRound ||
    active.movedThisActivation ||
    active.attackedThisActivation ||
    (active.attacksThisActivation ?? 0) > 0
  ) {
    return;
  }
  const activeInitiative = effectiveInitiative(active, state.activeEffects);
  const fasterFreshUnitExists = Object.values(combat.units).some(
    (unit) =>
      unit.id !== active.id &&
      isUnitAlive(unit) &&
      !unit.activatedThisRound &&
      effectiveInitiative(unit, state.activeEffects) > activeInitiative
  );
  if (!fasterFreshUnitExists) {
    return;
  }
  // The about-to-act unit is still flagged not-activated, so advanceActiveUnit
  // re-picks the genuine fastest eligible unit (now the buffed one) and leaves
  // the pre-empted unit to come up again later in the round.
  advanceActiveUnit(state);
}

/**
 * Opens the "which of your tied units goes first" choice. Index-aligned with
 * `candidates`; resolveActivationOrderChoice makes the picked unit active.
 */
function openActivationOrderChoice(state: GameState, playerId: PlayerId, candidates: CombatUnitState[]): void {
  const choiceId = `choice_${nextEventNumber(state)}`;
  const side = candidates[0].controllerId;
  const neutralPick = side === NEUTRAL_PLAYER_ID;
  state.pendingChoice = {
    id: choiceId,
    type: "OPTION_CHOICE",
    playerId,
    prompt: neutralPick
      ? "Several Neutral units share the same speed — choose which one activates first."
      : "Several of your units share the same speed — choose which activates first.",
    options: candidates.map((unit) => ({
      label: `Activate ${unit.cardName} (${getBattlefieldLabel(unit.position)})`
    })),
    context: "combat-activation-order",
    activationOrder: { unitIds: candidates.map((unit) => unit.id), side },
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
    message: `${state.players[playerId]?.name ?? playerId} chooses which tied unit activates first.`
  });
}

/** Resolves the tied-activation pick: the chosen unit becomes active. */
function resolveActivationOrderChoice(
  state: GameState,
  action: Extract<GameAction, { type: "CHOOSE_OPTION" }>
): void {
  const choice = state.pendingChoice;
  if (
    !choice ||
    choice.type !== "OPTION_CHOICE" ||
    choice.context !== "combat-activation-order" ||
    choice.id !== action.choiceId ||
    choice.playerId !== action.playerId ||
    !choice.activationOrder
  ) {
    throw new Error("There is no activation-order choice to resolve.");
  }

  const combat = state.combat;
  const unitId = choice.activationOrder.unitIds[action.optionIndex];
  const unit = combat ? combat.units[unitId] : undefined;
  // The pick must still be eligible and belong to the side the tie was opened
  // for. The chooser is that side's controller for a real player, but for the
  // Neutral army it is the attacker breaking Neutral's tie — so validate against
  // the stored `side`, not the answering player (already gated above to the
  // choice's playerId).
  if (
    !combat ||
    !unit ||
    !isUnitAlive(unit) ||
    unit.activatedThisRound ||
    unit.controllerId !== choice.activationOrder.side
  ) {
    throw new Error("That unit can no longer take the first activation.");
  }

  state.pendingChoice = null;
  state.phase = "combat";
  state.priorityPlayerId = null;
  appendEvent(state, {
    type: "PENDING_CHOICE_RESOLVED",
    choiceId: choice.id,
    playerId: action.playerId,
    selectedIndex: action.optionIndex
  });

  setActiveUnit(state, unit.id);
}

/**
 * Sorrow: end the active unit's turn before it acts. Mirrors the paralysis
 * skip — mark it activated, expire its activation-bound effects, log the end,
 * and advance to the next unit.
 */
function skipUnitActivation(state: GameState, unit: CombatUnitState): void {
  const combat = state.combat;
  if (!combat || combat.activeUnitId !== unit.id) {
    return;
  }

  unit.activatedThisRound = true;
  appendExpiredEffectEvents(state, expireEffectsForActivationEnd(state, unit.id), "activation-ended");
  appendEvent(state, {
    type: "UNIT_ACTIVATION_ENDED",
    playerId: unit.controllerId,
    unitId: unit.id
  });
  advanceActiveUnit(state);
}

/**
 * Resolves the current combat pause so the fight resumes. Only the player who
 * holds the pause (the reacting side) clicks it on; the pump in
 * runAdventureAutomations picks the activation back up afterwards:
 *
 *  - "pre-activation": the reacting side is done casting/reacting — mark the
 *    unit so the pump runs its activation (a guard acts; a player-vs-player
 *    unit is handed back to its controller) instead of re-opening the pause.
 *  - "guard-walk": the table clicked the guard's walk on — advance to the next
 *    unit (the walking guard's activation already ended).
 */
function continueNeutralStep(
  state: GameState,
  action: Extract<GameAction, { type: "CONTINUE_NEUTRAL_STEP" }>
): void {
  const combat = state.combat;
  const pause = combat?.pendingNeutralStep;
  if (!combat || !pause) {
    throw new Error("No combat pause is waiting to continue.");
  }
  const reactor = pause.reactingPlayerId ?? combat.attackerPlayerId;
  if (action.playerId !== reactor) {
    throw new Error("Only the reacting player can continue the combat.");
  }

  if (pause.kind === "pre-activation") {
    const unit = combat.units[pause.unitId];
    if (unit) {
      unit.reactionPauseAcked = true;
    }
    combat.pendingNeutralStep = null;
    // Leave activeUnitId as-is: the pump runs the guard's activation, or hands
    // a player-vs-player unit back to its controller to drive.
    return;
  }

  combat.pendingNeutralStep = null;
  advanceActiveUnit(state);
}

/** Living friendly units the Enchanters could heal (other friendlies only). */
function enchanterHealCandidates(
  combat: CombatState,
  unit: CombatUnitState,
  ability?: { adjacentOnly?: boolean; targetTrait?: "mechanical" }
): CombatUnitState[] {
  return Object.values(combat.units).filter(
    (candidate) =>
      candidate.id !== unit.id &&
      candidate.controllerId === unit.controllerId &&
      isUnitAlive(candidate) &&
      candidate.damage > 0 &&
      // Factory Mechanics: only ADJACENT + mechanical units can be repaired.
      // Enchanters leave both filters unset, so any wounded ally qualifies.
      (!ability?.adjacentOnly || isAdjacent(unit.position, candidate.position)) &&
      (ability?.targetTrait !== "mechanical" || isMechanicalUnit(candidate))
  );
}

/** Enchanters: gain +N Attack for the rest of this combat round (self-buff). */
function applyEnchanterBuffSelf(
  state: GameState,
  unit: CombatUnitState,
  ability: { abilityId: string; abilityName: string; attackBonus: number }
): void {
  // Factory Mechanics FEW have no "+Attack" fallback (attackBonus 0): with no
  // adjacent mechanical unit to repair, the activation ability simply does nothing.
  if (ability.attackBonus <= 0) {
    return;
  }
  createActiveEffect(
    state,
    {
      name: ability.abilityName,
      scope: "unit",
      duration: { type: "current-combat-round" },
      polarity: "positive",
      removable: true,
      modifiers: [{ type: "ATTACK_BONUS", amount: ability.attackBonus }]
    },
    { type: "unit", unitId: unit.id, controllerId: unit.controllerId },
    unit.controllerId,
    { type: "unit", unitId: unit.id }
  );
  appendEvent(state, {
    type: "UNIT_ABILITY_TRIGGERED",
    unitId: unit.id,
    abilityId: ability.abilityId,
    targetUnitId: unit.id,
    message: `${unit.name} gains +${ability.attackBonus} Attack from ${ability.abilityName}.`
  });
}

/** Enchanters: remove up to N damage from a chosen friendly unit. */
function applyEnchanterHeal(
  state: GameState,
  unit: CombatUnitState,
  target: CombatUnitState,
  ability: { abilityId: string; abilityName: string; healAmount: number }
): void {
  healUnitDamage(
    state,
    { type: "unit", unitId: unit.id, controllerId: unit.controllerId },
    { type: "unit", unitId: target.id },
    ability.healAmount
  );
  appendEvent(state, {
    type: "UNIT_ABILITY_TRIGGERED",
    unitId: unit.id,
    abilityId: ability.abilityId,
    targetUnitId: target.id,
    message: `${unit.name} heals ${target.cardName} with ${ability.abilityName}.`
  });
}

/**
 * Faerie Dragons' activation damage-spell: flat spell damage to the chosen
 * unit (not reduced by defense). Fires the Ice Bolt ability event for the FX,
 * then the damage event, and finalizes a kill / the combat if it lands lethal.
 */
function applyActivationDamageSpell(
  state: GameState,
  unit: CombatUnitState,
  target: CombatUnitState,
  ability: { abilityId: string; abilityName: string; amount: number }
): void {
  // The Faerie Bolt is spell DAMAGE, so the golems' / Unicorns' "reduce any
  // damage from spells" passives soften it (reducedSpellDamage). It is NOT a
  // Spell CARD, so — by deliberate design — spell-school IMMUNITY does not turn
  // it aside: IMMUNE_TO_SPELL_SCHOOLS is scoped to "any Spell card whose school
  // …", and the bolt has no card and no school. Hence a unit "Immune to all
  // Spells" (Azure/Black Dragons) is still a legal target and still takes the
  // bolt (only reduced if it also reduces spell damage), unlike a real cast,
  // which excludes immune units at targeting. This split is intentional; do not
  // add a unitImmuneToSpellSchools gate here without a confirmed ruling.
  // A Factory Couatl with its invulnerability up "ignores all damage" — that
  // DAMAGE ward (distinct from spell-school immunity above) does turn the bolt
  // aside.
  if (isUnitDamageImmune(target)) {
    appendEvent(state, {
      type: "UNIT_ABILITY_TRIGGERED",
      unitId: target.id,
      abilityId: getInvulnerabilityActivation(target)?.abilityId ?? "couatl-invulnerability",
      targetUnitId: target.id,
      message: `${target.cardName} is invulnerable and ignores ${ability.abilityName}.`
    });
    return;
  }
  const dealt = reducedSpellDamage(state, target, ability.amount);
  appendEvent(state, {
    type: "UNIT_ABILITY_TRIGGERED",
    unitId: unit.id,
    abilityId: ability.abilityId,
    targetUnitId: target.id,
    message: `${unit.name} casts ${ability.abilityName} at ${target.cardName} for ${dealt} damage.`
  });
  target.damage += dealt;
  noteUnitDamagedForTokens(state, target, dealt);
  appendEvent(state, {
    type: "DAMAGE_ASSIGNED",
    source: { type: "unit", unitId: unit.id, controllerId: unit.controllerId },
    target: { type: "unit", unitId: target.id },
    amount: dealt,
    damageKind: "spell"
  });
  markUnitRemovedIfNeeded(state, target);
  finishCombatIfNeeded(state);
}

/**
 * Auto-resolves a neutral unit's "[activation]" choice ability before it acts:
 * a neutral Enchanter always takes the +1 Attack; a neutral Faerie Dragon zaps
 * the unit it would attack (normal target priority). Returns true when it did
 * something, so the caller can re-check for a finished combat.
 */
function applyNeutralActivationAbility(state: GameState, unit: CombatUnitState): boolean {
  const combat = state.combat;
  if (!combat) {
    return false;
  }

  const enchant = getEnchanterActivationAbility(unit);
  if (enchant) {
    // Wiki Note: "If possible, the healing effect has to be chosen. The healing
    // effect can not be skipped in favor of +1 Attack." A neutral Enchanter
    // therefore heals its most-wounded OTHER ally when one exists, and only
    // buffs its own Attack when there is nothing to heal.
    const candidates = enchanterHealCandidates(combat, unit, enchant);
    if (candidates.length > 0) {
      const target = candidates.reduce((best, candidate) =>
        candidate.damage > best.damage ? candidate : best
      );
      applyEnchanterHeal(state, unit, target, enchant);
    } else {
      applyEnchanterBuffSelf(state, unit, enchant);
    }
    return true;
  }

  const faerie = getActivationDamageSpellAbility(unit);
  if (faerie) {
    const target = pickNeutralTarget(combat, unit);
    if (target) {
      applyActivationDamageSpell(state, unit, target, faerie);
    }
    return true;
  }

  return false;
}

/**
 * Opens a player-controlled unit's "[activation]" choice when its turn comes
 * up (before it acts): Enchanters pick heal-a-friendly vs +1 Attack, Faerie
 * Dragons pick the unit their Ice Bolt hits. Trivial cases (no friendly to
 * heal, no enemy to zap) resolve automatically without a prompt. Called at the
 * end of every action so it never collides with reaction windows, war-machine
 * round-starts or the neutral pump.
 */
function maybeOpenPlayerActivationChoice(state: GameState): void {
  const combat = state.combat;
  if (
    !combat ||
    combat.outcome ||
    combat.setup ||
    combat.awaitingContinue ||
    state.pendingChoice ||
    state.reactionWindow ||
    state.stack.length > 0
  ) {
    return;
  }

  const unitId = combat.activeUnitId;
  const unit = unitId ? combat.units[unitId] : undefined;
  if (
    !unit ||
    !isUnitAlive(unit) ||
    isNeutralUnit(unit) ||
    unit.activatedThisRound ||
    unit.activationAbilityDone ||
    unit.movedThisActivation ||
    unit.attackedThisActivation
  ) {
    return;
  }

  // Jotunn Warlord (Bulwark, house rule): at the start of its activation the
  // controller may teleport one of its OTHER OWN units — a friendly unit, never
  // itself and never an enemy — to an empty space, optionally, then act as
  // normal. Offer the "pick a unit" choice (chooseAbilityTarget resolves it into
  // the empty-space picker via openTeleportChoice). With no empty space to land
  // on, or no other friendly unit to move, there is nothing to do, so the
  // ability is simply marked done.
  const teleportAbility = getUnitAbilityDefinitions(unit).find(
    (def) => def.effect?.type === "TELEPORT_ANY_AT_ACTIVATION"
  );
  if (teleportAbility) {
    let hasEmptySpace = false;
    for (let position = 0; position < BATTLEFIELD_CELL_COUNT; position += 1) {
      if (!isSpaceBlockedForSummon(combat, position)) {
        hasEmptySpace = true;
        break;
      }
    }
    const candidates = Object.values(combat.units).filter(
      (candidate) =>
        isUnitAlive(candidate) && candidate.controllerId === unit.controllerId && candidate.id !== unit.id
    );
    if (!hasEmptySpace || candidates.length === 0) {
      unit.activationAbilityDone = true;
      return;
    }
    const choiceId = `choice_${nextEventNumber(state)}`;
    state.pendingChoice = {
      id: choiceId,
      type: "ABILITY_TARGET_CHOICE",
      playerId: unit.controllerId,
      kind: "jotunn-teleport",
      abilityId: teleportAbility.id,
      abilityName: teleportAbility.name,
      prompt: `${unit.cardName}: ${teleportAbility.name} — choose one of your other units to teleport, or skip.`,
      sourceUnitId: unit.id,
      anchorUnitId: null,
      candidateUnitIds: candidates.map((candidate) => candidate.id),
      optional: true,
      skipLabel: "Don't teleport"
    };
    state.phase = "choice";
    state.priorityPlayerId = unit.controllerId;
    appendEvent(state, {
      type: "PENDING_CHOICE_CREATED",
      choiceId,
      choiceType: "ABILITY_TARGET_CHOICE",
      playerId: unit.controllerId,
      sourceEffectIds: [],
      message: `${unit.cardName} may teleport a unit to an empty space.`
    });
    return;
  }

  const enchant = getEnchanterActivationAbility(unit);
  if (enchant) {
    const candidates = enchanterHealCandidates(combat, unit, enchant);
    if (candidates.length === 0) {
      // Nothing to heal: the only meaningful outcome is the self Attack buff.
      applyEnchanterBuffSelf(state, unit, enchant);
      unit.activationAbilityDone = true;
      return;
    }
    const choiceId = `choice_${nextEventNumber(state)}`;
    state.pendingChoice = {
      id: choiceId,
      type: "ABILITY_TARGET_CHOICE",
      playerId: unit.controllerId,
      kind: "enchanter-activation",
      abilityId: enchant.abilityId,
      abilityName: enchant.abilityName,
      // Wiki Note: "If possible, the healing effect has to be chosen. The
      // healing effect can not be skipped in favor of +1 Attack." So while a
      // wounded other ally exists the heal is MANDATORY — the player only picks
      // WHICH ally (no skip-to-buff). The +Attack fallback fires only on the
      // candidates.length === 0 branch above.
      // Factory Mechanics repair an adjacent MECHANICAL unit; Enchanters heal any
      // friendly. The noun and the "or gain +N Attack" tail vary accordingly.
      prompt:
        enchant.targetTrait === "mechanical"
          ? `${unit.cardName}: ${enchant.abilityName} — repair an adjacent mechanical unit (up to ${enchant.healAmount} damage).`
          : `${unit.cardName}: ${enchant.abilityName} — heal a friendly unit (up to ${enchant.healAmount} damage).`,
      sourceUnitId: unit.id,
      anchorUnitId: null,
      candidateUnitIds: candidates.map((candidate) => candidate.id),
      optional: false
    };
    state.phase = "choice";
    state.priorityPlayerId = unit.controllerId;
    const targetNoun = enchant.targetTrait === "mechanical" ? "repair an adjacent mechanical unit" : "heal a friendly unit";
    appendEvent(state, {
      type: "PENDING_CHOICE_CREATED",
      choiceId,
      choiceType: "ABILITY_TARGET_CHOICE",
      playerId: unit.controllerId,
      sourceEffectIds: [],
      message:
        enchant.attackBonus > 0
          ? `${unit.cardName} chooses: ${targetNoun} or gain +${enchant.attackBonus} Attack.`
          : `${unit.cardName}: ${targetNoun}.`
    });
    return;
  }

  const faerie = getActivationDamageSpellAbility(unit);
  if (faerie) {
    // Any living enemy is a legal target — spell-school immunity is deliberately
    // NOT filtered here (see applyActivationDamageSpell: the bolt is spell
    // damage, not a Spell card).
    const targets = Object.values(combat.units).filter(
      (candidate) => candidate.controllerId !== unit.controllerId && isUnitAlive(candidate)
    );
    if (targets.length === 0) {
      // No enemy in range of the spell: the activation ability does nothing.
      unit.activationAbilityDone = true;
      return;
    }
    const choiceId = `choice_${nextEventNumber(state)}`;
    state.pendingChoice = {
      id: choiceId,
      type: "ABILITY_TARGET_CHOICE",
      playerId: unit.controllerId,
      kind: "faerie-damage",
      abilityId: faerie.abilityId,
      abilityName: faerie.abilityName,
      prompt: `${unit.cardName}: ${faerie.abilityName} — choose a unit to suffer ${faerie.amount} damage.`,
      sourceUnitId: unit.id,
      anchorUnitId: null,
      candidateUnitIds: targets.map((candidate) => candidate.id),
      amount: faerie.amount
    };
    state.phase = "choice";
    state.priorityPlayerId = unit.controllerId;
    appendEvent(state, {
      type: "PENDING_CHOICE_CREATED",
      choiceId,
      choiceType: "ABILITY_TARGET_CHOICE",
      playerId: unit.controllerId,
      sourceEffectIds: [],
      message: `${unit.cardName} chooses a target for ${faerie.abilityName}.`
    });
    return;
  }

  // Factory Couatls: "[activation] Once per Combat. Until its next activation,
  // this unit ignores all damage and spell effects." Offered as an optional
  // yes/no at the start of the activation. The Few's activation of it ends the
  // turn; the Pack's is free (resolved in chooseAbilityTarget).
  const couatlWard = getInvulnerabilityActivation(unit);
  if (couatlWard && !unit.usedInvulnerabilityThisCombat) {
    const choiceId = `choice_${nextEventNumber(state)}`;
    state.pendingChoice = {
      id: choiceId,
      type: "ABILITY_TARGET_CHOICE",
      playerId: unit.controllerId,
      kind: "couatl-invulnerability",
      abilityId: couatlWard.abilityId,
      abilityName: couatlWard.abilityName,
      prompt: couatlWard.endsActivation
        ? `${unit.cardName}: ${couatlWard.abilityName} — become invulnerable until your next activation (this is your action for the turn), or skip.`
        : `${unit.cardName}: ${couatlWard.abilityName} — become invulnerable until your next activation (free; you may still move and attack), or skip.`,
      sourceUnitId: unit.id,
      anchorUnitId: null,
      candidateUnitIds: [unit.id],
      optional: true,
      skipLabel: "Don't activate"
    };
    state.phase = "choice";
    state.priorityPlayerId = unit.controllerId;
    appendEvent(state, {
      type: "PENDING_CHOICE_CREATED",
      choiceId,
      choiceType: "ABILITY_TARGET_CHOICE",
      playerId: unit.controllerId,
      sourceEffectIds: [],
      message: `${unit.cardName} may become invulnerable this round.`
    });
    return;
  }

  // Factory Automaton (Few): "[activation] You may place a faction cube on this
  // unit (up to N)." An optional, free (does not end the turn) cube deposit; the
  // banked cubes drive its cube-scaled Detonate on removal.
  const cubeAbility = getPlaceFactionCubeActivation(unit);
  if (cubeAbility && (unit.factionCubes ?? 0) < cubeAbility.maxCubes) {
    const choiceId = `choice_${nextEventNumber(state)}`;
    state.pendingChoice = {
      id: choiceId,
      type: "ABILITY_TARGET_CHOICE",
      playerId: unit.controllerId,
      kind: "automaton-cube",
      abilityId: cubeAbility.abilityId,
      abilityName: cubeAbility.abilityName,
      prompt: `${unit.cardName}: ${cubeAbility.abilityName} — place a faction cube on this unit (now ${unit.factionCubes ?? 0}/${cubeAbility.maxCubes}), or skip.`,
      sourceUnitId: unit.id,
      anchorUnitId: null,
      candidateUnitIds: [unit.id],
      optional: true,
      skipLabel: "Don't place a cube"
    };
    state.phase = "choice";
    state.priorityPlayerId = unit.controllerId;
    appendEvent(state, {
      type: "PENDING_CHOICE_CREATED",
      choiceId,
      choiceType: "ABILITY_TARGET_CHOICE",
      playerId: unit.controllerId,
      sourceEffectIds: [],
      message: `${unit.cardName} may bank a faction cube.`
    });
    return;
  }
}

/** Whether a reaction play resolves to a Sorrow-style activation-skip effect. */
/**
 * Whether a reaction is a pre-activation interrupt — one that resolves in the
 * UNIT_ACTIVATION_STARTED window before the about-to-act unit moves: Sorrow's
 * activation skip, or Bowstring of the Unicorn's Mane activating one of your
 * ranged units out of order. Used to decide whether to open that window.
 */
function reactionIsPreActivationInterrupt(
  cards: CardLibrary,
  action: Extract<GameAction, { type: "PLAY_REACTION" }>
): boolean {
  const card = cards[action.cardId];
  if (!card) {
    return false;
  }
  const effectType = getEffectiveCardEffect(card, action.optionIndex)?.type;
  return effectType === "SKIP_ACTIVATION" || effectType === "ACTIVATE_RANGED_UNIT";
}

/**
 * Pre-activation interrupt window: before a fresh unit acts, open the window
 * Sorrow (skip the about-to-act unit) and Bowstring of the Unicorn's Mane
 * (activate one of your ranged units out of order) share. Centralized like
 * maybeOpenPlayerActivationChoice so it runs once everything else has settled and
 * never clobbers another window. It opens only when at least one such interrupt
 * is actually playable, and is offered once per activation (preActivationWindowOffered,
 * reset when the unit becomes active) — so multiple interrupt cards across both
 * players are handled by the ordinary reaction-window priority/passing, and a
 * resumed or newly-active unit gets a fresh window without ever looping.
 */
function maybeOpenPreActivationWindow(state: GameState, cards: CardLibrary): void {
  const combat = state.combat;
  if (
    !combat ||
    combat.outcome ||
    combat.setup ||
    combat.awaitingContinue ||
    combat.pendingNeutralStep ||
    state.pendingChoice ||
    state.reactionWindow ||
    state.stack.length > 0
  ) {
    return;
  }

  const unitId = combat.activeUnitId;
  const unit = unitId ? combat.units[unitId] : undefined;
  if (
    !unit ||
    !isUnitAlive(unit) ||
    unit.activatedThisRound ||
    unit.preActivationWindowOffered ||
    unit.movedThisActivation ||
    unit.attackedThisActivation
  ) {
    return;
  }

  // Reuse the UNIT_ACTIVATION_STARTED event setActiveUnit already logged for
  // this unit (the most recent one) as the window's trigger.
  const triggerEvent = [...state.eventLog]
    .reverse()
    .find(
      (event): event is Extract<GameEvent, { type: "UNIT_ACTIVATION_STARTED" }> =>
        event.type === "UNIT_ACTIVATION_STARTED" && event.unitId === unit.id
    );
  if (!triggerEvent) {
    return;
  }

  // Offer the window only when a real pre-activation interrupt is available;
  // mark it offered regardless so we do not recompute it every action.
  const legalReactions = getLegalReactionsForTrigger(state, triggerEvent, cards);
  const hasInterrupt = Object.values(legalReactions).some((actions) =>
    actions.some(
      (legal) => legal.action.type === "PLAY_REACTION" && reactionIsPreActivationInterrupt(cards, legal.action)
    )
  );

  unit.preActivationWindowOffered = true;
  if (!hasInterrupt) {
    return;
  }

  openReactionWindowForTrigger(state, null, triggerEvent, cards);
}

function resetCombatRound(combat: CombatState): void {
  for (const unit of Object.values(combat.units)) {
    unit.activatedThisRound = false;
    unit.movedThisActivation = false;
    unit.attackedThisActivation = false;
    unit.attacksThisActivation = 0;
    unit.retaliatedThisRound = false;
    // Defense tokens persist into the next round: they are discarded at the
    // start of the unit's next activation, not at the end of the round.
  }
}

function refreshReactionWindowLegalReactions(state: GameState, cards: CardLibrary): void {
  if (!state.reactionWindow) {
    return;
  }

  const legalReactions = getLegalReactionsForTrigger(state, state.reactionWindow.triggerEvent, cards);
  const allowedPlayerIds = reactionPlayerOrder(state, legalReactions, state.reactionWindow.triggerEvent);

  state.reactionWindow.legalReactions = legalReactions;
  state.reactionWindow.allowedPlayerIds = allowedPlayerIds;
  state.reactionWindow.passedPlayerIds = state.reactionWindow.passedPlayerIds.filter((playerId) =>
    allowedPlayerIds.includes(playerId)
  );

  if (!allowedPlayerIds.includes(state.reactionWindow.priorityPlayerId)) {
    state.reactionWindow.priorityPlayerId = allowedPlayerIds[0] ?? state.reactionWindow.priorityPlayerId;
  }

  state.priorityPlayerId = state.reactionWindow.priorityPlayerId;
}

function openReactionWindowForTrigger(
  state: GameState,
  stackItem: ResolutionStackItem | null,
  triggerEvent: GameEvent,
  cards: CardLibrary
): boolean {
  const legalReactions = getLegalReactionsForTrigger(state, triggerEvent, cards);
  const allowedPlayerIds = reactionPlayerOrder(state, legalReactions, triggerEvent);

  if (allowedPlayerIds.length === 0) {
    return false;
  }

  const windowId = `reaction_${triggerEvent.id}`;
  // The Sorrow activation-skip window has no paused stack item — nothing is
  // mid-resolution. Every other window pauses the spell/attack being reacted to.
  if (stackItem) {
    stackItem.status = "waiting-for-reaction";
  }
  state.reactionWindow = {
    id: windowId,
    triggerEvent,
    allowedPlayerIds,
    priorityPlayerId: allowedPlayerIds[0],
    legalReactions,
    passedPlayerIds: [],
    closesWhen: "all-pass"
  };
  state.priorityPlayerId = allowedPlayerIds[0];
  state.phase = "reaction";

  appendEvent(state, {
    type: "REACTION_WINDOW_OPENED",
    windowId,
    triggerEventId: triggerEvent.id,
    priorityPlayerId: allowedPlayerIds[0],
    allowedPlayerIds
  });

  return true;
}

/**
 * After Magic Mirror reflects an instant off a still-pending attack, reopen that
 * attack's reaction window (found via the parked stack item's UNIT_ATTACK_DECLARED
 * trigger) so both sides may keep responding — the attack itself never resolved.
 * With no one left able to react, resolve the attack instead.
 */
function resumeAttackWindowAfterRedirect(
  state: GameState,
  stackItem: ResolutionStackItem | undefined,
  cards: CardLibrary
): void {
  if (!stackItem || (stackItem.action.type !== "ATTACK_UNIT" && stackItem.action.type !== "MOVE_AND_ATTACK_UNIT")) {
    return;
  }
  const triggerEvent = stackItem.triggerEventIds
    .map((eventId) => state.eventLog.find((event) => event.id === eventId))
    .find((event): event is Extract<GameEvent, { type: "UNIT_ATTACK_DECLARED" }> => event?.type === "UNIT_ATTACK_DECLARED");
  if (!triggerEvent || !openReactionWindowForTrigger(state, stackItem, triggerEvent, cards)) {
    resolveTopStack(state, cards);
  }
}

/**
 * Rampart Pegasi (Pack) "Magic Damper": every living enemy Pegasi shaves Power
 * off the Spells the caster casts. Summed across all opposing auras; the caller
 * floors the resulting Power at 0.
 */
/**
 * Recursively harvest every Power breakpoint a card's effect scales on — the
 * numeric keys of every `*ByPower` table (amountByPower, gradeByPower,
 * durationByPower, damagesByPower, countByPower, …), including those nested in a
 * CHOOSE_ONE's options. Used to find the top Power tier a spell can reach.
 */
function collectPowerBreakpoints(value: unknown, acc: number[]): void {
  if (!value || typeof value !== "object") {
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectPowerBreakpoints(item, acc);
    }
    return;
  }
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (key.endsWith("ByPower") && nested && typeof nested === "object" && !Array.isArray(nested)) {
      for (const breakpoint of Object.keys(nested)) {
        const numeric = Number(breakpoint);
        if (Number.isFinite(numeric)) {
          acc.push(numeric);
        }
      }
    } else {
      collectPowerBreakpoints(nested, acc);
    }
  }
}

/**
 * The highest Power level a spell's effect scales to. The Tome artifacts force a
 * cast to this tier "without paying the Power cost". Spells whose top tier needs
 * Power 4 or 5 (e.g. Animate Dead, Implosion) are honoured, not capped at 2;
 * spells with no Power scaling fall back to the game's standard Expert cap (2).
 */
function spellMaxPowerBreakpoint(card: CardDefinition | undefined): number {
  if (!card) {
    return 0;
  }
  const breakpoints: number[] = [];
  collectPowerBreakpoints(card.effect, breakpoints);
  return breakpoints.length > 0 ? Math.max(...breakpoints) : 2;
}

function getCurrentSpellPower(state: GameState, stackItem: ResolutionStackItem, cards: CardLibrary): number {
  // The cast Power formula lives in ONE place — resolvedSpellPowerForStackItem
  // (legal-actions.ts) — so the live UI readout and the Resistance offer gate,
  // which share that helper, can never disagree with the Power the spell
  // actually resolves at. It applies the printed power, every Power source
  // (Power cards, School of Magic, town cube, Adrienne, Astrologers, Pandora),
  // the Elemental Orb doubling and the enemy Pegasi reduction, floored at 0, and
  // returns 0 for a non-cast stack item or a Power-locked Spell Scroll cast.
  return resolvedSpellPowerForStackItem(state, stackItem, cards);
}

function shouldRetaliate(
  attacker: CombatUnitState,
  defender: CombatUnitState,
  attackKind: "melee" | "ranged",
  /** Ash's Bloodlust VI: this single attack ignores Retaliation Attacks. */
  ignoreRetaliationOverride = false,
  /** When given, the Counterstrike UNLIMITED_RETALIATION effect is honoured. */
  state?: GameState
): boolean {
  return (
    isUnitAlive(attacker) &&
    isUnitAlive(defender) &&
    attackKind === "melee" &&
    isAdjacent(attacker.position, defender.position) &&
    !ignoreRetaliationOverride &&
    !hasUnitAbilityEffect(attacker, "IGNORE_RETALIATION") &&
    (!defender.retaliatedThisRound ||
      hasUnitAbilityEffect(defender, "ALLOW_UNLIMITED_RETALIATION") ||
      (state ? unitHasUnlimitedRetaliationEffect(state, defender) : false))
  );
}

/**
 * Factory Bounty Hunters (Neutral) "Preemptive Shot": whether this attack
 * triggers the defender's pre-emptive Retaliation Attack — fired BEFORE the
 * attacker's blow. Unlike a normal retaliation it needs NO adjacency and no
 * melee attack (it "also retaliates against non-adjacent units"), so any attack
 * on the Bounty Hunter provokes it. Still once per round (the pre-emptive strike
 * spends the retaliation) and still cancelled by the attacker's own
 * ignore-retaliation.
 */
function qualifiesForPreemptiveRetaliation(
  attacker: CombatUnitState,
  defender: CombatUnitState,
  ignoreRetaliationOverride: boolean
): boolean {
  return (
    Boolean(getPreemptiveRetaliation(defender)) &&
    isUnitAlive(attacker) &&
    isUnitAlive(defender) &&
    !ignoreRetaliationOverride &&
    !hasUnitAbilityEffect(attacker, "IGNORE_RETALIATION") &&
    (!defender.retaliatedThisRound || hasUnitAbilityEffect(defender, "ALLOW_UNLIMITED_RETALIATION"))
  );
}

/**
 * Open the reaction windows for a freshly declared attack (or retaliation).
 * Misfortune is "played immediately when the enemy unit is attacking, before
 * other cards", so a dedicated pre-buff window offering ONLY the defender's
 * Misfortune is tried first (misfortunePhase). If the defender holds no playable
 * Misfortune, the normal attack-declared buff window opens instead; the attack
 * resolves straight away when nobody can react at all. Once Misfortune is played
 * or declined the same window object continues as the normal buff window (see
 * the NEGATE_ATTACK handler and the misfortune-phase handling in passReaction).
 */
function openDeclaredAttackWindow(
  state: GameState,
  stackItem: ResolutionStackItem,
  attackDeclared: GameEvent,
  cards: CardLibrary
): void {
  stackItem.modifiers.misfortunePhase = true;
  if (openReactionWindowForTrigger(state, stackItem, attackDeclared, cards)) {
    return;
  }
  // No Misfortune to offer: fall through to the ordinary attack-declared window.
  stackItem.modifiers.misfortunePhase = false;
  if (!openReactionWindowForTrigger(state, stackItem, attackDeclared, cards)) {
    resolveTopStack(state, cards);
  }
}

function openRetaliationWindow(
  state: GameState,
  attacker: CombatUnitState,
  defender: CombatUnitState,
  cards: CardLibrary,
  /** Factory Bounty Hunters' Preemptive Shot: this retaliation fires BEFORE the
   *  attacker's blow, so its resolution resumes the parked original attack. */
  preemptive = false
): void {
  if (!state.combat) {
    return;
  }

  appendEvent(state, {
    type: "RETALIATION_ATTACKED",
    attackerId: defender.id,
    defenderId: attacker.id
  });

  const retaliationAction: Extract<GameAction, { type: "ATTACK_UNIT" }> = {
    type: "ATTACK_UNIT",
    playerId: defender.controllerId,
    attackerId: defender.id,
    defenderId: attacker.id
  };
  const stackItem = makeStackItem(state, retaliationAction);
  if (preemptive) {
    stackItem.modifiers.isPreemptiveRetaliation = true;
  }
  // A Magic-Mirror-bounced Curse/Weakness from the original attack applies to its
  // retaliation too (e.g. the bounced Curse lowers the now-defending attacker's
  // Defense as your unit strikes back). One-shot, gone when this stack item pops.
  const redirectedInstants = state.combat.attackSequence?.redirectedInstants;
  if (redirectedInstants && redirectedInstants.length > 0) {
    stackItem.modifiers.redirectedInstants = redirectedInstants;
  }
  state.stack.push(stackItem);

  const attackKind = getAttackKind(defender, attacker);
  // Necropolis Dread Knights (Few): the unit being retaliated against forces
  // the Retaliation Attack to roll 2 dice and resolve the lower result. Lord
  // Haart (Necropolis) Dread Knights IV grants the same disadvantage as a
  // lasting effect on whichever unit he buffed.
  const rollMode =
    hasRetaliationAgainstDisadvantage(attacker) || hasActiveRetaliationDisadvantage(state, attacker)
      ? "disadvantage"
      : // This is the defender's Retaliation Attack, so the "[unit_attack] Ignore
        // the combat penalties" waiver does NOT apply — a retaliating ranged unit
        // that hits its adjacent attacker takes the melee penalty like any other.
        getAttackRollMode(defender, attacker, state, true);
  const attackDeclared = appendEvent(state, {
    type: "UNIT_ATTACK_DECLARED",
    playerId: defender.controllerId,
    attackerId: defender.id,
    defenderId: attacker.id,
    isRetaliation: true,
    attackKind,
    rollMode
  });
  stackItem.triggerEventIds.push(attackDeclared.id);

  openDeclaredAttackWindow(state, stackItem, attackDeclared, cards);
}

/**
 * Shield of the Dwarven Lords: once the Attack die has been rolled (and any
 * rerolls resolved), give the defender one window to ignore it before the hit
 * lands. The rolled candidate is stashed so the resumed attack reuses it; if no
 * defender can play a die-cancel reaction the attack finishes straight away.
 */
function resolveAttackOrOfferDieCancel(
  state: GameState,
  stackItem: ResolutionStackItem,
  details: NonNullable<ReturnType<typeof getAttackStackDetails>>,
  candidate: AttackRollCandidate,
  cards: CardLibrary
): void {
  if (!stackItem.modifiers.dieCancelOffered && !stackItem.modifiers.attackDieCancelled) {
    const probe: GameEvent = {
      id: "die-settled-probe",
      type: "ATTACK_DIE_SETTLED",
      attackerId: details.attacker.id,
      defenderId: details.defender.id,
      roll: candidate.roll
    };
    const reactions = getLegalReactionsForTrigger(state, probe, cards);
    if (reactionPlayerOrder(state, reactions).length > 0) {
      stackItem.modifiers.rolledCandidate = candidate;
      stackItem.modifiers.dieCancelOffered = true;
      const settled = appendEvent(state, {
        type: "ATTACK_DIE_SETTLED",
        attackerId: details.attacker.id,
        defenderId: details.defender.id,
        roll: candidate.roll
      });
      if (openReactionWindowForTrigger(state, stackItem, settled, cards)) {
        return;
      }
      // No window actually opened (defender lost the option in a race): clear
      // the resume marker and fall through to resolve normally.
      stackItem.modifiers.rolledCandidate = undefined;
    }
  }

  finishResolvedAttack(state, stackItem, details, candidate, cards);
}

function resolveAttackStackItem(state: GameState, stackItem: ResolutionStackItem, cards: CardLibrary): void {
  const combat = state.combat;
  const details = getAttackStackDetails(state, stackItem);
  if (!combat || !details) {
    return;
  }

  // Factory Bounty Hunters' Preemptive Shot: before this attack's blow lands,
  // spin off the defender's Retaliation Attack (once, and only for a fresh
  // player/AI attack — never a retaliation or a printed follow-up). This attack
  // parks on the stack; its resolution resumes after the pre-emptive strike
  // (finishResolvedAttack's isPreemptiveRetaliation branch), which may also
  // cancel it if the counter fells the attacker.
  if (
    !details.isRetaliation &&
    !details.abilityAttack &&
    !stackItem.modifiers.preemptiveRetaliationTriggered &&
    qualifiesForPreemptiveRetaliation(
      details.attacker,
      details.defender,
      Boolean(stackItem.modifiers.ignoresRetaliationThisAttack)
    )
  ) {
    stackItem.modifiers.preemptiveRetaliationTriggered = true;
    const preempt = getPreemptiveRetaliation(details.defender);
    if (preempt) {
      appendEvent(state, {
        type: "UNIT_ABILITY_TRIGGERED",
        unitId: details.defender.id,
        abilityId: preempt.abilityId,
        targetUnitId: details.defender.id,
        message: `${details.defender.cardName} fires a Preemptive Shot at ${details.attacker.cardName}.`
      });
    }
    openRetaliationWindow(state, details.attacker, details.defender, cards, true);
    return;
  }

  // Resuming after the lethal-save window: the die was already rolled, so reuse
  // that outcome instead of rolling again.
  if (stackItem.modifiers.rolledCandidate) {
    finishResolvedAttack(state, stackItem, details, stackItem.modifiers.rolledCandidate, cards);
    return;
  }

  // Bless: "Ignores the Attack die roll" — the die never rolls (outcome 0),
  // so reroll effects have nothing to reroll either.
  if (details.ignoreAttackDie) {
    finishResolvedAttack(state, stackItem, details, { rolls: [0], roll: 0 }, cards);
    return;
  }

  // Slayer: against a gold unit, roll the Attack die N times and apply every
  // result but a "-1" — each "+1" adds 1 to the attack (a "0"/"-1" adds
  // nothing), so the die's whole contribution is the number of "+1"s. Then
  // draw 1 card once the attack has resolved. No reroll choice is opened.
  if (stackItem.modifiers.slayerRolls && stackItem.modifiers.slayerRolls > 0) {
    // Morale: an "about to roll ≥2 Attack dice" holder rolls one Slayer die
    // less; the -1-to-this-roll and the die curses apply to what was rolled.
    const slayerCount = takeMoraleRollOneLess(state, details.attacker.controllerId, stackItem.modifiers.slayerRolls);
    applyMoraleAttackRollPenalty(state, stackItem, details);
    const rolls = Array.from({ length: slayerCount }, () => rollAttackDie(combat));
    const slayerCandidate = applyMoraleDiceCurses(
      state,
      details.attacker.controllerId,
      { rolls, roll: rolls.filter((roll) => roll === 1).length, sumAllDice: true },
      "count-plus"
    );
    const bonus = slayerCandidate.roll;
    // Slayer's fire flares over the gold target (the FX layer plays it after the
    // dice read out and the blow lands — see abilityFxPlans.slayer).
    appendEvent(state, {
      type: "UNIT_ABILITY_TRIGGERED",
      unitId: details.attacker.id,
      abilityId: "slayer",
      targetUnitId: details.defender.id,
      message: `Slayer rolls ${slayerCandidate.rolls.length} Attack dice against ${details.defender.cardName} (+${bonus}).`
    });
    // sumAllDice: every die counts toward the bonus, so the overlay lights them
    // all (the dice read out before the strike, then the damage lands).
    finishResolvedAttack(state, stackItem, details, slayerCandidate, cards);
    if (stackItem.modifiers.slayerDraw) {
      stackItem.modifiers.slayerDraw = false;
      drawCardsForPlayer(state, details.attacker.controllerId, 1);
    }
    return;
  }

  // Ivor's Elves I / VI: a played specialty fixed this attack's die. It is an
  // explicit instant, so it overrides any roll — and the Mummy's passive die-set
  // below — with no roll, no reroll and no post-roll die-cancel window, exactly
  // like the Mummy path. The die still SHOWS the forced face, so finishResolved-
  // Attack fires whatever that face triggers.
  if (stackItem.modifiers.forcedRoll !== undefined) {
    const forced = stackItem.modifiers.forcedRoll;
    finishResolvedAttack(state, stackItem, details, { rolls: [forced], roll: forced }, cards);
    return;
  }

  // Mummies (defence): "set the opponent's Attack die to -1." While a Mummy is
  // the defender the attacker's die is forced — no roll, no reroll.
  const forcedDie = getForcedAttackerDie(details.defender);
  if (forcedDie !== null) {
    finishResolvedAttack(state, stackItem, details, { rolls: [forcedDie], roll: forcedDie }, cards);
    return;
  }

  // Neutral Champions: "roll 2 Attack dice and apply both outcomes" — reroll
  // each "-1" once, then sum both faces. The reroll is intrinsic to the ability,
  // so no separate reroll choice is opened.
  const applyBoth = getRollTwoDiceApplyBoth(details.attacker);
  if (applyBoth) {
    // Morale "roll 1 die less": the 2-dice apply-both roll becomes a single
    // die (its built-in "-1 once" reroll still applies to that die).
    const reduced = takeMoraleRollOneLess(state, details.attacker.controllerId, 2) < 2;
    applyMoraleAttackRollPenalty(state, stackItem, details);
    const applyBothCandidate = reduced
      ? (() => {
          const value = rollAttackDie(combat);
          const roll = applyBoth.rerollMinusOnce && value === -1 ? rollAttackDie(combat) : value;
          return { rolls: [roll], roll, sumAllDice: true } satisfies AttackRollCandidate;
        })()
      : rollApplyBothCandidate(combat, applyBoth.rerollMinusOnce);
    resolveAttackOrOfferDieCancel(
      state,
      stackItem,
      details,
      applyMoraleDiceCurses(state, details.attacker.controllerId, applyBothCandidate, "sum"),
      cards
    );
    return;
  }

  // Morale "roll 1 die less": a 2-dice advantage/disadvantage roll collapses to
  // one straight die — mutate details.rollMode so the reroll window (and its
  // rerolls) stay single-die for this attack.
  if (
    details.rollMode !== "normal" &&
    takeMoraleRollOneLess(state, details.attacker.controllerId, 2) < 2
  ) {
    details.rollMode = "normal";
  }
  applyMoraleAttackRollPenalty(state, stackItem, details);
  const candidate = applyMoraleDiceCurses(
    state,
    details.attacker.controllerId,
    rollAttackCandidate(combat, details.rollMode),
    details.rollMode
  );
  const rerollEffects = getAttackRerollEffects(state, {
    attacker: details.attacker,
    defender: details.defender,
    attackKind: details.attackKind
  }).filter((effect) => !effect.usedChoiceIds.includes(stackItem.id));
  // Champions' "Charge" only offers its reroll when the unit moved to attack
  // (never on a Retaliation Attack, where it did not move).
  const moved = !details.isRetaliation && Boolean(details.attacker.movedThisActivation);
  const rerollSources = buildRerollSources(state, details.attacker, rerollEffects, moved);

  // Only pause when a source can actually fire on this roll — the Crusaders'
  // 'every "0"' reroll never interrupts a +1.
  if (rerollSources.some((source) => rerollSourceAvailableFor(source, candidate.roll))) {
    openAttackRerollChoice(state, stackItem, details, candidate, rerollSources);
    return;
  }

  resolveAttackOrOfferDieCancel(state, stackItem, details, candidate, cards);
}

/**
 * Where the resolved spell card physically ends up. Ongoing spells (anything
 * that left lasting effects on the table) are held in play until those
 * effects end; instants follow the deferred Knowledge/Mysticism recall or the
 * Crazy Wizard astrologers card, and otherwise simply stay in the discard.
 */
function finalizeSpellCardDestination(
  state: GameState,
  stackItem: ResolutionStackItem,
  effectCountBeforeCast: number
): void {
  if (stackItem.action.type !== "CAST_SPELL") {
    return;
  }

  // Spell Scroll casts were already removed from the game when played, and Helm
  // of the Alabaster Unicorn casts (fromSpellDeck) leave their spell in the
  // shared Spell-deck discard pile — in both cases there is no card in
  // hand/discard to hold ongoing, recall, or send to the discard. Any ongoing
  // effect they created still lives on in activeEffects.
  if (stackItem.modifiers.scrollLocked || stackItem.modifiers.fromSpellDeck) {
    return;
  }

  // Tarnum (Conflux) VI: the spell was moved hand → caster's discard at cast
  // time. Pull it back out and place it on the shared Spell deck (its top, so it
  // is the next card searched/drawn, or its discard pile) per the caster's
  // choice — never left in the caster's own discard. Any ongoing effect it made
  // still lives in activeEffects (the card itself is gone from the player).
  if (stackItem.modifiers.tarnumReturn) {
    const caster = state.players[stackItem.action.playerId];
    const cardId = stackItem.action.cardId;
    const spellDeck = state.decks.spells;
    if (caster) {
      const idx = caster.discard.lastIndexOf(cardId);
      if (idx >= 0) {
        caster.discard.splice(idx, 1);
      }
    }
    if (spellDeck) {
      if (stackItem.modifiers.tarnumReturn === "deck-top") {
        spellDeck.drawPile.push(cardId);
      } else {
        spellDeck.discardPile.push(cardId);
      }
    }
    return;
  }

  const playerId = stackItem.action.playerId;
  const cardId = stackItem.action.cardId;
  const recall = stackItem.modifiers.recallSpell;

  const held = holdOngoingCardIfEffectCreated(
    state,
    playerId,
    cardId,
    effectCountBeforeCast,
    recall?.toHand ? "hand" : "discard"
  );

  if (!held) {
    if (recall?.toHand) {
      returnSpellFromDiscardToHand(state, playerId, cardId);
    } else {
      maybeReturnFirstSpellToHand(state, playerId, cardId);
    }
  }

  // Mysticism expert: the support cards played with the spell come back at
  // once (they resolved on the spot — only the spell itself can be ongoing).
  if (recall?.recallPlayedCards) {
    const caster = state.players[playerId];
    for (const playedCardId of stackItem.modifiers.playedCardIds) {
      const playedIndex = caster.discard.lastIndexOf(playedCardId);
      if (playedIndex !== -1) {
        caster.discard.splice(playedIndex, 1);
        caster.hand.push(playedCardId);
      }
    }
  }
}

function resolveTopStack(state: GameState, cards: CardLibrary): void {
  const stackItem = state.stack.at(-1);
  if (!stackItem) {
    state.phase = "combat";
    state.priorityPlayerId = null;
    return;
  }

  stackItem.status = "resolving";

  if (stackItem.action.type === "CAST_SPELL") {
    const card = cards[stackItem.action.cardId];
    // Snapshot for the ongoing rule: effects created below mark this card as
    // staying in play until they end.
    const effectCountBeforeCast = state.activeEffects.length;
    // Set when this cast lands a unit-targeted Initiative buff: after it fully
    // resolves, a faster friendly unit may "steal" a fresh enemy activation.
    let appliedCombatInitiativeBuff = false;

    // Rampart Dwarves "Magic Resistance": a spell aimed at a Dwarf rolls a die
    // to shrug it off. On the matching face the spell still resolves (and is
    // discarded) but applies none of its effects to the Dwarf.
    if (negatesCardOnDwarfRoll(state, stackItem.action.target, card?.name ?? "the spell")) {
      appendEvent(state, {
        type: "SPELL_CAST_RESOLVED",
        playerId: stackItem.action.playerId,
        spellCardId: stackItem.action.cardId,
        target: stackItem.action.target,
        power: getCurrentSpellPower(state, stackItem, cards)
      });
      finalizeSpellCardDestination(state, stackItem, effectCountBeforeCast);
      stackItem.status = "resolved";
      state.stack.pop();
      if (finishCombatIfNeeded(state)) {
        return;
      }
      state.phase = "combat";
      state.priorityPlayerId = null;
      return;
    }

    // Recanter's Cloak: a global spell-cast restriction wipes this cast out —
    // a total lock (option B) or a Power below the floor (option A's "no spells
    // with Power 0", so an unboosted cast does nothing). The spell still
    // resolves and is discarded, applying none of its effects, exactly like a
    // shrugged-off Dwarf roll above. Re-reads the final Power so a Power card
    // played into the cast window lifts an option-A cast over the floor.
    if (spellNullifiedByRestriction(state, getCurrentSpellPower(state, stackItem, cards))) {
      appendEvent(state, {
        type: "SPELL_CAST_RESOLVED",
        playerId: stackItem.action.playerId,
        spellCardId: stackItem.action.cardId,
        target: stackItem.action.target,
        power: getCurrentSpellPower(state, stackItem, cards)
      });
      finalizeSpellCardDestination(state, stackItem, effectCountBeforeCast);
      stackItem.status = "resolved";
      state.stack.pop();
      if (finishCombatIfNeeded(state)) {
        return;
      }
      state.phase = "combat";
      state.priorityPlayerId = null;
      return;
    }

    if (card?.effect.type === "EARTHQUAKE" && state.combat?.siege) {
      resolveEarthquakeSpell(state, stackItem.action.playerId, getCurrentSpellPower(state, stackItem, cards));
    }

    if (card?.effect.type === "REMOVE_OBSTACLE" && state.combat) {
      const power = getCurrentSpellPower(state, stackItem, cards);
      const count = getAmountByPower(card.effect.countByPower, 0, power);
      openRemoveObstacleChoice(state, stackItem.action.playerId, count);
    }

    if (card?.effect.type === "DEAL_DAMAGE" && state.combat && stackItem.action.target.type === "unit") {
      const target = state.combat.units[stackItem.action.target.unitId];
      if (target) {
        const power = getCurrentSpellPower(state, stackItem, cards);
        const rawAmount = getSpellDamageAmount(card, power);
        // Spell/Specialty immunity (Orb of Inhibition's global nullify and the
        // Pendant's school immunity included) zeroes the hit; otherwise "reduce
        // spell damage by N" applies to Spell-kind damage only.
        const amount = unitIgnoresCardDamage(state, target, card)
          ? 0
          : card.effect.damageKind === "spell"
            ? reducedSpellDamage(state, target, rawAmount, card.spellSchools ?? [])
            : rawAmount;
        target.damage += amount;
        noteUnitDamagedForTokens(state, target, amount);
        appendEvent(state, {
          type: "DAMAGE_ASSIGNED",
          source: {
            type: "card",
            cardId: card.id,
            controllerId: stackItem.action.playerId
          },
          target: stackItem.action.target,
          amount,
          damageKind: card.effect.damageKind
        });
        markUnitRemovedIfNeeded(state, target);
      }
    }

    if (card?.effect.type === "HEAL_DAMAGE" && state.combat && stackItem.action.target.type === "unit") {
      const target = state.combat.units[stackItem.action.target.unitId];
      if (target) {
        const power = getCurrentSpellPower(state, stackItem, cards);
        const amount = getSpellDamageAmount(card, power);
        healUnitDamage(
          state,
          {
            type: "card",
            cardId: card.id,
            controllerId: stackItem.action.playerId
          },
          stackItem.action.target,
          amount
        );
      }
    }

    if (card?.effect.type === "HEAL_DAMAGE_AND_REMOVE_EFFECTS" && state.combat && stackItem.action.target.type === "unit") {
      const power = getCurrentSpellPower(state, stackItem, cards);
      const amount = getSpellDamageAmount(card, power);
      const source = {
        type: "card" as const,
        cardId: card.id,
        controllerId: stackItem.action.playerId
      };
      healUnitDamage(state, source, stackItem.action.target, amount);
      removeEffectsFromTarget(state, source, stackItem.action.target, card.effect.removePolarity);
      // Cure: "Remove any effect or paralysis …" — the chosen unit also loses
      // its Paralysis token (the effect removes the token, not just ongoing
      // effects). A heal of 0 still clears it.
      if (card.effect.removeParalysis) {
        const unit = state.combat.units[stackItem.action.target.unitId];
        if (unit && hasToken(unit, "paralysis")) {
          removeToken(state, unit, "paralysis", "dispelled");
        }
      }
    }

    if (card?.effect.type === "CREATE_ACTIVE_EFFECT") {
      createActiveEffectFromCard(
        state,
        card,
        card.effect,
        stackItem.action.playerId,
        "basic",
        stackItem.action.target.type === "unit" ? stackItem.action.target : undefined
      );
    }

    if (card?.effect.type === "CREATE_ATTACK_BUFF" && stackItem.action.target.type === "unit") {
      createAttackBuffFromCard(
        state,
        card,
        card.effect,
        stackItem.action.playerId,
        getCurrentSpellPower(state, stackItem, cards),
        stackItem.action.target
      );
    }

    if (card?.effect.type === "CREATE_DEFENSE_BUFF" && stackItem.action.target.type === "unit") {
      createDefenseBuffFromCard(
        state,
        card,
        stackItem.action.playerId,
        getCurrentSpellPower(state, stackItem, cards),
        stackItem.action.target
      );
    }

    if (card?.effect.type === "CREATE_ATTACK_DIE_REROLL") {
      createAttackRerollEffectFromCard(
        state,
        card,
        stackItem.action.playerId,
        "basic",
        getCurrentSpellPower(state, stackItem, cards)
      );
    }

    if (card?.effect.type === "DRAW_CARDS") {
      drawCardsForPlayer(state, stackItem.action.playerId, getEffectAmount(card.effect, "basic"));
    }

    if (card?.effect.type === "CREATE_INITIATIVE_BUFF" && state.combat && stackItem.action.target.type === "unit") {
      const power = getCurrentSpellPower(state, stackItem, cards);
      const targetUnit = state.combat.units[stackItem.action.target.unitId];
      const amount = doubleAmountForUnitName(
        getAmountByPower(card.effect.amountByPower, card.effect.amount ?? 0, power),
        targetUnit,
        card.effect.doubleForUnitName
      );
      createActiveEffect(
        state,
        {
          name: card.effect.name,
          scope: "unit",
          duration: card.effect.duration,
          polarity: card.effect.polarity ?? (amount >= 0 ? "positive" : "negative"),
          removable: card.effect.removable ?? true,
          modifiers: [
            { type: "INITIATIVE_BONUS", amount },
            ...(card.effect.movementBonus
              ? [{ type: "MOVEMENT_BONUS" as const, amount: card.effect.movementBonus }]
              : [])
          ]
        },
        { type: "card", cardId: card.id, controllerId: stackItem.action.playerId },
        stackItem.action.playerId,
        stackItem.action.target
      );
      appliedCombatInitiativeBuff = true;
    }

    // CHOOSE_ONE spell cast directly to one of its trigger-free arms (Prayer's
    // +initiative side): the branches above key off card.effect.type, which is
    // CHOOSE_ONE, so resolve the chosen option's effect here. Only the
    // CREATE_INITIATIVE_BUFF arm is offered for a direct cast (see
    // addChooseOneSpellInstantCasts), so it is the only one resolved here — a
    // whole-Combat Initiative buff on the friendly unit, power-scaled exactly
    // like the +attack/+defense arms. Those arms carry triggers and resolve in
    // their reaction window, never reaching this spell-cast resolution.
    if (card?.effect.type === "CHOOSE_ONE" && state.combat && stackItem.action.target.type === "unit") {
      const chosen = getEffectiveCardEffect(card, stackItem.action.optionIndex);
      if (chosen?.type === "CREATE_INITIATIVE_BUFF") {
        const power = getCurrentSpellPower(state, stackItem, cards);
        const targetUnit = state.combat.units[stackItem.action.target.unitId];
        const amount = doubleAmountForUnitName(
          getAmountByPower(chosen.amountByPower, chosen.amount ?? 0, power),
          targetUnit,
          chosen.doubleForUnitName
        );
        createActiveEffect(
          state,
          {
            name: chosen.name,
            scope: "unit",
            duration: chosen.duration,
            polarity: chosen.polarity ?? (amount >= 0 ? "positive" : "negative"),
            removable: chosen.removable ?? true,
            modifiers: [
              { type: "INITIATIVE_BONUS", amount },
              ...(chosen.movementBonus ? [{ type: "MOVEMENT_BONUS" as const, amount: chosen.movementBonus }] : [])
            ]
          },
          { type: "card", cardId: card.id, controllerId: stackItem.action.playerId },
          stackItem.action.playerId,
          stackItem.action.target
        );
        appliedCombatInitiativeBuff = true;
      }
    }

    if (card?.effect.type === "CREATE_SPELL_IMMUNITY" && state.combat && stackItem.action.target.type === "unit") {
      const power = getCurrentSpellPower(state, stackItem, cards);
      const maxGrade = gradeAtPower(card.effect.gradeByPower, power);
      const target = state.combat.units[stackItem.action.target.unitId];
      if (target && maxGrade && gradeRankOfUnit(target) <= gradeRank(maxGrade)) {
        createActiveEffect(
          state,
          {
            name: card.name,
            scope: "unit",
            duration: card.effect.duration,
            polarity: "positive",
            removable: true,
            modifiers: [{ type: "UNIT_SPELL_IMMUNE", maxGrade }]
          },
          { type: "card", cardId: card.id, controllerId: stackItem.action.playerId },
          stackItem.action.playerId,
          stackItem.action.target
        );
      }
    }

    if (card?.effect.type === "CREATE_FIRE_SHIELD" && state.combat && stackItem.action.target.type === "unit") {
      createFireShieldFromCard(
        state,
        card,
        card.effect,
        stackItem.action.playerId,
        getCurrentSpellPower(state, stackItem, cards),
        stackItem.action.target
      );
    }

    // Chain Lightning Spell: hit the selected unit, then fork to the units
    // closest to it. The allocation (1/1/1, 2/1/1, 3/2/1) scales with Power.
    if (card?.effect.type === "CHAIN_LIGHTNING" && state.combat && stackItem.action.target.type === "unit") {
      const power = getCurrentSpellPower(state, stackItem, cards);
      startChainLightning(
        state,
        stackItem.action.playerId,
        card,
        stackItem.action.target.unitId,
        chainLightningDamages(card.effect, power)
      );
    }

    // Blind: place a Paralysis token on the selected enemy unit, gated by the
    // Power paid (0 → bronze, 1 → silver, 2 → gold). Above the unlocked grade
    // the cast does nothing — mirrors Anti-Magic's resolution-time gate. A unit
    // that cannot gain Paralysis (the printed ignore-paralysis ability, or a
    // Pendant of Second Sight immunity) shrugs the token off all the same.
    if (card?.effect.type === "PLACE_PARALYSIS" && state.combat && stackItem.action.target.type === "unit") {
      const power = getCurrentSpellPower(state, stackItem, cards);
      const maxGrade = gradeAtPower(card.effect.gradeByPower, power);
      const target = state.combat.units[stackItem.action.target.unitId];
      if (target && maxGrade && gradeRankOfUnit(target) <= gradeRank(maxGrade)) {
        if (unitImmuneToParalysis(state, target)) {
          appendEvent(state, {
            type: "UNIT_ABILITY_TRIGGERED",
            unitId: target.id,
            abilityId: "ignore-paralysis",
            targetUnitId: target.id,
            message: `${target.cardName} is immune to Paralysis.`
          });
        } else {
          placeCombatToken(state, target, "paralysis", 0, card.name);
        }
      }
    }

    // Inferno: roll the Attack die N times (by Power) on the chosen space; each
    // "+1" deals 1 damage to every unit on that space and the orthogonally
    // adjacent ones — friend or foe alike.
    if (card?.effect.type === "INFERNO" && state.combat && stackItem.action.target.type === "space") {
      resolveInfernoSpell(
        state,
        stackItem.action.playerId,
        card,
        stackItem.action.target.position,
        getAmountByPower(card.effect.rollsByPower, 1, getCurrentSpellPower(state, stackItem, cards))
      );
    }

    // Frost Ring: select a space; the units adjacent to it (NOT the centre)
    // suffer the power-scaled damage, friend or foe. Up to two are hit; with more
    // adjacent units the caster picks which (resolveAreaPickDamage). Targets a
    // space, so it may be centred on an occupied cell.
    if (card?.effect.type === "AREA_DAMAGE_PICK_ADJACENT" && state.combat) {
      const power = getCurrentSpellPower(state, stackItem, cards);
      const amount = card.effect.amount ?? getAmountByPower(card.effect.amountByPower ?? {}, 1, power);
      const center =
        stackItem.action.target.type === "space"
          ? stackItem.action.target.position
          : stackItem.action.target.type === "unit"
            ? state.combat.units[stackItem.action.target.unitId]?.position
            : undefined;
      if (center !== undefined) {
        resolveAreaPickDamage(
          state,
          stackItem.action.playerId,
          card,
          center,
          amount,
          card.effect.includeCenter,
          card.effect.adjacentPicks
        );
      }
    }

    // Dispel: "Remove all ongoing effects from a space, or a unit and the space
    // it occupies." On a UNIT it strips that unit's removable effects (gated by
    // the Power-reached grade 0/1/2 → bronze/silver/gold, like Anti-Magic/Blind)
    // and then clears any obstacle on the space it stands on. On a SPACE it
    // clears that space's obstacle/trap tokens — tokens carry no grade, so this
    // works at any Power.
    if (card?.effect.type === "DISPEL_EFFECTS" && state.combat) {
      const dispelSource = { type: "card" as const, cardId: card.id, controllerId: stackItem.action.playerId };
      if (stackItem.action.target.type === "unit") {
        const power = getCurrentSpellPower(state, stackItem, cards);
        const maxGrade = gradeAtPower(card.effect.gradeByPower, power);
        const target = state.combat.units[stackItem.action.target.unitId];
        if (target && maxGrade && gradeRankOfUnit(target) <= gradeRank(maxGrade)) {
          removeEffectsFromTarget(state, dispelSource, stackItem.action.target, "any-removable");
          clearBattlefieldTokensAt(state, state.combat, target.position);
        }
      } else if (stackItem.action.target.type === "space") {
        clearBattlefieldTokensAt(state, state.combat, stackItem.action.target.position);
      }
    }

    // Forgetfulness: the selected enemy ranged unit cannot attack during its
    // next activation. The reachable grade rises with the Power paid; above it
    // the cast does nothing (the Anti-Magic/Blind gate).
    if (card?.effect.type === "FORGETFULNESS" && state.combat && stackItem.action.target.type === "unit") {
      const power = getCurrentSpellPower(state, stackItem, cards);
      const maxGrade = gradeAtPower(card.effect.gradeByPower, power);
      const target = state.combat.units[stackItem.action.target.unitId];
      if (target && maxGrade && gradeRankOfUnit(target) <= gradeRank(maxGrade)) {
        createActiveEffect(
          state,
          {
            name: card.name,
            scope: "unit",
            duration: { type: "next-activation" },
            polarity: "negative",
            removable: true,
            modifiers: [{ type: "UNIT_CANNOT_ATTACK" }]
          },
          { type: "card", cardId: card.id, controllerId: stackItem.action.playerId },
          stackItem.action.playerId,
          stackItem.action.target
        );
      }
    }

    // Berserk: the selected unit must attack the nearest unit on its next
    // activation. Grade-gated like Blind; above the unlocked grade the cast does
    // nothing. The forced "attack the nearest" rule lives in the legal-action
    // layer and the neutral AI (both read the BERSERK_FORCED_ATTACK effect).
    if (card?.effect.type === "BERSERK" && state.combat && stackItem.action.target.type === "unit") {
      const power = getCurrentSpellPower(state, stackItem, cards);
      const maxGrade = gradeAtPower(card.effect.gradeByPower, power);
      const target = state.combat.units[stackItem.action.target.unitId];
      if (target && maxGrade && gradeRankOfUnit(target) <= gradeRank(maxGrade)) {
        createActiveEffect(
          state,
          {
            name: card.name,
            scope: "unit",
            duration: { type: "next-activation" },
            polarity: "negative",
            removable: true,
            modifiers: [{ type: "BERSERK_FORCED_ATTACK" }]
          },
          { type: "card", cardId: card.id, controllerId: stackItem.action.playerId },
          stackItem.action.playerId,
          stackItem.action.target
        );
      }
    }

    // Teleport: move the selected unit to a chosen empty space, ignoring
    // obstacles and distance. Grade-gated like Anti-Magic; above the unlocked
    // grade the cast does nothing. The destination is picked in a follow-up
    // (the combat-teleport choice), resolved by resolveTeleportChoice.
    if (card?.effect.type === "TELEPORT_UNIT" && state.combat && stackItem.action.target.type === "unit") {
      const power = getCurrentSpellPower(state, stackItem, cards);
      const maxGrade = gradeAtPower(card.effect.gradeByPower, power);
      const target = state.combat.units[stackItem.action.target.unitId];
      if (target && maxGrade && gradeRankOfUnit(target) <= gradeRank(maxGrade)) {
        openTeleportChoice(state, stackItem.action.playerId, target);
      }
    }

    // Clone: place a 1-Health copy of the selected allied unit on an adjacent
    // empty space. Grade-gated by the Power paid (1 → bronze, 3 → silver,
    // 5 → gold). If the Power paid does not reach the chosen unit's grade (e.g.
    // a silver unit needs Power 3 but only 2 was paid), the cast is REFUNDED
    // rather than wasted — the Clone card and the Power spent on it return to
    // hand, a notice explains, and the caster goes back to the battle screen
    // (nothing lost). On success the destination is picked in a follow-up (the
    // combat-clone OPTION_CHOICE), resolved by resolveCloneChoice.
    if (card?.effect.type === "CLONE_UNIT" && state.combat && stackItem.action.target.type === "unit") {
      const power = getCurrentSpellPower(state, stackItem, cards);
      const maxGrade = gradeAtPower(card.effect.gradeByPower, power);
      const target = state.combat.units[stackItem.action.target.unitId];
      if (target && maxGrade && gradeRankOfUnit(target) <= gradeRank(maxGrade)) {
        // Grade reached: if the unit somehow has no adjacent empty space left,
        // refund too (nothing was placed) rather than swallow the cast.
        if (!openCloneChoice(state, stackItem.action.playerId, target)) {
          refundInsufficientCloneCast(
            state,
            stackItem,
            target,
            `${target.cardName} has no adjacent empty space to place a Clone — the spell was returned to your hand.`
          );
          return;
        }
      } else if (target) {
        const required = powerRequiredForGrade(card.effect.gradeByPower, target.grade);
        const need = required === null ? "more" : `Power ${required}`;
        refundInsufficientCloneCast(
          state,
          stackItem,
          target,
          `Not enough Power to Clone ${target.cardName} (a ${target.grade} unit needs ${need}, you paid Power ${power}) — the spell was returned to your hand.`
        );
        return;
      }
    }

    // Disrupting Ray: until the end of the Combat the selected enemy unit cannot
    // use its special ability. Grade-gated like Blind (0 → bronze, 1 → silver,
    // 2 → gold); above the unlocked grade the cast does nothing. Backed by a
    // combat-scoped UNIT_ABILITY_SUPPRESSED effect. The target read here is the
    // pending cast's target, so a Magic-Mirror redirect lands the suppression on
    // the bounced unit instead.
    if (card?.effect.type === "DISRUPTING_RAY" && state.combat && stackItem.action.target.type === "unit") {
      const power = getCurrentSpellPower(state, stackItem, cards);
      const maxGrade = gradeAtPower(card.effect.gradeByPower, power);
      const target = state.combat.units[stackItem.action.target.unitId];
      if (target && maxGrade && gradeRankOfUnit(target) <= gradeRank(maxGrade)) {
        createActiveEffect(
          state,
          {
            name: card.name,
            scope: "unit",
            duration: { type: "combat" },
            polarity: "negative",
            removable: true,
            modifiers: [{ type: "UNIT_ABILITY_SUPPRESSED" }]
          },
          { type: "card", cardId: card.id, controllerId: stackItem.action.playerId },
          stackItem.action.playerId,
          stackItem.action.target
        );
      }
    }

    // Sacrifice: transfer the chosen (damaged, grade-gated) unit's wounds onto
    // another of your units, which perishes. The heal target is the cast target;
    // the sacrifice is picked in a follow-up ABILITY_TARGET_CHOICE. Grade-gated
    // (0/2/4 → bronze/silver/gold) on the HEAL target; above the unlocked grade,
    // or with nothing to transfer / no other unit to spend, the cast does nothing.
    if (card?.effect.type === "SACRIFICE_TRANSFER" && state.combat && stackItem.action.target.type === "unit") {
      const power = getCurrentSpellPower(state, stackItem, cards);
      const maxGrade = gradeAtPower(card.effect.gradeByPower, power);
      const healTarget = state.combat.units[stackItem.action.target.unitId];
      const eligible =
        Boolean(healTarget) &&
        maxGrade !== null &&
        gradeRankOfUnit(healTarget!) <= gradeRank(maxGrade) &&
        healTarget!.damage > 0;
      // Capture the caster outside the closure: inside the .filter callback TS
      // widens stackItem.action back to GameAction (which now includes the
      // clientId-keyed room actions that carry no playerId).
      const casterId = stackItem.action.playerId;
      const candidates = eligible
        ? Object.values(state.combat.units).filter(
            (unit) => unit.id !== healTarget!.id && unit.controllerId === casterId && isUnitAlive(unit)
          )
        : [];
      if (healTarget && candidates.length > 0) {
        const choiceId = `choice_${nextEventNumber(state)}`;
        state.pendingChoice = {
          id: choiceId,
          type: "ABILITY_TARGET_CHOICE",
          playerId: stackItem.action.playerId,
          kind: "sacrifice-transfer",
          abilityId: card.id,
          abilityName: card.name,
          prompt: `${card.name}: choose another of your units to sacrifice — it absorbs ${healTarget.cardName}'s wounds and may perish.`,
          sourceUnitId: healTarget.id,
          anchorUnitId: healTarget.id,
          candidateUnitIds: candidates.map((unit) => unit.id),
          optional: false
        };
        appendEvent(state, {
          type: "PENDING_CHOICE_CREATED",
          choiceId,
          choiceType: "ABILITY_TARGET_CHOICE",
          playerId: stackItem.action.playerId,
          sourceEffectIds: [],
          message: `${card.name}: choose a unit to sacrifice.`
        });
      }
    }

    if (card?.effect.type === "CLEAR_RETALIATION" && state.combat && stackItem.action.target.type === "unit") {
      const power = getCurrentSpellPower(state, stackItem, cards);
      const maxGrade = gradeAtPower(card.effect.gradeByPower, power);
      const target = state.combat.units[stackItem.action.target.unitId];
      if (target && maxGrade && gradeRankOfUnit(target) <= gradeRank(maxGrade) && target.retaliatedThisRound) {
        target.retaliatedThisRound = false;
        appendEvent(state, {
          type: "UNIT_ABILITY_TRIGGERED",
          unitId: target.id,
          abilityId: "counterstrike",
          message: `${card.name} readies ${target.cardName} to retaliate again.`
        });
      }
    }

    if (card?.effect.type === "ADD_UNIT_MAX_HEALTH" && state.combat && stackItem.action.target.type === "unit") {
      const target = state.combat.units[stackItem.action.target.unitId];
      if (target && target.controllerId === stackItem.action.playerId) {
        target.maxHealth += doubleAmountForUnitName(card.effect.amount, target, card.effect.doubleForUnitName);
      }
    }

    if (card?.effect.type === "AREA_DAMAGE_ADJACENT" && state.combat && stackItem.action.target.type === "unit") {
      const target = state.combat.units[stackItem.action.target.unitId];
      const power = getCurrentSpellPower(state, stackItem, cards);
      const amount = getAmountByPower(card.effect.amountByPower, 1, power);
      if (target) {
        // The primary target's own spell-damage reduction applies here; the
        // splash keeps the raw `amount` and is reduced per splash-target below.
        const dealt = reducedCardDamage(state, target, card, amount);
        target.damage += dealt;
        noteUnitDamagedForTokens(state, target, dealt);
        appendEvent(state, {
          type: "DAMAGE_ASSIGNED",
          source: { type: "card", cardId: card.id, controllerId: stackItem.action.playerId },
          target: stackItem.action.target,
          amount: dealt,
          damageKind: "spell"
        });
        markUnitRemovedIfNeeded(state, target);

        // "Select 2 adjacent places": the caster picks one unit adjacent to
        // the target for the same damage (the second space may be empty). A
        // unit immune to this Spell's school (an Elemental) is not a candidate.
        const splashCandidates = Object.values(state.combat.units).filter(
          (unit) =>
            unit.id !== target.id &&
            isUnitAlive(unit) &&
            isAdjacent(unit.position, target.position) &&
            !unitImmuneToSpellSchoolsByEffect(state, unit, card.spellSchools) &&
            (spellAbilitiesSuppressed(state) || !unitImmuneToSpellSchools(unit, card.spellSchools))
        );
        if (splashCandidates.length > 0) {
          const choiceId = `choice_${nextEventNumber(state)}`;
          state.pendingChoice = {
            id: choiceId,
            type: "ABILITY_TARGET_CHOICE",
            playerId: stackItem.action.playerId,
            kind: "spell-splash",
            abilityId: null,
            abilityName: card.name,
            prompt: `${card.name}: choose a second unit adjacent to the target (${amount} damage), or skip.`,
            sourceUnitId: target.id,
            anchorUnitId: target.id,
            candidateUnitIds: splashCandidates.map((unit) => unit.id),
            amount,
            optional: true
          };
          appendEvent(state, {
            type: "PENDING_CHOICE_CREATED",
            choiceId,
            choiceType: "ABILITY_TARGET_CHOICE",
            playerId: stackItem.action.playerId,
            sourceEffectIds: [],
            message: `${card.name} may scorch a second unit.`
          });
        }
      }
    }

    if (card?.effect.type === "SUMMON_ELEMENTAL" && state.combat && stackItem.action.target.type === "space") {
      // Power 4 summons a Pack, Power 2 a Few; Power 0 has no effect.
      const power = getCurrentSpellPower(state, stackItem, cards);
      const side: "few" | "pack" | null = power >= 4 ? "pack" : power >= 2 ? "few" : null;
      const position = stackItem.action.target.position;
      if (side) {
        const summoned = placeSummonedUnit(state, stackItem.action.playerId, card.effect.unitDefId, side, position);
        if (summoned) {
          appendEvent(state, {
            type: "UNIT_ABILITY_TRIGGERED",
            unitId: summoned.id,
            abilityId: card.id,
            message: `${state.players[stackItem.action.playerId]?.name ?? "A hero"} casts ${card.name}: ${summoned.cardName} appears at ${getBattlefieldLabel(position)}.`
          });
        }
      }
    }

    // Force Field (Basic Earth): drop an Obstacle on the chosen empty space.
    // Its span grows with Power — Power 0: this Combat round, 1: the next, 2: the
    // whole Combat — and while it stands it blocks non-flying movement.
    if (card?.effect.type === "PLACE_FORCE_FIELD" && state.combat && stackItem.action.target.type === "space") {
      const power = getCurrentSpellPower(state, stackItem, cards);
      const duration = durationAtPower(card.effect.durationByPower, power) ?? { type: "combat" };
      addBattlefieldToken(state, {
        kind: "force_field",
        position: stackItem.action.target.position,
        controllerId: stackItem.action.playerId,
        expiresAtCombatRoundEnd: forceFieldExpiry(state.combat, duration)
      });
    }

    // Fire Wall (Basic Fire): drop an Effect Obstacle on the chosen empty space
    // for the whole Combat; the damage it deals scales with Power (0/2/4 -> 1/2/3).
    if (card?.effect.type === "PLACE_FIRE_WALL" && state.combat && stackItem.action.target.type === "space") {
      const power = getCurrentSpellPower(state, stackItem, cards);
      addBattlefieldToken(state, {
        kind: "fire_wall",
        position: stackItem.action.target.position,
        controllerId: stackItem.action.playerId,
        damage: getAmountByPower(card.effect.damageByPower, 1, power)
      });
    }

    // Quicksand (Basic Earth) / Land Mine (Expert Fire): a no-target cast that
    // opens the caster's picker for the whole set of 2/4/6 face-down tokens (the
    // place-battlefield-tokens choice). Every token is placed through that picker.
    if (card?.effect.type === "PLACE_HIDDEN_TOKENS" && state.combat) {
      const power = getCurrentSpellPower(state, stackItem, cards);
      const count = getAmountByPower(card.effect.countByPower, 2, power);
      beginHiddenTokenPlacement(
        state,
        stackItem.action.playerId,
        card.effect.tokenKind,
        count,
        card.effect.triggerDamage
      );
    }

    appendEvent(state, {
      type: "SPELL_CAST_RESOLVED",
      playerId: stackItem.action.playerId,
      spellCardId: stackItem.action.cardId,
      target: stackItem.action.target,
      power: getCurrentSpellPower(state, stackItem, cards)
    });

    finalizeSpellCardDestination(state, stackItem, effectCountBeforeCast);

    stackItem.status = "resolved";
    state.stack.pop();

    if (finishCombatIfNeeded(state)) {
      return;
    }

    // "Steal the turn": an off-turn Initiative buff (Prayer's +initiative arm)
    // that out-paces the fresh enemy unit about to act hands the activation to
    // the now-faster friendly unit. No-op for an on-turn cast or any cast that
    // did not raise a unit's Initiative.
    if (appliedCombatInitiativeBuff) {
      maybeStealActivationAfterInitiativeShift(state, stackItem.action.playerId);
    }

    // Fireball's second-target choice stays open after the cast resolves.
    if (state.pendingChoice) {
      state.phase = "choice";
      state.priorityPlayerId = state.pendingChoice.playerId;
      return;
    }

    state.phase = "combat";
    state.priorityPlayerId = null;
    return;
  }

  if (stackItem.action.type === "ATTACK_UNIT" || stackItem.action.type === "MOVE_AND_ATTACK_UNIT") {
    resolveAttackStackItem(state, stackItem, cards);
    return;
  }

  stackItem.status = "resolved";
  state.stack.pop();
  if (finishCombatIfNeeded(state)) {
    return;
  }
  state.phase = "combat";
  state.priorityPlayerId = null;
}

/**
 * Ongoing rule: a card whose play created lasting effects stays physically in
 * play — it is pulled out of the discard pile into the player's held zone and
 * only released (to the discard, or the hand when recalled) once every effect
 * it created has ended. Returns true when the card was held.
 */
function holdOngoingCardIfEffectCreated(
  state: GameState,
  playerId: PlayerId,
  cardId: CardId,
  effectCountBefore: number,
  returnTo: "discard" | "hand"
): boolean {
  const player = state.players[playerId];
  if (!player) {
    return false;
  }

  const createdEffects = state.activeEffects
    .slice(effectCountBefore)
    .filter((effect) => effect.source.type === "card" && effect.source.cardId === cardId);
  if (createdEffects.length === 0) {
    return false;
  }

  const discardIndex = player.discard.lastIndexOf(cardId);
  if (discardIndex === -1) {
    return false;
  }

  player.discard.splice(discardIndex, 1);
  player.ongoingCards = player.ongoingCards ?? [];
  player.ongoingCards.push({
    cardId,
    effectIds: createdEffects.map((effect) => effect.id),
    returnTo
  });
  return true;
}

/** Knowledge/Mysticism on an instant spell: the card comes back right away. */
function returnSpellFromDiscardToHand(state: GameState, playerId: PlayerId, cardId: CardId): void {
  const player = state.players[playerId];
  const discardIndex = player?.discard.lastIndexOf(cardId) ?? -1;
  if (!player || discardIndex === -1) {
    return;
  }

  player.discard.splice(discardIndex, 1);
  player.hand.push(cardId);
  appendEvent(state, {
    type: "SPELL_RETURNED_TO_HAND",
    playerId,
    cardId,
    reason: "Knowledge/Mysticism"
  });
}

/**
 * Astrologers — Crazy Wizard: until the next Astrologers round, the first
 * spell card each player plays returns to their hand instead of staying in
 * the discard pile.
 */
function maybeReturnFirstSpellToHand(state: GameState, playerId: PlayerId, cardId: string): void {
  const astrologers = state.adventure?.astrologers;
  if (!astrologers || getActiveAstrologersCard(state)?.effect.type !== "FIRST_SPELL_RETURNS") {
    return;
  }

  if (astrologers.crazyWizardUsedBy.includes(playerId)) {
    return;
  }

  const player = state.players[playerId];
  const discardIndex = player?.discard.lastIndexOf(cardId) ?? -1;
  if (!player || discardIndex === -1) {
    return;
  }

  player.discard.splice(discardIndex, 1);
  player.hand.push(cardId);
  astrologers.crazyWizardUsedBy.push(playerId);
  appendEvent(state, {
    type: "SPELL_RETURNED_TO_HAND",
    playerId,
    cardId,
    reason: "Crazy Wizard"
  });
}

function closeReactionWindow(state: GameState, reason: "all-pass" | "reaction-played"): void {
  if (!state.reactionWindow) {
    return;
  }

  appendEvent(state, {
    type: "REACTION_WINDOW_CLOSED",
    windowId: state.reactionWindow.id,
    reason
  });
  state.reactionWindow = null;
  state.priorityPlayerId = null;
}

/**
 * Familiars' "Mana Leech": while a living enemy Familiar is in the combat, a
 * player who casts a Spell from hand must discard one extra random card. Scroll
 * casts are not "from hand" and are exempt.
 */
function applyEnemySpellHandTax(state: GameState, casterId: PlayerId): void {
  const combat = state.combat;
  if (!combat) {
    return;
  }
  const familiar = Object.values(combat.units).find(
    (unit) => unit.controllerId !== casterId && isUnitAlive(unit) && hasSpellCastHandTax(unit)
  );
  if (!familiar) {
    return;
  }
  const discarded = discardRandomCardFromHand(state, casterId);
  if (discarded) {
    appendEvent(state, {
      type: "UNIT_ABILITY_TRIGGERED",
      unitId: familiar.id,
      abilityId: "familiar-spell-tax",
      message: `${familiar.cardName} leeches a card from the spellcaster's hand.`
    });
  }
}

/**
 * Tower Magi (Pack) "[activation] +N power to the first spell you cast this
 * round" and Conflux Pack Elementals "[activation] +N power to the first
 * <school> Magic spell you cast during this Activation": the bonus is only
 * available while the granting unit is the active unit — i.e. during its own
 * turn — so this reads the boost off the currently-active unit when it belongs
 * to the caster. The school-scoped Elemental boost lands only when the spell
 * being cast (`spellSchools`) matches; the Magi's school-less boost always
 * lands. 0 at any other time (off-turn, another unit active, no combat).
 */
function activeUnitSpellPowerBoostFor(state: GameState, playerId: PlayerId, spellSchools?: SpellSchool[]): number {
  const combat = state.combat;
  const activeUnit = combat?.activeUnitId ? combat.units[combat.activeUnitId] : undefined;
  if (!activeUnit || activeUnit.controllerId !== playerId) {
    return 0;
  }
  return getActivationSpellPowerBoost(activeUnit, spellSchools);
}

function castSpell(state: GameState, action: Extract<GameAction, { type: "CAST_SPELL" }>, cards: CardLibrary): void {
  const card = cards[action.cardId];
  if (!card || card.kind !== "spell") {
    throw new Error(`Card ${action.cardId} is not a spell.`);
  }

  // Tarnum (Conflux) VI: a free over-limit cast is only legal for a card the
  // hero actually Searched and flagged this combat (guards against a forged
  // tarnumReturn slipping a normal hand spell past the per-round limit).
  if (action.tarnumReturn) {
    const flagged = state.players[action.playerId]?.combatStats.tarnumOverlimitCards ?? [];
    if (!flagged.includes(action.cardId)) {
      throw new Error("That Spell was not Searched for a Tarnum over-limit cast.");
    }
  }

  // Ciele IV (Conflux): a free over-limit cast pulled from the caster's OWN
  // discard. Validate the forgery surface (this cast bypasses the Spell limit, so
  // an unchecked client could otherwise free-cast any spell): the enabling
  // specialty must be in hand and authorise this exact spell id, and the spell
  // itself must actually be sitting in the caster's discard pile.
  if (action.fromOwnDiscard) {
    const caster = state.players[action.playerId];
    const enablerId = action.fromSpellDeck;
    const enabler = enablerId ? cards[enablerId] : undefined;
    const castOption =
      enabler?.effect.type === "CHOOSE_ONE"
        ? enabler.effect.options.find((option) => option.effect.type === "CAST_FROM_SPELL_DISCARD")
        : undefined;
    const authorisedSpellId =
      castOption?.effect.type === "CAST_FROM_SPELL_DISCARD" && castOption.effect.ownDiscard === true
        ? castOption.effect.spellId
        : undefined;
    if (
      !caster ||
      !enablerId ||
      !caster.hand.includes(enablerId) ||
      authorisedSpellId === undefined ||
      authorisedSpellId !== action.cardId ||
      !caster.discard.includes(action.cardId)
    ) {
      throw new Error("That Spell cannot be cast from your discard pile.");
    }
  }

  // Creature Bank Dragon Utopia Faerie Dragons (while Stacked): a living enemy
  // Faerie Dragons forbids any Spell cast. Backstop at resolution so a forced
  // cast (one the legal-action filter never offered) still fails.
  if (combatEnemyLocksSpells(state, action.playerId)) {
    throw new Error("An enemy Faerie Dragons (Stacked) prevents you from casting Spells.");
  }

  // Neutral Pegasi "Mystic Toll": a living enemy Pegasi gates this cast behind
  // paying a card with Power. The caster picks which Power card to pay BEFORE
  // the Spell is cast (a player-choice prompt); with no spare Power card the
  // Spell cannot be cast at all. The cast is deferred until the toll resolves.
  if (combatEnemyImposesPowerTax(state, action.playerId)) {
    const caster = state.players[action.playerId];
    // A Book cast (like a Scroll cast) leaves the hand intact — the cast Spell is
    // not in hand — so it never excludes the cast card from the payable Power list.
    const payable = caster
      ? payablePowerCardIds(caster.hand, cards, action.cardId, Boolean(action.fromScroll || action.fromSpellBook))
      : [];
    if (payable.length === 0) {
      throw new Error("An enemy Pegasi blocks this Spell: you must discard a card with Power to cast, and have none to pay.");
    }
    openPegasiTollChoice(state, action, payable, cards);
    return;
  }

  performSpellCast(state, action, cards);
}

/**
 * Opens the Neutral Pegasi "Mystic Toll" prompt: the caster chooses which Power
 * card to discard to pay for the Spell. The Spell cast is held in `tollSpell`
 * and replayed by resolveCombatHandDiscard once the toll is paid.
 */
function openPegasiTollChoice(
  state: GameState,
  action: Extract<GameAction, { type: "CAST_SPELL" }>,
  payableCardIds: CardId[],
  cards: CardLibrary
): void {
  const combat = state.combat;
  const pegasi = combat
    ? Object.values(combat.units).find(
        (unit) => unit.controllerId !== action.playerId && isUnitAlive(unit) && hasSpellCastPowerTax(unit)
      )
    : undefined;
  if (!pegasi) {
    // No enemy Pegasi after all (defensive): cast normally, no toll.
    performSpellCast(state, action, cards);
    return;
  }

  const chooser = state.players[action.playerId];
  const spellName = cards[action.cardId]?.name ?? action.cardId;
  const choiceId = `choice_${nextEventNumber(state)}`;
  state.pendingChoice = {
    id: choiceId,
    type: "COMBAT_HAND_DISCARD",
    playerId: action.playerId,
    kind: "pegasi-toll",
    abilityId: "pegasi-power-tax",
    abilityName: "Mystic Toll",
    sourceUnitId: pegasi.id,
    prompt: `${pegasi.cardName}'s Mystic Toll — discard a card with Power to cast ${spellName}.`,
    powerCardIds: payableCardIds,
    tollSpell: {
      cardId: action.cardId,
      target: action.target,
      ...(action.fromScroll ? { fromScroll: action.fromScroll } : {}),
      ...(action.fromSpellDeck ? { fromSpellDeck: action.fromSpellDeck } : {}),
      ...(action.fromSpellBook ? { fromSpellBook: true } : {}),
      ...(action.tarnumReturn ? { tarnumReturn: action.tarnumReturn } : {})
    }
  };
  state.phase = "choice";
  state.priorityPlayerId = action.playerId;

  appendEvent(state, {
    type: "PENDING_CHOICE_CREATED",
    choiceId,
    choiceType: "COMBAT_HAND_DISCARD",
    playerId: action.playerId,
    sourceEffectIds: [],
    message: `${chooser?.name ?? action.playerId} must pay a card with Power to cast ${spellName}.`
  });
}

/**
 * Casts the Spell for real: consume it, apply the Familiar tax, build the stack
 * item and open the reaction window / resolve. Split from castSpell so the
 * Neutral Pegasi toll can be paid first and the cast replayed unchanged.
 */
function performSpellCast(state: GameState, action: Extract<GameAction, { type: "CAST_SPELL" }>, cards: CardLibrary): void {
  const card = cards[action.cardId];
  if (!card || card.kind !== "spell") {
    throw new Error(`Card ${action.cardId} is not a spell.`);
  }

  // A Spell Scroll cast pulls the spell from the scroll (it is not in hand) and
  // removes it from the game; a normal cast moves the card hand → discard.
  if (action.fromScroll) {
    if (!consumeScrollSpell(state, action.playerId, action.fromScroll, action.cardId)) {
      throw new Error("That spell is not in the named Spell Scroll.");
    }
  } else if (action.fromSpellDeck) {
    // The spell is cast from the shared Spell-deck discard pile and stays there
    // (it is never moved to a hand/discard). The enabling card named on the action
    // is consumed: the Helm of the Alabaster Unicorn pays its "Remove this card"
    // cost (it leaves the game), while Ciele's Magic Arrow IV is a hero-specialty,
    // so it cycles to the discard pile to be redrawn. No enemy-spell hand tax —
    // nothing left the hand as a normal cast.
    const enablerIsSpecialty = cardLibrary[action.fromSpellDeck]?.kind === "hero-specialty";
    const removeError = moveCardFromHandToDiscard(
      state,
      action.playerId,
      action.fromSpellDeck,
      enablerIsSpecialty ? "discard" : "removed"
    );
    if (removeError) {
      throw new Error(removeError.message);
    }
  } else if (action.fromSpellBook) {
    // Spell Book (house rule): the Spell is cast from the Book — a non-hand zone,
    // like a Scroll — so it cycles Book → discard pile and is NOT subject to the
    // Familiars' hand tax ("each enemy Spell cast from hand"). It otherwise casts
    // at the caster's full Power and counts toward the spell limit exactly like a
    // hand cast (noteSpellCast below).
    const moveError = moveSpellFromSpellBookToDiscard(state, action.playerId, action.cardId);
    if (moveError) {
      throw new Error(moveError.message);
    }
  } else if (action.tarnumReturn) {
    // Tarnum (Conflux) VI free over-limit cast of a just-Searched hand spell:
    // move hand → discard like a normal cast (finalizeSpellCardDestination then
    // relocates the card to the shared Spell deck top/discard). As a bonus cast
    // it skips the Familiars' hand tax, and the flag is consumed below.
    const moveError = moveCardFromHandToDiscard(state, action.playerId, action.cardId);
    if (moveError) {
      throw new Error(moveError.message);
    }
  } else {
    const moveError = moveCardFromHandToDiscard(state, action.playerId, action.cardId);
    if (moveError) {
      throw new Error(moveError.message);
    }
    // Familiars tax each enemy Spell cast from hand by one extra random card.
    applyEnemySpellHandTax(state, action.playerId);
  }

  const caster = state.players[action.playerId];
  const isFirstSpellThisTurn = (caster.combatStats.spellsCastThisTurn ?? 0) === 0;
  // "First spell this round" counts every cast, free Helm casts included, so the
  // Tower Magi Pack Power bonus lands on whichever spell is cast first — never on
  // both a free Helm cast and a later normal cast.
  const isFirstSpellThisRound = !caster.combatStats.anySpellCastThisRound;
  // Neither a Helm of the Alabaster Unicorn cast nor a Tarnum (Conflux) VI
  // over-limit cast counts toward the spell limit (noteSpellCast still closes
  // the first-spell-this-round gate for them). A Book cast DOES count — it casts
  // like a hand Spell and shares the one-Spell-per-round limit.
  noteSpellCast(state, caster, !action.fromSpellDeck && !action.tarnumReturn);

  const stackItem = makeStackItem(state, action);

  // Helm of the Alabaster Unicorn cast: flag the stack item so the spell card is
  // left in the Spell-deck discard pile when it resolves (no hand/discard card to
  // relocate). Unlike a scroll it casts at the caster's normal Power, so it falls
  // through to the power hooks below.
  if (action.fromSpellDeck) {
    stackItem.modifiers.fromSpellDeck = true;
  }

  // Tarnum (Conflux) VI: flag the placement and spend the over-limit privilege
  // for this card (remove a single flagged occurrence).
  if (action.tarnumReturn) {
    stackItem.modifiers.tarnumReturn = action.tarnumReturn;
    const flagged = caster.combatStats.tarnumOverlimitCards ?? [];
    const idx = flagged.indexOf(action.cardId);
    if (idx >= 0) {
      flagged.splice(idx, 1);
      caster.combatStats.tarnumOverlimitCards = flagged;
    }
  }

  // Scroll spells are locked to power 0 and cannot be boosted by any Power
  // source — skip every power-granting hook below and flag the stack item.
  if (action.fromScroll) {
    stackItem.modifiers.scrollLocked = true;
  } else {
    // Astrologers — Grim Warlock: the first spell in each player's turn gets
    // +1 Power.
    const astrologersCard = getActiveAstrologersCard(state);
    if (isFirstSpellThisTurn && astrologersCard?.effect.type === "FIRST_SPELL_POWER_BONUS") {
      stackItem.modifiers.spellPowerBonus += astrologersCard.effect.amount;
    }

    // Tower Magi (Pack) "[activation] +N power to the first spell you cast this
    // round" and Conflux Pack Elementals "[activation] +N power to the first
    // <school> Magic spell you cast during this Activation": only while that
    // unit itself is the active unit (its own turn), only for the round's first
    // spell, and — for the Elementals — only when the spell matches their school.
    if (isFirstSpellThisRound) {
      const activationPower = activeUnitSpellPowerBoostFor(state, action.playerId, card.spellSchools);
      if (activationPower > 0) {
        stackItem.modifiers.spellPowerBonus += activationPower;
      }
    }

    // School of Magic permanent in play: a matching spell takes its standing
    // basic bonus (+1) for free. If the caster chose, as part of this cast, to
    // discard the permanent for its expert bonus, take +3 instead — decided here
    // up front, so a plain cast just applies the +1 and resolves without popping
    // a separate expert prompt.
    if (action.useSchoolExpert) {
      const expert = discardSchoolPermanentForExpert(state, action.playerId, card);
      if (!expert) {
        throw new Error("That spell cannot discard a School of Magic for its expert bonus right now.");
      }
      stackItem.modifiers.schoolPowerBonus = expert.expertPower;
      stackItem.modifiers.playedCardIds.push(expert.cardId);
    } else {
      const schoolBonus = getPermanentSchoolBonus(state, action.playerId, card);
      if (schoolBonus) {
        stackItem.modifiers.schoolPowerBonus = schoolBonus.basicPower;
      }
    }
  }

  state.stack.push(stackItem);

  const spellStarted = appendEvent(state, {
    type: "SPELL_CAST_STARTED",
    playerId: action.playerId,
    spellCardId: action.cardId,
    target: action.target,
    power: card.power ?? 0
  });
  stackItem.triggerEventIds.push(spellStarted.id);

  const legalReactions = getLegalReactionsForTrigger(state, spellStarted, cards);
  if (reactionPlayerOrder(state, legalReactions, spellStarted).length === 0) {
    resolveTopStack(state, cards);
    return;
  }

  openReactionWindowForTrigger(state, stackItem, spellStarted, cards);
}

/**
 * If the open window is Misfortune's pre-buff phase and it just emptied (the
 * defender declined Misfortune), hand the SAME window object over to the normal
 * attack-declared buff window: clear the phase, recompute the full offers, reset
 * passes and restore the normal (attacker-first) priority. Returns true when it
 * took over, so the caller does not resolve the attack. A no-op (returns false)
 * for any other window, or when nobody can react in the normal window either.
 */
function transitionFromMisfortunePhase(state: GameState, cards: CardLibrary): boolean {
  const window = state.reactionWindow;
  const top = state.stack.at(-1);
  if (
    !window ||
    !top ||
    (top.action.type !== "ATTACK_UNIT" && top.action.type !== "MOVE_AND_ATTACK_UNIT") ||
    !top.modifiers.misfortunePhase
  ) {
    return false;
  }

  top.modifiers.misfortunePhase = false;
  window.passedPlayerIds = [];
  refreshReactionWindowLegalReactions(state, cards);
  if (window.allowedPlayerIds.length === 0) {
    // Nobody can react in the ordinary window either — let the attack resolve.
    return false;
  }
  // Normal order: the attacker (initiator) leads the buff exchange again.
  window.priorityPlayerId = window.allowedPlayerIds[0];
  state.priorityPlayerId = window.allowedPlayerIds[0];
  return true;
}

function passReaction(state: GameState, action: Extract<GameAction, { type: "PASS_REACTION" }>, cards: CardLibrary): void {
  if (!state.reactionWindow) {
    throw new Error("No reaction window is open.");
  }

  const window = state.reactionWindow;
  appendEvent(state, {
    type: "REACTION_PASSED",
    playerId: action.playerId,
    windowId: window.id
  });

  if (!window.passedPlayerIds.includes(action.playerId)) {
    window.passedPlayerIds.push(action.playerId);
  }

  const remainingPlayers = window.allowedPlayerIds.filter(
    (playerId) => !window.passedPlayerIds.includes(playerId)
  );

  if (remainingPlayers.length === 0) {
    // The defender declined Misfortune in its pre-buff window: hand off to the
    // normal attack-declared buff window instead of resolving the attack.
    if (transitionFromMisfortunePhase(state, cards)) {
      return;
    }
    closeReactionWindow(state, "all-pass");
    resolveTopStack(state, cards);
    return;
  }

  window.priorityPlayerId = remainingPlayers[0];
  state.priorityPlayerId = remainingPlayers[0];
}

function effectSupportsExpertPlay(effect: NonNullable<ReturnType<typeof getEffectiveCardEffect>>): boolean {
  if (effect.type === "ADD_COMBAT_STAT" || effect.type === "ADD_SPELL_POWER" || effect.type === "DRAW_CARDS") {
    return effect.expertAmount !== undefined;
  }

  if (effect.type === "GAIN_MORALE") {
    return effect.expertDrawCards !== undefined;
  }

  if (effect.type === "CREATE_ACTIVE_EFFECT") {
    return Boolean(effect.expertEffect);
  }

  if (effect.type === "RECALL_SPELL") {
    // Mysticism's expert side recalls every card played with the spell;
    // Knowledge's expert side raises the spell-per-round limit.
    return Boolean(effect.expertSpellLimitBonus || effect.expertRecallPlayedCards);
  }

  if (effect.type === "CANCEL_SPELL") {
    // Resistance's expert ignores the power cap; Protection-from-X's expert
    // ignores the spell-level cap. Either makes the card's expert play real.
    return Boolean(effect.expertIgnoresMaxPower || effect.expertIgnoresMaxSpellLevel);
  }

  // Interference's expert side (+2 instead of +1) exists; Plate of the Dying
  // Light reuses INTERFERE_SPELL with no expert side (no expertAmount).
  if (effect.type === "INTERFERE_SPELL") {
    return effect.expertAmount !== undefined;
  }

  return false;
}

/**
 * Pays a card option's printed extra price (discard/remove other cards) and
 * returns how many cost cards were paid. Throws when the payment is illegal.
 */
function payOptionCardCost(
  state: GameState,
  playerId: PlayerId,
  playedCard: CardDefinition,
  cost: CardPlayCost | undefined,
  costCardIds: CardId[] | undefined,
  cards: CardLibrary,
  allowSpellBookPower = false
): number {
  const cardName = playedCard.name;
  const paying = costCardIds ?? [];

  // Resource price (Ballistics' expert bombardment): spend it up front. Charged
  // before any early return so a resource-only cost still resolves.
  if (cost?.resources) {
    const payer = state.players[playerId];
    if (!payer) {
      throw new Error("Unknown player.");
    }
    for (const [resource, amount] of Object.entries(cost.resources) as [ResourceKind, number][]) {
      if (payer.resources[resource] < amount) {
        throw new Error(`${cardName} needs ${amount} ${resource} to play.`);
      }
    }
    spendResources(payer.resources, cost.resources);
    appendEvent(state, { type: "RESOURCES_SPENT", playerId, cost: cost.resources, reason: cardName });
  }

  if (
    !cost ||
    (cost.discardCards === undefined && cost.discardCardsUpTo === undefined && cost.powerCost === undefined)
  ) {
    if (paying.length > 0) {
      throw new Error(`${cardName} has no card cost to pay.`);
    }
    return 0;
  }

  if (cost.discardCards !== undefined && paying.length !== cost.discardCards) {
    throw new Error(`${cardName} needs exactly ${cost.discardCards} card${cost.discardCards === 1 ? "" : "s"} as payment.`);
  }
  if (cost.discardCardsUpTo !== undefined && paying.length > cost.discardCardsUpTo) {
    throw new Error(`${cardName} accepts at most ${cost.discardCardsUpTo} cards as payment.`);
  }

  const player = state.players[playerId];
  if (!player) {
    throw new Error("Unknown player.");
  }

  const handCounts = new Map<string, number>();
  for (const cardId of player.hand) {
    handCounts.set(cardId, (handCounts.get(cardId) ?? 0) + 1);
  }
  // Spell Book (house rule): in the lethal-save window, ONE stashed Book Spell
  // may pay for Power — the once-per-turn Book Power budget, the same limit as
  // the "+1 Power" discard. Every other cost card must come from the hand.
  const bookRuleOn = allowSpellBookPower && spellBookRuleEnabled(state) && spellBookPowerAvailable(player);
  const bookCounts = new Map<string, number>();
  if (bookRuleOn) {
    for (const cardId of player.spellBook ?? []) {
      bookCounts.set(cardId, (bookCounts.get(cardId) ?? 0) + 1);
    }
  }
  // Payment source, index-aligned with `paying`: which zone each cost card left.
  const paySources: ("hand" | "book")[] = [];
  let bookPaid = 0;
  for (const cardId of paying) {
    if (cost.costCardFilter === "spell" && cards[cardId]?.kind !== "spell") {
      throw new Error(`${cardName} can only be paid with Spell cards.`);
    }
    if (cost.costCardFilter === "power-source" && !cardCanBoostPower(cards[cardId])) {
      throw new Error(`${cardName} can only be paid with Power statistics or Spell cards.`);
    }
    const handLeft = handCounts.get(cardId) ?? 0;
    if (handLeft > 0) {
      handCounts.set(cardId, handLeft - 1);
      paySources.push("hand");
      continue;
    }
    // Fall back to the Book, capped at one Spell (the Book Power budget).
    const bookLeft = bookCounts.get(cardId) ?? 0;
    if (bookRuleOn && bookPaid === 0 && bookLeft > 0 && cards[cardId]?.kind === "spell") {
      bookCounts.set(cardId, bookLeft - 1);
      bookPaid += 1;
      paySources.push("book");
      continue;
    }
    throw new Error(
      bookPaid > 0
        ? "Only one Spell Book Spell may help pay a save per turn — other cost cards must come from your hand."
        : "Cost cards must come from your hand."
    );
  }

  // Power-value cost (Sorrow): the caster's standing spell Power plus the full
  // printed Power of each discarded power-source card must reach the threshold,
  // and every discarded card must be necessary (no wasteful over-payment).
  if (cost.powerCost !== undefined) {
    const schools = playedCard.spellSchools ?? [];
    const standing = standingSpellPower(state, playerId, playedCard);
    const values = paying.map((cardId) => spellPowerValueOfCard(cards[cardId], schools));
    const total = standing + values.reduce((sum, value) => sum + value, 0);
    if (total < cost.powerCost) {
      throw new Error(`${cardName} needs at least ${cost.powerCost} Power; this pays only ${total}.`);
    }
    for (const value of values) {
      if (total - value >= cost.powerCost) {
        throw new Error(`${cardName} was paid more Power than it needs — drop a card.`);
      }
    }
  }

  paying.forEach((cardId, payIndex) => {
    const fromBook = paySources[payIndex] === "book";
    const zone = fromBook ? player.spellBook : player.hand;
    const index = zone.indexOf(cardId);
    if (index !== -1) {
      zone.splice(index, 1);
    }
    if (cost.removeCostCards) {
      player.removed.push(cardId);
    } else {
      player.discard.push(cardId);
    }
  });
  // Spending a Book Spell for Power consumes the once-per-turn Book Power budget
  // (shared with the "+1 Power" discard, so it can't be doubled up in a turn).
  if (bookPaid > 0) {
    player.combatStats.spellBookPowerUsedThisTurn = true;
  }

  // Power sources spent to pay a Power-value cost (Sorrow's silver/gold,
  // Alamar's Resurrection) still resolve their own "draw 1 card" rider — the
  // Sorcery ability "+1 Power, then draw 1 card", and the same line on Scales of
  // the Greater Basilisk / Tunic of the Cyclops King. The Empower channel already
  // draws (it routes through the ADD_SPELL_POWER handler); the cost channel
  // discards the card directly, so the draw has to fire here too.
  if (cost.costCardFilter === "power-source") {
    const schools = playedCard.spellSchools ?? [];
    const draws = paying.reduce((sum, cardId) => sum + spellPowerSourceDrawCards(cards[cardId], schools), 0);
    if (draws > 0) {
      drawCardsForPlayer(state, playerId, draws);
    }
  }

  return paying.length;
}

/** The option chosen by a play, when the card is an "OR" card. */
function getChosenOption(card: CardDefinition, optionIndex?: number): CardOptionDefinition | undefined {
  return card.effect.type === "CHOOSE_ONE" && optionIndex !== undefined
    ? card.effect.options[optionIndex]
    : undefined;
}

/**
 * Applies one instant card inside the open reaction window: pays costs,
 * discards the card, and applies the effect to the pending stack item.
 * Returns whether the play ended the window (spell-cancel).
 */
function applyReactionPlayCore(
  state: GameState,
  playerId: PlayerId,
  play: {
    cardId: string;
    mode?: "basic" | "expert";
    optionIndex?: number;
    costCardIds?: CardId[];
    asPowerBoost?: boolean;
    /** Spell Scroll reaction: power-locked to 0, consumed from the scroll. */
    fromScroll?: string;
    /** Spell Book (house rule): the reaction Spell comes from the Book, not hand. */
    fromSpellBook?: boolean;
    /** Bowstring of the Unicorn's Mane: the friendly ranged unit to activate. */
    target?: TargetRef;
    /** Tarnum (Conflux) VI: free over-limit reaction; returns to the shared Spell deck. */
    tarnumReturn?: "deck-top" | "discard";
  },
  cards: CardLibrary
): { windowEnded: boolean } {
  if (!state.reactionWindow) {
    throw new Error("No reaction window is open.");
  }

  const card = cards[play.cardId];
  if (!card) {
    throw new Error(`Unknown reaction card ${play.cardId}.`);
  }

  const stackItemForBoost = state.stack.at(-1);

  // The printed alternative bottom effect of every Spell card: discard it
  // for +1 Power toward the pending cast (or the spell instant in this
  // attack window).
  if (play.asPowerBoost) {
    if (card.kind !== "spell") {
      throw new Error("Only Spell cards can be discarded for +1 Power.");
    }
    if (!stackItemForBoost) {
      throw new Error("There is nothing to empower.");
    }
    if (play.fromSpellBook) {
      // Spell Book (house rule): only ONE Book Spell may be spent for Power per
      // turn (a crown-style budget). Backstop the per-turn lock here so a forced
      // play the legal-action filter never offered still fails, then mark it spent
      // and cycle the Spell Book → discard pile (a non-hand zone, like a Scroll).
      const player = state.players[playerId];
      if (!player || !spellBookPowerAvailable(player)) {
        throw new Error("You have already spent a Spell Book Spell for Power this turn.");
      }
      const moveError = moveSpellFromSpellBookToDiscard(state, playerId, play.cardId);
      if (moveError) {
        throw new Error(moveError.message);
      }
      player.combatStats.spellBookPowerUsedThisTurn = true;
    } else {
      const moveError = moveCardFromHandToDiscard(state, playerId, play.cardId);
      if (moveError) {
        throw new Error(moveError.message);
      }
    }
    // Attack windows pool Power per caster; a spell cast on your own turn uses
    // the single spellPowerBonus.
    if (isAttackStackItem(stackItemForBoost)) {
      addAttackPower(stackItemForBoost, playerId, 1);
    } else {
      stackItemForBoost.modifiers.spellPowerBonus += 1;
    }
    stackItemForBoost.modifiers.playedCardIds.push(play.cardId);
    recomputePowerScaledAttackInstants(stackItemForBoost);
    appendEvent(state, {
      type: "CARD_PLAYED",
      playerId,
      cardId: play.cardId,
      timing: card.timing,
      mode: "basic",
      effectAmount: 1,
      optionLabel: "+1 Power"
    });
    return { windowEnded: false };
  }

  const effect = getEffectiveCardEffect(card, play.optionIndex);
  if (!effect) {
    throw new Error(`${card.name} needs a chosen option.`);
  }

  const option = getChosenOption(card, play.optionIndex);
  // Scroll spells are always cast at the lowest power level — never the expert
  // side, never boosted.
  const mode = play.fromScroll ? "basic" : (play.mode ?? "basic");

  if (option?.expertOnly && mode !== "expert") {
    throw new Error(`${option.label} is the card's expert side.`);
  }

  if (mode === "expert") {
    if (!effectSupportsExpertPlay(effect) && !option?.expertOnly) {
      throw new Error(`${card.name} does not have an expert effect.`);
    }

    // An Empowered ability may always use its Expert side without a crown.
    if (!hasExpertUseAvailable(state, playerId) && !abilityExpertIsCrownFree(state.players[playerId], play.cardId)) {
      throw new Error("No expert uses are available this combat round.");
    }
  }

  const stackItem = state.stack.at(-1);
  const player = state.players[playerId];

  // Tarnum (Conflux) VI: a free over-limit reaction is only legal for a card the
  // hero actually Searched and flagged this combat (guards a forged tarnumReturn).
  if (play.tarnumReturn && !(player?.combatStats.tarnumOverlimitCards ?? []).includes(play.cardId)) {
    throw new Error("That Spell was not Searched for a Tarnum over-limit cast.");
  }

  // Spell cards played as instants count toward the printed limit of one
  // Spell card per combat round (Knowledge/Necklace raise it). A Tarnum VI
  // over-limit reaction is a free bonus — it ignores the limit.
  if (card.kind === "spell" && state.combat && player && !play.tarnumReturn) {
    if (player.combatStats.spellsCastThisRound >= spellLimitFor(state, player)) {
      throw new Error("Spell limit reached for this combat round.");
    }
  }

  // Elemental Magic power boosts only empower spells of their school.
  if (effect.type === "ADD_SPELL_POWER" && effect.schoolOnly && stackItem?.action.type === "CAST_SPELL") {
    const pendingSpell = cards[stackItem.action.cardId];
    const schools = pendingSpell?.spellSchools ?? [];
    if (!schools.includes(effect.schoolOnly) && !schools.includes("any")) {
      throw new Error(`${card.name} only empowers ${effect.schoolOnly} spells.`);
    }
  }

  // Tome of X (option B) only empowers a spell of its own School.
  if (effect.type === "SET_SPELL_POWER_MAX") {
    if (stackItem?.action.type !== "CAST_SPELL") {
      throw new Error(`${card.name} can only be played while casting a spell.`);
    }
    const pendingSpell = cards[stackItem.action.cardId];
    const schools = pendingSpell?.spellSchools ?? [];
    if (!schools.includes(effect.schoolOnly) && !schools.includes("any")) {
      throw new Error(`${card.name} only empowers ${effect.schoolOnly} spells.`);
    }
  }

  // Re-check the printed power limit at resolution time: Power cards played
  // earlier in this window may have pushed the spell above a basic cancel.
  if (
    effect.type === "CANCEL_SPELL" &&
    stackItem?.action.type === "CAST_SPELL" &&
    !(mode === "expert" && effect.expertIgnoresMaxPower) &&
    effect.maxPower !== undefined &&
    getCurrentSpellPower(state, stackItem, cards) > effect.maxPower
  ) {
    throw new Error(`${card.name} cannot end a spell above power ${effect.maxPower}.`);
  }

  // Protection-from-X self-defends its School/level gate at resolution: a
  // fabricated reaction can never cancel a spell of the wrong School or, in
  // basic play, an Expert spell (the legal-action layer already filters offers).
  if (effect.type === "CANCEL_SPELL" && stackItem?.action.type === "CAST_SPELL") {
    const pendingSpell = cards[stackItem.action.cardId];
    if (
      !cancelSpellAllowsSchoolAndLevel(
        effect,
        { schools: pendingSpell?.spellSchools ?? [], level: pendingSpell?.spellLevel },
        mode
      )
    ) {
      throw new Error(`${card.name} cannot end that spell.`);
    }
  }

  if (play.fromScroll) {
    if (!consumeScrollSpell(state, playerId, play.fromScroll, play.cardId)) {
      throw new Error("That spell is not in the named Spell Scroll.");
    }
  } else if (play.fromSpellBook) {
    // Spell Book (house rule): a Book Spell played as an instant cycles Book →
    // discard pile (or → removed for a removeSelf option, mirroring the hand path).
    const moveError = moveSpellFromSpellBookToDiscard(
      state,
      playerId,
      play.cardId,
      option?.cost?.removeSelf ? "removed" : "discard"
    );
    if (moveError) {
      throw new Error(moveError.message);
    }
  } else if (play.tarnumReturn) {
    // Tarnum (Conflux) VI: pull the flagged Spell out of hand and return it to the
    // shared Spell deck — its top or its discard pile (the caster's choice) —
    // never the caster's own discard. Consume the over-limit flag.
    const hand = state.players[playerId]?.hand;
    const handIndex = hand?.indexOf(play.cardId) ?? -1;
    if (!hand || handIndex < 0) {
      throw new Error("That Spell is not in your hand.");
    }
    hand.splice(handIndex, 1);
    const spellDeck = state.decks.spells;
    if (spellDeck) {
      if (play.tarnumReturn === "deck-top") {
        spellDeck.drawPile.push(play.cardId);
      } else {
        spellDeck.discardPile.push(play.cardId);
      }
    }
    if (player) {
      const flagged = player.combatStats.tarnumOverlimitCards ?? [];
      const idx = flagged.indexOf(play.cardId);
      if (idx >= 0) {
        flagged.splice(idx, 1);
        player.combatStats.tarnumOverlimitCards = flagged;
      }
    }
  } else {
    const moveError = moveCardFromHandToDiscard(
      state,
      playerId,
      play.cardId,
      option?.cost?.removeSelf ? "removed" : "discard"
    );
    if (moveError) {
      throw new Error(moveError.message);
    }
  }

  const costCardsPaid = play.fromScroll
    ? 0
    : // A lethal save (Resurrection Spell / specialty) may draw one of its Power
      // cost cards from the Spell Book — the once-per-turn Book Power budget.
      payOptionCardCost(
        state,
        playerId,
        card,
        option?.cost,
        play.costCardIds,
        cards,
        effect.type === "CANCEL_LETHAL_ATTACK"
      );

  let effectAmount = getEffectAmount(effect, mode);
  // An Empowered ability's Expert side spends no crown.
  if (mode === "expert" && !abilityExpertIsCrownFree(state.players[playerId], play.cardId)) {
    state.players[playerId].combatStats.expertUsesSpentThisRound += 1;
  }

  // Standing spell Power for a Power-scaling spell instant played as a reaction
  // into an attack — by EITHER side (the attacker's Bloodlust/Bless/Precision/
  // Slayer/Frenzy, the defender's Curse/Weakness): credit the once-per-turn
  // Astrologers bonus, the once-per-round active-unit boost, and a School-of-Magic
  // permanent's bonus for the spell's school — the same Power castSpell seeds for
  // a spell cast on your turn. Added to THAT caster's pool before noteSpellCast
  // advances the "first spell" counters, so the instant about to apply reads it
  // like Power paid alongside it. Seeded for EVERY pool-scaling spell (no
  // once-per-attack gate): standingSpellPower itself gates the Astrologers/Magi
  // "first spell" bonuses on those counters, so a second spell that turn keeps
  // its School-of-Magic bonus (always on) while never re-counting the first-spell
  // boosts.
  if (
    card.kind === "spell" &&
    !play.fromScroll &&
    player &&
    stackItem &&
    isAttackStackItem(stackItem) &&
    effectScalesWithAttackPool(effect)
  ) {
    const standing = standingSpellPower(state, playerId, card);
    if (standing > 0) {
      addAttackPower(stackItem, playerId, standing);
      recomputePowerScaledAttackInstants(stackItem);
    }
  }

  if (card.kind === "spell" && state.combat && player) {
    // A Tarnum VI over-limit reaction is free: it does not bump the per-round
    // limit (noteSpellCast still closes the first-spell-this-round gate for it).
    // A Book instant DOES count — it casts like a hand Spell and shares the limit.
    noteSpellCast(state, player, !play.tarnumReturn);
  }

  const optionLabel =
    card.effect.type === "CHOOSE_ONE" && play.optionIndex !== undefined
      ? card.effect.options[play.optionIndex]?.label
      : undefined;

  appendEvent(state, {
    type: "CARD_PLAYED",
    playerId,
    cardId: play.cardId,
    timing: card.timing,
    mode,
    effectAmount: effectAmount || undefined,
    optionLabel
  });

  if (effect.type === "CANCEL_SPELL" && stackItem?.action.type === "CAST_SPELL") {
    // Boots of Polarity: a chance-based cancel. Roll its Attack dice; on a
    // failed roll the card is already spent (moved to discard above) but the
    // spell resolves — return without ending the window so the cast continues
    // to resolution and other reactions may still answer it.
    if (effect.diceRoll && !rollSpellCancelDice(state, effect.diceRoll, stackItem.action.cardId, playerId)) {
      return { windowEnded: false };
    }
    // Resistance-style plays always end the spell once they apply: the stack
    // item is cancelled and the reaction window closes immediately.
    stackItem.status = "cancelled";
    appendEvent(state, {
      type: "SPELL_CAST_CANCELLED",
      playerId: stackItem.action.playerId,
      spellCardId: stackItem.action.cardId,
      cancelledByPlayerId: playerId,
      cancelledByCardId: play.cardId
    });
    // A Knowledge/Mysticism recall declared before the cancel still takes the
    // card back ("instead of discarding it" — no effect ever hit the table).
    if (stackItem.modifiers.recallSpell?.toHand) {
      returnSpellFromDiscardToHand(state, stackItem.action.playerId, stackItem.action.cardId);
    } else {
      maybeReturnFirstSpellToHand(state, stackItem.action.playerId, stackItem.action.cardId);
    }
    state.stack.pop();

    closeReactionWindow(state, "reaction-played");
    if (!finishCombatIfNeeded(state)) {
      state.phase = "combat";
    }
    return { windowEnded: true };
  }

  // Resistance against an instant Spell buff the OTHER side played into this
  // attack (Curse/Weakness/Bloodlust/Precision/Bless/Slayer): reverse the most
  // recent such spell so the attack proceeds as if it were never cast. The
  // attack itself is untouched and the window stays open, so each side can keep
  // responding (cast another buff, resist again) until both pass.
  if (
    effect.type === "CANCEL_SPELL" &&
    (stackItem?.action.type === "ATTACK_UNIT" || stackItem?.action.type === "MOVE_AND_ATTACK_UNIT")
  ) {
    const instants = stackItem.modifiers.cancellableSpellInstants ?? [];
    let index = -1;
    for (let i = instants.length - 1; i >= 0; i -= 1) {
      if (instants[i].playerId === playerId) {
        continue;
      }
      // Protection-from-X only reverses an enemy instant of its own School/level
      // (Resistance, with no such gate, takes the most recent enemy instant).
      const instantSpell = cards[instants[i].cardId];
      if (
        !cancelSpellAllowsSchoolAndLevel(
          effect,
          { schools: instantSpell?.spellSchools ?? [], level: instantSpell?.spellLevel },
          mode
        )
      ) {
        continue;
      }
      index = i;
      break;
    }
    if (index === -1) {
      throw new Error("There is no enemy Spell to resist on this attack.");
    }
    const cancelled = instants[index];
    reverseCancelledInstantSpell(stackItem, cancelled.cardId, cards);
    instants.splice(index, 1);
    appendEvent(state, {
      type: "SPELL_CAST_CANCELLED",
      playerId: cancelled.playerId,
      spellCardId: cancelled.cardId,
      cancelledByPlayerId: playerId,
      cancelledByCardId: play.cardId
    });
    stackItem.modifiers.playedCardIds.push(play.cardId);
    return { windowEnded: false };
  }

  // Magic Mirror: re-point the pending enemy spell to a new target. The card,
  // its Power cost and the spell-limit count were already spent above. Now the
  // controller picks the new target (of the chosen grade or lower) in a
  // follow-up choice while the spell waits on the stack; the reaction window
  // closes and the spell resolves against the chosen unit once it is picked.
  if (effect.type === "REDIRECT_SPELL" && stackItem?.action.type === "CAST_SPELL") {
    const currentTarget = stackItem.action.target;
    // A space-centred blast (Inferno) has no single "current" unit to exclude —
    // pass null so every legal unit qualifies as the new centre.
    const candidates = spellRedirectTargets(
      state,
      currentTarget.type === "unit" ? currentTarget.unitId : null,
      effect.grade
    );
    if (candidates.length === 0) {
      throw new Error("There is no legal new target for that spell.");
    }

    const castCard = cards[stackItem.action.cardId];
    const choiceId = `choice_${nextEventNumber(state)}`;
    state.pendingChoice = {
      id: choiceId,
      type: "ABILITY_TARGET_CHOICE",
      playerId,
      kind: "spell-redirect",
      abilityId: card.id,
      abilityName: card.name,
      prompt: `${card.name}: choose a new target for ${castCard?.name ?? "the spell"} (${effect.grade} or lower).`,
      sourceUnitId: null,
      anchorUnitId: currentTarget.type === "unit" ? currentTarget.unitId : null,
      candidateUnitIds: candidates.map((unit) => unit.id),
      optional: false
    };
    appendEvent(state, {
      type: "PENDING_CHOICE_CREATED",
      choiceId,
      choiceType: "ABILITY_TARGET_CHOICE",
      playerId,
      sourceEffectIds: [],
      message: `${card.name}: choose where to bounce ${castCard?.name ?? "the spell"}.`
    });

    closeReactionWindow(state, "reaction-played");
    state.phase = "choice";
    state.priorityPlayerId = playerId;
    return { windowEnded: true };
  }

  // Magic Mirror reflecting an instant combat debuff layered onto an attack
  // (Curse on your defender, Weakness on your attacker). Lift that one Spell off
  // your unit exactly as Resistance would, capture its power-scaled penalty, then
  // open the new-target choice; the malus lands on the chosen unit as a lasting
  // token and the attack's reaction window resumes (see chooseAbilityTarget).
  if (
    effect.type === "REDIRECT_SPELL" &&
    (stackItem?.action.type === "ATTACK_UNIT" || stackItem?.action.type === "MOVE_AND_ATTACK_UNIT")
  ) {
    const found = reflectableAttackInstantForPlayer(state, stackItem, playerId, cards);
    const affected = found ? state.combat?.units[found.affectedUnitId] : undefined;
    const candidates = found ? spellRedirectTargets(state, found.affectedUnitId, effect.grade) : [];
    if (!found || !affected || candidates.length === 0) {
      throw new Error("There is no enemy Spell on this attack for Magic Mirror to reflect.");
    }

    const instantCard = cards[found.cardId];
    const signedAmount = attackInstantSignedAmount(stackItem, found.cardId, cards);
    reverseCancelledInstantSpell(stackItem, found.cardId, cards);
    stackItem.modifiers.cancellableSpellInstants?.splice(found.index, 1);

    const choiceId = `choice_${nextEventNumber(state)}`;
    state.pendingChoice = {
      id: choiceId,
      type: "ABILITY_TARGET_CHOICE",
      playerId,
      kind: "spell-redirect",
      abilityId: card.id,
      abilityName: card.name,
      prompt: `${card.name}: choose a new target for ${instantCard?.name ?? "the spell"} (${effect.grade} or lower).`,
      sourceUnitId: null,
      anchorUnitId: found.affectedUnitId,
      candidateUnitIds: candidates.map((unit) => unit.id),
      optional: false,
      redirectInstant: {
        stat: found.stat,
        amount: signedAmount,
        sourceCardId: found.cardId
      }
    };
    appendEvent(state, {
      type: "PENDING_CHOICE_CREATED",
      choiceId,
      choiceType: "ABILITY_TARGET_CHOICE",
      playerId,
      sourceEffectIds: [],
      message: `${card.name}: choose where to bounce ${instantCard?.name ?? "the spell"}.`
    });

    closeReactionWindow(state, "reaction-played");
    state.phase = "choice";
    state.priorityPlayerId = playerId;
    return { windowEnded: true };
  }

  // Sorrow: skip the activation of the unit that is about to act. The chosen
  // CHOOSE_ONE option carries the grade reached (bronze free, silver/gold paid
  // via its discard cost, already settled above). The about-to-activate unit
  // comes from the activation-skip window's trigger event.
  if (effect.type === "SKIP_ACTIVATION") {
    const triggerEvent = state.reactionWindow?.triggerEvent;
    const unit =
      triggerEvent?.type === "UNIT_ACTIVATION_STARTED" ? state.combat?.units[triggerEvent.unitId] : undefined;
    if (unit && isUnitAlive(unit) && effect.grade && gradeRankOfUnit(unit) <= gradeRank(effect.grade)) {
      appendEvent(state, {
        type: "UNIT_ABILITY_TRIGGERED",
        unitId: unit.id,
        abilityId: card.id,
        message: `${card.name} skips ${unit.cardName}'s activation.`
      });
      skipUnitActivation(state, unit);
    }
    closeReactionWindow(state, "reaction-played");
    if (!finishCombatIfNeeded(state)) {
      state.phase = "combat";
    }
    return { windowEnded: true };
  }

  // Bowstring of the Unicorn's Mane (option A): activate one of your ranged units
  // that has not acted this round, out of order. Played in the pre-activation
  // window before some unit (possibly the enemy's) acts; the chosen ranged unit
  // (play.target) becomes the active unit and takes its full turn now. The unit
  // that was about to act was not consumed, so it resumes in initiative order.
  if (effect.type === "ACTIVATE_RANGED_UNIT") {
    const targetRef = play.target;
    const chosen = targetRef?.type === "unit" ? state.combat?.units[targetRef.unitId] : undefined;
    if (
      chosen &&
      isUnitAlive(chosen) &&
      chosen.controllerId === playerId &&
      chosen.type === "ranged" &&
      (!chosen.activatedThisRound || effect.allowAlreadyActivated) &&
      chosen.id !== state.combat?.activeUnitId
    ) {
      appendEvent(state, {
        type: "UNIT_ABILITY_TRIGGERED",
        unitId: chosen.id,
        abilityId: card.id,
        message: `${card.name} activates ${chosen.cardName} out of order.`
      });
      // Valeska's Marksmen VI re-fires a unit that already acted: clear its spent
      // flag so the out-of-order activation is a full, fresh turn.
      chosen.activatedThisRound = false;
      setActiveUnit(state, chosen.id);
      // Do not immediately re-open the pre-activation window on the unit we just
      // chose ("not repeatedly right after the current use"): mark it offered so
      // the chosen unit takes its turn now. Any remaining interrupt — another
      // Bowstring, a Sorrow — surfaces at the NEXT genuine activation frame, once
      // this unit has acted and the next unit comes up.
      chosen.preActivationWindowOffered = true;
    }
    closeReactionWindow(state, "reaction-played");
    if (!finishCombatIfNeeded(state)) {
      state.phase = "combat";
    }
    return { windowEnded: true };
  }

  // Empower: cast windows feed the pending spell; attack windows build the
  // Power pool a spell instant in the same declaration consumes. The
  // rulebook allows stacking several Empower plays to reach a threshold.
  if (effect.type === "ADD_SPELL_POWER" && stackItem) {
    // School-restricted Power (Orbs, Basic-School Magic) on an attack may only
    // fuel a spell instant of the matching school already played into it — the
    // cast-window school gate above covers CAST_SPELL; this covers attacks.
    if (
      effect.schoolOnly &&
      (stackItem.action.type === "ATTACK_UNIT" || stackItem.action.type === "MOVE_AND_ATTACK_UNIT")
    ) {
      const matchesSchool = stackItem.modifiers.playedCardIds.some((id) => {
        const played = cards[id];
        const schools = played?.spellSchools ?? [];
        return played?.kind === "spell" && (schools.includes(effect.schoolOnly!) || schools.includes("any"));
      });
      if (!matchesSchool) {
        throw new Error(`${card.name} only empowers ${effect.schoolOnly} spells.`);
      }
    }
    if (effect.perCostCard) {
      effectAmount += effect.perCostCard * costCardsPaid;
    }
    // Attack windows pool Power per caster; a spell cast on your own turn uses
    // the single spellPowerBonus.
    if (isAttackStackItem(stackItem)) {
      addAttackPower(stackItem, playerId, effectAmount);
    } else {
      stackItem.modifiers.spellPowerBonus += effectAmount;
    }
    stackItem.modifiers.playedCardIds.push(play.cardId);
    recomputePowerScaledAttackInstants(stackItem);
    if (effect.drawCards) {
      drawCardsForPlayer(state, playerId, effect.drawCards);
    }
  }

  // Tome of X (option B): "resolve its effect without paying the Power cost."
  // Top up the pending cast to the spell's maximum Power breakpoint through the
  // normal Power channel, so every readout, the Resistance gate and a later
  // Mysticism recall (this Tome is in playedCardIds) all stay consistent.
  if (effect.type === "SET_SPELL_POWER_MAX" && stackItem?.action.type === "CAST_SPELL") {
    const target = spellMaxPowerBreakpoint(cards[stackItem.action.cardId]);
    const current = getCurrentSpellPower(state, stackItem, cards);
    if (target > current) {
      stackItem.modifiers.spellPowerBonus += target - current;
    }
    stackItem.modifiers.playedCardIds.push(play.cardId);
    recomputePowerScaledAttackInstants(stackItem);
  }

  if (effect.type === "GAIN_MORALE") {
    if (mode === "expert" && effect.expertDrawCards) {
      drawCardsForPlayer(state, playerId, effect.expertDrawCards);
    }
    changeMorale(state, playerId, effect.amount);
  }

  if (
    effect.type === "ADD_COMBAT_STAT" &&
    (stackItem?.action.type === "ATTACK_UNIT" || stackItem?.action.type === "MOVE_AND_ATTACK_UNIT")
  ) {
    const attacker = state.combat?.units[stackItem.action.attackerId];
    const defender = state.combat?.units[stackItem.action.defenderId];
    const affectedUnit = effect.stat === "attack" ? attacker : defender;

    // Bloodlust/Precision/Golden Bow restrict which unit types benefit.
    if (effect.unitTypes && affectedUnit && !effect.unitTypes.includes(affectedUnit.type)) {
      throw new Error(`${card.name} only affects ${effect.unitTypes.join("/")} units.`);
    }

    // Magic Resistance: the unit the buff/nerf lands on (a Dwarf) rolls to shrug
    // the whole Spell off — the attacker for an attack change (Bloodlust/Bless's
    // bonus), the defender for a defense change (Curse). Only Spells roll: the
    // artifacts that share this effect (Sword of Judgement, the Gnoll relics) are
    // not Spells. Negated → the card is spent but moves no stat on that unit.
    if (
      card.kind === "spell" &&
      affectedUnit &&
      negatesCardOnDwarfRoll(state, { type: "unit", unitId: affectedUnit.id }, card.name)
    ) {
      stackItem.modifiers.playedCardIds.push(play.cardId);
      return { windowEnded: false };
    }

    // Spell instants scale with the Power played alongside them in this
    // window; cost-paid plays (Sword of Judgement) scale per discarded card.
    // A scroll spell ignores the window's Power pool — it is locked to power 0.
    // Adrienne's Fire Magic adds +1/+2 Power to her School-of-Fire instants
    // (Curse), a constant offset folded into the Power for the amount lookup.
    const instantSchoolPowerBonus =
      effect.amountByPower && card.kind === "spell" && !play.fromScroll
        ? getSchoolPowerBonus(state, playerId, card)
        : 0;
    if (effect.amountByPower && card.kind === "spell") {
      const power = play.fromScroll ? 0 : attackPowerFor(stackItem, playerId) + instantSchoolPowerBonus;
      effectAmount = getAmountByPower(effect.amountByPower, effect.amount, power);
    }
    if (effect.perCostCard) {
      effectAmount += effect.perCostCard * costCardsPaid;
    }

    // Hero specialties double their bonus when the signature unit is the one
    // attacking (attack bonus) or being attacked (defense bonus). Mutare's
    // "a Dragons unit" matches the whole Dragons family, not one exact name.
    // Ivor's Elves IV doubles for the unit TYPE instead (his "ranged" unit).
    // Cyra's Haste IV instead doubles when the attacked unit is faster than the
    // attacker (a strictly higher effective Initiative).
    const defenderIsFaster =
      Boolean(effect.doubleIfDefenderInitiativeHigher) &&
      Boolean(attacker) &&
      Boolean(defender) &&
      effectiveInitiative(defender!, state.activeEffects) > effectiveInitiative(attacker!, state.activeEffects);
    // Gundula IV: doubles when YOUR (attacking) unit is strictly faster than the
    // attacked unit — the mirror of Cyra's defender-faster condition.
    const attackerIsFaster =
      Boolean(effect.doubleIfAttackerInitiativeHigher) &&
      Boolean(attacker) &&
      Boolean(defender) &&
      effectiveInitiative(attacker!, state.activeEffects) > effectiveInitiative(defender!, state.activeEffects);
    const matchesDoubledType = Boolean(effect.doubleForUnitType) && affectedUnit?.type === effect.doubleForUnitType;
    const doubleFactor =
      unitMatchesSpecialtyName(affectedUnit?.name, effect.doubleForUnitName) ||
      matchesDoubledType ||
      defenderIsFaster ||
      attackerIsFaster
        ? 2
        : 1;
    // Merist's Stone Skin I: a defense reaction grants extra Defense when the
    // buffed (defending) unit is orthogonally adjacent to the attacker. The
    // double factor scales the printed bonus only; the adjacency bonus is added
    // flat on top (it is "+1 more", not part of the doubled signature bonus).
    const adjacencyDefenseBonus =
      effect.stat === "defense" &&
      effect.extraIfAdjacentToAttacker &&
      affectedUnit &&
      attacker &&
      isAdjacent(affectedUnit.position, attacker.position)
        ? effect.extraIfAdjacentToAttacker
        : 0;
    const appliedAmount = effectAmount * doubleFactor + adjacencyDefenseBonus;

    if (effect.stat === "attack") {
      stackItem.modifiers.attackBonus += appliedAmount;
    } else {
      stackItem.modifiers.defenseBonus += appliedAmount;
    }
    stackItem.modifiers.playedCardIds.push(play.cardId);

    // A Power-scaling spell instant (Bloodlust, Precision, Curse, Weakness…)
    // is recorded so Power the caster pays LATER in this same attack window
    // re-derives its bonus from the new total Power. Scroll spells are locked
    // to power 0 and never recorded. The non-spell Attack/Defense statistic is
    // a flat bonus that does not scale, so it is not recorded either.
    if (effect.amountByPower && card.kind === "spell" && !play.fromScroll) {
      const fixedBonus = effect.perCostCard ? effect.perCostCard * costCardsPaid : 0;
      (stackItem.modifiers.powerScaledAttackInstants ??= []).push({
        cardId: card.id,
        playerId,
        stat: effect.stat,
        amountByPower: effect.amountByPower,
        baseAmount: effect.amount,
        fixedBonus,
        schoolPowerBonus: instantSchoolPowerBonus,
        doubleFactor,
        appliedAmount
      });
    }

    // Precision lifts the ranged penalty for this shot.
    if (effect.ignoreRangedPenalty) {
      stackItem.modifiers.ignoreRangedPenalty = true;
    }

    // Sword of Hellfire / Shield of the Damned: the boosted unit pays in blood.
    if (effect.selfDamage && affectedUnit && state.combat) {
      affectedUnit.damage += effect.selfDamage;
      appendEvent(state, {
        type: "DAMAGE_ASSIGNED",
        source: { type: "card", cardId: card.id, controllerId: playerId },
        target: { type: "unit", unitId: affectedUnit.id },
        amount: effect.selfDamage,
        damageKind: "effect"
      });
      markUnitRemovedIfNeeded(state, affectedUnit);
    }

    // The Gnoll artifacts' stronger side: the boosted unit takes a lasting
    // token until the end of the Combat — a Weakness token (−attack) for the
    // Buckler of the Gnoll King, a Corrosion token (−defense) for the Greater
    // Gnoll's Flail. Both are floored at 0 by the attack/defense maths.
    if (effect.selfStatPenalty && affectedUnit && state.combat) {
      if (effect.selfStatPenalty.stat === "attack") {
        placeCombatToken(state, affectedUnit, "weakness", -effect.selfStatPenalty.amount, card.name);
      } else {
        placeCombatToken(state, affectedUnit, "corrosion", effect.selfStatPenalty.amount, card.name);
      }
    }

    // Ash's Bloodlust: the buffed attack "places a Black cube" on the attacker
    // (it spends its Retaliation once the attack resolves) and, at level VI, the
    // attack also "ignores Retaliation Attacks". Both ride the pending attack so
    // they are applied when finishResolvedAttack settles this strike.
    if (effect.placeBlackCube) {
      stackItem.modifiers.setRetaliatedOnAttacker = true;
    }
    if (effect.ignoresRetaliation) {
      stackItem.modifiers.ignoresRetaliationThisAttack = true;
    }
    // Tarnum (Fortress) Basilisks VI: this buffed attack also fires every
    // die-gated after-attack ability of the attacker regardless of the roll.
    if (effect.forceAbilityRolls) {
      stackItem.modifiers.forceAbilityRollsThisAttack = true;
    }

    if (effect.drawCards) {
      drawCardsForPlayer(state, playerId, effect.drawCards);
    }

    // Blackshard of the Dead Knight: the option discarded 1 card; draw 1 only
    // when that paid card was a Spell. The cost cards were already moved to the
    // discard pile by payOptionCardCost above, so inspect the paid ids.
    if (effect.drawIfCostCardSpell && (play.costCardIds ?? []).some((id) => cards[id]?.kind === "spell")) {
      drawCardsForPlayer(state, playerId, 1);
    }

    // Spells (Curse/Weakness/Bloodlust/Precision) may be cancelled by the other
    // side's Resistance; the Attack/Defense statistics and Gnoll artifacts that
    // share this effect are not Spells, so they are never recorded.
    if (card.kind === "spell") {
      (stackItem.modifiers.cancellableSpellInstants ??= []).push({ cardId: card.id, playerId });
    }
  }

  // Shield of the Dwarven Lords: played in the post-roll window. Arm the pending
  // attack so finishResolvedAttack treats the rolled die as ignored (0) and
  // fires none of the effects that die face would have triggered.
  if (
    effect.type === "IGNORE_ATTACK_DIE_RESULT" &&
    (stackItem?.action.type === "ATTACK_UNIT" || stackItem?.action.type === "MOVE_AND_ATTACK_UNIT")
  ) {
    stackItem.modifiers.attackDieCancelled = true;
    stackItem.modifiers.playedCardIds.push(play.cardId);
  }

  // Ivor's Elves I / VI: force this attack's die to a fixed face. Unlike Bless
  // (which ignores the die) or the Dwarven Lords' cancel (which fires no
  // die-triggered effects), the die genuinely SHOWS this value — so a "0" still
  // triggers any "0"-face ability — it simply is not random. Clamp to a real
  // attack-die face so a stray value can never desync the die-face readers.
  if (
    effect.type === "FORCE_ATTACK_ROLL" &&
    (stackItem?.action.type === "ATTACK_UNIT" || stackItem?.action.type === "MOVE_AND_ATTACK_UNIT")
  ) {
    stackItem.modifiers.forcedRoll = Math.max(-1, Math.min(1, Math.trunc(effect.value)));
    stackItem.modifiers.playedCardIds.push(play.cardId);
  }

  // Lord Haart (Necropolis) Dread Knights I/VI: played as an instant when an
  // enemy declares a Retaliation Attack against one of your units. Knock the
  // reduction off THIS retaliation's strike, doubled when the unit being
  // retaliated against (the retaliation's defender) is his Dread Knights. The
  // legal-action layer already restricted this to a retaliation aimed at the
  // reacting player's own unit; the amount lands on the pending attack and is
  // consumed when it resolves.
  if (
    effect.type === "REDUCE_RETALIATION_DAMAGE" &&
    (stackItem?.action.type === "ATTACK_UNIT" || stackItem?.action.type === "MOVE_AND_ATTACK_UNIT")
  ) {
    const defender = state.combat?.units[stackItem.action.defenderId];
    const amount = doubleAmountForUnitName(effect.amount, defender, effect.doubleForUnitName);
    stackItem.modifiers.retaliationDamageReductionInstant =
      (stackItem.modifiers.retaliationDamageReductionInstant ?? 0) + amount;
    stackItem.modifiers.playedCardIds.push(play.cardId);
  }

  // Misfortune: played in its own pre-buff window. Lock the pending attack — the
  // attacker can no longer increase their attack from any source for this attack
  // (the legal-action layer refuses every attack-buff to them) and the Attack die
  // is cancelled (face 0, no die-triggered effects). Clearing the misfortune
  // phase hands the window over to the normal buff exchange, now with the
  // attacker's buffs locked out. Counts as the defender's Spell (noteSpellCast
  // already ran above).
  if (
    effect.type === "NEGATE_ATTACK" &&
    (stackItem?.action.type === "ATTACK_UNIT" || stackItem?.action.type === "MOVE_AND_ATTACK_UNIT")
  ) {
    stackItem.modifiers.negateAttackBuffs = true;
    stackItem.modifiers.attackDieCancelled = true;
    stackItem.modifiers.misfortunePhase = false;
    stackItem.modifiers.playedCardIds.push(play.cardId);
  }

  // Bless: the pending attack skips its Attack die (and may gain attack).
  if (
    effect.type === "IGNORE_ATTACK_DIE" &&
    (stackItem?.action.type === "ATTACK_UNIT" || stackItem?.action.type === "MOVE_AND_ATTACK_UNIT")
  ) {
    // Magic Resistance: the blessed unit (a Dwarf) rolls to shrug Bless off.
    const blessTarget = state.combat?.units[stackItem.action.attackerId];
    if (
      card.kind === "spell" &&
      blessTarget &&
      negatesCardOnDwarfRoll(state, { type: "unit", unitId: blessTarget.id }, card.name)
    ) {
      stackItem.modifiers.playedCardIds.push(play.cardId);
      return { windowEnded: false };
    }
    stackItem.modifiers.ignoreAttackDie = true;
    if (effect.attackBonusByPower) {
      const blessBonus = getAmountByPower(
        effect.attackBonusByPower,
        0,
        play.fromScroll ? 0 : attackPowerFor(stackItem, playerId)
      );
      stackItem.modifiers.attackBonus += blessBonus;
      // Bless's Power-scaled attack bonus can also grow with Power paid later.
      if (!play.fromScroll) {
        (stackItem.modifiers.powerScaledAttackInstants ??= []).push({
          cardId: card.id,
          playerId,
          stat: "attack",
          amountByPower: effect.attackBonusByPower,
          baseAmount: 0,
          fixedBonus: 0,
          doubleFactor: 1,
          appliedAmount: blessBonus
        });
      }
    }
    stackItem.modifiers.playedCardIds.push(play.cardId);
    (stackItem.modifiers.cancellableSpellInstants ??= []).push({ cardId: card.id, playerId });
  }

  // Frenzy: the pending attack ignores the attacked unit's Defense (counts as 0).
  // Gated by the defender's grade. With gradeByPower it scales with the caster's
  // pooled attack-window Power: the table + caster are stored and the pierced
  // grade is re-derived at resolution (so Power paid after Frenzy keeps lifting
  // bronze→silver→gold). The legacy fixed-grade form sets ignoreDefense at once.
  if (
    effect.type === "IGNORE_DEFENSE" &&
    (stackItem?.action.type === "ATTACK_UNIT" || stackItem?.action.type === "MOVE_AND_ATTACK_UNIT")
  ) {
    if (effect.gradeByPower) {
      stackItem.modifiers.ignoreDefenseGradeByPower = effect.gradeByPower;
      stackItem.modifiers.ignoreDefenseCasterId = playerId;
      // Adrienne's Fire Magic lifts a fire Frenzy's pierced grade by her bonus.
      stackItem.modifiers.ignoreDefenseSchoolPowerBonus = play.fromScroll
        ? 0
        : getSchoolPowerBonus(state, playerId, card);
    } else if (effect.grade) {
      const defender = state.combat?.units[stackItem.action.defenderId];
      if (defender && gradeRankOfUnit(defender) <= gradeRank(effect.grade)) {
        stackItem.modifiers.ignoreDefense = true;
      }
    }
    stackItem.modifiers.playedCardIds.push(play.cardId);
  }

  if (
    effect.type === "TRIPLE_ATTACK_DIE" &&
    (stackItem?.action.type === "ATTACK_UNIT" || stackItem?.action.type === "MOVE_AND_ATTACK_UNIT")
  ) {
    stackItem.modifiers.attackDieMultiplier = (stackItem.modifiers.attackDieMultiplier ?? 1) * 3;
    stackItem.modifiers.playedCardIds.push(play.cardId);
  }

  // Slayer: arm the pending attack to roll the die N times (by Power) and apply
  // every result but a "-1", then draw 1 card. Resolved in resolveAttackStackItem.
  // The gold defender's Magic Resistance (a Dwarf) may shrug the Spell off first;
  // when it does, the attack rolls its normal single die and Slayer adds nothing.
  // The power table is stored so the roll count keeps scaling as more Power is
  // paid into this attack window after Slayer was played.
  if (
    effect.type === "SLAYER_ATTACK" &&
    (stackItem?.action.type === "ATTACK_UNIT" || stackItem?.action.type === "MOVE_AND_ATTACK_UNIT")
  ) {
    stackItem.modifiers.playedCardIds.push(play.cardId);
    const defenderRef: TargetRef = { type: "unit", unitId: stackItem.action.defenderId };
    if (!negatesCardOnDwarfRoll(state, defenderRef, card.name)) {
      // Adrienne's Fire Magic adds her bonus to a fire Slayer's roll-count Power.
      const slayerSchoolBonus = play.fromScroll ? 0 : getSchoolPowerBonus(state, playerId, card);
      const power = play.fromScroll ? 0 : attackPowerFor(stackItem, playerId) + slayerSchoolBonus;
      stackItem.modifiers.slayerRolls = getAmountByPower(effect.rollsByPower, 2, power);
      stackItem.modifiers.slayerDraw = true;
      // Scroll casts are locked to power 0 and never grow, so they are not recorded.
      if (!play.fromScroll) {
        stackItem.modifiers.slayerRollsByPower = effect.rollsByPower;
        stackItem.modifiers.slayerSchoolPowerBonus = slayerSchoolBonus;
      }
      (stackItem.modifiers.cancellableSpellInstants ??= []).push({ cardId: card.id, playerId });
    }
  }

  if (effect.type === "CREATE_ACTIVE_EFFECT") {
    const effectCountBefore = state.activeEffects.length;
    createActiveEffectFromCard(state, card, effect, playerId, mode);
    holdOngoingCardIfEffectCreated(state, playerId, play.cardId, effectCountBefore, "discard");
    stackItem?.modifiers.playedCardIds.push(play.cardId);
  }

  if (effect.type === "DRAW_CARDS") {
    drawCardsForPlayer(state, playerId, effectAmount);
    stackItem?.modifiers.playedCardIds.push(play.cardId);
  }

  // Kriv (Bulwark)'s rune-synergy specialty played as a REACTION to an enemy
  // attack: bank the Runes (and draw the bundled card on I/IV) right here, while
  // the attack is still paused on the stack. gainRunes → syncRuneEffects applies
  // any newly-crossed Rune Level's army-wide buff IMMEDIATELY, so a +Defense (or
  // +Attack for the coming retaliation) is live before this very attack resolves —
  // the "receive the buff earlier" play. No-op for a non-Bulwark reactor.
  if (effect.type === "GAIN_RUNES") {
    gainRunes(state, playerId, effect.amount);
    if (effect.drawCards) {
      drawCardsForPlayer(state, playerId, effect.drawCards);
    }
    stackItem?.modifiers.playedCardIds.push(play.cardId);
  }

  if (effect.type === "RECALL_SPELL" && stackItem?.action.type === "CAST_SPELL") {
    const caster = state.players[playerId];

    // The recall is deferred to the spell's resolution: an instant spell
    // comes straight back, an ongoing spell (Summon/Clone-style) only after
    // its effect ends — Knowledge cannot loop it onto the table twice.
    stackItem.modifiers.recallSpell = {
      toHand: true,
      recallPlayedCards: mode === "expert" && Boolean(effect.expertRecallPlayedCards)
    };

    // Empowered Knowledge raises the limit on the basic play; the regular
    // card only on the expert play.
    caster.combatStats.spellLimitBonusThisRound += effect.basicSpellLimitBonus ?? 0;
    if (mode === "expert") {
      caster.combatStats.spellLimitBonusThisRound += effect.expertSpellLimitBonus ?? 0;
    }

    stackItem.modifiers.playedCardIds.push(play.cardId);
  }

  // Interference: react to an enemy damaging Spell aimed at one of your units
  // by granting that unit +1 (expert +2) Defense for the rest of the Combat —
  // a bonus that also reduces Spell damage (DEFENSE_BONUS for attacks,
  // SPELL_DAMAGE_REDUCTION for spells). Created here, before the pending Spell
  // resolves (the reaction window closes first), so it softens the very Spell
  // that triggered it and every later Spell that hits the same unit.
  if (effect.type === "INTERFERE_SPELL" && stackItem?.action.type === "CAST_SPELL") {
    const targetRef = stackItem.action.target;
    const targetUnit = targetRef.type === "unit" ? state.combat?.units[targetRef.unitId] : undefined;
    // The legal-reaction gate already restricts this to the reacting player's
    // own targeted unit; re-checked here so a stale window can never buff an
    // enemy unit or a dead one.
    if (targetUnit && targetUnit.controllerId === playerId && isUnitAlive(targetUnit)) {
      createActiveEffect(
        state,
        {
          // Interference → "Interference"/"Expert Interference"; Plate of the
          // Dying Light reuses this effect and names it after the artifact.
          name: mode === "expert" ? `Expert ${card.name}` : card.name,
          scope: "unit",
          duration: { type: "combat" },
          polarity: "positive",
          removable: true,
          modifiers: [
            { type: "DEFENSE_BONUS", amount: effectAmount },
            { type: "SPELL_DAMAGE_REDUCTION", amount: effectAmount }
          ]
        },
        { type: "card", cardId: card.id, controllerId: playerId },
        playerId,
        { type: "unit", unitId: targetUnit.id }
      );
    }
    stackItem.modifiers.playedCardIds.push(play.cardId);
  }

  // Interference / Plate of the Dying Light played as a plain DEFENSE reaction to
  // a physical attack (their "+X defense" base mirrors Armorer). Grant the unit
  // being attacked the same Combat-long +Defense; its SPELL_DAMAGE_REDUCTION half
  // is simply inert against an attack. Created before the attack resolves, so
  // getActiveDefenseBonus folds it into the very hit that triggered it and every
  // later hit on that unit.
  if (
    effect.type === "INTERFERE_SPELL" &&
    (stackItem?.action.type === "ATTACK_UNIT" || stackItem?.action.type === "MOVE_AND_ATTACK_UNIT")
  ) {
    const defendingUnit = state.combat?.units[stackItem.action.defenderId];
    if (defendingUnit && defendingUnit.controllerId === playerId && isUnitAlive(defendingUnit)) {
      createActiveEffect(
        state,
        {
          name: mode === "expert" ? `Expert ${card.name}` : card.name,
          scope: "unit",
          duration: { type: "combat" },
          polarity: "positive",
          removable: true,
          modifiers: [
            { type: "DEFENSE_BONUS", amount: effectAmount },
            { type: "SPELL_DAMAGE_REDUCTION", amount: effectAmount }
          ]
        },
        { type: "card", cardId: card.id, controllerId: playerId },
        playerId,
        { type: "unit", unitId: defendingUnit.id }
      );
    }
    stackItem.modifiers.playedCardIds.push(play.cardId);
  }

  // Alamar's Resurrection: arm the pending attack so it is cancelled at
  // resolution if it would destroy the defending unit. It guards against
  // normal attacks only — never spells or specialty damage. The discard cost
  // was paid above.
  if (
    effect.type === "CANCEL_LETHAL_ATTACK" &&
    (stackItem?.action.type === "ATTACK_UNIT" || stackItem?.action.type === "MOVE_AND_ATTACK_UNIT")
  ) {
    stackItem.modifiers.cancelLethal = { unitId: stackItem.action.defenderId, grade: effect.grade };
    stackItem.modifiers.playedCardIds.push(play.cardId);
  }

  // First Aid (basic) played as an instant reaction the moment your unit is
  // attacked (firstAidCardHealReactions): mend `amount` existing damage on the
  // chosen friendly unit BEFORE the hit is calculated, then leave the window
  // open so the paused attack resumes — the healed unit may now survive a blow
  // that would otherwise defeat it. The chosen unit rides on play.target (one
  // offer per wounded friendly). The card's expert side never reaches here — it
  // rides the First Aid Tent (USE_ACTIVE_EFFECT, mode "expert"), not a card play.
  // Naming the card as the heal's source keeps the cure FX/sound firing.
  if (effect.type === "HEAL_DAMAGE" && play.target?.type === "unit") {
    const unit = state.combat?.units[play.target.unitId];
    if (unit && unit.controllerId === playerId && isUnitAlive(unit)) {
      healUnitDamage(
        state,
        { type: "card", cardId: card.id, controllerId: playerId },
        play.target,
        getEffectDamageAmount(effect, card.power ?? 0)
      );
      // Rion's Battlefield Medic shares this effect: also clear paralysis / draw.
      if (effect.removeParalysis && hasToken(unit, "paralysis")) {
        removeToken(state, unit, "paralysis", "dispelled");
      }
      if (effect.drawCards) {
        drawCardsForPlayer(state, playerId, effect.drawCards);
      }
    }
  }

  // Targ of the Rampaging Ogre (top side): "instead of discarding, put this card
  // back into your hand." The card was moved to the discard pile above; now that
  // its effect has applied, pull it back to hand. The cost cards it discarded
  // stay discarded. Never combines with a removeSelf option or a scroll play.
  if (option?.returnSelfToHand && !play.fromScroll && !option.cost?.removeSelf) {
    const owner = state.players[playerId];
    const discardIndex = owner?.discard.lastIndexOf(play.cardId) ?? -1;
    if (owner && discardIndex !== -1) {
      owner.discard.splice(discardIndex, 1);
      owner.hand.push(play.cardId);
    }
  }

  return { windowEnded: false };
}

function advanceReactionWindowAfterPlay(state: GameState, playerId: PlayerId, cards: CardLibrary): void {
  if (!state.reactionWindow) {
    return;
  }

  // A fresh play clears everyone's earlier pass so opponents get a new chance
  // to respond once this player is finished.
  state.reactionWindow.passedPlayerIds = [];
  refreshReactionWindowLegalReactions(state, cards);

  if (state.reactionWindow.allowedPlayerIds.length === 0) {
    closeReactionWindow(state, "all-pass");
    resolveTopStack(state, cards);
    return;
  }

  // The player who just acted KEEPS priority so they can commit several
  // instants in a row before opponents respond — e.g. stacking Power on their
  // own spell cast. This matches the board game, where the caster finishes
  // empowering and only then is Resistance / a counter decided against the
  // FINAL power. Priority moves on only when they pass (passReaction) or run
  // out of legal plays (then refreshReactionWindowLegalReactions hands it to
  // the next allowed player). Previously priority advanced after a single
  // play, stranding a caster who wanted to add a second Power card.
  const allowedPlayerIds = state.reactionWindow.allowedPlayerIds;
  const keepPriority = allowedPlayerIds.includes(playerId) ? playerId : allowedPlayerIds[0];
  state.reactionWindow.priorityPlayerId = keepPriority;
  state.priorityPlayerId = keepPriority;
}

/** Basic X Magic's expert side: +3 Power for a matching-school spell. */
const SCHOOL_FETCH_EXPERT_POWER = 3;

/**
 * Basic X Magic (the in-play spell-fetch permanent): spend an expert use to add
 * +3 Power to a matching-school spell you are casting now — a normal cast (into
 * the cast's School power) or an instant played into an attack (into your own
 * attack-window Power pool, re-derived like any other paid Power). The fetch
 * permanent stays in play; nothing is discarded. Once per stack per player.
 */
function applySchoolFetchExpert(
  state: GameState,
  action: Extract<GameAction, { type: "USE_SCHOOL_FETCH_EXPERT" }>
): void {
  const player = state.players[action.playerId];
  if (!player) {
    throw new Error("Unknown player.");
  }
  if (!activeSchoolFetches(state, action.playerId).includes(action.school as "air" | "earth" | "fire" | "water")) {
    throw new Error("No Basic Magic of that school is in play.");
  }

  const stackItem = state.stack.at(-1);
  if (!stackItem) {
    throw new Error("The +3 expert needs one of your spells being cast.");
  }

  const usedBy = (stackItem.modifiers.schoolFetchExpertUsedBy ??= []);
  if (usedBy.includes(action.playerId)) {
    throw new Error("The Basic Magic +3 expert is already applied here.");
  }

  const expertUsesLeft =
    player.limits.expertUses +
    (player.combatStats.expertUseBonusThisRound ?? 0) -
    player.combatStats.expertUsesSpentThisRound;
  if (expertUsesLeft <= 0) {
    throw new Error("No expert uses are available this combat round.");
  }

  if (stackItem.action.type === "CAST_SPELL") {
    const castSchools = cardLibrary[stackItem.action.cardId]?.spellSchools ?? [];
    const matchesCast = castSchools.includes(action.school) || castSchools.includes("any");
    if (stackItem.action.playerId !== action.playerId || !matchesCast) {
      throw new Error("That cast does not match the Basic Magic school.");
    }
    if (stackItem.modifiers.scrollLocked) {
      throw new Error("A Spell Scroll cast is locked to Power 0.");
    }
    stackItem.modifiers.schoolPowerBonus = (stackItem.modifiers.schoolPowerBonus ?? 0) + SCHOOL_FETCH_EXPERT_POWER;
  } else if (isAttackStackItem(stackItem)) {
    if (!playerHasAttackInstantOfSchool(stackItem, action.playerId, action.school)) {
      throw new Error("You have no matching-school spell instant on this attack to empower.");
    }
    addAttackPower(stackItem, action.playerId, SCHOOL_FETCH_EXPERT_POWER);
    recomputePowerScaledAttackInstants(stackItem);
  } else {
    throw new Error("The +3 expert needs one of your spells.");
  }

  usedBy.push(action.playerId);
  player.combatStats.expertUsesSpentThisRound += 1;
  appendEvent(state, {
    type: "CARD_PLAYED",
    playerId: action.playerId,
    cardId: `ability.basic_${action.school}_magic` as CardId,
    timing: "instant",
    mode: "expert",
    effectAmount: SCHOOL_FETCH_EXPERT_POWER
  });
}

/**
 * Closes the end-of-combat notice for an adventure combat: the next
 * automation pass runs finalizeAdventureCombat (XP, unit flips, the visit).
 */
function acknowledgeCombatEnd(
  state: GameState,
  action: Extract<GameAction, { type: "ACKNOWLEDGE_COMBAT_END" }>
): void {
  const combat = state.combat;
  if (!combat || !combat.outcome) {
    throw new Error("No finished combat to acknowledge.");
  }

  if (combat.context.kind === "sandbox") {
    throw new Error("The battle simulator stays on the table — reset it instead.");
  }

  if (combat.attackerPlayerId !== action.playerId && combat.defenderPlayerId !== action.playerId) {
    throw new Error("Only a combat participant may close the combat.");
  }

  combat.endAcknowledged = true;
}

function playReaction(
  state: GameState,
  action: Extract<GameAction, { type: "PLAY_REACTION" }>,
  cards: CardLibrary
): void {
  // Tarnum (Conflux) VI played AS a reaction: consume the specialty (it cycles to
  // the caster's discard) and open the per-search deck choice. The Search runs
  // inside the still-open reaction window; once it finishes, resolveTarnumSearch
  // re-derives the window's offers (so a just-Searched applicable instant can be
  // cast into the SAME window) and hands priority back to the caster. The window
  // is not advanced/closed here — that happens after the Search resolves.
  const reactionCardEffect = cards[action.cardId]?.effect;
  if (reactionCardEffect?.type === "TARNUM_OVERLIMIT_SEARCH") {
    if (!state.reactionWindow) {
      throw new Error("No reaction window is open.");
    }
    const moveError = moveCardFromHandToDiscard(state, action.playerId, action.cardId, "discard");
    if (moveError) {
      throw new Error(moveError.message);
    }
    // A fresh reaction clears everyone's prior pass so opponents get a new look.
    state.reactionWindow.passedPlayerIds = [];
    openTarnumSearch(state, action.playerId, reactionCardEffect.count);
    return;
  }

  // Power has no standalone effect during an attack UNLESS a Power-scaling
  // spell instant has already been played into this window: the caster keeps
  // priority and may keep empowering it (Bloodlust cast, then a Power card to
  // lift it further). With nothing on the table to empower, lone Power still
  // "dissipates" and is rejected — the same rule the batch validator enforces.
  if (state.reactionWindow?.triggerEvent.type === "UNIT_ATTACK_DECLARED") {
    const card = cards[action.cardId];
    const effect = card && !action.asPowerBoost ? getEffectiveCardEffect(card, action.optionIndex) : null;
    if (action.asPowerBoost || effect?.type === "ADD_SPELL_POWER") {
      const stackItem = state.stack.at(-1);
      const attackOwner =
        stackItem?.action.type === "ATTACK_UNIT" || stackItem?.action.type === "MOVE_AND_ATTACK_UNIT"
          ? stackItem.action.playerId
          : undefined;
      // This player may keep empowering a Power-scaling spell instant THEY cast
      // into the attack — the attacker's Bloodlust/Slayer/Frenzy, or the
      // defender's Curse/Weakness. Lone Power with nothing of yours to feed still
      // dissipates.
      const empowerable =
        (stackItem?.modifiers.powerScaledAttackInstants ?? []).some((record) => record.playerId === action.playerId) ||
        (attackOwner === action.playerId && stackItem?.modifiers.slayerRollsByPower !== undefined) ||
        stackItem?.modifiers.ignoreDefenseCasterId === action.playerId;
      if (!empowerable) {
        throw new Error("Power can only be played into an attack together with a Spell card.");
      }
    }
  }

  const { windowEnded } = applyReactionPlayCore(state, action.playerId, action, cards);
  if (windowEnded) {
    return;
  }

  advanceReactionWindowAfterPlay(state, action.playerId, cards);
}

/**
 * Archangels' lethal save: cancel the killing blow with the unit's once-per-
 * combat ability instead of a card. Arms the pending attack's cancel (so it is
 * voided at resolution exactly like the Resurrection card/specialty) and shuts
 * the save window. The "resurrection" FX/sound fires when the attack resolves.
 */
function applyUnitResurrection(
  state: GameState,
  action: Extract<GameAction, { type: "USE_UNIT_RESURRECTION" }>,
  cards: CardLibrary
): void {
  const window = state.reactionWindow;
  if (!window || window.triggerEvent.type !== "UNIT_LETHAL_HIT" || window.priorityPlayerId !== action.playerId) {
    throw new Error("No lethal-save window is open for you.");
  }
  const combat = state.combat;
  const defender = combat?.units[window.triggerEvent.defenderId];
  const saver = combat?.units[action.savingUnitId];
  const pendingAttack = state.stack.find(
    (item) => item.action.type === "ATTACK_UNIT" || item.action.type === "MOVE_AND_ATTACK_UNIT"
  );
  if (!combat || !defender || !saver || !pendingAttack) {
    throw new Error("That resurrection cannot be used now.");
  }
  if (
    saver.controllerId !== action.playerId ||
    saver.id === defender.id ||
    saver.damage >= saver.maxHealth ||
    saver.usedLethalSaveThisCombat ||
    !getLethalSaveUnitAbility(saver)
  ) {
    throw new Error("That unit cannot cancel the killing blow.");
  }

  saver.usedLethalSaveThisCombat = true;
  // Grade-agnostic: matching the defender's own grade guarantees the cancel
  // passes the grade check at resolution.
  pendingAttack.modifiers.cancelLethal = { unitId: defender.id, grade: defender.grade };
  appendEvent(state, {
    type: "UNIT_ABILITY_TRIGGERED",
    unitId: saver.id,
    abilityId: "archangel-lethal-save",
    targetUnitId: defender.id,
    message: `${saver.cardName} readies to cancel the killing blow on ${defender.cardName}.`
  });

  advanceReactionWindowAfterPlay(state, action.playerId, cards);
}

/** WOG War Zealot's always-on Magic Mirror, resolved without spending a card. */
function applyUnitMagicMirror(
  state: GameState,
  action: Extract<GameAction, { type: "USE_UNIT_MAGIC_MIRROR" }>,
  cards: CardLibrary
): void {
  const window = state.reactionWindow;
  const combat = state.combat;
  const unit = combat?.units[action.unitId];
  const stackItem = state.stack.at(-1);
  if (!window || window.priorityPlayerId !== action.playerId || !combat || !unit || !stackItem) {
    throw new Error("No innate Magic Mirror window is open for you.");
  }
  if (unit.controllerId !== action.playerId || !isUnitAlive(unit) || !hasInnateMagicMirror(unit)) {
    throw new Error("That unit cannot use Magic Mirror.");
  }

  let candidates = spellRedirectTargets(state, unit.id, "azure");
  if (candidates.length === 0) {
    throw new Error("There is no legal new target for Magic Mirror.");
  }

  const choiceId = `choice_${nextEventNumber(state)}`;
  const baseChoice = {
    id: choiceId,
    type: "ABILITY_TARGET_CHOICE" as const,
    playerId: action.playerId,
    kind: "spell-redirect" as const,
    abilityId: "wog-war-zealot-mirror",
    abilityName: "Magic Mirror",
    prompt: "Magic Mirror: choose a new target.",
    sourceUnitId: unit.id,
    anchorUnitId: unit.id,
    candidateUnitIds: candidates.map((candidate) => candidate.id),
    optional: false
  };

  if (stackItem.action.type === "CAST_SPELL") {
    const fromTarget = stackItem.action.target;
    state.pendingChoice = {
      ...baseChoice,
      anchorUnitId: fromTarget.type === "unit" ? fromTarget.unitId : null
    };
  } else if (stackItem.action.type === "ATTACK_UNIT" || stackItem.action.type === "MOVE_AND_ATTACK_UNIT") {
    const found = reflectableAttackInstantForPlayer(state, stackItem, action.playerId, cards);
    if (!found || found.affectedUnitId !== unit.id) {
      throw new Error("There is no enemy Spell on that unit to reflect.");
    }
    candidates = spellRedirectTargets(state, found.affectedUnitId, "azure");
    const amount = attackInstantSignedAmount(stackItem, found.cardId, cards);
    reverseCancelledInstantSpell(stackItem, found.cardId, cards);
    stackItem.modifiers.cancellableSpellInstants?.splice(found.index, 1);
    state.pendingChoice = {
      ...baseChoice,
      candidateUnitIds: candidates.map((candidate) => candidate.id),
      redirectInstant: { stat: found.stat, amount, sourceCardId: found.cardId }
    };
  } else {
    throw new Error("Magic Mirror cannot reflect this effect.");
  }

  appendEvent(state, {
    type: "UNIT_ABILITY_TRIGGERED",
    unitId: unit.id,
    abilityId: "wog-war-zealot-mirror",
    message: `${unit.cardName} reflects the spell with Magic Mirror.`
  });
  appendEvent(state, {
    type: "PENDING_CHOICE_CREATED",
    choiceId,
    choiceType: "ABILITY_TARGET_CHOICE",
    playerId: action.playerId,
    sourceEffectIds: [],
    message: `${unit.cardName}: choose where to redirect the spell.`
  });
  closeReactionWindow(state, "reaction-played");
  state.phase = "choice";
  state.priorityPlayerId = action.playerId;
}

/**
 * Castle Halberdiers (Pack) "Parry": in the post-roll die-cancel window the
 * defending Halberdiers discard a card to ignore the attacker's settled Attack
 * die. Mirrors the Shield of the Dwarven Lords arm (attackDieCancelled → the die
 * counts as 0 and fires none of its face-triggered effects), but the cost is one
 * card from the controller's hand instead of a played card. Only valid on a "+1"
 * face (the legal-action layer offers it only then).
 */
function applyUnitDieIgnore(
  state: GameState,
  action: Extract<GameAction, { type: "USE_UNIT_DIE_IGNORE" }>,
  cards: CardLibrary
): void {
  const window = state.reactionWindow;
  if (!window || window.triggerEvent.type !== "ATTACK_DIE_SETTLED" || window.priorityPlayerId !== action.playerId) {
    throw new Error("No die-cancel window is open for you.");
  }
  const combat = state.combat;
  const defender = combat?.units[action.defenderUnitId];
  const pendingAttack = state.stack.find(
    (item) => item.action.type === "ATTACK_UNIT" || item.action.type === "MOVE_AND_ATTACK_UNIT"
  );
  const player = state.players[action.playerId];
  if (!combat || !defender || !pendingAttack || !player) {
    throw new Error("That die-cancel cannot be used now.");
  }
  if (
    defender.controllerId !== action.playerId ||
    !getDiscardToIgnoreAttackDieAbility(defender) ||
    pendingAttack.modifiers.attackDieCancelled ||
    window.triggerEvent.roll <= 0 ||
    player.hand.length === 0
  ) {
    throw new Error("That unit cannot ignore the Attack die now.");
  }

  // Pay the cost (one card discarded from hand), then treat the settled die as
  // ignored (0) — the same arm Shield of the Dwarven Lords uses.
  const discarded = discardRandomCardFromHand(state, action.playerId);
  pendingAttack.modifiers.attackDieCancelled = true;
  appendEvent(state, {
    type: "UNIT_ABILITY_TRIGGERED",
    unitId: defender.id,
    abilityId: "halberdier-die-ignore",
    targetUnitId: defender.id,
    message: discarded
      ? `${defender.cardName} discards a card to ignore the Attack die.`
      : `${defender.cardName} ignores the Attack die.`
  });

  advanceReactionWindowAfterPlay(state, action.playerId, cards);
}

function playReactions(
  state: GameState,
  action: Extract<GameAction, { type: "PLAY_REACTIONS" }>,
  cards: CardLibrary
): void {
  // Batch legality (validated up front) excludes window-ending effects, so
  // every play lands in the same window before priority moves on once.
  // Power is paid before the spell consumes it (rulebook Empower order):
  // process power-granting plays first so spell instants in the same batch
  // see the full Power pool.
  const isPowerPlay = (play: (typeof action.plays)[number]) => {
    if (play.asPowerBoost) {
      return true;
    }
    const card = cards[play.cardId];
    const effect = card ? getEffectiveCardEffect(card, play.optionIndex) : null;
    return effect?.type === "ADD_SPELL_POWER";
  };
  const ordered = [...action.plays.filter(isPowerPlay), ...action.plays.filter((play) => !isPowerPlay(play))];

  for (const play of ordered) {
    applyReactionPlayCore(state, action.playerId, play, cards);
  }

  advanceReactionWindowAfterPlay(state, action.playerId, cards);
}

/**
 * Sandro's Cloak of the Undead King: the specialty card leaves the hand and
 * is physically placed on a matching unit card, replacing its statistics
 * until that covering card is defeated. Placeable during your own combat
 * (on a combat unit) or on the map (on an army unit card). The card is not
 * discarded now — markUnitRemovedIfNeeded discards it when it is defeated.
 */
function playTransformCard(
  state: GameState,
  action: Extract<GameAction, { type: "PLAY_CARD" }>,
  card: CardDefinition,
  effect: Extract<ConcreteEffect, { type: "TRANSFORM_UNIT" }>
): void {
  const player = state.players[action.playerId];
  if (!player) {
    throw new Error("Unknown player.");
  }
  const ruleset = getRuleset(state);
  const entry = makeUnitTransformState(effect, card.id, ruleset, houseRuleEnabled(state, "sandro-skeleton-hp"));
  const sideOverrides = unitSideRuleOverrides(state);

  const removeFromHand = () => {
    const index = player.hand.indexOf(action.cardId);
    if (index === -1) {
      throw new Error(`${card.name} is not in your hand.`);
    }
    player.hand.splice(index, 1);
  };

  // A live (deployed) combat places the Cloak on a combat UNIT. The PvP prep
  // window is the exception: units are not on the board yet, so a prep play rides
  // the Cloak onto the ARMY CARD (the map path below) and it deploys covered.
  if (state.combat && !state.combat.prep) {
    const target = action.target?.type === "unit" ? action.target : undefined;
    const unit = target ? state.combat.units[target.unitId] : undefined;
    if (!unit || unit.controllerId !== action.playerId) {
      throw new Error(`${card.name} must be placed on one of your units.`);
    }
    if (!canPlaceTransformOn(unit.name, unit.variant, unit.transforms, effect)) {
      throw new Error(`${card.name} cannot be placed on ${unit.cardName}.`);
    }

    removeFromHand();
    unit.transforms = insertUnitTransform(unit.transforms, entry);
    applyUnitCurrentSide(unit, ruleset, sideOverrides);

    // Mirror onto the backing army card so the Cloak rides out of the combat.
    const armyUnit = player.army.find((candidate) => candidate.id === unit.armyUnitId);
    if (armyUnit) {
      armyUnit.transforms = insertUnitTransform(armyUnit.transforms, { ...entry });
    }

    appendEvent(state, {
      type: "UNIT_TRANSFORMED",
      unitId: unit.id,
      playerId: action.playerId,
      newName: effect.newName,
      byCardId: card.id
    });
    return;
  }

  // Map placement: cover an army unit card.
  const armyUnit = action.armyUnitId
    ? player.army.find((candidate) => candidate.id === action.armyUnitId)
    : undefined;
  if (!armyUnit) {
    throw new Error(`${card.name} must be placed on one of your unit cards.`);
  }
  const def = coreUnitDefinitions[armyUnit.unitDefId];
  if (!def || !canPlaceTransformOn(def.name, armyUnit.side, armyUnit.transforms, effect)) {
    throw new Error(`${card.name} cannot be placed on that unit card.`);
  }

  removeFromHand();
  armyUnit.transforms = insertUnitTransform(armyUnit.transforms, entry);

  appendEvent(state, {
    type: "UNIT_TRANSFORMED",
    unitId: armyUnit.id,
    playerId: action.playerId,
    newName: effect.newName,
    byCardId: card.id
  });
}

// ---------------------------------------------------------------------------
// Solmyr's Chain Lightning (I: 1/1/0, VI: 2/1/1)
// ---------------------------------------------------------------------------

/** Deals one bolt of Chain Lightning damage (spell damage) to a living unit. */
function dealChainLightningDamage(
  state: GameState,
  playerId: PlayerId,
  card: CardDefinition | undefined,
  unitId: UnitId,
  amount: number
): void {
  const unit = state.combat?.units[unitId];
  if (!unit || !isUnitAlive(unit) || amount <= 0) {
    return;
  }
  // Chain Lightning is Solmyr's Specialty: Steel Golems soften it and a
  // Specialty-immune unit (Azure/Black Dragon Pack) shrugs it off entirely.
  const dealt = reducedCardDamage(state, unit, card, amount);
  if (dealt <= 0) {
    return;
  }
  unit.damage += dealt;
  noteUnitDamagedForTokens(state, unit, dealt);
  appendEvent(state, {
    type: "DAMAGE_ASSIGNED",
    source: { type: "card", cardId: card?.id ?? "", controllerId: playerId },
    target: { type: "unit", unitId: unit.id },
    amount: dealt,
    damageKind: "spell"
  });
  markUnitRemovedIfNeeded(state, unit);
}

/**
 * The units the chain can reach: the two living units closest to the selected
 * unit, with every unit tied at the second-nearest distance included so the
 * caster picks which of them are struck. Friendly units count.
 */
function chainLightningReachable(state: GameState, primaryId: UnitId): UnitId[] {
  const combat = state.combat;
  const primary = combat?.units[primaryId];
  if (!combat || !primary) {
    return [];
  }
  const others = Object.values(combat.units)
    .filter((unit) => unit.id !== primaryId && isUnitAlive(unit))
    .map((unit) => ({ id: unit.id, distance: getBattlefieldDistance(primary.position, unit.position) }))
    .sort((left, right) => left.distance - right.distance || left.id.localeCompare(right.id));
  if (others.length <= 2) {
    return others.map((entry) => entry.id);
  }
  const boundary = others[1].distance;
  return others.filter((entry) => entry.distance <= boundary).map((entry) => entry.id);
}

/** Closest of `candidates` to the selected unit (id breaks ties), for forced hits. */
function closestChainTarget(state: GameState, primaryId: UnitId, candidates: UnitId[]): UnitId | null {
  const combat = state.combat;
  const primary = combat?.units[primaryId];
  if (!combat || !primary || candidates.length === 0) {
    return null;
  }
  return [...candidates]
    .filter((id) => combat.units[id] && isUnitAlive(combat.units[id]))
    .sort((left, right) => {
      const leftDistance = getBattlefieldDistance(primary.position, combat.units[left]!.position);
      const rightDistance = getBattlefieldDistance(primary.position, combat.units[right]!.position);
      return leftDistance - rightDistance || left.localeCompare(right);
    })[0] ?? null;
}

/**
 * Allocates the remaining Chain Lightning bolts among the reachable units. Each
 * nonzero value goes to one reachable unit; when more units than bolts remain
 * the caster chooses (otherwise the forced targets are auto-resolved). Opens an
 * ABILITY_TARGET_CHOICE when a genuine choice is needed, else finishes.
 */
function advanceChainLightning(
  state: GameState,
  playerId: PlayerId,
  card: CardDefinition | undefined,
  primaryId: UnitId,
  reachable: UnitId[],
  remaining: number[]
): void {
  const combat = state.combat;
  if (!combat) {
    return;
  }

  let pool = reachable;
  const values = [...remaining];
  while (values.length > 0) {
    const candidates = pool.filter((id) => combat.units[id] && isUnitAlive(combat.units[id]));
    if (candidates.length === 0) {
      break;
    }
    const value = values[0];
    if (value <= 0) {
      values.shift();
      continue;
    }
    // A genuine choice only exists when more than one candidate could take this
    // bolt and there are spare candidates beyond the bolts left to place.
    if (candidates.length > 1 && candidates.length > values.length) {
      const choiceId = `choice_${nextEventNumber(state)}`;
      state.pendingChoice = {
        id: choiceId,
        type: "ABILITY_TARGET_CHOICE",
        playerId,
        kind: "chain-lightning",
        abilityId: card?.id ?? "",
        abilityName: "Chain Lightning",
        prompt: `Chain Lightning: deal ${value} damage to one of the closest units.`,
        sourceUnitId: null,
        anchorUnitId: primaryId,
        candidateUnitIds: candidates,
        amount: value,
        chainReachableUnitIds: pool,
        chainRemainingDamages: values
      };
      state.phase = "choice";
      state.priorityPlayerId = playerId;
      appendEvent(state, {
        type: "PENDING_CHOICE_CREATED",
        choiceId,
        choiceType: "ABILITY_TARGET_CHOICE",
        playerId,
        sourceEffectIds: [],
        message: `${state.players[playerId]?.name ?? playerId} aims Chain Lightning.`
      });
      return;
    }

    const target = closestChainTarget(state, primaryId, candidates);
    if (!target) {
      break;
    }
    dealChainLightningDamage(state, playerId, card, target, value);
    pool = pool.filter((id) => id !== target);
    values.shift();
  }

  finishCombatIfNeeded(state);
}

/** Opens Solmyr's Chain Lightning: hit the selected unit, then chain outward. */
function startChainLightning(
  state: GameState,
  playerId: PlayerId,
  card: CardDefinition | undefined,
  primaryId: UnitId,
  damages: number[]
): void {
  if (!state.combat) {
    return;
  }
  const reachable = chainLightningReachable(state, primaryId);
  dealChainLightningDamage(state, playerId, card, primaryId, damages[0] ?? 0);
  if (finishCombatIfNeeded(state)) {
    return;
  }
  // Zero bolts (Chain Lightning I's "0") are no-ops: an untargeted closest unit
  // simply takes nothing, so only the nonzero bolts need allocating.
  advanceChainLightning(
    state,
    playerId,
    card,
    primaryId,
    reachable,
    damages.slice(1).filter((value) => value > 0)
  );
}

/**
 * Charm of Mana / Shackles of War: open a "discard M cards from hand" choice.
 * `candidates` are the cards the player may discard (the whole hand, or only
 * the cards just drawn). With nothing to discard the choice is skipped.
 */
function openHandDiscardChoice(
  state: GameState,
  playerId: PlayerId,
  remaining: number,
  candidates: CardId[],
  drawnOnly: boolean,
  cardName: string
): void {
  if (remaining <= 0 || candidates.length === 0) {
    return;
  }
  state.pendingChoice = {
    id: `choice_${nextEventNumber(state)}`,
    type: "OPTION_CHOICE",
    playerId,
    prompt: `${cardName}: discard ${remaining} card${remaining === 1 ? "" : "s"}.`,
    options: candidates.map((cardId) => ({ label: `Discard ${cardLibrary[cardId]?.name ?? cardId}` })),
    context: "hand-discard",
    handDiscard: { cardIds: candidates, remaining, drawnOnly },
    returnPhase: state.combat ? "combat" : "player-turn"
  };
  state.phase = "choice";
  state.priorityPlayerId = playerId;
}

/** Every Artifact deck id, Legacy ("artifacts") and BINH split, in draw order. */
const ARTIFACT_DECK_IDS = ["artifacts", "artifacts-minor", "artifacts-major", "artifacts-relic"] as const;
const ARTIFACT_DECK_LABELS: Record<string, string> = {
  artifacts: "Artifact",
  "artifacts-minor": "Minor",
  "artifacts-major": "Major",
  "artifacts-relic": "Relic"
};

/** Tazar's War Hero VI: move the top card of an Artifact deck into a hand. */
export function drawTopArtifact(state: GameState, playerId: PlayerId, deckId: string): void {
  const deck = state.decks[deckId];
  if (!deck) {
    return;
  }
  // Artifacts are globally unique. The deck normally holds one of each, but
  // redraw past any artifact already owned by ANY player (defence in depth, and
  // it keeps the rule explicit here too), tucking the skipped cards back under.
  const skipped: CardId[] = [];
  let drawn: CardId | null = null;
  while (deck.drawPile.length > 0) {
    const cardId = deck.drawPile.pop();
    if (!cardId) {
      break;
    }
    if (canAcquireSharedDeckCard(state, playerId, deckId as DeckId, cardId)) {
      drawn = cardId;
      break;
    }
    skipped.push(cardId);
  }
  if (skipped.length > 0) {
    deck.drawPile.unshift(...skipped);
  }
  if (!drawn) {
    return;
  }
  state.players[playerId]?.hand.push(drawn);
  appendEvent(state, { type: "CARDS_DRAWN", playerId, count: 1, requested: 1, reshuffledDiscard: false });
}

function playCard(state: GameState, action: Extract<GameAction, { type: "PLAY_CARD" }>, cards: CardLibrary): void {
  const card = cards[action.cardId];
  if (!card) {
    throw new Error(`Unknown card ${action.cardId}.`);
  }

  // BINH house rule: while the after-combat Necromancy window is open, the ONLY
  // legal card play is that Necromancy itself — the field reward is withheld
  // until the player commits, so no other card may resolve and bank value first.
  const pendingNecro = state.adventure?.pendingNecromancy;
  if (pendingNecro && (pendingNecro.playerId !== action.playerId || card.effect.type !== "NECROMANCY_REINFORCE")) {
    throw new Error("Resolve the after-combat Necromancy window first (play it or skip it).");
  }

  // Dessa's Logistics: playable only during the continue-or-retreat decision
  // against neutral units — the combat extends one round for free.
  if (card.effect.type === "CONTINUE_NEUTRAL_FREE") {
    const combat = state.combat;
    if (
      !combat ||
      !combat.awaitingContinue ||
      combat.context.kind !== "neutral" ||
      combat.attackerPlayerId !== action.playerId
    ) {
      throw new Error(`${card.name} is played when deciding to continue a neutral combat.`);
    }

    const moveError = moveCardFromHandToDiscard(state, action.playerId, action.cardId, "discard");
    if (moveError) {
      throw new Error(moveError.message);
    }

    combat.awaitingContinue = false;
    appendEvent(state, {
      type: "CARD_PLAYED",
      playerId: action.playerId,
      cardId: action.cardId,
      timing: card.timing,
      mode: "basic"
    });
    appendEvent(state, {
      type: "COMBAT_CONTINUED",
      playerId: action.playerId,
      movementLeft: state.heroes[combat.context.heroId]?.movementPoints ?? 0
    });
    advanceCombatRound(state, action.playerId);
    return;
  }

  // Sandro's Cloak: the specialty card leaves the hand and is physically
  // placed on a matching unit card, replacing its statistics until defeated.
  if (card.effect.type === "TRANSFORM_UNIT") {
    playTransformCard(state, action, card, card.effect);
    return;
  }

  // Permanents enter play instead of resolving an effect; any permanent
  // already in play goes to the discard pile (the printed one-permanent limit,
  // enforced in combat as well — playing another permanent discards this one,
  // and vice versa). A plain permanent (war machine, School of Magic) always
  // enters play. A hybrid artifact whose CHOOSE_ONE offers an enter-play side
  // (ENTER_PLAY) alongside a one-shot instant (income rings/carts) enters play
  // only when that side is chosen; its instant side falls through below.
  const entersPlayAsPermanent =
    Boolean(card.permanent) &&
    (card.effect.type !== "CHOOSE_ONE" || getChosenOption(card, action.optionIndex)?.effect.type === "ENTER_PLAY");
  if (entersPlayAsPermanent) {
    putPermanentIntoPlay(state, action.playerId, action.cardId);
    appendEvent(state, {
      type: "CARD_PLAYED",
      playerId: action.playerId,
      cardId: action.cardId,
      timing: card.timing,
      mode: "basic",
      optionLabel: getChosenOption(card, action.optionIndex)?.label
    });
    if (state.phase === "combat" || state.combat) {
      state.phase = "combat";
    }
    state.priorityPlayerId = null;
    return;
  }

  const effect = getEffectiveCardEffect(card, action.optionIndex);
  if (!effect) {
    throw new Error(`${card.name} needs a chosen option.`);
  }

  // Tactics is never played from hand: the swap is offered by the engine in the
  // start-of-combat window or on the holder's turn (SWAP_COMBAT_UNITS), and
  // Diplomacy's skip is offered as a pop-up at a matching-level Neutral field.
  if (effect.type === "TACTICS_SWAP") {
    throw new Error("Tactics is used through the combat swap window, not played from hand.");
  }
  if (effect.type === "DIPLOMACY_SKIP_COMBAT") {
    throw new Error("Diplomacy's skip is offered when your hero meets matching-level Neutral Units.");
  }
  // Learning is never played from hand: the engine offers it when the Hero is
  // about to level up (see the "learning-level-up" pending choice).
  if (effect.type === "ADVANCE_EXPERIENCE") {
    throw new Error("Learning is played when your Hero is about to level up, not from hand.");
  }
  // Artillery's expert side is not played from hand: it is offered when this
  // player's Ballista fires at the start of a combat round (see permanents.ts).
  if (effect.type === "ARTILLERY_BALLISTA_VOLLEY") {
    throw new Error("Artillery's expert side resolves when your Ballista fires, not from hand.");
  }
  // Helm of the Alabaster Unicorn's cast side is never played from hand: it is
  // offered as a `fromSpellDeck` CAST_SPELL of the top of the Spell-deck discard
  // pile (see addSpellActions / performSpellCast), which removes the Helm.
  if (effect.type === "CAST_FROM_SPELL_DISCARD") {
    throw new Error("Helm of the Alabaster Unicorn's cast side is played as a Spell-deck cast, not from hand.");
  }
  // First Aid's expert side is likewise not played from hand: it is offered when
  // this player activates their First Aid Tent's heal (see permanents.ts).
  if (effect.type === "FIRST_AID_TENT_VOLLEY") {
    throw new Error("First Aid's expert side resolves when you use your First Aid Tent, not from hand.");
  }

  const option = getChosenOption(card, action.optionIndex);
  const mode = action.mode ?? "basic";
  if (option?.expertOnly && mode !== "expert") {
    throw new Error(`${option.label} is the card's expert side.`);
  }
  if (option?.mapOnly && state.combat) {
    throw new Error(`${option.label} cannot be used during combat.`);
  }
  // Crown of the Five Seas' sea side: only while this player's main Hero stands
  // on a Sea (water-terrain) field.
  if (option?.requiresSeaTile) {
    const hero = getMainHero(state, action.playerId);
    if (!hero?.spaceId || !isSeaField(state, hero.spaceId)) {
      throw new Error(`${option.label} requires your Hero to be on a Sea tile.`);
    }
  }
  // Ring of the Wayfarer's paralysis side: only at the opening round of a
  // Combat against Neutral Units.
  if (option?.requiresNeutralCombatStart) {
    if (!state.combat || state.combat.context.kind !== "neutral" || state.combat.round !== 1) {
      throw new Error(`${option.label} is played at the start of a Combat with Neutral Units.`);
    }
  }
  // Jeremy's Cannon IV/VI "use the Cannon" side: requires the war-machine card
  // in play, so the free shot can never fire without a Cannon.
  if (option?.requiresWarMachine && !getPermanentCardIds(state, action.playerId).includes(option.requiresWarMachine)) {
    throw new Error(`${option.label} requires that war machine in play.`);
  }
  // An Empowered ability may always use its Expert side without a crown.
  if (
    mode === "expert" &&
    !hasExpertUseAvailable(state, action.playerId) &&
    !abilityExpertIsCrownFree(state.players[action.playerId], action.cardId)
  ) {
    throw new Error("No expert uses are available this combat round.");
  }

  // Spell cards played during combat respect the one-Spell-per-round limit.
  const playerForLimit = state.players[action.playerId];
  if (card.kind === "spell" && state.combat && playerForLimit) {
    if (playerForLimit.combatStats.spellsCastThisRound >= spellLimitFor(state, playerForLimit)) {
      throw new Error("Spell limit reached for this combat round.");
    }
    noteSpellCast(state, playerForLimit);
  }

  // Necromancy (the ability + Vidomina's level I/VI specialty) is NOT discarded
  // up front. It is consumed only if the queued reinforce actually upgrades a
  // unit — the REINFORCE_HALF_GOLD step carries the cardId and discards it on a
  // successful upgrade (queueNecromancyReinforce). A play that finds no eligible
  // target, or where the player declines/skips the reinforce, keeps the card in
  // hand: you lose Necromancy only when it upgrades something.
  const deferNecromancyDiscard = effect.type === "NECROMANCY_REINFORCE";
  if (deferNecromancyDiscard && !state.players[action.playerId]?.hand.includes(action.cardId)) {
    throw new Error(`${card.name} is not in your hand.`);
  }
  const moveError = deferNecromancyDiscard
    ? null
    : action.fromSpellBook
      ? // Spell Book (house rule): a Map Spell played from the Book cycles Book →
        // discard pile (or → removed for a removeSelf option), never touching hand.
        moveSpellFromSpellBookToDiscard(
          state,
          action.playerId,
          action.cardId,
          option?.cost?.removeSelf ? "removed" : "discard"
        )
      : moveCardFromHandToDiscard(
          state,
          action.playerId,
          action.cardId,
          option?.cost?.removeSelf ? "removed" : "discard"
        );
  if (moveError) {
    throw new Error(moveError.message);
  }

  payOptionCardCost(state, action.playerId, card, option?.cost, action.costCardIds, cards);

  // An Empowered ability's Expert side spends no crown.
  if (mode === "expert" && !abilityExpertIsCrownFree(state.players[action.playerId], action.cardId)) {
    state.players[action.playerId].combatStats.expertUsesSpentThisRound += 1;
  }

  const optionLabel =
    card.effect.type === "CHOOSE_ONE" && action.optionIndex !== undefined
      ? card.effect.options[action.optionIndex]?.label
      : undefined;

  // Necromancy's CARD_PLAYED (which drives the hand→discard flight animation and
  // the "plays …" log line) is deferred along with the discard: it fires from the
  // reinforce resolver only when the card actually moves to the discard pile, so
  // a kept card (skip / no target / declined reinforce) never animates a phantom
  // flight or logs a play it didn't make.
  if (!deferNecromancyDiscard) {
    appendEvent(state, {
      type: "CARD_PLAYED",
      playerId: action.playerId,
      cardId: action.cardId,
      timing: card.timing,
      mode,
      effectAmount: getEffectAmount(effect, mode) || undefined,
      optionLabel
    });
  }

  // Ongoing rule snapshot: lasting effects created below keep the card in
  // play until they end ("remove" plays went to `removed` and stay there).
  const effectCountBeforePlay = state.activeEffects.length;
  const playedToDiscard = !option?.cost?.removeSelf;

  // Rampart Dwarves "Magic Resistance": a Specialty card aimed at a Dwarf rolls
  // a die; on the matching face the card has no effect on it. Dropping the
  // target makes every unit-targeted branch below a no-op, while the card still
  // resolves and goes to the discard pile as usual.
  const negatedByDwarf =
    card.kind === "hero-specialty" && negatesCardOnDwarfRoll(state, action.target, card.name);
  const target = negatedByDwarf ? undefined : action.target?.type === "unit" ? action.target : undefined;

  if (effect.type === "HEAL_DAMAGE" && target) {
    healUnitDamage(
      state,
      {
        type: "card",
        cardId: card.id,
        controllerId: action.playerId
      },
      target,
      getEffectDamageAmount(effect, card.power ?? 0)
    );
    // Rion's Battlefield Medic IV/VI: "Remove … damage or paralysis …" — the
    // chosen unit also loses its Paralysis token.
    if (effect.removeParalysis && state.combat) {
      const unit = state.combat.units[target.unitId];
      if (unit && hasToken(unit, "paralysis")) {
        removeToken(state, unit, "paralysis", "dispelled");
      }
    }
    // Rion's Battlefield Medic: "Remove 1 damage … then draw 1 card."
    if (effect.drawCards) {
      drawCardsForPlayer(state, action.playerId, effect.drawCards);
    }
  }

  if (effect.type === "HEAL_DAMAGE_AND_REMOVE_EFFECTS" && target) {
    const source = {
      type: "card" as const,
      cardId: card.id,
      controllerId: action.playerId
    };
    healUnitDamage(state, source, target, getEffectDamageAmount(effect, card.power ?? 0));
    removeEffectsFromTarget(state, source, target, effect.removePolarity);
    // Cure: "Remove any effect or paralysis …" — also clears the Paralysis token.
    if (effect.removeParalysis && state.combat) {
      const unit = state.combat.units[target.unitId];
      if (unit && hasToken(unit, "paralysis")) {
        removeToken(state, unit, "paralysis", "dispelled");
      }
    }
    // Astra's Cure I: "… then draw 1 card."
    if (effect.drawCards) {
      drawCardsForPlayer(state, action.playerId, effect.drawCards);
    }
  }

  if (effect.type === "CREATE_ACTIVE_EFFECT") {
    createActiveEffectFromCard(state, card, effect, action.playerId, mode, target);
    // Ash's Bloodlust IV: the ongoing buff also "places a Black cube" on the
    // selected unit — it spends its Retaliation for the round.
    if (effect.placeBlackCube && state.combat && target?.type === "unit") {
      const cubed = state.combat.units[target.unitId];
      if (cubed && cubed.controllerId === action.playerId) {
        cubed.retaliatedThisRound = true;
      }
    }
  }

  if (effect.type === "REMOVE_ACTIVE_EFFECT" && target) {
    removeOneEffectFromTarget(
      state,
      { type: "card", cardId: card.id, controllerId: action.playerId },
      target
    );
  }

  if (effect.type === "CREATE_ATTACK_BUFF" && target) {
    createAttackBuffFromCard(state, card, effect, action.playerId, card.power ?? 0, target);
  }

  if (effect.type === "GRANT_ELEMENTAL_DAMAGE" && target) {
    // Moandor's Liches VI: the chosen unit deals elemental damage for the
    // Combat (its attack can no longer be raised by attack cards/tokens).
    createActiveEffect(
      state,
      {
        name: card.name,
        scope: "unit",
        duration: effect.duration,
        polarity: "positive",
        removable: false,
        modifiers: [{ type: "ELEMENTAL_DAMAGE" }]
      },
      { type: "card", cardId: card.id, controllerId: action.playerId },
      action.playerId,
      target
    );
  }

  if (effect.type === "CREATE_DEFENSE_BUFF" && target) {
    createDefenseBuffFromCard(state, card, action.playerId, card.power ?? 0, target);
  }

  // Ring of the Wayfarer's paralysis side: place a Paralysis token on the
  // chosen unit, gated by the grade the paid Power unlocks (Power 0 -> gold, so
  // an Azure unit — above the gate — is left untouched, matching "except
  // Azure"). The Blind Spell shares the PLACE_PARALYSIS effect but resolves via
  // the spell stack, so this branch only fires for directly-played cards.
  if (effect.type === "PLACE_PARALYSIS" && state.combat && target) {
    const maxGrade = gradeAtPower(effect.gradeByPower, card.power ?? 0);
    const unit = state.combat.units[target.unitId];
    if (unit && maxGrade && gradeRankOfUnit(unit) <= gradeRank(maxGrade)) {
      placeCombatToken(state, unit, "paralysis", 0, card.name);
    }
  }

  // Casmetra's Sorceresses VI (option A): place a Weakness token (−N attack for
  // `rounds` rounds) on the chosen unit. Not tier-gated — reaches any unit, like
  // the Cove Sorceresses' own token.
  if (effect.type === "PLACE_WEAKNESS_TOKEN" && state.combat && target) {
    const unit = state.combat.units[target.unitId];
    if (unit) {
      placeCombatToken(state, unit, "weakness", effect.amount, card.name, effect.rounds);
    }
  }

  // Zilare's Forgetfulness specialty: the chosen enemy unit cannot attack during
  // its next activation, gated by grade (I -> silver, IV/VI -> gold) exactly like
  // the Forgetfulness Spell. The Spell shares the FORGETFULNESS effect but
  // resolves via the spell stack, so this branch only fires for directly-played
  // cards (the specialty).
  if (effect.type === "FORGETFULNESS" && state.combat && target) {
    const maxGrade = gradeAtPower(effect.gradeByPower, card.power ?? 0);
    const unit = state.combat.units[target.unitId];
    if (unit && maxGrade && gradeRankOfUnit(unit) <= gradeRank(maxGrade)) {
      createActiveEffect(
        state,
        {
          name: card.name,
          scope: "unit",
          duration: { type: "next-activation" },
          polarity: "negative",
          removable: true,
          modifiers: [{ type: "UNIT_CANNOT_ATTACK" }]
        },
        { type: "card", cardId: card.id, controllerId: action.playerId },
        action.playerId,
        target
      );
    }
  }

  // Rashka's Demoniac specialty (IV/VI): a Fire Shield on the chosen unit —
  // melee attackers take 1 damage (2 for an Efreet at level VI).
  if (effect.type === "CREATE_FIRE_SHIELD" && target && state.combat) {
    createFireShieldFromCard(state, card, effect, action.playerId, card.power ?? 0, target);
  }

  // Clancy's Unicorns specialty (VI): a Spell Ward on the chosen unit — it takes
  // `amount` less damage from Spells/Specialties (2 on a Unicorns unit).
  if (effect.type === "CREATE_SPELL_WARD" && target && state.combat) {
    createSpellWardFromCard(state, card, effect, action.playerId, target);
  }

  if (effect.type === "CREATE_ATTACK_DIE_REROLL") {
    if (effect.adventureDice && !state.combat) {
      // Fortune on the adventure map: there is no Hero Power statistic, so the
      // reroll count is paid the board-game way — discard power-source cards for
      // +1 reroll each (Power 0/1/2 -> 1/2/3). The boost choice does that, then
      // creates the Treasure/Resource reroll effect at the chosen Power.
      openFortuneBoostStep(state, action.playerId, card, 0);
    } else {
      createAttackRerollEffectFromCard(state, card, action.playerId, mode);
    }
  }

  // Shackles of War (house rule): the enemy hero cannot Surrender this Combat
  // — a CANNOT_SURRENDER_COMBAT effect placed on the enemy. Retreat (and a
  // fought-out loss) still happen normally.
  if (effect.type === "BLOCK_ENEMY_SURRENDER" && state.combat) {
    const enemyId = pickEnemyPlayerId(state, action.playerId);
    if (enemyId) {
      createActiveEffect(
        state,
        {
          name: card.name,
          scope: "player",
          duration: { type: "combat" },
          polarity: "negative",
          removable: false,
          modifiers: [{ type: "CANNOT_SURRENDER_COMBAT" }]
        },
        { type: "card", cardId: card.id, controllerId: action.playerId },
        enemyId
      );
    }
  }

  if (effect.type === "SIEGE_DEMOLISH") {
    const siege = state.combat?.siege;
    if (!siege) {
      throw new Error("Ballistics works only during a siege.");
    }
    if (effect.target === "arrow-tower") {
      if (!siege.arrowTowerUnitId) {
        throw new Error("The Arrow Tower is already gone.");
      }
      removeArrowTower(state, null, "Ballistics levels it");
    } else {
      openSiegeDemolishChoice(state, action.playerId, 1);
    }
  }

  // Ballistics' expert bombardment (house rule): the building-material price and
  // the crown were already paid above. Deal `amount` flat "effect" damage to the
  // chosen enemy unit, then offer the same damage to one enemy adjacent to it —
  // "1 damage to 2 adjacent units". War-machine damage, so spell-damage
  // reduction never applies.
  if (effect.type === "BALLISTICS_BOMBARD" && state.combat) {
    const primary = target ? state.combat.units[target.unitId] : undefined;
    if (!primary || !isUnitAlive(primary) || primary.controllerId === action.playerId) {
      throw new Error("Ballistics must bombard a living enemy unit.");
    }
    primary.damage += effect.amount;
    noteUnitDamagedForTokens(state, primary, effect.amount);
    appendEvent(state, {
      type: "DAMAGE_ASSIGNED",
      source: { type: "card", cardId: card.id, controllerId: action.playerId },
      target: { type: "unit", unitId: primary.id },
      amount: effect.amount,
      damageKind: "effect"
    });
    markUnitRemovedIfNeeded(state, primary);

    if (!finishCombatIfNeeded(state)) {
      // Enemy units adjacent to the primary may also be bombarded — the caster
      // picks one (or skips when none qualify / none is wanted).
      const splashCandidates = Object.values(state.combat.units).filter(
        (unit) =>
          unit.id !== primary.id &&
          isUnitAlive(unit) &&
          unit.controllerId !== action.playerId &&
          isAdjacent(unit.position, primary.position)
      );
      if (splashCandidates.length > 0) {
        const choiceId = `choice_${nextEventNumber(state)}`;
        state.pendingChoice = {
          id: choiceId,
          type: "ABILITY_TARGET_CHOICE",
          playerId: action.playerId,
          kind: "ballistics-splash",
          abilityId: card.id,
          abilityName: card.name,
          prompt: `${card.name}: deal ${effect.amount} damage to an enemy adjacent to ${primary.cardName}, or skip.`,
          sourceUnitId: null,
          anchorUnitId: primary.id,
          candidateUnitIds: splashCandidates.map((unit) => unit.id),
          amount: effect.amount,
          optional: true,
          skipLabel: "Skip (no second target)"
        };
        appendEvent(state, {
          type: "PENDING_CHOICE_CREATED",
          choiceId,
          choiceType: "ABILITY_TARGET_CHOICE",
          playerId: action.playerId,
          sourceEffectIds: [],
          message: `${card.name} may strike a second enemy.`
        });
      }
    }
  }

  // Artillery (basic): the slowest enemy takes `amount` "effect" damage — the
  // same shot a Ballista makes. The card only offered the lowest-initiative
  // enemy/enemies as targets; re-checked here so removing that filter is caught
  // (a thrown error rolls the whole play back, card included).
  if (effect.type === "DAMAGE_LOWEST_INITIATIVE_ENEMY" && state.combat) {
    const unit = target ? state.combat.units[target.unitId] : undefined;
    if (!unit || !isUnitAlive(unit) || unit.controllerId === action.playerId) {
      throw new Error("Artillery must hit a living enemy unit.");
    }
    if (!isLowestInitiativeEnemy(state, action.playerId, unit)) {
      throw new Error("Artillery hits an enemy unit with the lowest initiative.");
    }
    unit.damage += effect.amount;
    noteUnitDamagedForTokens(state, unit, effect.amount);
    appendEvent(state, {
      type: "DAMAGE_ASSIGNED",
      source: { type: "card", cardId: card.id, controllerId: action.playerId },
      target: { type: "unit", unitId: unit.id },
      amount: effect.amount,
      damageKind: "effect"
    });
    markUnitRemovedIfNeeded(state, unit);
    finishCombatIfNeeded(state);
  }

  // Septienna's Death Ripple (I/IV/VI): deal `amount` damage to every enemy
  // combat unit whose grade matches (bronze / silver / gold + azure). No target
  // — the engine sweeps the board itself. Per-unit spell-damage reduction and
  // immunity apply through dealAreaCardDamage.
  if (effect.type === "DAMAGE_ENEMY_UNITS_BY_GRADE" && state.combat) {
    const grades = new Set(effect.grades);
    for (const unit of Object.values(state.combat.units)) {
      if (unit.controllerId !== action.playerId && isUnitAlive(unit) && grades.has(unit.grade)) {
        dealAreaCardDamage(state, action.playerId, card, unit, effect.amount);
      }
    }
    finishCombatIfNeeded(state);
  }

  // Oidana VI (ongoing): "+1 Attack to all your neutral (Diplomacy-recruited)
  // units, all rounds." A player-scoped, combat-long ATTACK_BONUS gated to the
  // "neutral" army variant via effectAppliesToUnit, so getActiveAttackBonus picks
  // it up for every neutral unit the caster controls for the whole battle (and
  // nothing else — faction units and enemy guards are untouched).
  if (effect.type === "CREATE_VARIANT_ATTACK_BUFF" && state.combat) {
    createActiveEffect(
      state,
      {
        name: effect.name,
        scope: "player",
        duration: { type: "combat" },
        polarity: "positive",
        removable: false,
        appliesOnlyToVariant: effect.variant,
        modifiers: [{ type: "ATTACK_BONUS", amount: effect.amount }]
      },
      { type: "card", cardId: card.id, controllerId: action.playerId },
      action.playerId
    );
  }

  // Tarnum (Castle)'s Ballista VI: "Choose N enemy units. Each suffers `amount`
  // damage." Gather the caster's living enemy units and hit N of them; the
  // shared area-pick choice lets the caster pick which when more than N are
  // alive (otherwise every enemy is hit). Per-unit spell-damage reduction and
  // immunity apply through dealAreaCardDamage/applyAdjacentPicks.
  if (effect.type === "DAMAGE_CHOSEN_ENEMIES" && state.combat) {
    const enemyIds = Object.values(state.combat.units)
      .filter((unit) => unit.controllerId !== action.playerId && isUnitAlive(unit))
      .map((unit) => unit.id);
    applyAdjacentPicks(state, action.playerId, card, enemyIds, effect.count, effect.amount);
    finishCombatIfNeeded(state);
  }

  // Gerwulf's Ballista IV/VI: "Discard your Ballista to inflict `amount` damage
  // on the selected unit." Requires an in-play war-machine card matching the
  // effect (gated in legal-actions); it is sent to the discard pile and the
  // chosen enemy takes that much "effect" damage — a physical Ballista shot.
  if (effect.type === "DISCARD_WAR_MACHINE_DAMAGE" && state.combat) {
    const unit = target ? state.combat.units[target.unitId] : undefined;
    if (!unit || !isUnitAlive(unit) || unit.controllerId === action.playerId) {
      throw new Error(`${card.name} must hit a living enemy unit.`);
    }
    if (!getPermanentCardIds(state, action.playerId).includes(effect.warMachineCardId)) {
      throw new Error(`${card.name} requires an in-play ${effect.warMachineCardId} to discard.`);
    }
    discardPermanentFromPlay(state, action.playerId, effect.warMachineCardId);
    applyWarMachineDamage(
      state,
      action.playerId,
      unit.id,
      effect.amount,
      `${card.name}: the discarded Ballista hits ${unit.cardName} for ${effect.amount} damage.`,
      effect.warMachineCardId
    );
  }

  // Tarnum (Dungeon)'s Dragons IV: damage every unit (friend or foe) in the
  // chosen vertical line of 5 spaces — the column of the selected space, the
  // only straight line of 5 on the 4×5 Combat board.
  if (effect.type === "DAMAGE_BATTLEFIELD_LINE" && state.combat && action.target) {
    const center =
      action.target.type === "space"
        ? action.target.position
        : action.target.type === "unit"
          ? state.combat.units[action.target.unitId]?.position
          : undefined;
    if (center !== undefined) {
      const column = getBattlefieldCoordinates(center).column;
      for (const unit of Object.values(state.combat.units)) {
        if (isUnitAlive(unit) && getBattlefieldCoordinates(unit.position).column === column) {
          dealAreaCardDamage(state, action.playerId, card, unit, effect.amount);
        }
      }
      finishCombatIfNeeded(state);
    }
  }

  // Tarnum (Rampart) Sharpshooters VI (option A): borrow a Neutral-deck unit for
  // this Combat only — placed on an empty cell on the player's side; the card
  // returns to the Neutral discard pile when the Combat ends.
  if (effect.type === "BORROW_NEUTRAL_UNIT" && state.combat) {
    const borrowed = borrowNeutralUnit(state, action.playerId, effect.unitDefId, effect.tier);
    if (borrowed) {
      appendEvent(state, {
        type: "UNIT_ABILITY_TRIGGERED",
        unitId: borrowed.id,
        abilityId: card.id,
        message: `${state.players[action.playerId]?.name ?? "A hero"} plays ${card.name}: ${borrowed.cardName} joins the Combat at ${getBattlefieldLabel(borrowed.position)}.`
      });
    }
  }

  // Tarnum (Dungeon)'s Dragons VI (option A): toggle the selected Dragons unit's
  // Black cube — remove it if the unit has already spent its Retaliation this
  // round (so it may retaliate again), otherwise place one (so it cannot).
  if (effect.type === "TOGGLE_RETALIATION_MARKER" && state.combat && target?.type === "unit") {
    const unit = state.combat.units[target.unitId];
    if (unit && isUnitAlive(unit)) {
      const removing = unit.retaliatedThisRound;
      unit.retaliatedThisRound = !unit.retaliatedThisRound;
      appendEvent(state, {
        type: "UNIT_ABILITY_TRIGGERED",
        unitId: unit.id,
        abilityId: "tarnum-dragons-cube",
        message: removing
          ? `${card.name} removes the Black cube from ${unit.cardName} — it may retaliate again.`
          : `${card.name} places a Black cube on ${unit.cardName} — it cannot retaliate.`
      });
    }
  }

  // Merist's Stone Skin IV: "All your units gain a Defense token." Every living
  // unit the caster controls gets the Defend shield for the rest of the combat.
  if (effect.type === "GRANT_DEFENSE_TOKENS" && state.combat) {
    grantDefenseTokensToAll(state, action.playerId);
  }

  // Merist's Stone Skin VI: place a Defense token on all your units AND, for the
  // rest of the Combat, make those tokens pay out on a "0" as well as a "+1"
  // Defense roll (the player-scoped DEFENSE_TOKEN_ON_ZERO effect created via
  // holdOngoingCardIfEffectCreated, like any combat-duration aura).
  if (effect.type === "STONE_SKIN_AURA" && state.combat) {
    grantDefenseTokensToAll(state, action.playerId);
    createActiveEffect(
      state,
      {
        name: card.name,
        scope: "player",
        duration: { type: "combat" },
        polarity: "positive",
        removable: false,
        modifiers: [{ type: "DEFENSE_TOKEN_ON_ZERO" }]
      },
      { type: "card", cardId: card.id, controllerId: action.playerId },
      action.playerId
    );
  }

  if (effect.type === "DRAW_CARDS") {
    const handBefore = state.players[action.playerId].hand.length;
    drawCardsForPlayer(state, action.playerId, getEffectAmount(effect, mode));
    // Charm of Mana / Shackles of War: "draw N, then discard M". The discard is
    // a follow-up choice; `thenDiscardDrawnOnly` limits it to the drawn cards.
    if (effect.thenDiscard) {
      const hand = state.players[action.playerId].hand;
      const drawn = hand.slice(handBefore);
      const candidates = effect.thenDiscardDrawnOnly ? drawn : [...hand];
      openHandDiscardChoice(state, action.playerId, effect.thenDiscard, candidates, Boolean(effect.thenDiscardDrawnOnly), card.name);
    }
  }

  // Offense/Armorer (ADD_COMBAT_STAT) and Sorcery (ADD_SPELL_POWER) played
  // outside combat: with no attack/spell to apply it to the stat/Power fizzles,
  // but the "then draw a card" rider still resolves. (In combat these route
  // through the reaction path, which applies the stat/Power to the open window.)
  if (
    (effect.type === "ADD_COMBAT_STAT" || effect.type === "ADD_SPELL_POWER") &&
    effect.drawCards &&
    !state.combat
  ) {
    drawCardsForPlayer(state, action.playerId, effect.drawCards);
  }

  if (effect.type === "GAIN_MORALE") {
    if (mode === "expert" && effect.expertDrawCards) {
      drawCardsForPlayer(state, action.playerId, effect.expertDrawCards);
    }
    changeMorale(state, action.playerId, effect.amount);
  }

  if (effect.type === "NECROMANCY_REINFORCE") {
    // Playing the card consumes the after-combat window. Vidomina's specialties
    // pin the tier (forceMode); the printed ability uses the played mode. The
    // reinforce options are built on the gold held RIGHT NOW — before the
    // withheld field reward lands — which is the whole point of the now-or-never
    // window. Once that is queued, release the deferred field visit so it
    // resolves only after the reinforce is paid for.
    state.players[action.playerId].necromancyWindow = false;
    // Pass the played card so the reinforce can consume it ONLY on a successful
    // upgrade; a no-target / declined reinforce keeps it in hand.
    queueNecromancyReinforce(state, action.playerId, effect.forceMode ?? mode, action.cardId);
    const pending = state.adventure?.pendingNecromancy;
    if (pending && pending.playerId === action.playerId) {
      if (pending.heroId && pending.fieldId) {
        state.adventure!.rewardQueue.push({
          playerId: action.playerId,
          kind: "field-visit",
          heroId: pending.heroId,
          fieldId: pending.fieldId
        });
      }
      state.adventure!.pendingNecromancy = null;
    }
  }

  if (effect.type === "GAIN_RESOURCES") {
    // Sephinroth's Valuables I: "Pay N gold to gain …" — spend the gold first.
    if (effect.goldCost) {
      const payer = state.players[action.playerId];
      if (!payer || payer.resources.gold < effect.goldCost) {
        throw new Error(`${card.name} costs ${effect.goldCost} gold.`);
      }
      payer.resources.gold -= effect.goldCost;
      appendEvent(state, {
        type: "RESOURCES_SPENT",
        playerId: action.playerId,
        cost: { gold: effect.goldCost },
        reason: `played ${card.name}`
      });
    }
    // BINH house rule: Estates is nerfed to 2 / 4 gold (toggle: estates-nerf).
    const gain =
      card.id === "ability.estates"
        ? { gold: estatesGold(getRuleset(state), mode, houseRuleEnabled(state, "estates-nerf")) }
        : mode === "expert" && effect.expertGain
          ? effect.expertGain
          : effect.gain;
    gainResources(state, action.playerId, gain, `played ${card.name}`);
  }

  // Octavia's "Gold" and Melodia's "Fortune" economic map plays. Morale and the
  // location-dice buff land at once; the Resource-die roll (and the trailing
  // gold, so it follows the chosen die) run through a queued map visit.
  if (effect.type === "RESOURCE_FORTUNE_PLAY") {
    if (effect.morale) {
      changeMorale(state, action.playerId, effect.morale);
    }
    if (effect.locationDiceBonusTurn) {
      createActiveEffect(
        state,
        {
          name: card.name,
          scope: "player",
          duration: { type: "current-turn" },
          polarity: "positive",
          removable: false,
          modifiers: [{ type: "LOCATION_DICE_BONUS", amount: 1 }]
        },
        { type: "card", cardId: card.id, controllerId: action.playerId },
        action.playerId
      );
    }
    const fortuneSteps: VisitStep[] = [];
    if (effect.rollResourceDice) {
      fortuneSteps.push({ type: "ROLL_RESOURCE_DICE", count: effect.rollResourceDice });
    }
    if (effect.gold) {
      fortuneSteps.push({ type: "GAIN_RESOURCES", gold: effect.gold });
    }
    if (fortuneSteps.length > 0) {
      state.adventure?.rewardQueue.unshift({
        playerId: action.playerId,
        kind: "visit-steps",
        steps: fortuneSteps
      });
    }
  }

  // Legion artifacts' discount side (map-only): open a blocking prompt to pick
  // the ONE unit whose recruit/reinforce cost this piece reduces, then bank a
  // voucher for that exact unit (queueLegionDiscountChoice → BANK_RECRUIT_DISCOUNT
  // step). This creates NO active effect, so holdOngoingCardIfEffectCreated leaves
  // the card in the discard pile — the artifact is instant and never lingers in
  // play. The voucher never stacks (the cost path takes the single largest
  // discount) and is spent when its unit is bought.
  if (effect.type === "GAIN_RECRUIT_DISCOUNT") {
    queueLegionDiscountChoice(state, action.playerId, card.id, effect.amount);
  }

  if (effect.type === "GAIN_HERO_MOVEMENT") {
    // Buffs reach every hero the player commands, the Secondary Hero included.
    const amount = mode === "expert" ? (effect.expertAmount ?? effect.amount) : effect.amount;
    for (const hero of Object.values(state.heroes)) {
      if (hero.controllerId === action.playerId) {
        hero.movementPoints += amount;
      }
    }
    if (effect.moveThroughThisTurn) {
      createActiveEffect(
        state,
        {
          name: card.name,
          scope: "player",
          duration: { type: "current-turn" },
          polarity: "positive",
          removable: false,
          modifiers: [{ type: "HERO_MOVE_THROUGH" }]
        },
        { type: "card", cardId: card.id, controllerId: action.playerId },
        action.playerId
      );
    }
    if (effect.waterWalkThisTurn) {
      createActiveEffect(
        state,
        {
          name: card.name,
          scope: "player",
          duration: { type: "current-turn" },
          polarity: "positive",
          removable: false,
          modifiers: [{ type: "HERO_WATER_WALK" }]
        },
        { type: "card", cardId: card.id, controllerId: action.playerId },
        action.playerId
      );
      // Cast AFTER wading onto the sea (the natural click-to-move order): the
      // coastline halt set by that step no longer applies now Water Walk is up,
      // so the hero may keep sailing with the movement points it kept.
      liftSeaHaltForWaterWalk(state, action.playerId);
    }
    // Shield of Naval Glory (Sea side): the +1 movement comes with a card draw.
    if (effect.drawCards) {
      drawCardsForPlayer(state, action.playerId, effect.drawCards);
    }
  }

  if (effect.type === "DIMENSION_DOOR") {
    openDimensionDoorChoice(state, action.playerId, effect.fields);
  }

  // View Earth (Map): open the choice of which enemy Mine in reach to capture.
  if (effect.type === "VIEW_EARTH") {
    openViewEarthChoice(state, action.playerId, effect.withinFields);
  }

  if (effect.type === "GAIN_EXPERT_USE") {
    const player = state.players[action.playerId];
    player.combatStats.expertUseBonusThisRound = (player.combatStats.expertUseBonusThisRound ?? 0) + effect.amount;
  }

  if (effect.type === "DIPLOMACY_RECRUIT") {
    openDiplomacyRecruit(state, action.playerId, effect.maxDraws, effect.goldReduction);
  }

  // Pandora's Gift: Income — roll 1 Resource die, raise that resource's income.
  if (effect.type === "RAISE_INCOME_BY_DIE") {
    raiseIncomeByResourceDie(state, action.playerId);
  }

  // Pandora's Gift: Recruits — draw N Neutral units, offer one at half cost.
  if (effect.type === "DRAW_NEUTRAL_RECRUIT_OFFER") {
    openNeutralRecruitOffer(state, action.playerId, effect.count, effect.tier);
  }

  // Visions (Map): begin the scry. The Power (how many cards) is paid by
  // discarding Spells for +1 each — offered interactively — then a Neutral deck
  // is chosen and scryed.
  if (effect.type === "VISIONS_SCRY") {
    openVisionsScry(state, action.playerId, effect.cardsByPower);
  }

  if (effect.type === "TAKE_FROM_DISCARD") {
    const pick = {
      count: effect.count,
      filter: effect.filter,
      fromTop: effect.fromTop,
      shuffleRestIntoDeck: effect.shuffleRestIntoDeck
    };
    // The adventure reward queue is parked while a live (non-prep) combat runs —
    // a queued discard-pick would not surface until the fight ended. A mid-Combat
    // discard-pick (Scholar/Ciele via allowInCombat, or any INSTANT artifact's
    // take-a-card side — see discardPickAllowedInCombat) opens the pick straight
    // away here; on the map (or a prep window, where the queue still pumps) it
    // keeps queuing as a reward.
    if (discardPickAllowedInCombat(card, effect) && state.combat && !state.combat.prep) {
      openDiscardPickChoice(state, action.playerId, pick);
    } else {
      state.adventure?.rewardQueue.unshift({
        playerId: action.playerId,
        kind: "discard-pick",
        ...pick
      });
    }
  }

  // Scholar (expert): open the interactive Empowered-Statistic swap (up to
  // `count` removals). The Scholar card was already removed by cost.removeSelf.
  if (effect.type === "SCHOLAR_EMPOWER_SWAP") {
    state.adventure?.rewardQueue.unshift({
      playerId: action.playerId,
      kind: "visit-steps",
      steps: [{ type: "SCHOLAR_EMPOWER_PICK", remaining: effect.count, takenTypes: [] }]
    });
  }

  if (effect.type === "CARD_DECK_SEARCH") {
    state.adventure?.rewardQueue.unshift({
      playerId: action.playerId,
      kind: "shared-deck-search",
      deckId: effect.deck,
      count: effect.count,
      ...(effect.allowRemove ? { allowRemove: true } : {})
    });
  }

  // Spellbinder's Hat (option A): remove a card from hand, then Search(N) its
  // own deck. Reuses the Market-of-Time / Faerie-Ring REMOVE_HAND_CARD step with
  // the "removable" filter (only abilities, artifacts and spells — the cards
  // that have a deck to dig) and the "search-same-deck" follow-up.
  if (effect.type === "REMOVE_HAND_CARD_THEN_SEARCH") {
    state.adventure?.rewardQueue.unshift({
      playerId: action.playerId,
      kind: "visit-steps",
      steps: [
        {
          type: "REMOVE_HAND_CARD",
          prompt: `${card.name}: remove a card to Search (${effect.count}) its deck`,
          filter: effect.filter ?? "removable",
          then: "search-same-deck",
          searchCount: effect.count,
          tieredReach: effect.tieredReach
        }
      ]
    });
  }

  // Spellbinder's Hat (option B): the Hat was removed by cost.removeSelf; now
  // remove one more card the player picks from hand OR discard pile.
  if (effect.type === "REMOVE_ANOTHER_CARD_FROM_HAND_OR_DISCARD") {
    state.adventure?.rewardQueue.unshift({
      playerId: action.playerId,
      kind: "visit-steps",
      steps: [
        {
          type: "REMOVE_ONE_FROM_HAND_OR_DISCARD",
          prompt: `${card.name}: remove another card from your hand or discard pile`
        }
      ]
    });
  }

  if (effect.type === "RANDOM_ENEMY_DISCARD") {
    discardRandomEnemyCards(state, action.playerId, effect.count);
  }

  if (effect.type === "ENEMY_MORALE_STRIP") {
    const enemyId = pickEnemyPlayerId(state, action.playerId);
    const enemy = enemyId ? state.players[enemyId] : undefined;
    if (enemyId && enemy && enemy.morale > 0) {
      changeMorale(state, enemyId, -1);
    }
  }

  if (effect.type === "ROLL_FOR_MORALE") {
    const random = createSeededRandom(`${state.seed}#roll-for-morale#${eventSeedNumber(state)}`);
    const faces = [-1, -1, 0, 0, 1, 1];
    const roll = faces[random.nextInt(0, faces.length - 1)];
    appendEvent(state, {
      type: "ADVENTURE_DICE_ROLLED",
      playerId: action.playerId,
      dice: "attack",
      results: [`${card.name} attack die: ${roll >= 0 ? "+" : ""}${roll}`],
      attackRolls: [roll]
    });
    if (roll === effect.onRoll) {
      changeMorale(state, action.playerId, 1);
    }
  }

  if (effect.type === "EAGLE_EYE_DIG") {
    resolveEagleEyeDig(state, action.playerId, mode, cards, effect.school);
  }

  if (effect.type === "TELEPORT_HERO_TO_TOWN") {
    queueTownPortalChoice(state, action.playerId, effect.movementBonus ?? 0);
  }

  if (effect.type === "DISCOVER_TILE_CARD") {
    const hero = getMainHero(state, action.playerId);
    if (state.adventure && hero?.spaceId) {
      state.adventure.rewardQueue.unshift({
        playerId: action.playerId,
        kind: "visit-steps",
        steps: [{ type: "DISCOVER_ADJACENT_TILE" }]
      });
    }
  }

  if (effect.type === "CREATE_INITIATIVE_BUFF" && target && state.combat) {
    const targetUnit = state.combat.units[target.unitId];
    const amount = doubleAmountForUnitName(
      getAmountByPower(effect.amountByPower, effect.amount ?? 0, 0),
      targetUnit,
      effect.doubleForUnitName
    );
    createActiveEffect(
      state,
      {
        name: effect.name,
        scope: "unit",
        duration: effect.duration,
        polarity: effect.polarity ?? (amount >= 0 ? "positive" : "negative"),
        removable: effect.removable ?? true,
        modifiers: [
          { type: "INITIATIVE_BONUS", amount },
          ...(effect.movementBonus
            ? [{ type: "MOVEMENT_BONUS" as const, amount: effect.movementBonus }]
            : [])
        ]
      },
      { type: "card", cardId: card.id, controllerId: action.playerId },
      action.playerId,
      target
    );
  }

  if (effect.type === "ADD_UNIT_MAX_HEALTH" && target && state.combat) {
    const unit = state.combat.units[target.unitId];
    if (unit && unit.controllerId === action.playerId) {
      unit.maxHealth += doubleAmountForUnitName(effect.amount, unit, effect.doubleForUnitName);
    }
  }

  // Necklace of Swiftness (option B): move one of your own units one space. The
  // destination empty space is picked in a follow-up (the "combat-step"
  // OPTION_CHOICE), resolved by resolveUnitStepChoice. Only the controller's
  // own units may be moved; a unit hemmed in with no empty neighbour is a no-op.
  if (effect.type === "MOVE_UNIT_ADJACENT" && target && state.combat) {
    const unit = state.combat.units[target.unitId];
    if (unit && unit.controllerId === action.playerId) {
      openUnitStepChoice(state, action.playerId, unit);
    }
  }

  // Xyron's Inferno: the chosen unit's space and every orthogonally adjacent
  // space — every unit in the blast, friend or foe — takes the flat damage.
  // Xyron's Inferno: select a space (occupied or empty); every unit on it and on
  // the orthogonally adjacent spaces — friend or foe — takes the flat damage. The
  // centre is read from the chosen space (or, for legacy unit targets, that unit's
  // space). A Dwarf centre that shrugged the Specialty off (negatedByDwarf) is a
  // no-op, like the other unit-targeted branches.
  if (effect.type === "AREA_DAMAGE_ALL_ADJACENT" && state.combat && action.target && !negatedByDwarf) {
    const center =
      action.target.type === "space"
        ? action.target.position
        : action.target.type === "unit"
          ? state.combat.units[action.target.unitId]?.position
          : undefined;
    if (center !== undefined) {
      const blastArea = new Set<number>([center, ...getOrthogonalNeighbors(center)]);
      const inBlast = Object.values(state.combat.units).filter(
        (unit) => isUnitAlive(unit) && blastArea.has(unit.position)
      );
      for (const unit of inBlast) {
        dealAreaCardDamage(state, action.playerId, card, unit, effect.amount);
      }
    }
  }

  // Deemer's Meteor Shower I (target + 1 adjacent) and VI (target + 2 adjacent):
  // deal damage to the target unit and that many units adjacent to it (friend or
  // foe; the caster picks when more are adjacent). Deemer's damage is power-scaled
  // (`amountByPower`, Power 0-1 → 1, 2-3 → 2, 4+ → 3): the Power brought is the
  // caster's standing spell Power plus the printed Power VALUE of the power-source
  // cards discarded to play it, so it scales like the Frost Ring Spell and is
  // buffable by spell power. Adelaide's Frost Ring specialty keeps a fixed
  // `amount` and ignores the Power computation (short-circuited below).
  if (effect.type === "AREA_DAMAGE_PICK_ADJACENT" && state.combat && action.target && !negatedByDwarf) {
    const amount =
      effect.amount ??
      getAmountByPower(
        effect.amountByPower ?? {},
        1,
        playCardSpellPower(state, action.playerId, card, action.costCardIds, cards)
      );
    const center =
      action.target.type === "space"
        ? action.target.position
        : action.target.type === "unit"
          ? state.combat.units[action.target.unitId]?.position
          : undefined;
    if (center !== undefined) {
      resolveAreaPickDamage(
        state,
        action.playerId,
        card,
        center,
        amount,
        effect.includeCenter,
        effect.adjacentPicks
      );
    }
  }

  // Luna's Fire Wall specialty (I = 1 damage, VI = 3): place a Fire Wall token
  // on the chosen empty space for this Combat. Reuses the spell's `fire_wall`
  // battlefield token (bites a unit that stops on it or a ground/ranged unit
  // passing through), but the damage is FIXED, not Power-scaled.
  if (effect.type === "PLACE_FIRE_WALL_FIXED" && state.combat && action.target?.type === "space") {
    addBattlefieldToken(state, {
      kind: "fire_wall",
      position: action.target.position,
      controllerId: action.playerId,
      damage: effect.damage
    });
  }

  // Deemer's Meteor Shower IV (one option): shuffle the discard pile back into
  // the deck FIRST, then draw — and the Meteor Shower IV card itself is discarded
  // AFTER the shuffle. It was moved to the discard before this effect ran, so it
  // is held aside and left in the discard rather than swept back into the deck
  // (and so it can never be the card drawn). The "+1 Power" option is the
  // universal power-source discard, handled by ADD_SPELL_POWER, not here.
  if (effect.type === "RESHUFFLE_DISCARD_THEN_DRAW") {
    const player = state.players[action.playerId];
    if (player) {
      const playedIndex = player.discard.lastIndexOf(action.cardId);
      const playedCard = playedIndex >= 0 ? [player.discard[playedIndex]] : [];
      const toShuffle =
        playedIndex >= 0
          ? [...player.discard.slice(0, playedIndex), ...player.discard.slice(playedIndex + 1)]
          : [...player.discard];
      if (toShuffle.length > 0) {
        player.deck = shuffleCards(
          [...player.deck, ...toShuffle],
          `${state.seed}#reshuffle-draw#${action.playerId}#${eventSeedNumber(state)}`
        );
      }
      // The played card stays in the discard (discarded after the shuffle).
      player.discard = playedCard;
      drawCardsForPlayer(state, action.playerId, effect.drawCards);
    }
  }

  // Kriv (Bulwark)'s rune-synergy specialty: bank Runes immediately, and (levels
  // I/IV) draw the bundled card(s). gainRunes is a no-op for a non-Bulwark caster,
  // so the option is harmless if mis-played; the draw still happens for anyone.
  if (effect.type === "GAIN_RUNES") {
    gainRunes(state, action.playerId, effect.amount);
    if (effect.drawCards) {
      drawCardsForPlayer(state, action.playerId, effect.drawCards);
    }
  }

  // Kriv (Bulwark)'s rune-empowerment specialty (map play): become Rune-Empowered
  // so the player's Hero starts EACH combat with extra Runes until the next
  // Resource round (the same flag the City Hall combat-focus feeds, read by
  // seedRunesForCombat). grantStartingRunes is a no-op for a non-Bulwark caster.
  if (effect.type === "GAIN_STARTING_RUNES") {
    grantStartingRunes(state, action.playerId, effect.amount);
  }

  // Solmyr's Chain Lightning (I/VI): the selected unit takes the leftmost bolt,
  // then the chain forks to the units closest to it (the caster allocating).
  // Specialty cards carry a fixed `damages`; a power-scaled `damagesByPower`
  // (the Spell, never reached here) would use the card's printed power.
  if (effect.type === "CHAIN_LIGHTNING" && target && state.combat) {
    startChainLightning(state, action.playerId, card, target.unitId, chainLightningDamages(effect, card.power ?? 0));
  }

  // Torosar's Ballista specialty: field an extra Ballista (this combat or the
  // rest of the round) and/or activate Ballistas for an immediate shot each.
  if (effect.type === "BALLISTA_SPECIALTY" && state.combat) {
    if (effect.grant) {
      createActiveEffect(
        state,
        {
          name: "Ballista",
          scope: "player",
          duration: effect.grant === "game-round" ? { type: "current-game-round" } : { type: "combat" },
          polarity: "positive",
          removable: false,
          modifiers: [{ type: "EXTRA_BALLISTA" }]
        },
        { type: "card", cardId: card.id, controllerId: action.playerId },
        action.playerId
      );
    }
    // "Activate all your Ballistas" counts the just-granted one too.
    if (effect.activate === "all") {
      activateBallistas(state, action.playerId, countBallistas(state, action.playerId));
    } else if (effect.activate === "one" && countBallistas(state, action.playerId) >= 1) {
      activateBallistas(state, action.playerId, 1);
    }
  }

  // Solmyr's Chain Lightning IV: dig the top of your own deck, keep 1, discard
  // the rest. One revealed card is auto-kept; with several, the owner chooses.
  if (effect.type === "DECK_DIG_KEEP_ONE") {
    const digPlayer = state.players[action.playerId];
    const revealed: CardId[] = [];
    for (let index = 0; index < effect.count; index += 1) {
      const drawn = digPlayer.deck.pop();
      if (!drawn) {
        break;
      }
      revealed.push(drawn);
    }
    if (revealed.length === 1) {
      digPlayer.hand.push(revealed[0]);
    } else if (revealed.length > 1) {
      state.pendingChoice = {
        id: `choice_${nextEventNumber(state)}`,
        type: "OPTION_CHOICE",
        playerId: action.playerId,
        prompt: `${card.name}: keep one card; the rest go to your discard pile.`,
        options: revealed.map((cardId) => ({ label: `Keep ${cards[cardId]?.name ?? cardId}` })),
        context: "own-deck-pick",
        ownDeckPick: { cardIds: revealed },
        returnPhase: state.combat ? "combat" : "player-turn"
      };
      state.phase = "choice";
      state.priorityPlayerId = action.playerId;
    }
  }

  // Jeddite's Mysterious Warlock I/VI: dig the top `count` cards of your own
  // deck, keep every Spell and Specialty among them in your hand, discard the
  // rest. No choice — all matches are taken automatically.
  if (effect.type === "DECK_DIG_KEEP_MATCHING") {
    const digPlayer = state.players[action.playerId];
    const kept: CardId[] = [];
    const discarded: CardId[] = [];
    for (let index = 0; index < effect.count; index += 1) {
      const drawn = digPlayer.deck.pop();
      if (!drawn) {
        break;
      }
      const drawnKind = cards[drawn]?.kind;
      const matches =
        effect.filter === "spell-or-specialty" && (drawnKind === "spell" || drawnKind === "hero-specialty");
      if (matches) {
        digPlayer.hand.push(drawn);
        kept.push(drawn);
      } else {
        digPlayer.discard.push(drawn);
        discarded.push(drawn);
      }
    }
    appendEvent(state, {
      type: "CARDS_DRAWN",
      playerId: action.playerId,
      count: kept.length,
      requested: effect.count,
      reshuffledDiscard: false
    });
  }

  // Tazar's War Hero VI: draw the top card of the shared Artifact deck (the
  // Legacy "artifacts" deck, or the BINH Minor deck) straight to hand. The
  // option's `cost` already paid the printed price before we get here.
  if (effect.type === "DRAW_TOP_ARTIFACT") {
    // Tazar's War Hero VI: draw the top of an Artifact deck of the player's
    // choice. Legacy has one ("artifacts"); BINH splits Minor/Major/Relic — when
    // more than one still holds cards the caster picks which to draw from.
    const available = ARTIFACT_DECK_IDS.filter((deckId) => (state.decks[deckId]?.drawPile.length ?? 0) > 0);
    if (available.length === 1) {
      drawTopArtifact(state, action.playerId, available[0]);
    } else if (available.length > 1) {
      state.pendingChoice = {
        id: `choice_${nextEventNumber(state)}`,
        type: "OPTION_CHOICE",
        playerId: action.playerId,
        prompt: `${card.name}: draw the top card of which Artifact deck?`,
        options: available.map((deckId) => ({ label: `Draw the top ${ARTIFACT_DECK_LABELS[deckId]} Artifact` })),
        context: "artifact-deck-pick",
        artifactDeckPick: { deckIds: available },
        returnPhase: state.combat ? "combat" : "player-turn"
      };
      state.phase = "choice";
      state.priorityPlayerId = action.playerId;
    }
  }

  // Adrienne's Fire Magic IV: Search (`count`) your own deck (reveal the top
  // `count`, keep one, the rest to discard), then shuffle the discard pile back
  // into the deck. The reshuffle runs AFTER the pick (the own-deck-pick choice
  // carries `thenReshuffleDiscard`); a 0/1-card reveal reshuffles immediately.
  if (effect.type === "SEARCH_DECK_THEN_RESHUFFLE") {
    const searchPlayer = state.players[action.playerId];
    const revealed: CardId[] = [];
    for (let index = 0; index < effect.count; index += 1) {
      const drawn = searchPlayer.deck.pop();
      if (!drawn) {
        break;
      }
      revealed.push(drawn);
    }
    if (revealed.length > 1) {
      state.pendingChoice = {
        id: `choice_${nextEventNumber(state)}`,
        type: "OPTION_CHOICE",
        playerId: action.playerId,
        prompt: `${card.name}: take one card into your hand (the rest go to your discard pile), then your discard pile shuffles into your deck.`,
        options: revealed.map((cardId) => ({ label: `Take ${cards[cardId]?.name ?? cardId}` })),
        context: "own-deck-pick",
        ownDeckPick: { cardIds: revealed, thenReshuffleDiscard: true },
        returnPhase: state.combat ? "combat" : "player-turn"
      };
      state.phase = "choice";
      state.priorityPlayerId = action.playerId;
    } else {
      // 0 or 1 revealed: keep the single card (if any), then reshuffle now.
      if (revealed.length === 1) {
        searchPlayer.hand.push(revealed[0]);
      }
      searchPlayer.deck = shuffleCards(
        [...searchPlayer.deck, ...searchPlayer.discard],
        `${state.seed}#fire-magic-iv#${action.playerId}#${eventSeedNumber(state)}`
      );
      searchPlayer.discard = [];
    }
  }

  // Gem's First Aid: take the war machine from the catalog for free (Torosar's
  // Ballista I pays gold), or draw the fallback when the player already owns it.
  // The catalog is per-player (not a shared depleting pool): a grant is available
  // as long as THIS player does not already hold that machine.
  if (effect.type === "GAIN_WAR_MACHINE") {
    const supply = state.adventure?.warMachineSupply ?? [];
    const available =
      supply.includes(effect.warMachineCardId) &&
      !playerOwnsWarMachine(state, action.playerId, effect.warMachineCardId);
    if (state.adventure && available) {
      const cost = effect.goldCost ? { gold: effect.goldCost } : {};
      if (effect.goldCost) {
        const buyer = state.players[action.playerId];
        if (!buyer || buyer.resources.gold < effect.goldCost) {
          throw new Error(`Not enough gold to gain the ${cards[effect.warMachineCardId]?.name ?? "war machine"}.`);
        }
        buyer.resources.gold -= effect.goldCost;
        appendEvent(state, {
          type: "RESOURCES_SPENT",
          playerId: action.playerId,
          cost,
          reason: `gained the ${cards[effect.warMachineCardId]?.name ?? "war machine"}`
        });
      }
      // Catalog is NOT depleted — other players keep their access to this machine.
      state.players[action.playerId].hand.push(effect.warMachineCardId);
      appendEvent(state, {
        type: "WAR_MACHINE_BOUGHT",
        playerId: action.playerId,
        cardId: effect.warMachineCardId,
        cost,
        at: "factory"
      });
    } else if (effect.fallbackDrawCards) {
      drawCardsForPlayer(state, action.playerId, effect.fallbackDrawCards);
    }
  }

  // Gem's First Aid VI: double the in-play First Aid Tent's per-round heal for
  // the rest of this Combat. The Tent's combat effect is rebuilt fresh (amount
  // 1) at the start of the player's next combat, so the doubling never carries.
  if (effect.type === "DOUBLE_FIRST_AID_TENT") {
    for (const active of state.activeEffects) {
      if (active.controllerId !== action.playerId) {
        continue;
      }
      for (const modifier of active.modifiers) {
        if (modifier.type === "HEAL_ONCE_PER_COMBAT_ROUND") {
          modifier.amount *= 2;
        }
      }
    }
  }

  // Gelu's Sharpshooters IV / Dracon's Enchanters IV: discard a Pack of the
  // `from` unit, then fetch the single `to` card from a Neutral tier deck into
  // your unit deck. Tarnum (Conflux) IV reuses this with no unit to trade in —
  // it pays `goldCost` (10) instead of discarding a from-unit.
  if (effect.type === "CONVERT_ARMY_UNIT") {
    const player = state.players[action.playerId];
    const deck = state.decks[NEUTRAL_DECK_IDS[effect.toTier]];
    const tradesUnit = Boolean(effect.fromUnitDefId);
    const fromIndex = tradesUnit
      ? (player?.army.findIndex(
          (unit) => unit.unitDefId === effect.fromUnitDefId && unit.side === effect.fromSide
        ) ?? -1)
      : -1;
    const alreadyHas = effect.unique
      ? (player?.army.some((unit) => unit.unitDefId === effect.toUnitDefId) ?? false)
      : false;
    const inDraw = deck?.drawPile.indexOf(effect.toUnitDefId) ?? -1;
    const inDiscard = deck?.discardPile.indexOf(effect.toUnitDefId) ?? -1;
    const hasFrom = tradesUnit ? fromIndex >= 0 : true;
    const canPayGold = effect.goldCost ? (player?.resources.gold ?? 0) >= effect.goldCost : true;
    if (player && deck && hasFrom && canPayGold && !alreadyHas && (inDraw >= 0 || inDiscard >= 0)) {
      if (tradesUnit) {
        player.army.splice(fromIndex, 1);
      }
      if (effect.goldCost) {
        player.resources.gold -= effect.goldCost;
        appendEvent(state, {
          type: "RESOURCES_SPENT",
          playerId: action.playerId,
          cost: { gold: effect.goldCost },
          reason: `acquired the ${cards[effect.toUnitDefId]?.name ?? effect.toUnitDefId}`
        });
      }
      if (inDraw >= 0) {
        deck.drawPile.splice(inDraw, 1);
      } else {
        deck.discardPile.splice(inDiscard, 1);
      }
      const acquired = addArmyUnit(player, effect.toUnitDefId, "neutral");
      // House rule (BINH) — Gelu IV: bake the permanent +Attack onto THIS card so
      // every combat it joins starts (and stays) buffed. Gated on the individual
      // `gelu-sharpshooter-buff` toggle — off, the recruit is a plain Sharpshooters.
      const geluAttackBuff =
        effect.grantAttackBonus && houseRuleEnabled(state, "gelu-sharpshooter-buff")
          ? effect.grantAttackBonus
          : 0;
      if (geluAttackBuff) {
        acquired.permanentAttackBonus = geluAttackBuff;
      }
      appendEvent(state, {
        type: "UNIT_RECRUITED",
        playerId: action.playerId,
        unitDefId: effect.toUnitDefId,
        kind: "recruit",
        cost: effect.goldCost ? { gold: effect.goldCost } : {},
        ...(geluAttackBuff ? { attackBuff: geluAttackBuff } : {})
      });
    }
  }

  // Tarnum (Conflux) VI: "Search(1) Spell twice." Open the per-search deck
  // choice — the caster picks ONE Spell deck (basic or expert) to Search 1 card
  // from, `count` times. Each taken card is flagged for a free over-limit cast
  // that returns to the shared Spell deck (top or discard) rather than the
  // caster's own discard. Opens nothing when no Spell deck holds a card.
  if (effect.type === "TARNUM_OVERLIMIT_SEARCH") {
    openTarnumSearch(state, action.playerId, effect.count);
  }

  if (playedToDiscard) {
    holdOngoingCardIfEffectCreated(state, action.playerId, action.cardId, effectCountBeforePlay, "discard");
  }

  // Map Spells do not use the combat spell stack, so their SPELL_CAST_STARTED
  // reaction never existed. Offer the same Expert Knowledge recall explicitly
  // after map resolution. It is queued behind any immediate spell destination
  // choice (Dimension Door / View Earth), then becomes a real choose/decline
  // prompt; declining preserves both the card and the crown.
  if (card.kind === "spell" && !state.combat && playedToDiscard && state.adventure) {
    const player = state.players[action.playerId];
    const knowledgeCardId = player?.hand.find((cardId) => {
      const held = cards[cardId];
      return held?.effect.type === "RECALL_SPELL" && Boolean(held.effect.expertSpellLimitBonus);
    });
    const spellIsRecallable =
      Boolean(player?.discard.includes(action.cardId)) ||
      Boolean(player?.ongoingCards?.some((entry) => entry.cardId === action.cardId));
    if (player && knowledgeCardId && spellIsRecallable && hasExpertUseAvailable(state, action.playerId)) {
      // Append after rewards the Spell itself just queued (notably Town
      // Portal's destination), so "take it back" is always asked after the
      // map effect has finished rather than before its target is chosen.
      state.adventure.rewardQueue.push({
        playerId: action.playerId,
        kind: "visit-steps",
        steps: [
          {
            type: "CHOOSE_ONE",
            prompt: `Expert Knowledge: take ${card.name} back?`,
            options: [
              {
                label: `Use 1 crown and return ${card.name} to your hand`,
                steps: [
                  {
                    type: "KNOWLEDGE_RECALL_MAP_SPELL",
                    spellCardId: action.cardId,
                    knowledgeCardId
                  }
                ]
              },
              { label: `Keep Knowledge; leave ${card.name} spent`, steps: [] }
            ]
          }
        ]
      });
    }
  }

  // A play that opened a choice (Chain Lightning's allocation, Solmyr IV's deck
  // dig) owns the phase/priority it just set — don't stomp it back to combat.
  if (state.pendingChoice) {
    return;
  }

  if (state.phase === "combat" || state.combat) {
    state.phase = "combat";
  }
  state.priorityPlayerId = null;
  pumpAdventureQueues(state);
}

/** Picks the opposing player: the combat opponent, or the only other seat. */
function pickEnemyPlayerId(state: GameState, playerId: PlayerId): PlayerId | null {
  if (state.combat) {
    const enemyId =
      state.combat.attackerPlayerId === playerId ? state.combat.defenderPlayerId : state.combat.attackerPlayerId;
    return enemyId !== NEUTRAL_PLAYER_ID ? enemyId : null;
  }

  const others = state.turnOrder.filter((candidate) => candidate !== playerId && candidate !== NEUTRAL_PLAYER_ID);
  return others[0] ?? null;
}

/** Dragon Wing Tabard: random discard(s) from the enemy hand. */
function discardRandomEnemyCards(state: GameState, playerId: PlayerId, count: number): void {
  const enemyId = pickEnemyPlayerId(state, playerId);
  const enemy = enemyId ? state.players[enemyId] : undefined;
  if (!enemyId || !enemy) {
    return;
  }

  const random = createSeededRandom(`${state.seed}#enemy-discard#${eventSeedNumber(state)}`);
  for (let index = 0; index < count && enemy.hand.length > 0; index += 1) {
    const pick = random.nextInt(0, enemy.hand.length - 1);
    const [cardId] = enemy.hand.splice(pick, 1);
    enemy.discard.push(cardId);
    appendEvent(state, {
      type: "HAND_REFRESHED",
      playerId: enemyId,
      discarded: 1,
      drawn: 0
    });
    void cardId;
  }
}

/**
 * Eagle Eye: dig the Spell deck from the top for the first Basic (basic play)
 * or Expert (expert play) spell, reshuffle the rest, then take or discard
 * the find. In BINH mode the split decks make the dig a plain top-card draw
 * of the matching deck.
 */
function resolveEagleEyeDig(
  state: GameState,
  playerId: PlayerId,
  mode: CardPlayMode,
  cards: CardLibrary,
  school?: Exclude<SpellSchool, "any">
): void {
  const wantedLevel = mode === "expert" ? "expert" : "basic";
  // A Tome's School dig (option A) always reads the shared/basic Spell deck; the
  // level-based Eagle Eye dig may switch to the BINH Expert Spell deck.
  const deckId =
    !school && houseRuleEnabled(state, "split-decks") && wantedLevel === "expert" && state.decks["spells-expert"]
      ? "spells-expert"
      : "spells";
  const deck = state.decks[deckId];
  if (!deck) {
    return;
  }

  // Dig from the top of the draw pile for the first matching spell. A Tome's
  // School dig matches by School (any level — a school-agnostic "any" spell
  // counts as every School); the level dig matches by Basic/Expert level.
  const matches = (candidate: CardDefinition | undefined): boolean => {
    if (candidate?.kind !== "spell") {
      return false;
    }
    if (school) {
      const schools = candidate.spellSchools ?? [];
      return schools.includes(school) || schools.includes("any");
    }
    return (candidate.spellLevel ?? "basic") === wantedLevel;
  };
  const remaining = [...deck.drawPile];
  let foundCardId: string | null = null;
  for (let index = remaining.length - 1; index >= 0; index -= 1) {
    const candidateId = remaining[index];
    // House rule: a hero never keeps two copies of the same Spell. Dig PAST any
    // matching spell this hero may not take — one it already owns, or a
    // starting-only spell — exactly as a shared-deck Search redraws past it.
    // Without this, Eagle Eye / a Tome could hand a player a second copy of a
    // spell already in their hand/deck/discard.
    if (matches(cards[candidateId]) && canAcquireSharedDeckCard(state, playerId, deckId, candidateId)) {
      foundCardId = candidateId;
      remaining.splice(index, 1);
      break;
    }
  }

  if (!foundCardId) {
    return;
  }

  const digLabel = school ? `${school} Magic` : "Eagle Eye";
  deck.drawPile = shuffleCards(remaining, `${state.seed}#eagle-eye#${eventSeedNumber(state)}`);

  const choiceId = `choice_${nextEventNumber(state)}`;
  state.pendingChoice = {
    id: choiceId,
    type: "OPTION_CHOICE",
    playerId,
    prompt: `${digLabel} found ${cards[foundCardId]?.name ?? foundCardId}`,
    options: [{ label: `Take ${cards[foundCardId]?.name ?? foundCardId} into hand` }, { label: "Discard it" }],
    context: "eagle-eye",
    eagleEye: { deckId, cardId: foundCardId },
    returnPhase: state.combat ? "combat" : "player-turn"
  };
  state.phase = "choice";
  state.priorityPlayerId = playerId;
}

/** Town Portal: choose a controlled town or flagged settlement to move to. */
function queueTownPortalChoice(state: GameState, playerId: PlayerId, movementBonus: number): void {
  const adventure = state.adventure;
  const hero = getMainHero(state, playerId);
  if (!adventure || !hero) {
    return;
  }

  // Rulebook restriction: "If the selected town already has a hero in it, and
  // the teleporting hero would not be able to move out of the city during this
  // turn, they can not teleport to the town." The Power-scaled movement bonus
  // counts toward being able to leave, so it is added to the projection.
  const projectedMovement = hero.movementPoints + movementBonus;
  const fieldHasOtherHero = (spaceId: string) =>
    Object.values(state.heroes).some((other) => other.id !== hero.id && other.spaceId === spaceId);
  const destinationAllowed = (spaceId: string) => !fieldHasOtherHero(spaceId) || projectedMovement > 0;

  const destinations: { label: string; spaceId: string }[] = [];
  const origin = hero.spaceId ? parseHexSpaceId(hero.spaceId) : null;
  const distanceSuffix = (spaceId: string): string => {
    const coord = parseHexSpaceId(spaceId);
    const distance = origin && coord ? hexDistance(origin, coord) : null;
    return distance ? ` (${distance} field${distance === 1 ? "" : "s"} away)` : "";
  };
  for (const town of Object.values(state.towns)) {
    if (
      town.controllerId === playerId &&
      town.fieldId &&
      town.fieldId !== hero.spaceId &&
      destinationAllowed(town.fieldId)
    ) {
      destinations.push({
        label: `Town (${town.factionId ?? town.id})${distanceSuffix(town.fieldId)}`,
        spaceId: town.fieldId
      });
    }
  }
  for (const field of Object.values(adventure.fields)) {
    if (
      field.location === "settlement" &&
      field.flagOwnerId === playerId &&
      field.spaceId !== hero.spaceId &&
      destinationAllowed(field.spaceId)
    ) {
      destinations.push({ label: `Settlement${distanceSuffix(field.spaceId)}`, spaceId: field.spaceId });
    }
  }

  if (destinations.length === 0) {
    return;
  }

  adventure.rewardQueue.unshift({
    playerId,
    kind: "visit-steps",
    steps: [
      {
        type: "CHOOSE_ONE",
        prompt: "Town Portal: move your hero to…",
        options: [
          ...destinations.map((destination) => ({
            label: destination.label,
            steps: [
              { type: "TELEPORT_HERO" as const, heroId: hero.id, spaceId: destination.spaceId, movementBonus }
            ]
          })),
          { label: "Cancel (stay)", steps: [] }
        ]
      }
    ]
  });
}

function applyActiveEffectAction(
  state: GameState,
  action: Extract<GameAction, { type: "USE_ACTIVE_EFFECT" }>
): void {
  const combat = state.combat;
  const effect = state.activeEffects.find((candidate) => candidate.id === action.effectId);
  if (!combat || !effect || effect.controllerId !== action.playerId || action.target.type !== "unit") {
    throw new Error("That active effect cannot be used now.");
  }

  const healModifier = effect.modifiers.find((modifier) => modifier.type === "HEAL_ONCE_PER_COMBAT_ROUND");
  const target = combat.units[action.target.unitId];
  if (
    !healModifier ||
    healModifier.type !== "HEAL_ONCE_PER_COMBAT_ROUND" ||
    !target ||
    target.controllerId !== action.playerId ||
    !isUnitAlive(target) ||
    target.damage <= 0
  ) {
    throw new Error("That active effect target is not legal.");
  }

  // First Aid Tent: a single basic heal per round, OR an expert activation that
  // heals several times this round. The expert is the First Aid ability card's
  // expert side — the player must hold that card with a free expert use; playing
  // it spends the crown and discards the card. Basic and expert are mutually
  // exclusive within a round. The volley size (`expertMax`) is read from the
  // First Aid card, so it stays the source of truth (mirrors Artillery/Ballista).
  const expertMax = firstAidVolleyHeals();
  const usage = effect.healRound?.round === combat.round ? effect.healRound : undefined;
  const mode = action.mode ?? "basic";

  if (mode === "expert") {
    if (usage || !playerCanUseFirstAidVolley(state, action.playerId)) {
      throw new Error("First Aid's expert side needs the First Aid card and a free expert use this round.");
    }
    spendFirstAidExpert(state, action.playerId);
    // Pin the volley to this first target: the card heals "the same target 3
    // times", so the follow-up heals below can only land on this unit.
    effect.healRound = { round: combat.round, count: 1, expert: true, targetUnitId: action.target.unitId };
  } else if (!usage) {
    effect.healRound = { round: combat.round, count: 1, expert: false };
  } else if (usage.expert && usage.count < expertMax) {
    // The expert volley resolves against the SAME target every time.
    if (usage.targetUnitId && usage.targetUnitId !== action.target.unitId) {
      throw new Error("First Aid's expert volley must heal the same target each time.");
    }
    usage.count += 1;
  } else {
    throw new Error("That active effect has already been used this combat round.");
  }

  healUnitDamage(state, effect.source, action.target, healModifier.amount);

  appendEvent(state, {
    type: "ACTIVE_EFFECT_USED",
    effectId: effect.id,
    playerId: action.playerId,
    target: action.target
  });

  // Used as an instant inside an open reaction window (e.g. mending a wound the
  // moment your unit is attacked, before the hit is calculated): leave the
  // window's phase/priority intact so it can be refreshed and resumed by the
  // caller. Only a heal taken on the player's own turn resets to plain combat.
  if (!state.reactionWindow) {
    state.phase = "combat";
    state.priorityPlayerId = null;
  }
}

function applyUnitAbilityAction(
  state: GameState,
  action: Extract<GameAction, { type: "USE_UNIT_ABILITY" }>
): void {
  const combat = state.combat;
  const unit = combat?.units[action.unitId];
  const ability = unit ? getUnitAbilityDefinitions(unit).find((candidate) => candidate.id === action.abilityId) : undefined;

  // The Dreadnought splash is an attack ALTERNATIVE, so — unlike the pre-move
  // "other actions" (token place, Summon Demons) — it stays available after an
  // optional move (just never once the unit has attacked).
  const isSplashAllocation = ability?.effect?.type === "SPLASH_ALLOCATION_ATTACK";

  if (
    !combat ||
    !unit ||
    unit.controllerId !== action.playerId ||
    unit.activatedThisRound ||
    (unit.movedThisActivation && !isSplashAllocation) ||
    combat.activeUnitId !== unit.id ||
    ability?.implementationStatus !== "implemented"
  ) {
    throw new Error("That unit ability cannot be used now.");
  }

  // Token "other action" (Ogres' Attack/"Bloodlust" token, Few Sorceresses'
  // Weakness token): used instead of attacking. The player picks the recipient
  // by clicking a unit on the board, so this opens an ABILITY_TARGET_CHOICE over
  // every legal target — the activation only ends once a target is chosen (the
  // token lands in chooseAbilityTarget). Cancelling the pick leaves the unit
  // free to act normally.
  if (ability.effect?.type === "PLACE_TOKEN_ACTION") {
    const effect = ability.effect;
    const candidateUnitIds = Object.values(combat.units)
      .filter((candidate) => {
        const sideOk =
          effect.targets === "any" ||
          (effect.targets === "friendly" && candidate.controllerId === unit.controllerId) ||
          (effect.targets === "enemy" && candidate.controllerId !== unit.controllerId);
        return (
          sideOk &&
          isUnitAlive(candidate) &&
          !isArrowTowerUnit(candidate) &&
          (!effect.targetTypes || effect.targetTypes.includes(candidate.type))
        );
      })
      .map((candidate) => candidate.id);
    if (candidateUnitIds.length === 0) {
      throw new Error("That unit ability cannot be used now.");
    }

    const sideWord = effect.targets === "enemy" ? "enemy " : effect.targets === "friendly" ? "friendly " : "";
    const choiceId = `choice_${nextEventNumber(state)}`;
    state.pendingChoice = {
      id: choiceId,
      type: "ABILITY_TARGET_CHOICE",
      playerId: unit.controllerId,
      kind: "place-token",
      abilityId: ability.id,
      abilityName: ability.name,
      prompt: `${unit.cardName}: place a ${ability.name} (${effect.amount >= 0 ? "+" : ""}${effect.amount}) on a chosen ${sideWord}unit.`,
      sourceUnitId: unit.id,
      anchorUnitId: null,
      candidateUnitIds,
      amount: effect.amount,
      tokenKind: effect.token,
      tokenRounds: effect.rounds,
      optional: true,
      skipLabel: "Cancel"
    };
    state.phase = "choice";
    state.priorityPlayerId = unit.controllerId;
    appendEvent(state, {
      type: "PENDING_CHOICE_CREATED",
      choiceId,
      choiceType: "ABILITY_TARGET_CHOICE",
      playerId: unit.controllerId,
      sourceEffectIds: [],
      message: `${unit.cardName} chooses where to place a ${ability.name}.`
    });
    return;
  }

  // WOG commander command ability: once per combat round, free during the
  // commander's own activation (it may still move and attack afterwards). The
  // player picks the target by clicking a glowing unit on the board — the
  // targeting rules (side, ranged/melee, mechanical, tier ladder, adjacency,
  // rune cost) all live in commanderCastCandidates/commanderCastAvailable.
  // Cancelling the pick costs nothing.
  if (ability.effect?.type === "COMMANDER_CAST") {
    const cast = commanderCastOf(unit);
    if (!cast || unit.attackedThisActivation || commanderCastUsedThisRound(state, unit)) {
      throw new Error("That unit ability cannot be used now.");
    }
    const runeCost = commanderCastRuneCost(state, unit);
    if (runeCost > 0 && commanderRunePool(state, unit.controllerId) < runeCost) {
      throw new Error(`${ability.name} needs ${runeCost} Runes.`);
    }
    const candidateUnitIds = commanderCastCandidates(state, unit).map((candidate) => candidate.id);
    if (candidateUnitIds.length === 0) {
      throw new Error("That unit ability cannot be used now.");
    }

    const power = commanderCastPower(state, unit);
    const choiceId = `choice_${nextEventNumber(state)}`;
    state.pendingChoice = {
      id: choiceId,
      type: "ABILITY_TARGET_CHOICE",
      playerId: unit.controllerId,
      kind: "commander-cast",
      abilityId: ability.id,
      abilityName: ability.name,
      prompt: `${unit.cardName}: cast ${ability.name} (Power ${power}) on a chosen ${cast.targeting.side === "enemy" ? "enemy" : "friendly"} unit.${runeCost > 0 ? ` Costs ${runeCost} Runes.` : ""}`,
      sourceUnitId: unit.id,
      anchorUnitId: null,
      candidateUnitIds,
      optional: true,
      skipLabel: "Cancel"
    };
    state.phase = "choice";
    state.priorityPlayerId = unit.controllerId;
    appendEvent(state, {
      type: "PENDING_CHOICE_CREATED",
      choiceId,
      choiceType: "ABILITY_TARGET_CHOICE",
      playerId: unit.controllerId,
      sourceEffectIds: [],
      message: `${unit.cardName} chooses a target for ${ability.name}.`
    });
    return;
  }

  // Factory Dreadnoughts (Juggernaut): "[activation] Instead of attacking, select
  // up to N units adjacent to this one. Allocate the printed damage, starting
  // with the first selected." Offered as an "other action" in place of attacking;
  // opens the sequential allocation picker over every adjacent unit (friend and
  // foe — the card places no side restriction). A pure flat allocation, so it
  // never provokes a Retaliation Attack.
  if (ability.effect?.type === "SPLASH_ALLOCATION_ATTACK") {
    if (unit.attackedThisActivation) {
      throw new Error("That unit ability cannot be used now.");
    }
    const adjacent = getUnitsAdjacentTo(combat, unit).filter((candidate) => !isArrowTowerUnit(candidate));
    if (adjacent.length === 0) {
      throw new Error("That unit ability cannot be used now.");
    }
    openDreadnoughtSplashChoice(
      state,
      unit,
      ability.id,
      ability.name,
      adjacent.map((candidate) => candidate.id),
      ability.effect.damageValues
    );
    return;
  }

  const target = action.target.type === "unit" ? combat.units[action.target.unitId] : undefined;
  if (!target || !isUnitAlive(target)) {
    throw new Error("That unit ability cannot be used now.");
  }

  if (ability.effect?.type !== "ACTIVATION_ATTACK_BUFF") {
    throw new Error("That unit ability cannot be used now.");
  }

  if (target.controllerId !== action.playerId || !ability.effect.targetTypes.includes(target.type)) {
    throw new Error("That unit ability cannot be used now.");
  }

  createActiveEffect(
    state,
    {
      name: ability.name,
      scope: "unit",
      duration: ability.effect.duration,
      polarity: "positive",
      removable: true,
      modifiers: [
        {
          type: "ATTACK_BONUS",
          amount: ability.effect.amount
        }
      ]
    },
    {
      type: "unit",
      unitId: unit.id,
      controllerId: action.playerId
    },
    action.playerId,
    { type: "unit", unitId: target.id }
  );

  if (ability.effect.preventsMovement) {
    createActiveEffect(
      state,
      {
        name: `${ability.name} used`,
        scope: "unit",
        duration: { type: "current-combat-round" },
        polarity: "neutral",
        removable: false,
        modifiers: [{ type: "UNIT_CANNOT_MOVE" }]
      },
      {
        type: "unit",
        unitId: unit.id,
        controllerId: action.playerId
      },
      action.playerId,
      { type: "unit", unitId: unit.id }
    );
  }

  appendEvent(state, {
    type: "UNIT_ABILITY_TRIGGERED",
    unitId: unit.id,
    abilityId: ability.id,
    targetUnitId: target.id,
    message: `${unit.name} uses ${ability.name} on ${target.name}.`
  });

  if (ability.effect.endsActivation) {
    unit.activatedThisRound = true;
    advanceActiveUnit(state);
  }

  state.phase = "combat";
  state.priorityPlayerId = null;
}

/**
 * A combat space cannot host a summoned unit when it is off the board, holds a
 * living unit, an obstacle token, or a siege Wall/Gate. Shared by the Summon
 * Elemental spell's resolution and its legal-target enumeration.
 */
export function isSpaceBlockedForSummon(combat: CombatState, position: number): boolean {
  if (!isBattlefieldPosition(position)) {
    return true;
  }
  if ((combat.obstacles ?? []).includes(position)) {
    return true;
  }
  // Any spell token (Force Field / Fire Wall / Quicksand / Land Mine) holds a
  // space: a unit cannot be summoned or teleported onto it.
  if ((combat.battlefieldTokens ?? []).some((token) => token.position === position)) {
    return true;
  }
  if (combat.siege?.walls.includes(position) || combat.siege?.gatePosition === position) {
    return true;
  }
  return Object.values(combat.units).some((unit) => isUnitAlive(unit) && unit.position === position);
}

/**
 * Places a freshly summoned unit (Summon Elemental spell) onto an empty combat
 * space: it joins the caster's army and the combat at once, acting on its own
 * initiative this round — exactly like the Pit Lords' Demons. Returns the new
 * combat unit, or null when the space is unusable or the side is missing.
 */
function placeSummonedUnit(
  state: GameState,
  playerId: PlayerId,
  unitDefId: string,
  side: "few" | "pack",
  position: number
): CombatUnitState | null {
  const combat = state.combat;
  const player = state.players[playerId];
  if (!combat || !player || isSpaceBlockedForSummon(combat, position) || !getUnitSide(unitDefId, side)) {
    return null;
  }

  const armyUnit = addArmyUnit(player, unitDefId, side);
  const summoned = makeCombatUnitFromArmy(
    armyUnit,
    playerId,
    `unit_${playerId}_${armyUnit.id}`,
    position,
    getRuleset(state),
    unitSideRuleOverrides(state)
  );
  if (!summoned) {
    return null;
  }

  // It joins the round immediately — it may still act when its initiative comes.
  summoned.activatedThisRound = false;
  // Conjured units have no printed grade: flag them so the neutral AI skips its
  // same-tier rule for them and only attacks them once no graded target remains.
  summoned.summoned = true;
  combat.units[summoned.id] = summoned;
  return summoned;
}

/**
 * Clone Spell: place a 1-Health Clone Token copying `original` onto an empty
 * space. The Clone is rebuilt from the original's PRINTED side (its unitDefId +
 * variant via makeCombatUnitFromArmy), so it copies the printed statistics, type
 * and printed abilities but none of the ongoing effects, tokens or specialty
 * transforms layered on the original — exactly "everything printed on its card,
 * excluding any other effects played on the original". Its maxHealth is forced to
 * 1, it carries no army card (it is a token, removed when the combat ends), and it
 * is linked to its original by cloneOfUnitId so it dies with it. Returns the new
 * Clone, or null when the space is unusable or the original has no printed side.
 */
function placeCloneUnit(
  state: GameState,
  playerId: PlayerId,
  original: CombatUnitState,
  position: number
): CombatUnitState | null {
  const combat = state.combat;
  if (!combat || isSpaceBlockedForSummon(combat, position) || !original.unitDefId) {
    return null;
  }

  const clone = makeCombatUnitFromArmy(
    { id: `clonetoken_${nextEventNumber(state)}`, unitDefId: original.unitDefId, side: original.variant },
    playerId,
    `unit_${playerId}_clone_${nextEventNumber(state)}`,
    position,
    getRuleset(state),
    unitSideRuleOverrides(state)
  );
  if (!clone) {
    return null;
  }

  // A 1-Health token of the printed unit. It acts on its own initiative this
  // round (not pre-activated) and is gradeless to the neutral AI like a summon.
  clone.maxHealth = 1;
  clone.damage = 0;
  clone.activatedThisRound = false;
  clone.summoned = true;
  clone.cloneOfUnitId = original.id;
  clone.cardName = `Clone of ${original.cardName}`;
  // It is a Clone Token, not a real army card: drop the army linkage so it is
  // never mistaken for a recruited unit (and is discarded when the combat ends).
  delete clone.armyUnitId;
  combat.units[clone.id] = clone;
  return clone;
}

/**
 * First empty cell on the player's side of the board (back row first, so a
 * borrowed ranged unit lands in the back), falling back to any free cell.
 */
function findBorrowDeploymentCell(combat: CombatState, playerId: PlayerId): number | undefined {
  const region =
    playerId === combat.attackerPlayerId ? [16, 17, 18, 19, 12, 13, 14, 15] : [0, 1, 2, 3, 4, 5, 6, 7];
  const inRegion = region.find((position) => !isSpaceBlockedForSummon(combat, position));
  if (inRegion !== undefined) {
    return inRegion;
  }
  for (let position = 0; position < BATTLEFIELD_CELL_COUNT; position += 1) {
    if (!isSpaceBlockedForSummon(combat, position)) {
      return position;
    }
  }
  return undefined;
}

/**
 * Tarnum (Rampart) Sharpshooters VI: pull `unitDefId` out of the `tier` Neutral
 * deck (draw pile first, else its discard pile) and place a TEMPORARY combat unit
 * on an empty cell on the player's side. The unit carries no army card, so it is
 * never written back to the army; finalizeAdventureCombat returns its card to the
 * Neutral discard pile when the Combat ends. Returns the new unit, or null when
 * it could not be borrowed (card not in the deck, or no room on the board).
 */
function borrowNeutralUnit(
  state: GameState,
  playerId: PlayerId,
  unitDefId: string,
  tier: "bronze" | "silver" | "gold" | "azure"
): CombatUnitState | null {
  const combat = state.combat;
  const deck = state.decks[NEUTRAL_DECK_IDS[tier]];
  if (!combat || !deck) {
    return null;
  }
  const fromDraw = deck.drawPile.indexOf(unitDefId);
  const fromDiscard = fromDraw >= 0 ? -1 : deck.discardPile.indexOf(unitDefId);
  if (fromDraw >= 0) {
    deck.drawPile.splice(fromDraw, 1);
  } else if (fromDiscard >= 0) {
    deck.discardPile.splice(fromDiscard, 1);
  } else {
    return null;
  }

  const position = findBorrowDeploymentCell(combat, playerId);
  const unit =
    position === undefined
      ? null
      : makeCombatUnitFromArmy(
          { id: `borrow_${nextEventNumber(state)}`, unitDefId, side: "neutral" },
          playerId,
          `unit_${playerId}_borrow_${nextEventNumber(state)}`,
          position,
          getRuleset(state),
          unitSideRuleOverrides(state)
        );
  if (!unit) {
    // Could not place it: return the borrowed card to the discard pile and bail.
    deck.discardPile.push(unitDefId);
    return null;
  }
  // Borrowed: gradeless to the neutral AI (like a summon), no army card (never
  // written back), and it acts on its own initiative this round.
  unit.summoned = true;
  unit.temporary = true;
  unit.activatedThisRound = false;
  delete unit.armyUnitId;
  combat.units[unit.id] = unit;
  return unit;
}

/** Crag Hack's Offense VI aura, if the player has it up this Combat. */
function cardsAsAttackBonusFor(state: GameState, playerId: PlayerId): number {
  let amount = 0;
  for (const effect of state.activeEffects) {
    if (effect.scope !== "player" || effect.controllerId !== playerId) {
      continue;
    }
    for (const modifier of effect.modifiers) {
      if (modifier.type === "CARDS_AS_ATTACK_BONUS") {
        amount += modifier.amount;
      }
    }
  }
  return amount;
}

/**
 * Crag Hack's Offense VI: discard a held card during one of your unit's attacks
 * to add the aura's bonus to that attack ("every card you play can grant +1
 * attack instead of its regular effect"). The card is discarded for its converted
 * effect, never its printed one.
 */
function convertCardToAttack(
  state: GameState,
  action: Extract<GameAction, { type: "CONVERT_CARD_TO_ATTACK" }>
): void {
  const player = state.players[action.playerId];
  const amount = cardsAsAttackBonusFor(state, action.playerId);
  if (!player || amount <= 0) {
    throw new Error("Offense VI is not active.");
  }
  const handIndex = player.hand.indexOf(action.cardId);
  if (handIndex === -1) {
    throw new Error("That card is not in your hand.");
  }
  const stackItem = state.stack.at(-1);
  const attackerId =
    stackItem && (stackItem.action.type === "ATTACK_UNIT" || stackItem.action.type === "MOVE_AND_ATTACK_UNIT")
      ? stackItem.action.attackerId
      : null;
  const attacker = attackerId ? state.combat?.units[attackerId] : undefined;
  if (!stackItem || !attacker || attacker.controllerId !== action.playerId) {
    throw new Error("Convert a card while one of your units' attacks waits to resolve.");
  }
  if (stackItem.modifiers.negateAttackBuffs) {
    throw new Error("This attack cannot be buffed.");
  }

  player.hand.splice(handIndex, 1);
  player.discard.push(action.cardId);
  stackItem.modifiers.attackBonus += amount;
  appendEvent(state, {
    type: "CARD_PLAYED",
    playerId: action.playerId,
    cardId: action.cardId,
    timing: cardLibrary[action.cardId]?.timing ?? "instant",
    mode: "basic",
    optionLabel: `Offense VI: +${amount} attack instead`
  });
}

/**
 * Pit Lords' "Summon Demons" other action: instead of moving or attacking, the
 * active Pit Lords either summon a Few of Demons onto an empty adjacent space
 * or reinforce a friendly Few of Demons up to a Pack — once per combat, only
 * after one of the controller's units has been removed this combat. The new /
 * reinforced unit also persists in the army after the combat. The summoned
 * unit is treated as already activated this round (it acts from the next).
 */
/**
 * Tower Genies' "Wish": discard up to `count` cards off the top of the
 * controller's deck. The deck reshuffles its discard pile to complete the count
 * if it runs out mid-dig (per the rules). Returns the cards dug this way; the
 * caller routes them to the hand/discard.
 */
function discardFromDeckTop(state: GameState, playerId: PlayerId, count: number): CardId[] {
  const player = state.players[playerId];
  if (!player) {
    return [];
  }
  const dug: CardId[] = [];
  for (let index = 0; index < count; index += 1) {
    if (player.deck.length === 0 && player.discard.length > 0) {
      player.deck = shuffleCards(
        player.discard,
        `${state.seed}#genie-reshuffle#${playerId}#${eventSeedNumber(state)}#${index}`
      );
      player.discard = [];
    }
    const card = player.deck.pop();
    if (!card) {
      break;
    }
    dug.push(card);
  }
  return dug;
}

/**
 * Resolves a Genies "Wish": dig cards off the deck, then take a Spell among
 * them to hand. With at most one Spell it auto-resolves (the lone Spell, if
 * any, goes to hand; everything else to discard); with several Spells the
 * controller chooses which to take. Returns true when a choice paused combat.
 */
function runGenieDeckDraw(
  state: GameState,
  unit: CombatUnitState,
  ability: { abilityId: string; abilityName: string; count: number },
  mode: "other-action" | "on-attack"
): boolean {
  const player = state.players[unit.controllerId];
  if (!player) {
    return false;
  }

  const dug = discardFromDeckTop(state, unit.controllerId, ability.count);
  const spells = dug.filter((cardId) => cardLibrary[cardId]?.kind === "spell");

  appendEvent(state, {
    type: "UNIT_ABILITY_TRIGGERED",
    unitId: unit.id,
    abilityId: ability.abilityId,
    message: `${unit.cardName} discards ${dug.length} card${dug.length === 1 ? "" : "s"} from the deck for ${ability.abilityName}.`
  });

  // No choice to make: take the single Spell (if any) to hand, the rest to
  // discard. A neutral seat with no deck simply dug nothing.
  if (spells.length <= 1) {
    const taken = spells[0];
    for (const cardId of dug) {
      if (cardId === taken) {
        player.hand.push(cardId);
      } else {
        player.discard.push(cardId);
      }
    }
    if (taken) {
      appendEvent(state, {
        type: "UNIT_ABILITY_TRIGGERED",
        unitId: unit.id,
        abilityId: ability.abilityId,
        message: `${player.name} takes ${cardLibrary[taken]?.name ?? taken} to hand.`
      });
    }
    return false;
  }

  // Several Spells dug up: the non-Spells go to discard now; the controller
  // chooses which Spell to keep (the rest go to discard on resolution).
  for (const cardId of dug) {
    if (cardLibrary[cardId]?.kind !== "spell") {
      player.discard.push(cardId);
    }
  }
  state.pendingChoice = {
    id: `choice_${nextEventNumber(state)}`,
    type: "OPTION_CHOICE",
    playerId: unit.controllerId,
    prompt: `${ability.abilityName}: take one Spell to your hand; the rest go to your discard pile.`,
    options: spells.map((cardId) => ({ label: `Take ${cardLibrary[cardId]?.name ?? cardId}` })),
    context: "genie-take-spell",
    genieTakeSpell: { spellCardIds: spells, unitId: unit.id, mode, abilityId: ability.abilityId },
    returnPhase: "combat"
  };
  state.phase = "choice";
  state.priorityPlayerId = unit.controllerId;
  return true;
}

/** Tower Genies (Pack): the after-attack "Wish". Returns true when it paused combat. */
function openGenieSpellDraw(state: GameState, attacker: CombatUnitState, isRetaliation: boolean): boolean {
  if (isRetaliation || !state.combat) {
    return false;
  }
  const ability = getDeckDiscardTakeSpell(attacker, "on-attack");
  if (!ability) {
    return false;
  }
  return runGenieDeckDraw(state, attacker, ability, "on-attack");
}

/** Tower Genies (Few): the "Wish" used as an other action (instead of moving/attacking). */
function applyGenieDeckDraw(
  state: GameState,
  action: Extract<GameAction, { type: "USE_GENIE_DECK_DRAW" }>
): void {
  const combat = state.combat;
  const unit = combat?.units[action.unitId];
  const ability = unit ? getDeckDiscardTakeSpell(unit, "other-action") : null;
  if (
    !combat ||
    !unit ||
    unit.controllerId !== action.playerId ||
    combat.activeUnitId !== unit.id ||
    unit.activatedThisRound ||
    unit.movedThisActivation ||
    unit.attackedThisActivation ||
    !ability
  ) {
    throw new Error("That unit's Wish cannot be used now.");
  }

  // The Wish is the unit's whole activation.
  const paused = runGenieDeckDraw(state, unit, ability, "other-action");
  unit.activatedThisRound = true;
  if (paused) {
    // The spell-pick choice resolver advances to the next unit afterwards.
    return;
  }
  advanceActiveUnit(state);
  state.phase = "combat";
  state.priorityPlayerId = null;
}

/**
 * Resolves the Genies "Wish" spell-pick: the chosen Spell goes to hand, the
 * rest to the discard pile, then combat continues — the Few's activation ends,
 * the Pack's parked attack sequence resumes.
 */
function resolveGenieTakeSpell(
  state: GameState,
  action: Extract<GameAction, { type: "CHOOSE_OPTION" }>
): void {
  const choice = state.pendingChoice;
  if (
    !choice ||
    choice.type !== "OPTION_CHOICE" ||
    choice.context !== "genie-take-spell" ||
    choice.id !== action.choiceId ||
    choice.playerId !== action.playerId ||
    !choice.genieTakeSpell
  ) {
    throw new Error("There is no Wish choice to resolve.");
  }

  const pick = choice.genieTakeSpell;
  const player = state.players[action.playerId];
  const chosen = pick.spellCardIds[action.optionIndex];
  if (!player || !chosen) {
    throw new Error("Pick one of the dug Spells.");
  }

  player.hand.push(chosen);
  player.discard.push(...pick.spellCardIds.filter((_, index) => index !== action.optionIndex));
  appendEvent(state, {
    type: "UNIT_ABILITY_TRIGGERED",
    unitId: pick.unitId,
    abilityId: pick.abilityId,
    message: `${player.name} takes ${cardLibrary[chosen]?.name ?? chosen} to hand.`
  });

  state.pendingChoice = null;
  state.phase = "combat";
  state.priorityPlayerId = null;

  if (pick.mode === "other-action") {
    // The Few's whole activation was the Wish — hand off to the next unit.
    if (state.combat) {
      advanceActiveUnit(state);
    }
  } else {
    // The Pack's Wish rode its attack — resume the parked retaliation/sequence.
    resumeAttackSequence(state, cardLibrary);
    finishCombatIfNeeded(state);
  }
}

function summonDemons(state: GameState, action: Extract<GameAction, { type: "SUMMON_DEMONS" }>): void {
  const combat = state.combat;
  const unit = combat?.units[action.unitId];
  const player = state.players[action.playerId];
  const ability = unit
    ? getUnitAbilityDefinitions(unit).find((candidate) => candidate.effect?.type === "SUMMON_OR_REINFORCE_DEMONS")
    : undefined;

  if (
    !combat ||
    !unit ||
    !player ||
    unit.controllerId !== action.playerId ||
    combat.activeUnitId !== unit.id ||
    unit.activatedThisRound ||
    unit.movedThisActivation ||
    unit.attackedThisActivation ||
    unit.summonedThisCombat ||
    ability?.effect?.type !== "SUMMON_OR_REINFORCE_DEMONS" ||
    ability.implementationStatus !== "implemented" ||
    !combat.unitRemovedControllerIds?.includes(action.playerId)
  ) {
    throw new Error("Summon Demons cannot be used now.");
  }

  const demonDefId = ability.effect.demonUnitDefId;
  const ruleset = getRuleset(state);

  if (action.mode === "summon") {
    const position = action.position;
    if (
      position === undefined ||
      !isBattlefieldPosition(position) ||
      !getOrthogonalNeighbors(unit.position).includes(position) ||
      (combat.obstacles ?? []).includes(position) ||
      Object.values(combat.units).some((candidate) => isUnitAlive(candidate) && candidate.position === position)
    ) {
      throw new Error("Demons must be summoned onto an empty adjacent space.");
    }
    if (!getUnitSide(demonDefId, "few")) {
      throw new Error("Those Demons have no Few side to summon.");
    }

    const armyUnit = addArmyUnit(player, demonDefId, "few");
    const summoned = makeCombatUnitFromArmy(
      armyUnit,
      action.playerId,
      `unit_${action.playerId}_${armyUnit.id}`,
      position,
      ruleset,
      unitSideRuleOverrides(state)
    );
    if (!summoned) {
      throw new Error("Those Demons cannot be summoned.");
    }
    // The summoned Demons join the round immediately — they may still act this
    // round when their initiative comes up.
    summoned.activatedThisRound = false;
    combat.units[summoned.id] = summoned;

    appendEvent(state, {
      type: "UNIT_ABILITY_TRIGGERED",
      unitId: unit.id,
      abilityId: ability.id,
      targetUnitId: summoned.id,
      message: `${unit.cardName} summons ${summoned.cardName} at ${getBattlefieldLabel(position)}.`
    });
  } else {
    const targetUnit = action.targetUnitId ? combat.units[action.targetUnitId] : undefined;
    if (
      !targetUnit ||
      targetUnit.controllerId !== action.playerId ||
      !isUnitAlive(targetUnit) ||
      targetUnit.unitDefId !== demonDefId ||
      targetUnit.variant !== "few" ||
      !getUnitSide(demonDefId, "pack")
    ) {
      throw new Error("Only a friendly Few of Demons can be reinforced to a Pack.");
    }

    targetUnit.variant = "pack";
    applyUnitCurrentSide(targetUnit, ruleset, unitSideRuleOverrides(state));
    // Mirror onto the backing army card so the reinforcement survives the combat.
    const armyUnit = player.army.find((candidate) => candidate.id === targetUnit.armyUnitId);
    if (armyUnit) {
      armyUnit.side = "pack";
    }

    appendEvent(state, {
      type: "UNIT_ABILITY_TRIGGERED",
      unitId: unit.id,
      abilityId: ability.id,
      targetUnitId: targetUnit.id,
      message: `${unit.cardName} reinforces ${targetUnit.cardName}.`
    });
  }

  // The Pit Lords used their action instead of moving or attacking.
  unit.summonedThisCombat = true;
  unit.activatedThisRound = true;
  advanceActiveUnit(state);
  state.phase = "combat";
  state.priorityPlayerId = null;
}

/**
 * Earthquake (siege only): Power 0 removes 1 Wall/Gate of the caster's
 * choice, Power 1 removes 2, Power 2 deals 1 damage to every unit adjacent
 * to a fortification and brings them all down at once.
 */
function resolveEarthquakeSpell(state: GameState, playerId: PlayerId, power: number): void {
  const combat = state.combat;
  const siege = combat?.siege;
  if (!combat || !siege) {
    return;
  }

  if (power >= 2) {
    const positions = intactFortificationPositions(siege);
    for (const unit of Object.values(combat.units)) {
      if (!isUnitAlive(unit) || unit.position < 0) {
        continue;
      }
      if (!positions.some((position) => isAdjacent(unit.position, position))) {
        continue;
      }
      const dealt = reducedSpellDamage(state, unit, 1);
      unit.damage += dealt;
      noteUnitDamagedForTokens(state, unit, dealt);
      appendEvent(state, {
        type: "DAMAGE_ASSIGNED",
        source: { type: "system" },
        target: { type: "unit", unitId: unit.id },
        amount: dealt,
        damageKind: "spell"
      });
      markUnitRemovedIfNeeded(state, unit);
    }

    for (const position of positions) {
      destroyFortification(state, null, siege.gatePosition === position ? "gate" : "wall", position);
    }
    finishCombatIfNeeded(state);
    return;
  }

  openSiegeDemolishChoice(state, playerId, power <= 0 ? 1 : 2);
}

/**
 * Siege fortification attacks: an adjacent ground/flying unit demolishes a
 * Wall or the Gate as its attack — automatically successful, no die, no
 * cards, no attack abilities. Cyclops' printed ability does the same at any
 * range; its pack/neutral versions may also bring down the Arrow Tower.
 */
function attackFortification(
  state: GameState,
  action: Extract<GameAction, { type: "ATTACK_FORTIFICATION" }>
): void {
  const combat = state.combat;
  const siege = combat?.siege;
  const unit = combat?.units[action.attackerId];
  if (!combat || !siege || !unit || unit.controllerId !== action.playerId) {
    throw new Error("There is no siege fortification to attack.");
  }

  if (combat.activeUnitId !== unit.id || unit.activatedThisRound || unit.attackedThisActivation) {
    throw new Error("Only the active unit may attack fortifications, before its attack.");
  }

  const demolish = getDemolishAbility(unit);

  if (action.target.kind === "arrow-tower") {
    if (!demolish?.canTargetArrowTower) {
      throw new Error("Only a unit with the demolish ability can level the Arrow Tower this way.");
    }
    if (!siege.arrowTowerUnitId) {
      throw new Error("The Arrow Tower is already gone.");
    }
    removeArrowTower(state, unit, `${unit.cardName} levels it`);
  } else {
    const intact =
      action.target.kind === "wall"
        ? siege.walls.includes(action.target.position)
        : siege.gatePosition === action.target.position;
    if (!intact) {
      throw new Error("That fortification is already destroyed.");
    }

    if (!demolish) {
      // "…destroyed by any adjacent ground or flying unit's attack, even by
      // your own defending units."
      if (unit.type === "ranged") {
        throw new Error("Ranged units cannot tear down walls (the Cyclops' ability is the exception).");
      }
      if (!isAdjacent(unit.position, action.target.position)) {
        throw new Error("The unit must be adjacent to the Wall or Gate.");
      }
    }

    destroyFortification(state, unit, action.target.kind, action.target.position);
  }

  // The demolition replaces the unit's attack for this activation.
  unit.attackedThisActivation = true;
  unit.attacksThisActivation = (unit.attacksThisActivation ?? 0) + 1;
  finishCombatIfNeeded(state);
  if (!state.combat?.outcome) {
    concludeAttackerActivation(state, unit);
  }
}

function rerollPendingChoice(
  state: GameState,
  action: Extract<GameAction, { type: "REROLL_PENDING_CHOICE" }>
): void {
  const choice = state.pendingChoice;
  const combat = state.combat;
  if (
    !choice ||
    choice.type !== "ATTACK_DIE_REROLL" ||
    !combat ||
    choice.id !== action.choiceId ||
    choice.playerId !== action.playerId
  ) {
    throw new Error("That pending choice cannot be rerolled.");
  }

  const currentRoll = choice.candidates.at(-1)?.roll ?? 0;
  // A plain reroll never spends a set-die source; the explicit set-die action
  // (useSetDie) spends nothing else.
  const source = choice.rerollSources.find(
    (candidate) =>
      rerollSourceAvailableFor(candidate, currentRoll) &&
      (action.useSetDie ? candidate.setDieFace !== undefined : candidate.setDieFace === undefined)
  );
  if (!source) {
    throw new Error(action.useSetDie ? "No set-die morale card remains for that choice." : "No rerolls remain for that choice.");
  }

  const latest = choice.candidates.at(-1);
  const candidate =
    source.setDieFace !== undefined && latest
      ? // "Set one of the dice to the +1 side": flip the die that raises the
        // outcome the most — no new roll. A "+1" now showing can still trip the
        // holder's own reroll-the-+1 curse below, exactly as a rolled one would.
        (() => {
          const face = source.setDieFace;
          let flipIndex = 0;
          let flippedOutcome = Number.NEGATIVE_INFINITY;
          latest.rolls.forEach((_, index) => {
            const flipped = latest.rolls.map((roll, at) => (at === index ? face : roll));
            const outcome = aggregateCandidateRoll(flipped, choice.rollMode);
            if (outcome > flippedOutcome) {
              flippedOutcome = outcome;
              flipIndex = index;
            }
          });
          const rolls = latest.rolls.map((roll, at) => (at === flipIndex ? face : roll));
          return { rolls, roll: aggregateCandidateRoll(rolls, choice.rollMode) } satisfies AttackRollCandidate;
        })()
      : rollAttackCandidate(combat, choice.rollMode);
  // A fresh face may be the first "+1" of this attack — the holder's own
  // Negative Morale reroll-the-"+1" curse (if still held) triggers on it.
  applyMoraleDiceCurses(state, action.playerId, candidate, choice.rollMode);
  choice.candidates.push(candidate);
  // Face-gated sources (Crusaders' 'every "0"') never deplete; everything
  // else spends one use.
  if (source.onlyOnRoll === undefined) {
    source.remaining -= 1;
  }
  source.used += 1;
  choice.remainingRerolls = countAvailableRerolls(choice.rerollSources, candidate.roll);

  // The morale token is discarded the moment its reroll is taken.
  if (source.morale && source.used === 1) {
    const player = state.players[action.playerId];
    if (player && player.morale > 0) {
      player.morale -= 1;
      appendEvent(state, { type: "MORALE_SPENT", playerId: action.playerId, benefit: "reroll" });
      appendEvent(state, {
        type: "MORALE_CHANGED",
        playerId: action.playerId,
        amount: -1,
        total: player.morale
      });
    }
  }

  if (source.moraleCardId && source.used === 1) {
    returnHeldMoraleCardToDeckBottom(state, action.playerId, source.moraleCardId, "used");
  }

  // Diplomat's Ring / Ambassador's Sash: playing the reroll discards the artifact.
  if (source.cardId && source.used === 1) {
    const player = state.players[action.playerId];
    const handIndex = player?.hand.indexOf(source.cardId) ?? -1;
    if (player && handIndex !== -1) {
      player.hand.splice(handIndex, 1);
      player.discard.push(source.cardId);
      appendEvent(state, {
        type: "CARD_PLAYED",
        playerId: action.playerId,
        cardId: source.cardId,
        timing: cardLibrary[source.cardId]?.timing ?? "instant",
        mode: "basic",
        optionLabel: "Reroll a die"
      });
    }
  }

  appendEvent(state, {
    type: "ATTACK_REROLLED",
    choiceId: choice.id,
    playerId: action.playerId,
    rolls: candidate.rolls,
    roll: candidate.roll,
    remainingRerolls: choice.remainingRerolls,
    sourceName: source.name
  });

  state.phase = "choice";
  state.priorityPlayerId = action.playerId;
}

function choosePendingRoll(
  state: GameState,
  action: Extract<GameAction, { type: "CHOOSE_PENDING_ROLL" }>,
  cards: CardLibrary
): void {
  const choice = state.pendingChoice;
  if (
    !choice ||
    choice.type !== "ATTACK_DIE_REROLL" ||
    choice.id !== action.choiceId ||
    choice.playerId !== action.playerId
  ) {
    throw new Error("That pending choice cannot be resolved.");
  }

  const candidate = choice.candidates[action.candidateIndex];
  if (!candidate) {
    throw new Error("That roll choice is not available.");
  }

  // Rulebook rerolls: "the new result replaces the old one" — once rerolled,
  // earlier rolls are gone for good.
  if (action.candidateIndex !== choice.candidates.length - 1) {
    throw new Error("A reroll replaces the previous result — only the latest roll counts.");
  }

  const stackItem = state.stack.find((item) => item.id === choice.stackItemId);
  if (!stackItem) {
    throw new Error("The pending attack is no longer available.");
  }

  const details = getAttackStackDetails(state, stackItem);
  if (!details) {
    throw new Error("The pending attack cannot be resolved.");
  }

  closePendingChoice(state, choice, action.candidateIndex);
  resolveAttackOrOfferDieCancel(state, stackItem, details, candidate, cards);
}

/**
 * Resolves an ABILITY_TARGET_CHOICE: Magog splash / Cerberi second head
 * (flat damage), the Liches' Death Cloud second attack, or a neutral-AI
 * target tie the player breaks.
 */
/**
 * WOG commander command ability — the data-driven cast resolution. Every
 * targeting rule was enforced when the "commander-cast" choice opened
 * (commanderCastCandidates); this applies the effect at the commander's
 * current Power and stamps the once-per-combat-round budget.
 */
function resolveCommanderCast(state: GameState, caster: CombatUnitState, target: CombatUnitState): void {
  const combat = state.combat;
  const cast = commanderCastOf(caster);
  if (!combat || !cast) {
    throw new Error("That commander cast is no longer possible.");
  }

  const power = commanderCastPower(state, caster);
  const tier = commanderCastTierIndex(power);
  const source = { type: "unit" as const, unitId: caster.id, controllerId: caster.controllerId };
  const targetRef = { type: "unit" as const, unitId: target.id };

  // Rune Mend's cost first — the heal never resolves unpaid.
  const runeCost = commanderCastRuneCost(state, caster);
  if (runeCost > 0 && !spendRunes(state, caster.controllerId, runeCost)) {
    throw new Error(`${cast.name} needs ${runeCost} Runes.`);
  }

  const effect = cast.effect;
  switch (effect.kind) {
    case "heal":
      healUnitDamage(state, source, targetRef, effect.healByPower[tier]);
      break;
    case "heal-cleanse": {
      healUnitDamage(state, source, targetRef, effect.healByPower[tier]);
      if (power >= effect.cleanseFromPower) {
        removeEffectsFromTarget(state, source, targetRef, "negative");
        for (const kind of ["weakness", "corrosion", "paralysis"] as const) {
          if (hasToken(target, kind)) {
            removeToken(state, target, kind, "dispelled");
          }
        }
      }
      break;
    }
    case "defense-buff":
      createActiveEffect(
        state,
        {
          name: `${cast.name} (${caster.cardName})`,
          scope: "unit",
          duration: { type: "current-combat-round" },
          polarity: "positive",
          removable: true,
          modifiers:
            effect.vs === "melee"
              ? [{ type: "DEFENSE_VS_ATTACKER_TYPE", attackerType: "ground-or-flying", amount: effect.amountByPower[tier] }]
              : [{ type: "DEFENSE_BONUS", amount: effect.amountByPower[tier] }]
        },
        source,
        caster.controllerId,
        targetRef
      );
      break;
    case "precision":
      createActiveEffect(
        state,
        {
          name: `${cast.name} (${caster.cardName})`,
          scope: "unit",
          duration: { type: "current-combat-round" },
          polarity: "positive",
          removable: true,
          modifiers: [
            { type: "ATTACK_BONUS", amount: effect.amountByPower[tier] },
            { type: "RANGED_IGNORE_ALL_PENALTIES" }
          ]
        },
        source,
        caster.controllerId,
        targetRef
      );
      break;
    case "attack-buff":
      createActiveEffect(
        state,
        {
          name: `${cast.name} (${caster.cardName})`,
          scope: "unit",
          duration: { type: "current-combat-round" },
          polarity: "positive",
          removable: true,
          modifiers: [{ type: "ATTACK_BONUS", amount: effect.amountByPower[tier] }]
        },
        source,
        caster.controllerId,
        targetRef
      );
      break;
    case "fire-shield": {
      const span = effect.durationByPower[tier];
      createActiveEffect(
        state,
        {
          name: `${cast.name} (${caster.cardName})`,
          scope: "unit",
          duration:
            span === "combat"
              ? { type: "combat" }
              : span === "two-rounds"
                ? { type: "combat-rounds", rounds: 2 }
                : { type: "current-combat-round" },
          polarity: "positive",
          removable: true,
          modifiers: [{ type: "FIRE_SHIELD", amount: effect.damageByPower[tier] }]
        },
        source,
        caster.controllerId,
        targetRef
      );
      break;
    }
    case "initiative-shift": {
      const amount = effect.amountByPower[tier];
      createActiveEffect(
        state,
        {
          name: `${cast.name} (${caster.cardName})`,
          scope: "unit",
          duration: { type: "current-combat-round" },
          polarity: amount >= 0 ? "positive" : "negative",
          removable: true,
          modifiers: [
            { type: "INITIATIVE_BONUS", amount },
            { type: "ATTACK_BONUS_VS_INITIATIVE", comparison: effect.attackVs, amount: effect.attackAmount }
          ]
        },
        source,
        caster.controllerId,
        targetRef
      );
      break;
    }
    case "unlimited-retaliation":
      createActiveEffect(
        state,
        {
          name: `${cast.name} (${caster.cardName})`,
          scope: "unit",
          duration: { type: "current-combat-round" },
          polarity: "positive",
          removable: true,
          modifiers: [{ type: "UNLIMITED_RETALIATION" }]
        },
        source,
        caster.controllerId,
        targetRef
      );
      break;
  }

  caster.commanderCastRound = combat.round;
  appendEvent(state, {
    type: "COMMANDER_CAST_USED",
    playerId: caster.controllerId,
    commanderSlug: caster.commanderSlug ?? "",
    castName: cast.name,
    power,
    targetUnitId: target.id,
    message: `${caster.cardName} casts ${cast.name} (Power ${power}) on ${target.cardName}.`
  });
}

function chooseAbilityTarget(
  state: GameState,
  action: Extract<GameAction, { type: "CHOOSE_ABILITY_TARGET" }>,
  cards: CardLibrary
): void {
  const choice = state.pendingChoice;
  const combat = state.combat;
  if (!choice || choice.type !== "ABILITY_TARGET_CHOICE" || choice.id !== action.choiceId) {
    throw new Error("That ability target choice is not available.");
  }

  if (choice.playerId !== action.playerId) {
    throw new Error("Another player resolves this ability target.");
  }

  if (!combat) {
    throw new Error("Combat is not active.");
  }

  const isSkip = choice.optional && action.targetUnitId === "skip";
  const selectedIndex = isSkip ? -1 : choice.candidateUnitIds.indexOf(action.targetUnitId);
  if (selectedIndex === -1 && !isSkip) {
    throw new Error("That unit is not a legal target for the ability.");
  }

  state.pendingChoice = null;
  state.phase = "combat";
  state.priorityPlayerId = null;

  appendEvent(state, {
    type: "PENDING_CHOICE_RESOLVED",
    choiceId: choice.id,
    playerId: action.playerId,
    selectedIndex
  });

  if (choice.kind === "war-machine") {
    resolveWarMachineTarget(state, action.playerId, action.targetUnitId, choice.amount ?? 1);
    finishCombatIfNeeded(state);
    return;
  }

  // WOG commander cast: resolve the command ability on the chosen unit (a
  // Cancel costs nothing — the once-per-round budget is only stamped on a
  // resolved cast).
  if (choice.kind === "commander-cast") {
    if (!isSkip) {
      const caster = choice.sourceUnitId ? combat.units[choice.sourceUnitId] : undefined;
      const target = combat.units[action.targetUnitId];
      if (!caster || !target || !isUnitAlive(caster) || !isUnitAlive(target)) {
        throw new Error("That commander cast is no longer possible.");
      }
      resolveCommanderCast(state, caster, target);
      finishCombatIfNeeded(state);
    }
    return;
  }

  // Fireball's second space: deal the spell damage, or skip (empty space).
  if (choice.kind === "spell-splash") {
    if (!isSkip) {
      const target = combat.units[action.targetUnitId];
      if (target && isUnitAlive(target)) {
        const dealt = reducedSpellDamage(state, target, choice.amount ?? 1);
        target.damage += dealt;
        noteUnitDamagedForTokens(state, target, dealt);
        appendEvent(state, {
          type: "DAMAGE_ASSIGNED",
          source: { type: "system" },
          target: { type: "unit", unitId: target.id },
          amount: dealt,
          damageKind: "spell"
        });
        markUnitRemovedIfNeeded(state, target);
      }
    }
    finishCombatIfNeeded(state);
    return;
  }

  // Ballistics' expert bombardment: the chosen adjacent enemy takes the same
  // flat "effect" damage as the primary (war-machine damage — no spell-damage
  // reduction). A skip leaves the splash empty.
  if (choice.kind === "ballistics-splash") {
    if (!isSkip) {
      const target = combat.units[action.targetUnitId];
      if (target && isUnitAlive(target)) {
        const dealt = choice.amount ?? 1;
        target.damage += dealt;
        noteUnitDamagedForTokens(state, target, dealt);
        appendEvent(state, {
          type: "DAMAGE_ASSIGNED",
          source: { type: "card", cardId: choice.abilityId ?? "", controllerId: action.playerId },
          target: { type: "unit", unitId: target.id },
          amount: dealt,
          damageKind: "effect"
        });
        markUnitRemovedIfNeeded(state, target);
      }
    }
    finishCombatIfNeeded(state);
    return;
  }

  // Frost Ring / Meteor Shower VI: the picked unit takes the blast's damage,
  // then the choice re-opens for the next pick (using the same card, amount and
  // the remaining candidates) until every pick is spent.
  if (choice.kind === "area-pick") {
    const blastCard = cards[choice.sourceCardId ?? choice.abilityId ?? ""];
    const amount = choice.amount ?? 1;
    const picked = isSkip ? undefined : combat.units[action.targetUnitId];
    if (picked && isUnitAlive(picked)) {
      dealAreaCardDamage(state, choice.playerId, blastCard, picked, amount);
    }
    if (finishCombatIfNeeded(state)) {
      return;
    }
    const rest = choice.candidateUnitIds.filter(
      (id) => id !== action.targetUnitId && isUnitAlive(combat.units[id])
    );
    applyAdjacentPicks(state, choice.playerId, blastCard, rest, (choice.picksRemaining ?? 1) - 1, amount);
    finishCombatIfNeeded(state);
    return;
  }

  // Magic Mirror: the new target is chosen.
  if (choice.kind === "spell-redirect") {
    const top = state.stack.at(-1);
    const chosen = combat.units[action.targetUnitId];

    // (a) Reflecting an instant combat debuff off your attacked unit: the malus
    // was already lifted from your unit when the card was played; now it lands
    // on the chosen unit, then the attack's window resumes. It stays an INSTANT —
    // a one-shot stat delta the attack maths read for this attack and (carried
    // through attackSequence) its retaliation, then it vanishes with the stack.
    // It is NOT an ongoing effect or a token, so nothing can Dispel or ignore it;
    // only spell-immunity stops it, already enforced by the redirect's target
    // filter (you cannot bounce it onto a spell-immune unit).
    if (choice.redirectInstant && top && chosen && isUnitAlive(chosen)) {
      const { stat, amount } = choice.redirectInstant;
      (top.modifiers.redirectedInstants ??= []).push({ unitId: chosen.id, stat, amount });
    }
    if (choice.redirectInstant) {
      appendEvent(state, {
        type: "SPELL_REDIRECTED",
        playerId: action.playerId,
        spellCardId: choice.redirectInstant.sourceCardId,
        byCardId: choice.abilityId ?? "",
        fromTarget: { type: "unit", unitId: choice.anchorUnitId ?? action.targetUnitId },
        toTarget: { type: "unit", unitId: action.targetUnitId }
      });
      resumeAttackWindowAfterRedirect(state, top, cards);
      return;
    }

    // (b) Re-pointing a pending cast (which waited on the stack while this choice
    // was open) and resolving it against the chosen target. A space-centred blast
    // (Inferno) recenters on the chosen unit's space; everything else re-points
    // straight at the unit. A Fireball-style splash recomputes around the new
    // primary on resolution.
    if (top?.action.type === "CAST_SPELL") {
      const fromTarget = top.action.target;
      top.action.target =
        fromTarget.type === "space" && chosen
          ? { type: "space", position: chosen.position }
          : { type: "unit", unitId: action.targetUnitId };
      appendEvent(state, {
        type: "SPELL_REDIRECTED",
        playerId: action.playerId,
        spellCardId: top.action.cardId,
        byCardId: choice.abilityId ?? "",
        fromTarget,
        toTarget: top.action.target
      });
      resolveTopStack(state, cards);
    }
    return;
  }

  // Solmyr's Chain Lightning: the chosen closest unit takes the current bolt,
  // then the chain continues with the remaining bolts (or finishes).
  if (choice.kind === "chain-lightning") {
    const chainCard = cards[choice.abilityId ?? ""];
    const remaining = choice.chainRemainingDamages ?? [];
    dealChainLightningDamage(state, action.playerId, chainCard, action.targetUnitId, remaining[0] ?? 0);
    if (finishCombatIfNeeded(state)) {
      return;
    }
    const reachable = (choice.chainReachableUnitIds ?? []).filter((id) => id !== action.targetUnitId);
    if (choice.anchorUnitId) {
      advanceChainLightning(state, action.playerId, chainCard, choice.anchorUnitId, reachable, remaining.slice(1));
    }
    return;
  }

  // Sacrifice: move the heal target's damage onto the chosen sacrifice unit —
  // up to the sacrifice's remaining HP ("as much as is needed for it to
  // perish"). The heal target loses that much damage; the sacrifice takes it
  // and perishes (a Pack flips to Few) when it reaches its remaining HP.
  if (choice.kind === "sacrifice-transfer") {
    const healTarget = choice.sourceUnitId ? combat.units[choice.sourceUnitId] : undefined;
    const sacrifice = combat.units[action.targetUnitId];
    if (healTarget && sacrifice && isUnitAlive(healTarget) && isUnitAlive(sacrifice)) {
      const source = { type: "card" as const, cardId: choice.abilityId ?? "", controllerId: action.playerId };
      const transfer = Math.min(healTarget.damage, sacrifice.maxHealth - sacrifice.damage);
      if (transfer > 0) {
        healUnitDamage(state, source, { type: "unit", unitId: healTarget.id }, transfer);
        sacrifice.damage += transfer;
        noteUnitDamagedForTokens(state, sacrifice, transfer);
        appendEvent(state, {
          type: "DAMAGE_ASSIGNED",
          source,
          target: { type: "unit", unitId: sacrifice.id },
          amount: transfer,
          damageKind: "effect"
        });
        markUnitRemovedIfNeeded(state, sacrifice);
      }
    }
    finishCombatIfNeeded(state);
    return;
  }

  // Ogres' Attack ("Bloodlust") token / Sorceresses' Weakness token: drop the
  // chosen combat token on the picked unit, then the placing unit's activation
  // ends (this "other action" replaces its attack). Cancelling (the optional
  // skip) places nothing and leaves the unit free to act — so the activation is
  // only consumed when a real target is chosen.
  if (choice.kind === "place-token") {
    const placer = choice.sourceUnitId ? combat.units[choice.sourceUnitId] : undefined;
    if (isSkip || !placer || !choice.tokenKind) {
      return;
    }
    const target = combat.units[action.targetUnitId];
    if (target && isUnitAlive(target)) {
      placeCombatToken(state, target, choice.tokenKind, choice.amount ?? 0, choice.abilityName, choice.tokenRounds);
      appendEvent(state, {
        type: "UNIT_ABILITY_TRIGGERED",
        unitId: placer.id,
        abilityId: choice.abilityId ?? "",
        targetUnitId: target.id,
        message: `${placer.cardName} places a ${choice.abilityName} on ${target.cardName}.`
      });
      placer.activatedThisRound = true;
      advanceActiveUnit(state);
    }
    return;
  }

  const source = choice.sourceUnitId ? combat.units[choice.sourceUnitId] : undefined;
  if (!source) {
    return;
  }

  // Jotunn Warlord (Bulwark, house rule): the chosen FRIENDLY unit (never the
  // Warlord itself) is teleported to an empty space — picking a unit opens the
  // very same empty-space picker the Teleport Spell uses (openTeleportChoice),
  // while "Don't teleport" (skip) just ends the ability. Either way the Warlord
  // stays active and acts normally, so the ability is marked done now (before the
  // follow-up picker opens) and never re-prompts this activation. The own-side,
  // not-self check is a resolution backstop: only another unit on the Warlord's
  // own side may be relocated — an enemy (or the Warlord itself) can never be
  // teleported, even if a forged action names one.
  if (choice.kind === "jotunn-teleport") {
    source.activationAbilityDone = true;
    if (isSkip) {
      return;
    }
    const target = combat.units[action.targetUnitId];
    if (target && isUnitAlive(target) && target.controllerId === source.controllerId && target.id !== source.id) {
      const opened = openTeleportChoice(state, source.controllerId, target, choice.abilityId ?? undefined);
      if (opened) {
        state.phase = "choice";
        state.priorityPlayerId = source.controllerId;
      }
    }
    return;
  }

  // Enchanters' "[activation]": heal the chosen friendly unit, or (skip) take
  // the +1 Attack. The unit stays active and acts normally afterwards.
  if (choice.kind === "enchanter-activation") {
    const ability = getEnchanterActivationAbility(source);
    if (ability) {
      const target = isSkip ? undefined : combat.units[action.targetUnitId];
      if (target && isUnitAlive(target)) {
        applyEnchanterHeal(state, source, target, ability);
      } else {
        applyEnchanterBuffSelf(state, source, ability);
      }
    }
    source.activationAbilityDone = true;
    return;
  }

  // Faerie Dragons' "[activation]": deal the flat Ice Bolt damage to the chosen
  // unit, then the unit acts normally (or the combat ends on a lethal hit).
  if (choice.kind === "faerie-damage") {
    const ability = getActivationDamageSpellAbility(source);
    const target = combat.units[action.targetUnitId];
    if (ability && target && isUnitAlive(target)) {
      applyActivationDamageSpell(state, source, target, ability);
    }
    source.activationAbilityDone = true;
    return;
  }

  // Factory Couatls' invulnerability: the decision is made for this activation
  // either way (activationAbilityDone). On "activate" the ward goes up (once per
  // combat); the Few version then ends the turn, the Pack version is free so the
  // unit still moves and attacks.
  if (choice.kind === "couatl-invulnerability") {
    source.activationAbilityDone = true;
    const ward = getInvulnerabilityActivation(source);
    if (!isSkip && ward && !source.usedInvulnerabilityThisCombat) {
      source.invulnerableUntilActivation = true;
      source.usedInvulnerabilityThisCombat = true;
      appendEvent(state, {
        type: "UNIT_ABILITY_TRIGGERED",
        unitId: source.id,
        abilityId: ward.abilityId,
        targetUnitId: source.id,
        message: `${source.cardName} coils into invulnerability — it ignores all damage and spell effects until its next activation.`
      });
      if (ward.endsActivation) {
        source.activatedThisRound = true;
        advanceActiveUnit(state);
      }
    }
    return;
  }

  // Factory Automaton (Few): bank one faction cube (free — the unit still acts).
  if (choice.kind === "automaton-cube") {
    source.activationAbilityDone = true;
    const cubeAbility = getPlaceFactionCubeActivation(source);
    if (!isSkip && cubeAbility && (source.factionCubes ?? 0) < cubeAbility.maxCubes) {
      source.factionCubes = (source.factionCubes ?? 0) + 1;
      appendEvent(state, {
        type: "UNIT_ABILITY_TRIGGERED",
        unitId: source.id,
        abilityId: cubeAbility.abilityId,
        targetUnitId: source.id,
        message: `${source.cardName} banks a faction cube (${source.factionCubes}/${cubeAbility.maxCubes}) — its Detonate will hit that much harder.`
      });
    }
    return;
  }

  // Factory Dreadnoughts' splash allocation: the k-th pick suffers the next
  // (leftmost) printed damage value; then the choice re-opens for the next pick
  // until the values or adjacent candidates run out. It "replaces attacking", so
  // once at least one hit lands the activation ends. A cancel BEFORE any hit
  // leaves the unit free to act (like the token-place cancel).
  if (choice.kind === "dreadnought-splash") {
    const remaining = choice.chainRemainingDamages ?? [];
    const ability = getSplashAllocationAttack(source);
    const fullCount = ability?.damageValues.length ?? remaining.length;
    const committed = remaining.length < fullCount; // at least one hit already landed

    if (isSkip) {
      if (committed) {
        source.activatedThisRound = true;
        advanceActiveUnit(state);
      }
      // else: cancelled before any damage — the Dreadnought is free to act.
      return;
    }

    const target = combat.units[action.targetUnitId];
    if (target && isUnitAlive(target) && remaining.length > 0) {
      applyFlatAbilityDamage(state, source, target.id, choice.abilityId ?? "", choice.abilityName, remaining[0]);
    }
    if (finishCombatIfNeeded(state)) {
      return;
    }

    const restValues = remaining.slice(1);
    const restCandidates = choice.candidateUnitIds.filter(
      (id) => id !== action.targetUnitId && isUnitAlive(combat.units[id])
    );
    if (restValues.length > 0 && restCandidates.length > 0) {
      openDreadnoughtSplashChoice(state, source, choice.abilityId ?? "", choice.abilityName, restCandidates, restValues);
      return;
    }
    // All values spent (or no more adjacent units): the splash ends the turn.
    source.activatedThisRound = true;
    advanceActiveUnit(state);
    return;
  }

  if (choice.kind === "flat-damage") {
    applyFlatAbilityDamage(
      state,
      source,
      action.targetUnitId,
      choice.abilityId ?? "",
      choice.abilityName,
      choice.amount ?? 1
    );
    if (finishCombatIfNeeded(state)) {
      return;
    }
    // Core units carry at most one flat-damage follow-up, so the sequence
    // continues straight to the parked retaliation.
    resumeAttackSequence(state, cards);
    return;
  }

  if (choice.kind === "second-attack") {
    declareAbilityAttack(
      state,
      source,
      action.targetUnitId,
      {
        abilityId: choice.abilityId ?? "",
        abilityName: choice.abilityName,
        baseAttack: choice.baseAttack ?? 2
      },
      cards
    );
    return;
  }

  // Neutral target tie: the chosen unit becomes the neutral's target.
  executeNeutralActivation(state, source, cards, action.targetUnitId);
}

/**
 * Auto-resolves ability target choices owned by the neutral seat (neutral
 * Liches, Magogs, Cerberi): player units are preferred by the AI target
 * priority; only when none qualifies does the mandatory hit fall on a
 * friendly neutral (or the Liches themselves).
 */
/**
 * A neutral attacker (Minotaurs, Champions) auto-resolves its own attack-die
 * reroll: it rerolls every "-1" its face-gated ability allows — never spending
 * a depleting source, which neutrals never have — then keeps the final roll and
 * resumes the attack. The neutral player makes no choices, so the adventure
 * pump drives this the moment such a choice opens.
 */
function autoResolveNeutralReroll(state: GameState, cards: CardLibrary): void {
  const choice = state.pendingChoice;
  const combat = state.combat;
  if (!choice || choice.type !== "ATTACK_DIE_REROLL" || !combat) {
    return;
  }

  let safety = 12;
  while (safety > 0) {
    safety -= 1;
    const currentRoll = choice.candidates.at(-1)?.roll ?? 0;
    const source = choice.rerollSources.find((candidate) => rerollSourceAvailableFor(candidate, currentRoll));
    // Only face-gated ability rerolls (the Minotaur/Champion "-1") ever apply to
    // a neutral; stop once the current face can no longer be rerolled.
    if (!source || source.onlyOnRoll === undefined) {
      break;
    }
    const candidate = rollAttackCandidate(combat, choice.rollMode);
    choice.candidates.push(candidate);
    choice.remainingRerolls = countAvailableRerolls(choice.rerollSources, candidate.roll);
    appendEvent(state, {
      type: "ATTACK_REROLLED",
      choiceId: choice.id,
      playerId: choice.playerId,
      rolls: candidate.rolls,
      roll: candidate.roll,
      remainingRerolls: choice.remainingRerolls,
      sourceName: source.name
    });
  }

  const stackItem = state.stack.find((item) => item.id === choice.stackItemId);
  const details = stackItem ? getAttackStackDetails(state, stackItem) : null;
  const candidate = choice.candidates.at(-1);
  if (!stackItem || !details || !candidate) {
    // The pending attack vanished (combat ended mid-pause): drop the choice.
    state.pendingChoice = null;
    state.phase = "combat";
    state.priorityPlayerId = null;
    return;
  }
  closePendingChoice(state, choice, choice.candidates.length - 1);
  resolveAttackOrOfferDieCancel(state, stackItem, details, candidate, cards);
}

function autoResolveNeutralAbilityChoice(state: GameState, cards: CardLibrary): boolean {
  const choice = state.pendingChoice;
  const combat = state.combat;
  if (
    !choice ||
    choice.type !== "ABILITY_TARGET_CHOICE" ||
    choice.playerId !== NEUTRAL_PLAYER_ID ||
    !combat ||
    !choice.sourceUnitId
  ) {
    return false;
  }

  const source = combat.units[choice.sourceUnitId];
  const candidates = choice.candidateUnitIds
    .map((unitId) => combat.units[unitId])
    .filter((unit): unit is CombatUnitState => Boolean(unit) && isUnitAlive(unit));
  if (!source || candidates.length === 0) {
    state.pendingChoice = null;
    state.phase = "combat";
    return true;
  }

  const enemies = candidates.filter((unit) => unit.controllerId !== source.controllerId);
  const pool = enemies.length > 0 ? enemies : candidates;
  const sorted = sortNeutralTargetCandidates(combat, source, pool);
  const target =
    enemies.length > 0
      ? sorted[0]
      : // Forced friendly hit: spare the strongest — hit the lowest tier,
        // farthest, lowest position.
        [...sorted].reverse()[0];

  chooseAbilityTarget(
    state,
    {
      type: "CHOOSE_ABILITY_TARGET",
      playerId: NEUTRAL_PLAYER_ID,
      choiceId: choice.id,
      targetUnitId: target.id
    },
    cards
  );
  return true;
}

/**
 * The AI side has no hand, so the only combat reaction a NEUTRAL unit is ever
 * offered is a guaranteed innate one — today, the War Zealot's always-on Magic
 * Mirror. When the reaction window hands the neutral priority, auto-USE that
 * mirror (the redirect target is then picked by autoResolveNeutralAbilityChoice);
 * if for any reason no innate reaction is offered, auto-pass so the window closes
 * instead of stalling the pump. Returns true when it acted on the neutral's turn.
 */
function autoResolveNeutralReaction(state: GameState, cards: CardLibrary): boolean {
  const window = state.reactionWindow;
  if (!window || window.priorityPlayerId !== NEUTRAL_PLAYER_ID) {
    return false;
  }
  const mirror = (window.legalReactions[NEUTRAL_PLAYER_ID] ?? []).find(
    (entry) => entry.action.type === "USE_UNIT_MAGIC_MIRROR"
  );
  if (mirror && mirror.action.type === "USE_UNIT_MAGIC_MIRROR") {
    applyUnitMagicMirror(state, mirror.action, cards);
  } else {
    passReaction(state, { type: "PASS_REACTION", playerId: NEUTRAL_PLAYER_ID }, cards);
  }
  return true;
}

function declareAttack(
  state: GameState,
  action: Extract<GameAction, { type: "ATTACK_UNIT" | "MOVE_AND_ATTACK_UNIT" }>,
  cards: CardLibrary,
  isRetaliation = false,
  /** Marksmen/Elves' ranged double-shot re-enters here after the first attack;
   *  it is an internal follow-up, not a fresh player attack, so it bypasses the
   *  "already attacked" / faction-cube gate below. */
  isInternalFollowUp = false
): void {
  const combat = state.combat;
  if (!combat) {
    throw new Error("Combat is not active.");
  }

  const abilityAttack = action.type === "ATTACK_UNIT" ? action.abilityAttack : undefined;
  const attacker = combat.units[action.attackerId];
  const defender = combat.units[action.defenderId];
  if (!attacker || !defender) {
    throw new Error("That unit cannot attack the selected target.");
  }

  // Printed-ability follow-ups (Death Cloud) may — and sometimes must — hit
  // friendly units or the attacker itself, so the regular target rules do
  // not apply to them.
  if (abilityAttack) {
    if (!isUnitAlive(attacker) || !isUnitAlive(defender)) {
      throw new Error("That unit cannot attack the selected target.");
    }
  } else if (!canUnitAttack(combat, attacker, defender, state.activeEffects)) {
    throw new Error("That unit cannot attack the selected target.");
  }

  // Factory Sandworms (Pack): a repeat player attack (not a Retaliation or a
  // printed follow-up) is the "[activation] remove a faction cube to attack
  // again". It costs a cube; a Sandworm that already attacked with no cube left
  // may not attack again. (Other units never reach here twice — after their
  // attack the activation concludes and legal-actions stops offering it.)
  if (!isRetaliation && !abilityAttack && !isInternalFollowUp && attacker.attackedThisActivation) {
    const cubeAttack = getSpendCubeAttackAgain(attacker);
    if (!cubeAttack || (attacker.factionCubes ?? 0) < 1) {
      throw new Error("That unit cannot attack right now.");
    }
    attacker.factionCubes = (attacker.factionCubes ?? 0) - 1;
    appendEvent(state, {
      type: "UNIT_ABILITY_TRIGGERED",
      unitId: attacker.id,
      abilityId: cubeAttack.abilityId,
      message: `${attacker.cardName} spends a faction cube to attack again (${attacker.factionCubes} left).`
    });
  }

  const stackItem = makeStackItem(state, action);
  state.stack.push(stackItem);

  const attackKind = getAttackKind(attacker, defender);
  // A Retaliation Attack does not get the "[unit_attack] Ignore the combat
  // penalties" waiver (Sharpshooters / Magi / Halflings); the unit's own attacks
  // (including printed follow-ups, isRetaliation === false) still do.
  const rollMode = getAttackRollMode(attacker, defender, state, isRetaliation);
  const attackDeclared = appendEvent(state, {
    type: "UNIT_ATTACK_DECLARED",
    playerId: action.playerId,
    attackerId: attacker.id,
    defenderId: defender.id,
    isRetaliation,
    attackKind,
    rollMode,
    ...(abilityAttack ? { abilityAttack } : {})
  });
  stackItem.triggerEventIds.push(attackDeclared.id);

  openDeclaredAttackWindow(state, stackItem, attackDeclared, cards);
}

function attackUnit(
  state: GameState,
  action: Extract<GameAction, { type: "ATTACK_UNIT" }>,
  cards: CardLibrary
): void {
  declareAttack(state, action, cards);
}

function moveAndAttackUnit(
  state: GameState,
  action: Extract<GameAction, { type: "MOVE_AND_ATTACK_UNIT" }>,
  cards: CardLibrary
): void {
  const combat = state.combat;
  const attacker = combat?.units[action.attackerId];
  const defender = combat?.units[action.defenderId];
  if (
    !combat ||
    !attacker ||
    !defender ||
    attacker.controllerId !== action.playerId ||
    !canUnitMoveAndAttack(combat, attacker, action.destination, defender, state)
  ) {
    throw new Error("That unit cannot move and attack the selected target.");
  }

  const from = attacker.position;
  const destination = action.destination;
  attacker.movedThisActivation = true;

  // The approach is walked through any battlefield tokens, just like a plain
  // move: a Fire Wall / Land Mine bites the attacker on the way in, and a
  // Quicksand can swallow it short of the target (no token on the board → the
  // direct relocation below is unchanged).
  let finalPosition = destination;
  let haltedByQuicksand = false;
  if ((combat.battlefieldTokens ?? []).length > 0) {
    const enteredSpaces =
      attacker.type === "flying"
        ? [destination]
        : (planMovePath(
            from,
            destination,
            getUnitMoveRange(attacker, state),
            getBlockedSpaces(combat, attacker),
            getKnownHazardSpaces(combat, attacker)
          ) ?? [destination]);
    const walked = walkMoveThroughTokens(state, attacker, enteredSpaces);
    finalPosition = walked.finalPosition;
    haltedByQuicksand = walked.haltedByQuicksand;
  }

  attacker.position = finalPosition;

  appendEvent(state, {
    type: "UNIT_MOVED",
    playerId: action.playerId,
    unitId: attacker.id,
    from,
    to: finalPosition
  });

  // A Fire Wall / Land Mine that struck the attacker down, or a Quicksand that
  // swallowed it before it reached the target, ends the activation with no
  // attack — the unit never arrives adjacent to its quarry.
  if (!isUnitAlive(attacker) || haltedByQuicksand || finalPosition !== destination) {
    if (isUnitAlive(attacker)) {
      attacker.activatedThisRound = true;
    }
    if (combat.activeUnitId === attacker.id) {
      appendExpiredEffectEvents(state, expireEffectsForActivationEnd(state, attacker.id), "activation-ended");
      advanceActiveUnit(state);
    }
    state.phase = "combat";
    state.priorityPlayerId = null;
    finishCombatIfNeeded(state);
    return;
  }

  declareAttack(state, action, cards);
}

/** The spell a battlefield token's damage is attributed to (for damage events / FX). */
const BATTLEFIELD_TOKEN_CARD_ID: Record<BattlefieldTokenKind, CardId> = {
  force_field: "spell.force_field",
  fire_wall: "spell.fire_wall",
  quicksand: "spell.quicksand",
  land_mine: "spell.land_mine"
};

/** Battlefield tokens occupying a given board space. */
function tokensAtPosition(combat: CombatState, position: number): BattlefieldTokenState[] {
  return (combat.battlefieldTokens ?? []).filter((token) => token.position === position);
}

/**
 * Spaces the moving unit's side can SEE are dangerous: every face-up Fire Wall,
 * plus the mover's OWN armed traps (a player "may look at their Tokens at any
 * time"). A hazard-aware path lets a unit dodge these when an equally short
 * route exists; the opponent's blind traps are unknown, so they are not avoided.
 */
function getKnownHazardSpaces(combat: CombatState, unit: CombatUnitState): Set<number> {
  const hazards = new Set<number>();
  for (const token of combat.battlefieldTokens ?? []) {
    if (token.kind === "fire_wall") {
      hazards.add(token.position);
    } else if (
      (token.kind === "quicksand" || token.kind === "land_mine") &&
      token.armed === true &&
      token.controllerId === unit.controllerId
    ) {
      hazards.add(token.position);
    }
  }
  return hazards;
}

/** Takes a sprung face-down trap (Quicksand / Land Mine) off the board. */
function removeBattlefieldToken(combat: CombatState, tokenId: string): void {
  combat.battlefieldTokens = (combat.battlefieldTokens ?? []).filter((token) => token.id !== tokenId);
}

/**
 * Dispel / "Remove all ongoing effects from a space": lifts every battlefield
 * token (Force Field, Fire Wall, Quicksand, Land Mine) off `position` and
 * announces each, so the board clears and the log notes it. Returns the count.
 */
function clearBattlefieldTokensAt(state: GameState, combat: CombatState, position: number): number {
  const here = (combat.battlefieldTokens ?? []).filter((token) => token.position === position);
  if (here.length === 0) {
    return 0;
  }
  combat.battlefieldTokens = (combat.battlefieldTokens ?? []).filter((token) => token.position !== position);
  for (const token of here) {
    appendEvent(state, {
      type: "BATTLEFIELD_TOKEN_EXPIRED",
      tokenId: token.id,
      kind: token.kind,
      position: token.position
    });
  }
  return here.length;
}

/** Deals a Fire Wall / Land Mine token's flat damage to a unit moving over it. */
function dealBattlefieldTokenDamage(
  state: GameState,
  token: BattlefieldTokenState,
  unit: CombatUnitState,
  amount: number
): void {
  if (amount <= 0) {
    return;
  }
  // A Factory Couatl with its invulnerability up ignores battlefield-token
  // damage (Fire Wall / Land Mine) like any other damage.
  if (isUnitDamageImmune(unit)) {
    return;
  }
  appendEvent(state, {
    type: "BATTLEFIELD_TOKEN_TRIGGERED",
    tokenId: token.id,
    kind: token.kind,
    position: token.position,
    unitId: unit.id,
    outcome: "damage",
    amount
  });
  unit.damage += amount;
  noteUnitDamagedForTokens(state, unit, amount);
  appendEvent(state, {
    type: "DAMAGE_ASSIGNED",
    source: { type: "card", cardId: BATTLEFIELD_TOKEN_CARD_ID[token.kind], controllerId: token.controllerId },
    target: { type: "unit", unitId: unit.id },
    amount,
    // Flat board-effect damage: the rulebook applies no Spell-damage reduction
    // or immunity to a token strike, so it is "effect", never "spell", damage.
    damageKind: "effect"
  });
  markUnitRemovedIfNeeded(state, unit);
}

/**
 * A unit that BEGINS its activation standing on a Fire Wall is burned by it: the
 * wall "takes effect at that unit's turn" (a Hell Steed drops its Fire Wall on
 * the target's occupied space, and the target only feels it when its own turn
 * comes round). Standing on a Fire Wall burns ANY unit, flyers included — exactly
 * like stopping on one in walkMoveThroughTokens; only a flyer PASSING OVER a wall
 * (mid-move) is spared. Returns true when the burn removed the unit (its
 * activation is then skipped by the caller).
 */
function applyFireWallAtActivation(state: GameState, unit: CombatUnitState): boolean {
  const combat = state.combat;
  if (!combat || !isUnitAlive(unit)) {
    return false;
  }
  for (const token of tokensAtPosition(combat, unit.position)) {
    if (token.kind !== "fire_wall") {
      continue;
    }
    dealBattlefieldTokenDamage(state, token, unit, token.damage ?? 0);
    if (!isUnitAlive(unit)) {
      return true;
    }
  }
  return false;
}

/**
 * Walks a unit's move through the spaces it ENTERS (a flyer's caller passes only
 * its landing space, since flyers never enter the spaces they pass over),
 * springing each battlefield token. Returns where the unit comes to rest and
 * whether a Quicksand halted it (which also ends its activation). Faithful to
 * the rulebook: a Land Mine and a Quicksand are face-down traps that spring ONCE
 * and are then taken off the board (so the opponent never learns which of the
 * remaining face-down tokens are real) — an armed Land Mine deals its damage and
 * the unit moves on, an armed Quicksand ends movement at once, a decoy of either
 * does nothing. A Fire Wall is a lasting Effect Obstacle: it is NOT consumed —
 * it burns any unit stopping on it and any ground/ranged unit passing through,
 * for the whole Combat. Stops early the moment a token kills the mover.
 */
function walkMoveThroughTokens(
  state: GameState,
  unit: CombatUnitState,
  enteredSpaces: number[]
): { finalPosition: number; haltedByQuicksand: boolean } {
  const combat = state.combat;
  if (!combat || enteredSpaces.length === 0) {
    return { finalPosition: unit.position, haltedByQuicksand: false };
  }

  let finalPosition = unit.position;
  for (let index = 0; index < enteredSpaces.length; index += 1) {
    const position = enteredSpaces[index];
    finalPosition = position;
    const isLastStep = index === enteredSpaces.length - 1;
    const tokens = tokensAtPosition(combat, position);

    // Fire Wall (Effect Obstacle): stopping on it burns any unit; passing
    // through burns only a ground or ranged unit (a flyer over it is unharmed,
    // and a flyer is never mid-path here anyway).
    for (const token of tokens) {
      if (token.kind !== "fire_wall") {
        continue;
      }
      const passingThrough = !isLastStep;
      if (!passingThrough || unit.type !== "flying") {
        dealBattlefieldTokenDamage(state, token, unit, token.damage ?? 0);
        if (!isUnitAlive(unit)) {
          return { finalPosition, haltedByQuicksand: false };
        }
      }
    }

    // Land Mine: a sprung trap is removed at once. An armed one deals its damage
    // (then the unit continues if it survives); a decoy does nothing. Either way
    // the token is taken off the board, so its armed/decoy identity never leaks.
    for (const token of tokens) {
      if (token.kind !== "land_mine") {
        continue;
      }
      if (token.armed === true) {
        dealBattlefieldTokenDamage(state, token, unit, token.damage ?? 0);
        removeBattlefieldToken(combat, token.id);
        if (!isUnitAlive(unit)) {
          return { finalPosition, haltedByQuicksand: false };
        }
      } else {
        appendEvent(state, {
          type: "BATTLEFIELD_TOKEN_TRIGGERED",
          tokenId: token.id,
          kind: "land_mine",
          position,
          unitId: unit.id,
          outcome: "decoy"
        });
        removeBattlefieldToken(combat, token.id);
      }
    }

    // Quicksand: a sprung trap is removed at once. An armed one ends movement AND
    // activation here; a decoy does nothing. Both are taken off the board.
    let armedQuicksand: BattlefieldTokenState | undefined;
    for (const token of tokens) {
      if (token.kind !== "quicksand") {
        continue;
      }
      if (token.armed === true && !armedQuicksand) {
        armedQuicksand = token;
        appendEvent(state, {
          type: "BATTLEFIELD_TOKEN_TRIGGERED",
          tokenId: token.id,
          kind: "quicksand",
          position,
          unitId: unit.id,
          outcome: "stop"
        });
      } else if (token.armed !== true) {
        appendEvent(state, {
          type: "BATTLEFIELD_TOKEN_TRIGGERED",
          tokenId: token.id,
          kind: "quicksand",
          position,
          unitId: unit.id,
          outcome: "decoy"
        });
      }
      removeBattlefieldToken(combat, token.id);
    }
    if (armedQuicksand) {
      return { finalPosition: position, haltedByQuicksand: true };
    }
  }

  return { finalPosition, haltedByQuicksand: false };
}

/**
 * Validates a player-chosen movement route for a NON-flying unit: the ordered
 * spaces it ENTERS (start exclusive, `destination` last). It must be an
 * orthogonal step-by-step walk, no longer than the unit's movement, that ends
 * on `destination`, never revisits a space, and never enters a blocked space
 * (another unit, an obstacle, a Force Field). Fire Walls / traps are NOT blocked
 * — a route may deliberately cross them (and take the hit), which is the whole
 * point of letting the player pick the path.
 */
function isLegalExplicitMovePath(
  state: GameState,
  combat: CombatState,
  unit: CombatUnitState,
  start: number,
  path: number[],
  destination: number
): boolean {
  if (path.length === 0 || path.length > getUnitMoveRange(unit, state)) {
    return false;
  }
  if (path[path.length - 1] !== destination) {
    return false;
  }
  const blocked = getBlockedSpaces(combat, unit);
  const seen = new Set<number>([start]);
  let previous = start;
  for (const cell of path) {
    if (!isBattlefieldPosition(cell) || !isAdjacent(previous, cell) || blocked.has(cell) || seen.has(cell)) {
      return false;
    }
    seen.add(cell);
    previous = cell;
  }
  return true;
}

function moveUnit(state: GameState, action: Extract<GameAction, { type: "MOVE_UNIT" }>): void {
  const combat = state.combat;
  const unit = combat?.units[action.unitId];
  if (!combat || !unit || unit.controllerId !== action.playerId || !canUnitMoveTo(combat, unit, action.destination, state)) {
    throw new Error("That unit cannot move to the selected space.");
  }

  const from = unit.position;
  const destination = action.destination;
  unit.movedThisActivation = true;

  let finalPosition = destination;
  let haltedByQuicksand = false;

  // The spaces the unit ENTERS. A player may dictate the exact route (action.path)
  // — e.g. to brave a Fire Wall on a shortcut, or detour around one — otherwise
  // the engine auto-routes (shortest, then least-hazard). Flyers never enter the
  // spaces they pass over, so a route is meaningless for them (ignored). With no
  // tokens and no chosen path, the walk is skipped and movement is unchanged.
  let enteredSpaces: number[] | null = null;
  if (action.path && unit.type !== "flying") {
    if (!isLegalExplicitMovePath(state, combat, unit, from, action.path, destination)) {
      throw new Error("That movement path is not legal.");
    }
    enteredSpaces = action.path;
  } else if ((combat.battlefieldTokens ?? []).length > 0) {
    enteredSpaces =
      unit.type === "flying"
        ? [destination]
        : (planMovePath(
            from,
            destination,
            getUnitMoveRange(unit, state),
            getBlockedSpaces(combat, unit),
            getKnownHazardSpaces(combat, unit)
          ) ?? [destination]);
  }

  if (enteredSpaces) {
    const walked = walkMoveThroughTokens(state, unit, enteredSpaces);
    finalPosition = walked.finalPosition;
    haltedByQuicksand = walked.haltedByQuicksand;
  }

  unit.position = finalPosition;

  appendEvent(state, {
    type: "UNIT_MOVED",
    playerId: action.playerId,
    unitId: unit.id,
    from,
    to: finalPosition
  });

  // A Fire Wall or Land Mine that struck the mover down ends its activation.
  if (!isUnitAlive(unit)) {
    if (combat.activeUnitId === unit.id) {
      appendExpiredEffectEvents(state, expireEffectsForActivationEnd(state, unit.id), "activation-ended");
      advanceActiveUnit(state);
    }
    state.phase = "combat";
    state.priorityPlayerId = null;
    finishCombatIfNeeded(state);
    return;
  }

  // Quicksand ends both movement AND activation, whatever the unit's type.
  // Ranged units likewise finish their activation with any move — they can
  // never attack after moving. Ground and flying units stay active to attack
  // an adjacent enemy or hold.
  if (haltedByQuicksand || unit.type === "ranged") {
    unit.activatedThisRound = true;
    appendExpiredEffectEvents(state, expireEffectsForActivationEnd(state, unit.id), "activation-ended");
    advanceActiveUnit(state);
  }

  state.phase = "combat";
  state.priorityPlayerId = null;
}

function defendUnit(state: GameState, action: Extract<GameAction, { type: "DEFEND_UNIT" }>): void {
  const combat = state.combat;
  const unit = combat?.units[action.unitId];
  if (!combat || !unit || unit.controllerId !== action.playerId) {
    throw new Error("That unit cannot defend now.");
  }

  unit.defenseToken = true;
  unit.activatedThisRound = true;
  // Bulwark "Runes" (Gamefound Update #3): taking the Defend action earns a
  // Bulwark unit's controller +2 Runes (RUNE_GAIN_DEFEND) — the richest Rune
  // source.
  gainRunesForDefend(state, unit);
  appendExpiredEffectEvents(state, expireEffectsForActivationEnd(state, unit.id), "activation-ended");

  appendEvent(state, {
    type: "UNIT_DEFENDED",
    playerId: action.playerId,
    unitId: unit.id
  });

  advanceActiveUnit(state);
}

function endActivation(state: GameState, action: Extract<GameAction, { type: "END_ACTIVATION" }>): void {
  const combat = state.combat;
  const unit = combat?.units[action.unitId];
  if (!combat || !unit || unit.controllerId !== action.playerId || combat.activeUnitId !== unit.id) {
    throw new Error("That unit cannot end its activation now.");
  }

  unit.activatedThisRound = true;
  appendExpiredEffectEvents(state, expireEffectsForActivationEnd(state, unit.id), "activation-ended");

  appendEvent(state, {
    type: "UNIT_ACTIVATION_ENDED",
    playerId: action.playerId,
    unitId: unit.id
  });

  advanceActiveUnit(state);
  state.phase = "combat";
  state.priorityPlayerId = null;
}

function advanceCombatRound(state: GameState, byPlayerId: PlayerId): void {
  if (!state.combat) {
    throw new Error("Combat is not active.");
  }

  const finishedRound = state.combat.round;
  state.combat.round += 1;
  resetCombatRound(state.combat);
  appendExpiredEffectEvents(state, expireEffectsForCombatRoundEnd(state, finishedRound), "combat-round-ended");
  expireTokensAtRoundEnd(state, state.combat, finishedRound);
  expireBattlefieldTokensAtRoundEnd(state, finishedRound);
  for (const player of Object.values(state.players)) {
    player.combatStats.spellsCastThisRound = 0;
    player.combatStats.spellLimitBonusThisRound = 0;
    player.combatStats.anySpellCastThisRound = false;
    // Spell Book (house rule): the +1-Power Book discard is capped at ONE per
    // COMBAT round (not one per whole battle). Refresh it here so a player who
    // spent it in round 1 may use it again in round 2, 3, … — while a second use
    // inside the SAME round stays blocked (the boolean is re-set on use). It is
    // also reset per map turn in refreshRoundTokens for the map→combat boundary.
    player.combatStats.spellBookPowerUsedThisTurn = false;
    // Tarnum (Conflux) VI: "immediately cast" — the over-limit Search privilege
    // does not survive into the next combat round (an uncast Searched spell just
    // stays in hand as a normal card).
    player.combatStats.tarnumOverlimitCards = [];
    // Expert uses (crowns) and the "+1 expert use this round" bonus (Pendant of
    // Courage / Helm of Heavenly Enlightenment) are a per-GAME-ROUND budget, not
    // a per-combat-round one. They are NOT reset here: a single battle's many
    // combat rounds share the same crowns, and those crowns were already shared
    // with the player's map abilities. They refresh only at the start of the
    // player's turn (refreshRoundTokens / startAdventureRound).
  }

  appendEvent(state, {
    type: "COMBAT_ROUND_ENDED",
    round: finishedRound,
    nextRound: state.combat.round
  });

  appendEvent(state, {
    type: "COMBAT_ROUND_STARTED",
    round: state.combat.round,
    activeUnitId: null
  });

  // Round-start war machines fire BEFORE any unit activates, so the first
  // activation is chosen only once they finish. Leave the active unit unset
  // (like round 1's finalizeCombatStart): ensureCombatActivation — or, in
  // adventure mode, the automation pump — opens the first activation (or its
  // tied-order choice) after the war-machine round completes.
  state.combat.activeUnitId = null;
  state.activePlayerId = byPlayerId;

  // Permanents played before this combat (or while it ran) keep their presence.
  applyPermanentCombatEffectsForPlayer(state, state.combat.attackerPlayerId);
  applyPermanentCombatEffectsForPlayer(state, state.combat.defenderPlayerId);
  startWarMachineRound(state);
  if (finishCombatIfNeeded(state)) {
    return;
  }
  ensureCombatActivation(state);
}

/**
 * After every settled step, make sure a running combat has an active unit (or
 * the tied-order choice that picks one). No-op while a sub-step is still in
 * flight — an open choice, reaction window, war-machine round, the resolving
 * stack, the end-of-combat notice, or a finished/setup combat.
 */
function ensureCombatActivation(state: GameState): void {
  const combat = state.combat;
  if (
    !combat ||
    combat.outcome ||
    combat.setup ||
    combat.awaitingContinue ||
    combat.warMachineRound ||
    combat.activeUnitId ||
    state.pendingChoice ||
    state.reactionWindow ||
    state.stack.length > 0
  ) {
    return;
  }

  advanceActiveUnit(state);
}

function endCombatRound(state: GameState, action: Extract<GameAction, { type: "END_COMBAT_ROUND" }>): void {
  advanceCombatRound(state, action.playerId);
}

function spendResources(resources: Record<ResourceKind, number>, cost: ResourceCost): void {
  for (const [resource, amount] of Object.entries(cost) as [ResourceKind, number][]) {
    resources[resource] -= amount;
  }
}

function applyBuildingEffect(
  state: GameState,
  action: Extract<GameAction, { type: "BUILD_STRUCTURE" }>,
  buildings: BuildingLibrary
): void {
  const building = buildings[action.buildingId];
  const effect = building?.effect;
  const player = state.players[action.playerId];
  if (!building || !effect || !player) {
    return;
  }

  if (effect.type === "GAIN_RESOURCE") {
    player.resources[effect.resource] += effect.amount;
  }

  if (effect.type === "ADD_EXPERT_USE_LIMIT") {
    player.limits.expertUses += effect.amount;
  }

  appendEvent(state, {
    type: "BUILDING_EFFECT_APPLIED",
    playerId: action.playerId,
    townId: action.townId,
    buildingId: action.buildingId,
    effect
  });
}

function buildStructure(
  state: GameState,
  action: Extract<GameAction, { type: "BUILD_STRUCTURE" }>,
  buildings: BuildingLibrary
): void {
  if (!canPlayerBuildStructure(state, action.playerId, action.townId, action.buildingId, buildings)) {
    throw new Error("That structure cannot be built right now.");
  }

  const player = state.players[action.playerId];
  const town = state.towns[action.townId];
  const building = buildings[action.buildingId];
  if (!player || !town || !building) {
    throw new Error("That structure cannot be built right now.");
  }

  spendResources(player.resources, building.cost);
  town.buildings.push(action.buildingId);

  appendEvent(state, {
    type: "STRUCTURE_BUILT",
    playerId: action.playerId,
    townId: action.townId,
    buildingId: action.buildingId,
    cost: building.cost
  });

  applyBuildingEffect(state, action, buildings);
}

function completeSimultaneousTurn(
  state: GameState,
  action: Extract<GameAction, { type: "COMPLETE_SIMULTANEOUS_TURN" }>
): void {
  if (state.turn.mode !== "simultaneous" || state.round > state.turn.simultaneousRoundLimit) {
    throw new Error("Simultaneous turns are not active.");
  }

  if (!state.turn.completedPlayerIds.includes(action.playerId)) {
    state.turn.completedPlayerIds.push(action.playerId);
  }

  appendEvent(state, {
    type: "SIMULTANEOUS_TURN_COMPLETED",
    playerId: action.playerId,
    completedPlayerIds: [...state.turn.completedPlayerIds]
  });

  const allPlayersComplete = state.turnOrder.every((playerId) => state.turn.completedPlayerIds.includes(playerId));
  if (!allPlayersComplete) {
    return;
  }

  state.turn.completedPlayerIds = [];

  if (state.round >= state.turn.simultaneousRoundLimit) {
    state.turn.mode = "ordered";
    state.phase = "player-turn";
    state.activePlayerId = state.turnOrder[0];
    state.turn.observingPlayerId = state.activePlayerId;
    appendEvent(state, {
      type: "ORDERED_TURNS_STARTED",
      activePlayerId: state.activePlayerId
    });
    return;
  }

  state.round += 1;
  state.phase = "simultaneous-turns";
}

/** Hand-card kinds the sandbox card picker may drop into a player's hand. */
const SANDBOX_ADDABLE_KINDS = new Set<CardDefinition["kind"]>([
  "spell",
  "ability",
  "artifact",
  "statistic",
  "hero-specialty",
  // War machines (First Aid Tent, Ammo Cart, Ballista, Catapult, Cannon) are
  // permanents bought from the Factory/Trading Post in a real game. The sandbox
  // has no market, so they must be addable here or their combat mechanics
  // (round-start shots, the Tent heal) are untestable in combat test mode.
  "war-machine"
]);

/**
 * Combat test mode only: add any playable card straight into a player's hand so
 * a tester can exercise its mechanic. Handler-validated (it never appears in
 * getLegalActions), so it guards itself: sandbox combat only, a real player, and
 * a known card of a hand-playable kind.
 */
function sandboxAddCard(
  state: GameState,
  action: Extract<GameAction, { type: "SANDBOX_ADD_CARD" }>,
  cards: CardLibrary
): void {
  if (state.combat?.context.kind !== "sandbox") {
    throw new Error("Cards can only be added by hand in the combat sandbox.");
  }

  const player = state.players[action.playerId];
  if (!player) {
    throw new Error(`Unknown player ${action.playerId}.`);
  }

  const card = cards[action.cardId];
  if (!card) {
    throw new Error(`Unknown card ${action.cardId}.`);
  }

  if (!SANDBOX_ADDABLE_KINDS.has(card.kind)) {
    throw new Error(`${card.name} (${card.kind}) is not a hand-playable card.`);
  }

  player.hand.push(action.cardId);
  appendEvent(state, {
    type: "SANDBOX_CARD_ADDED",
    playerId: action.playerId,
    cardId: action.cardId,
    message: `${player.name} adds ${card.name} to hand (sandbox).`
  });
}

function searchDeck(state: GameState, action: Extract<GameAction, { type: "SEARCH_DECK" }>): void {
  const deck = state.decks[action.deckId];
  if (!deck || !isSharedDeckId(action.deckId)) {
    throw new Error("That deck cannot be searched.");
  }
  if (deck.drawPile.length + deck.discardPile.length === 0) {
    throw new Error("That deck has no cards left to search.");
  }

  // Route through the shared "Search X" flow: when the discard pile holds cards
  // the player first chooses Search-the-deck OR take-the-top-discard, and only
  // sees the revealed cards on the Search branch — never both at once.
  openSharedDeckSearch(state, action.playerId, action.deckId, action.count);
}

/**
 * Mark an ability card the player just drew out of the shared Ability deck.
 * A Necromancy obtained this way (the level-up "Search the Ability deck"
 * reward) is kept but never playable — see the Necromancy legality check.
 */
function recordDeckDrawnAbility(player: PlayerState, deckId: string, cardId: CardId): void {
  if (deckId !== "abilities") {
    return;
  }
  (player.deckDrawnAbilityCardIds ??= []).push(cardId);
}

/**
 * A single non-interactive Search(1) of the named shared Spell deck: take the
 * top card the player may acquire into hand (redrawing past any they cannot
 * take), leaving the skipped cards tucked back under the deck. Returns the taken
 * card id, or null when the deck holds nothing acquirable. Used by Tarnum
 * (Conflux) VI's "Search(1) Spell twice" across the basic and expert decks.
 */
function takeTopAcquirableSpellToHand(state: GameState, playerId: PlayerId, deckId: string): CardId | null {
  const deck = state.decks[deckId];
  const player = state.players[playerId];
  if (!deck || !player) {
    return null;
  }
  const skipped: CardId[] = [];
  let taken: CardId | null = null;
  while (deck.drawPile.length > 0) {
    const cardId = deck.drawPile.pop();
    if (!cardId) {
      break;
    }
    if (canAcquireSharedDeckCard(state, playerId, deckId, cardId)) {
      taken = cardId;
      break;
    }
    skipped.push(cardId);
  }
  if (skipped.length > 0) {
    // Skipped cards never re-reach the top within this single pull, so tucking
    // them under the deck (front of the array) cannot loop.
    deck.drawPile.unshift(...skipped);
  }
  if (taken) {
    player.hand.push(taken);
    recordDeckDrawnAbility(player, deckId, taken);
  }
  return taken;
}

/** Spell decks with at least one card, basic first, that Tarnum VI may Search. */
function tarnumSearchableDecks(state: GameState): string[] {
  return [SPELL_DECK_BASIC, SPELL_DECK_EXPERT].filter(
    (deckId) => (state.decks[deckId]?.drawPile.length ?? 0) > 0
  );
}

/**
 * Tarnum (Conflux) VI: open (or re-open) the "which Spell deck to Search?" step.
 * The caster picks one deck (basic or expert) per search; with `remaining`
 * searches left, the choice re-opens after each pick. When no deck holds a card,
 * the step closes (nothing left to Search).
 */
function openTarnumSearch(state: GameState, playerId: PlayerId, remaining: number): void {
  if (remaining <= 0 || tarnumSearchableDecks(state).length === 0) {
    return;
  }
  const choiceId = `choice_${nextEventNumber(state)}`;
  state.pendingChoice = {
    id: choiceId,
    type: "TARNUM_SEARCH",
    playerId,
    remaining,
    returnPhase: state.combat ? "combat" : "player-turn"
  };
  state.phase = "choice";
  state.priorityPlayerId = playerId;
  appendEvent(state, {
    type: "PENDING_CHOICE_CREATED",
    choiceId,
    choiceType: "TARNUM_SEARCH",
    playerId,
    sourceEffectIds: [],
    message: `${state.players[playerId]?.name ?? playerId} Searches a Spell deck.`
  });
}

function resolveTarnumSearch(
  state: GameState,
  action: Extract<GameAction, { type: "CHOOSE_OPTION" }>,
  cards: CardLibrary
): void {
  const choice = state.pendingChoice;
  if (
    !choice ||
    choice.type !== "TARNUM_SEARCH" ||
    choice.id !== action.choiceId ||
    choice.playerId !== action.playerId
  ) {
    throw new Error("There is no Tarnum Search to resolve.");
  }
  const decks = tarnumSearchableDecks(state);
  const deckId = decks[action.optionIndex];
  if (!deckId) {
    throw new Error("Pick one of the offered Spell decks.");
  }

  const player = state.players[action.playerId];
  const taken = takeTopAcquirableSpellToHand(state, action.playerId, deckId);
  if (player && taken) {
    player.combatStats.tarnumOverlimitCards = [...(player.combatStats.tarnumOverlimitCards ?? []), taken];
  }

  appendEvent(state, {
    type: "PENDING_CHOICE_RESOLVED",
    choiceId: choice.id,
    playerId: action.playerId,
    selectedIndex: action.optionIndex
  });

  state.pendingChoice = null;
  // Re-open the next search; leaves pendingChoice null once all are done.
  openTarnumSearch(state, action.playerId, choice.remaining - 1);
  if (state.pendingChoice) {
    return;
  }
  // All searches resolved. When the Search ran inside a still-open reaction
  // window (Tarnum VI used as a reaction), re-derive that window's offers so a
  // just-Searched applicable instant can be cast into it, and return priority to
  // the caster. Otherwise just return to the prior phase.
  if (state.reactionWindow) {
    state.phase = "reaction";
    refreshReactionWindowLegalReactions(state, cards);
  } else {
    state.phase = choice.returnPhase;
    state.priorityPlayerId = null;
  }
}

function resolveDeckSearch(state: GameState, action: Extract<GameAction, { type: "RESOLVE_DECK_SEARCH" }>): void {
  const choice = state.pendingChoice;
  if (!choice || choice.type !== "DECK_SEARCH" || choice.id !== action.choiceId || choice.playerId !== action.playerId) {
    throw new Error("That deck search cannot be resolved.");
  }

  const deck = state.decks[choice.deckId];
  const player = state.players[action.playerId];
  if (!deck || !player) {
    throw new Error("That deck search cannot be resolved.");
  }

  // Only the keep-one pick reaches here. Basic X Magic's "draw from a School of
  // Magic" is resolved up front, before any reveal (see openSharedDeckSearch).
  const keptCardId = choice.revealedCardIds[action.pick.index];
  if (!keptCardId) {
    throw new Error("That revealed card is not available.");
  }

  // Tarnum (Conflux) I: "You can Remove this card instead of taking it into your
  // hand." The picked card is removed from the game (it never re-enters the
  // shared deck), only offered when the choice was opened with allowRemove.
  const removePicked = Boolean(action.pick.remove);
  if (removePicked && !choice.allowRemove) {
    throw new Error("That revealed card cannot be removed.");
  }
  if (!removePicked) {
    player.hand.push(keptCardId);
    recordDeckDrawnAbility(player, choice.deckId, keptCardId);
  }
  // Removing leaves the card out of both hand and the shared deck entirely: it
  // was already lifted off the draw pile when revealed, so dropping it here is
  // the whole "Remove from the game" — it never reaches the discard pile below.
  const keptIndex = action.pick.index;
  const discardedCardIds = choice.revealedCardIds.filter((_, index) => index !== keptIndex);
  deck.discardPile.push(...discardedCardIds);

  appendEvent(state, {
    type: "DECK_SEARCH_RESOLVED",
    playerId: action.playerId,
    deckId: choice.deckId,
    choiceId: choice.id,
    pick: "revealed",
    discardedCardIds
  });

  const repeat = choice.repeatSearch;
  state.pendingChoice = null;
  state.phase = choice.returnPhase;
  state.priorityPlayerId = null;

  // Positive Morale "discard the cards gained from Search (X) to perform the
  // Search (X) again": right after a Search resolves into a kept card, its
  // holder may resolve the card — the offer opens as its own choice, and any
  // queued follow-ups (the Pendant repeat below included) wait behind it.
  if (
    !removePicked &&
    state.adventure?.moraleCards &&
    choice.baseCount !== undefined &&
    playerHoldsMoraleCard(state, action.playerId, MORALE_CARD_IDS.repeatSearch)
  ) {
    const keptName = cardLibrary[keptCardId]?.name ?? keptCardId;
    state.pendingChoice = {
      id: `choice_${nextEventNumber(state)}`,
      type: "OPTION_CHOICE",
      playerId: action.playerId,
      prompt: `Positive Morale: discard ${keptName} to perform the Search (${choice.baseCount}) again?`,
      options: [
        { label: `Discard ${keptName} — repeat the Search (${choice.baseCount})` },
        { label: `Keep ${keptName} (save the morale card)` }
      ],
      context: "morale-repeat-search",
      moraleRepeatSearch: { deckId: choice.deckId, count: choice.baseCount, cardId: keptCardId },
      returnPhase: choice.returnPhase
    };
    state.phase = "choice";
    state.priorityPlayerId = action.playerId;
  }

  // Pendant of Courage: the whole Search action happens once more.
  if (repeat) {
    if (state.adventure) {
      state.adventure.rewardQueue.unshift({
        playerId: action.playerId,
        kind: "shared-deck-search",
        deckId: repeat.deckId,
        count: repeat.count
      });
      pumpAdventureQueues(state);
    } else {
      openSharedDeckSearch(state, action.playerId, repeat.deckId, repeat.count);
    }
  }
}

function moveHero(state: GameState, action: Extract<GameAction, { type: "MOVE_HERO" }>): void {
  const hero = state.heroes[action.heroId];
  if (!hero || hero.controllerId !== action.playerId || !hero.spaceId) {
    throw new Error("That hero cannot move now.");
  }

  if (hero.movementPoints <= 0) {
    throw new Error("That hero has no movement points left.");
  }

  const currentSpace = state.map.spaces[hero.spaceId];
  if (!currentSpace?.adjacent.includes(action.to)) {
    throw new Error("Heroes can only move to adjacent map fields.");
  }

  const from = hero.spaceId;
  hero.spaceId = action.to;
  hero.movementPoints -= 1;

  appendEvent(state, {
    type: "HERO_MOVED",
    playerId: action.playerId,
    heroId: hero.id,
    from,
    to: action.to,
    movementLeft: hero.movementPoints
  });
  commitPopulationOnMove(state, hero.controllerId);
}

function endTurn(state: GameState, action: Extract<GameAction, { type: "END_TURN" }>): void {
  const nextPlayer = nextPlayerId(state, action.playerId);
  // Ongoing cards expire when their owner's next turn begins.
  appendExpiredEffectEvents(state, expireEffectsForTurnEnd(state, nextPlayer), "turn-ended");
  state.activePlayerId = nextPlayer;
  if (state.turn.mode === "ordered") {
    state.turn.observingPlayerId = nextPlayer;
  }
  appendEvent(state, {
    type: "TURN_ENDED",
    playerId: action.playerId,
    nextPlayerId: nextPlayer
  });
}

/**
 * Executes one queued neutral activation according to the AI rules. The pump
 * pauses whenever a reaction window or pending choice opens for a human.
 */
function executeNeutralActivation(
  state: GameState,
  unit: CombatUnitState,
  cards: CardLibrary,
  forcedTargetId?: UnitId
): void {
  const combat = state.combat;
  if (!combat) {
    return;
  }

  // A neutral's "[activation]" choice ability fires once, before it acts:
  // Enchanters take +1 Attack, Faerie Dragons zap their normal target (and may
  // end the combat outright). It never ends the activation otherwise.
  if (!unit.activationAbilityDone) {
    unit.activationAbilityDone = true;
    applyNeutralActivationAbility(state, unit);
    if (combat.outcome) {
      return;
    }
  }

  const intent = planNeutralActivation(state, combat, unit, forcedTargetId);

  if (intent.kind === "choose-target") {
    // Rulebook AI: "If there is ever a tie between equally valid targets,
    // the player chooses which unit is attacked."
    const chooser = combat.attackerPlayerId;
    const choiceId = `choice_${nextEventNumber(state)}`;
    state.pendingChoice = {
      id: choiceId,
      type: "ABILITY_TARGET_CHOICE",
      playerId: chooser,
      kind: "neutral-target",
      abilityId: null,
      abilityName: "Neutral target tie",
      prompt: `${unit.name} has equally valid targets — you choose which unit it attacks.`,
      sourceUnitId: unit.id,
      anchorUnitId: null,
      candidateUnitIds: intent.candidateIds
    };
    state.phase = "choice";
    state.priorityPlayerId = chooser;

    appendEvent(state, {
      type: "PENDING_CHOICE_CREATED",
      choiceId,
      choiceType: "ABILITY_TARGET_CHOICE",
      playerId: chooser,
      sourceEffectIds: [],
      message: `${unit.name} has tied targets: the player chooses which unit is attacked.`
    });
    return;
  }

  if (intent.kind === "pass") {
    unit.activatedThisRound = true;
    appendExpiredEffectEvents(state, expireEffectsForActivationEnd(state, unit.id), "activation-ended");
    appendEvent(state, {
      type: "UNIT_ACTIVATION_ENDED",
      playerId: unit.controllerId,
      unitId: unit.id
    });
    advanceActiveUnit(state);
    return;
  }

  if (intent.kind === "move") {
    const from = unit.position;
    unit.position = intent.destination;
    unit.movedThisActivation = true;
    unit.activatedThisRound = true;
    appendExpiredEffectEvents(state, expireEffectsForActivationEnd(state, unit.id), "activation-ended");
    appendEvent(state, {
      type: "UNIT_MOVED",
      playerId: unit.controllerId,
      unitId: unit.id,
      from,
      to: intent.destination
    });
    // The pre-activation reaction pause already paced this guard (the human saw
    // it about to move and had their window), so the move just advances to the
    // next unit — whose own pre-activation pause holds the board to show this
    // move's result.
    advanceActiveUnit(state);
    return;
  }

  if (intent.kind === "move-and-attack") {
    const from = unit.position;
    unit.position = intent.destination;
    unit.movedThisActivation = true;
    appendEvent(state, {
      type: "UNIT_MOVED",
      playerId: unit.controllerId,
      unitId: unit.id,
      from,
      to: intent.destination
    });
  }

  declareAttack(
    state,
    {
      type: "ATTACK_UNIT",
      playerId: unit.controllerId,
      attackerId: unit.id,
      defenderId: intent.defenderId
    },
    cards
  );
}

/**
 * A preview of what a neutral guard is about to do, shown in the pre-activation
 * reaction pop-up so the reacting player knows what they are reacting to. A
 * target tie is reported as a plain "attack" (the exact target is chosen after
 * the pause resumes).
 */
function previewNeutralIntent(
  state: GameState,
  combat: CombatState,
  unit: CombatUnitState
): NonNullable<NonNullable<CombatState["pendingNeutralStep"]>["intent"]> {
  const intent = planNeutralActivation(state, combat, unit);
  switch (intent.kind) {
    case "attack":
    case "move-and-attack": {
      const target = combat.units[intent.defenderId];
      return {
        kind: "attack",
        targetUnitId: intent.defenderId,
        targetName: target?.name,
        ...(intent.kind === "move-and-attack" ? { destination: intent.destination } : {})
      };
    }
    case "move":
      return { kind: "move", destination: intent.destination };
    case "choose-target":
      return { kind: "attack" };
    default:
      return { kind: "pass" };
  }
}

/**
 * Who, if anyone, gets a pre-activation reaction pause before `active` takes
 * its turn — the participant on the OTHER side who can meaningfully react now:
 *
 *  - Neutral fights: the human attacker, always (the pause paces every guard so
 *    they see it about to act); the client auto-resumes after a beat when there
 *    is nothing to react with.
 *  - Player-vs-player: the opposing (off-turn) player, whenever they hold ANY
 *    off-turn reaction — an instant ability/specialty, a usable active effect
 *    (First Aid Tent), a trigger-free instant spell, or (with the Intelligence
 *    freedom) an activation spell. This is the real "stop before the enemy unit
 *    acts so you can play your instant" window.
 *
 * In every mode the menu of "what can be played off-turn right now" is a single
 * function — getOffTurnCombatReactions — and it is empty unless there is a real
 * play. The PvP pause keys off exactly that, so it never stops the fight for
 * nothing AND any future off-turn reaction added to getOffTurnCombatReactions
 * automatically earns this stop, with no change here.
 *
 * Returns null in the sandbox, for neutral reactors, hand-locked sides
 * (heroless garrison / Secondary Hero), and whenever nothing can be done.
 */
function reactionPauseReactor(
  state: GameState,
  combat: CombatState,
  active: CombatUnitState,
  cards: CardLibrary
): PlayerId | null {
  if (combat.context.kind === "sandbox") {
    return null;
  }

  for (const candidate of [combat.attackerPlayerId, combat.defenderPlayerId]) {
    if (candidate === active.controllerId || candidate === NEUTRAL_PLAYER_ID) {
      continue;
    }
    if (isHandLockedInCombat(state, candidate)) {
      continue;
    }
    // Neutral fights pace EVERY guard step: the pause always opens for the
    // human attacker so they see the guard about to act and can react if they
    // can (the client auto-resumes after a beat when there is nothing to do).
    if (combat.context.kind === "neutral") {
      return candidate;
    }
    // Player-vs-player: stop before the enemy unit acts whenever this side has
    // any off-turn reaction ready (see getOffTurnCombatReactions — the single
    // source of truth, empty unless there is a real play). No Intelligence
    // requirement: instant abilities/specialties and active effects qualify on
    // their own, and new off-turn reactions get this stop for free.
    if (getOffTurnCombatReactions(state, candidate, cards).length > 0) {
      return candidate;
    }
  }

  return null;
}

/**
 * Adventure-mode engine pump, run after every applied action: advances
 * neutral activations, gates the neutral combat time limit, finalizes
 * adventure combats, and opens queued rewards. Stops whenever a human
 * decision (reaction window, pending choice, placement, continue/retreat)
 * is required.
 */
function runAdventureAutomations(state: GameState, cards: CardLibrary): void {
  if (!state.adventure) {
    return;
  }

  let safety = 300;
  while (safety > 0) {
    safety -= 1;
    const combat = state.combat;

    // A combat pause is open (a guard walked, or a pre-activation reaction
    // window): hold everything until the reacting player clicks on. If the
    // combat ended meanwhile — e.g. the reactor cast a lethal spell during the
    // pause — drop the pause so the outcome can finalize below.
    if (combat?.pendingNeutralStep) {
      if (combat.outcome) {
        combat.pendingNeutralStep = null;
      } else {
        break;
      }
    }

    // A neutral unit's innate combat reaction (War Zealot Magic Mirror): the AI
    // has no UI to click it, so auto-resolve the window when it holds priority —
    // the reflect (or a pass) then happens on its own instead of the spell simply
    // resolving against the neutral untouched.
    if (
      state.reactionWindow?.priorityPlayerId === NEUTRAL_PLAYER_ID &&
      autoResolveNeutralReaction(state, cards)
    ) {
      continue;
    }

    // Neutral Liches/Magogs/Cerberi resolve their own ability targets.
    if (
      state.pendingChoice?.type === "ABILITY_TARGET_CHOICE" &&
      state.pendingChoice.playerId === NEUTRAL_PLAYER_ID
    ) {
      if (autoResolveNeutralAbilityChoice(state, cards)) {
        continue;
      }
    }

    // Neutral Minotaurs/Champions auto-reroll their own "-1" attack die.
    if (
      state.pendingChoice?.type === "ATTACK_DIE_REROLL" &&
      state.pendingChoice.playerId === NEUTRAL_PLAYER_ID
    ) {
      autoResolveNeutralReroll(state, cards);
      continue;
    }

    // Neutral Skeletons: the moment a Skeleton guard falls (between
    // activations), the attacker's Necropolis hero is offered a free bronze
    // reinforce. A Skeleton killed last leaves combat already over, so the
    // after-combat fallback in finalizeAdventureCombat covers that case.
    if (
      combat &&
      !combat.outcome &&
      !combat.setup &&
      !combat.awaitingContinue &&
      !state.reactionWindow &&
      !state.pendingChoice &&
      state.stack.length === 0 &&
      combat.skeletonGuardDefeated &&
      !combat.skeletonReinforceGranted &&
      state.players[combat.attackerPlayerId]?.factionId === "necropolis"
    ) {
      combat.skeletonReinforceGranted = true;
      openSkeletonReinforceChoice(state, combat.attackerPlayerId);
      if (state.pendingChoice) {
        break;
      }
      continue;
    }

    if (
      combat &&
      !combat.outcome &&
      !combat.setup &&
      !combat.awaitingContinue &&
      !state.reactionWindow &&
      !state.pendingChoice &&
      state.stack.length === 0
    ) {
      // A unit can be left as activeUnitId after dying WITHOUT acting — an
      // off-turn instant (or a neutral-pause cast) that kills the very unit whose
      // pre-activation reaction pause was open. Drop the corpse so activation
      // advances to the next living unit instead of stalling on it.
      const stalledActive = combat.activeUnitId ? combat.units[combat.activeUnitId] : null;
      if (combat.activeUnitId && (!stalledActive || !isUnitAlive(stalledActive))) {
        combat.activeUnitId = null;
      }

      if (!combat.activeUnitId) {
        const step = getActivationStep(combat, state.activeEffects);
        if (step) {
          // Sets the next unit, or opens the tied-order choice for a human side.
          advanceActiveUnit(state);
          if (state.pendingChoice) {
            break;
          }
          continue;
        }

        // All units acted: neutral combats hit their one-round time limit,
        // player combats roll straight into the next round. Azure guards have NO
        // Round limit and roll into the next round automatically. (House rule:
        // Creature Banks DO obey the Round limit and the spend-MP-to-extend
        // rule, exactly like an ordinary neutral fight — so they are NOT
        // exempted here.)
        if (combat.context.kind === "neutral" && !combat.context.hasAzure) {
          combat.awaitingContinue = true;
          state.priorityPlayerId = combat.attackerPlayerId;
          state.activePlayerId = combat.attackerPlayerId;
          continue;
        }

        advanceCombatRound(state, combat.attackerPlayerId);
        continue;
      }

      const active = combat.units[combat.activeUnitId];
      if (active && isUnitAlive(active) && !active.activatedThisRound) {
        // Pre-activation reaction pause: before this unit acts, give the other
        // side a real window to react — cast (Intelligence-enabled / trigger-free
        // instant spells), play an instant ability/specialty, or use an active
        // effect. Neutral fights "go slower" so the human can react to each
        // guard; player-vs-player stops whenever the off-turn side actually holds
        // a reaction (reactionPauseReactor decides). No intent is previewed for a
        // human-driven unit — its controller has not chosen yet.
        if (!active.reactionPauseAcked) {
          const reactor = reactionPauseReactor(state, combat, active, cards);
          if (reactor) {
            combat.pendingNeutralStep = {
              kind: "pre-activation",
              unitId: active.id,
              name: active.name,
              reactingPlayerId: reactor,
              ...(isNeutralUnit(active) ? { intent: previewNeutralIntent(state, combat, active) } : {})
            };
            state.priorityPlayerId = reactor;
            break;
          }
          active.reactionPauseAcked = true;
        }

        if (isNeutralUnit(active)) {
          executeNeutralActivation(state, active, cards);
          continue;
        }
        // A human-controlled unit is active (player-vs-player): the pump stops
        // and waits for that player to drive it.
      }
    }

    // Adventure combats wait on the battlefield with the end-of-combat
    // notice up; a participant's ACKNOWLEDGE_COMBAT_END flips the flag and
    // only then do XP, unit flips and the field visit resolve.
    if (combat?.outcome && combat.context.kind !== "sandbox" && combat.endAcknowledged) {
      finalizeAdventureCombat(state);
      continue;
    }

    // During a PvP pre-battle preparation window the only queued rewards are the
    // Spell-deck searches from buying spells / building a Mage Guild, so pump the
    // queue then too (pumpAdventureQueues itself permits the prep exception).
    const pumpDuringPrep = Boolean(state.combat?.prep);
    if ((!state.combat || pumpDuringPrep) && !state.pendingChoice && !state.reactionWindow) {
      const queueLength = state.adventure.rewardQueue.length;
      const hadVisit = Boolean(state.adventure.pendingVisit);
      pumpAdventureQueues(state);
      if (state.adventure.rewardQueue.length !== queueLength || hadVisit !== Boolean(state.adventure.pendingVisit)) {
        continue;
      }
    }

    break;
  }
}

/** Adventure actions are validated inside their handlers, not by enumeration. */
const HANDLER_VALIDATED_ACTIONS = new Set<GameAction["type"]>([
  "REFRESH_HAND",
  "ASTROLOGERS_HERO_EMPOWER",
  "REVISIT_FIELD",
  "OPEN_MARKET",
  "DISCOVER_TILE",
  "PLACE_TILE",
  "PLACE_OBSERVATORY_TILE",
  "SET_TILE_ROTATION",
  "MOVE_HERO_PATH",
  "RESOLVE_VISIT_STEP",
  "TRADE_RESOURCES",
  "PLACE_COMBAT_UNIT",
  "UNPLACE_COMBAT_UNIT",
  "SWAP_COMBAT_UNITS",
  "SANDBOX_ADD_CARD",
  "FINISH_TACTICS",
  "FINISH_COMBAT_PLACEMENT",
  "ACCEPT_COMBAT",
  "CONTINUE_NEUTRAL_COMBAT",
  "RETREAT_FROM_COMBAT",
  "SURRENDER_COMBAT",
  "POPULATION_ACTION",
  "SPELL_BOOK_ACTION",
  "ROGUES_SCOUT_DECK",
  "SATYR_MORALE_ROLL",
  "THIEVES_GUILD_ACTION",
  "BLACKSMITH_ACTION",
  "SPEND_MORALE",
  "CHOOSE_OPTION",
  "CHOOSE_ABILITY_TARGET",
  "CHOOSE_FACTION",
  "SET_GAME_OPTIONS",
  "START_ADVENTURE",
  "CONFIRM_START_ADVENTURE",
  "CANCEL_START_ADVENTURE",
  "SET_DRAFT_FORMAT",
  "ROLL_TOWN_OPTIONS",
  "CHOOSE_TOWN",
  "ROLL_HERO_OPTIONS",
  "BAN_HERO",
  "RESET_SEAT_DRAFT",
  "RANDOM_ASSIGN_SEAT",
  "BUY_WAR_MACHINE",
  // WOG commander bookkeeping: the handlers fully self-validate (ownership,
  // owed picks, distinct stats, grade caps, gold, the open First Aid window),
  // and the actions touch only the actor's own state — so, like the choice
  // resolutions above, they skip the getLegalActions membership check.
  "COMMANDER_GRADE_UP",
  "REVIVE_COMMANDER",
  "COMMANDER_FIRST_AID",
  "COMMANDER_SET_STANCE",
  "USE_SCHOOL_FETCH_EXPERT",
  "USE_TOWN_BUILDING",
  "SPEND_TOWN_CUBE",
  "HALL_OF_VALHALLA_BOOST",
  "CONVERT_CARD_TO_ATTACK",
  "ATTACK_FORTIFICATION",
  "GIVE_UP",
  "JOIN_ROOM",
  "LEAVE_ROOM",
  "SET_ROOM_HOSTED",
  "ASSIGN_SEAT",
  "KICK_MEMBER",
  "TRANSFER_HOST",
  "SET_ROOM_NAME",
  "SET_ROOM_REQUIRE_AUTH",
  "SET_ROOM_RANKED",
  "SEND_TABLE_REACTION",
  "SEND_CHAT",
  "START_AFK_VOTE",
  "CAST_AFK_VOTE",
  "RESOLVE_AFK_DROP",
  "FORCE_AFK_KICK"
]);

function isHandlerValidated(state: GameState, action: GameAction): boolean {
  if (HANDLER_VALIDATED_ACTIONS.has(action.type)) {
    return true;
  }

  return (
    state.mode === "adventure" &&
    (action.type === "MOVE_HERO" || action.type === "BUILD_STRUCTURE" || action.type === "END_TURN")
  );
}

export function applyAction(state: GameState, action: GameAction, options: ReducerOptions = {}): EngineResult {
  const cards = options.cards ?? cardLibrary;
  const buildings = options.buildings ?? sampleBuildings;

  // Self-heal any duplicate army-unit ids before validating or running the
  // action (see ensureUniqueArmyUnitIds). A legacy id collision — minted by the
  // old counter scheme across a host recycle — would otherwise let both the
  // legality check and the handlers match the *wrong* army unit (the reported
  // "reinforcing/deploying the Orcs upgrades/places the Cyclopes" bug). Only the
  // rare corrupted save needs a clone-and-repair; the common case validates and
  // runs against the original state untouched (a rejected action still returns
  // it unchanged). When we do repair, that copy is returned even on failure so
  // the stored room heals on the next action regardless of the outcome.
  // Backfill any player fields a newer release added (e.g. the Spell Book's
  // `spellBook`) so a game serialized by an older engine validates and runs —
  // and getLegalActions / getPlayerView never trip over a missing array. Mutates
  // the stored state in place (harmless: it only adds an empty array that was
  // logically always there), so the room heals for every later read too.
  healLegacyPlayerFields(state);

  // Hosted-room seat ownership: a client may only act for its own seat. No-op
  // on an open table or when the transport supplied no identity. A verified
  // userId (Phase 2) is authoritative over the claimed clientId.
  const seatError = roomActionGuard(state, action, {
    clientId: options.actorClientId,
    userId: options.actorUserId
  });
  if (seatError) {
    return fail(state, { code: "ACTION_NOT_LEGAL", message: seatError });
  }

  let base = state;
  if (hasDuplicateArmyUnitIds(state)) {
    base = cloneState(state);
    ensureUniqueArmyUnitIds(base);
  }

  const legalError = isHandlerValidated(base, action) ? null : assertLegal(base, action, cards, buildings);
  if (legalError) {
    return fail(base, legalError);
  }

  const nextState = cloneState(base);
  const startEventNumber = eventSeedNumber(nextState);

  // Parallel turns, transactional backstop: when a player acts while ANOTHER
  // player's exclusive interaction (battle, choice, visit…) is open, their
  // action must leave that machinery untouched — quiet moves, hand refreshes,
  // town economy. The slot fingerprint is compared once everything (handler +
  // automations) has settled; any drift rejects the whole action, so a
  // mis-classified "quiet" action can only ever fail cleanly, never corrupt
  // the open interaction. Null for owners/participants and outside parallel
  // mode, so every other code path pays nothing.
  const actorPlayerId =
    "playerId" in action && typeof (action as { playerId?: unknown }).playerId === "string"
      ? (action as { playerId: PlayerId }).playerId
      : null;
  // The AFK vote-kick actions are table-level meta actions, like chat: they
  // must stay available exactly when the table is frozen (an open interaction,
  // the round-start event barrier — a stuck AFK player is WHY they exist), and
  // the passed vote's drop step legitimately clears the machinery it removes
  // the player from. So they bypass the bystander fingerprint and the event
  // barrier below; their own handlers enforce their legality.
  const isAfkMetaAction =
    action.type === "START_AFK_VOTE" ||
    action.type === "CAST_AFK_VOTE" ||
    action.type === "RESOLVE_AFK_DROP" ||
    action.type === "FORCE_AFK_KICK";
  const parallelBystanderBlocker =
    actorPlayerId && !isAfkMetaAction ? parallelInteractionBlocker(nextState, actorPlayerId) : null;
  const parallelSlotBefore = parallelBystanderBlocker ? parallelSlotSignature(nextState) : null;

  // Round-start Event / Astrologers barrier (ordered AND parallel play): while
  // the round's Event is being resolved clockwise, the ONLY player who may act
  // is the one whose event choice is currently open — every other player waits
  // until the whole table has resolved it (no quiet moves, no start-of-turn
  // draw, no town/morale actions, no ending the turn). Read from the PRE-handler
  // clone, so the round-wrap action that first raises the barrier (inside its own
  // handler) is not itself rejected, and chat (no `playerId`) is exempt.
  if (actorPlayerId && !isAfkMetaAction && isRoundStartEventBarrierActive(nextState)) {
    const resolver = roundStartEventResolver(nextState);
    if (resolver && resolver !== actorPlayerId) {
      return fail(base, {
        code: "ACTION_NOT_LEGAL",
        message: "The round's Event is still being resolved — wait until every player has resolved it before acting."
      });
    }
  }

  // True randomness: park the server's fresh per-action entropy so every seeded
  // RNG draw this action makes is salted with it (no-op when omitted, keeping the
  // test suite deterministic — see random.ts). Restored in `finally` so it never
  // leaks into the next action or into setup-time RNG.
  const previousEntropy = setActiveEntropy(options.entropy);
  try {
    try {
      switch (action.type) {
      case "CAST_SPELL":
        // Mandatory start-of-turn draw: a Map Spell cast is blocked until the
        // draw is taken (no-op in combat / off-turn). Checked before resolving so
        // the cast never half-runs.
        assertStartOfTurnDrawTaken(nextState, action.playerId);
        castSpell(nextState, action, cards);
        break;
      case "PLAY_CARD":
        // Likewise for any other card played on the quiet map turn.
        assertStartOfTurnDrawTaken(nextState, action.playerId);
        playCard(nextState, action, cards);
        break;
      case "ATTACK_UNIT":
        attackUnit(nextState, action, cards);
        break;
      case "MOVE_AND_ATTACK_UNIT":
        moveAndAttackUnit(nextState, action, cards);
        break;
      case "MOVE_UNIT":
        moveUnit(nextState, action);
        break;
      case "USE_UNIT_ABILITY":
        applyUnitAbilityAction(nextState, action);
        break;
      case "SUMMON_DEMONS":
        summonDemons(nextState, action);
        break;
      case "USE_GENIE_DECK_DRAW":
        applyGenieDeckDraw(nextState, action);
        break;
      case "USE_ACTIVE_EFFECT":
        applyActiveEffectAction(nextState, action);
        // A First Aid Tent heal used as an instant during a reaction window
        // (heal-when-attacked) keeps the window open: clear stale passes, re-derive
        // the offers (the heal may now be spent) and hand priority back so the
        // healer can heal again / pass, then the paused attack resumes.
        if (nextState.reactionWindow) {
          advanceReactionWindowAfterPlay(nextState, action.playerId, cards);
        }
        break;
      case "DEFEND_UNIT":
        defendUnit(nextState, action);
        break;
      case "END_ACTIVATION":
        endActivation(nextState, action);
        break;
      case "END_COMBAT_ROUND":
        endCombatRound(nextState, action);
        break;
      case "BUILD_STRUCTURE":
        if (nextState.mode === "adventure") {
          buildStructureAdventure(nextState, action);
        } else {
          buildStructure(nextState, action, buildings);
        }
        break;
      case "COMPLETE_SIMULTANEOUS_TURN":
        completeSimultaneousTurn(nextState, action);
        break;
      case "REROLL_PENDING_CHOICE":
        rerollPendingChoice(nextState, action);
        break;
      case "CHOOSE_PENDING_ROLL":
        choosePendingRoll(nextState, action, cards);
        break;
      case "PASS_REACTION":
        passReaction(nextState, action, cards);
        break;
      case "PLAY_REACTION":
        playReaction(nextState, action, cards);
        break;
      case "PLAY_REACTIONS":
        playReactions(nextState, action, cards);
        break;
      case "USE_UNIT_RESURRECTION":
        applyUnitResurrection(nextState, action, cards);
        break;
      case "USE_UNIT_MAGIC_MIRROR":
        applyUnitMagicMirror(nextState, action, cards);
        break;
      case "USE_UNIT_DIE_IGNORE":
        applyUnitDieIgnore(nextState, action, cards);
        break;
      case "SEARCH_DECK":
        searchDeck(nextState, action);
        break;
      case "SANDBOX_ADD_CARD":
        sandboxAddCard(nextState, action, cards);
        break;
      case "RESOLVE_DECK_SEARCH":
        resolveDeckSearch(nextState, action);
        break;
      case "MOVE_HERO":
        if (nextState.mode === "adventure") {
          moveHeroAdventure(nextState, action);
        } else {
          moveHero(nextState, action);
        }
        break;
      case "MOVE_HERO_PATH":
        moveHeroPathAdventure(nextState, action);
        break;
      case "REFRESH_HAND":
        refreshHand(nextState, action);
        break;
      case "ASTROLOGERS_HERO_EMPOWER":
        astrologersHeroEmpower(nextState, action);
        break;
      case "MOVE_SPELL_TO_SPELL_BOOK":
        moveSpellToSpellBook(nextState, action, cards);
        break;
      case "REVISIT_FIELD":
        revisitField(nextState, action);
        break;
      case "OPEN_MARKET":
        openMarket(nextState, action);
        break;
      case "DISCOVER_TILE":
        discoverTile(nextState, action);
        break;
      case "PLACE_TILE":
        placeTile(nextState, action);
        break;
      case "PLACE_OBSERVATORY_TILE":
        placeObservatoryTile(nextState, action);
        break;
      case "SET_TILE_ROTATION":
        setTileRotation(nextState, action);
        break;
      case "CHOOSE_FACTION":
        chooseFaction(nextState, action);
        break;
      case "START_ADVENTURE":
        startAdventureFromLobby(nextState, action, options.now);
        break;
      case "CONFIRM_START_ADVENTURE":
        confirmStartAdventure(nextState, action, options.now);
        break;
      case "CANCEL_START_ADVENTURE":
        cancelStartAdventure(nextState, action, options.now);
        break;
      case "SET_DRAFT_FORMAT":
        setDraftFormat(nextState, action);
        break;
      case "ROLL_TOWN_OPTIONS":
        rollTownOptions(nextState, action);
        break;
      case "CHOOSE_TOWN":
        chooseTown(nextState, action);
        break;
      case "ROLL_HERO_OPTIONS":
        rollHeroOptions(nextState, action);
        break;
      case "BAN_HERO":
        banHero(nextState, action);
        break;
      case "RESET_SEAT_DRAFT":
        resetSeatDraft(nextState, action);
        break;
      case "RANDOM_ASSIGN_SEAT":
        randomAssignSeat(nextState, action);
        break;
      case "JOIN_ROOM":
        joinRoom(nextState, action, { clientId: options.actorClientId, userId: options.actorUserId });
        break;
      case "LEAVE_ROOM":
        leaveRoom(nextState, action);
        break;
      case "SET_ROOM_HOSTED":
        setRoomHosted(nextState, action);
        break;
      case "ASSIGN_SEAT":
        assignSeat(nextState, action);
        break;
      case "KICK_MEMBER":
        kickMember(nextState, action);
        break;
      case "TRANSFER_HOST":
        transferHost(nextState, action);
        break;
      case "SET_ROOM_NAME":
        setRoomName(nextState, action);
        break;
      case "SET_ROOM_REQUIRE_AUTH":
        setRoomRequireAuth(nextState, action);
        break;
      case "SET_ROOM_RANKED":
        setRoomRanked(nextState, action);
        break;
      case "SEND_TABLE_REACTION":
        sendTableReaction(nextState, action);
        break;
      case "SEND_CHAT":
        sendChat(nextState, action);
        break;
      case "RESOLVE_VISIT_STEP":
        resolveVisitStep(nextState, action);
        break;
      case "TRADE_RESOURCES":
        tradeResources(nextState, action);
        break;
      case "BUY_WAR_MACHINE":
        buyWarMachine(nextState, action);
        break;
      case "SELL_SCROLL_SPELL":
        sellScrollSpell(nextState, action);
        break;
      case "USE_SCHOOL_FETCH_EXPERT":
        applySchoolFetchExpert(nextState, action);
        refreshReactionWindowLegalReactions(nextState, cards);
        break;
      case "DISCARD_PERMANENT":
        discardPermanentVoluntarily(nextState, action);
        break;
      case "CRACK_PERMANENT":
        crackPermanentForInstant(nextState, action);
        break;
      case "ACKNOWLEDGE_COMBAT_END":
        acknowledgeCombatEnd(nextState, action);
        break;
      case "SKIP_NECROMANCY":
        skipNecromancy(nextState, action);
        break;
      case "COMMANDER_GRADE_UP":
        commanderGradeUp(nextState, action);
        break;
      case "REVIVE_COMMANDER":
        reviveCommander(nextState, action);
        break;
      case "COMMANDER_FIRST_AID":
        resolveCommanderFirstAid(nextState, action);
        break;
      case "COMMANDER_SET_STANCE":
        commanderSetStance(nextState, action);
        break;
      case "PLACE_COMBAT_UNIT":
        placeCombatUnit(nextState, action);
        break;
      case "UNPLACE_COMBAT_UNIT":
        unplaceCombatUnit(nextState, action);
        break;
      case "FINISH_COMBAT_PLACEMENT":
        finishCombatPlacement(nextState, action);
        break;
      case "ACCEPT_COMBAT":
        acceptCombat(nextState, action);
        break;
      case "SWAP_COMBAT_UNITS":
        swapCombatUnits(nextState, action);
        break;
      case "FINISH_TACTICS":
        finishTactics(nextState, action);
        break;
      case "CONTINUE_NEUTRAL_COMBAT":
        continueNeutralCombat(nextState, action);
        advanceCombatRound(nextState, action.playerId);
        break;
      case "CONTINUE_NEUTRAL_STEP":
        continueNeutralStep(nextState, action);
        break;
      case "RETREAT_FROM_COMBAT":
        retreatFromCombat(nextState, action);
        break;
      case "SURRENDER_COMBAT":
        surrenderFromCombat(nextState, action);
        break;
      case "GIVE_UP_COMBAT":
        giveUpCombat(nextState, action);
        break;
      case "POPULATION_ACTION":
        populationAction(nextState, action);
        break;
      case "HIRE_SECONDARY_HERO":
        hireSecondaryHero(nextState, action);
        break;
      case "SPELL_BOOK_ACTION":
        spellBookAction(nextState, action);
        break;
      case "ROGUES_SCOUT_DECK":
        roguesScoutDeck(nextState, action);
        break;
      case "SATYR_MORALE_ROLL":
        satyrMoraleRoll(nextState, action);
        break;
      case "THIEVES_GUILD_ACTION":
        thievesGuildAction(nextState, action);
        break;
      case "BLACKSMITH_ACTION":
        blacksmithAction(nextState, action);
        break;
      case "MAGIC_UNIVERSITY_ACTION":
        magicUniversityAction(nextState, action);
        break;
      case "USE_TOWN_BUILDING":
        activateTownBuilding(nextState, action);
        break;
      case "SPEND_TOWN_CUBE":
        spendTownCube(nextState, action);
        refreshReactionWindowLegalReactions(nextState, cards);
        break;
      case "HALL_OF_VALHALLA_BOOST":
        hallOfValhallaBoost(nextState, action);
        refreshReactionWindowLegalReactions(nextState, cards);
        break;
      case "CONVERT_CARD_TO_ATTACK":
        convertCardToAttack(nextState, action);
        refreshReactionWindowLegalReactions(nextState, cards);
        break;
      case "ATTACK_FORTIFICATION":
        attackFortification(nextState, action);
        break;
      case "SPEND_MORALE":
        spendMorale(nextState, action);
        break;
      case "CHOOSE_OPTION":
        // The combat-only option choices (Harpy fly-back, Genies' Wish spell
        // pick, Ghost Dragon knock-back) live in the combat reducer; every other
        // option choice is
        // handled by the adventure reducer.
        if (nextState.pendingChoice?.type === "TARNUM_SEARCH") {
          resolveTarnumSearch(nextState, action, cards);
        } else if (
          nextState.pendingChoice?.type === "OPTION_CHOICE" &&
          nextState.pendingChoice.context === "combat-reposition"
        ) {
          resolveCombatReposition(nextState, action);
        } else if (
          nextState.pendingChoice?.type === "OPTION_CHOICE" &&
          nextState.pendingChoice.context === "genie-take-spell"
        ) {
          resolveGenieTakeSpell(nextState, action);
        } else if (
          nextState.pendingChoice?.type === "OPTION_CHOICE" &&
          nextState.pendingChoice.context === "combat-knockback"
        ) {
          resolveKnockbackChoice(nextState, action, cards);
        } else if (
          nextState.pendingChoice?.type === "OPTION_CHOICE" &&
          nextState.pendingChoice.context === "combat-teleport"
        ) {
          resolveTeleportChoice(nextState, action);
        } else if (
          nextState.pendingChoice?.type === "OPTION_CHOICE" &&
          nextState.pendingChoice.context === "place-battlefield-tokens"
        ) {
          resolvePlaceTokensChoice(nextState, action);
        } else if (
          nextState.pendingChoice?.type === "OPTION_CHOICE" &&
          nextState.pendingChoice.context === "combat-clone"
        ) {
          resolveCloneChoice(nextState, action);
        } else if (
          nextState.pendingChoice?.type === "OPTION_CHOICE" &&
          nextState.pendingChoice.context === "combat-step"
        ) {
          resolveUnitStepChoice(nextState, action);
        } else if (
          nextState.pendingChoice?.type === "OPTION_CHOICE" &&
          nextState.pendingChoice.context === "combat-activation-order"
        ) {
          resolveActivationOrderChoice(nextState, action);
        } else {
          chooseOption(nextState, action);
        }
        break;
      case "RESOLVE_COMBAT_DISCARD":
        resolveCombatHandDiscard(nextState, action, cards);
        break;
      case "CHOOSE_ABILITY_TARGET":
        chooseAbilityTarget(nextState, action, cards);
        break;
      case "SET_GAME_OPTIONS":
        setGameOptions(nextState, action);
        break;
      case "END_TURN":
        if (nextState.mode === "adventure") {
          endTurnAdventure(nextState, action);
        } else {
          endTurn(nextState, action);
        }
        break;
      case "GIVE_UP":
        giveUpAdventure(nextState, action);
        break;
      case "START_AFK_VOTE":
        startAfkVote(nextState, action, options.now);
        break;
      case "CAST_AFK_VOTE":
        castAfkVote(nextState, action, options.now);
        break;
      case "RESOLVE_AFK_DROP":
        resolveAfkDrop(nextState, action);
        break;
      case "FORCE_AFK_KICK":
        forceAfkKick(nextState, action, options.now);
        break;
    }
  } catch (error) {
    return fail(base, {
      code: "ACTION_NOT_LEGAL",
      message: error instanceof Error ? error.message : "The action could not be applied."
    });
  }

  // Disrupting Ray: refresh every unit's ability-suppression flag from the live
  // UNIT_ABILITY_SUPPRESSED effects, so the ability chokepoint
  // (getUnitAbilityDefinitions) sees the current state however the effect was
  // just added (a cast) or removed (Dispel, combat/round end) — before any
  // automation or future action reads the unit's abilities.
  syncAbilitySuppression(nextState);

  try {
    runAdventureAutomations(nextState, cards);
  } catch (error) {
    return fail(base, {
      code: "ACTION_NOT_LEGAL",
      message:
        error instanceof Error
          ? `Automation failed: ${error.message}`
          : "The action could not complete its automatic follow-up."
    });
  }

  // Combat-sandbox combats (and any post-war-machine round start) have no
  // adventure pump to hand out the activation slot, so settle it here: open the
  // next unit, or the tied-order choice that picks it.
  ensureCombatActivation(nextState);

  // Pre-activation interrupts (Sorrow's skip, Bowstring of the Unicorn's Mane's
  // out-of-order ranged activation): once everything else has settled, open the
  // shared window before the about-to-act unit moves. Runs before the active
  // unit's own "[activation]" choice so an interrupt pre-empts it.
  maybeOpenPreActivationWindow(nextState, cards);

  // Once everything else has settled, surface a player-controlled unit's
  // "[activation]" choice (Enchanters' heal-or-buff, Faerie Dragons' Ice Bolt)
  // before it acts. Runs after the neutral pump and war-machine round-starts.
  maybeOpenPlayerActivationChoice(nextState);

  // Ongoing cards whose every effect has ended (expired, consumed, dispelled
  // — whatever this action did) finally reach their discard pile or hand.
  releaseEndedOngoingCards(nextState);

  // Parallel turns: reject a bystander action that touched the exclusive
  // interaction machinery (see the fingerprint capture above).
  if (parallelSlotBefore !== null && parallelSlotSignature(nextState) !== parallelSlotBefore) {
    return fail(base, {
      code: "ACTION_NOT_LEGAL",
      message: parallelWaitMessage(base, parallelBystanderBlocker as PlayerId | "table")
    });
  }

  // AFK vote-kick bookkeeping, success path only: stamp the actor's
  // last-action clock from the server wall time and cancel an open kick vote
  // the moment its target acts (see src/engine/afk.ts).
  applyAfkBookkeeping(nextState, action, options.now);

    return ok(nextState, startEventNumber);
  } finally {
    setActiveEntropy(previousEntropy);
  }
}

export function findEvent<T extends GameEvent["type"]>(
  state: GameState,
  type: T
): Extract<GameEvent, { type: T }> | undefined {
  return state.eventLog.find((event): event is Extract<GameEvent, { type: T }> => event.type === type);
}
