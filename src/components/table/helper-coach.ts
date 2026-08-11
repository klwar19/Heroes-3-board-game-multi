/**
 * Pure helper-coach logic — next-step tips and "why can't I play this card".
 * No React: unit-tested and reused by map + combat UI.
 */
import { cardLibrary } from "@/data/cards/library";
import {
  hasOpenAdventureTurn,
  inCombatPrep,
  isCastASpellCard,
  isAdjacent,
  isUnitAlive,
  isParallelActor,
  isRoundStartEventBarrierActive,
  NEUTRAL_PLAYER_ID,
  parallelTurnsActive,
  playerSpellCastsIgnoreLimit,
  polishSpellBookEnabled,
  remainingParallelPlayerIds,
  type CardDefinition,
  type GameState,
  type LegalAction,
  type PlayerId,
  type UnitType
} from "@/engine";

export type CoachTone = "go" | "wait" | "choice" | "info";

export type CoachTip = {
  id: string;
  headline: string;
  detail: string;
  tone: CoachTone;
};

function playerName(state: GameState, playerId: PlayerId | undefined | null): string {
  if (!playerId) {
    return "another player";
  }
  return state.players[playerId]?.name ?? playerId;
}

function hasAction(legalActions: LegalAction[], type: string): boolean {
  return legalActions.some((legal) => legal.action.type === type);
}

/**
 * One plain-language next step for the seated viewer, or null when nothing
 * useful to say (observer, setup, already covered by a blocking modal).
 */
export function buildCoachTip(
  state: GameState,
  viewerPlayerId: PlayerId,
  legalActions: LegalAction[]
): CoachTip | null {
  if (!viewerPlayerId || viewerPlayerId === NEUTRAL_PLAYER_ID) {
    return null;
  }
  if (state.phase === "setup" || state.setupLobby) {
    return null;
  }

  const viewer = state.players[viewerPlayerId];
  if (!viewer) {
    return {
      id: "observer",
      headline: "Watching",
      detail: "You are not seated — hands stay private; you can still watch the board.",
      tone: "info"
    };
  }

  if (state.adventure?.winnerPlayerId) {
    const winner = playerName(state, state.adventure.winnerPlayerId);
    return {
      id: "adventure-over",
      headline: "Adventure over",
      detail:
        state.adventure.winnerPlayerId === viewerPlayerId
          ? "You won — open the result panel or start a new adventure."
          : `${winner} won the adventure.`,
      tone: "info"
    };
  }

  // --- Exclusive decisions (always first) ---------------------------------
  const choice = state.pendingChoice;
  if (choice && choice.playerId === viewerPlayerId) {
    if (choice.type === "OPTION_CHOICE") {
      return {
        id: "choice-option",
        headline: "Your decision",
        detail: choice.prompt || "Pick one of the highlighted options.",
        tone: "choice"
      };
    }
    if (choice.type === "DECK_SEARCH" || choice.type === "TARNUM_SEARCH") {
      return {
        id: "choice-search",
        headline: "Search the deck",
        detail: "Look at the revealed cards and keep one (or take the discard top if offered).",
        tone: "choice"
      };
    }
    if (choice.type === "ATTACK_DIE_REROLL") {
      return {
        id: "choice-reroll",
        headline: "Dice window",
        detail: "Keep this result, or spend a reroll / set-die effect if you have one.",
        tone: "choice"
      };
    }
    if (choice.type === "ABILITY_TARGET_CHOICE") {
      return {
        id: "choice-ability-target",
        headline: "Pick a target",
        detail: choice.prompt || "Click a glowing unit or choose from the list.",
        tone: "choice"
      };
    }
    if (choice.type === "COMBAT_HAND_DISCARD") {
      return {
        id: "choice-combat-discard",
        headline: "Discard from hand",
        detail: choice.prompt || "Choose which card to discard.",
        tone: "choice"
      };
    }
    return {
      id: "choice-generic",
      headline: "Your decision",
      detail: "Resolve the open prompt — the game waits on your pick.",
      tone: "choice"
    };
  }

  if (choice && choice.playerId !== viewerPlayerId) {
    return {
      id: "wait-choice",
      headline: `Waiting for ${playerName(state, choice.playerId)}`,
      detail: "They have an open decision. You cannot act until it resolves.",
      tone: "wait"
    };
  }

  const visit = state.adventure?.pendingVisit;
  if (visit && visit.playerId === viewerPlayerId) {
    return {
      id: "visit",
      headline: "Location visit",
      detail: "Finish the visit prompt (rewards, markets, or dice) before you move again.",
      tone: "choice"
    };
  }
  if (visit && visit.playerId !== viewerPlayerId) {
    const barrier = isRoundStartEventBarrierActive(state);
    return {
      id: "wait-visit",
      headline: barrier
        ? `Waiting for ${playerName(state, visit.playerId)}`
        : `${playerName(state, visit.playerId)} is resolving a visit`,
      detail: barrier
        ? "A round-start Event or Astrologers proclamation freezes the table until everyone finishes it."
        : "Their location menu is open — your map actions wait.",
      tone: "wait"
    };
  }

  const tileChoice = state.adventure?.pendingTileChoice;
  if (tileChoice && tileChoice.playerId === viewerPlayerId) {
    return {
      id: "tile-rotate",
      headline: "Rotate the new tile",
      detail: "Use the rotate controls, then confirm placement when the edges line up.",
      tone: "choice"
    };
  }
  if (tileChoice && tileChoice.playerId !== viewerPlayerId) {
    return {
      id: "wait-tile",
      headline: `Waiting for ${playerName(state, tileChoice.playerId)}`,
      detail: "They are rotating or placing a map tile.",
      tone: "wait"
    };
  }

  const reaction = state.reactionWindow;
  if (reaction) {
    if (reaction.priorityPlayerId === viewerPlayerId) {
      const canPass = hasAction(legalActions, "PASS_REACTION");
      return {
        id: "reaction",
        headline: "Instant window",
        detail: canPass
          ? "Play an Instant card that fits this moment, or Pass to continue."
          : "Respond if you can — then the attack or spell resolves.",
        tone: "choice"
      };
    }
    return {
      id: "wait-reaction",
      headline: `Waiting for ${playerName(state, reaction.priorityPlayerId)}`,
      detail: "They may play Instant cards into the open window.",
      tone: "wait"
    };
  }

  // --- Combat -------------------------------------------------------------
  const combat = state.combat;
  if (combat) {
    if (combat.outcome) {
      if (hasAction(legalActions, "ACKNOWLEDGE_COMBAT_END")) {
        return {
          id: "combat-end",
          headline: "Battle finished",
          detail: "Acknowledge the result to claim rewards and return to the map.",
          tone: "choice"
        };
      }
      return {
        id: "combat-end-wait",
        headline: "Battle finished",
        detail: "Waiting for the result to be acknowledged.",
        tone: "wait"
      };
    }

    if (inCombatPrep(state, viewerPlayerId)) {
      return {
        id: "combat-prep",
        headline: "Prepare for battle",
        detail: "Build, recruit, or buy on the map, then Accept when ready. Retreat is available until both accept.",
        tone: "go"
      };
    }
    if (combat.prep) {
      return {
        id: "combat-prep-wait",
        headline: "Battle preparation",
        detail: "Both sides are preparing on the map…",
        tone: "wait"
      };
    }

    if (combat.setup) {
      if (hasAction(legalActions, "PLACE_UNIT") || hasAction(legalActions, "FINISH_PLACEMENT")) {
        return {
          id: "combat-place",
          headline: "Deploy your army",
          detail: "Place units on glowing cells, then confirm when your formation is ready.",
          tone: "go"
        };
      }
      return {
        id: "combat-place-wait",
        headline: "Deployment",
        detail: "Waiting for the other side to finish placing units.",
        tone: "wait"
      };
    }

    if (hasAction(legalActions, "FINISH_TACTICS") || hasAction(legalActions, "SWAP_COMBAT_UNITS")) {
      return {
        id: "tactics",
        headline: "Tactics",
        detail: "Swap two of your units on the board if you like, then Keep positions to start.",
        tone: "go"
      };
    }

    if (combat.awaitingContinue && combat.context.kind === "neutral") {
      if (hasAction(legalActions, "CONTINUE_NEUTRAL_COMBAT") || hasAction(legalActions, "RETREAT_FROM_NEUTRAL_COMBAT")) {
        return {
          id: "neutral-continue",
          headline: "Neutral combat — round over",
          detail: "Spend 1 movement to fight another round, or retreat to the map.",
          tone: "choice"
        };
      }
    }

    const activeUnit = combat.activeUnitId ? combat.units[combat.activeUnitId] : undefined;
    if (activeUnit && activeUnit.controllerId === viewerPlayerId) {
      const postShot =
        activeUnit.attackedThisActivation &&
        !activeUnit.activatedThisRound &&
        activeUnit.type === "ranged";
      if (postShot) {
        return {
          id: "combat-post-shot",
          headline: `${activeUnit.name} fired`,
          detail: "Step up to 1 space if you want, or Hold to end the activation.",
          tone: "go"
        };
      }
      if (!activeUnit.attackedThisActivation) {
        return {
          id: "combat-active",
          headline: `${activeUnit.name} is active`,
          detail:
            activeUnit.type === "ranged"
              ? "Shoot any enemy (or move 1 without shooting). Defend ends the activation."
              : "Move on green cells, then attack a red adjacent enemy — or Defend.",
          tone: "go"
        };
      }
      return {
        id: "combat-finish-activation",
        headline: `${activeUnit.name} acted`,
        detail: "Hold or finish the activation when you are done.",
        tone: "go"
      };
    }

    if (activeUnit) {
      return {
        id: "combat-wait-unit",
        headline: `Waiting — ${activeUnit.name}`,
        detail: `${playerName(state, activeUnit.controllerId)} is activating this unit.`,
        tone: "wait"
      };
    }

    return {
      id: "combat-generic",
      headline: "In combat",
      detail: "Use the command dock and glowing board targets. Glowing hand cards are playable now.",
      tone: "info"
    };
  }

  // --- Adventure map ------------------------------------------------------
  if (viewer.needsHandRefresh && hasOpenAdventureTurn(state, viewerPlayerId)) {
    return {
      id: "hand-limit",
      headline: "Hand over the limit",
      detail: "Discard down at the bottom of the screen before you can move or play cards.",
      tone: "choice"
    };
  }

  if (viewer.canMulligan && hasOpenAdventureTurn(state, viewerPlayerId)) {
    return {
      id: "start-draw",
      headline: "Start of turn — draw first",
      detail: "Draw up to your hand limit (or discard and redraw) before moving or playing cards.",
      tone: "choice"
    };
  }

  if (parallelTurnsActive(state)) {
    if (state.turn.completedPlayerIds.includes(viewerPlayerId)) {
      const waiting = remainingParallelPlayerIds(state)
        .map((id) => playerName(state, id))
        .join(", ");
      return {
        id: "parallel-done",
        headline: "You ended your parallel turn",
        detail: waiting ? `Still playing: ${waiting}.` : "Wrapping the round…",
        tone: "wait"
      };
    }
    if (isParallelActor(state, viewerPlayerId)) {
      const canMove = hasAction(legalActions, "MOVE_HERO") || hasAction(legalActions, "MOVE_SECONDARY_HERO");
      const canEnd = hasAction(legalActions, "END_TURN");
      return {
        id: "parallel-open",
        headline: "Parallel turns — your turn is open",
        detail: canMove
          ? "Move your hero, visit fields, use town, then End turn when ready. Battles still resolve one at a time."
          : canEnd
            ? "No safe moves left — End turn, or act in town / play map cards."
            : "Act when the map allows — some interactions wait on another player.",
        tone: "go"
      };
    }
  }

  if (!hasOpenAdventureTurn(state, viewerPlayerId) && !parallelTurnsActive(state)) {
    return {
      id: "not-your-turn",
      headline: `${playerName(state, state.activePlayerId)}'s turn`,
      detail: "Watch the board — movement and most cards unlock on your turn.",
      tone: "wait"
    };
  }

  const canMove = hasAction(legalActions, "MOVE_HERO") || hasAction(legalActions, "MOVE_SECONDARY_HERO");
  const canEnd = hasAction(legalActions, "END_TURN");
  const canDiscover = hasAction(legalActions, "DISCOVER_TILE");

  if (canMove || canDiscover) {
    return {
      id: "map-turn",
      headline: "Your turn",
      detail: canDiscover
        ? "Click a reachable hex to move, or discover an adjacent face-down tile. Town dock builds & recruits."
        : "Click a reachable hex to move your hero. Open town to build/recruit; glowing cards can be played.",
      tone: "go"
    };
  }

  if (canEnd) {
    return {
      id: "map-end",
      headline: "Your turn — ready to end?",
      detail: "No movement left (or nowhere useful to go). End turn when you are finished with town and cards.",
      tone: "go"
    };
  }

  return {
    id: "map-generic",
    headline: "Adventure map",
    detail: "Use the town dock, hand cards, and map. A prompt will appear when the game needs a decision.",
    tone: "info"
  };
}

/** Crowns left this combat round for expert effects. */
function crownsLeft(state: GameState, playerId: PlayerId): number {
  const player = state.players[playerId];
  if (!player) {
    return 0;
  }
  return (
    player.limits.expertUses +
    (player.combatStats.expertUseBonusThisRound ?? 0) -
    player.combatStats.expertUsesSpentThisRound
  );
}

/**
 * The printed unit-TYPE restriction a card carries, and which side it must find
 * such a body on. Two shapes ship today:
 *
 *  • a `target.unitTypes` gate — Ash's Bloodlust IV ("your selected [ground] or
 *    [flying] unit"), the Bowstring of the Unicorn's Mane and Hourglass ("ranged");
 *  • an `ADD_COMBAT_STAT` attack buff with `unitTypes` — the Bloodlust SPELL,
 *    Ash's Bloodlust I/VI, Precision. Those land on the ATTACKING unit, so the
 *    holder needs a body of that type of their OWN.
 *
 * Returning null means the card prints no type restriction (the vast majority).
 */
function printedUnitTypeGate(
  card: CardDefinition
): { unitTypes: readonly UnitType[]; side: "friendly" | "enemy" } | null {
  const target = card.target;
  if (target && "unitTypes" in target && target.unitTypes && target.unitTypes.length > 0) {
    return { unitTypes: target.unitTypes, side: target.type === "enemy-unit" ? "enemy" : "friendly" };
  }
  if (
    card.effect.type === "ADD_COMBAT_STAT" &&
    card.effect.stat === "attack" &&
    card.effect.amount >= 0 &&
    card.effect.unitTypes &&
    card.effect.unitTypes.length > 0
  ) {
    return { unitTypes: card.effect.unitTypes, side: "friendly" };
  }
  return null;
}

function unitTypeWords(types: readonly UnitType[]): string {
  if (types.length <= 1) {
    return types[0] ?? "";
  }
  return `${types.slice(0, -1).join(", ")} or ${types[types.length - 1]}`;
}

/**
 * "Bloodlust only lands on a ground or flying unit of yours — you have none in
 * this battle." Reported 2026-08-11 as "cannot play Ash speciality IV card": the
 * printed ground-or-flying gate is real and correctly enforced, but every hint
 * the table showed was the generic "No legal play right now (check targets or
 * unit state)", which never names the restriction. Null when the card prints no
 * type gate, or when a matching living body IS on the board (then the reason
 * lies elsewhere and the later branches explain it).
 */
function unitTypeGateReason(state: GameState, viewerPlayerId: PlayerId, card: CardDefinition): string | null {
  const gate = printedUnitTypeGate(card);
  if (!gate || !state.combat) {
    return null;
  }
  const matches = Object.values(state.combat.units).some(
    (unit) =>
      isUnitAlive(unit) &&
      (gate.side === "friendly"
        ? unit.controllerId === viewerPlayerId
        : unit.controllerId !== viewerPlayerId) &&
      gate.unitTypes.includes(unit.type)
  );
  if (matches) {
    return null;
  }
  return `${card.name} only lands on a ${unitTypeWords(gate.unitTypes)} ${
    gate.side === "friendly" ? "unit of yours" : "enemy unit"
  } — there is none in this battle`;
}

/**
 * Why a hand card has no legal play right now — plain language for the UI.
 * Used when helper tips are on (title, popover, small badge).
 */
export function cardUnplayableReason(
  state: GameState,
  viewerPlayerId: PlayerId,
  cardId: string,
  options?: {
    /** True while a reaction/instant tray is open for someone. */
    trayActive?: boolean;
  }
): string {
  const card = cardLibrary[cardId];
  if (!card) {
    return "Unknown card";
  }
  if (card.implementationStatus === "not-implemented") {
    return "Not automated yet — resolve this card by the printed rules if needed";
  }

  const player = state.players[viewerPlayerId];
  if (!player) {
    return "Not your seat";
  }

  if (options?.trayActive) {
    return "Finish or pass the Instant window first";
  }

  if (state.pendingChoice && state.pendingChoice.playerId !== viewerPlayerId) {
    return `Waiting for ${playerName(state, state.pendingChoice.playerId)}'s decision`;
  }
  if (state.pendingChoice && state.pendingChoice.playerId === viewerPlayerId) {
    return "Resolve the open prompt first";
  }

  if (state.reactionWindow && state.reactionWindow.priorityPlayerId !== viewerPlayerId) {
    return `Waiting for ${playerName(state, state.reactionWindow.priorityPlayerId)} in the Instant window`;
  }

  // --- Map-only timing ----------------------------------------------------
  if (!state.combat) {
    // Spells with map timing (Town Portal, View Air…) are playable on the map;
    // combat-only spells are not.
    if (card.kind === "spell" && card.timing !== "map") {
      return "Spells are cast in combat (not on the map)";
    }
    if (card.timing === "combat") {
      return "Combat card — play during a battle";
    }
    if (player.needsHandRefresh && hasOpenAdventureTurn(state, viewerPlayerId)) {
      return "Discard down to your hand limit first";
    }
    if (player.canMulligan && hasOpenAdventureTurn(state, viewerPlayerId)) {
      return "Take your start-of-turn draw first";
    }
    if (!hasOpenAdventureTurn(state, viewerPlayerId)) {
      return "Not your turn — most cards wait until you are active";
    }
    if (card.timing === "instant" || card.trigger) {
      return "Instant — needs its timing window (often during combat or a special offer)";
    }
    if (card.timing === "map") {
      return "No legal map play right now (wrong phase, cost, or target)";
    }
    return "No legal play right now";
  }

  // --- Combat timing ------------------------------------------------------
  // Map-only cards never cast in combat (check before spell/instant branches).
  if (card.timing === "map") {
    return "Map effect — play on the adventure map during your turn";
  }

  const ignoreSpellLimit = playerSpellCastsIgnoreLimit(state, viewerPlayerId);
  const spellLimit = 1 + (player.combatStats.spellLimitBonusThisRound ?? 0);
  const spellLimitReached =
    !ignoreSpellLimit && (player.combatStats.spellsCastThisRound ?? 0) >= spellLimit;

  if (card.kind === "spell") {
    // Polish "Cast a Spell" is an enabler, not a real cast — its combat menu
    // opens the Book / lists refreshed Spells. Never claim it needs an Instant
    // reaction window (its printed timing is "instant" for the +1 Power arm).
    if (polishSpellBookEnabled(state) && isCastASpellCard(cardId)) {
      if (spellLimitReached) {
        return `Spell limit reached (${spellLimit} per combat round) — no Book cast this round`;
      }
      const activeUnit = state.combat.activeUnitId
        ? state.combat.units[state.combat.activeUnitId]
        : undefined;
      const ownActivationOpen = Boolean(
        activeUnit &&
          activeUnit.controllerId === viewerPlayerId &&
          !activeUnit.activatedThisRound &&
          !activeUnit.attackedThisActivation
      );
      if (!ownActivationOpen) {
        return "Open Spell Book / List spells during your own unit's activation, before it attacks (or after your next unit starts)";
      }
      if ((player.spellBook ?? []).length === 0) {
        return "No refreshed Spells in the Spell Book";
      }
      return "No Book Spell is castable right now (wrong targets, map-only spell, or Instant waiting for its window)";
    }
    if (spellLimitReached) {
      return `Spell limit reached (${spellLimit} per combat round)`;
    }
    if (
      card.effect.type === "CHAIN_LIGHTNING" &&
      Object.values(state.combat.units).filter(
        (unit) => isUnitAlive(unit) && unit.position >= 0,
      ).length < 3
    ) {
      return "Chain Lightning requires 3 living units: select 1 unit and the 2 closest units";
    }
    if (card.trigger || card.timing === "instant") {
      return "Instant spell — play into an attack or spell window (Power cards can empower it)";
    }
    return "Cast while one of your units is active, before it attacks";
  }

  // A printed unit-TYPE gate is checked ahead of the timing branches below: a
  // holder with no ground/flying (or no ranged) body is never going to get a
  // window, so "waits for an attack window" would send them hunting for a
  // moment that cannot come.
  const typeGateReason = unitTypeGateReason(state, viewerPlayerId, card);
  if (typeGateReason) {
    return typeGateReason;
  }

  if (card.trigger || card.timing === "instant" || card.timing === "reaction") {
    if (state.reactionWindow?.priorityPlayerId === viewerPlayerId) {
      return "No legal Instant for this window — Pass if you have nothing to play";
    }
    return "Instant — waits for an attack or spell window (glowing cards can react)";
  }

  const activeUnit = state.combat.activeUnitId ? state.combat.units[state.combat.activeUnitId] : undefined;
  const ownActivationOpen = Boolean(
    activeUnit &&
      activeUnit.controllerId === viewerPlayerId &&
      !activeUnit.activatedThisRound &&
      !activeUnit.attackedThisActivation
  );

  if (card.effect.type === "CHAIN_LIGHTNING") {
    const living = Object.values(state.combat.units).filter(
      (unit) => isUnitAlive(unit) && unit.position >= 0,
    );
    if (living.length < 3) {
      return "Chain Lightning requires 3 living units: select 1 unit and the 2 closest units";
    }
  }

  if (cardId === "specialty.deemer.1" || cardId === "specialty.deemer.6") {
    const required = cardId.endsWith(".6") ? 2 : 1;
    const living = Object.values(state.combat.units).filter(
      (unit) => isUnitAlive(unit) && unit.position >= 0,
    );
    const hasValidCenter = living.some(
      (center) =>
        living.filter(
          (unit) => unit.id !== center.id && isAdjacent(unit.position, center.position)
        ).length >= required
    );
    if (!hasValidCenter) {
      return `Meteor Shower requires a selected unit with ${required} living adjacent target${required === 1 ? "" : "s"}`;
    }
  }

  if (card.timing === "ongoing" || card.timing === "combat" || card.timing === "action") {
    if (!ownActivationOpen) {
      return "Play during your own unit's activation, before it attacks";
    }
    if (crownsLeft(state, viewerPlayerId) <= 0) {
      // Might still be playable basic — but if no actions, could be cost/target.
      return "No legal play (check targets, expert crowns, or unit state)";
    }
    return "No legal play right now (check targets or unit state)";
  }

  return "No legal timing right now";
}
