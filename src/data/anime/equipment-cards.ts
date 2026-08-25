/**
 * Anime EQUIPMENT as Artifact-deck CARDS (`anime.equipment`).
 *
 * Each equipment item is BOTH:
 *   1. an always-on hero slot item (shop / equip bag — `equipment.ts`), AND
 *   2. a playable Artifact-tier card that joins the shared Artifact decks when
 *      the module is on — playing it equips permanently, REMOVES the card from
 *      the game, and grants one REGULAR (non-equipment, non-commander) Artifact
 *      of the same grade (I→minor / II→major / III→relic).
 *
 * SINGLE SOURCE: card definitions are GENERATED from `ANIME_EQUIPMENT_DEFINITIONS`
 * so slot / grade / cost / summary never drift. Card faces live at
 * `public/assets/anime/equipment/cards/<slug>.webp` (built by
 * `scripts/build-equipment-cards.mjs` with the ornate artifact-frame layout).
 *
 * Definitions are ALWAYS in the card library; DECK-JOIN only when
 * `anime.enabled && anime.equipment` (see `makeSharedDecks`).
 */

import type { CardLibrary, CardDefinition, ArtifactTier } from "@/engine/state";
import {
  ANIME_EQUIPMENT_DEFINITIONS,
  EQUIPMENT_GRADE_TO_ARTIFACT_TIER,
  listEquipmentDefinitions,
  type EquipmentDefinition,
  type EquipmentGrade
} from "./equipment";

const DECK_BACK = "/assets/player-deck-back.webp";

const equipmentCardSource = {
  product: "Ninefold Realms (Anime mod) — hero Equipment cards",
  credit:
    "Original design for this repository. Playing the card equips the item permanently, removes the card from the game, and grants one regular Artifact of the same grade. Printed text describes exactly the engine-wired behaviour.",
  url: "https://en.homm3bg.wiki/artifacts/"
} as const;

/** Card face path (composed layout, not the inventory icon). */
export function equipmentCardArtPath(id: string): string {
  const slug = id.replace(/^anime\.equip\./, "");
  return `/assets/anime/equipment/cards/${slug}.webp`;
}

function tierLabel(grade: EquipmentGrade): string {
  const tier = EQUIPMENT_GRADE_TO_ARTIFACT_TIER[grade];
  if (tier === "minor") return "Minor";
  if (tier === "major") return "Major";
  return "Relic";
}

function buildEquipmentCard(def: EquipmentDefinition): CardDefinition {
  const tier: ArtifactTier = EQUIPMENT_GRADE_TO_ARTIFACT_TIER[def.grade];
  const grantLabel = tierLabel(def.grade);
  return {
    id: def.id,
    name: def.name.en,
    kind: "artifact",
    timing: "instant",
    artifactTier: tier,
    tags: [
      "artifact",
      tier,
      "anime",
      "equipment",
      `Hero equipment — ${def.slot} · Grade ${def.grade}. ${def.summary} Play: equip permanently; this card leaves the game; gain 1 ${grantLabel} Artifact (not equipment).`
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: `Equip (${def.slot}) · remove this card · gain 1 ${grantLabel} Artifact`,
          mapOnly: true,
          cost: { removeSelf: true },
          effect: { type: "EQUIP_HERO_EQUIPMENT", equipmentId: def.id }
        }
      ]
    },
    assets: {
      cardImage: equipmentCardArtPath(def.id),
      imageAlt: `${def.name.en} equipment card`
    },
    implementationStatus: "implemented",
    source: equipmentCardSource
  };
}

/** Every equipment card definition, keyed by equipment id. */
export const animeEquipmentCards: CardLibrary = Object.fromEntries(
  listEquipmentDefinitions().filter((def) => !def.intrinsic).map((def) => [def.id, buildEquipmentCard(def)])
);

function idsForGrade(grade: EquipmentGrade): string[] {
  return listEquipmentDefinitions()
    .filter((def) => def.grade === grade && !def.intrinsic)
    .map((def) => def.id);
}

export const animeEquipmentMinorIds: readonly string[] = idsForGrade("I");
export const animeEquipmentMajorIds: readonly string[] = idsForGrade("II");
export const animeEquipmentRelicIds: readonly string[] = idsForGrade("III");

/** Every equipment card id (legacy single-deck join). */
export const animeEquipmentCardIds: readonly string[] = [
  ...animeEquipmentMinorIds,
  ...animeEquipmentMajorIds,
  ...animeEquipmentRelicIds
];

/** True when a card id is an equipment card (for grant-pool exclusion). */
export function isAnimeEquipmentCardId(cardId: string): boolean {
  return Boolean(ANIME_EQUIPMENT_DEFINITIONS[cardId]);
}

// Silence unused DECK_BACK until a face-less fallback is needed.
void DECK_BACK;
