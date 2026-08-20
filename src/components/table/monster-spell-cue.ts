import type { GameEvent, GameState } from "@/engine";
import { abilityIdsCastMonsterSpells } from "@/engine/monster-spells";
import { MONSTER_SPELLS, type MonsterSpellId } from "@/data/anime/monster-spells";
import { monsterSpellFxPlan } from "@/data/monster-spell-fx";

/**
 * Presentation model for a PvE monster caster's automatic spell (dungeon /
 * raid-boss variant expansion §A). The engine resolves a `BOSS_SPELL_ROTATION`
 * at every combat round's start with NO window, NO dice and NO card, so the
 * only trace was a feed line: the player saw damage appear from nowhere. This
 * builds one transient cue per cast — the boss, the spell name, what it does
 * every time (the printed rotation text) and what it just did (the engine's own
 * message) — plus the sound key of the reused H3 spell FX.
 *
 * PURE data. The overlay that renders it dispatches nothing and opens no engine
 * window (the commander-intro-overlay precedent), so no AI/AFK seat can stall.
 */

export type MonsterSpellCue = {
  /** The source event id — also the React key and the de-dupe handle. */
  id: string;
  /** The caster's board unit id (the FX anchor). */
  casterUnitId: string;
  casterName: string;
  /** The single unit the cast singled out, when it had one. */
  targetUnitId?: string;
  spellId: MonsterSpellId;
  spellName: string;
  /** Big line: "<Boss> casts <Spell>". */
  headline: string;
  /** Plain-words outcome — the engine's own message, which already explains it. */
  detail: string;
  /** What this spell always does (the printed table text). */
  rulesText: string;
  /** /public/sounds manifest key of the reused H3 spell cast. */
  soundKey?: string;
};

type AbilityEvent = Extract<GameEvent, { type: "UNIT_ABILITY_TRIGGERED" }>;

/**
 * Is this event a monster-spell cast? Both halves are DERIVED, never a hand
 * list: the ability must carry a `BOSS_SPELL_ROTATION` (registry-derived via
 * `abilityIdsCastMonsterSpells`) AND the event must name a spell in the shipped
 * table. An ordinary `UNIT_ABILITY_TRIGGERED` (Death Stare, Fire Shield…) fails
 * both.
 */
export function isMonsterSpellCastEvent(event: { type: GameEvent["type"] }): boolean {
  if (event.type !== "UNIT_ABILITY_TRIGGERED") {
    return false;
  }
  const ability = event as AbilityEvent;
  return (
    abilityIdsCastMonsterSpells([ability.abilityId]) &&
    typeof ability.monsterSpellId === "string" &&
    ability.monsterSpellId in MONSTER_SPELLS
  );
}

/** One cue for a monster-spell cast event, or null when it is not one. */
export function buildMonsterSpellCue(event: GameEvent, state: GameState): MonsterSpellCue | null {
  if (!isMonsterSpellCastEvent(event)) {
    return null;
  }
  const ability = event as AbilityEvent;
  const spell = MONSTER_SPELLS[ability.monsterSpellId as MonsterSpellId];
  const casterName = state.combat?.units[ability.unitId]?.cardName ?? "The monster";
  return {
    id: ability.id,
    casterUnitId: ability.unitId,
    casterName,
    ...(ability.targetUnitId ? { targetUnitId: ability.targetUnitId } : {}),
    spellId: spell.id,
    spellName: spell.name,
    headline: `${casterName} casts ${spell.name}`,
    detail: ability.message,
    rulesText: spell.text,
    soundKey: monsterSpellFxPlan(spell.id).sound
  };
}

/** Every cue for a batch of fresh events, in log order. */
export function buildMonsterSpellCues(events: readonly GameEvent[], state: GameState): MonsterSpellCue[] {
  const cues: MonsterSpellCue[] = [];
  for (const event of events) {
    const cue = buildMonsterSpellCue(event, state);
    if (cue) {
      cues.push(cue);
    }
  }
  return cues;
}
