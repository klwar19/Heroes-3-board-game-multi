/**
 * Pháp Bảo — xianxia Artifact CONTENT (`anime.xianxiaArtifacts`, plan §5.10).
 *
 * These are ORIGINAL cards: the printed `tags` text states EXACTLY what the
 * engine runs (no display-only clauses — CLAUDE.md §2 is satisfied by writing
 * only the wired behaviour). Every card REUSES an already-wired effect arm:
 *   • income permanents  → `permanentEffect.resourceRoundGain` (+ conditional
 *                          `requiresHeroInTown` for Tụ Linh Bàn);
 *   • movement card      → `GAIN_HERO_MOVEMENT` (Boots-of-Speed family);
 *   • combat reactions   → `ADD_COMBAT_STAT` on a UNIT_ATTACK_DECLARED trigger
 *                          (Sword-of-Judgement / Sentinel's-Shield family).
 *
 * The definitions live in the card library ALWAYS (so hidden-info and card
 * lookups resolve), but they DECK-JOIN only when the module is on — see
 * `animeXianxiaArtifact*Ids` consumed by `makeSharedDecks`.
 *
 * ART: none of these ship with a card face yet. Each is declared in
 * `ANIME_ARTIFACT_ART_PLACEHOLDERS` and routes to the deck back until a real
 * `.webp` lands under `public/assets/anime/artifacts/<slug>.webp` (drop the
 * file, remove the id from the set — the hygiene test enforces the contract).
 */

import type { CardLibrary } from "@/engine/state";

const DECK_BACK = "/assets/player-deck-back.webp";

const animeArtifactSource = {
  product: "Ninefold Realms (Anime mod) — original Pháp Bảo artifact cards",
  credit:
    "Original design for this repository (docs/anime-mod-plan.md §5.10). Printed text describes exactly the engine-wired behaviour.",
  url: "https://en.homm3bg.wiki/artifacts/"
} as const;

/** Real art path for an anime artifact (used once the placeholder is removed). */
export function animeArtifactArtPath(slug: string): string {
  return `/assets/anime/artifacts/${slug}.webp`;
}

/**
 * Anime artifacts that ship WITHOUT a card face (drop-art-later contract,
 * mirroring FIELD_OVERRIDE_ART_PLACEHOLDERS). Each MUST be a real anime artifact
 * slug; a placeholder that already has art on disk, or a nonexistent slug, fails
 * the hygiene test. When real art lands: add
 * `public/assets/anime/artifacts/<slug>.webp` and remove the slug here (the card
 * then renders its own face).
 */
export const ANIME_ARTIFACT_ART_PLACEHOLDERS: ReadonlySet<string> = new Set([
  "tui_can_khon",
  "tu_linh_ban",
  "phong_hoa_luan",
  "bat_qua_kinh",
  "tru_tien_kiem"
]);

function animeArtifactAssets(slug: string, name: string) {
  return {
    cardImage: ANIME_ARTIFACT_ART_PLACEHOLDERS.has(slug) ? DECK_BACK : animeArtifactArtPath(slug),
    imageAlt: `${name} artifact card`
  };
}

export const animeArtifactCards: CardLibrary = {
  // ---- Minor: income permanents ------------------------------------------
  // Túi Càn Khôn (Cosmic Bag) — the Inexhaustible-Cart income family with a
  // distinct remove side (materials + valuables instead of a bigger materials
  // burst). Option 0 enters play and pays 1 building materials each Resources
  // round; option 1 cracks the card open (removed from the game) for the burst.
  "anime.artifact.tui_can_khon": {
    id: "anime.artifact.tui_can_khon",
    name: "Túi Càn Khôn",
    kind: "artifact",
    timing: "ongoing",
    artifactTier: "minor",
    permanent: true,
    permanentEffect: { resourceRoundGain: { resource: "buildingMaterials", amount: 1 } },
    tags: [
      "artifact",
      "minor",
      "anime",
      "permanent",
      "income",
      "At the beginning of each Resources round, gain 1 building materials. — OR — Remove this card, then gain 1 building materials and 1 valuables."
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "At the beginning of each Resources round, gain 1 building materials",
          effect: { type: "ENTER_PLAY" }
        },
        {
          label: "Remove this card: gain 1 building materials and 1 valuables",
          cost: { removeSelf: true },
          effect: { type: "GAIN_RESOURCES", gain: { buildingMaterials: 1, valuables: 1 } }
        }
      ]
    },
    assets: animeArtifactAssets("tui_can_khon", "Túi Càn Khôn"),
    implementationStatus: "implemented",
    source: animeArtifactSource
  },
  // Tụ Linh Bàn (Spirit Gathering Board) — CONDITIONAL income: the +2 gold is
  // paid only on a Resources round where the owner's MAIN Hero stands in one of
  // their own Towns (`requiresHeroInTown`, gated at the income chokepoint). The
  // remove side is an unconditional one-off gold burst.
  "anime.artifact.tu_linh_ban": {
    id: "anime.artifact.tu_linh_ban",
    name: "Tụ Linh Bàn",
    kind: "artifact",
    timing: "ongoing",
    artifactTier: "minor",
    permanent: true,
    permanentEffect: { resourceRoundGain: { resource: "gold", amount: 2, requiresHeroInTown: true } },
    tags: [
      "artifact",
      "minor",
      "anime",
      "permanent",
      "income",
      "At the beginning of each Resources round, if your main Hero is in one of your Towns, gain 2 gold. — OR — Remove this card, then gain 3 gold."
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Each Resources round your main Hero is in a Town of yours, gain 2 gold",
          effect: { type: "ENTER_PLAY" }
        },
        {
          label: "Remove this card: gain 3 gold",
          cost: { removeSelf: true },
          effect: { type: "GAIN_RESOURCES", gain: { gold: 3 } }
        }
      ]
    },
    assets: animeArtifactAssets("tu_linh_ban", "Tụ Linh Bàn"),
    implementationStatus: "implemented",
    source: animeArtifactSource
  },

  // ---- Major -------------------------------------------------------------
  // Phong Hỏa Luân (Wind & Fire Wheels) — a map movement card (Boots-of-Speed
  // family: GAIN_HERO_MOVEMENT). Because the movement side is a GAIN_HERO_MOVEMENT
  // effect, it is ALSO auto-offered in a neutral combat's continue-or-retreat
  // window (heroMovementGrantOption) to top up the movement pool for another
  // round. Option 1 spends the card (removed) for a larger +3.
  "anime.artifact.phong_hoa_luan": {
    id: "anime.artifact.phong_hoa_luan",
    name: "Phong Hỏa Luân",
    kind: "artifact",
    timing: "instant",
    artifactTier: "major",
    tags: [
      "artifact",
      "major",
      "anime",
      "Your Hero gains +2 movement. — OR — Remove this card, then your Hero gains +3 movement."
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Your Hero gains +2 movement",
          mapOnly: true,
          effect: { type: "GAIN_HERO_MOVEMENT", amount: 2 }
        },
        {
          label: "Remove this card: your Hero gains +3 movement",
          mapOnly: true,
          cost: { removeSelf: true },
          effect: { type: "GAIN_HERO_MOVEMENT", amount: 3 }
        }
      ]
    },
    assets: animeArtifactAssets("phong_hoa_luan", "Phong Hỏa Luân"),
    implementationStatus: "implemented",
    source: animeArtifactSource
  },
  // Bát Quái Kính (Bagua Mirror) — a defender combat reaction (Sentinel's-Shield
  // family, one tier softer): played when one of your units is attacked. Option 0
  // discards a card for +2 defense; option 1 is a plain +1 defense.
  "anime.artifact.bat_qua_kinh": {
    id: "anime.artifact.bat_qua_kinh",
    name: "Bát Quái Kính",
    kind: "artifact",
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    artifactTier: "major",
    tags: [
      "artifact",
      "major",
      "anime",
      "Discard 1 card to gain +2 defense. — OR — +1 defense."
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Discard 1 card: +2 defense",
          cost: { discardCards: 1 },
          trigger: { event: "UNIT_ATTACK_DECLARED", controller: "opponent" },
          effect: { type: "ADD_COMBAT_STAT", stat: "defense", amount: 2 }
        },
        {
          label: "+1 defense",
          trigger: { event: "UNIT_ATTACK_DECLARED", controller: "opponent" },
          effect: { type: "ADD_COMBAT_STAT", stat: "defense", amount: 1 }
        }
      ]
    },
    assets: animeArtifactAssets("bat_qua_kinh", "Bát Quái Kính"),
    implementationStatus: "implemented",
    source: animeArtifactSource
  },

  // ---- Relic -------------------------------------------------------------
  // Tru Tiên Kiếm (Heaven-Slaying Sword) — an attacker combat reaction
  // (Sword-of-Judgement / Sentinel's-Shield family): played when one of your
  // units declares an attack. Option 0 discards a card for +3 attack; option 1
  // is a plain +2 attack.
  "anime.artifact.tru_tien_kiem": {
    id: "anime.artifact.tru_tien_kiem",
    name: "Tru Tiên Kiếm",
    kind: "artifact",
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    artifactTier: "relic",
    tags: [
      "artifact",
      "relic",
      "anime",
      "Discard 1 card to gain +3 attack. — OR — +2 attack."
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Discard 1 card: +3 attack",
          cost: { discardCards: 1 },
          trigger: { event: "UNIT_ATTACK_DECLARED", controller: "self" },
          effect: { type: "ADD_COMBAT_STAT", stat: "attack", amount: 3 }
        },
        {
          label: "+2 attack",
          trigger: { event: "UNIT_ATTACK_DECLARED", controller: "self" },
          effect: { type: "ADD_COMBAT_STAT", stat: "attack", amount: 2 }
        }
      ]
    },
    assets: animeArtifactAssets("tru_tien_kiem", "Tru Tiên Kiếm"),
    implementationStatus: "implemented",
    source: animeArtifactSource
  }
};

/**
 * Deck-join lists by tier. `makeSharedDecks` appends these to the matching
 * shared Artifact deck ONLY when `anime.xianxiaArtifacts` is on; the split-deck
 * variants use the per-tier lists and the legacy single deck uses the combined
 * list. Default OFF ⇒ byte-identical decks.
 */
export const animeXianxiaArtifactMinorIds = [
  "anime.artifact.tui_can_khon",
  "anime.artifact.tu_linh_ban"
] as const;

export const animeXianxiaArtifactMajorIds = [
  "anime.artifact.phong_hoa_luan",
  "anime.artifact.bat_qua_kinh"
] as const;

export const animeXianxiaArtifactRelicIds = ["anime.artifact.tru_tien_kiem"] as const;

/** Every anime Pháp Bảo id, in tier order (legacy single-deck join). */
export const animeXianxiaArtifactCardIds: readonly string[] = [
  ...animeXianxiaArtifactMinorIds,
  ...animeXianxiaArtifactMajorIds,
  ...animeXianxiaArtifactRelicIds
];
