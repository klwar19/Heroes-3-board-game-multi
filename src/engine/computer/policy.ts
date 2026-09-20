import { hasNecromancyPlan } from "./development";
import { openingGuardCommitment } from "./necropolis-combat";
import { cardLibrary } from "@/data/cards/library";
import { effectiveHandLimit, explorersHandStepActive, getUnitSide, isFieldGuarded } from "../adventure";
import type { GameAction, GameState, LegalAction } from "../state";
import { cardHandValue, moraleRedrawDiscards, scoreCardAction } from "./card-policy";
import { upcomingFight } from "./card-planning";
import { heroPickBias } from "./card-values";
import { scoreChoiceAction } from "./choice-policy";
import { scoreCombatAction } from "./combat-policy";
import { scoreMapAction } from "./map-policy";
import type { ComputerDecision, ComputerObservation } from "./types";
import { learnedActionBias, type LearnedModelSelection } from "./learned-policy";
import type { ReplayPolicyModel } from "./replay-model";
import { developmentPlanBias } from "./development-plan";
import { repeatsUnproductiveRoute } from "./memory";
import { canBeatGuardedField, objectiveDistanceField, primaryMapObjective, withMapScoringCache } from "./map-navigation";
import { isPremiumEconomyField } from "./army-strength";
import { deferDiscretionarySpending, refineCombatShortlist, refinePvpCombatSpellRound } from "./decision-planning";

/** A scored move alone is not evidence that retracing a route pays off. */
function returnsTowardPayoff(observation: ComputerObservation, action: GameAction): boolean {
  if (action.type !== "MOVE_HERO" && action.type !== "MOVE_HERO_PATH") return false;
  const state = observation.state as unknown as GameState;
  const hero = state.heroes[action.heroId];
  const destination = action.type === "MOVE_HERO" ? action.to : action.path.at(-1);
  if (!hero?.spaceId || !destination) return false;
  const primary = primaryMapObjective(state, hero, undefined, observation.memory?.stickyObjectiveSpaceId);
  if (!primary) return false;
  const field = state.adventure?.fields[primary.spaceId];
  if (!field || (isFieldGuarded(field) && !canBeatGuardedField(state, hero, field))) return false;
  const distance = objectiveDistanceField(state, hero, [primary], isPremiumEconomyField(field));
  return (distance.get(destination) ?? Infinity) < (distance.get(hero.spaceId) ?? Infinity);
}

/** Stable serialization independent of object property insertion order. */
export function canonicalActionKey(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalActionKey).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(
        ([key, child]) => `${JSON.stringify(key)}:${canonicalActionKey(child)}`,
      )
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

/**
 * Legality-match key: how a chosen action is matched back against the offered
 * legal set. Identical to canonicalActionKey except for handler-validated
 * actions whose offer is a bare template the policy parameterizes — currently
 * hand refresh and the optional opening mulligan, whose discards we choose.
 */
export function legalityMatchKey(action: GameAction): string {
  if (action.type === "REFRESH_HAND" || action.type === "OPENING_HAND_MULLIGAN") {
    return canonicalActionKey({ ...action, discardCardIds: [] });
  }
  // The morale redraw is offered as a bare template too (discard any cards,
  // draw that many) — the runner fills the junk list, see withMoraleRedrawDiscards.
  if (action.type === "SPEND_MORALE" && action.benefit === "redraw") {
    return canonicalActionKey({ ...action, discardCardIds: [] });
  }
  return canonicalActionKey(action);
}

/**
 * SPEND_MORALE "redraw" template: discard the junk moraleRedrawDiscards names
 * and draw as many. The scorer already keeps the redraw unchosen when that
 * list is empty (the handler rejects an empty discard list).
 */
function withMoraleRedrawDiscards(
  observation: ComputerObservation,
  action: Extract<GameAction, { type: "SPEND_MORALE" }>,
): GameAction {
  if (action.benefit !== "redraw") return action;
  const discards = moraleRedrawDiscards(observation);
  return discards.length > 0 ? { ...action, discardCardIds: discards } : action;
}

const NEVER_AUTOMATE = new Set<GameAction["type"]>([
  "SET_GAME_OPTIONS",
  "SET_COMPUTER_OPPONENTS",
  // Human-only single-player control: a bot must never set its own (or a
  // sibling's) faction through the owner's hand-pick action.
  "SET_COMPUTER_SEAT_FACTION",
  "SET_DRAFT_FORMAT",
  "RESET_SEAT_DRAFT",
  "START_ADVENTURE",
  "CANCEL_START_ADVENTURE",
  "REQUEST_ROOM_RESET",
  "CONFIRM_ROOM_RESET",
  "CANCEL_ROOM_RESET",
  "START_AFK_VOTE",
  "CAST_AFK_VOTE",
  "FORCE_AFK_KICK",
  "FORCE_TURN_TIMEOUT",
  "REQUEST_PAUSE",
  "CONFIRM_PAUSE",
  "CANCEL_PAUSE",
  "RESUME_GAME",
]);

function foundationScore(action: GameAction): {
  score: number;
  policy: string;
} {
  switch (action.type) {
    case "CHOOSE_PENDING_ROLL":
      return { score: 1_200, policy: "mandatory.keep-roll" };
    case "CHOOSE_OPTION":
    case "CHOOSE_ABILITY_TARGET":
    case "RESOLVE_COMBAT_DISCARD":
    case "RESOLVE_DECK_SEARCH":
    case "RESOLVE_VISIT_STEP":
    // After-combat gates: answer immediately so the map never freezes with a
    // computer-owned necromancy / first-aid window and no scored pick.
    case "SKIP_NECROMANCY":
    case "COMMANDER_FIRST_AID":
    case "CONTINUE_NEUTRAL_STEP":
      return { score: 1_100, policy: "mandatory.resolve-choice" };
    case "PASS_REACTION":
      return { score: 1_050, policy: "safe.pass-reaction" };
    // Locking a town directly always beats (re)rolling town options: in draft
    // CHOOSE_TOWN accepts any untaken town with no roll, and in random-choice
    // it consumes the rolled pair — so the roll actions are only ever taken
    // when the format makes them mandatory (nothing to choose yet).
    case "CHOOSE_TOWN":
      return { score: 1_010, policy: "setup.lock-town" };
    case "RANDOM_ASSIGN_SEAT":
    case "BAN_HERO":
      return { score: 1_000, policy: "setup.complete-seat" };
    // Free/draft hero claims are biased by the community hero tier list, in a
    // band (±8) that stays strictly inside the 990 (roll) … 1010 (lock-town)
    // neighbors. Equal-tier heroes remain exact ties, so the seeded tie hash
    // still varies picks between games; a seat pinned by the human via
    // SET_COMPUTER_SEAT_FACTION never reaches this scorer at all
    // (computerDecisionOwner skips fully-picked seats, and the pin action
    // itself is NEVER_AUTOMATE).
    case "CHOOSE_FACTION":
      return {
        score: 1_000 + heroPickBias(action.heroDefId),
        policy: "setup.complete-seat",
      };
    case "ROLL_TOWN_OPTIONS":
    case "ROLL_HERO_OPTIONS":
      return { score: 990, policy: "setup.roll-options" };
    // Deploy every placeable unit before finishing placement — FINISH is only
    // offered once at least one unit is down, and stops being the pick only
    // when no unplaced unit remains (PLACE offers exist for unplaced units).
    case "PLACE_COMBAT_UNIT":
      return { score: 920, policy: "combat.place-unit" };
    case "ACKNOWLEDGE_COMBAT_END":
    case "FINISH_COMBAT_PLACEMENT":
    case "FINISH_NEUTRAL_PLACEMENT":
    case "FINISH_TACTICS":
    case "ACCEPT_COMBAT":
      return { score: 900, policy: "mandatory.finish-stage" };
    case "END_COMBAT_ROUND":
      return { score: 890, policy: "mandatory.finish-combat-round" };
    case "REFRESH_HAND":
    case "OPENING_HAND_MULLIGAN":
    case "RESOLVE_EXPLORERS_DISCARD":
      return { score: 850, policy: "mandatory.start-turn" };
    case "ATTACK_UNIT":
    case "MOVE_AND_ATTACK_UNIT":
    case "ATTACK_FORTIFICATION":
      return { score: 700, policy: "foundation.take-attack" };
    case "DEFEND_UNIT":
      return { score: 500, policy: "safe.defend" };
    case "END_ACTIVATION":
      return { score: 400, policy: "safe.end-activation" };
    // Fight the neutral combat on rather than burning cards or retreating: the
    // continue costs 1 MP and is the rulebook default for a fighter that can
    // still win. Scored above generic card plays (0) so a +Movement card in the
    // window is never spent by the fallback.
    case "CONTINUE_NEUTRAL_COMBAT":
      return { score: 350, policy: "combat.continue" };
    case "COMPLETE_SIMULTANEOUS_TURN":
    case "END_TURN":
      return { score: 300, policy: "safe.end-turn" };
    case "UNPLACE_COMBAT_UNIT":
      return { score: -100, policy: "safe.never-unplace" };
    case "RETREAT_FROM_COMBAT":
    case "SURRENDER_COMBAT":
    case "GIVE_UP_COMBAT":
    case "GIVE_UP":
      return { score: -900, policy: "last-resort.exit" };
    default:
      return { score: 0, policy: "foundation.stable-fallback" };
  }
}

function tieValue(seed: string, action: LegalAction): number {
  const text = `${seed}|${canonicalActionKey(action.action)}`;
  let hash = 2_166_136_261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

/**
 * Voluntary mulligan tuning. The start-of-turn refresh draws back UP TO the
 * hand limit after the discards, and drawCardsForPlayer reshuffles the discard
 * pile into an empty deck — so cycling a junk card is a free exchange for a
 * fresh draw (round 1 even returns it to the own deck's bottom). Every seat
 * cycles true junk; a Necropolis seat that does not yet HOLD a playable
 * Necromancy card (the printed ability or a Vidomina specialty — both are
 * NECROMANCY_REINFORCE) digs harder for its faction engine.
 */
const VOLUNTARY_CYCLE_MAX = 3;
const JUNK_CYCLE_THRESHOLD = 30;
const NECROMANCY_HUNT_THRESHOLD = 46;

function holdsPlayableNecromancy(
  observation: ComputerObservation,
): boolean {
  const player = observation.state.players[observation.playerId];
  if (!player) return false;
  // A Necropolis hero may play ANY Necromancy copy in hand — the printed board
  // card OR one searched/drawn from the shared Ability deck (wiki p.24; only a
  // NON-Necropolis holder keeps an unplayable copy). Holding any counts as the
  // faction engine being in hand, so the mulligan hunt ends.
  return player.hand.some(
    (cardId) => cardLibrary[cardId]?.effect.type === "NECROMANCY_REINFORCE",
  );
}

function wantsOpeningNecromancy(observation: ComputerObservation): boolean {
  const state = observation.state as unknown as GameState;
  if (state.round !== 1 || !hasNecromancyPlan(state, observation.playerId)) return false;
  const player = state.players[observation.playerId];
  const upgrades = player.army.filter(unit => unit.side === "few" &&
    ["necropolis.wraiths", "necropolis.zombies"].includes(unit.unitDefId)).length;
  const held = player.hand.filter(id => cardLibrary[id]?.effect.type === "NECROMANCY_REINFORCE").length;
  // Keep the first copy and dig for the second: two opening victories can
  // pay for both remaining Bronze Packs, not just the Wraith.
  return upgrades > 0 && held < Math.min(2, upgrades);
}

function voluntaryCycleThreshold(observation: ComputerObservation): number {
  const player = observation.state.players[observation.playerId];
  if (
    player?.factionId === "necropolis" &&
    !holdsPlayableNecromancy(observation)
  ) {
    return NECROMANCY_HUNT_THRESHOLD;
  }
  return JUNK_CYCLE_THRESHOLD;
}

/**
 * REFRESH_HAND is offered as a bare template (discardCardIds: []), but a hand
 * over the limit MUST discard down in the same action (the handler rejects an
 * insufficient list). Deterministic pick: lowest cardHandValue first (dump
 * junk, keep artifacts/spells/saves), with stable hand-order ties. On top of
 * the forced overflow, the AI voluntarily cycles low-value cards — on every
 * refresh window, not just an over-limit one, so a planned fight or the
 * Necropolis engine hunt can rebuild the hand — bounded by
 * VOLUNTARY_CYCLE_MAX (or the hand limit when hunting/fight-prepping) and by
 * the real replacement supply deckCount+discard, so an empty library never
 * churns the same cards. effectiveHandLimit only reads public fields plus the
 * viewer's own hand, so the redacted view is a safe stand-in for the state.
 */
function withRefreshDiscards(
  observation: ComputerObservation,
  action: Extract<GameAction, { type: "REFRESH_HAND" | "OPENING_HAND_MULLIGAN" }>,
): GameAction {
  const player = observation.state.players[observation.playerId];
  if (!player) {
    return action;
  }
  const limit = effectiveHandLimit(
    observation.state as unknown as GameState,
    observation.playerId,
  );
  const overflow = action.type === "REFRESH_HAND" ? Math.max(0, player.hand.length - limit) : 0;
  const state = observation.state as unknown as GameState;
  // Respect draw-before-discard Explorers and the separate full opening mulligan.
  if (action.type === "REFRESH_HAND" && !player.needsHandRefresh &&
      (explorersHandStepActive(state) || (state.round === 1 && player.hand.length >= limit))) return action;
  // A nearby opponent makes keeping a battle hand more urgent than an
  // opening full-hand search for Necromancy.
  const openingNecromancyHunt = upcomingFight(observation)?.kind !== "pvp" && wantsOpeningNecromancy(observation);
  const necromancyHunt = hasNecromancyPlan(state, observation.playerId) && !holdsPlayableNecromancy(observation) &&
    player.army.some(unit=>unit.side==="few" && unit.unitDefId.startsWith("necropolis."));
  const openingArrowHunt = state.round <= 4 && Boolean(state.adventure) &&
    !player.hand.includes("spell.magic_arrow") && !player.spellBook?.includes("spell.magic_arrow");
  const prepareFight = !explorersHandStepActive(state) && (Boolean(upcomingFight(observation)) || openingArrowHunt);
  // Sandro needs his Skeleton overlay before the first Far fight. Keep one
  // natural Arrow, but cycle duplicate copies when they crowd out that card.
  // Never apply this opening search to an imminent player battle.
  const sandroSpecialtyHunt = player.heroDefId === "sandro" && state.round <= 5 &&
    upcomingFight(observation)?.kind !== "pvp" && !player.hand.includes("specialty.sandro.1") &&
    player.army.some(unit => unit.unitDefId === "necropolis.skeletons" && unit.side === "pack");
  const redundantSandroArrow = (cardId: string, index: number) => sandroSpecialtyHunt &&
    cardId === "spell.magic_arrow" && player.hand.indexOf(cardId) !== index;
  const ranked = player.hand
    .map((cardId, index) => ({
      cardId,
      index,
      value: redundantSandroArrow(cardId, index) || openingArrowHunt && cardId === "stat.knowledge" && player.hand.indexOf(cardId) !== index
        ? 30 : cardHandValue(cardId, observation),
    }))
    .sort((a, b) => a.value - b.value || a.index - b.index);
  const discards = ranked.slice(0, overflow);

  // Keep ONE Defense card before a fight when a fragile army unit will need the
  // protection (user lesson 2026-09-18, live tutoring: don't dump Defense with a
  // fragile Wraith going into combat — a Defense card can turn an otherwise-lethal
  // hit into survival on such a body). Mirrors the magic_arrow keep below; only
  // the FIRST Defense is spared, so duplicates still cycle, and only when a fight
  // is being prepared and the army holds a unit a Defense card meaningfully saves
  // (low health AND low printed defense). Never blocks a forced over-limit discard.
  const fragileAllyNeedsDefense = prepareFight && player.army.some((armyUnit) => {
    const stats = getUnitSide(armyUnit.unitDefId, armyUnit.side);
    return Boolean(stats) && stats!.health <= 4 && stats!.defense <= 1;
  });
  let defenseKept = false;

  const orphanedMagic = ranked.some(entry => entry.value <= 12 &&
    ["ADD_SPELL_POWER", "RECALL_SPELL", "SET_SPELL_POWER_MAX"].includes(cardLibrary[entry.cardId]?.effect.type));
  // The Necromancy hunt must stay below cardHandValue's explicit keep floors
  // (Learning / First Aid Tent / Diplomacy at 70) or it dumps exactly the
  // cards the fight-preparation valuation just protected.
  const threshold = openingNecromancyHunt ? Infinity : necromancyHunt || openingArrowHunt ? 70 : prepareFight ? 50 : voluntaryCycleThreshold(observation);
  // Underfilled hands already consume replacement cards before any cycling.
  const supply = Math.max(0, (player.deckCount ?? 0) + player.discard.length -
    (action.type === "REFRESH_HAND" ? Math.max(0, limit - player.hand.length) : 0));
  for (const entry of ranked.slice(overflow)) {
    const voluntary = discards.length - overflow;
    if (voluntary >= (openingNecromancyHunt || prepareFight || orphanedMagic ? limit : VOLUNTARY_CYCLE_MAX) || voluntary >= supply) break;
    if ((entry.cardId === "spell.magic_arrow" && !redundantSandroArrow(entry.cardId, entry.index)) ||
        cardLibrary[entry.cardId]?.effect.type === "NECROMANCY_REINFORCE") continue;
    if (fragileAllyNeedsDefense && !defenseKept &&
        cardLibrary[entry.cardId]?.statisticType === "defense") {
      defenseKept = true;
      continue;
    }
    if (entry.value >= threshold) break;
    discards.push(entry);
  }
  if (discards.length === 0) {
    return action;
  }
  return {
    ...action,
    discardCardIds: discards.map((entry) => entry.cardId),
  };
}

/**
 * Offline self-play knobs. Production callers pass nothing: the chooser stays
 * the deterministic policy with every committed learned model applied.
 */
export type ChooseComputerActionOptions = {
  /** Which committed learned models bias close choices (default "all"). */
  learned?: LearnedModelSelection;
  /** Offline A/B candidate; omitted in live games to use the shipped model. */
  candidateModel?: ReplayPolicyModel;
  /**
   * Self-play exploration: with probability `rate` pick uniformly among the
   * CLOSE candidates (same action type, within the learned-bias band, above
   * the safety floor) instead of the top one. Exploration can never reach a
   * mandatory exit, a lethal-save band or a rejected action — those are
   * outside the band by construction, exactly like the learned bias.
   */
  explore?: { rate: number; random: () => number };
  /**
   * Self-play instrumentation: receives the close candidate set (best first,
   * learned bias applied) whenever more than one candidate is close. Lets an
   * offline lab roll each alternative out; never changes the decision.
   */
  onClose?: (close: ReadonlyArray<GameAction>) => void;
  /** Offline engine search: compare a real card play with a board action. */
  onTacticalCandidates?: (candidates: ReadonlyArray<GameAction>) => void;
};

/**
 * Total deterministic policy. Context policies handle strategic decisions and
 * the foundation score remains the terminating fallback for every legal set.
 */
export function chooseComputerAction(
  observation: ComputerObservation,
  options: ChooseComputerActionOptions = {},
): ComputerDecision | null {
  // Every scorer below reads the same immutable seat view; share the expensive
  // map derivations (objectives, distance fields, guard checks) across all
  // candidate actions of this one decision instead of rebuilding them per action.
  return withMapScoringCache(observation.state as unknown as GameState, () =>
    chooseComputerActionUncached(observation, options));
}

function chooseComputerActionUncached(
  observation: ComputerObservation,
  options: ChooseComputerActionOptions,
): ComputerDecision | null {
  const candidates = observation.legalActions.filter(
    (legal) =>
      !NEVER_AUTOMATE.has(legal.action.type) &&
      // The bare morale-redraw template needs a non-empty discard list — the
      // reducer rejects an empty one, so with no junk to swap the action must
      // be structurally off the table (a score floor is only relative and the
      // redraw can be the window's ONLY morale option).
      !(legal.action.type === "SPEND_MORALE" &&
        legal.action.benefit === "redraw" &&
        moraleRedrawDiscards(observation).length === 0),
  );
  if (candidates.length === 0) {
    return null;
  }
  const tieSeed = `${observation.state.seed}|${observation.state.round}|${observation.state.eventCounter ?? 0}|${observation.playerId}`;
  const withdraw = observation.state.combat && openingGuardCommitment(observation.state as unknown as GameState,
    observation.playerId, observation.state.combat) === "retreat";
  const vouchers = observation.state.players[observation.playerId]?.recruitDiscounts ?? [];
  const ranked = candidates
    .map((legal) => {
      // Priority: mandatory choices → cards/spells/reactions → combat → map →
      // foundation. Each scorer returns null for actions it does not handle.
      const strategic =
        scoreChoiceAction(observation, legal.action) ??
        scoreCardAction(observation, legal.action) ??
        scoreCombatAction(observation, legal.action) ??
        scoreMapAction(observation, legal.action);
      const base = strategic ?? foundationScore(legal.action);
      const planBias = base.score > 300 &&
        (base.score < 900 || legal.action.type === "BUILD_STRUCTURE")
        ? developmentPlanBias(observation.state as unknown as GameState, observation.playerId, legal.action, observation.memory?.developmentPlan) : 0;
      const scored = { ...base, score: base.score + planBias };
      if (withdraw && legal.action.type === "RETREAT_FROM_COMBAT") {
        scored.score = 2_000;
        scored.policy = "combat.leave-two-armored-guards";
      }
      if (withdraw && ["PLAY_CARD", "PLAY_REACTION", "CAST_SPELL"].includes(legal.action.type)) {
        scored.score = 100;
        scored.policy = "combat.preserve-hand-for-next-guard";
      }
      if (base.score > 300 && legal.action.type === "POPULATION_ACTION" && legal.action.purchases.some(purchase =>
        vouchers.some(({ target }) => target.kind === purchase.kind && (target.kind === "recruit"
          ? target.unitDefId === purchase.unitDefId
          : purchase.kind !== "recruit" && target.armyUnitId === purchase.armyUnitId)))) {
        scored.score = Math.max(scored.score, 1_090);
        scored.policy = "card.spend-legion-before-moving";
      }
      if ((legal.action.type === "REFRESH_HAND" || legal.action.type === "OPENING_HAND_MULLIGAN") && upcomingFight(observation) &&
          !explorersHandStepActive(observation.state as unknown as GameState)) {
        scored.score = 1_040;
        scored.policy = "card.refresh-before-fight";
      }
      if ((legal.action.type === "REFRESH_HAND" || legal.action.type === "OPENING_HAND_MULLIGAN") &&
          wantsOpeningNecromancy(observation)) {
        scored.score = 1_045;
        scored.policy = "card.opening-necromancy-hunt";
      }
      // Preserve returns toward a concrete payoff and forced unblocking, but
      // A real remaining discovery doorway is productive too; its distance
      // must decrease just like a pickup's. A score alone never exempts a loop.
      if (repeatsUnproductiveRoute(observation.state as unknown as GameState, observation.playerId, legal.action, observation.memory) &&
          base.policy !== "map.clear-shared-space" &&
          !(base.score > 300 && returnsTowardPayoff(observation, legal.action))) {
        scored.score = 100;
        scored.policy = "map.replan-repeated-route";
      }
      // A computer under human attack must exhaust every useful, finite
      // pre-battle preparation it can legally make before readying up. The prep
      // action set contains town purchases and map-card plays only; destructive
      // permanent discards stay below this floor. Once those actions consume
      // their card/token/resource and disappear, Accept becomes the winner.
      const delayingPrepExit =
        Boolean(observation.state.combat?.prep) &&
        (
          legal.action.type === "ACCEPT_COMBAT" ||
          legal.action.type === "RETREAT_FROM_COMBAT" ||
          legal.action.type === "SURRENDER_COMBAT" ||
          legal.action.type === "GIVE_UP_COMBAT"
        );
      return {
        legal,
        ...scored,
        // Only ACCEPT sits AT the floor: the escapes must stay strictly below
        // it, or once no prep action remains the exit would be decided by the
        // tie hash and a healthy defender could retreat from a winnable fight.
        ...(delayingPrepExit
          ? legal.action.type === "ACCEPT_COMBAT"
            ? { score: 225, policy: "combat.prepare-before-exit" }
            : { score: Math.min(scored.score, 224), policy: "combat.prepare-before-exit" }
          : {}),
        tie: tieValue(tieSeed, legal),
      };
    });
  // Finish finite, useful card preparation before the march can start a fight.
  // Required choices, combat actions and emergency route clearing retain priority.
  const preparingFight = !observation.state.combat && upcomingFight(observation) && ranked.some(candidate =>
    candidate.score >= 1_000 && (candidate.legal.action.type === "PLAY_CARD" || candidate.legal.action.type === "CAST_SPELL"));
  if (preparingFight || ranked.some(candidate => candidate.policy === "card.spend-legion-before-moving")) {
    for (const candidate of ranked) {
      if ((candidate.legal.action.type === "MOVE_HERO" || candidate.legal.action.type === "MOVE_HERO_PATH" ||
          candidate.legal.action.type === "END_TURN") && candidate.policy !== "map.clear-shared-space") {
        candidate.score = Math.min(candidate.score, 950);
      }
    }
  }
  deferDiscretionarySpending(observation, ranked);
  refinePvpCombatSpellRound(observation, ranked);
  refineCombatShortlist(observation, ranked);
  ranked.sort(
      (a, b) =>
        b.score - a.score ||
        b.tie - a.tie ||
        canonicalActionKey(a.legal.action).localeCompare(
          canonicalActionKey(b.legal.action),
        ),
    );
  const selected = ranked[0];
  // Learned correlations only decide close choices of the SAME action type.
  // Never override a mandatory exit, lethal-save band, or safety rejection.
  const close = ranked.filter(candidate => candidate.legal.action.type === selected.legal.action.type && selected.score - candidate.score <= 12 && candidate.score > 300);
  const learnedModels = options.learned ?? "all";
  if (learnedModels !== "none") {
    for (const candidate of close) candidate.score += learnedActionBias(observation, candidate.legal.action, learnedModels, options.candidateModel);
  }
  close.sort((a, b) => b.score - a.score || b.tie - a.tie);
  let learnedSelected = close[0] ?? selected;
  if (close.length > 1) options.onClose?.(close.map(candidate => candidate.legal.action));
  const explore = options.explore;
  if (explore && close.length > 1 && explore.rate > 0 && explore.random() < explore.rate) {
    const pick = Math.min(close.length - 1, Math.max(0, Math.floor(explore.random() * close.length)));
    learnedSelected = { ...close[pick], policy: `explore:${close[pick].policy}` };
  }
  const action =
    learnedSelected.legal.action.type === "REFRESH_HAND" || learnedSelected.legal.action.type === "OPENING_HAND_MULLIGAN"
      ? withRefreshDiscards(observation, learnedSelected.legal.action)
      : learnedSelected.legal.action.type === "SPEND_MORALE"
        ? withMoraleRedrawDiscards(observation, learnedSelected.legal.action)
        : learnedSelected.legal.action;
  const tacticalTypes = new Set<GameAction["type"]>([
    "ATTACK_UNIT", "MOVE_AND_ATTACK_UNIT", "MOVE_UNIT", "DEFEND_UNIT",
    "PLAY_CARD", "CAST_SPELL", "PLAY_REACTION", "PASS_REACTION",
  ]);
  if (options.onTacticalCandidates && observation.state.combat && tacticalTypes.has(action.type)) {
    // Keep the chosen move first, then one contender of each kind (a card
    // must not disappear behind dozens of near-identical movement squares).
    const choices = ranked.filter(candidate => tacticalTypes.has(candidate.legal.action.type) && candidate.score > 300);
    const alternatives: GameAction[] = [action];
    const chosenKey = canonicalActionKey(action);
    const cardTypes = new Set<GameAction["type"]>(["PLAY_CARD", "CAST_SPELL", "PLAY_REACTION"]);
    const crossKind = choices.find(candidate => canonicalActionKey(candidate.legal.action) !== chosenKey &&
      cardTypes.has(candidate.legal.action.type) !== cardTypes.has(action.type));
    if (crossKind) alternatives.push(crossKind.legal.action);
    const sameKind = choices.find(candidate => candidate.legal.action.type === action.type &&
      canonicalActionKey(candidate.legal.action) !== chosenKey);
    if (sameKind) alternatives.push(sameKind.legal.action);
    for (const type of tacticalTypes) {
      const candidate = choices.find(candidate => candidate.legal.action.type === type);
      if (candidate && !alternatives.some(action => canonicalActionKey(action) === canonicalActionKey(candidate.legal.action))) alternatives.push(candidate.legal.action);
    }
    options.onTacticalCandidates(alternatives);
  }
  return {
    playerId: observation.playerId,
    action,
    policy:
      candidates.length === 1 ? "forced.only-legal-action" : learnedSelected.policy,
    score: learnedSelected.score,
  };
}
