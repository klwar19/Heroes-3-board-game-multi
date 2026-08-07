/**
 * POLISH SET ARTIFACTS (`polish-set-artifacts`, default OFF in BOTH binh and
 * legacy) — the read layer.
 *
 * A player's PIECE COUNT for a set is how many DISTINCT member Artifact cards
 * they still own, ANYWHERE in their own card pool. With N pieces every listed
 * effect up to the "N pieces" row is active simultaneously (2 pieces = the first
 * effect, 3 = the first two, …).
 *
 * DELIBERATE READING of the user's "your whole Deck (deck, hand, discard)": an
 * in-play PERMANENT (Eversmoking Ring of Sulfur, Endless Purse of Gold …) and a
 * card held in the Ongoing tray still COUNT. Losing a set bonus by PLAYING one
 * of its members would be absurd, and those two zones are exactly where a played
 * artifact lives instead of the discard. Cards REMOVED from the game never
 * count — they are gone.
 *
 * This is a LEAF module: it imports only the state types, the house-rule gate
 * and the set data, so every heavy consumer (adventure, reducer, legal-actions,
 * player-view) can import it with no cycle. In particular it deliberately
 * re-implements the `permanents ?? permanent` fallback instead of importing
 * `getPermanentCardIds` (permanents.ts imports adventure.ts).
 *
 * Rule OFF ⇒ every export returns 0 / [] / false and no consumer changes a
 * thing, so a default table and every legacy snapshot are byte-identical.
 */

import {
  ARTIFACT_SETS,
  ARTIFACT_SET_BY_ID,
  artifactSetDefinition,
  type ArtifactSetDefinition,
  type ArtifactSetId,
  type ArtifactSetTier
} from "@/data/cards/artifact-sets";
import { houseRuleEnabled } from "./house-rules";
import type { CardId, GameState, PlayerId, PlayerState, ResourceKind } from "./state";

export type { ArtifactSetId, ArtifactSetDefinition, ArtifactSetTier };
export { ARTIFACT_SETS, ARTIFACT_SET_BY_ID, artifactSetDefinition };

/**
 * The PUBLIC per-player derivation the UI reads. Mirrored onto every player view
 * (see `getPlayerView`) so EVERY seat can see how far along each opponent's set
 * is — the user's explicit "put them on 'ongoing' effects to be seen all the time
 * for every player".
 *
 * DESIGNED LEAK: this reveals that N members of a set sit SOMEWHERE in a
 * player's pool, including their private deck and hand. It never reveals WHICH
 * zone, WHICH member cards, or anything about the rest of those zones.
 */
export type ArtifactSetStatus = {
  setId: ArtifactSetId;
  /** Distinct member cards owned (deck + hand + discard + permanents + ongoing). */
  pieces: number;
  /** How many of the set's listed effects are live (0 below 2 pieces). */
  activeTiers: number;
  /** The set's total member count in this game, so a UI can render "3 / 6". */
  memberCount: number;
};

/** Whether the Set Artifacts house rule is ON for this game. */
export function setArtifactsEnabled(state: Pick<GameState, "ruleset" | "adventure">): boolean {
  return houseRuleEnabled(state, "polish-set-artifacts");
}

/**
 * Every zone in which a player still OWNS a card for set-counting purposes.
 * `removed` is deliberately absent (a removed copy is out of the game).
 */
function ownedCardIds(player: PlayerState): CardId[] {
  const permanents = player.permanents ?? (player.permanent ? [player.permanent] : []);
  return [
    ...player.deck,
    ...player.hand,
    ...player.discard,
    ...permanents,
    ...(player.ongoingCards ?? []).map((entry) => entry.cardId)
  ];
}

/**
 * How many DISTINCT members of `setId` the player owns. 0 when the rule is off,
 * the player is unknown, or the set id is unknown.
 */
export function artifactSetPieceCount(state: GameState, playerId: PlayerId, setId: string): number {
  if (!setArtifactsEnabled(state)) {
    return 0;
  }
  const set = artifactSetDefinition(setId);
  const player = state.players[playerId];
  if (!set || !player) {
    return 0;
  }
  const owned = new Set(ownedCardIds(player));
  return set.members.reduce((total, member) => total + (owned.has(member) ? 1 : 0), 0);
}

/** How many tiers `pieces` activates for a set (pure — no state). */
export function activeTiersForPieces(set: ArtifactSetDefinition, pieces: number): number {
  if (pieces < 2) {
    return 0;
  }
  return set.tiers.reduce((total, tier) => total + (pieces >= tier.threshold ? 1 : 0), 0);
}

/** How many of `setId`'s effects are live for this player right now. */
export function artifactSetActiveTierCount(state: GameState, playerId: PlayerId, setId: string): number {
  const set = artifactSetDefinition(setId);
  if (!set) {
    return 0;
  }
  return activeTiersForPieces(set, artifactSetPieceCount(state, playerId, setId));
}

/** Whether the tier that switches on at `threshold` pieces is live. */
export function artifactSetTierIsActive(
  state: GameState,
  playerId: PlayerId,
  setId: string,
  threshold: number
): boolean {
  return artifactSetPieceCount(state, playerId, setId) >= threshold;
}

/** The player's live tiers of `setId`, in printed order. */
export function activeArtifactSetTiers(state: GameState, playerId: PlayerId, setId: string): ArtifactSetTier[] {
  const set = artifactSetDefinition(setId);
  if (!set) {
    return [];
  }
  const pieces = artifactSetPieceCount(state, playerId, setId);
  return pieces < 2 ? [] : set.tiers.filter((tier) => pieces >= tier.threshold);
}

/**
 * The whole public status list for a player — every set with at least ONE piece
 * owned (a set the player has no piece of is simply absent, keeping the payload
 * small). Empty when the rule is off.
 */
export function playerArtifactSetStatuses(state: GameState, playerId: PlayerId): ArtifactSetStatus[] {
  if (!setArtifactsEnabled(state)) {
    return [];
  }
  const statuses: ArtifactSetStatus[] = [];
  for (const set of ARTIFACT_SETS) {
    const pieces = artifactSetPieceCount(state, playerId, set.id);
    if (pieces <= 0) {
      continue;
    }
    statuses.push({
      setId: set.id,
      pieces,
      activeTiers: activeTiersForPieces(set, pieces),
      memberCount: set.members.length
    });
  }
  return statuses;
}

// ===========================================================================
// Use tracking — per COMBAT and per GAME ROUND
// ===========================================================================

/** The ledger key for one set-tier ("angelic_alliance:3"). */
export function artifactSetUseKey(setId: string, threshold: number): string {
  return `${setId}:${threshold}`;
}

/** Whether the once-per-COMBAT charge of this set-tier is still unspent. */
export function artifactSetCombatUseAvailable(
  state: GameState,
  playerId: PlayerId,
  setId: string,
  threshold: number
): boolean {
  const used = state.players[playerId]?.combatStats.artifactSetUsesThisCombat ?? [];
  return !used.includes(artifactSetUseKey(setId, threshold));
}

/** Spend the once-per-COMBAT charge of this set-tier. */
export function markArtifactSetCombatUse(
  state: GameState,
  playerId: PlayerId,
  setId: string,
  threshold: number
): void {
  const stats = state.players[playerId]?.combatStats;
  if (!stats) {
    return;
  }
  const key = artifactSetUseKey(setId, threshold);
  const used = stats.artifactSetUsesThisCombat ?? [];
  if (!used.includes(key)) {
    stats.artifactSetUsesThisCombat = [...used, key];
  }
}

/**
 * Whether the once-per-GAME-ROUND charge is still unspent. Uses the
 * stamp-the-round idiom (`unitDrillRound` precedent): no reset code, and an
 * absent record means never used.
 */
export function artifactSetRoundUseAvailable(
  state: GameState,
  playerId: PlayerId,
  setId: string,
  threshold: number
): boolean {
  const stamps = state.players[playerId]?.artifactSetRoundUses;
  return stamps?.[artifactSetUseKey(setId, threshold)] !== state.round;
}

/** Spend the once-per-GAME-ROUND charge of this set-tier. */
export function markArtifactSetRoundUse(
  state: GameState,
  playerId: PlayerId,
  setId: string,
  threshold: number
): void {
  const player = state.players[playerId];
  if (!player) {
    return;
  }
  player.artifactSetRoundUses = {
    ...(player.artifactSetRoundUses ?? {}),
    [artifactSetUseKey(setId, threshold)]: state.round
  };
}

/** Whether this tier's charge (per its `limit`) is available right now. */
export function artifactSetTierUseAvailable(
  state: GameState,
  playerId: PlayerId,
  setId: string,
  tier: ArtifactSetTier
): boolean {
  if (tier.limit === "passive") {
    return false;
  }
  return tier.limit === "combat"
    ? artifactSetCombatUseAvailable(state, playerId, setId, tier.threshold)
    : artifactSetRoundUseAvailable(state, playerId, setId, tier.threshold);
}

/** Spend this tier's charge (per its `limit`). */
export function markArtifactSetTierUse(
  state: GameState,
  playerId: PlayerId,
  setId: string,
  tier: ArtifactSetTier
): void {
  if (tier.limit === "combat") {
    markArtifactSetCombatUse(state, playerId, setId, tier.threshold);
  } else if (tier.limit === "game-round") {
    markArtifactSetRoundUse(state, playerId, setId, tier.threshold);
  }
}

// ===========================================================================
// The per-set unit selection ("select 1 of your units")
// ===========================================================================

/** The unit this player selected for `setId` in the current combat (if any). */
export function artifactSetSelectedUnitId(state: GameState, playerId: PlayerId, setId: string): string | undefined {
  return state.players[playerId]?.combatStats.artifactSetSelections?.[setId];
}

/** Record the selection for `setId`. */
export function setArtifactSetSelection(state: GameState, playerId: PlayerId, setId: string, unitId: string): void {
  const stats = state.players[playerId]?.combatStats;
  if (!stats) {
    return;
  }
  stats.artifactSetSelections = { ...(stats.artifactSetSelections ?? {}), [setId]: unitId };
}

/** The set's `select-unit` tier, if it has one and the player has it active. */
export function activeSelectionTier(state: GameState, playerId: PlayerId, setId: string): ArtifactSetTier | undefined {
  return activeArtifactSetTiers(state, playerId, setId).find((tier) => tier.effect.kind === "select-unit");
}

// ===========================================================================
// Passive folds (no action, no charge)
// ===========================================================================

/**
 * Power of the Dragon Father tiers 4 + 7: "all of your units suffer N DM less
 * from Spells". Summed and folded at `totalSpellDamageReduction`, the ONE spell
 * damage chokepoint, so every Spell-damage path (direct, area, bolt) sees it.
 * Combat-scoped by its printed text — returns 0 outside a combat.
 */
export function artifactSetSpellDamageReduction(state: GameState, playerId: PlayerId): number {
  if (!setArtifactsEnabled(state) || !state.combat) {
    return 0;
  }
  let total = 0;
  for (const set of ARTIFACT_SETS) {
    for (const tier of activeArtifactSetTiers(state, playerId, set.id)) {
      if (tier.effect.kind === "spell-damage-reduction") {
        total += tier.effect.amount;
      }
    }
  }
  return total;
}

/**
 * Pendant of Reflection tier 2: the FIRST Spell an enemy casts against this
 * holder each combat resolves at −1 Spell Power. Returns the drain to subtract
 * from `casterPlayerId`'s resolved Power — summed over every OPPONENT in the
 * current combat who holds the set and still has the charge.
 *
 * AUTO-APPLIED, never an optional pick (the Magic-Mirror "auto-USE" precedent):
 * draining an enemy cast is never worse for the holder, so a window would be a
 * pure click-tax and a freeze risk. The charge is spent by
 * `markArtifactSetSpellDrain` once the cast actually resolves, so the preview
 * and the resolve agree.
 */
export function artifactSetEnemySpellPowerDrain(state: GameState, casterPlayerId: PlayerId): number {
  if (!setArtifactsEnabled(state) || !state.combat) {
    return 0;
  }
  let total = 0;
  for (const holderId of [state.combat.attackerPlayerId, state.combat.defenderPlayerId]) {
    if (holderId === casterPlayerId) {
      continue;
    }
    for (const set of ARTIFACT_SETS) {
      for (const tier of activeArtifactSetTiers(state, holderId, set.id)) {
        if (
          tier.effect.kind === "enemy-spell-power-drain" &&
          artifactSetCombatUseAvailable(state, holderId, set.id, tier.threshold)
        ) {
          total += tier.effect.amount;
        }
      }
    }
  }
  return total;
}

/**
 * Spend every drain charge that applied to a cast by `casterPlayerId`. Called
 * once the cast has resolved (the `markEquipmentFirstSpellCast` precedent), so
 * the next enemy Spell this combat is undrained.
 */
export function markArtifactSetSpellDrain(state: GameState, casterPlayerId: PlayerId): void {
  if (!setArtifactsEnabled(state) || !state.combat) {
    return;
  }
  for (const holderId of [state.combat.attackerPlayerId, state.combat.defenderPlayerId]) {
    if (holderId === casterPlayerId) {
      continue;
    }
    for (const set of ARTIFACT_SETS) {
      for (const tier of activeArtifactSetTiers(state, holderId, set.id)) {
        if (
          tier.effect.kind === "enemy-spell-power-drain" &&
          artifactSetCombatUseAvailable(state, holderId, set.id, tier.threshold)
        ) {
          markArtifactSetCombatUse(state, holderId, set.id, tier.threshold);
        }
      }
    }
  }
}

/**
 * Cornucopia / Golden Goose income. `scope` picks which rows pay: "resource-round"
 * only on a Resources round, "every-round" at the start of EVERY round (the
 * printed wording differs between the two sets and this is that distinction).
 */
export function artifactSetIncome(
  state: GameState,
  playerId: PlayerId,
  scope: "resource-round" | "every-round"
): Partial<Record<ResourceKind, number>> {
  const gain: Partial<Record<ResourceKind, number>> = {};
  if (!setArtifactsEnabled(state)) {
    return gain;
  }
  for (const set of ARTIFACT_SETS) {
    for (const tier of activeArtifactSetTiers(state, playerId, set.id)) {
      if (tier.effect.kind === "income" && tier.effect.scope === scope) {
        gain[tier.effect.resource] = (gain[tier.effect.resource] ?? 0) + tier.effect.amount;
      }
    }
  }
  return gain;
}

/**
 * Statue of Legion: the once-per-GAME-ROUND flat gold discount on ONE
 * recruit/reinforce, = the number of active `recruit-discount` tiers (5 pieces
 * ⇒ −4 gold). 0 once the round's discount has been spent, so the affordability
 * read, the offer label and the actual spend all agree.
 *
 * It stacks with Legion vouchers by ADDITION at the shared
 * `totalRecruitGoldDiscount` seam — deliberately: the set's members ARE the
 * Legion pieces, and playing one as a voucher leaves it in the discard where it
 * still counts toward the set.
 */
export function artifactSetRecruitGoldDiscount(state: GameState, playerId: PlayerId): number {
  if (!setArtifactsEnabled(state)) {
    return 0;
  }
  let total = 0;
  for (const set of ARTIFACT_SETS) {
    // ONE shared once-per-round charge PER SET: the set's first tier holds the
    // charge, and its later tiers only make that same discount bigger. Checked
    // per set (not globally) so a future second discount set is independent.
    if (!artifactSetRoundUseAvailable(state, playerId, set.id, 2)) {
      continue;
    }
    for (const tier of activeArtifactSetTiers(state, playerId, set.id)) {
      if (tier.effect.kind === "recruit-discount") {
        total += tier.effect.gold;
      }
    }
  }
  return total;
}

/** Spend the Statue of Legion round discount (called when a purchase lands). */
export function consumeArtifactSetRecruitDiscount(state: GameState, playerId: PlayerId): void {
  if (artifactSetRecruitGoldDiscount(state, playerId) <= 0) {
    return;
  }
  for (const set of ARTIFACT_SETS) {
    if (
      artifactSetRoundUseAvailable(state, playerId, set.id, 2) &&
      activeArtifactSetTiers(state, playerId, set.id).some((tier) => tier.effect.kind === "recruit-discount")
    ) {
      markArtifactSetRoundUse(state, playerId, set.id, 2);
    }
  }
}

// ===========================================================================
// Offers — the ONE derivation legal-actions renders and the reducer validates
// ===========================================================================

export type NeutralDeckTier = "bronze" | "silver" | "gold" | "azure";

/** One legal set-artifact activation, ready to be turned into a LegalAction. */
export type ArtifactSetOffer = {
  setId: ArtifactSetId;
  setName: string;
  /** The tier's piece threshold — the `tier` field of USE_ARTIFACT_SET_POWER. */
  threshold: number;
  tier: ArtifactSetTier;
  /** `select` ⇒ SELECT_ARTIFACT_SET_UNIT; `use` ⇒ USE_ARTIFACT_SET_POWER. */
  kind: "select" | "use";
  label: string;
  unitId?: string;
  neutralTier?: NeutralDeckTier;
};

const NEUTRAL_DECK_TIERS: readonly NeutralDeckTier[] = ["bronze", "silver", "gold", "azure"];

function gradeRankOf(unit: { grade?: string; bankUnit?: boolean; commanderSlug?: string }): number {
  // Mirrors legal-actions' / reducer's `gradeRankOfUnit`: a Creature Bank
  // defender and a WOG commander are TIERLESS, so they rank above every grade
  // and can never be reached by a tier-gated effect (Titan's Thunder tiers 2-3).
  // Tier 4 ("any tier") has no ceiling and DOES reach them.
  if (unit.bankUnit || unit.commanderSlug) {
    return Number.POSITIVE_INFINITY;
  }
  return unit.grade === "bronze" ? 0 : unit.grade === "silver" ? 1 : unit.grade === "gold" ? 2 : 3;
}

/** Whether `playerId` is one of the two sides of the open combat. */
function playerFightsCurrentCombat(state: GameState, playerId: PlayerId): boolean {
  const combat = state.combat;
  return Boolean(combat && (combat.attackerPlayerId === playerId || combat.defenderPlayerId === playerId));
}

/**
 * Every set-artifact activation `playerId` may legally take right now. THE one
 * derivation: `getLegalActions` renders these as offers and the reducer's two
 * handlers re-derive the same list to validate, so a forged or stale action can
 * never resolve.
 *
 * Every entry is OPTIONAL — the engine never opens a window of its own for a set
 * tier — so a seat that ignores every offer can never stall.
 */
export function artifactSetPowerOffers(state: GameState, playerId: PlayerId): ArtifactSetOffer[] {
  if (!setArtifactsEnabled(state)) {
    return [];
  }
  const offers: ArtifactSetOffer[] = [];
  const combat = state.combat;
  const inCombat = playerFightsCurrentCombat(state, playerId);
  const units = inCombat && combat ? Object.values(combat.units).filter((unit) => isAliveUnit(unit)) : [];
  const ownUnits = units.filter((unit) => unit.controllerId === playerId);
  const enemyUnits = units.filter((unit) => unit.controllerId !== playerId);

  for (const set of ARTIFACT_SETS) {
    for (const tier of activeArtifactSetTiers(state, playerId, set.id)) {
      if (tier.limit === "passive" || !artifactSetTierUseAvailable(state, playerId, set.id, tier)) {
        continue;
      }
      const base = { setId: set.id, setName: set.name, threshold: tier.threshold, tier } as const;

      if (tier.effect.kind === "select-unit") {
        // "At the beginning of the combat" — offered in combat ROUND 1 only, so
        // the granted Initiative genuinely shapes the whole fight instead of
        // being picked after the board is read. Optional and skippable.
        if (!inCombat || (combat?.round ?? 1) !== 1) {
          continue;
        }
        const candidates = tier.effect.side === "own" ? ownUnits : enemyUnits;
        for (const unit of candidates) {
          const sign = tier.effect.initiative >= 0 ? "+" : "";
          offers.push({
            ...base,
            kind: "select",
            label: `${set.name}: select ${unit.name} (${sign}${tier.effect.initiative} initiative this combat)`,
            unitId: unit.id
          });
        }
        continue;
      }

      if (tier.effect.kind === "neutral-scry") {
        // Map-side (the printed "once per turn"): never during a combat, and
        // only from a Neutral deck that actually has a card on top.
        if (combat) {
          continue;
        }
        for (const neutralTier of NEUTRAL_DECK_TIERS) {
          const deck = state.decks[`neutral-${neutralTier}`];
          if (!deck || deck.drawPile.length + deck.discardPile.length === 0) {
            continue;
          }
          offers.push({
            ...base,
            kind: "use",
            label: `${set.name}: look at the top ${neutralTier} Neutral card`,
            neutralTier
          });
        }
        continue;
      }

      if (tier.effect.kind === "draw-then-discard") {
        // Map-side (the printed "once per round"): the hand step is a map action,
        // and drawing mid-combat has no printed home.
        if (combat) {
          continue;
        }
        offers.push({ ...base, kind: "use", label: `${set.name}: ${tier.text}` });
        continue;
      }

      // Every remaining kind is a COMBAT activation aimed at a unit.
      if (!inCombat) {
        continue;
      }
      const targets = combatTargetsFor(state, playerId, set.id, tier, ownUnits, enemyUnits);
      for (const unit of targets) {
        offers.push({ ...base, kind: "use", label: `${set.name} (${tier.threshold}): ${tier.text} — ${unit.name}`, unitId: unit.id });
      }
    }
  }
  return offers;
}

/** Live units a combat tier may aim at, honouring its `target` and tier gate. */
function combatTargetsFor(
  state: GameState,
  playerId: PlayerId,
  setId: string,
  tier: ArtifactSetTier,
  ownUnits: { id: string; name: string; grade?: string; bankUnit?: boolean; commanderSlug?: string }[],
  enemyUnits: { id: string; name: string; grade?: string; bankUnit?: boolean; commanderSlug?: string }[]
): { id: string; name: string }[] {
  const selectedId = artifactSetSelectedUnitId(state, playerId, setId);
  let pool: { id: string; name: string; grade?: string; bankUnit?: boolean; commanderSlug?: string }[];
  switch (tier.target) {
    case "own":
      pool = ownUnits;
      break;
    case "enemy":
      pool = enemyUnits;
      break;
    case "selected-own":
      // Bound to this set's OWN selection tier — unusable until that pick is made.
      pool = selectedId ? ownUnits.filter((unit) => unit.id === selectedId) : [];
      break;
    case "selected-enemy":
      pool = selectedId ? enemyUnits.filter((unit) => unit.id === selectedId) : [];
      break;
    // `none` — a tier with no unit target. Today that is only the Pendant of
    // Reflection drain, which is AUTO-applied at the cast chokepoint and is
    // therefore deliberately never offered as an action.
    default:
      return [];
  }
  if (tier.effect.kind === "spell-zap" && tier.effect.maxGradeRank !== null) {
    const ceiling = tier.effect.maxGradeRank;
    pool = pool.filter((unit) => gradeRankOf(unit) <= ceiling);
  }
  return pool.map((unit) => ({ id: unit.id, name: unit.name }));
}

/** Local liveness read (keeps this module a leaf — mirrors `isUnitAlive`). */
function isAliveUnit(unit: { damage: number; maxHealth: number }): boolean {
  return unit.damage < unit.maxHealth;
}

/** Find the offer matching an incoming action, or undefined if it is illegal. */
export function findArtifactSetOffer(
  state: GameState,
  playerId: PlayerId,
  kind: "select" | "use",
  setId: string,
  threshold: number,
  unitId?: string,
  neutralTier?: NeutralDeckTier
): ArtifactSetOffer | undefined {
  return artifactSetPowerOffers(state, playerId).find(
    (offer) =>
      offer.kind === kind &&
      offer.setId === setId &&
      offer.threshold === threshold &&
      offer.unitId === unitId &&
      offer.neutralTier === neutralTier
  );
}

// ===========================================================================
// Tier-change bookkeeping (the feed events the UI half drives off)
// ===========================================================================

/**
 * Re-derive every live player's set tier counts and report the ones that MOVED.
 * Called from the `applyAction` tail; the caller emits the events (this module
 * stays event-free so it can stay a leaf). Returns [] when the rule is off, so
 * a default table never even walks the sets.
 */
export function syncArtifactSetTiers(
  state: GameState
): { playerId: PlayerId; setId: ArtifactSetId; pieces: number; tiers: number; previousTiers: number }[] {
  if (!setArtifactsEnabled(state)) {
    return [];
  }
  const changes: { playerId: PlayerId; setId: ArtifactSetId; pieces: number; tiers: number; previousTiers: number }[] =
    [];
  for (const player of Object.values(state.players)) {
    const previous = new Map((player.artifactSetStatus ?? []).map((entry) => [entry.setId, entry.activeTiers]));
    const next = playerArtifactSetStatuses(state, player.id);
    for (const status of next) {
      const before = previous.get(status.setId) ?? 0;
      if (before !== status.activeTiers) {
        changes.push({
          playerId: player.id,
          setId: status.setId,
          pieces: status.pieces,
          tiers: status.activeTiers,
          previousTiers: before
        });
      }
      previous.delete(status.setId);
    }
    // A set that dropped OUT of the list entirely (its last piece left the pool)
    // still owes a "lost the bonus" line.
    for (const [setId, before] of previous) {
      if (before > 0) {
        changes.push({
          playerId: player.id,
          setId: setId as ArtifactSetId,
          pieces: artifactSetPieceCount(state, player.id, setId),
          tiers: 0,
          previousTiers: before
        });
      }
    }
    player.artifactSetStatus = next;
  }
  return changes;
}
