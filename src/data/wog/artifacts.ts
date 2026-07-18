/**
 * Wake of Gods hero Artifact CONTENT (`wog.artifacts`).
 *
 * These are ORIGINAL board-adapted cards: the printed `tags` text states EXACTLY
 * what the engine runs (no display-only clauses — CLAUDE.md §2 is satisfied by
 * writing only the wired behaviour). Every card REUSES an already-wired effect
 * arm:
 *   • Artifact-deck search → `CARD_DECK_SEARCH` (Surcoat-of-Counterpoise family);
 *   • movement card        → `GAIN_HERO_MOVEMENT` (Boots-of-Speed family);
 *   • combat reactions     → `ADD_COMBAT_STAT` on a UNIT_ATTACK_DECLARED trigger
 *                            (Sword-of-Judgement / Sentinel's-Shield family).
 *
 * WoG's printed artifacts carry per-victory incremental bonuses and special
 * behaviours (transform one artifact into another, lock a Town, summon a dragon,
 * …) — NONE of those are modeled: each card here is a clean reuse of an existing
 * wired arm with the printed WoG flavour as its name/art only.
 *
 * The definitions live in the card library ALWAYS (so hidden-info and card
 * lookups resolve), but they DECK-JOIN only when the module is on — see
 * `wogArtifact*Ids` consumed by `makeSharedDecks`.
 *
 * ART: all five ship with real card faces committed under
 * `public/assets/wog/artifacts/<slug>.webp` (no placeholder registry needed).
 */

import type { CardLibrary } from "@/engine/state";

const wogArtifactSource = {
  product: "Heroes III: In the Wake of Gods (fan expansion) — board-game adaptation",
  credit:
    "Original board-game adaptation for this repository. The printed WoG artifacts' incremental per-victory bonuses and special behaviours (artifact transform, Town-locking, dragon summoning) are NOT modeled — each card reuses an existing wired arm, and the text describes exactly the engine-wired behaviour.",
  url: "https://www.vault.acidcave.net/download.php?id=72"
} as const;

/** Real art path for a WOG artifact card face on disk. */
export function wogArtifactArtPath(slug: string): string {
  return `/assets/wog/artifacts/${slug}.webp`;
}

function wogArtifactAssets(slug: string, name: string) {
  return {
    cardImage: wogArtifactArtPath(slug),
    imageAlt: `${name} artifact card`
  };
}

export const wogArtifactCards: CardLibrary = {
  // ---- Minor -------------------------------------------------------------
  // Magic Wand — the Surcoat-of-Counterpoise Artifact-deck search side, on its
  // own card. Remove the Wand (it leaves the game) to Search (1) the Artifact
  // deck. Map-only, as printed. (WoG's Wand of Magic transforms an equipped
  // artifact into another — that transform is NOT modeled; this is the reused
  // CARD_DECK_SEARCH arm.)
  "wog.artifact.magic_wand": {
    id: "wog.artifact.magic_wand",
    name: "Magic Wand",
    kind: "artifact",
    timing: "instant",
    artifactTier: "minor",
    tags: [
      "artifact",
      "minor",
      "wog",
      "Remove this card: Search (1) the Artifact deck."
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Remove this card: Search (1) the Artifact deck",
          mapOnly: true,
          cost: { removeSelf: true },
          effect: { type: "CARD_DECK_SEARCH", deck: "artifacts", count: 1 }
        }
      ]
    },
    assets: wogArtifactAssets("magic_wand", "Magic Wand"),
    implementationStatus: "implemented",
    source: wogArtifactSource
  },
  // Gate Key — a small map movement card (Boots-of-Speed family:
  // GAIN_HERO_MOVEMENT). Because the movement side is a GAIN_HERO_MOVEMENT
  // effect, it is ALSO auto-offered in a neutral combat's continue-or-retreat
  // window (heroMovementGrantOption) to top up the movement pool for another
  // round. Option 1 spends the card (removed) for a larger +2.
  "wog.artifact.gate_key": {
    id: "wog.artifact.gate_key",
    name: "Gate Key",
    kind: "artifact",
    timing: "instant",
    artifactTier: "minor",
    tags: [
      "artifact",
      "minor",
      "wog",
      "Your Hero gains +1 movement. — OR — Remove this card, then your Hero gains +2 movement."
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Your Hero gains +1 movement",
          mapOnly: true,
          effect: { type: "GAIN_HERO_MOVEMENT", amount: 1 }
        },
        {
          label: "Remove this card: your Hero gains +2 movement",
          mapOnly: true,
          cost: { removeSelf: true },
          effect: { type: "GAIN_HERO_MOVEMENT", amount: 2 }
        }
      ]
    },
    assets: wogArtifactAssets("gate_key", "Gate Key"),
    implementationStatus: "implemented",
    source: wogArtifactSource
  },

  // ---- Major -------------------------------------------------------------
  // Crimson Shield — a defender combat reaction (Sentinel's-Shield family):
  // played when one of your units is attacked. Option 0 is a plain +2 defense;
  // option 1 spends the Shield (removed) for +3 defense.
  "wog.artifact.crimson_shield": {
    id: "wog.artifact.crimson_shield",
    name: "Crimson Shield",
    kind: "artifact",
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    artifactTier: "major",
    tags: [
      "artifact",
      "major",
      "wog",
      "+2 defense. — OR — Remove this card, then +3 defense."
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "+2 defense",
          trigger: { event: "UNIT_ATTACK_DECLARED", controller: "opponent" },
          effect: { type: "ADD_COMBAT_STAT", stat: "defense", amount: 2 }
        },
        {
          label: "Remove this card: +3 defense",
          cost: { removeSelf: true },
          trigger: { event: "UNIT_ATTACK_DECLARED", controller: "opponent" },
          effect: { type: "ADD_COMBAT_STAT", stat: "defense", amount: 3 }
        }
      ]
    },
    assets: wogArtifactAssets("crimson_shield", "Crimson Shield"),
    implementationStatus: "implemented",
    source: wogArtifactSource
  },
  // Warlord's Banner — an attacker combat reaction (Sword-of-Judgement family):
  // played when one of your units declares an attack. Option 0 is a plain +2
  // attack; option 1 spends the Banner (removed) for +3 attack.
  "wog.artifact.warlords_banner": {
    id: "wog.artifact.warlords_banner",
    name: "Warlord's Banner",
    kind: "artifact",
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    artifactTier: "major",
    tags: [
      "artifact",
      "major",
      "wog",
      "+2 attack. — OR — Remove this card, then +3 attack."
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "+2 attack",
          trigger: { event: "UNIT_ATTACK_DECLARED", controller: "self" },
          effect: { type: "ADD_COMBAT_STAT", stat: "attack", amount: 2 }
        },
        {
          label: "Remove this card: +3 attack",
          cost: { removeSelf: true },
          trigger: { event: "UNIT_ATTACK_DECLARED", controller: "self" },
          effect: { type: "ADD_COMBAT_STAT", stat: "attack", amount: 3 }
        }
      ]
    },
    assets: wogArtifactAssets("warlords_banner", "Warlord's Banner"),
    implementationStatus: "implemented",
    source: wogArtifactSource
  },

  // ---- Relic -------------------------------------------------------------
  // Dragonheart — a powerful attacker combat reaction (Sword-of-Judgement
  // family, relic-tier numbers): played when one of your units declares an
  // attack. Option 0 is +3 attack; option 1 spends the relic (removed) for +5
  // attack. (WoG's Dragon Heart summons a dragon — that is NOT modeled; this is
  // the reused ADD_COMBAT_STAT arm.)
  "wog.artifact.dragonheart": {
    id: "wog.artifact.dragonheart",
    name: "Dragonheart",
    kind: "artifact",
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    artifactTier: "relic",
    tags: [
      "artifact",
      "relic",
      "wog",
      "+3 attack. — OR — Remove this card, then +5 attack."
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "+3 attack",
          trigger: { event: "UNIT_ATTACK_DECLARED", controller: "self" },
          effect: { type: "ADD_COMBAT_STAT", stat: "attack", amount: 3 }
        },
        {
          label: "Remove this card: +5 attack",
          cost: { removeSelf: true },
          trigger: { event: "UNIT_ATTACK_DECLARED", controller: "self" },
          effect: { type: "ADD_COMBAT_STAT", stat: "attack", amount: 5 }
        }
      ]
    },
    assets: wogArtifactAssets("dragonheart", "Dragonheart"),
    implementationStatus: "implemented",
    source: wogArtifactSource
  }
};

/**
 * Deck-join lists by tier. `makeSharedDecks` appends these to the matching
 * shared Artifact deck ONLY when `wog.enabled && wog.artifacts` is on; the
 * split-deck variants use the per-tier lists and the legacy single deck uses the
 * combined list. Default OFF ⇒ byte-identical decks.
 */
export const wogArtifactMinorIds = [
  "wog.artifact.magic_wand",
  "wog.artifact.gate_key"
] as const;

export const wogArtifactMajorIds = [
  "wog.artifact.crimson_shield",
  "wog.artifact.warlords_banner"
] as const;

export const wogArtifactRelicIds = ["wog.artifact.dragonheart"] as const;

/** Every WOG artifact id, in tier order (legacy single-deck join). */
export const wogArtifactCardIds: readonly string[] = [
  ...wogArtifactMinorIds,
  ...wogArtifactMajorIds,
  ...wogArtifactRelicIds
];
