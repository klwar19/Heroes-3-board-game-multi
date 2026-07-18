/**
 * Victory Points mode (designer-toggleable, rulebook scenario scoring).
 *
 * With VP mode ON (`CustomMapPreset.victoryPoints.enabled`) the game ENDS the
 * moment either trigger fires — the wrap of the round limit, OR any player
 * completing the Scenario's victory condition — and the player with the MOST
 * Victory Points wins. This module is the SCORING half: a pure `computeVictoryPoints`
 * that reads live state + the event-sourced ledger, plus the small ledger
 * mutators the combat/visit seams call to capture the "happened once, leaves no
 * trace" components (hero defeats, surrenders, Dragon Utopia defeats).
 *
 * The END TRIGGER + winner declaration live in `adventure.ts`
 * (`endGameByVictoryPoints`, wired into `declareAdventureWinner` and
 * `startAdventureRound`) so the VP winner funnels through the SAME
 * `declareAdventureWinner` machinery match-reporting / overlays already read.
 * Keeping the scoring pure here avoids an adventure.ts ↔ victory-points.ts cycle.
 *
 * Rulebook VP table (each engine-checkable component is scored below):
 *   - 3 VP / 1 VP for defeating a Main / Secondary Hero (Main once per opponent)
 *   - 1 VP for each surrendered (escaped-from-you) Hero
 *   - 1 VP for each Building in controlled Towns (8 VP max)
 *   - 1 VP for each Experience Level of the (main) Hero
 *   - 1 VP for each flagged Mine / Settlement
 *   - 1 VP for each 2 Artifacts (in the M&M deck AND removed from play)
 *   - X VP per additional scenario objective (designer-chosen)
 *   - the victory-condition completion VP (the completer only)
 */

import { cardLibrary } from "@/data/cards/library";
import { NEUTRAL_PLAYER_ID } from "./state";
import type {
  CustomMapPreset,
  CustomWinCondition,
  GameState,
  HeroState,
  PlayerId,
  PlayerState,
  TownState,
  VictoryPointObjective,
  VpLedgerEntry
} from "./state";

/** One scored line in a player's breakdown (only nonzero contributions get a row). */
export type VictoryPointRow = { label: string; vp: number };

/** One player's full VP breakdown (rows sum to `total`). */
export type VictoryPointBreakdown = { playerId: PlayerId; total: number; rows: VictoryPointRow[] };

/** The scoring result: per-player breakdown (winner first) + the winning seat. */
export type VictoryPointsResult = { breakdown: VictoryPointBreakdown[]; winnerId: PlayerId | null };

/** The resolved (enabled) VP config, or null when VP mode is off. */
export type VictoryPointsConfig = NonNullable<CustomMapPreset["victoryPoints"]>;

/** The default completion VP when a config omits `victoryConditionVp`. */
export const DEFAULT_VICTORY_CONDITION_VP = 3;

/** The VP config forced by the designed map, or null when VP mode is off. */
export function victoryPointsConfig(state: GameState): VictoryPointsConfig | null {
  const vp = state.adventure?.mapPreset?.victoryPoints;
  return vp?.enabled === true ? vp : null;
}

/** Whether Victory Points mode is active for this game. */
export function victoryPointsModeActive(state: GameState): boolean {
  return victoryPointsConfig(state) !== null;
}

/** The completion VP a config awards (default {@link DEFAULT_VICTORY_CONDITION_VP}). */
export function victoryConditionVp(config: VictoryPointsConfig): number {
  return config.victoryConditionVp ?? DEFAULT_VICTORY_CONDITION_VP;
}

// ---------------------------------------------------------------------------
// Ledger mutators — called at the combat/visit seams, UNCONDITIONALLY (whether
// or not VP mode is on: cheap, and nothing reads the ledger unless it is). This
// makes a mid-game preset toggle unable to change a score after the fact.
// ---------------------------------------------------------------------------

/** Get (creating if needed) the mutable VP ledger entry for a player. */
function vpLedgerEntry(state: GameState, playerId: PlayerId): VpLedgerEntry {
  const adventure = state.adventure;
  if (!adventure) {
    return {};
  }
  const ledger = adventure.vpLedger ?? (adventure.vpLedger = {});
  return ledger[playerId] ?? (ledger[playerId] = {});
}

/**
 * Record a real hero-combat DEFEAT (a retreat or a fought-out loss — NOT a
 * surrender). A Main hero counts ONCE per opponent (3 VP); a Secondary hero
 * counts every time (1 VP each). No-ops for the neutral seat or self.
 */
export function recordVpHeroDefeat(
  state: GameState,
  winnerId: PlayerId,
  loserId: PlayerId,
  loserKind: "main" | "secondary"
): void {
  if (winnerId === NEUTRAL_PLAYER_ID || loserId === NEUTRAL_PLAYER_ID || loserId === winnerId) {
    return;
  }
  const entry = vpLedgerEntry(state, winnerId);
  if (loserKind === "main") {
    const list = entry.mainHeroDefeats ?? (entry.mainHeroDefeats = []);
    if (!list.includes(loserId)) {
      list.push(loserId);
    }
  } else {
    entry.secondaryHeroDefeats = (entry.secondaryHeroDefeats ?? 0) + 1;
  }
}

/**
 * Record a Hero that SURRENDERED / escaped from a player (main or secondary
 * surrender) — 1 VP to the non-surrenderer. No-op for the neutral seat.
 */
export function recordVpSurrender(state: GameState, winnerId: PlayerId): void {
  if (winnerId === NEUTRAL_PLAYER_ID) {
    return;
  }
  const entry = vpLedgerEntry(state, winnerId);
  entry.surrenders = (entry.surrenders ?? 0) + 1;
}

/** Record that a player has defeated a Dragon Utopia (defeat-dragon-utopia objective). */
export function recordVpUtopiaDefeat(state: GameState, playerId: PlayerId): void {
  if (playerId === NEUTRAL_PLAYER_ID) {
    return;
  }
  vpLedgerEntry(state, playerId).utopiaDefeated = true;
}

/**
 * Record VP a player earned by capturing a designer-designated Ⅶ objective center
 * ({@link CustomMapTilePlan.viiFieldVp}). Additive across multiple such centers;
 * no-op for the neutral seat or a non-positive amount. Captured at the visit seam
 * like every other ledger component, so a mid-game VP toggle can't rewrite it.
 */
export function recordVpViiCenter(state: GameState, playerId: PlayerId, vp: number): void {
  if (playerId === NEUTRAL_PLAYER_ID || vp <= 0) {
    return;
  }
  const entry = vpLedgerEntry(state, playerId);
  entry.viiCenterVp = (entry.viiCenterVp ?? 0) + vp;
}

// ---------------------------------------------------------------------------
// At-scoring-time reads (live state, never stored).
// ---------------------------------------------------------------------------

/**
 * The player's MAIN hero (undefined if it has fallen / never existed). Exported
 * so custom win conditions (`checkCustomWinConditions`, adventure.ts) read the
 * SAME hero level VP scoring does — a shared metric, never a duplicate.
 */
export function mainHeroOf(state: GameState, playerId: PlayerId): HeroState | undefined {
  return Object.values(state.heroes).find(
    (hero) => hero.controllerId === playerId && hero.kind === "main"
  );
}

/**
 * Towns a player CONTROLS at scoring time — field-flag-aware (a home Town an
 * enemy flagged is no longer yours; an enemy Town YOU flagged is). Falls back to
 * `town.controllerId` for a town with no map field (never happens in adventure).
 */
export function townsControlledBy(state: GameState, playerId: PlayerId): TownState[] {
  const adventure = state.adventure;
  return Object.values(state.towns).filter((town) => {
    if (town.fieldId && adventure) {
      const field = adventure.fields[town.fieldId];
      if (field) {
        return field.flagOwnerId ? field.flagOwnerId === playerId : town.controllerId === playerId;
      }
    }
    return town.controllerId === playerId;
  });
}

/**
 * Sum of Buildings across every Town the player controls (uncapped — the 8-VP
 * cap is applied by the scorer). Exported so the `buildings` custom win condition
 * (`checkCustomWinConditions`, adventure.ts) reads the SAME building count VP
 * scoring uses — a shared metric, never a duplicate.
 */
export function controlledBuildingCount(state: GameState, playerId: PlayerId): number {
  return townsControlledBy(state, playerId).reduce((total, town) => total + town.buildings.length, 0);
}

/** How many Mine / Settlement fields the player currently holds a flag on. */
export function flaggedMineSettlementCount(state: GameState, playerId: PlayerId): number {
  const adventure = state.adventure;
  if (!adventure) {
    return 0;
  }
  let count = 0;
  for (const field of Object.values(adventure.fields)) {
    if (
      field.flagOwnerId === playerId &&
      (field.location === "mine" || field.location === "settlement")
    ) {
      count += 1;
    }
  }
  return count;
}

/**
 * Artifacts attributable to a player — every zone their Might & Magic deck
 * cycles through (hand / deck / discard / Spell Book / permanents) PLUS the
 * cards they removed from play (`player.removed`). A card lives in exactly one
 * zone, so summing never double-counts. This is what "in the M&M deck AND
 * removed from play" means; the removed zone is the state the rulebook's
 * removed-from-play clause reads.
 */
export function artifactCountOf(player: PlayerState | undefined): number {
  if (!player) {
    return 0;
  }
  const zones = [player.hand, player.deck, player.discard, player.spellBook, player.removed, player.permanents];
  let count = 0;
  for (const zone of zones) {
    for (const cardId of zone ?? []) {
      if (cardLibrary[cardId]?.kind === "artifact") {
        count += 1;
      }
    }
  }
  return count;
}

/** Plain-words label for one objective (designer summary + scoring rows). */
export function describeVictoryPointObjective(objective: VictoryPointObjective): string {
  switch (objective.kind) {
    case "control-towns":
      return `Control ${objective.count} Town${objective.count === 1 ? "" : "s"}`;
    case "flag-mines":
      return `Flag ${objective.count} Mine${objective.count === 1 ? "" : "s"} / Settlement`;
    case "hero-level":
      return `Reach Hero level ${objective.level}`;
    case "defeat-dragon-utopia":
      return "Defeat a Dragon Utopia";
  }
}

/**
 * Plain-words description of ONE custom win condition — the SINGLE source for the
 * map editor preview, the map-pick banner entry, the lobby section list, and the
 * `GAME_WON` reason string (`checkCustomWinConditions` prefixes it with
 * "completed a custom win condition: "). Lives here (not map-preset.ts) so
 * adventure.ts can import it without a cycle — map-preset.ts imports FROM
 * adventure.ts, so the reason string could not reach a map-preset helper.
 */
export function describeCustomWinCondition(condition: CustomWinCondition): string {
  switch (condition.kind) {
    case "control-towns":
      return `control ${condition.count} Town${condition.count === 1 ? "" : "s"}`;
    case "flag-mines":
      return `flag ${condition.count} Mines / Settlements`;
    case "hero-level":
      return `reach Hero level ${condition.level}`;
    case "gold":
      return `reach ${condition.amount} gold`;
    case "artifacts":
      return `own ${condition.count} Artifact${condition.count === 1 ? "" : "s"}`;
    case "buildings":
      return `build ${condition.count} Building${condition.count === 1 ? "" : "s"}`;
    case "obelisks":
      return `visit ${condition.count} Obelisk${condition.count === 1 ? "" : "s"}`;
    case "defeat-heroes":
      return `defeat ${condition.count} enemy Hero${condition.count === 1 ? "" : "es"}`;
    case "defeat-dragon-utopia":
      return "defeat the Dragon Utopia";
  }
}

/** Whether a player satisfies an objective at scoring time. */
function playerMeetsObjective(
  state: GameState,
  playerId: PlayerId,
  objective: VictoryPointObjective,
  ledger: VpLedgerEntry
): boolean {
  switch (objective.kind) {
    case "control-towns":
      return townsControlledBy(state, playerId).length >= objective.count;
    case "flag-mines":
      return flaggedMineSettlementCount(state, playerId) >= objective.count;
    case "hero-level":
      return (mainHeroOf(state, playerId)?.level ?? 0) >= objective.level;
    case "defeat-dragon-utopia":
      return ledger.utopiaDefeated === true;
  }
}

/** Seats scored for VP: every LIVE human seat (eliminated seats leave turnOrder). */
function scoredPlayerIds(state: GameState): PlayerId[] {
  return state.turnOrder.filter((id) => id !== NEUTRAL_PLAYER_ID && Boolean(state.players[id]));
}

/** Build one player's breakdown (nonzero rows only; `total` is the true sum). */
function buildBreakdown(
  state: GameState,
  playerId: PlayerId,
  config: VictoryPointsConfig | null,
  completerId: PlayerId | null
): VictoryPointBreakdown {
  const rows: VictoryPointRow[] = [];
  let total = 0;
  const add = (label: string, vp: number) => {
    if (vp > 0) {
      rows.push({ label, vp });
    }
    total += vp;
  };

  const ledger = state.adventure?.vpLedger?.[playerId] ?? {};

  add("Main Heroes defeated", 3 * (ledger.mainHeroDefeats?.length ?? 0));
  add("Secondary Heroes defeated", ledger.secondaryHeroDefeats ?? 0);
  add("Heroes surrendered to you", ledger.surrenders ?? 0);
  add("Ⅶ objectives captured", ledger.viiCenterVp ?? 0);
  add("Buildings in controlled Towns", Math.min(8, controlledBuildingCount(state, playerId)));
  add("Hero Experience Levels", mainHeroOf(state, playerId)?.level ?? 0);
  add("Flagged Mines / Settlements", flaggedMineSettlementCount(state, playerId));
  add("Artifacts (1 VP per 2)", Math.floor(artifactCountOf(state.players[playerId]) / 2));

  for (const objective of config?.objectives ?? []) {
    if (playerMeetsObjective(state, playerId, objective, ledger)) {
      add(`${describeVictoryPointObjective(objective)} (objective)`, objective.vp);
    }
  }

  if (config && completerId === playerId) {
    add("Completed the victory condition", victoryConditionVp(config));
  }

  return { playerId, total, rows };
}

/**
 * Score every live seat. The winner is the most VP, tie-broken FIRST by the
 * victory-condition completer (if one is tied at the top) and THEN by earliest
 * turn order — deterministic. `breakdown` is returned winner-first.
 */
export function computeVictoryPoints(
  state: GameState,
  options?: { completerId?: PlayerId | null }
): VictoryPointsResult {
  const config = victoryPointsConfig(state);
  const completerId = options?.completerId ?? null;
  const turnOrder = state.turnOrder;
  const orderIndex = (id: PlayerId) => {
    const index = turnOrder.indexOf(id);
    return index < 0 ? Number.MAX_SAFE_INTEGER : index;
  };

  const rows = scoredPlayerIds(state).map((playerId) =>
    buildBreakdown(state, playerId, config, completerId)
  );

  rows.sort((a, b) => {
    if (b.total !== a.total) {
      return b.total - a.total;
    }
    // A tie at the top goes to the completer, if they are one of the tied seats.
    const aCompleter = a.playerId === completerId ? 0 : 1;
    const bCompleter = b.playerId === completerId ? 0 : 1;
    if (aCompleter !== bCompleter) {
      return aCompleter - bCompleter;
    }
    return orderIndex(a.playerId) - orderIndex(b.playerId);
  });

  return { breakdown: rows, winnerId: rows[0]?.playerId ?? null };
}
