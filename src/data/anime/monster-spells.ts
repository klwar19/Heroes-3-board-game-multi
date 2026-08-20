/**
 * PvE monster CASTER spells (dungeon/raid-boss variant expansion §A1) — the
 * complete shipped table, data only. Nothing here imports the engine.
 *
 * A monster caster carries a `BOSS_SPELL_ROTATION` ability whose `spells` array
 * is an ORDERED rotation: at the start of every combat round the unit resolves
 * `spells[(round - 1) % spells.length]` automatically — no window, no choice,
 * no RNG, no reaction. The engine seam is `src/engine/monster-spells.ts` (pure
 * planning) + `applyMonsterSpellRoundStart` (resolution, in reducer.ts beside
 * `applyActivationDamageSpell` so it can use the module-private
 * `reducedSpellDamage`).
 *
 * CLAUDE.md §2: `text` here is copied verbatim into the carrying ability's
 * printed text, so a boss card states exactly what runs.
 */

export type MonsterSpellId =
  | "shadow_bolt"
  | "chill_of_the_deep"
  | "withering_curse"
  | "mend_flesh"
  | "siphon_thought"
  | "ward_of_ash";

export type MonsterSpellKind =
  | {
      /**
       * SPELL damage resolved through the same gate order a Faerie Bolt takes:
       * damage-ward immunity → artifact school immunity → printed all-school
       * immunity → damage reduction/cap → `damageKind: "spell"`.
       *
       * `pick: "toughest"` = the living enemy unit with the highest REMAINING
       * health (`maxHealth − damage`); ties break on the lowest board position.
       * (The design also lists a `"nearest"` picker; no shipped spell uses one,
       * so it is deliberately NOT in the union — an unreachable branch would be
       * decorative. Add it with the first spell that needs it.)
       */
      k: "spell-damage";
      amount: number;
      pick: "toughest";
    }
  | {
      /**
       * A negative, current-combat-round ActiveEffect on the enemy side.
       * `scope: "fastest"` = the single living enemy with the highest effective
       * Initiative (ties → lowest position); `scope: "all"` = every living enemy.
       */
      k: "enemy-debuff";
      stat: "attack" | "initiative";
      amount: number;
      scope: "all" | "fastest";
    }
  | {
      /** Heals the CASTER's own damage. Never restores a shed boss layer. */
      k: "self-heal";
      amount: number;
    }
  | {
      /** The enemy controller discards N random hand cards (no-op on an empty hand). */
      k: "hand-drain";
      count: number;
    }
  | {
      /** A positive, current-combat-round ActiveEffect on every living ALLY. */
      k: "ally-buff";
      stat: "defense";
      amount: number;
    };

export type MonsterSpellDefinition = {
  id: MonsterSpellId;
  /** Feed-line name. */
  name: string;
  /** Exactly what runs — quoted into every carrying ability's printed text. */
  text: string;
  kind: MonsterSpellKind;
};

export const MONSTER_SPELLS: Record<MonsterSpellId, MonsterSpellDefinition> = {
  shadow_bolt: {
    id: "shadow_bolt",
    name: "Shadow Bolt",
    text: "2 Spell damage to your toughest living unit",
    kind: { k: "spell-damage", amount: 2, pick: "toughest" }
  },
  chill_of_the_deep: {
    id: "chill_of_the_deep",
    name: "Chill of the Deep",
    text: "−2 Initiative on your fastest living unit this round",
    kind: { k: "enemy-debuff", stat: "initiative", amount: -2, scope: "fastest" }
  },
  withering_curse: {
    id: "withering_curse",
    name: "Withering Curse",
    text: "−1 Attack on all your living units this round",
    kind: { k: "enemy-debuff", stat: "attack", amount: -1, scope: "all" }
  },
  mend_flesh: {
    id: "mend_flesh",
    name: "Mend Flesh",
    text: "it heals 2 damage — never a lost health bar",
    kind: { k: "self-heal", amount: 2 }
  },
  siphon_thought: {
    id: "siphon_thought",
    name: "Siphon Thought",
    text: "you discard 1 random card",
    kind: { k: "hand-drain", count: 1 }
  },
  ward_of_ash: {
    id: "ward_of_ash",
    name: "Ward of Ash",
    text: "+1 Defense on every unit on its own side this round",
    kind: { k: "ally-buff", stat: "defense", amount: 1 }
  }
};

/** The rotation text a carrying ability prints (CLAUDE.md §2 — verbatim). */
export function monsterSpellRotationText(spells: readonly MonsterSpellId[]): string {
  const listed = spells
    .map((id) => `${MONSTER_SPELLS[id].name} (${MONSTER_SPELLS[id].text})`)
    .join(", ");
  return (
    "At the start of every combat round this unit automatically casts, in order: " +
    `${listed}. Then it repeats. Fully automatic — it opens no window and no reaction, ` +
    "so instants cannot be played against it."
  );
}
