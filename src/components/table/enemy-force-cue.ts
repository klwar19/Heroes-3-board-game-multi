import type { GameEvent, GameState } from "@/engine";
import { enemyForcePoolEntry } from "@/engine/enemy-force";
import { enemyForceFxPlan } from "@/data/enemy-force-fx";
import { cardLibrary } from "@/data/cards/library";

/**
 * Presentation model for a PvE ENEMY FORCE card play (the BOSS_SPELL_ROTATION
 * replacement, 2026-08-21). The engine resolves the play inline at the boss
 * unit's activation start with NO window, NO dice and NO card leaving a player's
 * hand, so the only trace was a feed line: the player saw damage appear from
 * nowhere. This builds one transient cue per play — the boss, the CARD FACE and
 * name, what it just did (the engine's own message, numbers included) and the
 * card's printed rules line — plus the sound key of the reused H3 spell FX.
 *
 * PURE data. The overlay that renders it dispatches nothing and opens no engine
 * window (the commander-intro-overlay precedent), so no AI/AFK seat can stall.
 */

export type EnemyForceCue = {
  /** The source event id — also the React key and the de-dupe handle. */
  id: string;
  /** The playing boss unit's board id (the FX anchor). */
  casterUnitId: string;
  casterName: string;
  /** The single unit the play singled out, when it had one. */
  targetUnitId?: string;
  cardId: string;
  cardName: string;
  /** The card's printed face, so the player sees the actual card. */
  cardImage?: string;
  /** Big line: "<Boss> plays <Card>". */
  headline: string;
  /** Plain-words outcome — the engine's own message, which already explains it. */
  detail: string;
  /** The card's printed rules line (its last tag), when it has one. */
  rulesText: string;
  /** /public/sounds manifest key of the reused H3 spell cast. */
  soundKey?: string;
};

type PlayEvent = Extract<GameEvent, { type: "ENEMY_FORCE_CARD_PLAYED" }>;

/**
 * Is this event an enemy-force card play? DERIVED on both halves: the event type
 * plus "the card is really in the curated pool" (`enemyForcePoolEntry`), never a
 * hand-written id list — so a new pool card lights the cue up with no edit here.
 */
export function isEnemyForcePlayEvent(event: { type: GameEvent["type"] }): boolean {
  if (event.type !== "ENEMY_FORCE_CARD_PLAYED") {
    return false;
  }
  return enemyForcePoolEntry((event as PlayEvent).cardId) !== null;
}

/**
 * A card's printed rules line. The library convention is that the LAST tag of a
 * card carrying printed text is that text (see the `tags` note on
 * `CardDefinition`); the short taxonomy tags ("spell", "basic", a school) are
 * not sentences, so anything without a space is skipped rather than shown.
 */
function printedRulesLine(cardId: string): string {
  const tags = cardLibrary[cardId]?.tags ?? [];
  const last = tags[tags.length - 1];
  return last && last.includes(" ") ? last : "";
}

/** One cue for an enemy-force play event, or null when it is not one. */
export function buildEnemyForceCue(event: GameEvent, state: GameState): EnemyForceCue | null {
  if (!isEnemyForcePlayEvent(event)) {
    return null;
  }
  const play = event as PlayEvent;
  const casterName = state.combat?.units[play.unitId]?.cardName ?? "The enemy force";
  const cardName = cardLibrary[play.cardId]?.name ?? play.cardId;
  return {
    id: play.id,
    casterUnitId: play.unitId,
    casterName,
    ...(play.targetUnitId ? { targetUnitId: play.targetUnitId } : {}),
    cardId: play.cardId,
    cardName,
    ...(cardLibrary[play.cardId]?.assets?.cardImage
      ? { cardImage: cardLibrary[play.cardId]!.assets!.cardImage }
      : {}),
    headline: `${casterName} plays ${cardName}`,
    detail: play.message,
    rulesText: printedRulesLine(play.cardId),
    soundKey: enemyForceFxPlan(play.cardId).sound
  };
}

/** Every cue for a batch of fresh events, in log order. */
export function buildEnemyForceCues(
  events: readonly GameEvent[],
  state: GameState
): EnemyForceCue[] {
  const cues: EnemyForceCue[] = [];
  for (const event of events) {
    const cue = buildEnemyForceCue(event, state);
    if (cue) {
      cues.push(cue);
    }
  }
  return cues;
}
